// src/utils/errorParser.ts
/**
 * 智能错误解析器
 * 
 * 支持多种外部API的error格式：
 * - 格式1: { error: { message: "xxx", type: "yyy" } }
 * - 格式2: { error: "simple string" }
 * - 格式3: { error: { message: "{nested json}" } }
 * - 格式4: { error: { detail: { code: "xxx", message: "yyy" } } }
 * - 格式5: { message: "xxx", code: "yyy" }
 */

export interface ParsedError {
  message: string;      // 用户可读的错误信息
  code?: string;        // 错误代码
  type?: string;        // 错误类型
  raw: any;             // 原始错误数据
}

/**
 * 智能解析error，支持多种格式
 */
export function parseError(error: any): ParsedError {
  if (!error) {
    return {
      message: '未知错误',
      raw: null,
    };
  }

  // 格式1: error是简单字符串
  if (typeof error === 'string') {
    return {
      message: error,
      raw: error,
    };
  }

  // 格式2: error.message存在
  if (error.message) {
    // 尝试解析嵌套JSON（格式3）
    if (typeof error.message === 'string' && error.message.startsWith('{')) {
      try {
        const nested = JSON.parse(error.message);
        
        // 格式3a: { detail: { code, message } }
        if (nested.detail) {
          return {
            message: nested.detail.message || nested.message || error.message,
            code: nested.detail.code || nested.code,
            type: error.type || nested.type,
            raw: error,
          };
        }
        
        // 格式3b: { code, message }
        if (nested.message) {
          return {
            message: nested.message,
            code: nested.code,
            type: error.type || nested.type,
            raw: error,
          };
        }
      } catch (e) {
        // 解析失败，使用原始message
      }
    }
    
    // 普通message
    return {
      message: error.message,
      code: error.code,
      type: error.type,
      raw: error,
    };
  }

  // 格式4: error.detail存在
  if (error.detail) {
    return {
      message: error.detail.message || JSON.stringify(error.detail),
      code: error.detail.code,
      type: error.type,
      raw: error,
    };
  }

  // 格式5: 未知格式，转为JSON字符串
  return {
    message: JSON.stringify(error),
    raw: error,
  };
}

/**
 * 格式化error为用户友好的字符串
 */
export function formatErrorForDisplay(error: any): string {
  const parsed = parseError(error);
  
  let display = '';
  
  // 添加错误代码（如果有）
  if (parsed.code || parsed.type) {
    display += `[${parsed.code || parsed.type}] `;
  }
  
  // 添加错误消息
  display += parsed.message;
  
  return display;
}

/**
 * 格式化error为JSON字符串（完整信息）
 */
export function formatErrorForStorage(error: any): string {
  if (typeof error === 'string') {
    return error;
  }
  
  return JSON.stringify(error, null, 2);
}














