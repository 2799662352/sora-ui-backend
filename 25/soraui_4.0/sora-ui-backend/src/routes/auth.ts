// src/routes/auth.ts
// 认证 API 路由

import express from 'express';
import { authService } from '../services/authService';
import { APIResponse, AuthSession } from '../types';

const router = express.Router();

/**
 * POST /api/auth/register - 用户注册
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 参数验证
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空',
      } as APIResponse);
    }

    const user = await authService.register(username, email, password);

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    } as APIResponse);
  } catch (error: any) {
    console.error('注册失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '注册失败',
    } as APIResponse);
  }
});

/**
 * POST /api/auth/login - 用户登录
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 参数验证
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空',
      } as APIResponse);
    }

    const session = await authService.login(username, password);

    res.json({
      success: true,
      data: session,
    } as APIResponse<AuthSession>);
  } catch (error: any) {
    console.error('登录失败:', error);
    res.status(401).json({
      success: false,
      message: error.message || '登录失败',
    } as APIResponse);
  }
});

/**
 * POST /api/auth/verify - 验证 Token
 */
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token 不能为空',
      } as APIResponse);
    }

    const user = authService.verifyToken(token);

    res.json({
      success: true,
      data: user,
    } as APIResponse);
  } catch (error: any) {
    console.error('Token 验证失败:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Token 无效',
    } as APIResponse);
  }
});

/**
 * POST /api/auth/logout - 用户登出（客户端清除 Token）
 */
router.post('/logout', async (req, res) => {
  // 服务端无状态，登出由客户端处理
  res.json({
    success: true,
    message: '登出成功',
  } as APIResponse);
});

export default router;

