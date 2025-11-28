// src/controllers/soraRelayController.ts
/**
 * 🔥 Sora 视频生成完全后端转发（完全参考 LiteLLM Relay）
 * 
 * 这是正确的架构！
 * - 所有请求经过后端
 * - 启用健康检查、负载均衡、自动重试、成本追踪
 * - 完整审计日志
 * 
 * curl 示例：
 * curl -X POST "http://localhost:3001/api/relay/sora/videos" \
 *   -H "Authorization: Bearer YOUR_TOKEN" \
 *   -F "prompt=参考配图，使得动物们活跃起来" \
 *   -F "model=sora-2" \
 *   -F "size=1280x720" \
 *   -F "seconds=10" \
 *   -F "input_reference=@/path/to/image.png"
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import FormData from 'form-data';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../loaders/prisma';
import { TaskStatus } from '@prisma/client';
import { VideoTaskMetadata } from '../types';
import { startTaskPolling } from '../services/taskPollingService';
import { mapModelName, getSizeByAspectRatio } from '../utils/modelMapper';
import { ImageDeduplication } from '../utils/imageDedup';  // 🔥 图片去重
import * as fs from 'fs';
import * as path from 'path';

// 🔥 配置 multer（内存存储，用于转发）
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB 限制
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  },
});

interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    role: string;
  };
}

/**
 * 🔥 检查图片 URL 是否可访问
 */
const isImageUrlReachable = async (url: string): Promise<boolean> => {
  try {
    await axios.head(url, { timeout: 5000 });
    return true;
  } catch (error: any) {
    console.warn('[SoraRelay] ⚠️ 参考图 URL 不可访问，将改用流式上传:', url);
    console.warn('[SoraRelay] ⚠️ HEAD 请求失败原因:', error.message);
    return false;
  }
};

/**
 * 🔥 将图片以二进制方式添加到 FormData
 */
const appendBinaryReference = (formData: FormData, file: Express.Multer.File) => {
  // 🔥 注意：字段名必须是 'input_reference'（不带方括号），与 api易 示例一致
  formData.append('input_reference', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype,
    knownLength: file.size,
  });
};

/**
 * 🔥 Sora 视频生成 Relay
 * 
 * POST /api/relay/sora/videos
 * 
 * 完全符合 LiteLLM Relay 架构：
 * 1. 接收请求
 * 2. 转发到外部 API
 * 3. 保存任务
 * 4. 启动轮询
 * 5. SSE 推送更新
 */
