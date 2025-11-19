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

/**
 * 管理员权限检查中间件
 * 必须在 authMiddleware 之后使用
 */
export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '未认证',
      } as APIResponse);
    }

    // 检查用户角色是否为管理员
    if (user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: '权限不足：需要管理员权限',
      } as APIResponse);
    }

    next();
  } catch (error: any) {
    console.error('权限检查失败:', error);
    res.status(403).json({
      success: false,
      message: error.message || '权限检查失败',
    } as APIResponse);
  }
};

