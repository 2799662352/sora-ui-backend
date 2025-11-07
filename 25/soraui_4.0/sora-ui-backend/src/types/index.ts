// src/types/index.ts
// 后端类型定义

export interface User {
  id: string;
  username: string;
  email?: string;
  password: string; // 加密后的密码
  createdAt: number;
  updatedAt: number;
}

export interface AuthSession {
  token: string;
  user: {
    id: string;
    username: string;
    email?: string;
  };
  expiresAt: number;
}

export enum LicenseType {
  TRIAL = 'trial',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum Feature {
  BASIC_GENERATION = 'basic_generation',
  ADVANCED_FEATURES = 'advanced_features',
  BATCH_PROCESSING = 'batch_processing',
  PRIORITY_SUPPORT = 'priority_support',
  CUSTOM_BRANDING = 'custom_branding',
}

export interface License {
  id: string;
  licenseKey: string;
  type: LicenseType;
  userId?: string;
  activatedAt?: number;
  expiresAt?: number;
  features: Feature[];
  createdAt: number;
  updatedAt: number;
}

export interface UpdateInfo {
  version: string;
  releaseNotes: string;
  releaseDate: string;
  downloadUrl: {
    win32: string;
    darwin: string;
    linux: string;
  };
  mandatory: boolean;
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
}

export interface APIResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string | APIError; // 支持字符串或结构化错误
}
