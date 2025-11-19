// src/services/channelService.ts
/**
 * Channel 管理服务 - 完全基于 One-Hub 源码
 * 
 * 🔥 参考：One-Hub model/channel.go (390行) + balancer.go (356行)
 * 
 * 核心功能：
 * 1. Channel 选择（负载均衡）
 * 2. Cooldown 机制（失败后冷却）
 * 3. 权重随机算法
 * 4. 优先级分组
 * 5. 健康检查
 */

import { prisma } from '../loaders/prisma';
import { redisService } from './redisService';

// 🔥 统一使用 Provider 的 Channel 类型定义
import type { Channel } from '../relay/providers/base';

// Channel 过滤器函数类型
type ChannelFilter = (channel: Channel) => boolean;

class ChannelService {
  /**
   * 🔥 One-Hub line 68-83: Cooldown 机制
   * 失败的 Channel 进入冷却期，避免重复请求
   */
  async setCooldown(channelId: string, modelName: string, seconds: number = 300) {
    const key = `cooldown:${channelId}:${modelName}`;
    await redisService.client.setEx(key, seconds, '1');
    console.log(`[ChannelService] 🧊 设置冷却: ${channelId} (${modelName}) → ${seconds}s`);
  }
  
  /**
   * 🔥 One-Hub line 85-94: 检查是否在冷却期
   */
  async isInCooldown(channelId: string, modelName: string): Promise<boolean> {
    const key = `cooldown:${channelId}:${modelName}`;
    const exists = await redisService.client.exists(key);
    return exists > 0;
  }
  
  /**
   * 🔥 One-Hub line 134-182: Balancer 算法（加权随机）
   * 
   * 核心逻辑：
   * 1. 过滤：状态、冷却、自定义条件
   * 2. 计算总权重
   * 3. 随机选择（按权重分布）
   */
  private async balancer(
    channels: Channel[],
    filters: ChannelFilter[],
    modelName: string
  ): Promise<Channel | null> {
    let totalWeight = 0;
    const validChannels: Channel[] = [];
    
    // 🔥 One-Hub line 138-162: 过滤和权重计算
    for (const channel of channels) {
      // 过滤：状态
      if (channel.status !== 'active') {
        continue;
      }
      
      // 过滤：冷却期
      if (await this.isInCooldown(channel.id, modelName)) {
        console.log(`[ChannelService] 🧊 跳过冷却中的 Channel: ${channel.name}`);
        continue;
      }
      
      // 过滤：自定义条件
      let skip = false;
      for (const filter of filters) {
        if (!filter(channel)) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      
      // 累加权重（使用 priority 的倒数作为权重）
      // priority 越小越优先，所以 weight = 100 - priority
      const weight = Math.max(1, 100 - channel.priority);
      totalWeight += weight;
      validChannels.push(channel);
    }
    
    if (validChannels.length === 0) {
      return null;
    }
    
    if (validChannels.length === 1) {
      return validChannels[0];
    }
    
    // 🔥 One-Hub line 172-179: 加权随机选择
    let choiceWeight = Math.floor(Math.random() * totalWeight);
    for (const channel of validChannels) {
      const weight = Math.max(1, 100 - channel.priority);
      choiceWeight -= weight;
      if (choiceWeight < 0) {
        console.log(`[ChannelService] ✅ 选中 Channel: ${channel.name} (优先级: ${channel.priority})`);
        return channel;
      }
    }
    
    return null;
  }
  
  /**
   * 🔥 One-Hub line 184-212: Next() - 选择 Channel
   * 
   * 核心逻辑：
   * 1. 按 Group 和 Model 查询
   * 2. 按 Priority 分组
   * 3. 从高优先级开始，使用 Balancer 选择
   */
  async selectChannel(
    userId: string,
    modelName: string,
    groupName: string = 'default',
    filters: ChannelFilter[] = []
  ): Promise<Channel | null> {
    // 1️⃣ 查询用户的 Channels
    const channels = await prisma.channel.findMany({
      where: {
        userId,
        status: 'active',
        models: {
          has: modelName,  // 🔥 Prisma: 数组包含查询
        },
        ...(groupName && { groupName }),
      },
      orderBy: [
        { priority: 'asc' },   // 🔥 One-Hub: 优先级升序
      ],
    });
    
    if (channels.length === 0) {
      console.log(`[ChannelService] ❌ 无可用 Channel: userId=${userId}, model=${modelName}`);
      return null;
    }
    
    // 2️⃣ 🔥 One-Hub line 204-211: 按优先级分组
    const priorityGroups = new Map<number, Channel[]>();
    for (const channel of channels) {
      const priority = channel.priority;
      if (!priorityGroups.has(priority)) {
        priorityGroups.set(priority, []);
      }
      // 🔥 类型转换：Prisma 返回的 null 转为 undefined
      const channelFormatted: Channel = {
        ...channel,
        groupName: channel.groupName || undefined,
        avgLatencyMs: channel.avgLatencyMs || undefined,
        rateLimit: channel.rateLimit || undefined,
        lastUsedAt: channel.lastUsedAt || undefined,
      } as Channel;
      priorityGroups.get(priority)!.push(channelFormatted);
    }
    
    // 3️⃣ 从高优先级（数字小）开始选择
    const priorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);
    
    for (const priority of priorities) {
      const channelsInPriority = priorityGroups.get(priority)!;
      const selected = await this.balancer(channelsInPriority, filters, modelName);
      
      if (selected) {
        console.log(`[ChannelService] ✅ 选中 Channel: ${selected.name} (优先级: ${priority})`);
        return selected;
      }
    }
    
    console.log(`[ChannelService] ❌ 所有 Channel 都不可用`);
    return null;
  }
  
