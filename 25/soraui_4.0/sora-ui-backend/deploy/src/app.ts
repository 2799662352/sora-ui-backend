// src/app.ts
// Express 应用主文件

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import licenseRoutes from './routes/license';
import updateRoutes from './routes/update';
import adminRoutes from './routes/admin';
import { testConnection } from './loaders/prisma';
import { APIResponse } from './types';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============ 中间件 ============

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// JSON 解析
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

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: '1.0.0',
    },
  } as APIResponse);
});

// ============ 根路由 ============

app.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Sora UI Backend API',
      version: '1.0.0',
      endpoints: {
        auth: '/api/auth',
        license: '/api/license',
        update: '/api/update',
        health: '/health',
      },
    },
  } as APIResponse);
});

// ============ 错误处理 ============

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
  } as APIResponse);
});

// 全局错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : err.message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  } as APIResponse);
});

// ============ 启动服务器 ============

async function startServer() {
  try {
    // 测试数据库连接
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('数据库连接失败');
    }

    // 启动服务器
    app.listen(PORT, () => {
      console.log('');
      console.log('🚀 Sora UI Backend API 已启动');
      console.log(`📡 服务地址: http://localhost:${PORT}`);
      console.log(`🌍 环境: ${process.env.NODE_ENV}`);
      console.log(`🗄️  数据库: PostgreSQL (Prisma ORM)`);
      console.log('');
      console.log('📚 API 文档:');
      console.log(`   - 认证: http://localhost:${PORT}/api/auth`);
      console.log(`   - 许可证: http://localhost:${PORT}/api/license`);
      console.log(`   - 更新: http://localhost:${PORT}/api/update`);
      console.log(`   - 健康检查: http://localhost:${PORT}/health`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

startServer();

export default app;

