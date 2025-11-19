// src/routes/soraRelay.ts
/**
 * 🔥 Sora 视频生成 Relay 路由
 * 
 * 完全参考 LiteLLM Relay 架构
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { relaySoraVideoGeneration, querySoraVideoStatus } from '../controllers/soraRelayController';

const router = Router();

// 🔥 Debug: 记录路由注册
console.log('[SoraRelay-Router] ✅ 路由已注册: POST /videos');

/**
 * 生成视频（完全后端转发）
 * 
 * POST /api/relay/sora/videos
 * Content-Type: multipart/form-data
 * 
 * Body:
 * - prompt: string (required)
 * - model: string (default: sora-2)
 * - size: string (default: 1280x720)
 * - seconds: number (default: 10)
 * - input_reference: file (optional)
 */
router.post('/videos', 
  // 🔥 Debug 中间件
  (req, res, next) => {
    console.log('[SoraRelay-Route] 🎯 收到 POST /videos');
    console.log('  - Content-Type:', req.headers['content-type']);
    console.log('  - Authorization:', req.headers['authorization'] ? '✅ 存在' : '❌ 缺失');
    next();
  },
  // 认证中间件
  authMiddleware,
  // Multer + Controller
  ...relaySoraVideoGeneration
);

/**
 * 查询视频状态
 * 
 * GET /api/relay/sora/videos/:videoId
 */
router.get('/videos/:videoId', querySoraVideoStatus);

export default router;

