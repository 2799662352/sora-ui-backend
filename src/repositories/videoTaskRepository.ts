// src/repositories/videoTaskRepository.ts
// 视频任务数据访问层

import { PrismaClient, VideoTask, TaskStatus, MediaType, Prisma } from '@prisma/client';
import { db } from '../loaders/prisma';
import { redisService } from '../services/redisService';

const prisma = db;

// 🔥 精简版：只包含核心字段
export interface CreateVideoTaskDto {
  videoId: string;
  userId: string;
  externalTaskId?: string;
  model: string;
  apiConfigId?: string;
  mediaType?: MediaType;
  promptHash?: string;
  promptPreview?: string;
}

// 🔥 精简版：只包含核心状态字段
export interface UpdateVideoTaskDto {
  status?: TaskStatus;
  progress?: number;
  externalTaskId?: string;
  errorCode?: string;
  errorMessage?: string;
  completedAt?: Date;
  videoUrl?: string;
  imageUrl?: string;
}

export interface ListVideoTasksOptions {
  userId?: string;
  status?: TaskStatus;
  mediaType?: MediaType;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'completedAt';
  order?: 'asc' | 'desc';
}

class VideoTaskRepository {
  /**
   * 创建视频任务
   */
  async createTask(data: CreateVideoTaskDto): Promise<VideoTask> {
    try {
      const task = await prisma.videoTask.create({
        data: {
          videoId: data.videoId,
          userId: data.userId,
          externalTaskId: data.externalTaskId,
          model: data.model,
          apiConfigId: data.apiConfigId,
          mediaType: data.mediaType || MediaType.VIDEO,
          promptHash: data.promptHash,
          promptPreview: data.promptPreview,
          status: TaskStatus.QUEUED,
          progress: 0,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });

      console.log(`[VideoTaskRepo] ✅ 创建任务映射: ${task.videoId} → ${task.externalTaskId}`);
      
      // 🔥 Redis: 缓存任务（TTL 1小时）
      await redisService.set(`task:${task.videoId}`, JSON.stringify(task), 'EX', 3600).catch(err => {
        console.error(`[VideoTaskRepo] ⚠️ Redis 缓存失败:`, err);
      });
      
      return task;
    } catch (error) {
      console.error('[VideoTaskRepo] ❌ 创建任务失败', error);
      throw error;
    }
  }

  /**
   * 更新视频任务
   */
  async updateTask(videoId: string, data: UpdateVideoTaskDto): Promise<VideoTask> {
    try {
      // 自动设置 completedAt
      if ((data.status === TaskStatus.COMPLETED || data.status === TaskStatus.FAILED) && !data.completedAt) {
        data.completedAt = new Date();
      }

      const task = await prisma.videoTask.update({
        where: { videoId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      console.log(`[VideoTaskRepo] 更新视频任务: ${videoId}`, { status: data.status, progress: data.progress });
      return task;
    } catch (error) {
      console.error(`[VideoTaskRepo] 更新视频任务失败: ${videoId}`, error);
      throw error;
    }
  }

  /**
   * 获取视频任务详情
   */
  async getTask(videoId: string): Promise<VideoTask | null> {
    try {
      return await prisma.videoTask.findUnique({
        where: { videoId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      console.error(`[VideoTaskRepo] 获取视频任务失败: ${videoId}`, error);
      throw error;
    }
  }

  /**
   * 获取用户的视频任务列表
   */
  async listUserTasks(options: ListVideoTasksOptions): Promise<{ tasks: VideoTask[]; total: number }> {
    try {
      const {
        userId,
        status,
        mediaType,
        limit = 20,
        offset = 0,
        orderBy = 'createdAt',
        order = 'desc',
      } = options;

      // 构建查询条件
      const where: Prisma.VideoTaskWhereInput = {};
      if (userId) where.userId = userId;
      if (status) where.status = status;
      if (mediaType) where.mediaType = mediaType;

      // 获取总数
      const total = await prisma.videoTask.count({ where });

      // 获取任务列表
      const tasks = await prisma.videoTask.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { [orderBy]: order },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });

      return { tasks, total };
    } catch (error) {
      console.error('[VideoTaskRepo] 获取视频任务列表失败', error);
      throw error;
    }
  }

  /**
   * 获取任务统计信息
   */
  async getTaskStats(userId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    processing: number;
    queued: number;
  }> {
    try {
      const [total, completed, failed, processing, queued] = await Promise.all([
        prisma.videoTask.count({ where: { userId } }),
        prisma.videoTask.count({ where: { userId, status: TaskStatus.COMPLETED } }),
        prisma.videoTask.count({ where: { userId, status: TaskStatus.FAILED } }),
        prisma.videoTask.count({ where: { userId, status: TaskStatus.PROCESSING } }),
        prisma.videoTask.count({ where: { userId, status: TaskStatus.QUEUED } }),
      ]);

      return { total, completed, failed, processing, queued };
    } catch (error) {
      console.error(`[VideoTaskRepo] 获取任务统计失败: ${userId}`, error);
      throw error;
    }
  }

  /**
   * 取消视频任务
   */
  async cancelTask(videoId: string, userId: string): Promise<VideoTask> {
    try {
      // 先检查任务是否属于该用户
      const task = await prisma.videoTask.findUnique({
        where: { videoId },
      });

      if (!task) {
        throw new Error('任务不存在');
      }

      if (task.userId !== userId) {
        throw new Error('无权操作此任务');
      }

      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
        throw new Error('任务已结束，无法取消');
      }

      return await this.updateTask(videoId, {
        status: TaskStatus.CANCELLED,
        errorMessage: '用户取消任务',
      });
    } catch (error) {
      console.error(`[VideoTaskRepo] 取消任务失败: ${videoId}`, error);
      throw error;
    }
  }

  /**
   * 🔥 BUG-003 修复：通过 clientRequestId 批量查询任务
   * 用于前端重启后恢复任务状态
   */
  async findByClientRequestIds(clientRequestIds: string[], userId: string): Promise<VideoTask[]> {
    try {
      if (!clientRequestIds || clientRequestIds.length === 0) {
        return [];
      }
      
      console.log(`[VideoTaskRepo] 🔍 查询 clientRequestId:`, clientRequestIds.length, '个');
      
      const tasks = await prisma.videoTask.findMany({
        where: {
          clientRequestId: { in: clientRequestIds },
          userId,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });
      
      console.log(`[VideoTaskRepo] ✅ 找到 ${tasks.length} 个匹配任务`);
      return tasks;
    } catch (error) {
      console.error('[VideoTaskRepo] ❌ 通过 clientRequestId 查询失败:', error);
      throw error;
    }
  }

  /**
   * 清理过期任务（可选）
   */
  async cleanupOldTasks(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await prisma.videoTask.deleteMany({
        where: {
          createdAt: { lte: cutoffDate },
          status: { in: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED] },
        },
      });

      console.log(`[VideoTaskRepo] 清理了 ${result.count} 个过期任务`);
      return result.count;
    } catch (error) {
      console.error('[VideoTaskRepo] 清理过期任务失败', error);
      throw error;
    }
  }
}

export const videoTaskRepository = new VideoTaskRepository();
