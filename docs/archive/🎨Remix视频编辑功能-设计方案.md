# 🎨 Remix 视频编辑功能 - 设计方案

**日期**: 2025-11-20  
**参考**: OpenAI Sora API, Tokens-Pool API  
**设计原则**: 遵循Project Rules, 参考现有架构  
**状态**: 📋 设计阶段（未开发）

---

## 🎯 一、功能需求分析

### API 规范对比

#### OpenAI 官方规范

**端点**: `POST /v1/videos/{video_id}/remix`

**Content-Type**: `application/json` ✅

**请求格式**:
```json
{
  "prompt": "Extend the scene with the cat taking a bow"
}
```

**响应格式**:
```json
{
  "id": "video_456",
  "object": "video",
  "model": "sora-2",
  "status": "queued",
  "progress": 0,
  "remixed_from_video_id": "video_123"  ← 关键字段
}
```

---

#### Tokens-Pool 规范

**端点**: `POST /sora/v1/videos/{video_id}/remix`

**Content-Type**: `application/json` ✅

**请求格式**:
```json
{
  "prompt": "再加一只小狗",
  "model": "sora_video2"
}
```

**关键发现**: ✅ **Remix端点使用JSON，不是multipart/form-data！**

---

### 与现有端点对比

#### 现有: `/api/relay/sora/videos` (创建视频)

**Content-Type**: `multipart/form-data`

**原因**: 需要上传参考图片

**代码**: 使用 `multer.single('input_reference')`

---

#### 新增: `/api/relay/sora/videos/:videoId/remix` (编辑视频)

**Content-Type**: `application/json` ✅

**原因**: 
- 不需要上传文件
- 只需要prompt和model
- 基于已有视频ID

**代码**: 不需要multer，使用express.json()

---

## 🏗️ 二、架构设计

### 遵循现有架构模式

**参考**: `soraRelayController.ts` (完整版Relay)

**设计原则**:
1. ✅ 完全后端转发（LiteLLM模式）
2. ✅ 双ID系统（内部ID + 外部ID）
3. ✅ 启动轮询服务
4. ✅ SSE实时推送
5. ✅ 负载均衡（可选）
6. ✅ 成本追踪（可选）

---

### 端点设计

**路由**: `POST /api/relay/sora/videos/:videoId/remix`

**参数**:
- Path: `videoId` (内部数据库ID)
- Body: `{ prompt, model }`

**流程**:
```
1. 接收请求 (videoId + prompt)
   ↓
2. 查询数据库获取 externalTaskId
   ↓
3. 调用外部API: POST /sora/v1/videos/{externalTaskId}/remix
   ↓
4. 获取新的 externalTaskId (remixed video)
   ↓
5. 创建新的VideoTask记录
   ↓
6. 保存 remixedFromVideoId 字段
   ↓
7. 启动轮询
   ↓
8. 返回新videoId
```

---

## 📊 三、数据库设计

### 需要添加的字段

**VideoTask 表**:
```prisma
model VideoTask {
  // ... 现有字段
  
  // 🆕 Remix 相关字段
  remixedFromVideoId  String?  @map("remixed_from_video_id")  // 源视频ID（内部）
  remixedFromExternal String?  @map("remixed_from_external")  // 源视频ID（外部）
  isRemix             Boolean  @default(false) @map("is_remix") // 是否是Remix视频
  
  @@index([remixedFromVideoId])  // 索引优化
}
```

**关系**:
```
原始视频: video_123 (内部) → video_abc (外部)
   ↓ remix
Remix视频: video_456 (内部) → video_xyz (外部)
           remixedFromVideoId = video_123
           remixedFromExternal = video_abc
```

---

## 💻 四、代码实现方案

### 方案A: 简化版（推荐）⭐

**特点**:
- ✅ 只实现核心功能
- ✅ 不使用负载均衡
- ✅ 直接调用外部API
- ✅ 启动轮询和SSE

