// src/routes/update.ts
// 自动更新 API 路由

import express from 'express';
import { updateService } from '../services/updateService';
import { APIResponse } from '../types';

const router = express.Router();

/**
 * GET /api/update/check - 检查更新
 * Query: version, platform
 */
router.get('/check', async (req, res) => {
  try {
    const currentVersion = req.query.version as string;
    const platform = req.query.platform as 'win32' | 'darwin' | 'linux';

    if (!currentVersion || !platform) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: version 和 platform',
      } as APIResponse);
    }

    const update = await updateService.getLatestVersion(currentVersion, platform);

    if (!update) {
      return res.json({
        success: true,
        data: null,
        message: '当前已是最新版本',
      } as APIResponse);
    }

    res.json({
      success: true,
      data: update,
    } as APIResponse);
  } catch (error: any) {
    console.error('检查更新失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '检查更新失败',
    } as APIResponse);
  }
});

/**
 * GET /api/update/download/:version/:platform - 下载更新文件
 */
router.get('/download/:version/:platform', async (req, res) => {
  try {
    const { version, platform } = req.params;

    const file = await updateService.getUpdateFile(version, platform);

    // 设置下载响应头
    const fileName = `sora-ui-${version}-${platform}`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.setHeader('Content-Length', file.length);

    res.send(file);
  } catch (error: any) {
    console.error('下载更新失败:', error);
    res.status(404).json({
      success: false,
      message: error.message || '更新文件不存在',
    } as APIResponse);
  }
});

export default router;

