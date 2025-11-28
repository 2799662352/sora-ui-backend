# 🐛 BUG-001: input_reference 字段名修复

> **修复日期**: 2025-11-28
> **严重程度**: 🔴 高 (影响图片参考功能)
> **影响范围**: 视频生成 Relay、任务自动重试
> **修复文件**: 
> - `src/controllers/soraRelayController.ts`
> - `src/services/taskPollingService.ts`

---

## 问题描述

外部 Sora API 调用时，参考图片字段名使用错误，导致带图片的视频生成请求失败。

**错误现象**：
```
任务失败: 文件上传失败
外部 API 无法正确识别参考图片
```

---

## 根因分析

### 问题根源

在 FormData 中使用了错误的字段名格式：

### 错误代码

```typescript
// ❌ 错误：使用了带方括号的数组格式
formData.append('input_reference[]', imageUrl);
```

### 正确代码

```typescript
// ✅ 正确：使用不带方括号的单一字段名
formData.append('input_reference', imageUrl);
```

### 原因解释

| 格式 | 含义 | 外部 API 支持 |
|------|------|---------------|
| `input_reference[]` | PHP 风格数组参数 | ❌ 不支持 |
| `input_reference` | 标准单值参数 | ✅ 支持 |

外部 Sora API（懒人猫后端）期望接收的是单一的 `input_reference` 字段，而不是 PHP 风格的数组字段名。

---

## 影响范围

### 受影响的文件

| 文件 | 功能 | 修复点 |
|------|------|--------|
| `src/controllers/soraRelayController.ts` | Relay 视频生成 | 第 211 行 |
| `src/services/taskPollingService.ts` | 自动重试逻辑 | 第 349 行 |

### 受影响的功能

1. **视频生成 Relay** (`POST /api/relay/sora/videos`)
   - 带参考图片的视频生成
   
2. **任务自动重试** (`retryTask` 函数)
   - 失败任务重试时重新提交图片

---

## 修复内容

### 文件 1: `src/controllers/soraRelayController.ts`

**位置**: 第 209-211 行

```typescript
// 2️⃣ 使用 URL 方式调用外部 API（更稳定）
// 🔥 BUG-001 修复：字段名必须是 'input_reference'（不带方括号）
formData.append('input_reference', imageUrl);
```

### 文件 2: `src/services/taskPollingService.ts`

**位置**: 第 347-350 行

```typescript
// 🔥 关键：重试时必须带上原始图片
// 🔥 BUG-001 修复：字段名必须是 'input_reference'（不带方括号）
formData.append('input_reference', dbTask.referenceImage);
console.log(`[TaskPolling] 📎 已添加参考图片到重试请求`);
```

---

## 测试验证

| 测试场景 | 修复前 | 修复后 |
|----------|--------|--------|
| 带图片生成视频 | ❌ 文件上传失败 | ✅ 正常生成 |
| 失败任务自动重试 | ❌ 重试也失败 | ✅ 重试成功 |
| 图片 URL 方式 | ❌ API 不识别 | ✅ API 正确接收 |

### 验证命令

```powershell
# 测试带图片的视频生成
curl -X POST "http://localhost:3001/api/relay/sora/videos" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -F "prompt=参考图片，生成动态视频" `
  -F "model=sora_video2" `
  -F "input_reference=@/path/to/image.png"
```

---

## 经验教训

1. ⚠️ **字段名必须与外部 API 文档完全一致**
2. ⚠️ **避免使用 PHP 风格的数组参数名（带 `[]`）除非明确支持**
3. ⚠️ **自动重试逻辑必须与正常提交逻辑保持一致**
4. ⚠️ **测试带文件的 API 调用时，验证字段名格式**

---

## 相关文档

- Relay Controller: `src/controllers/soraRelayController.ts`
- 任务轮询服务: `src/services/taskPollingService.ts`
- 外部 API 文档: https://docs2.tokens-pool.top/platform/sora.html

---

## 总结

| 项目 | 内容 |
|------|------|
| 问题 | 参考图片字段名格式错误 |
| 原因 | 使用了 `input_reference[]` 而非 `input_reference` |
| 修复 | 移除字段名中的方括号 |
| 影响 | 带图片的视频生成和自动重试功能恢复正常 |

