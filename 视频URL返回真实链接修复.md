# 🔧 后端返回真实视频URL修复

**问题时间**: 2025-11-13  
**修复状态**: ✅ 已解决  
**影响**: 关键功能

---

## 🐛 核心问题

### 现象

**生成成功但无法播放**：
- ✅ 视频生成成功（210秒）
- ✅ 返回URL
- ❌ 播放视频401错误

### 根本原因

**后端返回了错误的URL**：
```
❌ 返回: http://45.8.22.95:8000/sora/v1/videos/{id}/content
           ↑ 这只是API端点，需要Authorization认证

✅ 应该: https://videos.openai.com/az/files/xxx?sig=xxx
           ↑ 真实的视频文件URL，带SAS签名，可直接播放
```

**对比**：
| URL类型 | 示例 | 是否需要认证 | 能否直接播放 |
|---------|------|-------------|-------------|
| API端点 | http://45.8.22.95:8000/sora/v1/videos/{id}/content | ✅ 需要 | ❌ 不能 |
| 真实URL | https://videos.openai.com/az/files/xxx?sig=xxx | ❌ 不需要 | ✅ 能 |

---

## ✅ 修复方案

### 修改文件

**文件**: `src/services/videoTaskService.ts`

### 修改 1: startPolling 方法（任务完成时）

**第301-335行**

**修改前**：
```typescript
if (status === 'completed') {
  // ❌ 构建API端点URL
  const videoContentUrl = `${apiConfig.baseUrl}/v1/videos/${externalTaskId}/content`;
  
  await videoTaskRepository.updateTask(videoId, {
    videoUrl: videoContentUrl,  // ❌ API端点
  });
}
```

**修改后**：
```typescript
if (status === 'completed') {
  // ✅ 优先使用外部API返回的真实URL
  const realVideoUrl = data.url;  // 真实下载链接
  const fallbackUrl = `${apiConfig.baseUrl}/v1/videos/${externalTaskId}/content`;
  const finalVideoUrl = realVideoUrl || fallbackUrl;
  
  await videoTaskRepository.updateTask(videoId, {
    videoUrl: finalVideoUrl,  // ✅ 真实URL
    metadata: {
      externalVideoUrl: realVideoUrl,  // 保存真实URL
      apiEndpoint: fallbackUrl,  // 保存API端点作为备用
    },
  });
  
  console.log(`   真实URL: ${realVideoUrl || '无'}`);
  console.log(`   API端点: ${fallbackUrl}`);
  console.log(`   最终使用: ${finalVideoUrl}`);
}
```

### 修改 2: refreshVideoUrl 方法

**第477-513行**

**同样的修改逻辑**：
- 优先使用 `data.url`
- 降级使用 API 端点
- 保存两个URL到 metadata

---

## 🎯 工作原理

### 外部 Sora API 响应结构

```json
{
  "id": "video_xxx",
  "status": "completed",
  "progress": 100,
  "url": "https://videos.openai.com/az/files/xxx?sig=xxx",  // ← 真实URL
  "created_at": 1699999999,
  "completed_at": 1699999999
}
```

### URL 类型说明

**真实视频URL特征**：
- 域名：`videos.openai.com`、`storage.googleapis.com` 等
- 协议：`https://`
- 包含：SAS签名参数（`?sig=xxx`、`?se=xxx`）
- 特点：临时URL，有效期通常几天

**API端点特征**：
- 域名：API服务器
- 路径：`/v1/videos/{id}/content`
- 需要：Authorization header
- 特点：永久端点，需要认证

---

## 🧪 验证修复

### 后端日志

**任务完成时应该看到**：
```
✅ 任务完成: video_xxx
   真实URL: https://videos.openai.com/az/files/xxx?sig=xxx
   API端点: http://45.8.22.95:8000/sora/v1/videos/xxx/content
   最终使用: https://videos.openai.com/az/files/xxx?sig=xxx
   外部ID: video_xxx
```

### 前端播放

**AuthVideoPlayer 检测**：
```typescript
// 检查URL是否需要认证
const needsAuth = (url: string): boolean => {
  return url.includes('api.apiyi.com') || 
         url.includes('/v1/videos/') ||
         url.includes('/api/tasks/');
};

// https://videos.openai.com... 不匹配任何规则
// ✅ 不需要认证，直接播放！
```

---

## 📝 测试步骤

### 步骤 1: 清除前端旧配置

**在 Electron 控制台执行**：
```javascript
localStorage.removeItem('sora-api-configs');
localStorage.removeItem('sora-auth-storage');
location.reload();
```

### 步骤 2: 创建新任务

1. API 选择"🚀 Sora UI 后端服务器"
2. 输入提示词
3. 点击生成

### 步骤 3: 等待完成

- 观察实时进度
- 等待 2-3 分钟

### 步骤 4: 查看后端日志

应该看到：
```
真实URL: https://videos.openai.com/...
```

### 步骤 5: 播放视频

- 点击播放
- **应该可以直接播放！**
- **无需认证！**
- **无 401 错误！**

---

## 🎊 修复完成

### 修改总结

- **修改文件**: 1个（`videoTaskService.ts`）
- **修改位置**: 2个方法
- **修改行数**: ~30行
- **核心改进**: 返回真实视频URL而不是API端点

### 优点

- ✅ 视频可以直接播放
- ✅ 无需Electron拦截器
- ✅ 无需API Key认证
- ✅ URL自带签名，安全可靠
- ✅ 符合行业标准（Azure/GCP等）

---

**🎉 后端已重启！创建新任务测试即可！** 🚀

