// src/services/taskPollingService.ts
/**
 * 任务轮询服务 - 分布式版本
 * 
 * 🔥 完全基于 LiteLLM redis_cache.py (1346行) 源码学习
 * 
 * 核心改进：
 * 1. Redis 分布式锁（nx=True，防止多实例重复轮询）
 * 2. Redis 任务持久化（重启后自动恢复）
 * 3. Redis 原子计数器（pollCount）
 * 4. 故障恢复机制（启动时扫描未完成任务）
 * 
 * 参考：
 * - LiteLLM async_set_cache(nx=True) - 分布式锁
 * - LiteLLM async_increment() - 原子计数
 * - n8n Abstract Push - 健康检查
 */

import axios from 'axios';
import { sseService } from './sseService';
import { videoTaskRepository } from '../repositories/videoTaskRepository';
import { redisService } from './redisService';
import { TaskStatus } from '@prisma/client';

// 任务详情
interface TaskDetails {
  videoId: string;
  externalTaskId: string;
  apiConfigId: string;
  userId: string;
  startedAt: number;
  pollCount: number;
  retryCount: number;
  originalPrompt?: string;
  originalModel?: string;
}

// 🔥 LiteLLM: 只使用 Redis，不再用内存 Map
const pollingTimers = new Map<string, NodeJS.Timeout>();  // ✅ 保留（本地定时器）

// 轮询配置
const POLLING_INTERVAL = 5000; // 5秒
const MAX_POLL_ATTEMPTS = 120; // 最多轮询 120 次（10分钟）
const MAX_RETRY_ATTEMPTS = 1;  // 🔥 最多重试1次

/**
 * 状态映射：外部 API → 内部状态
 */
function mapExternalStatus(externalStatus: string): TaskStatus {
  const statusMap: Record<string, TaskStatus> = {
    'completed': TaskStatus.COMPLETED,
    'in_progress': TaskStatus.PROCESSING,
    'failed': TaskStatus.FAILED,
    'cancelled': TaskStatus.CANCELLED,
    'pending': TaskStatus.QUEUED,
  };
  return statusMap[externalStatus] || TaskStatus.PROCESSING;
}

/**
 * 🔥 LiteLLM: 开始轮询任务（分布式锁版本）
 */
export async function startTaskPolling(params: {
  videoId: string;
  externalTaskId: string;
  apiConfigId: string;
  userId: string;
}) {
  const { videoId, externalTaskId, apiConfigId, userId } = params;
  
  // 🔥 LiteLLM: 分布式锁（Redis SETNX）
  const lockKey = `lock:polling:${videoId}`;
  const lockAcquired = await redisService.client.set(lockKey, '1', {
    NX: true,  // 🔥 LiteLLM line 435: nx=nx
    EX: 600,   // 10分钟锁（防止实例崩溃后锁永久存在）
  });
  
  if (!lockAcquired) {
    console.log(`[TaskPolling] 🔒 任务已被其他实例轮询: ${videoId}`);
    return;
  }
  
  console.log(`[TaskPolling] ✅ 获得分布式锁: ${videoId}`);
  
  // 避免本地重复轮询
  if (pollingTimers.has(videoId)) {
    console.log(`[TaskPolling] ⚠️  任务已在本地轮询中: ${videoId}`);
    return;
  }
  
  // 🔥 LiteLLM: 保存任务详情到 Redis（而非内存）
  const taskDetails: TaskDetails = {
    videoId,
    externalTaskId,
    apiConfigId,
    userId,
    startedAt: Date.now(),
    pollCount: 0,
    retryCount: 0,
  };
  
  await redisService.asyncSetCache(`polling:${videoId}`, taskDetails, 3600);  // 1小时 TTL
  console.log(`[TaskPolling] 💾 任务详情已存入 Redis: ${videoId}`);
  
  console.log(`[TaskPolling] 🚀 开始轮询任务: ${videoId} → ${externalTaskId}`);
  
  // 立即查询一次
  pollTask(videoId);
  
  // 启动定时轮询
  const timer = setInterval(() => {
    pollTask(videoId);
  }, POLLING_INTERVAL);
  
  pollingTimers.set(videoId, timer);
}

/**
 * 🔥 LiteLLM: 轮询单个任务（从 Redis 读取）
 */
