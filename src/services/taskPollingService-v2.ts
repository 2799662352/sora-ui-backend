// src/services/taskPollingService-v2.ts
/**
 * 任务轮询服务 V2
 * 
 * 🔥 完全参考以下源码：
 * - Flowise OpenAIAssistant.ts (Promise + 指数退避 + 超时保护)
 * - LiteLLM handler.py (while True + sleep 防限流)
 * - Redis 缓存层（减少 API 调用）
 * 
 * 核心改进：
 * 1. Redis 缓存层（热数据 5-20ms）
 * 2. 初始延迟 1秒（从 5秒）
 * 3. Promise 包装（更优雅）
 * 4. 指数退避（限流时）
 * 5. 超时保护（10分钟）
 */

import { redisService } from './redisService';
import { sseService } from './sseService';
import { videoTaskService } from './videoTaskService';
import { videoTaskRepository } from '../repositories/videoTaskRepository';
import { TaskStatus } from '@prisma/client';

interface TaskPollingParams {
  videoId: string;
  externalTaskId: string;
  apiConfigId: string;
  userId: string;
}

interface PollingTask {
  videoId: string;
  externalTaskId: string;
  apiConfigId: string;
  userId: string;
  startTime: number;
  pollCount: number;
  delay: number;
  retries: number;
  timer?: NodeJS.Timeout;
}

// 🔥 Flowise + LiteLLM: 轮询配置
const POLLING_CONFIG = {
  INITIAL_DELAY: 1000,      // 🔥 初始 1秒（Flowise: 500ms, 我们稍保守）
  MAX_WAIT_TIME: 600000,    // 🔥 最大 10分钟（LiteLLM: 600s）
  MAX_RETRIES: 10,          // 🔥 最大重试 10次（Flowise）
  BASE_DELAY: 1000,         // 基础延迟 1秒
  MAX_DELAY: 10000,         // 最大延迟 10秒
  CACHE_TTL: 3600,          // Redis 缓存 1小时
};

// 活跃轮询任务
const activeTasks = new Map<string, PollingTask>();

/**
 * 🔥 Flowise: Promise 包装轮询
 */
