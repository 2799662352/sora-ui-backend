// src/services/authService.ts
// 认证服务 - JWT Token 生成和验证

import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { AuthSession } from '../types';
import { userRepository } from '../repositories/userRepository';
import { logService } from './logService';
import crypto from 'crypto';

const JWT_SECRET: string = process.env.JWT_SECRET || 'default-secret-key';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export class AuthService {
  /**
   * 用户注册
   */
  async register(username: string, email: string, password: string) {
    // 检查用户是否已存在
    const existingUser = await userRepository.findByUsername(username);
    
    if (existingUser) {
      throw new Error('用户名已存在');
    }

    // 创建用户（Repository 会自动加密密码）
    const user = await userRepository.create({
      username,
      email,
      password,
    });

    // 记录注册日志
    await logService.logRegister(user.id, username, { email });

    console.log(`✅ 用户注册成功: ${username}`);
    return user;
  }

  /**
   * 用户登录
   */
  async login(username: string, password: string): Promise<AuthSession> {
    // 查找用户
    const user = await userRepository.findByUsername(username);

    if (!user) {
      throw new Error('用户名或密码错误');
    }

    // 验证密码（Repository 提供的方法）
    const validPassword = await userRepository.verifyPassword(user, password);
    if (!validPassword) {
      throw new Error('用户名或密码错误');
    }

    // 更新最后登录时间
    await userRepository.updateLastLogin(user.id);

    // 记录登录日志
    await logService.logLogin(user.id, { username });

    // 生成 JWT Token
    const token = jwt.sign(
      { 
        userId: user.id,
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    // 计算过期时间
    const expiresIn = this.parseExpiresIn(JWT_EXPIRES_IN);
    const expiresAt = Date.now() + expiresIn;

    console.log(`✅ 用户登录成功: ${username}`);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || '',
      },
      expiresAt,
    };
  }

  /**
   * 验证 Token
   */
  verifyToken(token: string): { userId: string; username: string } {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return {
        userId: decoded.userId,
        username: decoded.username,
      };
    } catch (error) {
      throw new Error('Token 无效或已过期');
    }
  }

  /**
   * 解析过期时间（如 "7d" -> 毫秒数）
   */
  private parseExpiresIn(expiresIn: string): number {
    const units: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000; // 默认 7 天
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }
}

export const authService = new AuthService();
