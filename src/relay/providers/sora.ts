// src/relay/providers/sora.ts
/**
 * 🔥 Sora Provider 实现
 * 
 * 参考 One Hub relay/openai/adaptor.go
 */

import { BaseProvider, VideoRequest, VideoResponse } from './base';

export class SoraProvider extends BaseProvider {
  getRequestHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.channel.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
  
  getFullRequestURL(path: string): string {
    return `${this.channel.baseURL}${path}`;
  }
  
  convertRequest(request: VideoRequest): any {
    return {
      prompt: request.prompt,
      model: request.model || 'sora-1.0',
      size: request.size,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      ...(request.referenceImage && { reference_image: request.referenceImage }),
    };
  }
  
  convertResponse(response: any): VideoResponse {
    return {
      taskId: response.id || response.task_id,
      status: response.status,
      videoUrl: response.video_url,
      imageUrl: response.image_url,
      progress: response.progress,
      cost: response.cost || 0,
    };
  }
}


