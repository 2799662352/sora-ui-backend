# 🏗️ 企业级后端架构精华

> 从 bulletproof-nodejs、express-boilerplate、nodejs-express-typescript-starter 提取

---

## 📊 三大项目对比

| 特性 | bulletproof-nodejs | express-boilerplate | nodejs-typescript-starter |
|------|-------------------|---------------------|---------------------------|
| ⭐ Stars | 5,700+ | 116 | 13 |
| 🎯 核心亮点 | 架构模式 | Prisma集成 | 模块化设计 |
| 💾 数据库 | MongoDB | PostgreSQL | PostgreSQL |
| 🔌 ORM | Mongoose | Prisma | Prisma |
| 📦 DI | TypeDI | ✅ | InversifyJS |
| 🔐 认证 | JWT | JWT | JWT + RBAC |
| ✅ 验证 | celebrate | Zod | Yup |
| 📝 日志 | Winston | Winston | Winston |

---

## 🎯 核心模式提取

### 1️⃣ Loader 模式（bulletproof-nodejs 精华）

**核心思想：** 分离应用初始化逻辑

```typescript
// ❌ 糟糕做法：全部在 app.ts
import express from 'express';
const app = express();
app.use(cors());
app.use(express.json());
// 连接数据库
// 注册路由
// 启动服务器

// ✅ Loader 模式
// src/loaders/index.ts
export default async ({ expressApp }) => {
  await databaseLoader();      // 数据库
  await dependencyLoader();    // 依赖注入
  await expressLoader(app);    // Express
  await jobsLoader();          // 后台任务
  await eventsLoader();        // 事件系统
};

// src/index.ts
import loaders from './loaders';
const app = express();
await loaders({ expressApp: app });
app.listen(3001);
```

**优势：**
- ✅ **职责分离** - 每个 loader 负责一件事
- ✅ **按序初始化** - 保证启动顺序
- ✅ **易于测试** - 可以单独测试每个 loader
- ✅ **清晰的依赖** - 一眼看出启动流程

**Sora UI 应用：**

```typescript
// src/loaders/index.ts
import prismaLoader from './prisma';
import expressLoader from './express';
import loggerLoader from './logger';

export default async ({ expressApp }) => {
  await prismaLoader();         // 连接 PostgreSQL
  await loggerLoader();         // 初始化 Winston
  await expressLoader(app);     // Express 中间件
  return { expressApp };
};
```

---

### 2️⃣ 三层架构（express-boilerplate 精华）

**核心思想：** 分离关注点，职责单一

```
┌─────────────────────────────────────┐
│  Controllers (路由层)                │
│  - 处理 HTTP 请求/响应               │
│  - 调用 Service 层                   │
│  - 返回统一格式                      │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Services (业务逻辑层)               │
│  - 核心业务逻辑                      │
│  - 事务管理                          │
│  - 调用 Repository                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Repositories (数据访问层)           │
│  - 数据库 CRUD                       │
│  - Prisma 调用                       │
└─────────────────────────────────────┘
```

**实际代码：**

```typescript
// Controller 层
router.post('/register', catchAsync(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json({ success: true, data: result });
}));

// Service 层
class AuthService {
  async register(data: RegisterDTO) {
    // 1. 业务验证
    const exists = await this.userRepo.findByUsername(data.username);
    if (exists) throw new ValidationError('用户已存在');

    // 2. 创建用户
    const user = await this.userRepo.create(data);

    // 3. 发送欢迎邮件
    await this.emailService.sendWelcome(user.email);

    return { user };
  }
}

// Repository 层
class UserRepository {
  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async create(data: CreateUserDTO) {
    return this.prisma.user.create({ data });
  }
}
```

**为什么分层？**

| 层级 | 职责 | 不应该做 |
|------|------|----------|
| Controller | HTTP 处理 | ❌ 业务逻辑 |
| Service | 业务逻辑 | ❌ HTTP 细节 |
| Repository | 数据访问 | ❌ 业务规则 |

---

### 3️⃣ 依赖注入（nodejs-typescript-starter 精华）

**核心思想：** 控制反转，降低耦合

```typescript
// ❌ 糟糕做法：硬编码依赖
import { userRepository } from '../repositories/userRepository';

class AuthService {
  async login(username: string, password: string) {
    const user = await userRepository.findByUsername(username);
    // 问题：无法 mock userRepository 进行测试
    // 问题：切换实现需要修改代码
  }
}

// ✅ 依赖注入
@injectable()
class AuthService {
  constructor(
    @inject('UserRepository') private userRepo: IUserRepository,
    @inject('Logger') private logger: ILogger
  ) {}

  async login(username: string, password: string) {
    const user = await this.userRepo.findByUsername(username);
    this.logger.info(`User ${username} logged in`);
    // 优势：可以轻松 mock 依赖
    // 优势：切换实现不修改代码
  }
}
```

**使用 tsyringe：**

```typescript
// 1. 定义容器
container.register('UserRepository', { useClass: UserRepository });
container.register('Logger', { useClass: WinstonLogger });
container.register('AuthService', { useClass: AuthService });

// 2. 解析依赖
const authService = container.resolve(AuthService);
// AuthService 自动获得 UserRepository 和 Logger
```

**优势：**
- ✅ **可测试性** - Mock 依赖轻松
- ✅ **灵活性** - 切换实现不改代码
- ✅ **解耦** - 不依赖具体实现
- ✅ **自动化** - 容器自动注入

---

### 4️⃣ 统一错误处理（三项目共识）