**代码结构**:
```typescript
// soraRelayController.ts

/**
 * 🎨 Remix 视频编辑
 * POST /api/relay/sora/videos/:videoId/remix
 */
export const relaySoraVideoRemix = async (req: AuthRequest, res: Response) => {
  const { videoId } = req.params;
  const { prompt, model } = req.body;
  const userId = req.user!.userId;
  
  // 1. 查询原始任务，获取externalTaskId
  const originalTask = await prisma.videoTask.findUnique({
    where: { videoId }
  });
  
  if (!originalTask || !originalTask.externalTaskId) {
    return res.status(404).json({ error: '原始视频不存在或未完成' });
  }
  
  // 2. 调用外部API Remix
  const response = await axios.post(
    `${SORA_API_BASE}/sora/v1/videos/${originalTask.externalTaskId}/remix`,
    { prompt, model: model || 'sora_video2' },
    {
      headers: {
        'Authorization': SORA_API_KEY,
        'Content-Type': 'application/json'  // ✅ JSON格式
      }
    }
  );
  
  const newExternalTaskId = response.data.id;
  const remixedFromExternal = response.data.remixed_from_video_id;
  
  // 3. 创建新任务记录
  const newVideoId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  const remixTask = await prisma.videoTask.create({
    data: {
      videoId: newVideoId,
      externalTaskId: newExternalTaskId,
      userId,
      model: model || 'sora_video2',
      prompt,
      status: TaskStatus.PROCESSING,
      progress: 0,
      isRemix: true,                           // 🆕
      remixedFromVideoId: videoId,             // 🆕 内部源ID
      remixedFromExternal: remixedFromExternal, // 🆕 外部源ID
    }
  });
  
  // 4. 启动轮询
  startTaskPolling({
    videoId: newVideoId,
    externalTaskId: newExternalTaskId,
    apiConfigId: 'backend-api',
    userId,
  });
  
  // 5. 返回响应
  res.json({
    success: true,
    data: {
      videoId: newVideoId,
      externalTaskId: newExternalTaskId,
      status: 'processing',
      remixedFrom: videoId,
    }
  });
};
```

**优点**:
- ✅ 代码简洁（~60行）
- ✅ 遵循现有模式
- ✅ 双ID系统完整
- ✅ 轮询和SSE自动工作

**缺点**:
- ⚠️ 不支持负载均衡
- ⚠️ 不支持成本追踪
- ⚠️ 不支持自动重试

---

### 方案B: 完整版（企业级）

**特点**:
- ✅ 支持负载均衡
- ✅ 支持成本追踪
- ✅ 支持自动重试
- ✅ 完整的LiteLLM架构

**代码结构**:
```typescript
/**
 * 🎨 Remix 视频编辑（完整版）
 * POST /api/relay/sora/videos/:videoId/remix
 */
export const relaySoraVideoRemix = async (req: AuthRequest, res: Response) => {
  const { videoId } = req.params;
  const { prompt, model } = req.body;
  const userId = req.user!.userId;
  const requestId = uuidv4();
  const startTime = new Date();
  
  // 1. 查询原始任务
  const originalTask = await prisma.videoTask.findUnique({
    where: { videoId }
  });
  
  if (!originalTask || !originalTask.externalTaskId) {
    return res.status(404).json({ error: '原始视频不存在' });
  }
  
  // 2. 🔥 LiteLLM: 自动重试循环
  const maxRetries = 3;
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      // 2.1 选择健康的Channel（可选）
      const channel = await channelService.selectChannel(userId, model, 'default');
      
      // 2.2 记录请求开始
      if (leastBusyStrategy.onRequestStart) {
        await leastBusyStrategy.onRequestStart(channel.id, { model, userId });
      }
      
      // 2.3 调用外部API
      const response = await axios.post(
        `${channel.baseURL}/sora/v1/videos/${originalTask.externalTaskId}/remix`,
        { prompt, model },
        {
          headers: {
            'Authorization': channel.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const newExternalTaskId = response.data.id;
      
      // 2.4 创建新任务
      const newVideoId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      await prisma.videoTask.create({
        data: {
          videoId: newVideoId,
          externalTaskId: newExternalTaskId,
          userId,
          model,
          prompt,
          status: TaskStatus.PROCESSING,
          isRemix: true,
          remixedFromVideoId: videoId,
        }
      });
      
      // 2.5 记录成功
      await deploymentHealthService.recordSuccess(channel.id);
      
      // 2.6 成本追踪
      const cost = costTrackingService.calculateCost({
        model, promptTokens: 500, completionTokens: 500
      });
      await costTrackingService.trackCost({
        channelId: channel.id,
        userId, model, cost,
        tokens: { total: 1000, prompt: 500, completion: 500 },
        requestId, startTime, endTime: new Date(),
        status: 'success'
      });
      
      // 2.7 启动轮询
      startTaskPolling({
        videoId: newVideoId,
        externalTaskId: newExternalTaskId,
        apiConfigId: 'backend-api',
        userId,
      });
      
      // 2.8 返回成功
      return res.json({
        success: true,
        data: {
          videoId: newVideoId,
          externalTaskId: newExternalTaskId,
          remixedFrom: videoId,
        }
      });
      
    } catch (error) {
      // 记录失败并重试
      if (retry < maxRetries - 1) continue;
      throw error;
    }
  }
};
```

