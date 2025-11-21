# 🎨 视频 Remix (编辑) 功能 - 前端集成指南

## 1. 概述

后端已完成 Remix 功能的开发和测试。该功能允许用户基于已有的视频（Original Video）生成新的变体。

*   **后端状态**: ✅ 已上线
*   **验证状态**: ✅ 通过真实 API 端到端测试
*   **API 路径**: `POST /api/video/tasks/:videoId/remix`

---

## 2. API 接口规范

### 调用方法

```typescript
/**
 * 提交 Remix 任务
 * @param videoId - 原视频的内部 ID (video_xxx)
 * @param prompt - 新的提示词
 * @param token - 用户 Token
 * @param model - (可选) 模型名称，默认使用原视频模型或 'sora_video2'
 */
const remixVideo = async (videoId: string, prompt: string, token: string, model?: string)
```

### 请求示例

```http
POST /api/video/tasks/video_1763704172517/remix
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1Ni...

{
  "prompt": "Make it cyberpunk style, neon lights",
  "model": "sora_video2"
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "videoId": "video_1763704172914_8as15rl",       // 新任务的内部 ID
    "externalTaskId": "video_48b8ffba-...",          // 新任务的外部 ID
    "status": "processing",                          // 初始状态
    "message": "Remix 任务已提交",
    "remixed_from": "video_1763704172517"            // 来源视频 ID
  }
}
```

---

## 3. 前端代码集成

请将以下代码添加到您的 API Client 文件中（例如 `src/api/backend-api.ts`）。

### 3.1 更新 API Client

```typescript
import axios from 'axios';

// ... 现有的配置 ...

export const backendAPI = {
  // ... 现有的方法 ...

  /**
   * 🔥 Remix (编辑) 视频
   */
  remixVideo: async (
    videoId: string, 
    prompt: string, 
    token: string,
    model: string = 'sora_video2'
  ) => {
    try {
      const response = await axios.post(
        `${BACKEND_BASE_URL}/api/video/tasks/${videoId}/remix`,
        { prompt, model },
        { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json' 
          } 
        }
      );
      return response.data;
    } catch (error) {
      console.error('[API] Remix failed:', error);
      throw error;
    }
  }
};
```

### 3.2 React 组件示例 (RemixButton)

这是一个简单的 React 组件，用于在视频详情页触发 Remix。

```tsx
import React, { useState } from 'react';
import { Button, Modal, Input, message } from 'antd';
import { backendAPI } from '../api/backend-api';
import { useAuthStore } from '../stores/authStore';

interface RemixButtonProps {
  videoId: string;
  originalPrompt: string;
  onSuccess?: (newVideoId: string) => void;
}

export const RemixButton: React.FC<RemixButtonProps> = ({ 
  videoId, 
  originalPrompt, 
  onSuccess 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState(originalPrompt);
  const [loading, setLoading] = useState(false);
  const token = useAuthStore(state => state.token);

  const handleRemix = async () => {
    if (!prompt.trim()) return;
    
    setLoading(true);
    try {
      const result = await backendAPI.remixVideo(videoId, prompt, token!);
      
      message.success('Remix 任务已提交！');
      setIsModalOpen(false);
      
      // 回调通知父组件（例如刷新列表或跳转到新任务）
      if (onSuccess) {
        onSuccess(result.data.videoId);
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Remix 失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setIsModalOpen(true)}>
        🎨 Remix / 编辑
      </Button>

      <Modal
        title="编辑视频 (Remix)"
        open={isModalOpen}
        onOk={handleRemix}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={loading}
        okText="生成新变体"
      >
        <p>基于当前视频生成新的变体。请修改提示词：</p>
        <Input.TextArea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入新的提示词..."
        />
      </Modal>
    </>
  );
};
```

---

## 4. 注意事项

1.  **双 ID 系统**: Remix 只能对**已成功完成**（状态为 `COMPLETED`）且拥有有效 `externalTaskId` 的视频进行。如果是通过旧版接口创建的无外部 ID 视频，后端会拒绝请求并返回 400。
2.  **轮询**: 提交 Remix 后，后端会自动启动轮询服务。前端只需要像处理普通生成任务一样，监听 SSE 或 WebSocket 即可收到进度更新。
3.  **模型**: 默认使用 `sora_video2`。如果原视频使用的是其他模型，建议在调用时传入原视频的 `model` 参数。

---

**文档生成时间**: 2025-11-21
**适用版本**: v2.0+

