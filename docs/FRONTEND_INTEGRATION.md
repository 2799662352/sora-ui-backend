# 🔗 前端集成指南

本文档说明如何在 Sora UI 前端集成新的视频任务 API。

## 概述

通过集成后端 API，Sora UI 可以实现：
- ✅ 任务持久化存储
- ✅ 跨设备访问历史记录
- ✅ 任务状态实时同步
- ✅ 集中式任务管理

## 集成步骤

### 1. 更新 API 服务层

在 `src/api/backend.ts` 中添加视频任务相关的 API 调用：

```typescript
// src/api/backend.ts
import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// 创建 axios 实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// 请求拦截器 - 添加认证 token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 视频任务 API
export const videoTaskAPI = {
  // 创建任务
  createTask: async (data: {
    prompt: string;
    model: string;
    size?: string;
    duration?: number;
    watermark?: boolean;
    aspectRatio?: string;
    referenceImage?: string;
    apiConfigId?: string;
  }) => {
    const response = await api.post('/api/video/tasks', data);
    return response.data;
  },

  // 获取任务详情
  getTask: async (videoId: string) => {
    const response = await api.get(`/api/video/tasks/${videoId}`);
    return response.data;
  },

  // 获取任务列表
  listTasks: async (params: {
    page?: number;
    pageSize?: number;
    status?: string;
    mediaType?: string;
  }) => {
    const response = await api.get('/api/video/tasks', { params });
    return response.data;
  },

  // 获取任务统计
  getStats: async () => {
    const response = await api.get('/api/video/stats');
    return response.data;
  },

  // 取消任务
  cancelTask: async (videoId: string) => {
    const response = await api.post(`/api/video/tasks/${videoId}/cancel`);
    return response.data;
  },
};
```

### 2. 修改视频生成流程

在 `src/hooks/useVideoGeneration.ts` 中集成后端 API：

```typescript
// src/hooks/useVideoGeneration.ts
import { generateVideo } from '../api/sora';
import { videoTaskAPI } from '../api/backend';
import { useHistoryStore } from '../stores/history';

export const useVideoGeneration = () => {
  const generateWithBackend = async (request: SoraRequest, apiConfigId?: string) => {
    try {
      // 1. 先调用后端创建任务记录
      const backendResponse = await videoTaskAPI.createTask({
        prompt: request.prompt,
        model: request.model,
        size: request.aspectRatio === '16:9' ? '1280x720' : '720x1280',
        duration: parseInt(request.duration || '10'),
        aspectRatio: request.aspectRatio,
        referenceImage: request.image,
        apiConfigId,
      });

      const { videoId } = backendResponse.data;

      // 2. 调用原有的生成 API
      const result = await generateVideo(request, apiConfigId);

      // 3. 如果是同步任务，立即更新后端状态
      if (result.status === 'success') {
        // 后端会自动轮询更新异步任务，这里不需要手动更新
        console.log('视频生成成功，videoId:', videoId);
      }

      // 4. 返回结果，附加 videoId
      return {
        ...result,
        videoId,
      };
    } catch (error) {
      console.error('视频生成失败:', error);
      throw error;
    }
  };

  return { generateWithBackend };
};
```

### 3. 更新历史记录管理

修改 `src/stores/history.ts`，从后端加载历史记录：

```typescript
// src/stores/history.ts
import { create } from 'zustand';
import { videoTaskAPI } from '../api/backend';

interface HistoryStore {
  // ... 原有代码 ...
  
  // 从后端加载历史记录
  loadFromBackend: async (page = 1, pageSize = 20) => {
    try {
      const response = await videoTaskAPI.listTasks({ page, pageSize });
      const { tasks, total } = response.data;
      
      // 转换为前端格式
      const generations = tasks.map((task: any) => ({
        id: task.videoId,
        prompt: task.prompt,
        model: task.model,
        status: task.status.toLowerCase(),
        video_url: task.videoUrl,
        image_url: task.imageUrl,
        created_at: task.createdAt,
        duration: task.completedAt 
          ? new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()
          : undefined,
      }));
      
      set({ generations, total });
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  },
  
  // 刷新单个任务状态
  refreshTask: async (videoId: string) => {
    try {
      const response = await videoTaskAPI.getTask(videoId);
      const task = response.data;
      
      // 更新本地状态
      set((state) => ({
        generations: state.generations.map((g) =>
          g.id === videoId
            ? {
                ...g,
                status: task.status.toLowerCase(),
                video_url: task.videoUrl,
                image_url: task.imageUrl,
              }
            : g
        ),
      }));
    } catch (error) {
      console.error('刷新任务状态失败:', error);
    }
  },
}
```

### 4. 添加任务状态轮询

对于处理中的任务，需要定期轮询状态：