export const relaySoraVideoGeneration = [
  upload.single('input_reference'),  // 🔥 处理文件上传
  
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startTime = new Date();
    const requestId = uuidv4();
    
    try {
      const { 
        prompt, model, size, seconds, aspect_ratio,
        // 🔥 新增：Tokens-Pool 扩展参数（参考 https://docs2.tokens-pool.top/platform/sora.html）
        watermark,    // boolean - 是否保留水印
        hd,           // boolean - 是否高清
        private: isPrivate,  // boolean - 隐私模式
        n             // number - 生成数量（1-4）
      } = req.body;
      const userId = req.user!.userId;
      const file = req.file;
      
      console.log('[SoraRelay] 📥 收到生成请求:', requestId);
      console.log('  - 用户:', req.user!.username);
      console.log('  - 模型:', model);
      console.log('  - 提示词:', prompt?.substring(0, 50) + '...');
      console.log('  - 尺寸:', size);
      console.log('  - 时长:', seconds);
      console.log('  - 参考图:', file ? `${file.originalname} (${(file.size / 1024).toFixed(2)}KB)` : '无');
      
      // 1️⃣ 验证参数
      if (!prompt) {
        return res.status(400).json({
          success: false,
          error: '缺少 prompt 参数',
        });
      }
      
      // 2️⃣ 获取 Sora API 配置
      const SORA_API_KEY = process.env.SORA_API_KEY || 
        'sk-XlwdCKIn8g7sJ672o5UOawhOqvXYQKhOwqaFzPv8bH2e16HYS8dS55wFIKiBvqTy';
      const SORA_API_BASE = process.env.SORA_API_BASE || 'http://45.8.22.95:8000';
      
      // 3️⃣ 构建 FormData（转发到外部API）
      const formData = new FormData();
      formData.append('prompt', prompt);
      
      // 🔥 Model映射：前端model → 外部API标准model
      const mappedModel = mapModelName(model || 'sora_video2');
      formData.append('model', mappedModel.model);
      
      console.log('[SoraRelay] 🔄 Model映射: 前端[%s] → 外部API[%s]', model, mappedModel.model);
      
      // 🔥 Size参数：优先使用前端传入，否则根据aspectRatio计算
      let finalSize = size;
      let finalAspectRatio = aspect_ratio;
      
      // 使用映射的aspectRatio（如果前端没有明确指定）
      if (!finalAspectRatio && mappedModel.aspectRatio) {
        finalAspectRatio = mappedModel.aspectRatio;
        console.log('[SoraRelay] 📐 使用映射的宽高比:', finalAspectRatio);
      }
      
      // 根据aspectRatio计算size（如果前端没有明确指定）
      if (!finalSize && finalAspectRatio) {
        finalSize = getSizeByAspectRatio(finalAspectRatio);
        console.log('[SoraRelay] 📏 根据宽高比计算尺寸:', finalSize);
      }
      
      if (finalSize) formData.append('size', finalSize);
      
      // Seconds参数：优先使用前端传入，否则使用映射的duration
      let finalSeconds = seconds;
      if (!finalSeconds && mappedModel.duration) {
        finalSeconds = mappedModel.duration.toString();
        console.log('[SoraRelay] ⏱️ 使用映射的时长:', finalSeconds);
      }
      if (finalSeconds) formData.append('seconds', finalSeconds);
      
      // AspectRatio参数
      if (finalAspectRatio) formData.append('aspect_ratio', finalAspectRatio);
      
      // 🔥 新增：Tokens-Pool 扩展参数（可选）
      if (watermark !== undefined) {
        formData.append('watermark', watermark.toString());
        console.log('[SoraRelay] 🏷️ 水印设置:', watermark);
      }
      
      if (hd !== undefined) {
        formData.append('hd', hd.toString());
        console.log('[SoraRelay] 📺 高清设置:', hd);
      }
      
      if (isPrivate !== undefined) {
        formData.append('private', isPrivate.toString());
        console.log('[SoraRelay] 🔒 隐私模式:', isPrivate);
      }
      
      if (n && n > 1 && n <= 4) {
        formData.append('n', n.toString());
        console.log('[SoraRelay] 🎨 生成数量:', n);
      }
      
      // 🔥 添加参考图片（智能回退：URL → 流式 Buffer）
      if (file) {
        if (!process.env.PUBLIC_BASE_URL) {
          console.warn('[SoraRelay] ⚠️ 未配置 PUBLIC_BASE_URL，将直接流式转发参考图');
        }
        
        // 1️⃣ 检查图片是否已上传（去重）
        const dedupResult = await ImageDeduplication.processImage(file.buffer, file.originalname);
        
        let imageUrl: string | null = null;
        
        if (!dedupResult.isNew && dedupResult.imageUrl) {
          // ✅ 图片已存在，使用缓存的 URL
          imageUrl = dedupResult.imageUrl;
          console.log('[SoraRelay] ♻️  图片去重命中，使用缓存 URL');
          console.log('[SoraRelay] 🔗 缓存 URL: %s', imageUrl);
          console.log('[SoraRelay] 📊 节省存储: %s KB', (file.size / 1024).toFixed(2));
        } else {
          // 🆕 新图片，保存并生成 URL
          const uploadsDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          
          const safeFilename = `ref_${dedupResult.imageHash}.${file.mimetype === 'image/png' ? 'png' : 'jpg'}`;
          const filePath = path.join(uploadsDir, safeFilename);
          fs.writeFileSync(filePath, file.buffer);
          
          // 生成公网 URL
          const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
          if (PUBLIC_BASE_URL) {
            imageUrl = `${PUBLIC_BASE_URL}/uploads/${safeFilename}`;
            
            // 缓存 URL（1小时，与自动清理时间一致）
            await ImageDeduplication.cacheImageUrl(dedupResult.imageHash, imageUrl, 3600);
          } else {
            console.warn('[SoraRelay] ⚠️ PUBLIC_BASE_URL 未设置，无法生成公网 URL');
          }
          
          console.log('[SoraRelay] 📎 新图片已保存');
          console.log('[SoraRelay] 📁 本地路径: %s', filePath);
          if (imageUrl) {
            console.log('[SoraRelay] 🔗 公网 URL: %s', imageUrl);
          }
          console.log('[SoraRelay] 🔑 图片哈希: %s', dedupResult.imageHash.substring(0, 12) + '...');
          console.log('[SoraRelay] 📊 原始文件: %s (%s KB)', file.originalname, (file.size / 1024).toFixed(2));
        }
        
        // 🔥 智能回退：URL 不可访问时，改用流式 Buffer
        let shouldStreamBinary = false;
        
        if (imageUrl) {
          const reachable = await isImageUrlReachable(imageUrl);
          if (reachable) {
            // 🔥 注意：字段名必须是 'input_reference'（不带方括号）
            formData.append('input_reference', imageUrl);
          } else {
            shouldStreamBinary = true;
          }
        } else {
          shouldStreamBinary = true;
        }
        
        if (shouldStreamBinary) {
          console.log('[SoraRelay] 📡 使用流式方式直接转发参考图');
          appendBinaryReference(formData, file);
        }
      }
      
      // 4️⃣ 🔥 调用外部 Sora API
      console.log('[SoraRelay] 📤 转发到外部API:', `${SORA_API_BASE}/sora/v1/videos`);
      
      const response = await axios.post(
        `${SORA_API_BASE}/sora/v1/videos`,
        formData,
        {
          headers: {
            'Authorization': SORA_API_KEY,
            ...formData.getHeaders(),  // 🔥 重要：包含 boundary
          },
          timeout: 30000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );
      
      const externalTaskId = response.data.id || response.data;
      console.log('[SoraRelay] ✅ 外部API响应:', externalTaskId);
      
      // 5️⃣ 生成本地视频ID
      const videoId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // 6️⃣ 保存到数据库（完整数据）
      const videoTask = await prisma.videoTask.create({
        data: {
          videoId,
          externalTaskId,
          userId,
          model: model || 'sora-2',
          prompt,  // ✅ 完整 prompt
          status: TaskStatus.PROCESSING,
          progress: 0,
          apiConfigId: 'backend-api',
          isAsync: true,
          mediaType: 'VIDEO',
          size,
          duration: seconds ? parseInt(seconds) : undefined,
          aspectRatio: aspect_ratio,
        },
      });
      
      console.log('[SoraRelay] 💾 任务已保存到数据库:', videoId);
      
      // 7️⃣ 🔥 启动后端轮询服务（自动推送SSE）
      startTaskPolling({
        videoId,
        externalTaskId,
        apiConfigId: 'backend-api',
        userId,
      });
      
      console.log('[SoraRelay] 🔄 后端轮询已启动，将通过 SSE 推送更新');
      
      // 8️⃣ 返回响应
      const endTime = new Date();
      const requestTime = endTime.getTime() - startTime.getTime();
      
      res.json({
        success: true,
        data: {
          videoId,
          externalTaskId,
          status: 'processing',
          progress: 0,
          message: '任务已提交，后端正在处理中',
        },
        requestTime,
        requestId,
      });
      
      console.log('[SoraRelay] ✅ 请求完成 (%dms)', requestTime);
      
    } catch (error: any) {
      console.error('[SoraRelay] ❌ 转发失败:', error.message);
      console.error('[SoraRelay] 错误详情:', error.response?.data || error);
      
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.message,
        details: error.response?.data,
        type: 'relay_error',
      });
    }
  }
];

