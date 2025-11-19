// src/services/redisService.ts
/**
 * Redis 缓存服务
 * 
 * 完全参考 LiteLLM redis_cache.py (1346行) 实现
 * 
 * 核心功能：
 * - 任务状态缓存（热数据，TTL 1小时）
 * - 轮询计数器（原子递增）
 * - SSE Session 管理（Set 操作）
 * - Namespace 隔离
 * - 健康检查
 * - 性能监控
 */

import { createClient, RedisClientType } from 'redis';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  namespace?: string;
  socketTimeout?: number;
  defaultTTL?: number;
}

class RedisService {
  public client: RedisClientType;  // 🔥 改为 public
  private connected = false;
  private namespace: string;
  private defaultTTL: number;
  
  // 🔥 简单方法别名（兼容新代码）
  get = (key: string) => this.asyncGetCache(key);
  set = (key: string, value: string, mode?: string, duration?: number) => {
    if (mode === 'EX' && duration) {
      return this.asyncSetCache(key, value, duration);
    }
    return this.asyncSetCache(key, value);
  };
  del = (key: string) => this.client.del(this.addNamespace(key));
  
  constructor(config?: Partial<RedisConfig>) {
    // 🔥 LiteLLM: 命名空间隔离
    this.namespace = config?.namespace || 'sora-ui';
    
    // 🔥 LiteLLM: 默认 TTL 60秒，我们用 1小时
    this.defaultTTL = config?.defaultTTL || 3600;
    
    const host = config?.host || process.env.REDIS_HOST || 'localhost';
    const port = config?.port || parseInt(process.env.REDIS_PORT || '6379');
    const password = config?.password || process.env.REDIS_PASSWORD;
    
    // 🔥 LiteLLM: 创建 Redis 客户端（连接池）
    this.client = createClient({
      url: password 
        ? `redis://:${password}@${host}:${port}`
        : `redis://${host}:${port}`,
      socket: {
        // 🔥 LiteLLM: 指数退避重连
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: config?.socketTimeout || 5000,
        keepAlive: 5000,
      },
    });
    
    // 🔥 LiteLLM: 事件监听
    this.client.on('error', (err) => {
      console.error('[Redis] ❌ Error:', err);
    });
    
    this.client.on('connect', () => {
      console.log('[Redis] 🔗 Connecting...');
    });
    
    this.client.on('ready', () => {
      this.connected = true;
      console.log('[Redis] ✅ Ready');
      console.log(`[Redis] 📋 Namespace: ${this.namespace}`);
      console.log(`[Redis] ⏰ Default TTL: ${this.defaultTTL}s`);
    });
    
    this.client.on('end', () => {
      this.connected = false;
      console.log('[Redis] 🔌 Disconnected');
    });
  }
  
  /**
   * 🔥 LiteLLM: 连接到 Redis
   */
  async connect() {
    if (!this.connected) {
      try {
        await this.client.connect();
        
        // 🔥 LiteLLM: 健康检查
        await this.client.ping();
        console.log('[Redis] ✅ Health check passed');
      } catch (error) {
        console.error('[Redis] ❌ Connection failed:', error);
        throw error;
      }
    }
  }
  
  /**
   * 🔥 LiteLLM: 添加命名空间前缀
   */
  private addNamespace(key: string): string {
    if (this.namespace && !key.startsWith(this.namespace)) {
      return `${this.namespace}:${key}`;
    }
    return key;
  }
  
  /**
   * 🔥 LiteLLM: 异步设置缓存
   */
  async asyncSetCache(key: string, value: any, ttl?: number): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      key = this.addNamespace(key);
      const _ttl = ttl || this.defaultTTL;
      
      // 🔥 LiteLLM: JSON 序列化
      const serialized = JSON.stringify(value);
      
      // 设置缓存
      await this.client.setEx(key, _ttl, serialized);
      