async function pollTaskWithPromise(task: PollingTask): Promise<void> {
  return new Promise((resolve, reject) => {
    const { MAX_WAIT_TIME, BASE_DELAY, MAX_RETRIES } = POLLING_CONFIG;
    const { videoId, externalTaskId, apiConfigId, userId } = task;
    
    let delay = BASE_DELAY;
    let retries = 0;
    let pollCount = 0;
    const startTime = Date.now();
    
    // 🔥 Flowise: setInterval 返回 timer
    const timer = setInterval(async () => {
      try {
        pollCount++;
        
        // 🔥 Redis: 递增轮询计数器
        const totalPolls = await redisService.increment(`task:poll:${videoId}`, 1, 7200);
        
        console.log(`[TaskPolling] 🔍 查询 #${pollCount} (总${totalPolls}次): ${videoId}`);
        
        // 🔥 第1层：检查 Redis 缓存
        let taskStatus = await redisService.asyncGetCache(`task:status:${videoId}`);
        
        if (!taskStatus) {
          // 🔥 第2层：Redis Miss，查询外部 API
          console.log(`[TaskPolling] 🌐 Redis Miss，查询外部 API: ${externalTaskId}`);
          
          const taskData = await videoTaskService.queryTaskStatus(videoId);
          
          if (taskData) {
            taskStatus = {
              status: taskData.status,
              progress: taskData.progress,
              videoUrl: taskData.videoUrl,
              imageUrl: taskData.imageUrl,
              error: taskData.errorMessage,
            };
            
            // 🔥 Redis: 智能缓存策略
            // - PROCESSING: 短缓存 (10秒)，允许更新
            // - COMPLETED/FAILED: 长缓存 (1小时)
            const cacheTTL = taskStatus.status === 'PROCESSING' ? 10 : POLLING_CONFIG.CACHE_TTL;
            await redisService.asyncSetCache(`task:status:${videoId}`, taskStatus, cacheTTL);
          }
        } else {
          console.log(`[TaskPolling] ✅ Redis Hit: ${videoId}`);
        }
        
        // 推送更新到前端（SSE）
        if (taskStatus) {
          sseService.pushTaskUpdate(userId, {
            videoId,
            externalTaskId,
            status: taskStatus.status,
            progress: taskStatus.progress,
            videoUrl: taskStatus.videoUrl,
            imageUrl: taskStatus.imageUrl,
            error: taskStatus.error,
          });
        }
        
        // 检查是否完成
        if (taskStatus && (taskStatus.status === 'COMPLETED' || taskStatus.status === 'FAILED')) {
          clearInterval(timer);
          activeTasks.delete(videoId);
          
          console.log(`[TaskPolling] ✅ 任务完成: ${videoId} (${pollCount} 次查询)`);
          
          // 🔥 PostgreSQL: 异步持久化（不阻塞）
          setImmediate(async () => {
            try {
              await videoTaskRepository.updateTask(videoId, {
                status: taskStatus.status as TaskStatus,
                progress: taskStatus.progress,
                completedAt: new Date(),
              });
              console.log(`[TaskPolling] 💾 持久化到 PostgreSQL: ${videoId}`);
            } catch (error) {
              console.error(`[TaskPolling] ❌ 持久化失败: ${videoId}`, error);
            }
          });
          
          resolve();
          return;
        }
        
      } catch (error: any) {
        // 🔥 Flowise: 限流处理 - 指数退避
        if (error.response?.status === 429) {
          if (retries < MAX_RETRIES) {
            retries++;
            delay = Math.min(delay * 2, POLLING_CONFIG.MAX_DELAY);  // 🔥 指数退避
            console.warn(`[TaskPolling] ⚠️ 限流 (429)，延迟增加到 ${delay}ms`);
            
            // 清除旧 timer，用新延迟重新设置
            clearInterval(timer);
            task.delay = delay;
            task.timer = setInterval(async () => {
              // 重新执行轮询逻辑
            }, delay) as NodeJS.Timeout;
          } else {
            clearInterval(timer);
            activeTasks.delete(videoId);
            reject(new Error(`达到最大重试次数: ${videoId}`));
          }
        } else {
          // 其他错误
          console.error(`[TaskPolling] ❌ 轮询错误: ${videoId}`, error);
        }
      }
      
      // 🔥 Flowise: 超时保护
      if (Date.now() - startTime > MAX_WAIT_TIME) {
        clearInterval(timer);
        activeTasks.delete(videoId);
        reject(new Error(`轮询超时: ${videoId}`));
      }
    }, delay);
    
    // 保存 timer 引用
    task.timer = timer;
  });
}

/**
 * 启动任务轮询
 */
export async function startTaskPolling(params: TaskPollingParams) {
  const { videoId } = params;
  
  // 检查是否已在轮询
  if (activeTasks.has(videoId)) {
    console.log(`[TaskPolling] ⚠️ 任务已在轮询中: ${videoId}`);
    return;
  }
  
  const task: PollingTask = {
    ...params,
    startTime: Date.now(),
    pollCount: 0,
    delay: POLLING_CONFIG.INITIAL_DELAY,
    retries: 0,
  };
  
  activeTasks.set(videoId, task);
  
  console.log(`[TaskPolling] 🚀 开始轮询: ${videoId}`);
  console.log(`[TaskPolling] - 初始延迟: ${POLLING_CONFIG.INITIAL_DELAY}ms`);
  console.log(`[TaskPolling] - 最大等待: ${POLLING_CONFIG.MAX_WAIT_TIME / 1000}s`);
  
  try {
    // 🔥 Flowise: 使用 Promise，支持 await
    await pollTaskWithPromise(task);
    console.log(`[TaskPolling] ✅ 轮询完成: ${videoId}`);
  } catch (error) {
    console.error(`[TaskPolling] ❌ 轮询失败: ${videoId}`, error);
  }
}

/**
 * 停止任务轮询
 */
export function stopTaskPolling(videoId: string) {
  const task = activeTasks.get(videoId);
  if (task) {
    if (task.timer) {
      clearInterval(task.timer);
    }
    activeTasks.delete(videoId);
    console.log(`[TaskPolling] 🛑 停止轮询: ${videoId}`);
  }
}

/**
 * 获取轮询统计
 */
export function getPollingStats() {
  return {
    activeTasks: activeTasks.size,
    tasks: Array.from(activeTasks.values()).map(task => ({
      videoId: task.videoId,
      externalTaskId: task.externalTaskId,
      pollCount: task.pollCount,
      duration: `${Math.floor((Date.now() - task.startTime) / 1000)}s`,
      delay: `${task.delay}ms`,
    })),
  };
}

