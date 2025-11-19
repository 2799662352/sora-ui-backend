// src/routes/apiKey.ts
// 🔥 API 密钥分发服务（精简架构）
// 
// 功能：
// 1. 为前端提供 API 密钥（前端直接调用外部API）
// 2. 管理多个 API 配置
// 3. 权限控制和使用限额

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

// 扩展 Request 类型
interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

const router = Router();
const prisma = new PrismaClient();

// 🔥 API 配置列表（从 videoTaskService 导入）
import { API_CONFIGS as SERVICE_CONFIGS } from '../services/videoTaskService';
import { startTaskPolling } from '../services/taskPollingService-v2';

// 使用服务中定义的配置
const API_CONFIGS = SERVICE_CONFIGS;

/**
 * 🔥 获取 API 密钥
 * 
 * GET /api/api-key/:configId?
 * 
 * 功能：
 * - 返回指定配置的 API 密钥
 * - 前端用此密钥直接调用外部API
 * - 只在 Electron 环境中安全使用
 */
router.get('/api-key/:configId?', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const configId = req.params.configId || API_CONFIGS[0]?.id;
    
    if (!configId) {
      return res.status(400).json({ error: '未指定 API 配置' });
    }
    
    // 查找配置
    const config = API_CONFIGS.find(c => c.id === configId);
    
    if (!config) {
      return res.status(404).json({ error: 'API 配置不存在' });
    }
    
    if (!config.enabled) {
      return res.status(403).json({ error: 'API 配置已禁用' });
    }
    
    // 🔒 权限检查：只有认证用户才能获取密钥
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }
    
    console.log(`[API Key] 用户 ${req.user!.username} 获取密钥: ${configId}`);
    
    // 返回 API 配置（包括密钥）
    res.json({
      success: true,
      config: {
        id: config.id,
        name: config.name,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,  // ⚠️ 只在 Electron 中安全
        model: config.model,
      },
    });
  } catch (error: any) {
    console.error('[API Key] 获取密钥失败:', error);
    res.status(500).json({ error: '获取密钥失败' });
  }
});

/**
 * 🔥 获取所有可用的 API 配置列表（不含密钥）
 * 
 * GET /api/api-configs
 */
router.get('/api-configs', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // 返回配置列表（隐藏密钥）
    const configs = API_CONFIGS
      .filter(c => c.enabled)
      .map(c => ({
        id: c.id,
        name: c.name,
        model: c.model,
        // 不返回 apiKey 和 baseUrl
      }));
    
    res.json({
      success: true,
      configs,
    });
  } catch (error: any) {
    console.error('[API Key] 获取配置列表失败:', error);
    res.status(500).json({ error: '获取配置列表失败' });
  }
});

/**
 * 🔥 创建任务映射（精简版）
 * 
 * POST /api/video/mapping
 * 
 * 接收：只接收核心ID和状态，不接收大额数据
 */
router.post('/video/mapping', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { 
      videoId, 
      externalTaskId, 
      apiConfigId, 
      model,
      mediaType = 'VIDEO',
      promptHash,
      promptPreview,
    } = req.body;
    
    // 验证必需字段
    if (!videoId || !externalTaskId) {
      return res.status(400).json({ error: '缺少必需字段: videoId 或 externalTaskId' });
    }
    
    // 🔥 只存储核心映射（不存大额数据）
    const task = await prisma.videoTask.create({
      data: {
        videoId,
        externalTaskId,
        apiConfigId,
        model: model || 'unknown',
        mediaType,
        promptHash,
        promptPreview: promptPreview?.substring(0, 200), // 只存前200字符
        status: 'PROCESSING',
        progress: 0,
        userId: req.user!.id,
      },
    });
    
    console.log(`[Task Mapping] ✅ 创建任务映射: ${videoId} → ${externalTaskId}`);
    
    // 🔥 启动后台轮询（自动查询外部 API 并通过 SSE 推送）
    if (task.externalTaskId && task.apiConfigId) {
      startTaskPolling({
        videoId: task.videoId,
        externalTaskId: task.externalTaskId,
        apiConfigId: task.apiConfigId,
        userId: req.user!.id,
      });
      console.log(`[Task Mapping] 🔄 已启动后台轮询: ${videoId}`);
    } else {
      console.warn(`[Task Mapping] ⚠️  缺少必要信息，跳过轮询: ${videoId}`);
    }
    
    res.json({
      success: true,
      taskId: task.id,
      videoId: task.videoId,
      message: '任务已创建，后台轮询已启动',
    });
  } catch (error: any) {
    console.error('[Task Mapping] ❌ 创建映射失败:', error);
    
    // 处理重复键错误
    if (error.code === 'P2002') {
      return res.status(409).json({ error: '任务已存在' });
    }
    
    res.status(500).json({ error: '创建任务映射失败' });
  }
});