      // 🔥 LiteLLM: 性能监控
      const duration = Date.now() - startTime;
      console.log(`[Redis] ✅ Set: ${key} (${duration}ms, TTL: ${_ttl}s)`);
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Redis] ❌ Set failed: ${key} (${duration}ms)`, error);
      return false;  // 🔥 LiteLLM: 失败不抛异常
    }
  }
  
  /**
   * 🔥 LiteLLM: 异步获取缓存
   */
  async asyncGetCache(key: string): Promise<any | null> {
    const startTime = Date.now();
    
    try {
      key = this.addNamespace(key);
      
      const cached = await this.client.get(key);
      
      if (cached === null) {
        console.log(`[Redis] ⚠️ Miss: ${key} (${Date.now() - startTime}ms)`);
        return null;
      }
      
      // 🔥 LiteLLM: JSON 反序列化
      try {
        const parsed = JSON.parse(cached);
        console.log(`[Redis] ✅ Hit: ${key} (${Date.now() - startTime}ms)`);
        return parsed;
      } catch {
        // 不是 JSON，返回原始字符串
        return cached;
      }
    } catch (error) {
      console.error(`[Redis] ❌ Get failed: ${key}`, error);
      return null;  // 🔥 LiteLLM: 失败返回 null
    }
  }
  
  /**
   * 🔥 LiteLLM: 原子递增（用于计数器）
   */
  async increment(key: string, amount: number = 1, ttl?: number): Promise<number> {
    try {
      key = this.addNamespace(key);
      
      // 🔥 LiteLLM: 原子递增
      // ⚠️ 如果 value 是浮点数，使用 incrByFloat
      const isFloat = !Number.isInteger(amount);
      const newValue = isFloat 
        ? await this.client.incrByFloat(key, amount)
        : await this.client.incrBy(key, amount);
      
      // 🔥 LiteLLM: 仅当首次创建时设置 TTL
      if (ttl && Number(newValue) === amount) {
        await this.client.expire(key, ttl);
      }
      
      return Number(newValue);
    } catch (error) {
      console.error(`[Redis] ❌ Increment failed: ${key}`, error);
      return 0;
    }
  }
  
  /**
   * 🔥 LiteLLM: 删除缓存
   */
  async delete(key: string): Promise<boolean> {
    try {
      key = this.addNamespace(key);
      await this.client.del(key);
      console.log(`[Redis] 🗑️ Deleted: ${key}`);
      return true;
    } catch (error) {
      console.error(`[Redis] ❌ Delete failed: ${key}`, error);
      return false;
    }
  }
  
  /**
   * 🔥 新增：Set 操作（用于 SSE Session 管理）
   */
  async addToSet(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      key = this.addNamespace(key);
      await this.client.sAdd(key, value);
      
      if (ttl) {
        await this.client.expire(key, ttl);
      }
      
      return true;
    } catch (error) {
      console.error(`[Redis] ❌ Set add failed:`, error);
      return false;
    }
  }
  
  async getSetMembers(key: string): Promise<string[]> {
    try {
      key = this.addNamespace(key);
      return await this.client.sMembers(key);
    } catch (error) {
      console.error(`[Redis] ❌ Set members failed:`, error);
      return [];
    }
  }
  
  async removeFromSet(key: string, value: string): Promise<boolean> {
    try {
      key = this.addNamespace(key);
      await this.client.sRem(key, value);
      return true;
    } catch (error) {
      console.error(`[Redis] ❌ Set remove failed:`, error);
      return false;
    }
  }
  
  /**
   * 健康检查
   */
  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      console.error('[Redis] ❌ Ping failed:', error);
      return false;
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      connected: this.connected,
      namespace: this.namespace,
      defaultTTL: this.defaultTTL,
    };
  }
  
  /**
   * 🔥 One Hub: Redis List 操作（用于限流）
   */
  async lpush(key: string, value: string): Promise<number> {
    if (!this.client) return 0;
    const fullKey = this.addNamespace(key);
    return await this.client.lPush(fullKey, value);
  }
  
  async llen(key: string): Promise<number> {
    if (!this.client) return 0;
    const fullKey = this.addNamespace(key);
    return await this.client.lLen(fullKey);
  }
  
  async lindex(key: string, index: number): Promise<string | null> {
    if (!this.client) return null;
    const fullKey = this.addNamespace(key);
    return await this.client.lIndex(fullKey, index);
  }
  
  async ltrim(key: string, start: number, stop: number): Promise<string> {
    if (!this.client) return 'OK';
    const fullKey = this.addNamespace(key);
    return await this.client.lTrim(fullKey, start, stop);
  }
  
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client) return false;
    const fullKey = this.addNamespace(key);
    return await this.client.expire(fullKey, seconds);
  }
  
  /**
   * 关闭连接
   */
  async disconnect() {
    if (this.connected) {
      await this.client.quit();
      console.log('[Redis] 👋 Disconnected gracefully');
    }
  }
}

// 🔥 LiteLLM: 单例模式
let redisServiceInstance: RedisService | null = null;

export function getRedisService(): RedisService {
  if (!redisServiceInstance) {
    redisServiceInstance = new RedisService();
  }
  return redisServiceInstance;
}

export const redisService = getRedisService();
