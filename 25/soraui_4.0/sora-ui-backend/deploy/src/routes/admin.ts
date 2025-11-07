// src/routes/admin.ts
// 管理后台 API - 查看用户、日志、统计数据

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logService } from '../services/logService';
import { APIResponse } from '../types';

const router = Router();
const prisma = new PrismaClient();

/**
 * 简单的 Admin 认证中间件
 * 生产环境应该使用更安全的方式！
 */
const adminAuth = (req: Request, res: Response, next: Function) => {
  const adminKey = req.headers['x-admin-key'];
  
  // 从环境变量读取 Admin Key
  const validAdminKey = process.env.ADMIN_KEY || 'admin-secret-key-2024';
  
  if (adminKey !== validAdminKey) {
    const response: APIResponse = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '无权访问管理接口',
      },
    };
    return res.status(401).json(response);
  }
  
  next();
};

// 应用 Admin 认证到所有路由
router.use(adminAuth);

/**
 * GET /api/admin/users
 * 获取所有用户列表
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
        _count: {
          select: {
            logs: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const response: APIResponse = {
      success: true,
      data: {
        users,
        total: users.length,
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
    const licenses = await prisma.license.findMany({
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
    });

    const response: APIResponse = {
      success: true,
      data: {
        licenses,
        total: licenses.length,
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
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = await logService.getAllLogs(limit);

    const response: APIResponse = {
      success: true,
      data: {
        logs,
        total: logs.length,
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

