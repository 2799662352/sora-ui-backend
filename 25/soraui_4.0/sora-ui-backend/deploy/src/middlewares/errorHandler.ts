// src/middlewares/errorHandler.ts
// 全局错误处理中间件

import { Request, Response, NextFunction } from 'express';
import { AppError, formatErrorResponse } from '../utils/errors';
import { Prisma } from '@prisma/client';

/**
 * 全局错误处理中间件
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 记录错误日志
  console.error('❌ Error:', {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Prisma 错误处理
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(err, res);
  }

  // 自定义应用错误
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(formatErrorResponse(err));
  }

  // 默认错误
  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : err.message,
  });
};

/**
 * 处理 Prisma 错误
 */
const handlePrismaError = (
  err: Prisma.PrismaClientKnownRequestError,
  res: Response
) => {
  switch (err.code) {
    case 'P2002':
      // 唯一约束冲突
      const field = (err.meta?.target as string[])?.[0] || '字段';
      return res.status(409).json({
        success: false,
        message: `${field} 已存在`,
      });

    case 'P2025':
      // 记录未找到
      return res.status(404).json({
        success: false,
        message: '记录未找到',
      });

    case 'P2003':
      // 外键约束失败
      return res.status(400).json({
        success: false,
        message: '关联记录不存在',
      });

    default:
      return res.status(500).json({
        success: false,
        message: '数据库操作失败',
      });
  }
};

/**
 * 404 错误处理
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `路由未找到: ${req.method} ${req.path}`,
  });
};

/**
 * 异步路由错误捕获包装器
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

