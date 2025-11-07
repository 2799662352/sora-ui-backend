# 🚀 Sora UI Backend 生产级升级计划

> 基于 bulletproof-nodejs 架构精华 + 项目规则定制

---

## 📊 当前状态

```
✅ Prisma + PostgreSQL 集成完成
✅ 基础三层架构（Repository + Service + Controller）
✅ JWT 认证功能
⏳ 缺少：DI容器、统一错误处理、日志系统、验证中间件
```

---

## 🎯 升级目标

**将 Sora UI Backend 改造为生产就绪的企业级后端**

### 核心原则（遵循项目规则）

1. ✅ **低耦合高内聚** - 模块化设计
2. ✅ **零依赖优先** - 能用原生就用原生
3. ✅ **性能优先** - 考虑每个决策的性能影响
4. ✅ **代码优雅** - Clean Code 原则
5. ✅ **中文注释** - 复杂逻辑用中文解释

---

## 📅 五阶段升级计划

---

## 🔥 阶段1：基础架构完善（2小时）

### 1.1 完善 Loaders 系统

**参考：** `bulletproof-nodejs/src/loaders/index.ts`

**目标：** 统一应用初始化流程

**实现：**

```typescript
// src/loaders/index.ts
import prismaLoader from './prisma';
import expressLoader from './express';
import loggerLoader from './logger';

export default async ({ expressApp }) => {
  // 1. 数据库连接
  await prismaLoader();
  console.log('✅ Prisma loaded');

  // 2. 日志系统
  await loggerLoader();
  console.log('✅ Logger loaded');

  // 3. Express 中间件
  await expressLoader({ app: expressApp });
  console.log('✅ Express loaded');

  return { expressApp };
};
```

**需要创建的文件：**
- ✅ `src/loaders/prisma.ts` - 已存在
- 🆕 `src/loaders/express.ts` - 迁移 app.ts 的中间件配置
- 🆕 `src/loaders/logger.ts` - Winston 日志配置
- 🆕 `src/loaders/index.ts` - 统一入口

### 1.2 统一错误处理

**参考：** `bulletproof-nodejs` 错误处理模式

**目标：** 集中处理所有错误，提供友好的错误响应

**实现：**

```typescript
// src/utils/errors.ts ✅ 已存在，需扩展
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

// 预定义错误类型
export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(404, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '未授权访问') {
    super(401, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = '验证失败') {
    super(400, message);
  }
}
```

```typescript
// src/middlewares/errorHandler.ts ✅ 已存在，需完善
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../loaders/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 已知的操作错误
  if (err instanceof AppError && err.isOperational) {
    logger.warn({
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // 未知错误（严重）
  logger.error({
    message: '💥 Unhandled error',
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : err.message,
  });
};
```

### 1.3 异步错误捕获

```typescript
// src/utils/catchAsync.ts
import { Request, Response, NextFunction } from 'express';

/**
 * 包装异步路由处理器，自动捕获错误
 */
export const catchAsync = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
```

**使用示例：**

```typescript
// 之前
router.post('/register', async (req, res) => {
  try {
    const result = await authService.register(req.body);
    res.json(result);
  } catch (error) {
    // 手动处理错误
  }
});

// 之后
router.post('/register', catchAsync(async (req, res) => {
  const result = await authService.register(req.body);
  res.json(result);
  // 错误自动传递给全局错误处理器
}));
```

---

## 🔥 阶段2：服务层重构（2小时）

### 2.1 依赖注入容器

**使用库：** `tsyringe` (轻量级，TypeScript 原生支持)

**安装：**
```bash
npm install tsyringe reflect-metadata
```

**配置：**

```typescript
// src/container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { UserRepository } from './repositories/userRepository';
import { LicenseRepository } from './repositories/licenseRepository';
import { AuthService } from './services/authService';

// 注册 Prisma Client（单例）
container.registerSingleton('PrismaClient', PrismaClient);

// 注册 Repositories（单例）
container.registerSingleton('UserRepository', UserRepository);
container.registerSingleton('LicenseRepository', LicenseRepository);

// 注册 Services（单例）
container.registerSingleton('AuthService', AuthService);

export { container };
```

### 2.2 重构 UserRepository

```typescript
// src/repositories/userRepository.ts
import { injectable, inject } from 'tsyringe';
import { PrismaClient, User } from '@prisma/client';
import { hashPassword, verifyPassword } from '../utils/auth';

@injectable()
export class UserRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<User> {
    const hashedPassword = await hashPassword(data.password);
    return this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: hashedPassword,
      },
    });
  }

  // ... 其他方法
}
```

### 2.3 重构 AuthService

```typescript
// src/services/authService.ts
import { injectable, inject } from 'tsyringe';
import { UserRepository } from '../repositories/userRepository';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { generateToken } from '../utils/jwt';

@injectable()
export class AuthService {
  constructor(
    @inject('UserRepository') private userRepository: UserRepository
  ) {}

  async register(data: {
    username: string;
    email: string;
    password: string;
  }) {
    // 验证用户是否存在
    const existing = await this.userRepository.findByUsername(data.username);
    if (existing) {
      throw new ValidationError('用户名已存在');
    }

    // 创建用户
    const user = await this.userRepository.create(data);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }

  async login(username: string, password: string) {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new UnauthorizedError('用户名或密码错误');
    }

    const isValid = await this.userRepository.verifyPassword(
      password,
      user.password
    );
    if (!isValid) {
      throw new UnauthorizedError('用户名或密码错误');
    }

    const token = generateToken({ userId: user.id });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }
}
```

