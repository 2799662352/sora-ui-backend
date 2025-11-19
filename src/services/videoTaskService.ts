// src/services/videoTaskService-simplified.ts
// 🔥 视频任务服务（精简版）
//
// 精简架构说明：
// - 前端直接调用外部API生成视频
// - 后端只负责：ID映射、状态查询、WebSocket推送
// - 删除：视频生成逻辑（createVideoTask, submitAsyncTask等）
// - 保留：状态查询、任务列表、权限验证

import axios from 'axios';
import { TaskStatus, MediaType } from '@prisma/client';
import { videoTaskRepository } from '../repositories/videoTaskRepository';
import { AppError } from '../utils/errors';
import { parseError, formatErrorForStorage } from '../utils/errorParser';

// API 配置
export const API_CONFIGS = [
  {
    id: 'backend-api',
    name: '懒人猫后端API',
    baseUrl: 'http://45.8.22.95:8000',  // 🔥 真实外部API地址
    apiKey: process.env.SORA_API_KEY || 'sk-XlwdCKIn8g7sJ672o5UOawhOqvXYQKhOwqaFzPv8bH2e16HYS8dS55wFIKiBvqTy',
    model: 'sora_video2',
    type: 'sora2-async',
    enabled: true,  // 🔥 必需字段
    // 🔥 端点路径（注意：有/sora 前缀）
    submitEndpoint: '/sora/v1/videos',
    queryEndpoint: '/sora/v1/videos/{id}',
  },
  {
    id: 'sora_video2_default',
    name: 'Sora Video 2.0',
    baseUrl: process.env.SORA_API_BASE_URL || 'http://45.8.22.95:666',
    apiKey: process.env.SORA_API_KEY || 'sk-1234567890',
    model: 'sora_video2',
    type: 'sora2-async',
    enabled: true,  // 🔥 必需字段
  },
];

