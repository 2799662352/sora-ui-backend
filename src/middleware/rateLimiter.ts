// src/middleware/rateLimiter.ts
/**
 * 限流中间件 - 完全基于 One-Hub 源码
 * 
 * 🔥 参考：One-Hub middleware/rate-limit.go (123行)
 * 
 * 核心算法：Redis List 滑动窗口
 * - 使用 LPUSH 添加时间戳
 * - 使用 LLEN 检查请求数
 * - 使用 LINDEX 获取最早请求时间
 * - 使用 LTRIM 清理旧数据
 */

import { Request, Response, NextFunction } from 'express';
import { redisService } from '../services/redisService';

// 🔥 One-Hub line 21-36: 限流配置
const RATE_LIMITS = {
  GLOBAL_API: { max: 300, window: 180 },      // 300 requests / 3 minutes
  GLOBAL_WEB: { max: 180, window: 180 },      // 180 requests / 3 minutes
  UPLOAD: { max: 10, window: 60 },            // 10 uploads / 1 minute
  DOWNLOAD: { max: 10, window: 60 },          // 10 downloads / 1 minute
  CRITICAL: { max: 20, window: 1200 },        // 20 requests / 20 minutes
  // 🆕 协作 API 专用限流 - 更宽松，支持频繁的界面刷新
  COLLAB: { max: 600, window: 60 },           // 600 requests / 1 minute (每秒10个请求)
};

/**
 * 🔥 One-Hub line 38-79: Redis List 滑动窗口限流
 * 
 * 算法：
 * 1. LLEN 获取列表长度
 * 2. 如果 < maxRequests，直接 LPUSH 添加时间戳
 * 3. 如果 >= maxRequests，检查最早的请求时间
 * 4. 如果时间窗口内，拒绝请求（429）
 * 5. 如果时间窗口外，LPUSH + LTRIM 清理旧数据
 */
async function redisRateLimiter(
  clientIP: string,
  maxRequests: number,
  windowSeconds: number,
  mark: string
): Promise<boolean> {
  const key = `rateLimit:${mark}:${clientIP}`;
  
  try {
    // 1️⃣ 获取列表长度
    const listLength = await redisService.llen(key);
    
    if (listLength < maxRequests) {
      // 2️⃣ 未超限，添加时间戳
      await redisService.lpush(key, new Date().toISOString());
      await redisService.expire(key, windowSeconds * 2);  // 🔥 One-Hub: 2倍窗口时间
      return true;  // 允许请求
    }
    
    // 3️⃣ 已达上限，检查最早的请求时间
    const oldestTimeStr = await redisService.lindex(key, -1);
    if (!oldestTimeStr) {
      return true;  // 数据异常，允许请求
    }
    
    const oldestTime = new Date(oldestTimeStr);
    const now = new Date();
    const elapsedSeconds = (now.getTime() - oldestTime.getTime()) / 1000;
    
    if (elapsedSeconds < windowSeconds) {
      // 4️⃣ 仍在时间窗口内，拒绝请求
      await redisService.expire(key, windowSeconds * 2);
      return false;  // 拒绝请求
    }
    
    // 5️⃣ 时间窗口已过，允许请求
    await redisService.lpush(key, now.toISOString());
    await redisService.ltrim(key, 0, maxRequests - 1);  // 🔥 One-Hub: 清理旧数据
    await redisService.expire(key, windowSeconds * 2);
    return true;
    
  } catch (error: any) {
    console.error('[RateLimiter] ❌ Redis 限流失败:', error.message);
    return true;  // Redis 失败时不阻塞请求
  }
}

/**
 * 🔥 One-Hub line 90-102: 限流中间件工厂
 */
export function createRateLimiter(
  maxRequests: number,
  windowSeconds: number,
  mark: string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    
    const allowed = await redisRateLimiter(clientIP, maxRequests, windowSeconds, mark);
    
    if (!allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: `超过限流：${maxRequests} 请求 / ${windowSeconds} 秒`,
        retryAfter: windowSeconds,
      });
    }
    
    next();
  };
}

// 🔥 One-Hub line 104-122: 预定义限流中间件
export const globalAPIRateLimit = createRateLimiter(
  RATE_LIMITS.GLOBAL_API.max,
  RATE_LIMITS.GLOBAL_API.window,
  'GLOBAL_API'
);

export const globalWebRateLimit = createRateLimiter(
  RATE_LIMITS.GLOBAL_WEB.max,
  RATE_LIMITS.GLOBAL_WEB.window,
  'GLOBAL_WEB'
);

export const uploadRateLimit = createRateLimiter(
  RATE_LIMITS.UPLOAD.max,
  RATE_LIMITS.UPLOAD.window,
  'UPLOAD'
);

export const downloadRateLimit = createRateLimiter(
  RATE_LIMITS.DOWNLOAD.max,
  RATE_LIMITS.DOWNLOAD.window,
  'DOWNLOAD'
);

export const criticalRateLimit = createRateLimiter(
  RATE_LIMITS.CRITICAL.max,
  RATE_LIMITS.CRITICAL.window,
  'CRITICAL'
);

// 🆕 协作 API 专用限流
export const collabRateLimit = createRateLimiter(
  RATE_LIMITS.COLLAB.max,
  RATE_LIMITS.COLLAB.window,
  'COLLAB'
);

/**
 * 🔥 Helper: 根据名称获取限流中间件
 */
export function rateLimiter(type: keyof typeof RATE_LIMITS) {
  const config = RATE_LIMITS[type];
  if (!config) {
    console.warn(`[RateLimiter] ⚠️ 未知限流类型: ${type}，使用默认值`);
    return createRateLimiter(100, 60, 'DEFAULT');
  }
  return createRateLimiter(config.max, config.window, type);
}