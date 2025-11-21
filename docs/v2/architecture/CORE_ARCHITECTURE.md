# Sora UI Backend 核心架构规范 v2.0

**生效日期**: 2025-11-21  
**版本**: 2.0  
**状态**: ✅ 生效中

---

## 1. 设计哲学：Metadata Pattern (元数据模式)

参考 **LiteLLM** 和 **One API** 的最佳实践，本项目采用 **"核心字段进表，业务字段进 JSON"** 的设计哲学。

### 1.1 数据库设计原则 (Schema Stability)
除非涉及核心实体关系变更（如新增 `User` 与 `Task` 的关联），否则**严禁**随意修改数据库 Schema。

*   **核心字段 (Core Fields)**: 必须是数据库的一级列。
    *   标准：高频索引查询、外键关联、数据完整性约束。
    *   例如：`id`, `status`, `userId`, `createdAt`。
*   **业务属性 (Business Properties)**: 必须存入 `metadata` (JSONB) 字段。
    *   标准：特定功能的参数、临时标记、扩展信息。
    *   例如：`remix_from`, `upscale_scale`, `api_key_trace`。

### 1.2 类型安全原则 (Strict Typing)
虽然数据库存储是宽松的 JSON，但**代码层必须是强类型的**。

*   **禁止**: 使用 `any` 类型操作 metadata。
*   **强制**: 在 `src/types/index.ts` 中定义 `VideoTaskMetadata` 联合类型。

```typescript
// ✅ 正确示例
export type TaskMetadata = RemixMetadata | UpscaleMetadata | GenerationMetadata;

interface RemixMetadata {
  type: 'remix';
  remix_from: string;
}
```

---

## 2. 功能扩展标准化流程 (Standard Operating Procedure)

新增功能（如 "Upscale"）时，必须严格遵循以下步骤：

### 步骤 1: 定义数据结构
在 `src/types/index.ts` 中扩展 `TaskMetadata` 类型定义。

### 步骤 2: 编写独立 Controller
在 `src/controllers/` 下创建或扩展 Controller。Controller 被视为“插件”，负责：
1.  接收请求
2.  组装参数
3.  调用外部 API
4.  构建 Metadata
5.  调用 `prisma.create`

### 步骤 3: 注册路由
在 `src/routes/` 中注册 RESTful 路由。

**注意**: 不需要修改 `VideoTaskService`（除非涉及通用 CRUD 逻辑），也不需要修改轮询服务（它会自动处理所有 `VideoTask`）。

---

## 3. API Key 管理规范

### 3.1 存储与安全
*   **环境变量**: 所有外部 API Key 必须通过 `process.env` 读取。
*   **禁止硬编码**: 代码库中严禁出现以 `sk-` 开头的真实 Key。

### 3.2 审计与追踪
*   **Metadata 记录**: 在任务的 `metadata.trace` 字段中记录使用的 Key 的 Hash 或掩码（如 `sk-...1234`），用于故障排查。
*   **未来规划**: 在 v1.3.0 中引入独立的 `ApiKey` 实体表。

---

## 4. 开发与测试规范

### 4.1 单元测试 (Jest)
*   所有 Controller 层的业务逻辑必须包含单元测试。
*   必须 Mock 外部 API (`axios`) 和数据库调用 (`prisma`)。
*   测试用例需覆盖：正常流程、404 错误、参数错误、外部 API 故障。

### 4.2 目录结构
```
src/
├── controllers/
│   ├── soraRelayController.ts  # 业务插件逻辑
│   └── __tests__/              # 单元测试
├── services/
│   ├── videoTaskService.ts     # 通用 CRUD
│   └── taskPollingService.ts   # 通用轮询
├── types/
│   └── index.ts                # 强类型定义
└── routes/
```

---

**维护者**: Sora UI Team  
**更新记录**:
- v2.0 (2025-11-21): 基于 LiteLLM 源码学习确立 Metadata 架构。