async function pollTask(videoId: string) {
  // 🔥 LiteLLM: 从 Redis 获取任务详情
  const taskData = await redisService.asyncGetCache(`polling:${videoId}`);
  if (!taskData) {
    console.warn(`[TaskPolling] ⚠️  任务不存在（Redis）: ${videoId}`);
    stopTaskPolling(videoId);
    return;
  }
  
  const task: TaskDetails = taskData;
  
  // 🔥 LiteLLM line 272: 原子递增计数器
  task.pollCount = await redisService.increment(`poll:count:${videoId}`, 1, 7200);  // 2小时 TTL
  
  try {
    // 检查最大轮询次数
    if (task.pollCount > MAX_POLL_ATTEMPTS) {
      console.warn(`[TaskPolling] ⏱️  达到最大轮询次数: ${videoId}`);
      stopTaskPolling(videoId);
      
      // 推送超时消息
      sseService.pushTaskUpdate(task.userId, {
        videoId,
        externalTaskId: task.externalTaskId,
        status: 'failed',
        progress: 0,
        error: { message: '任务超时' },
      });
      
      // 更新数据库
      await updateDatabaseStatus(videoId, {
        status: TaskStatus.FAILED,
        errorMessage: '任务超时',
      });
      
      return;
    }
    
    // 查询外部 API
    const { API_CONFIGS } = require('./videoTaskService');
    const config = API_CONFIGS.find((c: any) => c.id === task.apiConfigId) || API_CONFIGS[0];
    
    const queryEndpoint = (config as any).queryEndpoint || '/sora/v1/videos/{id}';
    const url = `${config.baseUrl}${queryEndpoint.replace('{id}', task.externalTaskId)}`;
    
    console.log(`[TaskPolling] 🔍 查询 #${task.pollCount}: ${task.externalTaskId}`);
    
    const response = await axios.get(url, {
      headers: { 'Authorization': config.apiKey },
      timeout: 15000,
    });
    
    const extData = response.data;
    
    // 🔥 检查 API 是否返回错误
    if (extData.error || extData.status === 'failed') {
      const errorMessage = extData.error?.message || JSON.stringify(extData.error || 'Task failed');
      const errorType = extData.error?.type || extData.error_code || 'api_error';
      
      console.error(`[TaskPolling] ❌ 任务失败: ${errorMessage}`);
      console.error(`[TaskPolling] 📦 错误详情:`, extData.error);
      
      // 🔥 自动重试逻辑（参考 LiteLLM 的重试策略）
      if (task.retryCount < MAX_RETRY_ATTEMPTS) {
        task.retryCount++;
        console.log(`[TaskPolling] 🔄 自动重试 (${task.retryCount}/${MAX_RETRY_ATTEMPTS})...`);
        console.log(`[TaskPolling] ⏱️ 等待10秒后重新提交任务...`);
        
        // 通知前端正在重试
        sseService.pushTaskUpdate(task.userId, {
          videoId,
          externalTaskId: task.externalTaskId,
          status: 'QUEUED',  // 标记为排队中
          progress: 0,
          error: { message: `任务失败，自动重试中 (${task.retryCount}/${MAX_RETRY_ATTEMPTS})` },
        });
        
        // 等待10秒后重新提交
        setTimeout(async () => {
          try {
            await retryTask(task);
          } catch (retryError: any) {
            console.error(`[TaskPolling] ❌ 重试失败: ${retryError.message}`);
            // 重试失败，标记为最终失败
            await finalizeFailure(task, errorMessage, errorType);
          }
        }, 10000);
        
        return;
      }
      
      // 🔥 达到最大重试次数，标记为最终失败
      console.error(`[TaskPolling] 🔴 达到最大重试次数，任务失败: ${videoId}`);
      await finalizeFailure(task, errorMessage, errorType);
      return;
    }
    
    // 映射状态
    const internalStatus = mapExternalStatus(extData.status);
    
    // 通过 SSE 推送更新
    const pushed = sseService.pushTaskUpdate(task.userId, {
      videoId,
      externalTaskId: task.externalTaskId,
      status: internalStatus,
      progress: extData.progress || 0,
      videoUrl: extData.video_url,
      imageUrl: extData.image_url,
      error: extData.error,
      errorCode: extData.error_code,
    });
    
    if (pushed) {
      console.log(`[TaskPolling] ✅ SSE 推送成功: ${videoId} → ${extData.status} (${extData.progress || 0}%)`);
    } else {
      console.warn(`[TaskPolling] ⚠️  SSE 推送失败，用户可能已断开: ${task.userId}`);
    }
    
    // 更新数据库（异步，不阻塞）
    updateDatabaseStatus(videoId, {
      status: internalStatus,
      progress: extData.progress || 0,
      videoUrl: extData.video_url,
      imageUrl: extData.image_url,
      errorMessage: extData.error ? JSON.stringify(extData.error) : undefined,
      errorCode: extData.error_code,
    }).catch((err) => {
      console.error(`[TaskPolling] ❌ 数据库更新失败: ${videoId}`, err.message);
    });
    
    // 任务完成/失败 → 停止轮询
    if (extData.status === 'completed' || extData.status === 'failed') {
      console.log(`[TaskPolling] 🏁 任务完成: ${videoId} → ${extData.status}`);
      stopTaskPolling(videoId);
    }
    
  } catch (error: any) {
    console.error(`[TaskPolling] ❌ 查询失败 (${task.pollCount}/${MAX_POLL_ATTEMPTS}):`, error.message);
    
    // 连续失败 5 次 → 推送错误消息
    if (task.pollCount % 5 === 0) {
      sseService.pushTaskUpdate(task.userId, {
        videoId,
        externalTaskId: task.externalTaskId,
        status: 'PROCESSING',
        progress: 0,
        error: { message: `查询外部 API 失败 (${task.pollCount} 次)` },
      });
    }
  }
}

