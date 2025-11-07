// src/repositories/userRepository.ts
// 用户数据访问层
// 学习自: bulletproof-nodejs (Repository模式)

import { User, UserRole, Prisma } from '@prisma/client';
import { db } from '../loaders/prisma';
import bcrypt from 'bcrypt';

/**
 * 用户仓储 - 负责所有用户数据操作
 */
export class UserRepository {
  /**
   * 创建用户
   */
  async create(data: {
    username: string;
    email?: string;
    password: string;
    role?: UserRole;
  }): Promise<User> {
    // 加密密码
    const hashedPassword = await bcrypt.hash(data.password, 10);
    
    return db.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: hashedPassword,
        role: data.role || UserRole.USER,
      },
    });
  }

  /**
   * 根据ID查找用户
   */
  async findById(id: string): Promise<User | null> {
    return db.user.findUnique({
      where: { id },
      include: {
        license: true, // 包含许可证信息
      },
    });
  }

  /**
   * 根据用户名查找
   */
  async findByUsername(username: string): Promise<User | null> {
    return db.user.findUnique({
      where: { username },
      include: {
        license: true,
      },
    });
  }

  /**
   * 根据邮箱查找
   */
  async findByEmail(email: string): Promise<User | null> {
    return db.user.findUnique({
      where: { email },
      include: {
        license: true,
      },
    });
  }

  /**
   * 更新用户
   */
  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return db.user.update({
      where: { id },
      data,
    });
  }

  /**
   * 更新最后登录时间
   */
  async updateLastLogin(id: string): Promise<User> {
    return db.user.update({
      where: { id },
      data: {
        lastLogin: new Date(),
      },
    });
  }

  /**
   * 验证密码
   */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  /**
   * 获取所有用户（管理员功能）
   */
  async findAll(options?: {
    skip?: number;
    take?: number;
    role?: UserRole;
  }): Promise<{ users: User[]; total: number }> {
    const where: Prisma.UserWhereInput = options?.role 
      ? { role: options.role }
      : {};

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        include: {
          license: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      db.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * 统计用户数量
   */
  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return db.user.count({ where });
  }

  /**
   * 删除用户（软删除 - 设置为inactive）
   */
  async softDelete(id: string): Promise<User> {
    return db.user.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}

// 导出单例
export const userRepository = new UserRepository();

