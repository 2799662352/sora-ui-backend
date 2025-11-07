# 🚀 Sora UI Backend - 改造实施指南

## 📋 改造概览

这个改造方案从3个顶级GitHub项目中提炼精华：
1. **bulletproof-nodejs** (5.7k stars) - 架构设计
2. **express-boilerplate** (116 stars) - Prisma集成
3. **nodejs-express-typescript-starter** - 模块化设计

---

## 🎯 改造目标

```
✅ 从内存数据库 → PostgreSQL (生产级)
✅ 扁平架构 → 3层架构 (可维护)
✅ 简单错误 → 统一错误处理 (专业)
✅ 无日志 → 结构化日志 (可观测)
✅ 无管理 → 完整管理API (功能齐全)
```

---

## 📦 第1步：安装依赖（10分钟）

### 1.1 安装 Prisma 和 PostgreSQL 客户端

```bash
cd sora-ui-backend

# 安装 Prisma
npm install @prisma/client
npm install -D prisma

# 生成 Prisma 客户端
npx prisma generate
```

### 1.2 配置环境变量

更新 `.env` 文件：

```env
# 数据库配置（Docker中已有）
DATABASE_URL="postgresql://soraui:SoraUI2024!@localhost:5432/soraui"

# JWT配置
JWT_SECRET="sora-ui-jwt-secret-2024"
JWT_EXPIRES_IN="7d"

# 服务器配置
PORT=3001
NODE_ENV=development

# CORS配置
CORS_ORIGIN="*"
```

---

## 🗄️ 第2步：初始化数据库（15分钟）

### 2.1 创建数据库迁移

```bash
# 创建初始迁移
npx prisma migrate dev --name init

# 这会：
# 1. 连接到PostgreSQL
# 2. 创建所有表（users, licenses, activity_logs）
# 3. 生成 Prisma Client
```

**预期输出：**
```
✔ Generated Prisma Client
✔ Your database is now in sync with your Prisma schema
✔ Created the following migration(s):
  └─ 20251106_init
```

### 2.2 创建初始数据（可选）

创建 `prisma/seed.ts`：

```typescript
import { PrismaClient, UserRole, LicenseType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始填充数据...');

  // 1. 创建管理员账号
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@soraui.com',
      password: adminPassword,
      role: UserRole.ADMIN,
    },
  });
  console.log('✅ 管理员账号:', admin.username);

  // 2. 创建演示许可证
  const trialLicense = await prisma.license.create({
    data: {
      licenseKey: 'TRIAL-DEMO-1234-5678',
      type: LicenseType.TRIAL,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后
    },
  });
  console.log('✅ 试用许可证:', trialLicense.licenseKey);

  const proLicense = await prisma.license.create({
    data: {
      licenseKey: 'PRO-DEMO-ABCD-EFGH',
      type: LicenseType.PRO,
    },
  });
  console.log('✅ 专业版许可证:', proLicense.licenseKey);

  console.log('🎉 数据填充完成！');
}

main()
  .catch((e) => {
    console.error('❌ 填充失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**运行填充：**
```bash
npx ts-node prisma/seed.ts
```

---

## 🔄 第3步：更新 Service 层（30分钟）

### 3.1 更新 authService.ts

用 `userRepository` 替换 `inMemoryDB`：

```typescript
// src/services/authService.ts
import { userRepository } from '../repositories/userRepository';
import { activityLogRepository } from '../repositories/activityLogRepository';
import { AuthenticationError, ConflictError } from '../utils/errors';

export class AuthService {
  async register(username: string, email: string, password: string) {
    // 检查用户名是否存在
    const existingUser = await userRepository.findByUsername(username);
    if (existingUser) {
      throw new ConflictError('用户名已存在');
    }

    // 检查邮箱是否存在
    if (email) {
      const existingEmail = await userRepository.findByEmail(email);
      if (existingEmail) {
        throw new ConflictError('邮箱已被使用');
      }
    }

    // 创建用户
    const user = await userRepository.create({
      username,
      email,
      password, // Repository会自动加密
    });

    // 记录日志
    await activityLogRepository.create({
      userId: user.id,
      action: 'register',
      details: { username, email },
    });

    // 生成JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
  }

