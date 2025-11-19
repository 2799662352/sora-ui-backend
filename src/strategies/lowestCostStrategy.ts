// src/strategies/lowestCostStrategy.ts
/**
 * 🔥 Lowest-Cost 负载均衡策略
 * 
 * 完全参考 LiteLLM lowest_cost.py
 * 
 * 核心逻辑：
 * - 选择 totalCost 最低的 Deployment
 * - 适合成本敏感的场景
 */

import { ILoadBalancingStrategy, Channel, SelectContext } from './ILoadBalancingStrategy';

export class LowestCostStrategy implements ILoadBalancingStrategy {
  readonly name = 'lowest-cost';
  
  /**
   * 🔥 LiteLLM: 选择成本最低的 Deployment
   * 
   * 参考 lowest_cost.py
   */
  async select(channels: Channel[], context?: SelectContext): Promise<Channel> {
    if (channels.length === 0) {
      throw new Error('[LowestCost] 无可用 Channel');
    }
    
    if (channels.length === 1) {
      return channels[0];
    }
    
    // 🔥 LiteLLM: 按总成本排序
    const sorted = [...channels].sort((a, b) => a.totalCost - b.totalCost);
    
    console.log(`[LowestCost] 成本排序:`);
    sorted.slice(0, 3).forEach((ch, idx) => {
      console.log(`  ${idx + 1}. ${ch.name}: $${ch.totalCost.toFixed(4)}`);
    });
    
    const selected = sorted[0];
    console.log(`[LowestCost] ✅ 选择 ${selected.name} ($${selected.totalCost.toFixed(4)})`);
    
    return selected;
  }
}

// 导出单例
export const lowestCostStrategy = new LowestCostStrategy();

