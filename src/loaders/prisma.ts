// src/loaders/prisma.ts
// Prisma 数据库连接管理
// 学习自: bulletproof-nodejs (Database Loader Pattern)

import { PrismaClient } from '@prisma/client';

/**
 * 全局 Prisma 客户端实例
 * 使用单例模式确保整个应用只有一个连接池
 */
declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * 创建或获取 Prisma 客户端实例
 * 开发环境下复用全局实例避免热重载时创建过多连接
 */
export const db = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

// 🔥 导出 prisma（别名）
export const prisma = db;

if (process.env.NODE_ENV !== 'production') {
  global.prisma = db;
}

/**
 * 优雅关闭数据库连接
 */
export async function disconnectDB() {
  await db.$disconnect();
  console.log('📊 Database disconnected');
}

/**
 * 测试数据库连接
 */
export async function testConnection() {
  try {
    await db.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}