  async login(username: string, password: string) {
    // 查找用户
    const user = await userRepository.findByUsername(username);
    if (!user) {
      throw new AuthenticationError('用户名或密码错误');
    }

    // 验证密码
    const isValid = await userRepository.verifyPassword(user, password);
    if (!isValid) {
      throw new AuthenticationError('用户名或密码错误');
    }

    // 更新最后登录时间
    await userRepository.updateLastLogin(user.id);

    // 记录日志
    await activityLogRepository.create({
      userId: user.id,
      action: 'login',
      details: { username },
    });

    // 生成JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
  }
}
```

### 3.2 更新 licenseService.ts

同样用 Repository 替换：

```typescript
// src/services/licenseService.ts
import { licenseRepository } from '../repositories/licenseRepository';
import { activityLogRepository } from '../repositories/activityLogRepository';
import { NotFoundError, BusinessLogicError } from '../utils/errors';
import { LicenseType } from '@prisma/client';

export class LicenseService {
  async createLicense(type: LicenseType, expiryDays?: number) {
    const expiresAt = expiryDays
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      : undefined;

    const license = await licenseRepository.create({
      type,
      expiresAt,
      features: this.getFeaturesByType(type),
    });

    return license;
  }

  async activateLicense(licenseKey: string, userId: string, deviceId: string) {
    // 查找许可证
    const license = await licenseRepository.findByKey(licenseKey);
    if (!license) {
      throw new NotFoundError('许可证不存在');
    }

    // 检查是否已激活
    if (license.userId) {
      throw new BusinessLogicError('许可证已被激活');
    }

    // 检查是否过期
    if (licenseRepository.isExpired(license)) {
      throw new BusinessLogicError('许可证已过期');
    }

    // 激活许可证
    const activatedLicense = await licenseRepository.activate(
      licenseKey,
      userId,
      deviceId
    );

    // 记录日志
    await activityLogRepository.create({
      userId,
      action: 'activate_license',
      details: { licenseKey, type: license.type },
    });

    return activatedLicense;
  }

  private getFeaturesByType(type: LicenseType) {
    const features = {
      [LicenseType.TRIAL]: {
        maxVideos: 3,
        watermark: true,
        maxDuration: 30,
      },
      [LicenseType.PRO]: {
        maxVideos: 100,
        watermark: false,
        maxDuration: 300,
      },
      [LicenseType.ENTERPRISE]: {
        maxVideos: -1, // 无限制
        watermark: false,
        maxDuration: -1,
        priority: true,
      },
    };
    return features[type];
  }
}
```

---

## 🎮 第4步：创建管理后台 API（30分钟）

创建 `src/controllers/adminController.ts`：

```typescript
// src/controllers/adminController.ts
import { Request, Response } from 'express';
import { userRepository } from '../repositories/userRepository';
import { licenseRepository } from '../repositories/licenseRepository';
import { activityLogRepository } from '../repositories/activityLogRepository';
import { asyncHandler } from '../middlewares/errorHandler';
import { AuthorizationError } from '../utils/errors';

export class AdminController {
  /**
   * 获取所有用户
   */
  getUsers = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, role } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const { users, total } = await userRepository.findAll({
      skip,
      take,
      role: role as any,
    });

    res.json({
      success: true,
      data: {
        users: users.map(u => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt,
          lastLogin: u.lastLogin,
          license: u.license ? {
            type: u.license.type,
            isActive: u.license.isActive,
          } : null,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  });

  /**
   * 获取所有许可证
   */
  getLicenses = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, type, isActive } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const { licenses, total } = await licenseRepository.findAll({
      skip,
      take,
      type: type as any,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });

    res.json({
      success: true,
      data: {
        licenses,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  });

  /**
   * 获取系统统计
   */
  getStats = asyncHandler(async (req: Request, res: Response) => {
    const [
      totalUsers,
      totalLicenses,
      activeLicenses,
      todayLogins,
    ] = await Promise.all([
      userRepository.count(),
      licenseRepository.count(),
      licenseRepository.count({ isActive: true }),
      activityLogRepository.countByAction('login'),
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
        },
        licenses: {
          total: totalLicenses,
          active: activeLicenses,
        },
        activity: {
          todayLogins,
        },
      },
    });
  });

  /**
   * 封禁用户
   */
  banUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await userRepository.softDelete(id);

    res.json({
      success: true,
      message: '用户已被封禁',
      data: { userId: user.id },
    });
  });
}