```typescript
// src/hooks/useTaskPolling.ts
import { useEffect, useRef } from 'react';
import { useHistoryStore } from '../stores/history';

export const useTaskPolling = (videoId?: string, interval = 5000) => {
  const intervalRef = useRef<NodeJS.Timeout>();
  const { refreshTask } = useHistoryStore();

  useEffect(() => {
    if (!videoId) return;

    const poll = async () => {
      try {
        await refreshTask(videoId);
        
        // 检查任务是否完成
        const task = useHistoryStore.getState().generations.find(g => g.id === videoId);
        if (task && ['completed', 'failed', 'cancelled'].includes(task.status)) {
          // 任务结束，停止轮询
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        }
      } catch (error) {
        console.error('轮询任务状态失败:', error);
      }
    };

    // 立即执行一次
    poll();
    
    // 设置定时轮询
    intervalRef.current = setInterval(poll, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [videoId, interval, refreshTask]);
};
```

### 5. 更新历史记录页面

在历史记录页面中使用后端数据：

```tsx
// src/pages/History.tsx
import { useEffect, useState } from 'react';
import { useHistoryStore } from '../stores/history';
import { videoTaskAPI } from '../api/backend';

export const HistoryPage = () => {
  const { generations, loadFromBackend } = useHistoryStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // 加载历史记录
    loadFromBackend(page, 20);
    
    // 加载统计信息
    videoTaskAPI.getStats().then(res => {
      setStats(res.data);
    });
  }, [page]);

  // ... 渲染逻辑
};
```

### 6. 处理认证状态

确保用户登录后才能访问视频任务功能：

```typescript
// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};
```

## 环境配置

在前端项目的 `.env` 文件中添加：

```env
# 后端 API 地址
VITE_API_URL=http://localhost:3001

# 如果部署在腾讯云
# VITE_API_URL=https://your-api-domain.com
```

## 数据同步策略

### 1. 实时同步

创建任务时同时写入本地和后端：

```typescript
// 本地存储（快速响应）
addGeneration(localTask);

// 后端存储（持久化）
await videoTaskAPI.createTask(taskData);
```

### 2. 增量同步

定期从后端拉取最新数据：

```typescript
// 每次打开应用时
useEffect(() => {
  syncWithBackend();
}, []);

// 下拉刷新时
const handleRefresh = async () => {
  await loadFromBackend();
};
```

### 3. 冲突处理

优先使用后端数据作为真实来源：

```typescript
const syncTask = async (videoId: string) => {
  const backendTask = await videoTaskAPI.getTask(videoId);
  const localTask = getLocalTask(videoId);
  
  if (backendTask.updatedAt > localTask.updatedAt) {
    // 使用后端数据
    updateLocalTask(backendTask);
  }
};
```

## 错误处理

### 1. 网络错误

```typescript
try {
  await videoTaskAPI.createTask(data);
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    // 保存到本地队列，稍后重试
    addToRetryQueue(data);
  } else {
    // 显示错误提示
    message.error('创建任务失败');
  }
}
```

### 2. 认证过期

```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // 清除本地认证信息
      useAuthStore.getState().logout();
      // 跳转到登录页
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## 性能优化

### 1. 缓存策略

```typescript
// 使用 React Query 或 SWR 进行数据缓存
import { useQuery } from '@tanstack/react-query';

export const useVideoTasks = (page: number) => {
  return useQuery({
    queryKey: ['videoTasks', page],
    queryFn: () => videoTaskAPI.listTasks({ page }),
    staleTime: 5 * 60 * 1000, // 5 分钟
  });
};
```

### 2. 分页加载

```typescript
// 无限滚动
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['videoTasks'],
  queryFn: ({ pageParam = 1 }) => videoTaskAPI.listTasks({ page: pageParam }),
  getNextPageParam: (lastPage, pages) => {
    const { page, pageSize, total } = lastPage.data;
    return page * pageSize < total ? page + 1 : undefined;
  },
});
```

### 3. 乐观更新

```typescript
// 立即更新 UI，后台同步
const handleCancel = async (videoId: string) => {
  // 乐观更新
  updateTaskStatus(videoId, 'cancelled');
  
  try {
    await videoTaskAPI.cancelTask(videoId);
  } catch (error) {
    // 回滚状态
    rollbackTaskStatus(videoId);
    message.error('取消失败');
  }
};
```

## 测试建议

1. **单元测试**: 测试 API 调用函数
2. **集成测试**: 测试完整的任务创建流程
3. **端到端测试**: 测试从创建到查看历史的完整用户流程

```typescript
// 示例测试
describe('VideoTaskAPI', () => {
  it('should create a video task', async () => {
    const task = await videoTaskAPI.createTask({
      prompt: 'test prompt',
      model: 'sora_video2',
    });
    
    expect(task.success).toBe(true);
    expect(task.data.videoId).toBeDefined();
  });
});
```

## 部署注意事项

1. **跨域配置**: 确保后端允许前端域名访问
2. **HTTPS**: 生产环境使用 HTTPS
3. **环境变量**: 不同环境使用不同的 API 地址
4. **错误监控**: 集成 Sentry 等错误监控服务