**优点**:
- ✅ 完整的企业级功能
- ✅ 负载均衡
- ✅ 成本追踪
- ✅ 自动重试

**缺点**:
- ⚠️ 代码复杂（~120行）
- ⚠️ 需要Channel配置
- ⚠️ 可能过度设计

---

## 🎯 五、Content-Type 分析

### 关键发现：Remix使用JSON！

**创建视频** (`/v1/videos`):
```
Content-Type: multipart/form-data
原因: 需要上传参考图片
格式: FormData
```

**编辑视频** (`/v1/videos/{id}/remix`):
```
Content-Type: application/json  ✅
原因: 只需要prompt文本
格式: JSON对象
```

**代码对比**:
```typescript
// 创建视频 - multipart/form-data
export const relaySoraVideoGeneration = [
  upload.single('input_reference'),  // ✅ multer处理文件
  async (req, res) => {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('input_reference', file.buffer);
    // ...
  }
];

// Remix视频 - application/json
export const relaySoraVideoRemix = async (req, res) => {
  // ❌ 不需要multer
  // ✅ 直接使用req.body (express.json()已解析)
  const { prompt, model } = req.body;
  
  await axios.post(url, 
    { prompt, model },  // ✅ JSON对象
    { headers: { 'Content-Type': 'application/json' } }
  );
};
```

---

## 📋 六、实现步骤（遵循Project Rules）

### Step 1: 数据库迁移

**文件**: `prisma/schema.prisma`

**修改**:
```prisma
model VideoTask {
  // ... 现有字段
  
  // 🆕 Remix 字段
  remixedFromVideoId  String?  @map("remixed_from_video_id")
  remixedFromExternal String?  @map("remixed_from_external")
  isRemix             Boolean  @default(false) @map("is_remix")
  
  @@index([remixedFromVideoId])
}
```

**迁移命令**:
```bash
npx prisma migrate dev --name add_remix_fields
```

---

### Step 2: 添加Controller方法

**文件**: `src/controllers/soraRelayController.ts`

**位置**: 在现有 `relaySoraVideoGeneration` 之后

**代码**: ~60行（简化版）或 ~120行（完整版）

---

### Step 3: 注册路由

**文件**: `src/app.ts`

**修改**:
```typescript
import { relaySoraVideoGeneration, relaySoraVideoRemix } from './controllers/soraRelayController';

// 现有路由
app.post('/api/relay/sora/videos', authMiddleware, relaySoraVideoGeneration);

// 🆕 新增路由
app.post('/api/relay/sora/videos/:videoId/remix', authMiddleware, relaySoraVideoRemix);
```

---

### Step 4: 前端集成

**文件**: `sora-ui/src/api/backend-api.ts`

**新增方法**:
```typescript
/**
 * Remix视频编辑
 */
export const remixVideo = async (
  videoId: string,
  prompt: string,
  model: string = 'sora_video2'
): Promise<VideoTask> => {
  const response = await axios.post(
    `${BACKEND_BASE_URL}/api/relay/sora/videos/${videoId}/remix`,
    { prompt, model },
    {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json'  // ✅ JSON格式
      }
    }
  );
  
  return response.data.data;
};
```

---

### Step 5: UI组件

**文件**: `sora-ui/src/components/VideoRemixModal.tsx`

**功能**:
- 选择已完成的视频
- 输入新的prompt
- 点击"Remix"按钮
- 显示新任务进度

---

## 🎯 七、关键设计决策

### 决策1: 使用哪个方案？

**推荐**: ✅ **方案A（简化版）**

**理由**:
1. ✅ 遵循KISS原则（Keep It Simple）
2. ✅ Remix是低频功能
3. ✅ 不需要复杂的负载均衡
4. ✅ 代码维护成本低
5. ✅ 60行代码 vs 120行代码

