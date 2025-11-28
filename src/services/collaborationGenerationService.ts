// src/services/collaborationGenerationService.ts
/**
 * 🎬 协作系统生成任务服务
 * 
 * 负责处理协作系统中的 AI 生成任务：
 * - 角色图片生成
 * - 场景图片生成
 * - 物品图片生成
 * - 融合生图
 * - 视频生成
 * 
 * 架构设计参考：
 * - LiteLLM redis_cache.py - 分布式锁和缓存
 * - n8n Abstract Push - 健康检查和推送
 * - 现有 taskPollingService.ts - 轮询机制
 */

import axios from 'axios';
import { PrismaClient, GenerationResourceType, GenerationTaskStatus } from '@prisma/client';
import { redisService } from './redisService';
import { wsService } from './websocket.service';

const prisma = new PrismaClient();

// ============ 配置 ============

// AI 图片生成 API 配置
const IMAGE_API_CONFIGS = [
  {
    id: 'apiyi-image',
    name: 'API易 图片生成',
    baseUrl: process.env.IMAGE_API_BASE_URL || 'https://api.apiyi.com',
    apiKey: process.env.IMAGE_API_KEY || '',
    models: {
      'STAR_2_5': 'flux-1.1-pro',
      'STAR_3_0': 'flux-1.1-pro-ultra', 
      'MJ_V7': 'midjourney-v6.1',
      'ADVANCED_2': 'stable-diffusion-3.5-large',
      'ADVANCED_1': 'stable-diffusion-3.5-medium',
    },
    enabled: true,
  },
];

// 视频生成 API 配置（复用现有配置）
const VIDEO_API_CONFIGS = [
  {
    id: 'sora-video',
    name: 'Sora 视频生成',
    baseUrl: process.env.SORA_API_BASE_URL || 'http://45.8.22.95:8000',
    apiKey: process.env.SORA_API_KEY || '',
    submitEndpoint: '/sora/v1/videos',
    queryEndpoint: '/sora/v1/videos/{id}',
    enabled: true,
  },
];

// 轮询配置
const POLLING_INTERVAL = 5000; // 5秒
const MAX_POLL_ATTEMPTS = 120; // 最多轮询 10 分钟

// 本地轮询定时器
const pollingTimers = new Map<string, NodeJS.Timeout>();

// ============ 生成任务处理 ============

/**
 * 处理待处理的生成任务
 * 由后台定时任务调用
 */
export async function processNextPendingTask(): Promise<void> {
  // 获取一个待处理的任务
  const task = await prisma.generationTask.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  if (!task) {
    return;
  }

  console.log(`[CollabGen] 🚀 处理生成任务: ${task.id} (${task.resourceType})`);

  try {
    // 更新状态为处理中
    await prisma.generationTask.update({
      where: { id: task.id },
      data: { status: 'QUEUED' },
    });

    // 根据资源类型选择生成方式
    if (task.resourceType === 'VIDEO' || task.resourceType === 'FUSION') {
      await submitVideoGeneration(task);
    } else {
      await submitImageGeneration(task);
    }
  } catch (error: any) {
    console.error(`[CollabGen] ❌ 处理任务失败: ${task.id}`, error.message);
    
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
      },
    });
  }
}

/**
 * 提交图片生成任务
 */
