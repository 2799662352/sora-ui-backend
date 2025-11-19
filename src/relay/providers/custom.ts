// src/relay/providers/custom.ts
/**
 * 🔥 Custom Provider 实现（通用适配器）
 */

import { BaseProvider } from './base';

export class CustomProvider extends BaseProvider {
  getRequestHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.channel.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
  
  getFullRequestURL(path: string): string {
    return `${this.channel.baseURL}${path}`;
  }
}


