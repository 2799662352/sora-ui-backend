// src/repositories/activityLogRepository.ts
// 活动日志数据访问层

import { ActivityLog, Prisma } from '@prisma/client';
import { db } from '../loaders/prisma';

/**
 * 活动日志仓储
 */
export class ActivityLogRepository {
  /**
   * 创建日志
   */
  async create(data: {
    userId?: string;
    action: string;
    details?: any;
    ip?: string;
    userAgent?: string;
  }): Promise<ActivityLog> {
    return db.activityLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        details: data.details || {},
        ip: data.ip,
        userAgent: data.userAgent,
      },
    });
  }

  /**
   * 根据用户ID获取日志
   */
  async findByUserId(
    userId: string,
    options?: {
      skip?: number;
      take?: number;
      action?: string;
    }
  ): Promise<{ logs: ActivityLog[]; total: number }> {
    const where: Prisma.ActivityLogWhereInput = {
      userId,
      ...(options?.action && { action: options.action }),
    };

    const [logs, total] = await Promise.all([
      db.activityLog.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      db.activityLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * 获取所有日志（管理员功能）
   */
  async findAll(options?: {
    skip?: number;
    take?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ logs: ActivityLog[]; total: number }> {
    const where: Prisma.ActivityLogWhereInput = {
      ...(options?.action && { action: options.action }),
      ...(options?.startDate && {
        createdAt: {
          gte: options.startDate,
        },
      }),
      ...(options?.endDate && {
        createdAt: {
          lte: options.endDate,
        },
      }),
    };

    const [logs, total] = await Promise.all([
      db.activityLog.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      db.activityLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * 统计操作次数
   */
  async countByAction(action: string): Promise<number> {
    return db.activityLog.count({
      where: { action },
    });
  }

  /**
   * 获取用户最近的操作
   */
  async getRecentActivities(
    userId: string,
    limit: number = 10
  ): Promise<ActivityLog[]> {
    return db.activityLog.findMany({
      where: { userId },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * 删除旧日志（清理）
   */
  async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await db.activityLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}

// 导出单例
export const activityLogRepository = new ActivityLogRepository();

