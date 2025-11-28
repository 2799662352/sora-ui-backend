// src/routes/videoTask.ts
// 视频任务 API 路由

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { videoTaskService } from '../services/videoTaskService';
import { videoTaskRepository } from '../repositories/videoTaskRepository';
import { APIResponse } from '../types';
import { AppError } from '../utils/errors';
import { MediaType, TaskStatus } from '@prisma/client';
import { remixSoraVideo } from '../controllers/soraRelayController';

// 扩展 Request 类型以包含 user
interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email?: string;
  };
}

const router = Router();

/**
 * 创建视频任务
 * POST /api/video/tasks
 */
router.post('/tasks', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 收到创建任务请求');
    console.log('用户ID:', req.user?.id);
    console.log('请求体:', JSON.stringify(req.body, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const userId = req.user!.id;
    const {
      prompt,
      model,
      size,
      duration,
      watermark,
      aspectRatio,
      referenceImage,
      apiConfigId,
    } = req.body;

    // 验证必填参数
    if (!prompt || !model) {
      throw new AppError('缺少必填参数: prompt, model', 400);
    }

    console.log('✅ 参数验证通过，开始创建任务...');

    // 🔥 兼容模式：支持旧的后端代理模式（懒人猫后端服务器等）
    // 新架构请使用 POST /api/video/mapping
    
    // 生成唯一的 videoId
    const videoId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // 直接调用 repository 创建任务（精简版）
    const task = await videoTaskRepository.createTask({
      videoId,
      userId,
      externalTaskId: undefined, // 旧模式暂不支持外部API，后续通过 submitAsyncTask 设置
      model,
      apiConfigId: apiConfigId || 'backend-api',
      mediaType: referenceImage ? MediaType.IMAGE : MediaType.VIDEO,
      promptHash: undefined,
      promptPreview: prompt.substring(0, 200),
    });
    
    console.log('[VideoTask] ✅ 任务创建成功:', task.videoId);
    
    // 🔥 异步提交到外部 API（后台处理）
    // 这里应该调用外部API，但为了兼容，暂时只返回任务ID
    // 前端会通过 WebSocket 接收状态更新
    
    res.json({
      success: true,
      data: task,
      message: '任务创建成功（后台处理中）',
    } as APIResponse);
  } catch (error: any) {
    console.error('❌ 创建任务路由错误:', error);
    console.error('   错误类型:', error.constructor.name);
    console.error('   错误消息:', error.message);
    console.error('   错误堆栈:', error.stack);
    next(error);
  }
});

/**
 * 🔥 Remix (视频编辑) 接口
 * POST /api/video/tasks/:videoId/remix
 * 
 * 专门处理 JSON 格式的 Remix 请求
 */
router.post('/tasks/:videoId/remix', authMiddleware, remixSoraVideo as any);

/**
 * 获取单个视频任务详情
 * GET /api/video/tasks/:videoId
 */
router.get('/tasks/:videoId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { videoId } = req.params;

    const task = await videoTaskService.getVideoTask(videoId, userId);

    res.json({
      success: true,
      data: task,
    } as APIResponse);
  } catch (error) {
    next(error);
  }
});

/**
 * 获取视频内容 URL
 * GET /api/video/tasks/:videoId/content
 */
router.get('/tasks/:videoId/content', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { videoId } = req.params;

    const task = await videoTaskService.getVideoTask(videoId, userId);
    const contentUrl = await videoTaskService.getVideoContent(videoId, userId);
    
    // 🔥 精简版：直接使用 externalTaskId 字段
    const externalVideoId = task.externalTaskId;

    res.json({
      success: true,
      data: {
        videoId,              // 后端数据库 ID
        externalVideoId,      // 外部 Sora API ID（用于直接访问外部资源）
        url: contentUrl,      // 完整的视频 URL（来自外部API）
      },
    } as APIResponse);
  } catch (error) {
    next(error);
  }
});

/**
 * 重新获取视频 URL（刷新）
 * POST /api/video/tasks/:videoId/refresh-url
 */
router.post('/tasks/:videoId/refresh-url', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { videoId } = req.params;

    // 🔥 精简版：此功能已废弃
    throw new AppError('此功能已废弃（精简架构）', 400);
  } catch (error) {
    next(error);
  }
});

/**
 * 🔥 BUG-003 修复：通过 clientRequestId 批量恢复任务
 * POST /api/video/tasks/recover
 * 
 * 用途：前端重启后，使用本地 generating 任务的 clientRequestId 查询后端
 * 返回匹配的任务列表，前端可以用来更新本地任务的 backendVideoId
 */