/**
 * 🔥 重试任务（重新提交到外部API）
 */
async function retryTask(task: TaskDetails) {
  console.log(`[TaskPolling] 🔄 开始重试任务: ${task.videoId}`);
  
  // 获取原始任务数据
  const dbTask = await videoTaskRepository.getTask(task.videoId);
  if (!dbTask) {
    throw new Error('任务不存在');
  }
  
  // 获取API配置
  const { API_CONFIGS } = require('./videoTaskService');
  const config = API_CONFIGS.find((c: any) => c.id === task.apiConfigId) || API_CONFIGS[0];
  
  // 重新提交到外部API
  const FormData = require('form-data');
  const formData = new FormData();
  formData.append('prompt', dbTask.prompt);
  formData.append('model', dbTask.model || 'sora_video2');
  if (dbTask.size) formData.append('size', dbTask.size);
  if (dbTask.duration) formData.append('seconds', dbTask.duration.toString());
  if (dbTask.aspectRatio) formData.append('aspect_ratio', dbTask.aspectRatio);
  
  console.log(`[TaskPolling] 📤 重新提交到外部API...`);
  
  const response = await axios.post(
    `${config.baseUrl}/sora/v1/videos`,
    formData,
    {
      headers: {
        'Authorization': config.apiKey,
        ...formData.getHeaders(),
      },
      timeout: 30000,
    }
  );
  
  const newExternalTaskId = response.data.id || response.data;
  console.log(`[TaskPolling] ✅ 重试提交成功，新任务ID: ${newExternalTaskId}`);
  
  // 更新任务详情
  task.externalTaskId = newExternalTaskId;
  task.pollCount = 0;  // 重置轮询次数
  task.startedAt = Date.now();  // 重置开始时间
  
  // 更新数据库
  await videoTaskRepository.updateTask(task.videoId, {
    externalTaskId: newExternalTaskId,
    status: TaskStatus.PROCESSING,
    progress: 0,
    errorMessage: undefined,  // 清除旧错误
    errorCode: undefined,
  });
  
  // 通知前端重试开始
  sseService.pushTaskUpdate(task.userId, {
    videoId: task.videoId,
    externalTaskId: newExternalTaskId,
    status: 'PROCESSING',
    progress: 0,
    error: { message: `重试成功，任务重新开始 (第${task.retryCount}次重试)` },
  });
  
  console.log(`[TaskPolling] ✅ 重试任务已启动，继续轮询...`);
}

/**
 * 🔥 最终失败处理（不再重试）
 */
async function finalizeFailure(
  task: TaskDetails,
  errorMessage: string,
  errorType: string
) {
  const retryInfo = task.retryCount > 0 
    ? ` (已重试${task.retryCount}次)` 
    : '';
  
  console.error(`[TaskPolling] 🔴 任务最终失败: ${task.videoId}${retryInfo}`);
  
  // 推送最终失败状态
  sseService.pushTaskUpdate(task.userId, {
    videoId: task.videoId,
    externalTaskId: task.externalTaskId,
    status: 'failed',
    progress: 0,
    error: { 
      message: `${errorMessage}${retryInfo}`,
      type: errorType,
      retryCount: task.retryCount,
    },
  });
  
  // 更新数据库
  await updateDatabaseStatus(task.videoId, {
    status: TaskStatus.FAILED,
    errorMessage: `${errorMessage}${retryInfo}`,
    errorCode: errorType,
  });
  
  // 停止轮询
  stopTaskPolling(task.videoId);
}

/**
 * 🔥 LiteLLM: 停止轮询任务（清理 Redis）
 */
