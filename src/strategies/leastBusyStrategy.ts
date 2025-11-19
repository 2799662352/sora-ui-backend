// src/strategies/leastBusyStrategy.ts
/**
 * 🔥 Least-Busy 负载均衡策略
 * 
 * 完全参考 LiteLLM least_busy.py
 * 
 * 核心逻辑：
 * 1. log_pre_api_call: 请求开始 → request_count + 1
 * 2. log_success/failure: 请求结束 → request_count - 1
 * 3. select: 选择 request_count 最小的 Deployment
 * 
 * Redis 存储：
 * {
 *   "model:gpt-4:request_count": {
 *     "channel-1": 5,
 *     "channel-2": 2,
 *     "channel-3": 8
 *   }
 * }
 */

import { ILoadBalancingStrategy, Channel, SelectContext } from './ILoadBalancingStrategy';
import { redisService } from '../services/redisService';

export class LeastBusyStrategy implements ILoadBalancingStrategy {
  readonly name = 'least-busy';
  
  /**
   * 🔥 LiteLLM: 选择最少繁忙的 Deployment
   * 
   * 参考 least_busy.py Line 30-50
   */
  async select(channels: Channel[], context?: SelectContext): Promise<Channel> {
    if (channels.length === 0) {
      throw new Error('[LeastBusy] 无可用 Channel');
    }
    
    if (channels.length === 1) {
      return channels[0];
    }
    
    // 🔥 LiteLLM: 从 Redis 获取当前请求数
    const model = context?.model || 'default';
    const key = `model:${model}:request_count`;
    const counts = await redisService.asyncGetCache(key) || {};
    
    // 🔥 LiteLLM: 选择最少的
    let minCount = Infinity;
    let selectedChannel = channels[0];
    
    for (const channel of channels) {
      const count = counts[channel.id] || 0;
      console.log(`[LeastBusy] ${channel.name}: ${count} 个活跃请求`);
      
      if (count < minCount) {
        minCount = count;
        selectedChannel = channel;
      }
    }
    
    console.log(`[LeastBusy] ✅ 选择 ${selectedChannel.name} (${minCount} 个活跃请求)`);
    
    return selectedChannel;
  }
  
  /**
   * 🔥 LiteLLM: log_pre_api_call
   * 
   * 请求开始时增加计数
   */
  async onRequestStart(channelId: string, context?: SelectContext): Promise<void> {
    try {
      const model = context?.model || 'default';
      const key = `model:${model}:request_count`;
      
      // 获取当前计数
      const counts = await redisService.asyncGetCache(key) || {};
      
      // +1
      counts[channelId] = (counts[channelId] || 0) + 1;
      
      // 保存回 Redis（TTL 60秒）
      await redisService.asyncSetCache(key, counts, 60);
      
      console.log(`[LeastBusy] ➕ ${channelId} 活跃请求 +1 → ${counts[channelId]}`);
    } catch (error: any) {
      console.error(`[LeastBusy] ❌ onRequestStart 失败:`, error.message);
    }
  }
  
  /**
   * 🔥 LiteLLM: log_success_event / log_failure_event
   * 
   * 请求结束时减少计数
   */
  async onRequestEnd(channelId: string, success: boolean, context?: SelectContext): Promise<void> {
    try {
      const model = context?.model || 'default';
      const key = `model:${model}:request_count`;
      
      // 获取当前计数
      const counts = await redisService.asyncGetCache(key) || {};
      
      // -1（确保不为负）
      counts[channelId] = Math.max((counts[channelId] || 0) - 1, 0);
      
      // 保存回 Redis
      await redisService.asyncSetCache(key, counts, 60);
      
      console.log(`[LeastBusy] ➖ ${channelId} 活跃请求 -1 → ${counts[channelId]} (${success ? '成功' : '失败'})`);
    } catch (error: any) {
      console.error(`[LeastBusy] ❌ onRequestEnd 失败:`, error.message);
    }
  }
}

// 导出单例
export const leastBusyStrategy = new LeastBusyStrategy();

