// src/routes/channel.ts
/**
 * 🔥 Channel 管理路由
 * 
 * 参考 One Hub channel controller
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { channelService } from '../services/channelService';
import { prisma } from '../loaders/prisma';

interface AuthRequest extends Request {
  user?: { id: string; username: string; role: string };
}

const router = Router();

/**
 * 创建 Channel
 */
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const channel = await channelService.createChannel(req.user!.id, {
      name: req.body.name,
      type: req.body.type,
      baseURL: req.body.baseURL,
      apiKey: req.body.apiKey,
      models: req.body.models || [],
      priority: req.body.priority || 1,
      groupName: req.body.groupName,
    });
    
    res.json({
      success: true,
      data: channel,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 获取用户的所有 Channels
 */
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const channels = await channelService.listChannels(req.user!.id);
    
    res.json({
      success: true,
      data: channels,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 更新 Channel
 */
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // 验证所有权
    const existing = await prisma.channel.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    const updated = await prisma.channel.update({
      where: { id },
      data: req.body,
    });
    
    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 删除 Channel
 */
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // 验证所有权
    const existing = await prisma.channel.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    await prisma.channel.delete({ where: { id } });
    
    res.json({
      success: true,
      message: 'Channel deleted'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

