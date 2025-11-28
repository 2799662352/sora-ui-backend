# 🚀 腾讯云部署指南 v1.3.1

## 📋 版本特性

**v1.3.1-back** 包含：
- ✅ 图片 URL 方式（支持任意尺寸）
- ✅ 图片去重（MD5 + Redis 1小时缓存）
- ✅ 自动清理（30分钟清理旧图片+缓存）
- ✅ 所有原有功能（34个API端点）

---

## 🎯 部署步骤

### 1️⃣ SSH 连接腾讯云

```bash
ssh ubuntu@175.27.250.155
```

### 2️⃣ 创建部署目录

```bash
sudo mkdir -p /opt/sora-ui-backend
cd /opt/sora-ui-backend

# 创建必要目录
mkdir -p uploads logs nginx
```

### 3️⃣ 创建 docker-compose.yml

```bash
cat > docker-compose.yml << 'EOF'
services:
  redis:
    image: redis:7-alpine
    container_name: sora-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"
    networks:
      - sora-network

  postgres:
    image: postgres:15-alpine
    container_name: sora-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=sorauser
      - POSTGRES_PASSWORD=sora_password_2024
      - POSTGRES_DB=soraui
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5433:5432"
    networks:
      - sora-network

  backend:
    image: zuozuoliang999/sora-ui-backend:1.3.1-back
    container_name: sora-ui-backend
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL=postgresql://sorauser:sora_password_2024@postgres:5432/soraui?schema=public&connection_limit=20
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - ENABLE_REDIS_CACHE=true
      - JWT_SECRET=change-me-in-production-$(openssl rand -hex 32)
      - PUBLIC_BASE_URL=http://175.27.250.155
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    networks:
      - sora-network
    depends_on:
      - redis
      - postgres

  nginx:
    image: nginx:alpine
    container_name: sora-ui-nginx
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./uploads:/var/www/uploads:ro
    depends_on:
      - backend
    networks:
      - sora-network

networks:
  sora-network:
    driver: bridge

volumes:
  redis-data:
  postgres-data:
EOF
```

### 4️⃣ 创建 nginx.conf

```bash
cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name _;

        # API 代理
        location /api/ {
            proxy_pass http://backend:3001;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # 🔥 图片静态服务
        location /uploads/ {
            alias /var/www/uploads/;
            autoindex off;
            add_header Cache-Control "public, max-age=3600";
            add_header Access-Control-Allow-Origin "*";
        }

        # 健康检查
        location /health {
            proxy_pass http://backend:3001/health;
            access_log off;
        }
    }
}
EOF
```

### 5️⃣ 启动服务

```bash
# 拉取镜像
docker-compose pull

# 启动服务
docker-compose up -d

# 等待启动
sleep 15

# 检查状态
docker-compose ps
```

### 6️⃣ 验证部署

```bash
# 健康检查
curl http://localhost:3001/health

# 测试图片访问
# (上传图片后自动生成 URL)

# 查看日志
docker logs sora-ui-backend --tail 50
```

---

## 🔍 故障排查

### 端口冲突

```bash
# 检查 80 端口占用
sudo lsof -i :80

# 如果被占用，修改 nginx 端口
# docker-compose.yml 中改为 "8080:80"
```

### 数据库连接失败

```bash
# 检查数据库日志
docker logs sora-postgres

# 重启数据库
docker-compose restart postgres
```

---

## 📊 监控命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker logs -f sora-ui-backend

# 查看 Redis
docker exec sora-redis redis-cli INFO

# 查看 PostgreSQL
docker exec sora-postgres psql -U sorauser -d soraui -c "SELECT COUNT(*) FROM \"VideoTask\";"

# 查看图片清理统计
docker logs sora-ui-backend | grep ImageCleaner
```

---

## 🔐 安全建议

1. 修改数据库密码
2. 设置强 JWT_SECRET
3. 配置防火墙规则
4. 启用 HTTPS（Let's Encrypt）

---

## 📌 注意事项

- **首次启动**: 数据库为空，需要创建管理员账号（admin/admin123）
- **图片清理**: 每30分钟自动清理 >30分钟的图片
- **Redis 缓存**: 图片 URL 缓存1小时
- **数据持久化**: PostgreSQL 和 Redis 数据保存在 Docker Volumes

---

## 🆘 获取帮助

遇到问题查看：
- 后端日志: `docker logs sora-ui-backend`
- nginx 日志: `docker logs sora-ui-nginx`
- 数据库日志: `docker logs sora-postgres`
























