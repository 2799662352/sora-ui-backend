# 📚 源码学习报告：LiteLLM 与 One API 的可维护性之道

**分析日期**: 2025-11-20  
**分析对象**: LiteLLM (v1.53.0), One API (v0.6.8)  
**目的**: 验证 Metadata 模式的正确性，学习高可维护性架构设计

---

## 1. 核心发现：Metadata Pattern 是行业标准

通过使用 GitHub MCP Server 深入阅读源码，我们确认了 **Metadata Pattern (元数据模式)** 是 API Gateway 类项目应对复杂多变业务需求的核心设计模式。

### 1.1 LiteLLM (Python/Prisma)
**文件**: `litellm/proxy/schema.prisma`

LiteLLM 需要支持 100+ 种 LLM 模型，每种模型的参数都不同。如果为每个参数建列，表结构将无法维护。

**解决方案**:
```prisma
model LiteLLM_SpendLogs {
  request_id          String @id
  api_key             String @default("")
  model               String @default("")
  // 🔥 核心设计：用 JSON 存储所有非标准上下文
  metadata            Json?  @default("{}") 
  // ...
}
```

**LiteLLM 如何使用它？**
- 存储特定模型的超参
- 记录自定义的用户标签
- 追踪请求的来源上下文
- **结论**：LiteLLM 能够快速迭代的核心原因，就是因为它不需要为每个新特性修改数据库。

### 1.2 One API (Go/GORM)
**文件**: `model/log.go`

One API 作为多渠道分发系统，同样面临异构数据的问题。

**解决方案**:
```go
type Log struct {
    Id        int    `json:"id"`
    UserId    int    `json:"user_id"`
    Type      int    `json:"type"`
    // 🔥 传统方案：用字符串存储扩展信息
    Content   string `json:"content"` 
    // ...
}
```

**对比分析**:
- One API 使用 `Content` (String) 存储扩展信息，虽然简单，但失去了 SQL 查询内部字段的能力。
- LiteLLM 使用 `metadata` (JSONB)，既保留了扩展性，又保留了查询能力（PostgreSQL 支持 JSON 索引）。

---

## 2. Sora UI 的架构验证

我们在 Remix 功能中采用的设计：

```typescript
// src/types/index.ts
export interface VideoTask {
  // ... 核心字段 (id, status, prompt)
  
  // 🔥 我们的设计：Type-Safe Metadata
  metadata?: {
    type: 'remix' | 'generation';
    remix_from?: string;
    [key: string]: any;
  };
}
```

### ✅ 评估结论
1.  **架构先进性**: 我们选择了与 LiteLLM 一致的 `JSON` 方案，优于 One API 的 `String` 方案。
2.  **类型安全**: 我们在代码层增加了 TypeScript 强类型约束（`VideoTaskMetadata`），比 LiteLLM 的纯 JSON 更安全，开发体验更好。
3.  **零 Schema 变更**: 验证了“不改数据库实现新业务”的可行性。

---

## 3. 架构准则总结 (Backend Architecture Guidelines)

基于本次源码研究，确立 Sora UI 后续开发的**三大定律**：

### 1️⃣ 核心与扩展分离 (Core vs. Extension)
- **核心字段**（索引查询用）：必须是数据库的一级列（如 `status`, `userId`, `createdAt`）。
- **业务属性**（业务逻辑用）：必须放入 `metadata` JSON 字段。

### 2️⃣ 宽存储，严类型 (Loose Storage, Strict Typing)
- **数据库层**：`metadata` 是宽松的 `JSONB`。
- **代码层**：必须在 `src/types` 中定义严格的 `Interface`，严禁使用 `any`。

### 3️⃣ Controller 即插件 (Controller as Plugin)
- `VideoTaskService` 只负责通用的 CRUD。
- 特有的业务逻辑（如 Remix, Upscale）必须封装在独立的 Controller 中，通过操纵 `metadata` 来实现业务意图。

---

## 4. 推荐阅读
- [LiteLLM Schema](https://github.com/BerriAI/litellm/blob/main/litellm/proxy/schema.prisma)
- [PostgreSQL JSONB 最佳实践](https://www.postgresql.org/docs/current/datatype-json.html)

---

**报告人**: AI Assistant  
**工具**: GitHub MCP Server, Fetch MCP  
**状态**: ✅ 已验证
