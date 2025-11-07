// src/services/logService.ts
// 日志服务 - 记录用户行为和系统事件

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 日志服务类
 * 用于记录用户行为、系统事件等
 */
export class LogService {
  /**
   * 记录用户登录
   */
  async logLogin(userId: string, details?: Record<string, any>) {
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          action: 'login',
          details: details || {},
        },
      });
    } catch (error) {
      console.error('[LogService] 记录登录失败:', error);
      // 日志失败不影响主流程
    }
  }

  /**
   * 记录用户注册
   */
  async logRegister(userId: string, username: string, details?: Record<string, any>) {
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          action: 'register',
          details: {
            username,
            ...details,
          },
        },
      });
    } catch (error) {
      console.error('[LogService] 记录注册失败:', error);
    }
  }

  /**
   * 记录许可证激活
   */
  async logLicenseActivation(userId: string, licenseKey: string, details?: Record<string, any>) {
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          action: 'activate_license',
          details: {
            licenseKey,
            ...details,
          },
        },
      });
    } catch (error) {
      console.error('[LogService] 记录许可证激活失败:', error);
    }
  }

  /**
   * 记录视频生成
   */
  async logVideoGeneration(userId: string, details?: Record<string, any>) {
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          action: 'generate_video',
          details: details || {},
        },
      });
    } catch (error) {
      console.error('[LogService] 记录视频生成失败:', error);
    }
  }

  /**
   * 记录通用操作
   */
  async log(userId: string, action: string, details?: Record<string, any>) {
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          action,
          details: details || {},
        },
      });
    } catch (error) {
      console.error(`[LogService] 记录操作失败 (${action}):`, error);
    }
  }

  /**
   * 获取用户的活动日志
   */
  async getUserLogs(userId: string, limit: number = 50) {
    return await prisma.activityLog.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * 获取所有活动日志（管理员使用）
   */
  async getAllLogs(limit: number = 100) {
    return await prisma.activityLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        user: {
          select: {
            username: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * 获取统计数据
   */
  async getStats() {
    const [
      totalUsers,
      totalLogs,
      todayLogs,
      loginCount,
      registerCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.activityLog.count(),
      prisma.activityLog.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.activityLog.count({
        where: {
          action: 'login',
        },
      }),
      prisma.activityLog.count({
        where: {
          action: 'register',
        },
      }),
    ]);

    return {
      totalUsers,
      totalLogs,
      todayLogs,
      loginCount,
      registerCount,
    };
  }
}

// 导出单例
export const logService = new LogService();

