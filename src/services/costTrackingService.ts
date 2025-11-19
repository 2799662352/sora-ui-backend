// src/services/costTrackingService.ts
/**
 * 🔥 成本追踪服务
 * 
 * 完全参考 LiteLLM spend_tracking_utils.py
 * 
 * 核心功能：
 * 1. 基于 token 计算成本
 * 2. 实时 Redis 更新
 * 3. 异步数据库更新
 * 4. 创建 RequestLog 记录
 */

import { redisService } from './redisService';
import { prisma } from '../loaders/prisma';

/**
 * 模型定价配置（每1000 tokens的价格，单位：美元）
 * 
 * 🔥 LiteLLM: 参考 litellm/model_prices_and_context_window.json
 */
interface ModelPricing {
  promptPricePer1K: number;      // Prompt token 价格
  completionPricePer1K: number;  // Completion token 价格
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-4 系列
  'gpt-4': {
    promptPricePer1K: 0.03,
    completionPricePer1K: 0.06,
  },
  'gpt-4-turbo': {
    promptPricePer1K: 0.01,
    completionPricePer1K: 0.03,
  },
  'gpt-4o': {
    promptPricePer1K: 0.005,
    completionPricePer1K: 0.015,
  },
  
  // GPT-3.5 系列
  'gpt-3.5-turbo': {
    promptPricePer1K: 0.0005,
    completionPricePer1K: 0.0015,
  },
  
  // Claude 系列
  'claude-3-opus': {
    promptPricePer1K: 0.015,
    completionPricePer1K: 0.075,
  },
  'claude-3-sonnet': {
    promptPricePer1K: 0.003,
    completionPricePer1K: 0.015,
  },
  
  // 默认（Sora 视频）
  'sora_video2': {
    promptPricePer1K: 0.1,      // 假设 $0.1 per 1K tokens
    completionPricePer1K: 0.0,  // 视频生成没有 completion
  },
  
  // 默认
  'default': {
    promptPricePer1K: 0.001,
    completionPricePer1K: 0.002,
  },
};

export class CostTrackingService {
  /**
   * 🔥 LiteLLM: calculate_cost
   * 
   * 计算请求成本（基于 token 数量和模型定价）
   */
  calculateCost(params: {
    model: string;
    promptTokens: number;
    completionTokens: number;
  }): number {
    // 获取模型定价
    const pricing = MODEL_PRICING[params.model] || MODEL_PRICING['default'];
    
    // 🔥 LiteLLM 公式（spend_tracking_utils.py）
    const promptCost = (params.promptTokens / 1000) * pricing.promptPricePer1K;
    const completionCost = (params.completionTokens / 1000) * pricing.completionPricePer1K;
    const totalCost = promptCost + completionCost;
    
    console.log(`[CostTracking] 💰 成本计算:`);
    console.log(`  - 模型: ${params.model}`);
    console.log(`  - Prompt: ${params.promptTokens} tokens × $${pricing.promptPricePer1K}/1K = $${promptCost.toFixed(6)}`);
    console.log(`  - Completion: ${params.completionTokens} tokens × $${pricing.completionPricePer1K}/1K = $${completionCost.toFixed(6)}`);
    console.log(`  - 总计: $${totalCost.toFixed(6)}`);
    
    return totalCost;
  }
  
  /**
   * 🔥 LiteLLM: track_spend
   * 
   * 追踪成本（实时 Redis + 异步数据库）
   */
  async trackCost(params: {
    channelId: string;
    userId: string;
    model: string;
    cost: number;
    tokens: {
      total: number;
      prompt: number;
      completion: number;
    };
    requestId: string;
    startTime: Date;
    endTime: Date;
    status: 'success' | 'error';
    errorMessage?: string;
    httpStatus?: number;
  }): Promise<void> {
    try {
      // 🔥 LiteLLM: 实时 Redis 更新（快速）
      await Promise.all([
        // 今日消费
        redisService.increment(`channel:spend:today:${params.channelId}`, params.cost, 86400),
        
        // 本月消费
        redisService.increment(`channel:spend:month:${params.channelId}`, params.cost, 2592000),
        
        // 总成本
        redisService.increment(`channel:spend:total:${params.channelId}`, params.cost),
      ]);
      
      console.log(`[CostTracking] 📊 Redis 更新成功: $${params.cost.toFixed(6)}`);
      
      // 🔥 LiteLLM: 异步数据库更新（不阻塞）
      setImmediate(async () => {
        try {
          // 1️⃣ 更新 Channel 统计
          await prisma.channel.update({
            where: { id: params.channelId },
            data: {
              totalCost: { increment: params.cost },
              spendToday: { increment: params.cost },
              spendThisMonth: { increment: params.cost },
              totalCalls: { increment: 1 },
              lastUsedAt: new Date(),
            },
          });
          
          // 2️⃣ 创建 RequestLog 记录
          await prisma.requestLog.create({
            data: {
              requestId: params.requestId,
              channelId: params.channelId,
              userId: params.userId,
              model: params.model,
              callType: 'completion',
              spend: params.cost,
              totalTokens: params.tokens.total,
              promptTokens: params.tokens.prompt,
              completionTokens: params.tokens.completion,
              startTime: params.startTime,
              endTime: params.endTime,
              responseTimeMs: params.endTime.getTime() - params.startTime.getTime(),
              status: params.status,
              errorMessage: params.errorMessage,
              httpStatus: params.httpStatus,
            },
          });
          
          console.log(`[CostTracking] 💾 数据库更新成功: ${params.requestId}`);
        } catch (dbError: any) {
          console.error(`[CostTracking] ❌ 数据库更新失败:`, dbError.message);
        }
      });
      
    } catch (error: any) {
      console.error(`[CostTracking] ❌ 追踪成本失败:`, error.message);
    }
  }
  
  /**
   * 获取 Channel 今日消费
   */
  async getSpendToday(channelId: string): Promise<number> {
    try {
      const spend = await redisService.get(`channel:spend:today:${channelId}`);
      return spend ? parseFloat(spend) : 0;
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * 获取 Channel 本月消费
   */
  async getSpendThisMonth(channelId: string): Promise<number> {
    try {
      const spend = await redisService.get(`channel:spend:month:${channelId}`);
      return spend ? parseFloat(spend) : 0;
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * 重置每日消费（定时任务调用）
   */
  async resetDailySpend(): Promise<void> {
    try {
      // 重置所有 Channel 的今日消费
      const keys = await redisService.client.keys('sora-ui:channel:spend:today:*');
      
      if (keys.length > 0) {
        // 🔥 修复：一次删除一个key
        for (const key of keys) {
          await redisService.client.del(key);
        }
        console.log(`[CostTracking] 🔄 已重置 ${keys.length} 个 Channel 的今日消费`);
      }
    } catch (error: any) {
      console.error(`[CostTracking] ❌ 重置每日消费失败:`, error.message);
    }
  }
}

// 导出单例
export const costTrackingService = new CostTrackingService();

