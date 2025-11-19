// src/app.ts
// Express 应用主文件

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import authRoutes from './routes/auth';
import licenseRoutes from './routes/license';
import updateRoutes from './routes/update';
import adminRoutes from './routes/admin';
import videoTaskRoutes from './routes/videoTask';
import apiKeyRoutes from './routes/apiKey';
import sseRoutes from './routes/sse';
import channelRoutes from './routes/channel';  // 🔥 Channel 管理
import relayRoutes from './routes/relay';      // 🔥 Relay 转发
import statsRoutes from './routes/stats';      // 🔥 统计 API
import soraRelayRoutes from './routes/soraRelay';  // 🔥 Sora Relay（完全转发）
import { rateLimiter } from './middleware/rateLimiter'; // 🔥 限流中间件
import { testConnection } from './loaders/prisma';
import { redisService } from './services/redisService';
import { recoverPollingTasks } from './services/taskPollingService';  // 🔥 新增
import { APIResponse } from './types';
// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============ 中间件 ============

// 🔥 LiteLLM: 全局限流中间件 (在路由之前注册)
// 对 /api/relay 开头的路由应用更严格的限流
app.use('/api/relay', rateLimiter('GLOBAL_API'));
// 对其他 API 应用普通限流
app.use('/api', rateLimiter('GLOBAL_WEB'));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// JSON 解析（支持大图片 Base64 上传）
app.use(express.json({ limit: '100mb' }));  // 无限制，支持大文件
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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
app.use('/api/video', videoTaskRoutes);
app.use('/api', apiKeyRoutes);  // 🔥 API 密钥服务
app.use('/api/sse', sseRoutes);  // 🔥 SSE 推送服务
app.use('/api/channels', channelRoutes);  // 🔥 Channel 管理（One Hub）
app.use('/api/stats', statsRoutes);       // 🔥 统计 API（LiteLLM）
// 🔥 重要：更具体的路由必须在前面！
app.use('/api/relay/sora', soraRelayRoutes);  // 🔥 Sora Relay（完全符合LiteLLM）- 必须在 /api/relay 之前！
app.use('/api/relay', relayRoutes);       // 🔥 Relay 转发（One Hub）- 通用路由放后面

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
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ 全局错误处理捕获:');
  console.error('  路径:', req.method, req.path);
  console.error('  错误类型:', err.constructor.name);
  console.error('  错误消息:', err.message);
  console.error('  错误堆栈:', err.stack);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  res.status(err.statusCode || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : err.message || '未知错误',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  } as APIResponse);
});

// ============ 启动服务器 ============

async function startServer() {
  try {
    // 🔥 连接 Redis（LiteLLM 模式）
    if (process.env.ENABLE_REDIS_CACHE !== 'false') {
      try {
        await redisService.connect();
        console.log('✅ Redis connected successfully');
        
        // 🔥 LiteLLM: 故障恢复 - 从 Redis 恢复未完成任务
        await recoverPollingTasks();
      } catch (error) {
        console.warn('⚠️  Redis connection failed, running without cache:', error);
        // 继续运行，不阻塞启动
      }
    }
    
    // 测试数据库连接
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('数据库连接失败');
    }

    // 启动 HTTP 服务器
    app.listen(PORT, () => {
      console.log('');
      console.log('🚀 Sora UI Backend API 已启动');
      console.log(`📡 服务地址: http://localhost:${PORT}`);
      console.log(`🌍 环境: ${process.env.NODE_ENV}`);
      console.log(`🗄️  数据库: PostgreSQL (Prisma ORM)`);
      console.log(`🔥 缓存: Redis (${redisService.getStats().connected ? '已连接' : '未连接'})`);
      console.log('');
      console.log('📚 API 文档:');
      console.log(`   - 认证: http://localhost:${PORT}/api/auth`);
      console.log(`   - SSE: http://localhost:${PORT}/api/sse`);
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
