// src/routes/license.ts
// 许可证 API 路由

import express from 'express';
import { licenseService } from '../services/licenseService';
import { authMiddleware } from '../middleware/auth';
import { APIResponse } from '../types';

const router = express.Router();

/**
 * POST /api/license/activate - 激活许可证
 */
router.post('/activate', authMiddleware, async (req, res) => {
  try {
    const { licenseKey } = req.body;
    const userId = (req as any).user.userId;

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        message: '许可证密钥不能为空',
      } as APIResponse);
    }

    const license = await licenseService.activateLicense(licenseKey, userId);

    res.json({
      success: true,
      data: {
        isValid: true,
        licenseKey: license.licenseKey,
        licenseType: license.type,
        expiresAt: license.expiresAt,
        features: license.features,
      },
    } as APIResponse);
  } catch (error: any) {
    console.error('许可证激活失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '激活失败',
    } as APIResponse);
  }
});

/**
 * POST /api/license/validate - 验证许可证
 */
router.post('/validate', async (req, res) => {
  try {
    const { licenseKey } = req.body;

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        message: '许可证密钥不能为空',
      } as APIResponse);
    }

    const validation = await licenseService.validateLicense(licenseKey);

    res.json({
      success: true,
      data: validation,
    } as APIResponse);
  } catch (error: any) {
    console.error('许可证验证失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '验证失败',
    } as APIResponse);
  }
});

/**
 * GET /api/license/info - 获取用户许可证信息
 */
router.get('/info', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;

    const license = await licenseService.getUserLicense(userId);

    if (!license) {
      return res.json({
        success: true,
        data: {
          isValid: false,
          message: '未激活许可证',
        },
      } as APIResponse);
    }

    const validation = await licenseService.validateLicense(license.licenseKey);

    res.json({
      success: true,
      data: {
        ...validation,
        licenseKey: license.licenseKey,
        activatedAt: license.activatedAt,
      },
    } as APIResponse);
  } catch (error: any) {
    console.error('获取许可证信息失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取失败',
    } as APIResponse);
  }
});

export default router;