/**
 * 🔥 获取任务状态（精简版）
 * 
 * GET /api/video/:videoId/status
 * 
 * 返回：只返回核心状态，不返回大额数据
 */
router.get('/video/:videoId/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { videoId } = req.params;
    
    const task = await prisma.videoTask.findUnique({
      where: { videoId },
      select: {
        videoId: true,
        externalTaskId: true,
        status: true,
        progress: true,
        model: true,
        apiConfigId: true,
        mediaType: true,
        errorCode: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    });
    
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    
    // 验证权限
    const fullTask = await prisma.videoTask.findUnique({
      where: { videoId },
      include: { user: true },
    });
    
    if (!fullTask || (fullTask.userId !== req.user!.id && req.user!.role !== 'ADMIN')) {
      return res.status(403).json({ error: '无权访问此任务' });
    }
    
    res.json({
      success: true,
      task,
    });
  } catch (error: any) {
    console.error('[Task Status] ❌ 查询失败:', error);
    res.status(500).json({ error: '查询任务状态失败' });
  }
});

/**
 * 🔥 获取任务列表（精简版）
 * 
 * GET /api/video/list
 * 
 * 返回：只返回核心信息，用于任务管理
 */
router.get('/video/list', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    
    // 只查询当前用户的任务（非管理员）
    const where = req.user!.role === 'ADMIN' 
      ? {} 
      : { userId: req.user!.id };
    
    const [tasks, total] = await Promise.all([
      prisma.videoTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          videoId: true,
          externalTaskId: true,
          status: true,
          progress: true,
          model: true,
          apiConfigId: true,
          mediaType: true,
          promptPreview: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.videoTask.count({ where }),
    ]);
    
    res.json({
      success: true,
      tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[Task List] ❌ 查询失败:', error);
    res.status(500).json({ error: '查询任务列表失败' });
  }
});

/**
 * 🔥 更新任务状态（精简版）
 * 
 * PATCH /api/video/:videoId/status
 * 
 * 只更新状态字段，不更新大额数据
 */
router.patch('/video/:videoId/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { videoId } = req.params;
    const { status, progress, errorCode, errorMessage } = req.body;
    
    // 验证任务存在和权限
    const task = await prisma.videoTask.findUnique({
      where: { videoId },
      include: { user: true },
    });
    
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    
    if (task.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: '无权访问此任务' });
    }
    
    // 更新任务状态
    const updatedTask = await prisma.videoTask.update({
      where: { videoId },
      data: {
        status,
        progress,
        errorCode,
        errorMessage,
        completedAt: (status === 'COMPLETED' || status === 'FAILED') 
          ? new Date() 
          : undefined,
      },
    });
    
    console.log(`[Task Status] ✅ 更新任务: ${videoId} → ${status} (${progress}%)`);
    
    res.json({
      success: true,
      task: {
        videoId: updatedTask.videoId,
        status: updatedTask.status,
        progress: updatedTask.progress,
      },
    });
  } catch (error: any) {
    console.error('[Task Status] ❌ 更新失败:', error);
    res.status(500).json({ error: '更新任务状态失败' });
  }
});

export default router;