async function submitImageGeneration(task: any): Promise<void> {
  const config = IMAGE_API_CONFIGS.find(c => c.enabled) || IMAGE_API_CONFIGS[0];
  
  if (!config.apiKey) {
    throw new Error('图片生成 API 未配置');
  }

  // 映射模型名称
  const modelMap = config.models as Record<string, string>;
  const model = modelMap[task.aiModel] || 'flux-1.1-pro';

  console.log(`[CollabGen] 📸 提交图片生成: ${task.id}`);
  console.log(`  - 模型: ${model}`);
  console.log(`  - 提示词: ${task.prompt?.substring(0, 100)}...`);

  try {
    // 调用图片生成 API (兼容 OpenAI images/generations 格式)
    const response = await axios.post(
      `${config.baseUrl}/v1/images/generations`,
      {
        model,
        prompt: task.prompt,
        n: task.params?.generationCount || 4, // 默认生成 4 张
        size: task.params?.resolution || '1024x1024',
        response_format: 'url',
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    // 解析结果
    const images = response.data.data?.map((item: any) => item.url) || [];

    if (images.length > 0) {
      console.log(`[CollabGen] ✅ 图片生成成功: ${images.length} 张`);

      // 更新任务状态
      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          status: 'CONFIRMED',
          candidateImages: images,
          completedAt: new Date(),
        },
      });

      // WebSocket 推送通知
      notifyTaskUpdate(task.id, 'COMPLETED', images);
    } else {
      throw new Error('未返回生成结果');
    }
  } catch (error: any) {
    console.error(`[CollabGen] ❌ 图片生成失败:`, error.response?.data || error.message);
    
    // 更新为失败状态
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        errorMessage: error.response?.data?.error?.message || error.message,
      },
    });

    notifyTaskUpdate(task.id, 'FAILED', [], error.message);
  }
}

/**
 * 提交视频生成任务（异步，需要轮询）
 */
async function submitVideoGeneration(task: any): Promise<void> {
  const config = VIDEO_API_CONFIGS.find(c => c.enabled) || VIDEO_API_CONFIGS[0];

  if (!config.apiKey) {
    throw new Error('视频生成 API 未配置');
  }

  console.log(`[CollabGen] 🎬 提交视频生成: ${task.id}`);
  console.log(`  - 提示词: ${task.prompt?.substring(0, 100)}...`);

  try {
    // 构建请求表单
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('prompt', task.prompt);
    formData.append('model', 'sora_video2');
    
    if (task.params?.resolution) {
      formData.append('size', task.params.resolution);
    }
    if (task.params?.duration) {
      formData.append('seconds', task.params.duration.toString());
    }
    if (task.referenceImage) {
      formData.append('reference_image', task.referenceImage);
    }

    // 提交到外部 API
    const response = await axios.post(
      `${config.baseUrl}${config.submitEndpoint}`,
      formData,
      {
        headers: {
          'Authorization': config.apiKey,
          ...formData.getHeaders(),
        },
        timeout: 30000,
      }
    );

    const externalTaskId = response.data.id || response.data.task_id || response.data;

    console.log(`[CollabGen] ✅ 视频任务已提交: ${externalTaskId}`);

    // 更新任务状态
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'PROCESSING',
        externalTaskId,
      },
    });

    // 开始轮询
    startTaskPolling(task.id, externalTaskId, config);

    notifyTaskUpdate(task.id, 'PROCESSING', []);
  } catch (error: any) {
    console.error(`[CollabGen] ❌ 视频提交失败:`, error.response?.data || error.message);

    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        errorMessage: error.response?.data?.error?.message || error.message,
      },
    });

    notifyTaskUpdate(task.id, 'FAILED', [], error.message);
  }
}

// ============ 轮询机制 ============

/**
 * 开始轮询视频生成任务
 */
