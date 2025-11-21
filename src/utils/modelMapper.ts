// src/utils/modelMapper.ts
/**
 * Model 名称映射工具
 * 
 * 将前端的model名称映射为外部API支持的标准格式
 * 参考：https://docs2.tokens-pool.top/platform/sora.html
 */

export interface MappedModel {
  model: string;
  aspectRatio?: string;
  duration?: number;
}

/**
 * 将前端的model名称映射为外部API支持的格式
 * 
 * @param frontendModel - 前端model名称（如 'sora_video2-landscape'）
 * @returns 映射后的配置
 */
export function mapModelName(frontendModel: string): MappedModel {
  // 🔥 映射规则（基于外部API文档）
  const mapping: Record<string, MappedModel> = {
    // === 标准模型 ===
    'sora_video2': { 
      model: 'sora_video2' 
    },
    'sora-2': { 
      model: 'sora-2' 
    },
    
    // === 横屏模型 ===
    'sora_video2-landscape': { 
      model: 'sora_video2', 
      aspectRatio: '16:9' 
    },
    'sora_video2-landscape-15s': { 
      model: 'sora_video2', 
      aspectRatio: '16:9', 
      duration: 15 
    },
    'sora_video2-landscape-25s|[pro]': { 
      model: 'sora_video2-pro', 
      aspectRatio: '16:9', 
      duration: 25 
    },
    'sora_video2-landscape-hd-25s|[pro]': { 
      model: 'sora_video2-pro', 
      aspectRatio: '16:9', 
      duration: 25 
    },
    
    // === 竖屏模型 ===
    'sora_video2-portrait': { 
      model: 'sora_video2', 
      aspectRatio: '9:16' 
    },
    'sora_video2-portrait-15s': { 
      model: 'sora_video2', 
      aspectRatio: '9:16', 
      duration: 15 
    },
    
    // === Pro模型 ===
    'sora_video2-pro': { 
      model: 'sora_video2-pro' 
    },
    'sora-2-pro-landscape': { 
      model: 'sora_video2-pro', 
      aspectRatio: '16:9' 
    },
    'sora-2-pro-portrait': { 
      model: 'sora_video2-pro', 
      aspectRatio: '9:16' 
    },
    
    // === 特殊模型 ===
    'sora_video2-15s': { 
      model: 'sora_video2', 
      aspectRatio: '9:16', 
      duration: 15 
    },
  };
  
  const result = mapping[frontendModel];
  
  if (!result) {
    console.warn(`[ModelMapper] ⚠️ 未知的model: ${frontendModel}，使用默认值`);
    return { model: 'sora_video2' };
  }
  
  console.log(`[ModelMapper] ✅ 映射: ${frontendModel} → ${result.model}`);
  if (result.aspectRatio) {
    console.log(`[ModelMapper]   - 宽高比: ${result.aspectRatio}`);
  }
  if (result.duration) {
    console.log(`[ModelMapper]   - 时长: ${result.duration}秒`);
  }
  
  return result;
}

/**
 * 根据aspectRatio确定size
 */
export function getSizeByAspectRatio(aspectRatio: string): string {
  if (aspectRatio === '9:16') {
    return '720x1280';  // 竖屏
  } else if (aspectRatio === '16:9') {
    return '1280x720';  // 横屏
  } else {
    return '720x720';   // 方形
  }
}



