**Project Rules支持**:
- "Simplicity: Write simple and straightforward code"
- "YAGNI: Avoid implementing features until they are actually needed"
- "Lines of code = Debt"

---

### 决策2: Content-Type

**确认**: ✅ **application/json**

**证据**:
- OpenAI官方文档: JSON
- Tokens-Pool文档: JSON
- 不需要文件上传
- 只需要文本prompt

**代码**:
```typescript
// ❌ 不需要这样
upload.single('input_reference')

// ✅ 直接使用
async (req, res) => {
  const { prompt } = req.body;  // express.json()已解析
}
```

---

### 决策3: 双ID系统

**设计**: ✅ **完全遵循现有双ID架构**

**映射关系**:
```
原始视频:
  内部ID: video_123
  外部ID: video_abc
  
Remix视频:
  内部ID: video_456 (新生成)
  外部ID: video_xyz (外部API返回)
  源视频: video_123 (remixedFromVideoId)
  源外部: video_abc (remixedFromExternal)
```

**查询方式**:
```
前端查询: GET /api/video/tasks/video_456 (使用内部ID)
轮询查询: GET /sora/v1/videos/video_xyz (使用外部ID)
```

---

## 📊 八、工作量评估

### 简化版（推荐）

**预计工作量**: 2-3小时

**任务分解**:
```
1. 数据库迁移        30分钟
   - 修改schema.prisma
   - 运行migrate
   - 验证字段

2. 后端Controller    60分钟
   - 添加remix方法
   - 实现核心逻辑
   - 错误处理

3. 路由注册          15分钟
   - 修改app.ts
   - 测试路由

4. 前端API客户端     30分钟
   - 添加remixVideo方法
   - 类型定义

5. 测试验证          30分钟
   - API测试
   - 数据库验证
   - 日志检查
```

---

### 完整版

**预计工作量**: 4-5小时

**额外任务**:
```
+ 集成负载均衡       60分钟
+ 集成成本追踪       30分钟
+ 自动重试逻辑       30分钟
+ 完整测试           60分钟
```

---

## 🎨 九、UI/UX 设计建议

### 用户流程

```
1. 用户在历史记录中选择已完成的视频
   ↓
2. 点击"Remix"按钮
   ↓
3. 弹出对话框
   - 显示原视频缩略图
   - 输入框：新的prompt
   - 模型选择（可选）
   ↓
4. 点击"开始Remix"
   ↓
5. 创建新任务
   - 显示在任务列表
   - 标记为"Remix"
   - 显示源视频链接
   ↓
6. 实时进度更新（SSE）
   ↓
7. 完成后显示新视频
```

### UI组件设计

**VideoHistory.tsx** (修改):
```tsx
// 添加Remix按钮
<Button 
  icon={<EditOutlined />}
  onClick={() => handleRemix(task.videoId)}
  disabled={task.status !== 'COMPLETED'}
>
  Remix
</Button>
```

**VideoRemixModal.tsx** (新建):
```tsx
interface Props {
  visible: boolean;
  originalVideoId: string;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}

const VideoRemixModal: React.FC<Props> = ({ ... }) => {
  return (
    <Modal open={visible} onCancel={onClose}>
      <Form onFinish={handleSubmit}>
        <Form.Item label="原视频">
          <VideoPreview videoId={originalVideoId} />
        </Form.Item>
        
        <Form.Item label="新的提示词" name="prompt" rules={[{ required: true }]}>
          <TextArea rows={4} placeholder="描述您想要的变化..." />
        </Form.Item>
        
        <Form.Item>
          <Button type="primary" htmlType="submit">
            开始Remix
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};
```

---

## ⚠️ 十、潜在问题和注意事项

### 问题1: 外部API可能不支持

**风险**: 
- 外部API（45.8.22.95:8000）可能没有实现remix端点
- 需要先验证API是否支持

**验证方法**:
```bash
# 测试remix端点是否存在
curl -X POST http://45.8.22.95:8000/sora/v1/videos/{已完成的video_id}/remix \
  -H "Authorization: sk-XlwdCKIn8g7sJ672o5UOawhOqvXYQKhOwqaFzPv8bH2e16HYS8dS55wFIKiBvqTy" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"测试remix","model":"sora_video2"}'
```

**预期**:
- ✅ 200 OK → API支持，可以开发
- ❌ 404 Not Found → API不支持，暂不开发