function startTaskPolling(taskId: string, externalTaskId: string, config: any): void {
  // 避免重复轮询
  if (pollingTimers.has(taskId)) {
    console.log(`[CollabGen] ⚠️ 任务已在轮询中: ${taskId}`);
    return;
  }

  let pollCount = 0;

  const timer = setInterval(async () => {
    pollCount++;

    try {
      // 检查最大轮询次数
      if (pollCount > MAX_POLL_ATTEMPTS) {
        console.warn(`[CollabGen] ⏱️ 任务超时: ${taskId}`);
        stopTaskPolling(taskId);

        await prisma.generationTask.update({
          where: { id: taskId },
          data: {
            status: 'FAILED',
            errorMessage: '任务超时',
          },
        });

        notifyTaskUpdate(taskId, 'FAILED', [], '任务超时');
        return;
      }

      // 查询外部 API
      const queryUrl = `${config.baseUrl}${config.queryEndpoint.replace('{id}', externalTaskId)}`;
      
      const response = await axios.get(queryUrl, {
        headers: { 'Authorization': config.apiKey },
        timeout: 15000,
      });

      const data = response.data;

      // 检查错误
      if (data.error || data.status === 'failed') {
        console.error(`[CollabGen] ❌ 视频生成失败: ${data.error?.message || 'Unknown error'}`);
        stopTaskPolling(taskId);

        await prisma.generationTask.update({
          where: { id: taskId },
          data: {
            status: 'FAILED',
            errorMessage: data.error?.message || '生成失败',
          },
        });

        notifyTaskUpdate(taskId, 'FAILED', [], data.error?.message);
        return;
      }

      // 检查完成
      if (data.status === 'completed') {
        console.log(`[CollabGen] ✅ 视频生成完成: ${taskId}`);
        stopTaskPolling(taskId);

        const videoUrl = data.video_url || data.image_url;

        await prisma.generationTask.update({
          where: { id: taskId },
          data: {
            status: 'CONFIRMED',
            candidateImages: videoUrl ? [videoUrl] : [],
            completedAt: new Date(),
          },
        });

        notifyTaskUpdate(taskId, 'COMPLETED', videoUrl ? [videoUrl] : []);
        return;
      }

      // 进行中
      console.log(`[CollabGen] 🔄 轮询 #${pollCount}: ${taskId} → ${data.status} (${data.progress || 0}%)`);

    } catch (error: any) {
      console.error(`[CollabGen] ❌ 轮询失败 #${pollCount}: ${error.message}`);
    }
  }, POLLING_INTERVAL);

  pollingTimers.set(taskId, timer);
  console.log(`[CollabGen] 🚀 开始轮询: ${taskId}`);
}

/**
 * 停止轮询
 */
function stopTaskPolling(taskId: string): void {
  const timer = pollingTimers.get(taskId);
  if (timer) {
    clearInterval(timer);
    pollingTimers.delete(taskId);
    console.log(`[CollabGen] 🛑 停止轮询: ${taskId}`);
  }
}

// ============ 通知 ============

/**
 * 通过 WebSocket 推送任务更新
 */
function notifyTaskUpdate(
  taskId: string,
  status: string,
  candidateImages: string[],
  errorMessage?: string
): void {
  try {
    wsService.pushGenerationTaskUpdate(taskId, {
      status,
      candidateImages,
      errorMessage,
    });
  } catch (error) {
    console.warn(`[CollabGen] WebSocket 推送失败:`, error);
  }
}

// ============ 后台任务 ============

let processingInterval: NodeJS.Timeout | null = null;

/**
 * 启动后台任务处理
 */
export function startBackgroundProcessing(): void {
  if (processingInterval) {
    console.log('[CollabGen] ⚠️ 后台处理已在运行');
    return;
  }

  console.log('[CollabGen] 🚀 启动后台任务处理');

  // 每 3 秒检查一次待处理任务
  processingInterval = setInterval(async () => {
    try {
      await processNextPendingTask();
    } catch (error: any) {
      console.error('[CollabGen] ❌ 后台处理错误:', error.message);
    }
  }, 3000);
}

/**
 * 停止后台任务处理
 */
export function stopBackgroundProcessing(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    console.log('[CollabGen] 🛑 停止后台任务处理');
  }

  // 清理所有轮询
  pollingTimers.forEach((timer, taskId) => {
    clearInterval(timer);
  });
  pollingTimers.clear();
}

/**
 * 获取处理统计
 */
export async function getProcessingStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const [pending, processing, confirmed, failed] = await Promise.all([
    prisma.generationTask.count({ where: { status: 'PENDING' } }),
    prisma.generationTask.count({ where: { status: 'PROCESSING' } }),
    prisma.generationTask.count({ where: { status: 'CONFIRMED' } }),
    prisma.generationTask.count({ where: { status: 'FAILED' } }),
  ]);

  return { pending, processing, completed: confirmed, failed };
}

// ============ 导出 ============

export const collaborationGenerationService = {
  processNextPendingTask,
  startBackgroundProcessing,
  stopBackgroundProcessing,
  getProcessingStats,
};

export default collaborationGenerationService;

