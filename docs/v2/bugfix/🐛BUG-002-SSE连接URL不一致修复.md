# 🐛 BUG-002: SSE 连接 URL 不一致修复

> **修复日期**: 2025-11-28
> **严重程度**: 🟠 中 (影响实时更新功能)
> **影响范围**: SSE 任务状态推送连接
> **修复文件**: `sora-ui/src/hooks/useSSE.ts`

---

## 问题描述

SSE（Server-Sent Events）连接一直断开重连，从未成功建立连接。

**日志表现**：
```
[SSE] 🔌 Disconnected
[SSE] 📡 Connecting to: http://192.168.1.129:3001/api/sse/task-updates?token=...
```

但从未看到 `[SSE] ✅ Connection opened`。

同时其他 API 调用正常工作，使用的是 `http://localhost:3001`。

---

## 根因分析

### 问题根源

`useSSE.ts` 中的 URL 构建逻辑**没有使用** `environment.ts` 中统一的 `getBackendUrl()` 函数，而是直接使用了硬编码的环境变量回退逻辑。

### 错误代码 (useSSE.ts)

```typescript
// ❌ 错误：直接使用环境变量，可能与其他 API 调用不一致
const baseUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const url = `${baseUrl}/api/sse/task-updates?token=${token}`;
```

### 正确代码

```typescript
// ✅ 正确：使用 environment.ts 统一配置
import { getEnvironmentConfig } from '../config/environment';

const envConfig = getEnvironmentConfig();
const url = `${envConfig.backendUrl}/api/sse/task-updates?token=${token}`;
```

### URL 来源对比

| 模块 | URL 来源 | 结果 |
|------|----------|------|
| 其他 API 调用 | `getBackendUrl()` | `http://localhost:3001` ✅ |
| SSE 连接 (修复前) | 硬编码环境变量 | `http://192.168.1.129:3001` ❌ |
| SSE 连接 (修复后) | `getEnvironmentConfig()` | `http://localhost:3001` ✅ |

---

## 修复内容

### 文件: `src/hooks/useSSE.ts`

**修改 1**: 添加导入 (第 23 行)

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useReconnectTimer } from './useReconnectTimer';
import { getEnvironmentConfig } from '../config/environment';  // ✅ 新增
```

**修改 2**: URL 构建逻辑 (第 119-121 行)

```typescript
// 🔥 n8n: Ensure we disconnect any existing connection
disconnect();

// 🔥 构建 SSE URL - 使用 environment.ts 统一配置
const envConfig = getEnvironmentConfig();
const url = `${envConfig.backendUrl}/api/sse/task-updates?token=${token}`;

console.log('[SSE] 📡 Connecting to:', url);
```

---

## environment.ts 的 URL 逻辑

`getBackendUrl()` 函数的智能检测逻辑：

```typescript
function getBackendUrl(): string {
  // 🔥 动态检测 hostname
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    
    // 如果通过网络 IP 访问，使用相同的主机名
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:3001`;
    }
  }
  
  // 检查环境变量
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  
  // 开发环境默认
  return 'http://localhost:3001';
}
```

---

## 测试验证

| 测试场景 | 修复前 | 修复后 |
|----------|--------|--------|
| 本地开发 (localhost) | ❌ 连接到 192.168.1.129 | ✅ 连接到 localhost |
| 局域网访问 (192.168.x.x) | ✅ 正常 | ✅ 正常 |
| SSE 连接状态 | ❌ 一直重连 | ✅ 连接成功 |

### 预期日志

```
[ENV] 🔍 getBackendUrl 调用 - hostname: localhost
[SSE] 📡 Connecting to: http://localhost:3001/api/sse/task-updates?token=...
[SSE] ✅ Connection opened
```

---

## 经验教训

1. ⚠️ **所有需要后端 URL 的地方都应该使用统一的配置来源**
2. ⚠️ **避免在多处重复 URL 构建逻辑，容易导致不一致**
3. ⚠️ **SSE/WebSocket 等长连接服务更容易受 URL 不一致影响**
4. ⚠️ **当连接问题出现时，首先检查 URL 是否正确**

---

## 相关文档

- 环境配置: `sora-ui/src/config/environment.ts`
- SSE Hook: `sora-ui/src/hooks/useSSE.ts`
- 重连计时器: `sora-ui/src/hooks/useReconnectTimer.ts`

---

## 总结

| 项目 | 内容 |
|------|------|
| 问题 | SSE 连接使用了错误的后端 URL |
| 原因 | URL 构建逻辑没有使用统一的 `getEnvironmentConfig()` |
| 修复 | 引入并使用 `getEnvironmentConfig().backendUrl` |
| 影响 | 任务状态实时推送功能恢复正常 |


























