// src/utils/errors.ts
// 统一错误处理
// 学习自: express-boilerplate (错误处理最佳实践)

/**
 * 基础应用错误类
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 验证错误 (400)
 */
export class ValidationError extends AppError {
  constructor(message: string = '验证失败') {
    super(message, 400);
  }
}

/**
 * 认证错误 (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = '认证失败') {
    super(message, 401);
  }
}

/**
 * 授权错误 (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = '权限不足') {
    super(message, 403);
  }
}

/**
 * 资源未找到 (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string = '资源未找到') {
    super(message, 404);
  }
}

/**
 * 冲突错误 (409)
 */
export class ConflictError extends AppError {
  constructor(message: string = '资源冲突') {
    super(message, 409);
  }
}

/**
 * 业务逻辑错误 (422)
 */
export class BusinessLogicError extends AppError {
  constructor(message: string) {
    super(message, 422);
  }
}

/**
 * 内部服务器错误 (500)
 */
export class InternalServerError extends AppError {
  constructor(message: string = '服务器内部错误') {
    super(message, 500, false);
  }
}

/**
 * 错误响应格式化
 */
export const formatErrorResponse = (error: AppError | Error) => {
  if (error instanceof AppError) {
    return {
      success: false,
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  // 未知错误
  return {
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : error.message,
    statusCode: 500,
  };
};

