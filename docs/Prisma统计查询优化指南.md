# Prisma 统计查询优化指南

本项目使用 Prisma ORM 进行数据库操作。Prisma 提供了强大的统计和聚合功能，可以让我们编写高效、类型安全的统计查询。

## 🎯 核心优势

1. **类型安全**：所有查询都有完整的 TypeScript 类型支持
2. **性能优化**：Prisma 生成高效的 SQL 查询
3. **简洁语法**：比原生 SQL 更易维护
4. **防止 SQL 注入**：自动参数化查询

## 📊 Prisma 统计 API

### 1. `count()` - 计数查询

最基础的统计方法，用于计算记录数：

```typescript
// 基础计数
const totalTasks = await prisma.videoTask.count();

// 带条件的计数
const completedTasks = await prisma.videoTask.count({
  where: {
    status: TaskStatus.COMPLETED,
    userId: userId,
  },
});

// 按多个条件计数（并行查询）
const [total, completed, failed] = await Promise.all([
  prisma.videoTask.count({ where: { userId } }),
  prisma.videoTask.count({ where: { userId, status: TaskStatus.COMPLETED } }),
  prisma.videoTask.count({ where: { userId, status: TaskStatus.FAILED } }),
]);
```

**优势**：
- 非常快速，数据库级别的计数
- 不需要加载完整记录到内存
- 可以并行执行多个计数查询

### 2. `aggregate()` - 聚合查询

用于计算总和、平均值、最大/最小值等：

```typescript
// 计算视频总时长
const result = await prisma.videoTask.aggregate({
  where: {
    userId: userId,
    status: TaskStatus.COMPLETED,
  },
  _sum: {
    duration: true,  // 总时长
  },
  _avg: {
    duration: true,  // 平均时长
  },
  _count: {
    id: true,        // 总数
  },
  _max: {
    duration: true,  // 最长时长
  },
  _min: {
    duration: true,  // 最短时长
  },
});

// 访问结果
const totalDuration = result._sum.duration || 0;
const avgDuration = result._avg.duration || 0;
const taskCount = result._count.id;
```

**优势**：
- 一次查询获取多个聚合结果
- 所有计算在数据库中完成，性能极高
- 自动处理 null 值

### 3. `groupBy()` - 分组统计

按某个字段分组并统计：

```typescript
// 按用户分组，统计每个用户的任务数
const userStats = await prisma.videoTask.groupBy({
  by: ['userId'],
  where: {
    createdAt: {
      gte: dateRange.start,
      lte: dateRange.end,
    },
  },
  _count: {
    id: true,
  },
  _sum: {
    duration: true,
  },
  orderBy: {
    _count: {
      id: 'desc',  // 按任务数降序
    },
  },
  take: 10,  // 只取前10名
});

// 结果处理
userStats.forEach(stat => {
  console.log(`用户 ${stat.userId}: ${stat._count.id} 个任务`);
});
```

**优势**：
- 适合 Top N 查询
- 可以同时统计多个指标
- 支持排序和限制结果数

## 🚀 实战示例

### 示例 1：用户任务统计面板

```typescript
async getUserDashboard(userId: string) {
  // 方法 1：多次 count（适合简单统计）
  const [total, completed, failed, processing] = await Promise.all([
    prisma.videoTask.count({ where: { userId } }),
    prisma.videoTask.count({ where: { userId, status: 'COMPLETED' } }),
    prisma.videoTask.count({ where: { userId, status: 'FAILED' } }),
    prisma.videoTask.count({ where: { userId, status: 'PROCESSING' } }),
  ]);

  return {
    total,
    completed,
    failed,
    processing,
    successRate: total > 0 ? (completed / total) * 100 : 0,
  };
}
```

### 示例 2：视频生成时长分析

```typescript
async getCompletionTimeStats(userId: string) {
  // 使用 aggregate 计算平均完成时长
  const result = await prisma.videoTask.aggregate({
    where: {
      userId,
      status: TaskStatus.COMPLETED,
      startedAt: { not: null },
      completedAt: { not: null },
    },
    _avg: {
      duration: true,
    },
    _sum: {
      duration: true,
    },
    _count: {
      id: true,
    },
  });

  // 如果需要计算实际处理时间（completedAt - startedAt）
  // 需要手动查询后计算
  const completedTasks = await prisma.videoTask.findMany({
    where: {
      userId,
      status: TaskStatus.COMPLETED,
      startedAt: { not: null },
      completedAt: { not: null },
    },
    select: {
      startedAt: true,
      completedAt: true,
    },
  });

  const processingTimes = completedTasks.map(task => 
    (task.completedAt!.getTime() - task.startedAt!.getTime()) / 1000
  );

  const avgProcessingTime = processingTimes.length > 0
    ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
    : 0;

  return {
    totalTasks: result._count.id,
    totalVideoDuration: result._sum.duration || 0,
    avgVideoDuration: result._avg.duration || 0,
    avgProcessingTime: Math.round(avgProcessingTime),
  };
}
```

### 示例 3：管理员全局统计（SaaS 级别）

