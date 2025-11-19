// src/relay/providers/factory.ts
/**
 * 🔥 Provider Factory
 * 
 * 参考 One Hub 设计模式
 */

import { IProvider, Channel } from './base';
import { SoraProvider } from './sora';
import { OpenAIProvider } from './openai';
import { CustomProvider } from './custom';

export class ProviderFactory {
  static create(channel: Channel): IProvider {
    switch (channel.type.toLowerCase()) {
      case 'sora':
        return new SoraProvider(channel);
      
      case 'openai':
      case 'azure':
        return new OpenAIProvider(channel);
      
      case 'custom':
        return new CustomProvider(channel);
      
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`);
    }
  }
}