/**
 * 🔥 Remix (视频编辑) - Metadata Pattern
 * 
 * POST /api/relay/sora/videos/:videoId/remix
 * 
 * 🔥 支持两种格式：
 * 1. JSON: { prompt, model }
 * 2. FormData: prompt, model, input_reference (可选)
 */
export const remixSoraVideo = [
  upload.single('input_reference'),  // 🔥 支持 FormData 格式
  async (req: AuthRequest, res: Response) => {
  const startTime = new Date();
  const requestId = uuidv4();
  
  try {
    const { videoId } = req.params;
    // 🔥 支持 FormData 和 JSON 两种格式
    const prompt = req.body.prompt;
    const model = req.body.model;
    const file = (req as any).file as Express.Multer.File | undefined;
    const userId = req.user!.userId;
    
    console.log('[SoraRelay] 📥 收到 Remix 请求:', requestId);
    console.log('  - 原视频ID:', videoId);
    console.log('  - 新提示词:', prompt);
    console.log('  - 请求格式:', file ? 'FormData (带图片)' : 'JSON/FormData');
    
    // 1️⃣ 查找原任务（获取 externalTaskId）
    const originalTask = await prisma.videoTask.findUnique({
      where: { videoId },
    });
    
    if (!originalTask) {
      return res.status(404).json({ success: false, error: '原视频任务不存在' });
    }
    
    if (!originalTask.externalTaskId) {
      return res.status(400).json({ success: false, error: '原视频未关联外部任务 ID，无法 Remix' });
    }
    
    // 2️⃣ 调用外部 Remix API
    // 🔥 修复：与 createSoraVideo 保持一致，添加默认 API Key
    const SORA_API_KEY = process.env.SORA_API_KEY || 
      'sk-XlwdCKIn8g7sJ672o5UOawhOqvXYQKhOwqaFzPv8bH2e16HYS8dS55wFIKiBvqTy';
    const SORA_API_BASE = process.env.SORA_API_BASE || 'http://45.8.22.95:8000';
    const url = `${SORA_API_BASE}/sora/v1/videos/${originalTask.externalTaskId}/remix`;
    
    console.log('[SoraRelay] 📤 调用外部 Remix API:', url);
    
    let response;
    
    // 🔥 如果有图片，使用 FormData 格式
    if (file) {
      console.log('[SoraRelay] 🖼️ 检测到参考图片，使用 FormData 格式');
      console.log('  - 文件名:', file.originalname);
      console.log('  - 文件大小:', (file.size / 1024).toFixed(2), 'KB');
      console.log('  - MIME 类型:', file.mimetype);
      
      const formData = new FormData();
      formData.append('prompt', prompt || '');
      formData.append('model', model || originalTask.model || 'sora_video2');
      
      // 🔥 添加图片到 FormData
      formData.append('input_reference', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
        knownLength: file.size,
      });
      
      response = await axios.post(url, formData, {
        headers: {
          'Authorization': SORA_API_KEY,
          ...formData.getHeaders(),
        },
        timeout: 30000,
      });
      
      console.log('[SoraRelay] ✅ FormData 请求成功');
    } else {
      // 没有图片，使用 JSON 格式
      console.log('[SoraRelay] 📝 无参考图片，使用 JSON 格式');
      
      response = await axios.post(
        url,
        {
          prompt,
          model: model || originalTask.model, // 默认使用原模型
        },
        {
          headers: {
            'Authorization': SORA_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
    }
    
    // 3️⃣ 获取新任务 ID
    const newExternalTaskId = response.data.id || response.data;
    console.log('[SoraRelay] ✅ Remix 成功，新外部ID:', newExternalTaskId);
    
    // 4️⃣ 保存新任务 (Metadata Pattern)
    const newVideoId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const newTask = await prisma.videoTask.create({
      data: {
        videoId: newVideoId,
        externalTaskId: newExternalTaskId,
        userId,
        model: model || originalTask.model,
        prompt,
        status: TaskStatus.PROCESSING,
        progress: 0,
        apiConfigId: 'backend-api',
        isAsync: true,
        mediaType: 'VIDEO',
        // 继承原视频属性
        size: originalTask.size,
        duration: originalTask.duration,
        aspectRatio: originalTask.aspectRatio,
        // 🔥 关键：使用 metadata 存储血缘关系
        metadata: {
          remix_from: videoId,
          remix_from_external: originalTask.externalTaskId,
          type: 'remix'
        } as VideoTaskMetadata,
      },
    });
    
    console.log('[SoraRelay] 💾 Remix 任务已保存:', newVideoId);
    
    // 5️⃣ 启动轮询
    startTaskPolling({
      videoId: newVideoId,
      externalTaskId: newExternalTaskId,
      apiConfigId: 'backend-api',
      userId,
    });
    
    // 6️⃣ 返回结果
    const endTime = new Date();
    const requestTime = endTime.getTime() - startTime.getTime();
    
    res.json({
      success: true,
      data: {
        videoId: newVideoId,
        externalTaskId: newExternalTaskId,
        status: 'processing',
        message: 'Remix 任务已提交',
        remixed_from: videoId
      },
      requestTime,
    });
    
  } catch (error: any) {
    console.error('[SoraRelay] ❌ Remix 失败:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      details: error.response?.data,
    });
  }
}];

/**
 * 🔥 查询视频状态（通过后端）
 * 
 * GET /api/relay/sora/videos/:videoId
 */
export const querySoraVideoStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = req.user!.userId;
    
    // 从数据库获取任务
    const task = await prisma.videoTask.findUnique({
      where: { videoId },
    });
    
    if (!task || task.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: '任务不存在或无权访问',
      });
    }
    
    res.json({
      success: true,
      data: {
        videoId: task.videoId,
        externalTaskId: task.externalTaskId,
        status: task.status,
        progress: task.progress,
        videoUrl: task.videoUrl,
        imageUrl: task.imageUrl,
        error: task.errorMessage,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
      },
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
