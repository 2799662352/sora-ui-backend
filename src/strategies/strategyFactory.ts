// src/strategies/strategyFactory.ts
/**
 * 🔥 负载均衡策略工厂
 * 
 * 完全参考 LiteLLM router.py 策略加载机制
 */

import { ILoadBalancingStrategy } from './ILoadBalancingStrategy';
import { simpleShuffleStrategy } from './simpleShuffleStrategy';
import { leastBusyStrategy } from './leastBusyStrategy';
import { lowestCostStrategy } from './lowestCostStrategy';

/**
 * 策略类型
 */
export type StrategyType = 'simple-shuffle' | 'least-busy' | 'lowest-cost';

/**
 * 🔥 LiteLLM: 策略注册表
 * 
 * 参考 router.py Line 50-80 的策略加载机制
 */
const STRATEGY_REGISTRY: Record<StrategyType, ILoadBalancingStrategy> = {
  'simple-shuffle': simpleShuffleStrategy,
  'least-busy': leastBusyStrategy,
  'lowest-cost': lowestCostStrategy,
};

export class StrategyFactory {
  /**
   * 获取策略实例
   */
  static getStrategy(type: StrategyType = 'simple-shuffle'): ILoadBalancingStrategy {
    const strategy = STRATEGY_REGISTRY[type];
    
    if (!strategy) {
      console.warn(`[StrategyFactory] ⚠️ 未知策略: ${type}，使用默认策略`);
      return STRATEGY_REGISTRY['simple-shuffle'];
    }
    
    console.log(`[StrategyFactory] 📊 使用策略: ${strategy.name}`);
    return strategy;
  }
  
  /**
   * 获取所有可用策略
   */
  static getAllStrategies(): string[] {
    return Object.keys(STRATEGY_REGISTRY);
  }
}

// 导出默认策略
export const defaultStrategy = simpleShuffleStrategy;