```typescript
async getGlobalStats() {
  // 1. 基础统计（并行查询）
  const [
    totalTasks,
    totalUsers,
    tasksByStatus,
    mediaTypeStats,
  ] = await Promise.all([
    // 总任务数
    prisma.videoTask.count(),
    
    // 总用户数
    prisma.user.count(),
    
    // 按状态分组
    prisma.videoTask.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    
    // 按媒体类型分组
    prisma.videoTask.groupBy({
      by: ['mediaType'],
      _count: { id: true },
    }),
  ]);

  // 2. Top 用户统计
  const topUsers = await prisma.videoTask.groupBy({
    by: ['userId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  // 3. 获取用户详细信息
  const userIds = topUsers.map(u => u.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, email: true },
  });

  // 4. 组合结果
  const topUsersWithDetails = topUsers.map(stat => {
    const user = users.find(u => u.id === stat.userId);
    return {
      userId: stat.userId,
      username: user?.username || 'Unknown',
      taskCount: stat._count.id,
    };
  });

  return {
    totalTasks,
    totalUsers,
    tasksByStatus,
    mediaTypeStats,
    topUsers: topUsersWithDetails,
  };
}
```

## ⚡ 性能优化建议

### 1. 使用 `select` 和 `include` 精确控制返回数据

```typescript
// ❌ 不好：返回所有字段
const tasks = await prisma.videoTask.findMany({ where: { userId } });

// ✅ 好：只返回需要的字段
const tasks = await prisma.videoTask.findMany({
  where: { userId },
  select: {
    id: true,
    status: true,
    createdAt: true,
  },
});
```

### 2. 并行查询

```typescript
// ❌ 串行：总耗时 = t1 + t2 + t3
const total = await prisma.videoTask.count();
const completed = await prisma.videoTask.count({ where: { status: 'COMPLETED' } });
const failed = await prisma.videoTask.count({ where: { status: 'FAILED' } });

// ✅ 并行：总耗时 ≈ max(t1, t2, t3)
const [total, completed, failed] = await Promise.all([
  prisma.videoTask.count(),
  prisma.videoTask.count({ where: { status: 'COMPLETED' } }),
  prisma.videoTask.count({ where: { status: 'FAILED' } }),
]);
```

### 3. 使用数据库索引

确保在 `schema.prisma` 中为常用查询字段添加索引：

```prisma
model VideoTask {
  // ... 其他字段

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([userId, status])
  @@index([userId, createdAt])
}
```

### 4. 分页查询大数据集

```typescript
// ❌ 不好：一次性加载所有数据
const allTasks = await prisma.videoTask.findMany({ where: { userId } });

// ✅ 好：分页加载
async function getTasksPage(userId: string, page: number, pageSize: number) {
  const [tasks, total] = await Promise.all([
    prisma.videoTask.findMany({
      where: { userId },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.videoTask.count({ where: { userId } }),
  ]);

  return {
    tasks,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
```

### 5. 避免 N+1 查询问题

```typescript
// ❌ N+1 问题：先查所有任务，再为每个任务查用户
const tasks = await prisma.videoTask.findMany();
for (const task of tasks) {
  task.user = await prisma.user.findUnique({ where: { id: task.userId } });
}

// ✅ 使用 include 一次性加载关联数据
const tasks = await prisma.videoTask.findMany({
  include: {
    user: {
      select: {
        id: true,
        username: true,
        email: true,
      },
    },
  },
});
```

## 📈 高级技巧

### 1. 原生 SQL（用于复杂统计）

当 Prisma API 无法满足需求时，可以使用原生 SQL：

```typescript
const result = await prisma.$queryRaw<Array<{
  date: Date;
  count: bigint;
}>>`
  SELECT 
    DATE(created_at) as date,
    COUNT(*) as count
  FROM "video_tasks"
  WHERE user_id = ${userId}
  GROUP BY DATE(created_at)
  ORDER BY date DESC
  LIMIT 30
`;
```

### 2. 事务中的统计

```typescript
const stats = await prisma.$transaction(async (tx) => {
  const total = await tx.videoTask.count({ where: { userId } });
  const completed = await tx.videoTask.count({
    where: { userId, status: 'COMPLETED' },
  });

  return { total, completed };
});
```

### 3. 实时统计缓存

对于频繁访问的统计数据，可以考虑缓存：

```typescript
import Redis from 'ioredis';
const redis = new Redis();

async function getCachedStats(userId: string) {
  const cacheKey = `user:${userId}:stats`;
  
  // 尝试从缓存获取
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 缓存未命中，查询数据库
  const stats = await getEnhancedTaskStats(userId);
  
  // 缓存 5 分钟
  await redis.setex(cacheKey, 300, JSON.stringify(stats));
  
  return stats;
}
```

## 📝 总结

Prisma 提供了完整的统计查询工具集：

| 方法 | 适用场景 | 性能 |
|------|---------|------|
| `count()` | 简单计数 | ⚡⚡⚡ 最快 |
| `aggregate()` | 总和、平均值等 | ⚡⚡ 很快 |
| `groupBy()` | 分组统计、Top N | ⚡⚡ 很快 |
| `findMany()` + 手动计算 | 复杂逻辑 | ⚡ 较慢 |
| `$queryRaw` | 极其复杂的统计 | ⚡⚡ 取决于 SQL |

**最佳实践**：
1. 优先使用 Prisma 提供的 API
2. 充分利用并行查询
3. 为常用查询添加数据库索引
4. 对频繁访问的统计数据考虑缓存
5. 复杂统计可以使用原生 SQL

遵循这些原则，你的统计功能将具备良好的性能和可维护性，为未来的 SaaS 扩展打下坚实基础！

