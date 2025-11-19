// src/routes/stats.ts
/**
 * 🔥 统计 API（完全参考 LiteLLM）
 * 
 * 功能：
 * - 成本统计
 * - Channel 健康状态
 * - 请求日志查询
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../loaders/prisma';
import { costTrackingService } from '../services/costTrackingService';
import { deploymentHealthService } from '../services/deploymentHealthService';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

/**
 * 🔥 获取总成本统计
 * 
 * GET /api/stats/costs
 */
router.get('/costs', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    
    // 获取用户所有 Channels
    const channels = await prisma.channel.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        totalCost: true,
        spendToday: true,
        spendThisMonth: true,
        totalCalls: true,
      },
    });
    
    // 计算总计
    const totalCost = channels.reduce((sum, ch) => sum + ch.totalCost, 0);
    const todaySpend = channels.reduce((sum, ch) => sum + ch.spendToday, 0);
    const monthSpend = channels.reduce((sum, ch) => sum + ch.spendThisMonth, 0);
    const totalCalls = channels.reduce((sum, ch) => sum + ch.totalCalls, 0);
    
    res.json({
      success: true,
      stats: {
        totalCost,
        spendToday: todaySpend,
        spendThisMonth: monthSpend,
        totalCalls,
        channelCount: channels.length,
        channels: channels.map(ch => ({
          id: ch.id,
          name: ch.name,
          totalCost: ch.totalCost,
          spendToday: ch.spendToday,
          spendThisMonth: ch.spendThisMonth,
          totalCalls: ch.totalCalls,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 🔥 获取 Channel 成本明细
 * 
 * GET /api/stats/costs/:channelId
 */
router.get('/costs/:channelId', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { channelId } = req.params;
    
    // 验证权限
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });
    
    if (!channel || channel.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found',
      });
    }
    
    // 从 Redis 获取实时数据
    const spendToday = await costTrackingService.getSpendToday(channelId);
    const spendThisMonth = await costTrackingService.getSpendThisMonth(channelId);
    
    res.json({
      success: true,
      stats: {
        channelId,
        channelName: channel.name,
        totalCost: channel.totalCost,
        spendToday,
        spendThisMonth,
        totalCalls: channel.totalCalls,
        modelSpend: channel.modelSpend,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 🔥 获取健康状态
 * 
 * GET /api/stats/health
 */
router.get('/health', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    
    // 获取所有 Channels
    const channels = await prisma.channel.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        isHealthy: true,
        failureCount: true,
        cooldownUntil: true,
        lastFailedAt: true,
        successRate: true,
        avgLatencyMs: true,
        activeRequests: true,
      },
    });
    
    // 检查实时健康状态
    const healthStatus = await Promise.all(
      channels.map(async (ch) => {
        const isHealthy = await deploymentHealthService.isHealthy(ch.id);
        const cooldownRemaining = await deploymentHealthService.getCooldownRemaining(ch.id);
        
        return {
          id: ch.id,
          name: ch.name,
          isHealthy,
          failureCount: ch.failureCount,
          cooldownRemaining,
          cooldownUntil: ch.cooldownUntil,
          lastFailedAt: ch.lastFailedAt,
          successRate: ch.successRate,
          avgLatencyMs: ch.avgLatencyMs,
          activeRequests: ch.activeRequests,
        };
      })
    );
    
    const healthyCount = healthStatus.filter(ch => ch.isHealthy).length;
    const unhealthyCount = healthStatus.length - healthyCount;
    
    res.json({
      success: true,
      summary: {
        total: channels.length,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        avgSuccessRate: channels.reduce((sum, ch) => sum + ch.successRate, 0) / channels.length || 0,
      },
      channels: healthStatus,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 🔥 获取请求日志
 * 
 * GET /api/stats/requests?channelId=xxx&limit=100
 */
router.get('/requests', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { channelId, limit = 100, offset = 0 } = req.query;
    
    const where: any = { userId };
    if (channelId) {
      where.channelId = channelId as string;
    }
    
    const requests = await prisma.requestLog.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { startTime: 'desc' },
      include: {
        channel: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });
    
    const total = await prisma.requestLog.count({ where });
    
    res.json({
      success: true,
      requests,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
