// src/relay/providers/base.ts
/**
 * 🔥 完全参考 One Hub relay/adaptor.go
 * 
 * Provider 模式：统一不同 AI 提供商的接口
 * 
 * One Hub 核心设计：
 * - ConvertRequest: 将请求转换为提供商格式
 * - DoRequest: 发送请求到提供商
 * - ConvertResponse: 将响应转换为统一格式
 */

export interface Channel {
  id: string;
  userId: string;
  name: string;
  type: string;
  baseURL: string;
  apiKey: string;
  models: string[];
  priority: number;
  status: string;
  groupName?: string;
  rateLimit?: number;
  totalCost: number;
  totalCalls: number;
}

export interface VideoRequest {
  prompt: string;
  model?: string;
  size?: string;
  duration?: number;
  aspectRatio?: string;
  referenceImage?: string;
}

export interface VideoResponse {
  taskId: string;
  status: string;
  videoUrl?: string;
  imageUrl?: string;
  progress?: number;
  cost?: number;
}

/**
 * 🔥 One Hub: Provider Interface
 */
export interface IProvider {
  getChannel(): Channel;
  getRequestHeaders(): Record<string, string>;
  getFullRequestURL(path: string): string;
  
  // 🔥 One Hub 核心方法
  convertRequest(request: VideoRequest): any;
  doRequest(url: string, data: any): Promise<any>;
  convertResponse(response: any): VideoResponse;
}

/**
 * 🔥 One Hub: Base Provider
 */
export abstract class BaseProvider implements IProvider {
  constructor(protected channel: Channel) {}
  
  getChannel(): Channel {
    return this.channel;
  }
  
  abstract getRequestHeaders(): Record<string, string>;
  abstract getFullRequestURL(path: string): string;
  
  // 默认实现（子类可覆盖）
  convertRequest(request: VideoRequest): any {
    return request;
  }
  
  async doRequest(url: string, data: any): Promise<any> {
    const axios = require('axios');
    const response = await axios.post(url, data, {
      headers: this.getRequestHeaders(),
      timeout: 30000,
      validateStatus: () => true,  // 不自动抛错
    });
    return response.data;
  }
  
  convertResponse(response: any): VideoResponse {
    return response;
  }
}


