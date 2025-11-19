// src/strategies/ILoadBalancingStrategy.ts
/**
 * 🔥 负载均衡策略接口
 * 
 * 参考 LiteLLM router_strategy/
 * 
 * 支持多种策略：
 * - simple-shuffle: 简单随机（默认）
 * - least-busy: 最少繁忙
 * - lowest-cost: 最低成本
 * - lowest-latency: 最低延迟
 */

export interface Channel {
  id: string;
  userId: string;  // 🔥 添加 userId（Provider需要）
  name: string;
  type: string;
  baseURL: string;
  apiKey: string;
  models: string[];
  priority: number;
  status: string;
  groupName?: string;  // 🔥 修复：移除 null
  rateLimit?: number;  // 🔥 修复：移除 null
  tpmLimit?: bigint;   // 🔥 修复：移除 null
  maxParallelReqs?: number;  // 🔥 修复：移除 null
  
  // 🔥 LiteLLM: 成本统计
  totalCost: number;
  spendToday: number;
  spendThisMonth: number;
  modelSpend?: any;
  
  // 🔥 LiteLLM: 预算
  maxBudget?: number;
  softBudget?: number;
  budgetResetAt?: Date;
  
  // 🔥 LiteLLM: 健康状态
  isHealthy: boolean;
  failureCount: number;
  cooldownUntil?: Date;
  lastFailedAt?: Date;
  
  // 🔥 LiteLLM: 性能指标
  avgLatencyMs?: number;
  successRate: number;
  activeRequests: number;
  
  totalCalls: number;
  lastUsedAt?: Date;
  metadata?: any;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 负载均衡策略接口
 */
export interface ILoadBalancingStrategy {
  /**
   * 策略名称
   */
  readonly name: string;
  
  /**
   * 从可用的 Channels 中选择一个
   * 
   * @param channels 可用的 Channel 列表（已过滤健康状态）
   * @param context 额外上下文（如模型名称）
   * @returns 选中的 Channel
   */
  select(channels: Channel[], context?: SelectContext): Promise<Channel>;
  
  /**
   * 请求开始前调用（可选）
   */
  onRequestStart?(channelId: string, context?: SelectContext): Promise<void>;
  
  /**
   * 请求结束后调用（可选）
   */
  onRequestEnd?(channelId: string, success: boolean, context?: SelectContext): Promise<void>;
}

/**
 * 选择上下文
 */
export interface SelectContext {
  model?: string;          // 模型名称
  userId?: string;         // 用户ID
  estimatedTokens?: number;// 预估 token 数
  metadata?: any;          // 其他元数据
}

