// src/strategies/simpleShuffleStrategy.ts
/**
 * 🔥 Simple-Shuffle 负载均衡策略
 * 
 * 完全参考 LiteLLM simple_shuffle.py
 * 
 * 核心逻辑：
 * - 基于权重（priority）的加权随机选择
 * - 默认策略，简单高效
 */

import { ILoadBalancingStrategy, Channel, SelectContext } from './ILoadBalancingStrategy';

export class SimpleShuffleStrategy implements ILoadBalancingStrategy {
  readonly name = 'simple-shuffle';
  
  /**
   * 🔥 LiteLLM: 加权随机选择
   * 
   * 参考 simple_shuffle.py
   */
  async select(channels: Channel[], context?: SelectContext): Promise<Channel> {
    if (channels.length === 0) {
      throw new Error('[SimpleS huffle] 无可用 Channel');
    }
    
    if (channels.length === 1) {
      return channels[0];
    }
    
    // 🔥 LiteLLM: 计算总权重
    const totalWeight = channels.reduce((sum, ch) => sum + ch.priority, 0);
    
    // 随机数
    let random = Math.random() * totalWeight;
    
    // 加权选择
    for (const channel of channels) {
      random -= channel.priority;
      if (random <= 0) {
        console.log(`[SimpleShuffle] ✅ 选择 ${channel.name} (权重: ${channel.priority}/${totalWeight})`);
        return channel;
      }
    }
    
    // 兜底（理论上不会到达）
    return channels[channels.length - 1];
  }
}

// 导出单例
export const simpleShuffleStrategy = new SimpleShuffleStrategy();

