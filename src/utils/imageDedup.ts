// src/utils/imageDedup.ts
/**
 * 🔥 图片去重工具（参考 n8n deduplication-helper.ts）
 * 
 * 功能：
 * - 计算图片 MD5 哈希
 * - Redis 缓存图片 URL
 * - 避免重复上传相同图片
 */

import crypto from 'crypto';
import { redisService } from '../services/redisService';

export class ImageDeduplication {
  /**
   * 计算图片内容哈希（MD5）
   */
  static createImageHash(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * 检查图片是否已上传
   * @returns 如果已存在，返回之前的 URL；否则返回 null
   */
  static async checkExisting(imageHash: string): Promise<string | null> {
    try {
      const cachedUrl = await redisService.get(`image:hash:${imageHash}`);
      
      if (cachedUrl) {
        console.log('[ImageDedup] ✅ 命中缓存:', imageHash.substring(0, 8) + '...');
        return cachedUrl;
      }
      
      return null;
    } catch (error) {
      console.error('[ImageDedup] ⚠️ Redis 查询失败:', error);
      return null;  // 降级：当作新图片处理
    }
  }

  /**
   * 缓存图片 URL
   * @param imageHash 图片哈希值
   * @param imageUrl 图片 URL
   * @param ttl 缓存时间（秒），默认 1 小时
   */
  static async cacheImageUrl(imageHash: string, imageUrl: string, ttl: number = 3600): Promise<void> {
    try {
      await redisService.set(`image:hash:${imageHash}`, imageUrl, 'EX', ttl);
      console.log('[ImageDedup] 💾 已缓存:', imageHash.substring(0, 8) + '... → ' + imageUrl);
    } catch (error) {
      console.error('[ImageDedup] ⚠️ 缓存失败:', error);
      // 不影响主流程，静默失败
    }
  }

  /**
   * 完整的去重流程
   * @returns { isNew, imageUrl }
   */
  static async processImage(buffer: Buffer, filename: string): Promise<{
    isNew: boolean;
    imageHash: string;
    imageUrl: string | null;
  }> {
    // 1️⃣ 计算哈希
    const imageHash = this.createImageHash(buffer);
    
    // 2️⃣ 检查缓存
    const cachedUrl = await this.checkExisting(imageHash);
    
    if (cachedUrl) {
      return {
        isNew: false,
        imageHash,
        imageUrl: cachedUrl,
      };
    }
    
    // 3️⃣ 新图片
    return {
      isNew: true,
      imageHash,
      imageUrl: null,
    };
  }
}

