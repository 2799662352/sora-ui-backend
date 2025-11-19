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

// ============ 视频任务相关类型 ============

export enum TaskStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum MediaType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
}

export interface VideoTask {
  id: string;
  videoId: string;
  userId: string;
  status: TaskStatus;
  progress: number;
  prompt: string;
  model: string;
  size?: string;
  duration?: number;
  watermark: boolean;
  aspectRatio?: string;
  referenceImage?: string;
  apiConfigId?: string;
  apiEndpoint?: string;
  videoUrl?: string;
  imageUrl?: string;
  mediaType: MediaType;
  taskId?: string;
  isAsync: boolean;
  pollCount: number;
  lastPollTime?: Date;
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata: any;
}

export interface CreateVideoTaskRequest {
  prompt: string;
  model: string;
  size?: string;
  duration?: number;
  watermark?: boolean;
  aspectRatio?: string;
  referenceImage?: string;
  apiConfigId?: string;
}

export interface VideoTaskListResponse {
  tasks: VideoTask[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VideoTaskStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
}
