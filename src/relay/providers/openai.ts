// src/relay/providers/openai.ts
/**
 * 🔥 OpenAI Provider 实现
 */

import { BaseProvider } from './base';

export class OpenAIProvider extends BaseProvider {
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


