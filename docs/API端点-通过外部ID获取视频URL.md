# 📖 API端点 - 通过外部ID获取视频URL

## 🎯 功能概述

允许前端绕过后端数据库，直接通过外部API的 `video_id` 查询并获取最新的 `video_url`。

### 使用场景
- ✅ 视频URL已过期，需要刷新
- ✅ 无需查询后端数据库，直接获取最新URL
- ✅ 前端有外部API的 `video_id`，需要快速获取播放链接
- ✅ 调试或测试外部API返回的视频

---

## 📡 API详情

### 端点
```
GET /api/video/external/:externalVideoId/url
```

### 请求头
```http
Authorization: Bearer <JWT Token>
```

### 路径参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `externalVideoId` | string | ✅ | 外部API的video_id，格式如 `video_xxx-xxx-xxx` |

### 查询参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `apiConfigId` | string | ❌ | 指定使用哪个API配置，不提供则使用第一个配置 |

### 响应格式
```json
{
  "success": true,
  "message": "视频URL获取成功",
  "data": {
    "externalVideoId": "video_0d954741-0240-4390-94b9-a1169b20a72a",
    "videoUrl": "https://videos.openai.com/az/files/00000000-ecd0-7280-adf9-59d6290e6abb%2Fraw?se=2025-11-19T10%3A23%3A13Z&sp=r&...",
    "status": "completed",
    "progress": 100
  }
}
```

---

## 🧪 测试示例

### 1. cURL 请求
```bash
curl --location --request GET 'http://localhost:3001/api/video/external/video_0d954741-0240-4390-94b9-a1169b20a72a/url' \
--header 'Authorization: Bearer <你的JWT Token>'
```

### 2. 使用指定的API配置
```bash
curl --location --request GET 'http://localhost:3001/api/video/external/video_0d954741-0240-4390-94b9-a1169b20a72a/url?apiConfigId=apiyi-primary' \
--header 'Authorization: Bearer <你的JWT Token>'
```

### 3. JavaScript (Fetch)
```javascript
// 获取视频URL
async function getVideoUrlByExternalId(externalVideoId, token, apiConfigId = null) {
  const url = new URL(`http://localhost:3001/api/video/external/${externalVideoId}/url`);
  
  if (apiConfigId) {
    url.searchParams.append('apiConfigId', apiConfigId);
  }
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

// 使用示例
const result = await getVideoUrlByExternalId(
  'video_0d954741-0240-4390-94b9-a1169b20a72a',
  'your-jwt-token'
);

console.log('视频URL:', result.data.videoUrl);
console.log('状态:', result.data.status);
console.log('进度:', result.data.progress);
```

### 4. Axios
```javascript
import axios from 'axios';

const result = await axios.get(
  `http://localhost:3001/api/video/external/video_0d954741-0240-4390-94b9-a1169b20a72a/url`,
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    params: {
      apiConfigId: 'apiyi-primary', // 可选
    },
  }
);

console.log(result.data);
```

---

## 🔧 后端实现细节

### 1. Service层 (`videoTaskService.ts`)
```typescript
/**
 * 通过外部API的video_id直接获取video_url
 */