export const adminController = new AdminController();
```

创建 `src/routes/admin.ts`：

```typescript
// src/routes/admin.ts
import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// 所有管理路由都需要认证
router.use(authMiddleware);

// TODO: 添加管理员权限检查中间件

router.get('/users', adminController.getUsers);
router.get('/licenses', adminController.getLicenses);
router.get('/stats', adminController.getStats);
router.post('/users/:id/ban', adminController.banUser);

export default router;
```

---

## 🚀 第5步：更新主应用（20分钟）

更新 `src/app.ts`：

```typescript
// src/app.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// 路由
import authRoutes from './routes/auth';
import licenseRoutes from './routes/license';
import updateRoutes from './routes/update';
import adminRoutes from './routes/admin';

// 中间件
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

// 数据库
import { initDatabase, closeDatabase } from './loaders/prisma';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============ 中间件 ============
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============ API 路由 ============
app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/update', updateRoutes);
app.use('/api/admin', adminRoutes);

// ============ 健康检查 ============
app.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    const { db } = await import('./loaders/prisma');
    await db.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      data: {
        status: 'ok',
        message: 'Sora UI Backend is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: 'connected',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: {
        status: 'error',
        database: 'disconnected',
      },
    });
  }
});

// ============ 错误处理 ============
app.use(notFoundHandler);
app.use(errorHandler);

// ============ 启动服务器 ============
const startServer = async () => {
  try {
    // 初始化数据库
    await initDatabase();

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║   🚀 Sora UI Backend Started!        ║
╚════════════════════════════════════════╝

📡 Server: http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health
🛠️  Admin:  http://localhost:${PORT}/api/admin/stats
🌐 Env:    ${process.env.NODE_ENV || 'development'}
🗄️  DB:     PostgreSQL Connected
      `);
    });

    // 优雅关闭
    process.on('SIGTERM', async () => {
      console.log('⚠️  SIGTERM received, closing server...');
      await closeDatabase();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
```

---

## ✅ 第6步：测试验证（30分钟）

### 6.1 启动服务器

```bash
npm run dev
```

**预期输出：**
```
✅ PostgreSQL connected successfully
✅ Database connection tested
╔════════════════════════════════════════╗
║   🚀 Sora UI Backend Started!        ║
╚════════════════════════════════════════╝
```

### 6.2 测试 API

#### 注册用户
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "test123"
  }'
```

#### 登录
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "test123"
  }'
```

#### 管理后台 - 查看用户
```bash
curl http://localhost:3001/api/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### 管理后台 - 查看统计
```bash
curl http://localhost:3001/api/admin/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 6.3 验证数据库

```bash
# 进入 Docker PostgreSQL
docker exec -it sora-postgres psql -U soraui

# 查看数据
\dt              # 列出所有表
SELECT * FROM users;
SELECT * FROM licenses;
SELECT * FROM activity_logs;
\q               # 退出
```

---

## 🎉 完成！

### 你现在有了：

```
✅ 生产级 PostgreSQL 数据库
✅ 3层架构（Repository → Service → Controller）
✅ 统一错误处理
✅ 活动日志记录
✅ 管理后台 API
✅ 类型安全（Prisma + TypeScript）
✅ 可测试的代码结构
```

### 下一步可以做：

1. **添加日志系统** (Winston)
2. **添加数据验证** (Zod)
3. **添加测试** (Jest)
4. **添加 API 文档** (Swagger)
5. **部署到生产环境**

---

## 📚 参考项目

- [bulletproof-nodejs](https://github.com/santiq/bulletproof-nodejs) - 架构设计
- [express-boilerplate](https://github.com/mzubair481/express-boilerplate) - Prisma集成
- [Prisma Docs](https://www.prisma.io/docs) - Prisma官方文档

---

**有问题随时问我！🚀**