**核心思想：** 集中处理，类型化错误

```typescript
// 自定义错误类
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
  }
}

// 预定义错误
export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(404, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '未授权') {
    super(401, message);
  }
}

// 全局错误处理中间件
app.use((err, req, res, next) => {
  if (err instanceof AppError && err.isOperational) {
    // 预期错误（业务错误）
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // 未预期错误（系统错误）
  logger.error('💥 Unhandled error:', err);
  return res.status(500).json({
    success: false,
    message: '服务器内部错误',
  });
});
```

**使用：**

```typescript
// Service 层
async login(username: string, password: string) {
  const user = await this.userRepo.findByUsername(username);
  if (!user) {
    throw new UnauthorizedError('用户名或密码错误');
  }
  // 错误自动传播到全局处理器
}

// Controller 层（使用 catchAsync）
router.post('/login', catchAsync(async (req, res) => {
  const result = await authService.login(req.body);
  res.json({ success: true, data: result });
  // 不需要 try-catch！
}));
```

---

### 5️⃣ 请求验证（express-boilerplate + nodejs-typescript-starter）

**核心思想：** 类型安全的请求验证

**使用 Zod（express-boilerplate 方式）：**

```typescript
// 定义 Schema
export const registerSchema = z.object({
  username: z.string().min(3, '用户名至少3个字符'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少8个字符'),
});

// 验证中间件
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      next(new ValidationError('验证失败'));
    }
  };
};

// 使用
router.post(
  '/register',
  validate(registerSchema),
  catchAsync(async (req, res) => {
    // req.body 已验证！
  })
);
```

**为什么选 Zod？**
- ✅ **TypeScript 原生** - 类型推导
- ✅ **可组合** - Schema 可复用
- ✅ **友好错误** - 详细的错误信息

---

### 6️⃣ 日志系统（bulletproof-nodejs 精华）

**核心思想：** 结构化日志，分级记录

```typescript
// Winston 配置
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// 使用
logger.info('User logged in', { userId: 123, ip: req.ip });
logger.error('Database error', { error: err.message, stack: err.stack });
logger.warn('Rate limit exceeded', { userId: 456 });
```

**日志级别：**
- `error` - 错误（需立即处理）
- `warn` - 警告（需关注）
- `info` - 信息（正常运行）
- `debug` - 调试（开发使用）

---

### 7️⃣ 模块化设计（nodejs-typescript-starter 精华）

**核心思想：** 功能模块化，高内聚低耦合

```
src/
  ├── modules/
  │   ├── auth/
  │   │   ├── auth.controller.ts
  │   │   ├── auth.service.ts
  │   │   ├── auth.repository.ts
  │   │   ├── auth.validator.ts
  │   │   └── auth.types.ts
  │   ├── user/
  │   │   ├── user.controller.ts
  │   │   ├── user.service.ts
  │   │   └── user.repository.ts
  │   └── license/
  │       ├── license.controller.ts
  │       └── license.service.ts
  ├── shared/
  │   ├── middleware/
  │   ├── utils/
  │   └── errors/
  └── loaders/
```

**优势：**
- ✅ **独立性** - 每个模块可单独开发
- ✅ **可移植** - 模块可复用到其他项目
- ✅ **清晰** - 文件组织一目了然

---

## 🎯 Sora UI 采用的模式

基于项目规则，我们选择：

### ✅ 核心模式

1. **Loader 模式** - 清晰的启动流程
2. **三层架构** - Controller → Service → Repository
3. **依赖注入** - tsyringe（轻量级）
4. **统一错误处理** - AppError + 全局中间件
5. **请求验证** - Zod（类型安全）
6. **日志系统** - Winston（生产就绪）

### ❌ 不采用的模式

1. ❌ **事件系统** - 暂不需要（复杂度过高）
2. ❌ **后台任务** - 暂不需要（无定时任务）
3. ❌ **完全模块化** - 项目规模不大（保持简单）

### 🎯 优先级

```
高优先级（必须）：
✅ Loaders
✅ 三层架构
✅ 错误处理
✅ 日志系统

中优先级（推荐）：
⏳ 依赖注入
⏳ 请求验证
⏳ 健康检查

低优先级（可选）：
⏳ 事件系统
⏳ 后台任务
⏳ 缓存系统
```

---

## 📚 关键学习资源

### 1. bulletproof-nodejs
- **URL:** https://github.com/santiq/bulletproof-nodejs
- **学习重点：**
  - `src/loaders/` - Loader 模式
  - `src/services/` - 服务层设计
  - `src/api/` - 路由和控制器

### 2. express-boilerplate
- **URL:** https://github.com/mzubair481/express-boilerplate
- **学习重点：**
  - `prisma/schema.prisma` - Prisma 模型
  - `src/services/` - Prisma 集成
  - `src/middleware/` - JWT 中间件

### 3. nodejs-express-typescript-starter
- **URL:** https://github.com/kumarsonu676/nodejs-express-typescript-starter-project-with-prisma-postgresql-and-copilot-ai-setup
- **学习重点：**
  - 模块化架构
  - InversifyJS 依赖注入
  - RBAC 权限系统

---

## 🚀 立即行动

**查看完整升级计划：**
```
D:\备份\text\25\soraui_4.0\sora-ui-backend\UPGRADE_PLAN.md
```

**开始第一步：**
```bash
cd sora-ui-backend
npm install tsyringe reflect-metadata zod winston
mkdir -p src/loaders src/validators logs
```

准备好升级了吗？🎯

