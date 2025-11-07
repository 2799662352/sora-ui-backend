// src/middleware/auth.ts
// JWT 认证中间件

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { APIResponse } from '../types';

/**
 * JWT 认证中间件
 * 验证请求头中的 Authorization Token
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 从请求头获取 Token
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: '未提供认证 Token',
      } as APIResponse);
    }

    // Bearer Token 格式
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    // 验证 Token
    const user = authService.verifyToken(token);

    // 将用户信息附加到请求对象
    (req as any).user = user;

    next();
  } catch (error: any) {
    console.error('认证失败:', error);
    res.status(401).json({
      success: false,
      message: error.message || '认证失败',
    } as APIResponse);
  }
};