export async function stopTaskPolling(videoId: string) {
  const timer = pollingTimers.get(videoId);
  if (timer) {
    clearInterval(timer);
    pollingTimers.delete(videoId);
  }
  
  // 🔥 LiteLLM: 清理 Redis 中的任务数据
  await redisService.delete(`polling:${videoId}`);
  await redisService.delete(`poll:count:${videoId}`);
  await redisService.delete(`lock:polling:${videoId}`);
  
  console.log(`[TaskPolling] 🛑 停止轮询并清理 Redis: ${videoId}`);
}

/**
 * 更新数据库状态（异步，不阻塞）
 */
async function updateDatabaseStatus(
  videoId: string,
  update: {
    status?: TaskStatus;
    progress?: number;
    videoUrl?: string;
    imageUrl?: string;
    errorMessage?: string;
    errorCode?: string;
  }
) {
  try {
    await videoTaskRepository.updateTask(videoId, {
      status: update.status,
      progress: update.progress,
      videoUrl: update.videoUrl,
      imageUrl: update.imageUrl,
      errorMessage: update.errorMessage,
      errorCode: update.errorCode,
      completedAt: (update.status === TaskStatus.COMPLETED || update.status === TaskStatus.FAILED)
        ? new Date()
        : undefined,
    });
    
    console.log(`[TaskPolling] 💾 数据库已更新: ${videoId} → ${update.status}`);
  } catch (error: any) {
    console.error(`[TaskPolling] ❌ 数据库更新失败: ${videoId}`, error.message);
    throw error;
  }
}

/**
 * 🔥 LiteLLM: 获取轮询统计（从 Redis）
 */
export async function getPollingStats() {
  // 🔥 注意：这里只显示本地实例的轮询任务
  // 如果需要跨实例统计，需要扫描 Redis 中的所有 polling:* 键
  const localTasks = Array.from(pollingTimers.keys());
  
  const tasks = await Promise.all(
    localTasks.map(async (videoId) => {
      const task = await redisService.asyncGetCache(`polling:${videoId}`);
      if (!task) return null;
      
      const pollCount = await redisService.asyncGetCache(`poll:count:${videoId}`) || 0;
      
      return {
        videoId: task.videoId,
        externalTaskId: task.externalTaskId,
        userId: task.userId,
        pollCount: pollCount,
        duration: Math.floor((Date.now() - task.startedAt) / 1000) + 's',
      };
    })
  );
  
  return {
    activeTasks: tasks.filter(t => t !== null).length,
    tasks: tasks.filter(t => t !== null),
  };
}

/**
 * 🔥 新增：故障恢复机制（启动时从 Redis 恢复未完成任务）
 * 
 * 参考：LiteLLM 的 Fault Tolerance 设计
 * - 扫描 Redis 中的 polling:* 键
 * - 恢复轮询中的任务
 * - 自动重新获取分布式锁
 */
export async function recoverPollingTasks() {
  console.log('[TaskPolling] 🔄 扫描 Redis 中的未完成任务...');
  
  try {
    // 🔥 LiteLLM async_scan_iter pattern
    const keys: string[] = [];
    for await (const key of redisService.client.scanIterator({
      MATCH: `sora-ui:polling:*`,  // 带 namespace 前缀
      COUNT: 100,
    })) {
      keys.push(key);
    }
    
    console.log(`[TaskPolling] 🔍 发现 ${keys.length} 个未完成任务`);
    
    for (const fullKey of keys) {
      // 移除 namespace 前缀
      const videoId = fullKey.replace('sora-ui:polling:', '');
      
      const task = await redisService.asyncGetCache(`polling:${videoId}`);
      if (!task) continue;
      
      // 检查锁是否已过期
      const lockKey = `lock:polling:${videoId}`;
      const hasLock = await redisService.client.exists(`sora-ui:${lockKey}`);
      
      if (hasLock) {
        console.log(`[TaskPolling] 🔒 任务 ${videoId} 已被其他实例轮询，跳过`);
        continue;
      }
      
      console.log(`[TaskPolling] 🔄 恢复轮询: ${videoId}`);
      
      // 重新启动轮询（会自动获取分布式锁）
      await startTaskPolling({
        videoId: task.videoId,
        externalTaskId: task.externalTaskId,
        apiConfigId: task.apiConfigId,
        userId: task.userId,
      });
    }
    
    console.log('[TaskPolling] ✅ 故障恢复完成');
  } catch (error: any) {
    console.error('[TaskPolling] ❌ 故障恢复失败:', error.message);
  }
}

/**
 * 🔥 LiteLLM: 清理所有轮询（用于服务关闭）
 */
export function cleanupAllPolling() {
  console.log(`[TaskPolling] 🧹 清理所有轮询任务: ${pollingTimers.size} 个`);
  
  pollingTimers.forEach((timer, videoId) => {
    clearInterval(timer);
  });
  
  pollingTimers.clear();
}
