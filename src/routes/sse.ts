// src/routes/sse.ts
/**
 * SSE (Server-Sent Events) 路由
 * 
 * 提供实时任务状态推送
 */

import { Router, Response, Request } from 'express';
import { authMiddleware } from '../middleware/auth';
import { authService } from '../services/authService';
import { sseService } from '../services/sseService';
import { getPollingStats } from '../services/taskPollingService-v2';

const router = Router();

/**
 * SSE 连接端点
 * 
 * GET /api/sse/task-updates?token=xxx
 * 
 * 前端使用 EventSource 连接此端点，接收实时任务更新
 * 
 * 注意：EventSource 不支持自定义 HTTP 头，所以 Token 通过 URL 参数传递
 */
router.get('/task-updates', (req: Request, res: Response) => {
  try {
    // 从 URL 参数获取 Token（EventSource 不支持自定义 HTTP 头）
    const token = req.query.token as string;
    
    if (!token) {
      res.status(401).json({ error: '未提供认证 Token' });
      return;
    }
    
    // 验证 Token
    const user = authService.verifyToken(token);
    const userId = user.userId;
    
    if (!userId) {
      res.status(401).json({ error: '无效的用户信息' });
      return;
    }
    
    console.log('[SSE] 📡 用户请求连接:', userId);
    
    // 🔥 n8n: 添加 SSE 连接（传递 req 和 res）
    sseService.addConnection(userId, req, res);
    
    // 注意：不要 res.json() 或 res.end()，保持连接打开
  } catch (error: any) {
    console.error('[SSE] ❌ 认证失败:', error.message);
    res.status(401).json({ error: '认证失败' });
  }
});

/**
 * 获取 SSE 连接统计（调试用）
 * 
 * GET /api/sse/stats
 */
router.get('/stats', authMiddleware, (req: Request, res: Response) => {
  const sseStats = sseService.getStats();
  const pollingStats = getPollingStats();
  
  res.json({
    sse: sseStats,
    polling: pollingStats,
    timestamp: Date.now(),
  });
});

export default router;