router.post('/tasks/recover', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { clientRequestIds } = req.body;
    
    console.log(`[VideoTask] 🔄 任务恢复请求: ${clientRequestIds?.length || 0} 个 clientRequestId`);
    
    if (!clientRequestIds || !Array.isArray(clientRequestIds) || clientRequestIds.length === 0) {
      return res.json({
        success: true,
        data: { tasks: [], matched: 0 },
        message: '没有需要恢复的任务',
      } as APIResponse);
    }
    
    // 限制一次最多查询 50 个
    const limitedIds = clientRequestIds.slice(0, 50);
    
    const tasks = await videoTaskRepository.findByClientRequestIds(limitedIds, userId);
    
    // 转换为前端需要的格式
    const result = tasks.map(task => ({
      clientRequestId: task.clientRequestId,
      videoId: task.videoId,
      externalTaskId: task.externalTaskId,
      status: task.status,
      progress: task.progress,
      videoUrl: task.videoUrl,
      imageUrl: task.imageUrl,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));
    
    console.log(`[VideoTask] ✅ 恢复任务: ${result.length} / ${limitedIds.length} 匹配`);
    
    res.json({
      success: true,
      data: {
        tasks: result,
        matched: result.length,
        requested: limitedIds.length,
      },
    } as APIResponse);
  } catch (error: any) {
    console.error('[VideoTask] ❌ 任务恢复失败:', error.message);
    next(error);
  }
});

/**
 * 获取用户的视频任务列表
 * GET /api/video/tasks
 * 
 * 🔑 权限逻辑：
 * - 普通用户：只能看到自己的任务
 * - 管理员（ADMIN）：可以看到所有用户的任务
 */
router.get('/tasks', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const userRole = (user as any).role;
    const {
      status,
      mediaType,
      page = '1',
      pageSize = '20',
      orderBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limit = parseInt(pageSize as string, 10);
    const offset = (pageNum - 1) * limit;

    let result;
    
    // 🔑 管理员可以看到所有任务，普通用户只能看到自己的
    const userId = req.user!.id;
    
    if (userRole === 'ADMIN') {
      console.log('[Route] 👑 管理员查询所有任务');
      // 🔥 精简版：管理员查询时不传 userId 过滤
      result = await videoTaskService.listUserVideoTasks(userId, {
        status: status as any,
        mediaType: mediaType as any,
        limit,
        offset,
        orderBy: orderBy as any,
        order: order as any,
      });
    } else {
      console.log('[Route] 👤 普通用户查询自己的任务:', userId);
      result = await videoTaskService.listUserVideoTasks(user.id, {
        status: status as any,
        mediaType: mediaType as any,
        limit,
        offset,
        orderBy: orderBy as any,
        order: order as any,
      });
    }

    res.json({
      success: true,
      data: result,
    } as APIResponse);
  } catch (error) {
    next(error);
  }
});

/**
 * 获取任务统计信息（基础）
 * GET /api/video/stats
 */
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    // 🔥 精简版：此功能已废弃
    throw new AppError('此功能已废弃（精简架构）', 400);
  } catch (error) {
    next(error);
  }
});

/**
 * 获取增强的任务统计信息（含成功率、平均时长等）
 * GET /api/video/stats/enhanced
 * 
 * 查询参数：
 * - startDate (可选): 开始日期 (ISO 8601 格式)
 * - endDate (可选): 结束日期 (ISO 8601 格式)
 */
router.get('/stats/enhanced', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate } = req.query;

    let dateRange: { start: Date; end: Date } | undefined;
    if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string),
      };
    }

    // 🔥 精简版：此功能已废弃
    throw new AppError('此功能已废弃（精简架构）', 400);
  } catch (error) {
    next(error);
  }
});

/**
 * 获取全局统计信息（管理员专用）
 * GET /api/video/stats/global
 * 
 * 查询参数：
 * - startDate (可选): 开始日期 (ISO 8601 格式)
 * - endDate (可选): 结束日期 (ISO 8601 格式)
 * 
 * 权限：仅限管理员
 */
router.get('/stats/global', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;

    // 检查管理员权限
    if (user && (user as any).role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: '权限不足：需要管理员权限',
      } as APIResponse);
    }

    const { startDate, endDate } = req.query;

    let dateRange: { start: Date; end: Date } | undefined;
    if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string),
      };
    }

    // 🔥 精简版：此功能已废弃
    throw new AppError('此功能已废弃（精简架构）', 400);
  } catch (error) {
    next(error);
  }
});

/**
 * 🔥 重试失败的任务（基于 n8n executions.store.ts 第249-261行）
 * POST /api/video/tasks/:videoId/retry
 * 
 * 参考：n8n的手动retry机制
 * - 用户点击retry按钮触发
 * - 重新提交到外部API
 * - 返回新任务状态
 */
