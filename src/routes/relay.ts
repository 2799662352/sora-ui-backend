// src/routes/relay.ts
/**
 * 🔥 Relay 转发路由
 * 
 * 完全参考 One Hub relay router
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { relayVideoGeneration, relayTaskQuery } from '../controllers/relayController';

const router = Router();

/**
 * 🔥 转发视频生成请求
 * 
 * 中间件链（参考 One Hub）：
 * 1. authMiddleware - 认证
 * 2. rateLimiter - 限流
 * 3. relayController - 转发
 */
router.post('/v1/videos', 
  authMiddleware,
  rateLimiter('CRITICAL'), // 🔥 使用更严格的限流
  relayVideoGeneration
);

/**
 * 🔥 转发任务查询请求
 */
router.get('/v1/videos/:taskId',
  authMiddleware,
  relayTaskQuery
);

export default router;