class VideoTaskService {
  /**
   * 🔥 查询任务状态（从外部API）
   *
   * 核心功能：
   * 1. 使用 externalTaskId 查询外部API
   * 2. 更新数据库状态
   * 3. 通过 WebSocket 推送更新
   */
  async queryTaskStatus(videoId: string): Promise<any> {
    try {
      const task = await videoTaskRepository.getTask(videoId);
      if (!task) {
        console.error(`[queryTaskStatus] 任务不存在: ${videoId}`);
        return null;
      }

      // 终态任务不需要查询
      const endStates: TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED];
      if (endStates.includes(task.status)) {
        console.log(`[queryTaskStatus] 任务已结束: ${videoId}`);
        return task;
      }

      // 🔥 精简版：直接使用顶级字段
      const externalTaskId = task.externalTaskId;

      if (!externalTaskId) {
        console.warn(`[queryTaskStatus] ⚠️ 缺少外部任务ID: ${videoId}`);
        return task;
      }

      // 获取 API 配置
      const apiConfig = task.apiConfigId
        ? API_CONFIGS.find(cfg => cfg.id === task.apiConfigId)
        : API_CONFIGS[0];

      if (!apiConfig) {
        console.error(`[queryTaskStatus] ❌ API配置不存在: ${task.apiConfigId}`);
        return null;
      }

      const apiKey = apiConfig.apiKey;  // 🔥 直接使用API Key，不加Bearer
      const apiBaseUrl = apiConfig.baseUrl;

      console.log(`[queryTaskStatus] 🔍 查询外部API:`);
      console.log(`  - videoId: ${videoId}`);
      console.log(`  - externalTaskId: ${externalTaskId}`);
      console.log(`  - API: ${apiBaseUrl}`);

      // 查询外部API（使用配置的端点或默认端点）
      const queryEndpoint = (apiConfig as any).queryEndpoint || '/sora/v1/videos/{id}';
      const url = `${apiBaseUrl}${queryEndpoint.replace('{id}', externalTaskId)}`;

      console.log(`  - 查询URL: ${url}`);

      const response = await axios.get(url, {
        headers: { 'Authorization': apiKey },  // 🔥 直接使用API Key
        timeout: 15000,
      });

      const data = response.data;

      // 🔥 关键修复：检查 API 是否返回错误
      if (data.error) {
        const parsedError = parseError(data.error);

        console.error(`[queryTaskStatus] ❌ API返回错误: ${parsedError.message}`);
        console.error(`[queryTaskStatus] 📦 错误详情:`, parsedError);
        console.error(`[queryTaskStatus] 🔍 原始错误:`, data.error);

        // 标记任务为失败（存储格式化的错误）
        await videoTaskRepository.updateTask(videoId, {
          status: TaskStatus.FAILED,
          errorMessage: formatErrorForStorage(data.error),
          errorCode: parsedError.code || parsedError.type,
          completedAt: new Date(),
        });

        return await videoTaskRepository.getTask(videoId);
      }

      const status = data.status;
      const progress = data.progress || 0;

      console.log(`[queryTaskStatus] ✅ 外部API返回:`, status, `${progress}%`);
      console.log(`[queryTaskStatus] 🔍 完整响应:`, JSON.stringify(data));  // 🔥 添加完整响应
      console.log(`[queryTaskStatus] 🔍 video_url 字段:`, data.video_url);  // 🔥 关键字段

      // 处理状态
      if (status === 'in_progress' || status === 'pending') {
        // 处理中
        // 🔥 FIX: 如果处理中也有videoUrl，一并保存
        const updates: any = {
          status: TaskStatus.PROCESSING,
          progress,
        };

        if (data.video_url) {
          updates.videoUrl = data.video_url;
          console.log(`[queryTaskStatus] 📹 处理中收到videoUrl: ${data.video_url.substring(0, 50)}...`);
        }
        if (data.image_url) {
          updates.imageUrl = data.image_url;
        }

        await videoTaskRepository.updateTask(videoId, updates);
      } else if (status === 'completed') {
        // 完成
        const videoUrl = data.video_url || data.image_url;
        const imageUrl = data.image_url;

        // 🔥 重要：即使completed，没有URL也标记为失败
        if (!videoUrl) {
          console.error(`[queryTaskStatus] ❌ 完成但无URL，标记为失败`);

          await videoTaskRepository.updateTask(videoId, {
            status: TaskStatus.FAILED,
            errorMessage: '任务完成但未返回视频URL',
            errorCode: 'NO_VIDEO_URL',
            completedAt: new Date(),
          });
        } else {
          console.log(`[queryTaskStatus] ✅ 任务完成，videoUrl: ${videoUrl}`);

          // 🔥 FIX: 必须更新 videoUrl！
          await videoTaskRepository.updateTask(videoId, {
            status: TaskStatus.COMPLETED,
            progress: 100,
            videoUrl,  // 🔥 保存 videoUrl
            imageUrl,  // 🔥 保存 imageUrl
            completedAt: new Date(),
          });
        }
      } else if (status === 'failed') {
        // 失败
        const errorMsg = typeof data.error === 'string'
          ? data.error
          : JSON.stringify(data.error);

        console.error(`[queryTaskStatus] ❌ 任务失败:`, data.error);

        await videoTaskRepository.updateTask(videoId, {
          status: TaskStatus.FAILED,
          errorMessage: errorMsg,
          errorCode: typeof data.error === 'object' ? data.error.code : undefined,
          completedAt: new Date(),
        });
      }

      return await videoTaskRepository.getTask(videoId);
    } catch (error: any) {
      console.error(`[queryTaskStatus] 查询失败: ${videoId}`, error.message);
      return null;
    }
  }

  /**
   * 获取视频任务
   */
  async getVideoTask(videoId: string, userId?: string): Promise<any> {
    const task = await videoTaskRepository.getTask(videoId);
    
    if (!task) {
      throw new AppError('任务不存在', 404);
    }

    // 权限验证
    if (userId && task.userId !== userId) {
      throw new AppError('无权访问此任务', 403);
    }

    return task;
  }

  /**
   * 🔥 获取视频内容URL（精简版）
   *
   * 由于精简版不存储 videoUrl，这个方法主要用于：
   * 1. 构建外部API的内容URL
   * 2. 前端可以直接使用 externalTaskId 构建URL
   */
  async getVideoContent(videoId: string, userId: string): Promise<string> {
    const task = await this.getVideoTask(videoId, userId);

    if (task.status !== TaskStatus.COMPLETED) {
      throw new AppError('任务未完成', 400);
    }

    // 🔥 精简版：使用 externalTaskId 构建URL
    const externalTaskId = task.externalTaskId;

    if (externalTaskId) {
      const apiConfig = API_CONFIGS.find(cfg => cfg.id === task.apiConfigId) || API_CONFIGS[0];
      return `${apiConfig.baseUrl}/v1/videos/${externalTaskId}/content`;
    }

    throw new AppError('缺少外部任务ID', 500);
  }

  /**
   * 获取用户的视频任务列表
   */
  async listUserVideoTasks(userId: string, options: any = {}): Promise<{
    tasks: any[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const result = await videoTaskRepository.listUserTasks({
      userId,
      limit,
      offset,
      orderBy: 'createdAt',
      order: 'desc',
    });

    return {
      tasks: result.tasks,
      total: result.total,
      page,
      pageSize: limit,
    };
  }

  /**
   * 删除任务
   */
  async deleteVideoTask(videoId: string, userId: string): Promise<void> {
    const task = await this.getVideoTask(videoId, userId);

    // 使用 Prisma 直接删除
    await videoTaskRepository.updateTask(videoId, {
      status: TaskStatus.CANCELLED,
    });

    console.log(`[VideoTaskService] 🗑️ 任务已删除: ${videoId}`);
  }

  /**
   * 生成 UUID
   */
  private generateUUID(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}

export const videoTaskService = new VideoTaskService();