### 2.4 重构 Controller

```typescript
// src/routes/auth.ts
import { Router } from 'express';
import { container } from '../container';
import { AuthService } from '../services/authService';
import { catchAsync } from '../utils/catchAsync';

const router = Router();
const authService = container.resolve(AuthService);

// 注册
router.post('/register', catchAsync(async (req, res) => {
  const { username, email, password } = req.body;
  const result = await authService.register({ username, email, password });
  
  res.status(201).json({
    success: true,
    data: result,
  });
}));

// 登录
router.post('/login', catchAsync(async (req, res) => {
  const { username, password } = req.body;
  const result = await authService.login(username, password);
  
  res.json({
    success: true,
    data: result,
  });
}));

export default router;
```

---

## 🔥 阶段3：请求验证 + 日志系统（1.5小时）

### 3.1 请求验证中间件

**使用库：** `zod` (类型安全的验证库)

```typescript
// src/validators/authValidator.ts
import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3, '用户名至少3个字符'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少8个字符'),
});

export const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});
```

```typescript
// src/middlewares/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error: any) {
      const errors = error.errors.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      next(new ValidationError(JSON.stringify(errors)));
    }
  };
};
```

**使用：**

```typescript
router.post(
  '/register',
  validate(registerSchema),
  catchAsync(async (req, res) => {
    // req.body 已经过验证
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  })
);
```

### 3.2 日志系统

**使用库：** `winston`

```typescript
// src/loaders/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // 错误日志单独存储
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    // 所有日志
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

// 开发环境输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export { logger };
```

---

## 🔥 阶段4：生产优化（1小时）

### 4.1 PM2 配置

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'sora-ui-backend',
      script: './dist/index.js',
      instances: 'max', // 使用所有CPU核心
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 4000,
      max_memory_restart: '500M',
    },
  ],
};
```

### 4.2 Docker Compose 完整配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: sora-postgres-prod
    restart: always
    environment:
      POSTGRES_USER: soraui
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: soraui
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U soraui"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: sora-backend-prod
    restart: always
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://soraui:${POSTGRES_PASSWORD}@postgres:5432/soraui
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./logs:/app/logs

volumes:
  postgres_data:
```

### 4.3 健康检查端点

```typescript
// src/routes/health.ts
import { Router } from 'express';
import { db } from '../loaders/prisma';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    await db.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

export default router;
```

---

## 🔥 阶段5：测试 + 文档（1小时）

### 5.1 单元测试

```typescript
// src/__tests__/services/authService.test.ts
import 'reflect-metadata';
import { container } from '../../container';
import { AuthService } from '../../services/authService';
import { UserRepository } from '../../repositories/userRepository';

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: UserRepository;

  beforeEach(() => {
    authService = container.resolve(AuthService);
    userRepository = container.resolve(UserRepository);
  });

  describe('register', () => {
    it('should create a new user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await authService.register(userData);

      expect(result.user.username).toBe('testuser');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw error if username exists', async () => {
      // ... 测试逻辑
    });
  });
});
```

### 5.2 集成测试

```typescript
// src/__tests__/routes/auth.test.ts
import request from 'supertest';
import app from '../../app';

describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.username).toBe('testuser');
  });
});
```

---

## 📋 实施检查清单

### 阶段1：基础架构
- [ ] 创建 `src/loaders/index.ts`
- [ ] 创建 `src/loaders/express.ts`
- [ ] 创建 `src/loaders/logger.ts`
- [ ] 完善 `src/utils/errors.ts`
- [ ] 完善 `src/middlewares/errorHandler.ts`
- [ ] 创建 `src/utils/catchAsync.ts`

### 阶段2：依赖注入
- [ ] 安装 `tsyringe`
- [ ] 创建 `src/container.ts`
- [ ] 重构 `userRepository.ts`
- [ ] 重构 `authService.ts`
- [ ] 重构 `auth.ts` 路由

### 阶段3：验证 + 日志
- [ ] 安装 `zod` 和 `winston`
- [ ] 创建 `src/validators/authValidator.ts`
- [ ] 创建 `src/middlewares/validate.ts`
- [ ] 配置 Winston 日志

### 阶段4：生产优化
- [ ] 创建 `ecosystem.config.js`
- [ ] 完善 `docker-compose.yml`
- [ ] 添加健康检查端点
- [ ] 配置自动备份

### 阶段5：测试
- [ ] 配置 Jest
- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 前端集成测试

---

## 🎯 执行时间估算

| 阶段 | 时间 | 说明 |
|------|------|------|
| 阶段1 | 2小时 | 基础架构完善 |
| 阶段2 | 2小时 | 服务层重构 |
| 阶段3 | 1.5小时 | 验证 + 日志 |
| 阶段4 | 1小时 | 生产优化 |
| 阶段5 | 1小时 | 测试 + 文档 |
| **总计** | **7.5小时** | **1个工作日** |

---

## 🚀 立即开始

**现在开始阶段1？**

```bash
# 创建必要的目录
mkdir -p src/loaders src/validators logs

# 启动升级！
npm install tsyringe reflect-metadata zod winston
```

准备好了吗？我们从阶段1开始！🎯

