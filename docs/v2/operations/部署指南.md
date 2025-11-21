# 🚀 视频任务 API 部署指南

本文档说明如何将新增的视频任务功能部署到生产环境（腾讯云）。

## 部署前检查清单

- [ ] 确保已备份数据库
- [ ] 测试环境验证通过
- [ ] 更新环境变量配置
- [ ] 准备数据库迁移脚本
- [ ] Docker 镜像已构建

## 部署步骤

### 1. 更新代码

```bash
# SSH 登录到服务器
ssh root@your-server-ip

# 进入项目目录
cd /path/to/sora-ui-backend

# 拉取最新代码
git pull origin main

# 或者使用部署脚本
./deploy-production.sh
```

### 2. 更新依赖

```bash
# 安装新的依赖
npm install

# 或者在容器中
docker-compose exec app npm install
```

### 3. 运行数据库迁移

#### 方法 1：使用 Prisma 迁移

```bash
# 生成 Prisma 客户端
npx prisma generate

# 运行迁移
npx prisma migrate deploy

# 或者在 Docker 容器中
docker-compose exec app npx prisma migrate deploy
```

#### 方法 2：手动 SQL 迁移

```bash
# 连接到 PostgreSQL
docker-compose exec db psql -U postgres -d sora_db

# 或者直接运行 SQL 文件
docker-compose exec db psql -U postgres -d sora_db -f /path/to/add-video-tasks-migration.sql
```

### 4. 更新环境变量

编辑 `.env` 文件，添加视频任务相关配置：

```env
# API易配置
APIYI_API_KEY=sk-fkmcuF2M7pwW1X9oE8E9Ba553e694f5388A85519A4D2Bc67

# 轮询配置
VIDEO_POLL_INTERVAL=30000
VIDEO_MAX_POLL_ATTEMPTS=20

# 任务清理配置（可选）
VIDEO_TASK_RETENTION_DAYS=30
```

### 5. 更新 Docker 镜像

```bash
# 构建新镜像
docker-compose build app

# 或者使用生产配置
docker build -f Dockerfile.production -t sora-backend:latest .

# 标记镜像
docker tag sora-backend:latest your-registry/sora-backend:v1.1.0
```

### 6. 重启服务

```bash
# 使用 docker-compose
docker-compose down
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 检查服务状态
docker-compose ps
```

### 7. 验证部署

```bash
# 健康检查
curl http://your-domain/health

# 测试视频任务 API（需要有效的 JWT token）
curl -X GET http://your-domain/api/video/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 数据库备份与恢复

### 备份数据库

```bash
# 创建备份
docker-compose exec db pg_dump -U postgres sora_db > backup_$(date +%Y%m%d_%H%M%S).sql

# 或者使用 Docker 卷
docker run --rm -v sora-db-data:/data -v $(pwd):/backup \
  busybox tar czf /backup/db_backup_$(date +%Y%m%d).tar.gz /data
```

### 恢复数据库

```bash
# 从 SQL 文件恢复
docker-compose exec -T db psql -U postgres sora_db < backup.sql

# 从 Docker 卷恢复
docker run --rm -v sora-db-data:/data -v $(pwd):/backup \
  busybox tar xzf /backup/db_backup.tar.gz -C /
```

## 监控和日志

### 1. 查看应用日志

```bash
# 实时日志
docker-compose logs -f app

# 最近 100 行
docker-compose logs --tail=100 app

# 导出日志
docker-compose logs app > app_logs_$(date +%Y%m%d).log
```

### 2. 监控任务状态

```sql
-- 连接到数据库
docker-compose exec db psql -U postgres -d sora_db

-- 查看任务统计
SELECT 
  status,
  COUNT(*) as count,
  DATE(created_at) as date
FROM video_tasks
GROUP BY status, DATE(created_at)
ORDER BY date DESC;

-- 查看失败任务
SELECT 
  video_id,
  prompt,
  error_message,
  created_at
FROM video_tasks
WHERE status = 'FAILED'
ORDER BY created_at DESC
LIMIT 10;

-- 查看长时间运行的任务
SELECT 
  video_id,
  prompt,
  status,
  created_at,
  NOW() - created_at as duration
FROM video_tasks
WHERE status IN ('QUEUED', 'PROCESSING')
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at;
```

### 3. 性能监控

```bash
# 查看容器资源使用
docker stats

# 查看数据库连接数
docker-compose exec db psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# 查看数据库大小
docker-compose exec db psql -U postgres -c "SELECT pg_database_size('sora_db');"
```

## 故障处理

### 1. 任务卡住

如果发现任务长时间处于 PROCESSING 状态：

```sql
-- 重置超时的任务
UPDATE video_tasks 
SET status = 'FAILED',
    error_message = '任务超时'
WHERE status = 'PROCESSING' 
  AND updated_at < NOW() - INTERVAL '1 hour';
```

### 2. 数据库连接池耗尽

```bash
# 重启应用释放连接
docker-compose restart app

# 或者增加连接池大小
# 在 .env 中设置
DATABASE_URL="postgresql://user:pass@host/db?connection_limit=20"
```

### 3. 磁盘空间不足

```bash
# 清理 Docker 资源
docker system prune -a

# 清理老旧日志
find /var/log -name "*.log" -mtime +7 -delete

# 清理过期的视频任务记录
docker-compose exec app node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.videoTask.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] }
    }
  }).then(console.log);
"
```

## 回滚方案

如果部署出现问题，可以快速回滚：

### 1. 代码回滚

```bash
# 回到上一个版本
git checkout HEAD~1

# 或者回到特定标签
git checkout v1.0.0

# 重新构建和部署
docker-compose build app
docker-compose up -d app
```

### 2. 数据库回滚

```bash
# 使用 Prisma 回滚
npx prisma migrate resolve --rolled-back

# 或者恢复备份
docker-compose exec -T db psql -U postgres sora_db < backup.sql
```

## 生产环境优化

### 1. 启用 Redis 缓存（可选）

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
```

### 2. 配置 Nginx 反向代理

```nginx
# nginx.conf
upstream backend {
    server app:3001;
}

server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. 设置定时任务

创建定时清理脚本 `cron-jobs.sh`：

```bash
#!/bin/bash
# 清理过期任务
docker-compose exec app node scripts/cleanup-tasks.js

# 备份数据库
docker-compose exec db pg_dump -U postgres sora_db > /backup/sora_db_$(date +%Y%m%d).sql

# 清理老备份（保留 7 天）
find /backup -name "*.sql" -mtime +7 -delete
```

添加到 crontab：

```bash
# 每天凌晨 2 点执行
0 2 * * * /path/to/cron-jobs.sh >> /var/log/sora-cron.log 2>&1
```

## 安全建议

1. **API Key 加密**: 考虑使用 KMS 服务加密敏感配置
2. **访问限制**: 使用 IP 白名单限制 API 访问
3. **速率限制**: 配置 API 请求频率限制
4. **审计日志**: 记录所有视频生成请求
5. **备份加密**: 加密数据库备份文件

## 部署后检查

- [ ] 所有 API 端点正常响应
- [ ] 数据库连接正常
- [ ] 视频任务可以正常创建
- [ ] 任务状态可以正常更新
- [ ] 历史记录可以正常查询
- [ ] 日志记录正常
- [ ] 监控告警正常

## 联系支持

如果遇到问题：

1. 查看应用日志
2. 检查数据库状态
3. 参考错误处理文档
4. 联系技术支持团队
