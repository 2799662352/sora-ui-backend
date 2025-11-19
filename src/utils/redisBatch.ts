// src/utils/redisBatch.ts
/**
 * 🔥 Redis 批量操作工具（Pipeline模式）
 * 
 * 参考：ioredis pipeline 最佳实践
 * 优势：
 * - 减少网络往返次数 (RTT)
 * - 提升吞吐量 50-100%
 * - 原子性批量操作
 * 
 * 使用场景：
 * - 批量设置缓存
 * - 批量清理过期数据
 * - 批量查询
 */

import { redisService } from '../services/redisService';

/**
 * 批量设置缓存（Pipeline模式）
 */
export async function setBatchCache(
  items: Array<{ key: string; value: string; ttl?: number }>
): Promise<void> {
  const pipeline = redisService.client.multi();
  
  for (const item of items) {
    const fullKey = `sora-ui:${item.key}`;
    if (item.ttl) {
      pipeline.setEx(fullKey, item.ttl, item.value);
    } else {
      pipeline.set(fullKey, item.value);
    }
  }
  
  await pipeline.exec();
  console.log(`[Redis Pipeline] ✅ 批量设置 ${items.length} 个缓存`);
}

/**
 * 批量获取缓存（Pipeline模式）
 */
export async function getBatchCache(
  keys: string[]
): Promise<(string | null)[]> {
  const pipeline = redisService.client.multi();
  
  for (const key of keys) {
    const fullKey = `sora-ui:${key}`;
    pipeline.get(fullKey);
  }
  
  const results = await pipeline.exec();
  console.log(`[Redis Pipeline] ✅ 批量获取 ${keys.length} 个缓存`);
  
  // 🔥 修复：正确处理 Redis Pipeline 返回类型
  if (!results) return [];
  return (results as Array<[Error | null, any]>).map(([err, value]) => value as string | null);
}

/**
 * 批量删除缓存（Pipeline模式）
 */
export async function delBatchCache(keys: string[]): Promise<number> {
  const pipeline = redisService.client.multi();
  
  for (const key of keys) {
    const fullKey = `sora-ui:${key}`;
    pipeline.del(fullKey);
  }
  
  const results = await pipeline.exec();
  const deletedCount = results?.length || 0;
  
  console.log(`[Redis Pipeline] ✅ 批量删除 ${deletedCount} 个缓存`);
  return deletedCount;
}

/**
 * 批量检查Key是否存在
 */
export async function existsBatchCache(keys: string[]): Promise<boolean[]> {
  const pipeline = redisService.client.multi();
  
  for (const key of keys) {
    const fullKey = `sora-ui:${key}`;
    pipeline.exists(fullKey);
  }
  
  const results = await pipeline.exec();
  // 🔥 修复：正确处理 Redis Pipeline 返回类型
  if (!results) return [];
  return (results as Array<[Error | null, any]>).map(([err, value]) => value === 1);
}

/**
 * 示例：批量保存任务状态
 */
export async function batchSaveTaskStatus(
  tasks: Array<{ videoId: string; status: string; progress: number }>
): Promise<void> {
  const items = tasks.map(task => ({
    key: `task:status:${task.videoId}`,
    value: JSON.stringify({ status: task.status, progress: task.progress }),
    ttl: 600 // 10分钟
  }));
  
  await setBatchCache(items);
}

