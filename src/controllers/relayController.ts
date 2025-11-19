// src/controllers/relayController.ts
/**
 * 🔥 增强版 Relay Controller（完全参考 LiteLLM Router）
 * 
 * 核心功能：
 * - 请求转发与中转
 * - 🔥 自动重试（失败切换 Deployment）
 * - 🔥 健康检查（LiteLLM Cooldown）
 * - 🔥 成本追踪（LiteLLM SpendTracking）
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { channelService } from '../services/channelService';
import { deploymentHealthService } from '../services/deploymentHealthService';
import { costTrackingService } from '../services/costTrackingService';
import { ProviderFactory } from '../relay/providers/factory';
import { StrategyType } from '../strategies/strategyFactory';
import { leastBusyStrategy } from '../strategies/leastBusyStrategy';

interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

/**
 * 🔥 LiteLLM Router: RelayWithRetry
 * 
 * 转发视频生成请求（支持自动重试）
 */
export const relayVideoGeneration = async (req: AuthRequest, res: Response) => {
  const requestId = uuidv4();
  const startTime = new Date();
  const model = req.body.model || 'sora-1.0';
  const userId = req.user!.id;
  
  // 🔥 LiteLLM: 最多重试 3 次
  const maxRetries = 3;
  let lastError: any;
  let attemptCount = 0;
  
  console.log(`[Relay] 🚀 开始请求: ${requestId} (模型: ${model})`);
  
  // 🔥 LiteLLM: 自动重试循环
  for (let retry = 0; retry < maxRetries; retry++) {
    attemptCount++;
    let channelId: string | undefined;
    
    try {
      // 1️⃣ 🔥 LiteLLM: 选择健康的 Channel
      const groupName = (req as any).channelGroup?.name || 'default';
      
      const channel = await channelService.selectChannel(
        userId,
        model,
        groupName
      );
      
      if (!channel) {
        return res.status(503).json({
          success: false,
          error: '无可用 Channel',
          message: '所有 Channel 都不可用或正在冷却中',
        });
      }
      
      channelId = channel.id;
      
      console.log(`[Relay] 🎯 尝试 #${attemptCount}: ${channel.name} (组: ${groupName})`);
      
      // 2️⃣ 🔥 LiteLLM: 记录请求开始（Least-Busy 策略需要）
      if (leastBusyStrategy.onRequestStart) {
        await leastBusyStrategy.onRequestStart(channel.id, { model, userId });
      }
      
      // 3️⃣ 创建 Provider 并发送请求
      const provider = ProviderFactory.create(channel);
      const url = provider.getFullRequestURL('/v1/videos');
      const requestBody = provider.convertRequest(req.body);
      
      console.log(`[Relay] 📤 转发到: ${url}`);
      
      const response = await provider.doRequest(url, requestBody);
      const endTime = new Date();
      
      // 4️⃣ 🔥 LiteLLM: 成功 → 记录指标
      await deploymentHealthService.recordSuccess(channel.id);
      
      // 5️⃣ 🔥 LiteLLM: 记录请求结束
      if (leastBusyStrategy.onRequestEnd) {
        await leastBusyStrategy.onRequestEnd(channel.id, true, { model, userId });
      }
      
      // 6️⃣ 🔥 LiteLLM: 成本追踪
      const tokens = {
        total: response.tokens?.total || 1000,
        prompt: response.tokens?.prompt || 500,
        completion: response.tokens?.completion || 500,
      };
      
      const cost = costTrackingService.calculateCost({
        model,
        promptTokens: tokens.prompt,
        completionTokens: tokens.completion,
      });
      
      await costTrackingService.trackCost({
        channelId: channel.id,
        userId,
        model,
        cost,
        tokens,
        requestId,
        startTime,
        endTime,
        status: 'success',
      });
      
      // 7️⃣ 返回成功响应
      const requestTimeMs = endTime.getTime() - startTime.getTime();
      
      console.log(`[Relay] ✅ 请求成功 #${attemptCount} (${requestTimeMs}ms, $${cost.toFixed(6)})`);
      
      return res.json({
        success: true,
        data: provider.convertResponse(response),
        channel: {
          id: channel.id,
          name: channel.name,
          type: channel.type,
        },
        requestTime: requestTimeMs,
        cost,
        attempts: attemptCount,
      });
      
    } catch (error: any) {
      lastError = error;
      const errorStatus = error.response?.status || 500;
      
      console.error(`[Relay] ❌ 尝试 #${attemptCount} 失败:`, error.message, `(HTTP ${errorStatus})`);
      
      // 🔥 LiteLLM: 记录失败
      if (channelId) {
        await deploymentHealthService.recordFailure(channelId, errorStatus);
        
        // 记录请求结束（失败）
        if (leastBusyStrategy.onRequestEnd) {
          await leastBusyStrategy.onRequestEnd(channelId, false, { model, userId });
        }
        
        // 记录失败成本（可选）
        const endTime = new Date();
        await costTrackingService.trackCost({
          channelId,
          userId,
          model,
          cost: 0,
          tokens: { total: 0, prompt: 0, completion: 0 },
          requestId,
          startTime,
          endTime,
          status: 'error',
          errorMessage: error.message,
          httpStatus: errorStatus,
        });
      }
      
      // 🔥 LiteLLM: 如果不是最后一次，继续重试
      if (retry < maxRetries - 1) {
        console.log(`[Relay] 🔄 准备重试 #${retry + 2}...`);
        continue;
      }
    }
  }
  
  // 🔥 所有重试都失败
  console.error(`[Relay] 💥 所有重试失败 (${maxRetries} 次)`);
  
  return res.status(lastError?.response?.status || 500).json({
    success: false,
    error: lastError?.message || 'All retries failed',
    type: 'relay_error',
    attempts: attemptCount,
  });
};

/**
 * 查询任务状态（中转）
 */
export const relayTaskQuery = async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const { channelId } = req.query;
    
    // 获取 Channel
    const { prisma } = await import('../loaders/prisma');
    const channel = await prisma.channel.findUnique({
      where: { id: channelId as string }
    });
    
    if (!channel || channel.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // 创建 Provider
    const provider = ProviderFactory.create(channel as any);
    
    // 查询状态
    const url = provider.getFullRequestURL(`/v1/videos/${taskId}`);
    const response = await provider.doRequest(url, {});
    
    res.json({
      success: true,
      data: provider.convertResponse(response)
    });
    
  } catch (error: any) {
    res.status(500).json({
      error: error.message
    });
  }
};
