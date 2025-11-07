// src/routes/admin.ts
// 管理后台 API - 查看用户、日志、统计数据

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logService } from '../services/logService';
import { APIResponse } from '../types';

const router = Router();
const prisma = new PrismaClient();

// 使用标准的 JWT 认证中间件
import { authMiddleware } from '../middleware/auth';

// 应用 JWT 认证到所有路由
router.use(authMiddleware);

/**
 * GET /api/admin/users
 * 获取所有用户列表
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const skip = (page - 1) * pageSize;
    
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLogin: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
      }),
      prisma.user.count(),
    ]);

    const response: APIResponse = {
      success: true,
      data: {
        items: users,  // 改为 items
        total,
        page,
        pageSize,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('[Admin] 获取用户列表失败:', error);
    const response: APIResponse = {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '获取用户列表失败',
      },
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/admin/users/:id
 * 获取单个用户详情
 */
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        license: true,
        logs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
        },
      },
    });

    if (!user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '用户不存在',
        },
      };
      return res.status(404).json(response);
    }

    const response: APIResponse = {
      success: true,
      data: { user },
    };

    res.json(response);
  } catch (error: any) {
    console.error('[Admin] 获取用户详情失败:', error);
    const response: APIResponse = {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '获取用户详情失败',
      },
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/admin/licenses
 * 获取所有许可证列表
 */
router.get('/licenses', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const skip = (page - 1) * pageSize;
    
    const [licenses, total] = await Promise.all([
      prisma.license.findMany({
        include: {
          user: {
            select: {
              username: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
      }),
      prisma.license.count(),
    ]);

    const response: APIResponse = {
      success: true,
      data: {
        items: licenses,  // 改为 items
        total,
        page,
        pageSize,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('[Admin] 获取许可证列表失败:', error);
    const response: APIResponse = {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '获取许可证列表失败',
      },
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/admin/logs
 * 获取所有活动日志
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const skip = (page - 1) * pageSize;
    const action = req.query.action as string;
    
    const where: any = action ? { action } : {};
    
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          user: {
            select: {
              username: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
      }),
      prisma.activityLog.count({ where }),
    ]);

    const response: APIResponse = {
      success: true,
      data: {
        items: logs,  // 改为 items
        total,
        page,
        pageSize,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('[Admin] 获取日志列表失败:', error);
    const response: APIResponse = {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '获取日志列表失败',
      },
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/admin/stats
 * 获取系统统计数据
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await logService.getStats();

    // 获取许可证统计
    const [totalLicenses, activeLicenses, trialLicenses, premiumLicenses] = await Promise.all([
      prisma.license.count(),
      prisma.license.count({
        where: {
          isActive: true,
        },
      }),
      prisma.license.count({
        where: {
          type: 'TRIAL',
        },
      }),
      prisma.license.count({
        where: {
          type: 'PRO',
        },
      }),
    ]);

    const response: APIResponse = {
      success: true,
      data: {
        users: {
          total: stats.totalUsers,
          registeredToday: stats.registerCount,
        },
        licenses: {
          total: totalLicenses,
          active: activeLicenses,
          trial: trialLicenses,
          premium: premiumLicenses,
        },
        activity: {
          totalLogs: stats.totalLogs,
          todayLogs: stats.todayLogs,
          loginCount: stats.loginCount,
        },
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('[Admin] 获取统计数据失败:', error);
    const response: APIResponse = {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '获取统计数据失败',
      },
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/admin/users/:id/ban
 * 封禁/解封用户
 */
router.post('/users/:id/ban', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { banned } = req.body; // true = 封禁, false = 解封

    const user = await prisma.user.update({
      where: { id },
      data: {
        isActive: !banned,
      },
    });

    const response: APIResponse = {
      success: true,
      data: {
        user,
        message: banned ? '用户已封禁' : '用户已解封',
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('[Admin] 封禁用户失败:', error);
    const response: APIResponse = {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '封禁用户失败',
      },
    };
    res.status(500).json(response);
  }
});

export default router;