router.post('/tasks/:videoId/retry', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { videoId } = req.params;
    const userId = req.user!.id;
    
    console.log(`[VideoTask] 🔄 用户手动重试任务: ${videoId}`);
    
    // 1️⃣ 获取原始任务
    const originalTask = await videoTaskRepository.getTask(videoId);
    
    if (!originalTask) {
      return res.status(404).json({
        success: false,
        error: '任务不存在',
      } as APIResponse);
    }
    
    if (originalTask.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: '无权访问此任务',
      } as APIResponse);
    }
    
    console.log(`[VideoTask] 原始任务信息:`);
    console.log(`  - prompt: ${originalTask.prompt?.substring(0, 50)}...`);
    console.log(`  - model: ${originalTask.model}`);
    console.log(`  - status: ${originalTask.status}`);
    
    // 2️⃣ 重新提交到外部API
    const { API_CONFIGS } = require('../services/videoTaskService');
    const config = API_CONFIGS.find((c: any) => c.id === originalTask.apiConfigId) || API_CONFIGS[0];
    
    const FormData = require('form-data');
    const axios = require('axios');
    const formData = new FormData();
    formData.append('prompt', originalTask.prompt);
    formData.append('model', originalTask.model || 'sora_video2');
    if (originalTask.size) formData.append('size', originalTask.size);
    if (originalTask.duration) formData.append('seconds', originalTask.duration.toString());
    if (originalTask.aspectRatio) formData.append('aspect_ratio', originalTask.aspectRatio);
    
    console.log(`[VideoTask] 📤 重新提交到外部API: ${config.baseUrl}/sora/v1/videos`);
    
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
    console.log(`[VideoTask] ✅ 重新提交成功，新任务ID: ${newExternalTaskId}`);
    
    // 3️⃣ 更新任务（重置状态，基于n8n模式）
    await videoTaskRepository.updateTask(videoId, {
      externalTaskId: newExternalTaskId,
      status: TaskStatus.PROCESSING,
      progress: 0,
      errorMessage: undefined,
      errorCode: undefined,
      videoUrl: undefined,
      imageUrl: undefined,
    });
    
    // 4️⃣ 重新启动轮询
    const { startTaskPolling } = require('../services/taskPollingService');
    startTaskPolling({
      videoId,
      externalTaskId: newExternalTaskId,
      apiConfigId: originalTask.apiConfigId,
      userId,
    });
    
    console.log(`[VideoTask] ✅ 重试任务已启动，继续轮询...`);
    
    // 5️⃣ 返回更新后的任务
    const updatedTask = await videoTaskRepository.getTask(videoId);
    
    res.json({
      success: true,
      data: updatedTask,
      message: '任务已重新提交，正在处理中',
    } as APIResponse);
    
  } catch (error: any) {
    console.error('[VideoTask] ❌ 重试失败:', error.message);
    next(error);
  }
});

/**
 * 取消视频任务
 * POST /api/video/tasks/:videoId/cancel
 */
router.post('/tasks/:videoId/cancel', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { videoId } = req.params;

    // 🔥 精简版：使用 deleteVideoTask
    await videoTaskService.deleteVideoTask(videoId, userId);
    const task = await videoTaskService.getVideoTask(videoId, userId);

    res.json({
      success: true,
      data: task,
      message: '任务已取消',
    } as APIResponse);
  } catch (error) {
    next(error);
  }
});

/**
 * 通过外部API的video_id直接获取video_url
 * GET /api/video/external/:externalVideoId/url
 * 
 * 说明：
 * - 允许前端绕过后端数据库，直接查询外部API获取视频URL
 * - 适用于需要实时获取最新URL的场景（如URL过期、刷新等）
 * 
 * 查询参数：
 * - apiConfigId (可选): 指定使用哪个API配置，默认使用第一个
 */
router.get('/external/:externalVideoId/url', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { externalVideoId } = req.params;
    const { apiConfigId } = req.query;

    console.log(`[Route] 📥 收到外部ID查询请求: ${externalVideoId}`);
    if (apiConfigId) {
      console.log(`[Route] 使用指定API配置: ${apiConfigId}`);
    }

    // 🔥 精简版：此功能已废弃
    throw new AppError('此功能已废弃（精简架构）', 400);
  } catch (error: any) {
    console.error(`[Route] ❌ 获取视频URL失败:`, error.message);
    next(error);
  }
});

/**
 * Webhook 接口 - 接收外部 API 的任务状态更新（可选）
 * POST /api/video/webhook
 */
router.post('/webhook', async (req, res, next) => {
  try {
    // 验证 webhook 签名（根据实际 API 的要求实现）
    // const signature = req.headers['x-webhook-signature'];
    // if (!verifyWebhookSignature(req.body, signature)) {
    //   throw new APIError('无效的签名', 401);
    // }

    const { videoId, status, progress, error } = req.body;

    // 这里可以根据 webhook 数据更新任务状态
    // 实际实现需要根据 API 提供的 webhook 格式调整

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// 错误处理中间件
router.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    } as APIResponse);
  } else {
    console.error('视频任务路由错误:', err);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
    } as APIResponse);
  }
});

export default router;
