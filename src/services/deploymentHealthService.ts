// src/services/deploymentHealthService.ts
/**
 * 🔥 Deployment 健康检查服务
 * 
 * 完全参考 LiteLLM cooldown_handlers.py
 * 
 * 核心功能：
 * 1. 失败后进入冷却期（Cooldown）
 * 2. 冷却期内不参与负载均衡
 * 3. 冷却期结束自动恢复
 * 4. 记录失败和成功指标
 */

import { redisService } from './redisService';
import { prisma } from '../loaders/prisma';

/**
 * 🔥 LiteLLM: DEFAULT_COOLDOWN_TIME_SECONDS = 60
 */
const DEFAULT_COOLDOWN_SECONDS = 60;

/**
 * 🔥 LiteLLM: 失败阈值（连续失败次数）
 */
const FAILURE_THRESHOLD = 5;

export class DeploymentHealthService {
  /**
   * 🔥 LiteLLM: _is_cooldown_required
   * 
   * 判断是否需要进入冷却期（基于 HTTP 状态码）
   */
  private isCooldownRequired(errorStatus: number): boolean {
    // 🔥 LiteLLM 逻辑（cooldown_handlers.py Line 60-75）
    
    // 429 Rate Limit → 冷却
    if (errorStatus === 429) {
      return true;
    }
    
    // 401 Auth Error → 冷却
    if (errorStatus === 401) {
      return true;
    }
    
    // 408 Timeout → 冷却
    if (errorStatus === 408) {
      return true;
    }
    
    // 5xx Server Error → 冷却
    if (errorStatus >= 500) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 🔥 LiteLLM: _set_cooldown_deployments
   * 
   * 标记 Deployment 为不健康，进入冷却期
   */
  async markUnhealthy(
    channelId: string,
    errorStatus: number,
    cooldownSeconds: number = DEFAULT_COOLDOWN_SECONDS
  ): Promise<void> {
    try {
      // 检查是否需要冷却
      if (!this.isCooldownRequired(errorStatus)) {
        console.log(`[Health] ℹ️ 错误 ${errorStatus} 不需要冷却: ${channelId}`);
        return;
      }
      
      const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000);
      
      // 🔥 Redis: 存储冷却期结束时间
      await redisService.set(
        `deployment:cooldown:${channelId}`,
        cooldownUntil.getTime().toString(),
        'EX',
        cooldownSeconds
      );
      
      // 🔥 数据库：更新健康状态和失败计数
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          isHealthy: false,
          cooldownUntil,
          lastFailedAt: new Date(),
          failureCount: { increment: 1 },
        },
      });
      
      console.log(`[Health] ⚠️ Deployment ${channelId} 进入冷却期 ${cooldownSeconds}秒 (错误: ${errorStatus})`);
    } catch (error: any) {
      console.error(`[Health] ❌ 标记不健康失败:`, error.message);
    }
  }
  
  /**
   * 🔥 LiteLLM: _get_cooldown_deployments (反向检查)
   * 
   * 检查 Deployment 是否健康（不在冷却期）
   */
  async isHealthy(channelId: string): Promise<boolean> {
    try {
      // 🔥 LiteLLM: 优先检查 Redis
      const cooldownEnd = await redisService.get(`deployment:cooldown:${channelId}`);
      
      if (!cooldownEnd) {
        // 不在冷却期 → 健康
        return true;
      }
      
      const now = Date.now();
      const end = parseInt(cooldownEnd);
      
      if (now > end) {
        // 冷却期已过 → 健康
        // 🔥 清理 Redis 和恢复数据库状态
        await this.recoverHealth(channelId);
        return true;
      }
      
      // 仍在冷却期 → 不健康
      const remainingSeconds = Math.ceil((end - now) / 1000);
      console.log(`[Health] ❄️ Deployment ${channelId} 冷却中，剩余 ${remainingSeconds}秒`);
      return false;
      
    } catch (error: any) {
      console.error(`[Health] ❌ 检查健康状态失败:`, error.message);
      // 出错时默认健康（避免全部不可用）
      return true;
    }
  }
  
  /**
   * 🔥 LiteLLM: 恢复健康状态
   */
  private async recoverHealth(channelId: string): Promise<void> {
    try {
      // 删除 Redis 冷却标记
      await redisService.del(`deployment:cooldown:${channelId}`);
      
      // 更新数据库状态
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          isHealthy: true,
          cooldownUntil: null,
          failureCount: 0,  // 重置失败计数
        },
      });
      
      console.log(`[Health] ✅ Deployment ${channelId} 已恢复健康`);
    } catch (error: any) {
      console.error(`[Health] ❌ 恢复健康状态失败:`, error.message);
    }
  }
  
  /**
   * 获取冷却剩余时间（秒）
   */
  async getCooldownRemaining(channelId: string): Promise<number> {
    try {
      const cooldownEnd = await redisService.get(`deployment:cooldown:${channelId}`);
      if (!cooldownEnd) return 0;
      
      const now = Date.now();
      const end = parseInt(cooldownEnd);
      const remaining = Math.max(0, Math.ceil((end - now) / 1000));
      
      return remaining;
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * 🔥 LiteLLM: 记录成功请求
   */
  async recordSuccess(channelId: string): Promise<void> {
    try {
      // 更新成功指标
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          failureCount: 0,  // 重置失败计数
          lastUsedAt: new Date(),
          totalCalls: { increment: 1 },
          // 成功率计算（简化版）
          successRate: { increment: 0.01 },  // 动态更新
        },
      });
      
      console.log(`[Health] ✅ 记录成功: ${channelId}`);
    } catch (error: any) {
      console.error(`[Health] ❌ 记录成功失败:`, error.message);
    }
  }
  
  /**
   * 🔥 LiteLLM: 记录失败请求
   */
  async recordFailure(channelId: string, errorStatus: number): Promise<void> {
    try {
      // 记录失败
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          failureCount: { increment: 1 },
          lastFailedAt: new Date(),
          successRate: { decrement: 0.01 },  // 动态更新
        },
      });
      
      // 检查是否需要冷却
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { failureCount: true },
      });
      
      // 🔥 LiteLLM: 连续失败超过阈值 → 进入冷却
      if (channel && channel.failureCount >= FAILURE_THRESHOLD) {
        await this.markUnhealthy(channelId, errorStatus);
      } else {
        console.log(`[Health] ⚠️ 记录失败: ${channelId} (${channel?.failureCount}/${FAILURE_THRESHOLD})`);
      }
    } catch (error: any) {
      console.error(`[Health] ❌ 记录失败失败:`, error.message);
    }
  }
  
  /**
   * 获取所有健康的 Channel（过滤冷却中的）
   */
  async getHealthyChannels(channelIds: string[]): Promise<string[]> {
    const healthy: string[] = [];
    
    for (const id of channelIds) {
      if (await this.isHealthy(id)) {
        healthy.push(id);
      }
    }
    
    return healthy;
  }
}

// 导出单例
export const deploymentHealthService = new DeploymentHealthService();