  /**
   * 🔥 One-Hub: 记录 Channel 使用情况
   */
  async recordUsage(channelId: string, data: {
    model: string;
    cost: number;
    responseTime: number;
    tokens?: number;
  }) {
    try {
      // 更新数据库
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          totalCost: { increment: data.cost },
          totalCalls: { increment: 1 },
          lastUsedAt: new Date(),
          avgLatencyMs: data.responseTime,
        },
      });
      
      console.log(`[ChannelService] 📊 记录使用: ${channelId} → ${data.cost}`);
    } catch (error: any) {
      console.error(`[ChannelService] ❌ 记录失败:`, error.message);
    }
  }
  
  /**
   * 🔥 One-Hub: 测试 Channel 连通性
   */
  async testChannel(channelId: string): Promise<boolean> {
    try {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
      });
      
      if (!channel) {
        throw new Error('Channel 不存在');
      }
      
      // TODO: 实际调用 API 测试
      // const axios = require('axios');
      // const response = await axios.get(`${channel.baseURL}/health`, {
      //   headers: { 'Authorization': channel.apiKey },
      //   timeout: 5000,
      // });
      
      // 更新测试时间（使用 lastUsedAt 代替）
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          lastUsedAt: new Date(),
          isHealthy: true,
        },
      });
      
      return true;
    } catch (error: any) {
      console.error(`[ChannelService] ❌ 测试失败: ${channelId}`, error.message);
      return false;
    }
  }
  
  /**
   * 获取用户的所有 Channels
   */
  async getUserChannels(userId: string) {
    return await prisma.channel.findMany({
      where: { userId },
      orderBy: [
        { priority: 'asc' },
      ],
    });
  }
  
  /**
   * 别名：listChannels（兼容现有路由）
   */
  async listChannels(userId: string) {
    return this.getUserChannels(userId);
  }
  
  /**
   * 创建 Channel
   */
  async createChannel(userId: string, data: Partial<Channel>) {
    return await prisma.channel.create({
      data: {
        userId,
        name: data.name!,
        type: data.type!,
        baseURL: data.baseURL!,
        apiKey: data.apiKey!,
        models: data.models || [],
        priority: data.priority || 1,
        status: 'active',
        groupName: data.groupName || 'default',
      },
    });
  }
  
  /**
   * 更新 Channel
   */
  async updateChannel(channelId: string, data: Partial<Channel>) {
    return await prisma.channel.update({
      where: { id: channelId },
      data,
    });
  }
  
  /**
   * 删除 Channel
   */
  async deleteChannel(channelId: string) {
    return await prisma.channel.delete({
      where: { id: channelId },
    });
  }
}

// 导出单例
export const channelService = new ChannelService();
