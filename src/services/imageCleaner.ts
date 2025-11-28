// src/services/imageCleaner.ts
/**
 * 🔥 图片自动清理服务（参考 n8n 临时文件管理）
 * 
 * 清理内容：
 * 1. uploads/ 目录下 >30分钟的图片文件
 * 2. Redis 中对应的 image:hash:{hash} 缓存（URL 映射）
 * 
 * ⚠️ 注意：
 * - 只清理图片和 URL 缓存
 * - 不清理 VideoTask 任务记录（永久保留在 PostgreSQL）
 * - 不清理轮询状态缓存（由 taskPollingService 管理）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { redisService } from './redisService';

class ImageCleanerService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 30 * 60 * 1000; // 30分钟
  private readonly MAX_AGE = 30 * 60 * 1000; // 30分钟
  private readonly uploadsDir: string;

  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
  }

  /**
   * 启动自动清理定时器
   */
  start() {
    if (this.cleanupInterval) {
      console.log('[ImageCleaner] ⚠️ 清理服务已在运行');
      return;
    }

    console.log('[ImageCleaner] 🚀 启动图片自动清理服务');
    console.log('[ImageCleaner] ⏰ 清理间隔: 30分钟');
    console.log('[ImageCleaner] 🗑️ 清理阈值: 30分钟前的图片');

    // 立即执行一次清理
    this.cleanup();

    // 定时清理
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * 停止自动清理
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[ImageCleaner] 🛑 清理服务已停止');
    }
  }

  /**
   * 计算文件内容哈希（用于匹配 Redis key）
   */
  private getFileHash(filePath: string): string | null {
    try {
      const buffer = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(buffer).digest('hex');
    } catch (error) {
      console.error('[ImageCleaner] ❌ 读取文件失败:', error);
      return null;
    }
  }

  /**
   * 执行清理
   */
  async cleanup() {
    try {
      if (!fs.existsSync(this.uploadsDir)) {
        console.log('[ImageCleaner] 📁 uploads 目录不存在，跳过清理');
        return;
      }

      const now = Date.now();
      const files = fs.readdirSync(this.uploadsDir);
      
      let deletedCount = 0;
      let redisClearedCount = 0;

      console.log('[ImageCleaner] 🔍 开始清理，共 %d 个文件', files.length);

      for (const file of files) {
        const filePath = path.join(this.uploadsDir, file);
        
        try {
          const stats = fs.statSync(filePath);
          const age = now - stats.mtimeMs;

          // 检查文件年龄
          if (age > this.MAX_AGE) {
            // 1️⃣ 计算文件哈希
            const fileHash = this.getFileHash(filePath);
            
            // 2️⃣ 删除 Redis 缓存
            if (fileHash) {
              try {
                await redisService.delete(`image:hash:${fileHash}`);
                redisClearedCount++;
                console.log('[ImageCleaner] 🗑️ Redis 缓存已删除: %s', fileHash.substring(0, 12) + '...');
              } catch (redisError) {
                console.error('[ImageCleaner] ⚠️ Redis 删除失败:', redisError);
              }
            }

            // 3️⃣ 删除文件
            fs.unlinkSync(filePath);
            deletedCount++;
            
            console.log('[ImageCleaner] 🗑️ 已删除: %s (年龄: %d 分钟)', 
              file, 
              Math.floor(age / 60000)
            );
          }
        } catch (error) {
          console.error('[ImageCleaner] ❌ 处理文件失败:', file, error);
        }
      }

      if (deletedCount > 0 || redisClearedCount > 0) {
        console.log('[ImageCleaner] ✅ 清理完成');
        console.log('[ImageCleaner] 📊 删除文件: %d 个', deletedCount);
        console.log('[ImageCleaner] 📊 清除缓存: %d 个', redisClearedCount);
      } else {
        console.log('[ImageCleaner] ✨ 无需清理');
      }
    } catch (error) {
      console.error('[ImageCleaner] ❌ 清理失败:', error);
    }
  }

  /**
   * 手动触发清理
   */
  async manualCleanup() {
    console.log('[ImageCleaner] 🔧 手动触发清理');
    await this.cleanup();
  }

  /**
   * 获取清理统计
   */
  getStats() {
    try {
      if (!fs.existsSync(this.uploadsDir)) {
        return {
          totalFiles: 0,
          totalSize: 0,
          oldFiles: 0,
        };
      }

      const files = fs.readdirSync(this.uploadsDir);
      const now = Date.now();
      let totalSize = 0;
      let oldFiles = 0;

      files.forEach(file => {
        const filePath = path.join(this.uploadsDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        
        if (now - stats.mtimeMs > this.MAX_AGE) {
          oldFiles++;
        }
      });

      return {
        totalFiles: files.length,
        totalSize: Math.round(totalSize / 1024), // KB
        oldFiles,
      };
    } catch (error) {
      console.error('[ImageCleaner] ❌ 获取统计失败:', error);
      return { totalFiles: 0, totalSize: 0, oldFiles: 0 };
    }
  }
}

// 导出单例
export const imageCleanerService = new ImageCleanerService();