---

### 问题2: 源视频必须完成

**限制**:
- 只能Remix已完成的视频
- 需要检查 `status === 'COMPLETED'`
- 需要有 `externalTaskId`

**代码**:
```typescript
if (originalTask.status !== TaskStatus.COMPLETED) {
  return res.status(400).json({ 
    error: '只能Remix已完成的视频' 
  });
}

if (!originalTask.externalTaskId) {
  return res.status(400).json({ 
    error: '原视频缺少外部ID，无法Remix' 
  });
}
```

---

### 问题3: 数据库字段

**需要添加**:
- `remixedFromVideoId`: 源视频的内部ID
- `remixedFromExternal`: 源视频的外部ID
- `isRemix`: 标记是否是Remix视频

**迁移影响**:
- 需要运行数据库迁移
- 现有数据不受影响（新字段可为null）
- 需要重启后端容器

---

## 🎊 十一、推荐方案

### 最终推荐：**方案A（简化版）** ⭐

**理由**:

1. **遵循Project Rules**:
   - ✅ KISS原则
   - ✅ YAGNI原则
   - ✅ 最小化代码
   - ✅ 易于维护

2. **功能足够**:
   - ✅ 核心功能完整
   - ✅ 双ID系统
   - ✅ 轮询和SSE
   - ✅ 数据持久化

3. **开发效率**:
   - ✅ 2-3小时完成
   - ✅ 代码简洁（~60行）
   - ✅ 测试简单

4. **实际需求**:
   - Remix是低频功能
   - 不需要复杂的负载均衡
   - 用户体验更重要

---

## 📝 十二、实施建议

### 第一步：验证外部API

**在开发前，先测试**:
```bash
# 1. 找一个已完成的视频
docker exec sora-postgres psql -U sorauser -d soraui \
  -c "SELECT \"videoId\", \"externalTaskId\" FROM \"VideoTask\" WHERE status='COMPLETED' LIMIT 1;"

# 2. 测试remix端点
curl -X POST http://45.8.22.95:8000/sora/v1/videos/{externalTaskId}/remix \
  -H "Authorization: sk-XlwdCKIn8g7sJ672o5UOawhOqvXYQKhOwqaFzPv8bH2e16HYS8dS55wFIKiBvqTy" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"测试remix","model":"sora_video2"}'
```

**预期结果**:
- ✅ 200 OK → 继续开发
- ❌ 404 → 等待API支持

---

### 第二步：数据库准备

**检查现有字段**:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'VideoTask' 
AND column_name LIKE '%remix%';
```

**如果没有，添加字段**:
```prisma
// prisma/schema.prisma
model VideoTask {
  // ...
  remixedFromVideoId  String?
  remixedFromExternal String?
  isRemix             Boolean  @default(false)
}
```

---

### 第三步：实现Controller

**文件**: `src/controllers/soraRelayController.ts`

**位置**: 在文件末尾添加

**代码**: 使用简化版（~60行）

---

### 第四步：测试验证

**测试清单**:
```
✅ 1. 数据库字段已添加
✅ 2. 路由注册成功
✅ 3. API调用成功
✅ 4. 获取externalTaskId
✅ 5. 保存新任务
✅ 6. 轮询启动
✅ 7. SSE推送工作
✅ 8. 前端显示正常
```

---

## 🎉 十三、总结

### Content-Type 确认

**答案**: ✅ **Remix使用JSON，不是multipart/form-data！**

**原因**:
- 不需要上传文件
- 只需要文本prompt
- OpenAI和Tokens-Pool都是JSON

---

### 实现建议

**推荐**: ✅ **简化版（方案A）**

**优势**:
- 遵循Project Rules
- 代码简洁（60行）
- 工作量小（2-3小时）
- 功能完整

**前提**:
- ⚠️ 先验证外部API是否支持remix
- ⚠️ 如果不支持，暂不开发

---

### 开发优先级

**建议**: ⏳ **P2 - 可选功能**

**理由**:
1. 核心功能已完整（创建视频）
2. Remix是增强功能
3. 使用频率可能较低
4. 可以等用户反馈后再开发

---

**设计人**: AI Assistant  
**设计日期**: 2025-11-20  
**设计原则**: 遵循Project Rules, KISS, YAGNI  
**推荐方案**: 简化版（方案A），JSON格式，2-3小时完成