async getVideoUrlByExternalId(externalVideoId: string, apiConfigId?: string): Promise<{
  externalVideoId: string;
  videoUrl: string;
  status: string;
  progress: number;
}> {
  // 获取API配置
  const apiConfig = apiConfigId 
    ? API_CONFIGS.find(cfg => cfg.id === apiConfigId) || API_CONFIGS[0]
    : API_CONFIGS[0];
  
  // 调用外部API查询任务状态
  const response = await axios.get(
    `${apiConfig.baseUrl}/v1/videos/${externalVideoId}`,
    {
      headers: {
        'Authorization': `Bearer ${apiConfig.apiKey}`,
        'Accept': 'application/json',
      },
      timeout: 15000,
    }
  );

  // 提取 video_url
  const videoUrl = response.data.video_url || null;
  const status = response.data.status;
  const progress = response.data.progress || 0;
  
  return {
    externalVideoId,
    videoUrl: videoUrl || `${apiConfig.baseUrl}/v1/videos/${externalVideoId}/content`,
    status,
    progress,
  };
}
```

### 2. Route层 (`videoTask.ts`)
```typescript
router.get('/external/:externalVideoId/url', authMiddleware, async (req, res, next) => {
  try {
    const { externalVideoId } = req.params;
    const { apiConfigId } = req.query;

    const result = await videoTaskService.getVideoUrlByExternalId(
      externalVideoId,
      apiConfigId as string | undefined
    );

    res.json({
      success: true,
      data: result,
      message: '视频URL获取成功',
    });
  } catch (error) {
    next(error);
  }
});
```

---

## 🚨 错误处理

### 常见错误

#### 1. 401 Unauthorized
```json
{
  "success": false,
  "message": "未认证"
}
```
**原因**：JWT Token无效或过期  
**解决**：重新登录获取新Token

#### 2. 404 Not Found
```json
{
  "success": false,
  "message": "视频不存在"
}
```
**原因**：外部API找不到该video_id  
**解决**：检查video_id是否正确

#### 3. 500 Internal Server Error
```json
{
  "success": false,
  "message": "获取视频URL失败: Connection timeout"
}
```
**原因**：外部API请求超时或网络问题  
**解决**：检查网络连接，重试请求

---

## 📊 日志输出

### 成功请求
```
[Route] 📥 收到外部ID查询请求: video_0d954741-0240-4390-94b9-a1169b20a72a
[GetVideoUrl] 通过外部ID获取视频URL: video_0d954741-0240-4390-94b9-a1169b20a72a
[GetVideoUrl] 使用API配置: apiyi-primary
[GetVideoUrl] API响应: { ... }
[GetVideoUrl] ✅ 成功获取视频URL: https://videos.openai.com/...
[Route] ✅ 成功获取视频URL，状态: completed
```

### 失败请求
```
[Route] 📥 收到外部ID查询请求: video_invalid
[GetVideoUrl] 通过外部ID获取视频URL: video_invalid
[GetVideoUrl] ❌ 获取视频URL失败: Request failed with status code 404
[Route] ❌ 获取视频URL失败: Request failed with status code 404
```

---

## 🎯 前端集成示例

### React Hook
```typescript
// hooks/useExternalVideoUrl.ts
import { useState } from 'react';
import axios from 'axios';

export function useExternalVideoUrl() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getVideoUrl = async (externalVideoId: string, apiConfigId?: string) => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth-token');
      
      const response = await axios.get(
        `http://localhost:3001/api/video/external/${externalVideoId}/url`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          params: apiConfigId ? { apiConfigId } : {},
        }
      );

      return response.data.data;
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { getVideoUrl, loading, error };
}
```

### 使用示例
```tsx
function VideoPlayer({ externalVideoId }: { externalVideoId: string }) {
  const { getVideoUrl, loading, error } = useExternalVideoUrl();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUrl() {
      try {
        const result = await getVideoUrl(externalVideoId);
        setVideoUrl(result.videoUrl);
      } catch (err) {
        console.error('获取视频URL失败:', err);
      }
    }
    
    fetchUrl();
  }, [externalVideoId]);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  if (!videoUrl) return null;

  return <video src={videoUrl} controls />;
}
```

---

## ✅ 优势

1. **绕过数据库** - 直接从外部API获取最新数据
2. **实时性** - 始终获取最新的URL和状态
3. **灵活性** - 可指定不同的API配置
4. **简单性** - 只需要外部video_id即可
5. **独立性** - 不依赖后端数据库中的任务记录

---

## 🔗 相关文档

- [视频URL获取修复总结](../06-开发指南/视频URL获取修复总结.md)
- [403错误修复 - videos.openai.com拦截](../06-开发指南/403错误修复-videos.openai.com拦截.md)
- [前后端集成指南](../06-开发指南/前后端集成-视频URL修复.md)

---

**最后更新**: 2025-11-13  
**状态**: ✅ 已实现并测试通过

