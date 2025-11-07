# 腾讯云 Docker 快速部署方案

基于您已有的 sora-ui-backend 项目和 SQL 数据库，以下是受欢迎的 Docker 腾讯云部署方案汇总。

## 📋 目录
- [一、推荐方案概览](#一推荐方案概览)
- [二、当前项目快速部署](#二当前项目快速部署)
- [三、参考项目方案](#三参考项目方案)
- [四、最佳实践](#四最佳实践)

## 一、推荐方案概览

### 🏆 方案一：Coolify (最受欢迎 - 46,951 stars)
**项目**: [coollabsio/coolify](https://github.com/coollabsio/coolify)

**特点**:
- 🚀 开源自托管 PaaS 平台
- ✅ 一键部署应用、数据库、服务
- 🎯 支持 280+ 一键服务
- 🐳 完整 Docker Compose 支持
- 🔧 易于管理和扩展

**适用场景**: 如果您需要一个完整的自托管平台来管理多个应用和服务。

---

### 🏅 方案二：蘑菇博客 Docker 方案 (1,759 stars)
**项目**: [moxi624/mogu_blog_v2](https://github.com/moxi624/mogu_blog_v2)

**特点**:
- ☁️ 专为中国云服务优化
- 📦 完整 Docker Compose 一键部署
- 🗄️ MySQL + Redis + ElasticSearch
- 🔄 支持微服务架构
- 📝 详细中文文档

**适用场景**: 中国本土化部署，特别适合腾讯云环境。

---

### 🛠️ 方案三：轻量级单体部署
**基于您当前的 docker-compose.yml**

**特点**:
- 🎯 简单快速
- 💡 适合中小型项目
- 🔧 易于维护
- ⚡ 启动迅速

---

## 二、当前项目快速部署

### 2.1 您的项目结构

根据您的 `docker-compose.yml`，当前有：
- ✅ Backend API (Node.js, 端口 3001)
- ✅ Nginx 反向代理 (端口 80/443)
- ✅ 健康检查配置
- ✅ SSL 支持

### 2.2 快速部署步骤（腾讯云）

#### 第一步：准备腾讯云服务器
```bash
# 1. 登录腾讯云控制台
# 2. 购买轻量应用服务器或 CVM
# 推荐配置：
#   - 2核4G内存起
#   - Ubuntu 20.04 LTS
#   - 至少 40GB 系统盘
```

#### 第二步：安装 Docker 和 Docker Compose
```bash
# SSH 连接到服务器后执行：

# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo systemctl start docker
sudo systemctl enable docker

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

#### 第三步：上传项目文件
```bash
# 在本地执行（上传到服务器）：
scp -r D:\tecx\text\25\soraui_4.0\sora-ui-backend ubuntu@<your-server-ip>:/home/ubuntu/

# 或者使用 Git
ssh ubuntu@<your-server-ip>
cd /home/ubuntu
git clone <your-repo-url> sora-ui-backend
cd sora-ui-backend
```

#### 第四步：配置环境变量
```bash
# 创建 .env 文件
cat > .env << EOF
# JWT 配置
JWT_SECRET=your-secure-random-string-here
LICENSE_SECRET=your-license-secret-here

# 数据库配置（如果使用外部数据库）
DB_HOST=your-database-host
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=sora_ui

# 其他配置
NODE_ENV=production
PORT=3001
EOF
```

#### 第五步：启动服务
```bash
# 构建并启动容器
sudo docker-compose up -d

# 查看日志
sudo docker-compose logs -f

# 查看运行状态
sudo docker-compose ps
```

#### 第六步：配置防火墙和安全组
```bash
# 在腾讯云控制台配置安全组规则，开放以下端口：
# - 80 (HTTP)
# - 443 (HTTPS)
# - 3001 (如果需要直接访问 API)

# Linux 防火墙配置（如果使用 ufw）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 三、参考项目方案

### 3.1 蘑菇博客 Docker 部署详解

**项目地址**: https://github.com/moxi624/mogu_blog_v2/tree/Nacos/doc/docker-compose

#### 核心特性：
1. **完整的微服务架构**
   - MySQL 8.0
   - Redis
   - Nacos（服务注册）
   - RabbitMQ
   - ElasticSearch

2. **一键部署脚本**
```bash
# 克隆项目
git clone https://github.com/moxi624/mogu_blog_v2.git
cd mogu_blog_v2/doc/docker-compose

# 启动中间件
sh bin/middleware.sh

# 初始化数据
sh bin/moguInit.sh

# 启动核心服务
sh bin/kernStartup.sh

# 启动完整服务
sh bin/completeStartup.sh
```

3. **Docker Compose 配置示例**
```yaml
version: '3'
services:
  mysql:
    image: mysql:8.0
    container_name: mogu_mysql
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: mogu2018
      MYSQL_DATABASE: mogu_blog
    volumes:
      - ./data/mysql:/var/lib/mysql
      - ./config/mysql:/etc/mysql/conf.d
    networks:
      - mogu_network

  redis:
    image: redis:6.2
    container_name: mogu_redis
    ports:
      - "6379:6379"
    volumes:
      - ./data/redis:/data
    networks:
      - mogu_network

  nginx:
    image: nginx:alpine
    container_name: mogu_nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx:/etc/nginx/conf.d
      - ./ssl:/etc/nginx/ssl
    networks:
      - mogu_network

networks:
  mogu_network:
    driver: bridge
```

### 3.2 Coolify 企业级方案

**特点**:
- 🎯 Web UI 管理界面
- 🔄 自动更新和回滚
- 📊 监控和日志
- 🔐 SSL 证书自动管理
- 💾 数据库备份

**适合场景**: 需要管理多个项目和团队协作

---

## 四、最佳实践

### 4.1 针对您的项目优化建议

#### 添加 MySQL 服务到 docker-compose.yml

```yaml
version: '3.8'

services:
  # ============ MySQL 数据库 ============
  mysql:
    image: mysql:8.0
    container_name: sora-ui-mysql
    restart: unless-stopped
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-changeme}
      - MYSQL_DATABASE=sora_ui
      - MYSQL_USER=${MYSQL_USER:-sorauser}
      - MYSQL_PASSWORD=${MYSQL_PASSWORD:-sorapass}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./mysql/init:/docker-entrypoint-initdb.d
    networks:
      - sora-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============ Redis 缓存（可选）============
  redis:
    image: redis:7-alpine
    container_name: sora-ui-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - sora-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============ Sora UI Backend API ============
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: sora-ui-backend
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_USER=${MYSQL_USER:-sorauser}
      - DB_PASSWORD=${MYSQL_PASSWORD:-sorapass}
      - DB_NAME=sora_ui
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
      - LICENSE_SECRET=${LICENSE_SECRET:-change-me-in-production}
    volumes:
      - ./updates:/app/updates:ro
      - ./logs:/app/logs
    networks:
      - sora-network
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # ============ Nginx 反向代理 ============
  nginx:
    image: nginx:alpine
    container_name: sora-ui-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./updates:/var/www/updates:ro
    depends_on:
      - backend
    networks:
      - sora-network

volumes:
  mysql_data:
  redis_data:

networks:
  sora-network:
    driver: bridge
```

### 4.2 腾讯云优化配置

#### 使用腾讯云 MySQL 云数据库（推荐）
```yaml
# 不使用容器化 MySQL，而是使用腾讯云 MySQL
# 修改 backend 环境变量：
environment:
  - DB_HOST=<your-tencent-mysql-host>.tencentcdb.com
  - DB_PORT=3306
  - DB_USER=<your-username>
  - DB_PASSWORD=<your-password>
  - DB_NAME=sora_ui
```

**优势**:
- ✅ 自动备份
- ✅ 高可用性
- ✅ 性能监控
- ✅ 自动扩容

#### 使用腾讯云 Redis（推荐）
```yaml
environment:
  - REDIS_HOST=<your-tencent-redis-host>.redis.tencentcloudapi.com
  - REDIS_PORT=6379
  - REDIS_PASSWORD=<your-redis-password>
```

### 4.3 监控和日志

#### 添加日志收集（可选）
```yaml
services:
  # ... 其他服务 ...

  # ============ 日志收集 Loki（可选）============
  loki:
    image: grafana/loki:latest
    container_name: sora-loki
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yaml:/etc/loki/local-config.yaml
      - loki_data:/loki
    networks:
      - sora-network

  # ============ 监控面板 Grafana（可选）============
  grafana:
    image: grafana/grafana:latest
    container_name: sora-grafana
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - sora-network
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

volumes:
  loki_data:
  grafana_data:
```

### 4.4 备份策略

```bash
# 创建备份脚本 backup.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/backups"

# 备份 MySQL 数据
docker exec sora-ui-mysql mysqldump -u root -p$MYSQL_ROOT_PASSWORD sora_ui > $BACKUP_DIR/mysql_$DATE.sql

# 备份应用数据
tar -czf $BACKUP_DIR/app_data_$DATE.tar.gz /home/ubuntu/sora-ui-backend/updates /home/ubuntu/sora-ui-backend/logs

# 删除 7 天前的备份
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# 设置定时任务
crontab -e
# 每天凌晨 2 点执行备份
0 2 * * * /home/ubuntu/sora-ui-backend/backup.sh
```

### 4.5 性能优化

#### Nginx 缓存配置
```nginx
http {
    # 缓存配置
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g inactive=60m use_temp_path=off;

    server {
        listen 80;
        server_name your-domain.com;

        # API 代理
        location /api/ {
            proxy_cache my_cache;
            proxy_cache_valid 200 5m;
            proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
            proxy_pass http://backend:3001;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 静态文件缓存
        location /updates/ {
            alias /var/www/updates/;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

---

## 五、常用命令速查

### Docker 管理命令
```bash
# 启动服务
sudo docker-compose up -d

# 停止服务
sudo docker-compose down

# 重启服务
sudo docker-compose restart

# 查看日志
sudo docker-compose logs -f backend

# 查看运行状态
sudo docker-compose ps

# 进入容器
sudo docker exec -it sora-ui-backend sh

# 清理无用镜像
sudo docker system prune -a
```

### 数据库管理
```bash
# 连接 MySQL
sudo docker exec -it sora-ui-mysql mysql -u root -p

# 导入 SQL
sudo docker exec -i sora-ui-mysql mysql -u root -p sora_ui < backup.sql

# 导出 SQL
sudo docker exec sora-ui-mysql mysqldump -u root -p sora_ui > backup.sql
```

### Nginx 配置
```bash
# 测试配置
sudo docker exec sora-ui-nginx nginx -t

# 重载配置
sudo docker exec sora-ui-nginx nginx -s reload
```

---

## 六、故障排查

### 常见问题

#### 1. 容器无法启动
```bash
# 查看详细日志
sudo docker-compose logs backend

# 检查端口占用
sudo netstat -tulpn | grep 3001
```

#### 2. 数据库连接失败
```bash
# 检查 MySQL 容器状态
sudo docker ps | grep mysql

# 测试数据库连接
sudo docker exec -it sora-ui-mysql mysql -u root -p -e "SELECT 1"

# 检查网络
sudo docker network inspect sora-network
```

#### 3. Nginx 502 错误
```bash
# 检查 backend 服务状态
sudo docker-compose ps backend

# 检查健康检查
sudo docker inspect sora-ui-backend | grep -A 5 Health
```

---

## 七、参考资源

### GitHub 项目
- [Coolify](https://github.com/coollabsio/coolify) - 自托管 PaaS 平台
- [蘑菇博客](https://github.com/moxi624/mogu_blog_v2) - 完整微服务部署方案
- [Docker Hub](https://hub.docker.com/search?q=&type=image) - Docker 镜像仓库

### 官方文档
- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Nginx 官方文档](https://nginx.org/en/docs/)
- [腾讯云文档](https://cloud.tencent.com/document/product)

### 腾讯云产品
- [轻量应用服务器](https://cloud.tencent.com/product/lighthouse)
- [云数据库 MySQL](https://cloud.tencent.com/product/cdb)
- [云数据库 Redis](https://cloud.tencent.com/product/redis)
- [对象存储 COS](https://cloud.tencent.com/product/cos)
- [内容分发网络 CDN](https://cloud.tencent.com/product/cdn)

---

## 八、下一步行动

### 🚀 快速开始（推荐流程）

1. **评估需求**
   - 单应用 → 使用当前优化方案
   - 多应用/团队 → 考虑 Coolify
   - 微服务架构 → 参考蘑菇博客方案

2. **准备服务器**
   - 购买腾讯云服务器
   - 安装 Docker 和 Docker Compose

3. **部署测试**
   - 上传项目文件
   - 配置环境变量
   - 启动服务

4. **生产优化**
   - 使用云数据库
   - 配置 CDN
   - 设置监控和备份

---

## 📝 总结

本方案整合了：
- ✅ 您当前项目的 Docker 配置
- ✅ GitHub 上最受欢迎的部署方案
- ✅ 腾讯云环境优化建议
- ✅ 生产级最佳实践

根据您的需求选择合适的方案即可快速部署！

---

**文档版本**: v1.0  
**最后更新**: 2025-11-06  
**维护者**: AI Assistant  



Backend 运行正常！✅ 问题在于 **Cloudflare 无法连接到源服务器**。

## 🔍 问题分析

**Cloudflare Error 521** 的原因：
- Cloudflare 正在工作 ✅
- 但是无法连接到你的服务器 ❌

**原因：** Cloudflare 默认尝试连接 **80/443 端口**，但你的服务运行在 **3000 端口**！

---

## ✅ 解决方案

### 方式 A: 直接访问 IP（快速验证）

**打开浏览器访问：**
```
http://175.27.250.155:3000
```

这应该能直接看到登录页面！

---

### 方式 B: 配置 Nginx 反向代理（推荐）

**让域名可以访问，在服务器上执行：**

```bash
# 1. 安装 Nginx
apt update
apt install nginx -y

# 2. 配置反向代理
cat > /etc/nginx/sites-available/sora << 'EOF'
# Backend API
server {
    listen 80;
    server_name api.zuozuoliang999.xyz;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Admin 前端
server {
    listen 80;
    server_name admin.zuozuoliang999.xyz;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 3. 启用配置
ln -s /etc/nginx/sites-available/sora /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default 2>/dev/null || true

# 4. 测试配置
nginx -t

# 5. 重启 Nginx
systemctl restart nginx
systemctl enable nginx

# 6. 查看状态
systemctl status nginx
```

---

## 🎯 快速验证

### 现在立即测试

**1. 先访问 IP（不需要配置）：**
```
http://175.27.250.155:3000
```

**应该能看到登录页面！**

**2. 如果能访问，说明服务正常，只是需要 Nginx**

**3. 配置 Nginx 后，域名就能访问了：**
```
https://admin.zuozuoliang999.xyz
https://api.zuozuoliang999.xyz
```

---

## 📝 Cloudflare 配置提示

**在 Cloudflare SSL/TLS 设置中：**
- 设置为 **"Flexible"** 或 **"Full"**
- 不要用 "Full (strict)"（因为服务器还没配置 SSL 证书）

---

**🚀 先试试直接访问 http://175.27.250.155:3000 看看能否登录！**

Backend 运行正常！✅ 问题在于 **Cloudflare 无法连接到源服务器**。

## 🔍 问题分析

**Cloudflare Error 521** 的原因：
- Cloudflare 正在工作 ✅
- 但是无法连接到你的服务器 ❌

**原因：** Cloudflare 默认尝试连接 **80/443 端口**，但你的服务运行在 **3000 端口**！

---

## ✅ 解决方案

### 方式 A: 直接访问 IP（快速验证）

**打开浏览器访问：**
```
http://175.27.250.155:3000
```

这应该能直接看到登录页面！

---

### 方式 B: 配置 Nginx 反向代理（推荐）

**让域名可以访问，在服务器上执行：**

```bash
# 1. 安装 Nginx
apt update
apt install nginx -y

# 2. 配置反向代理
cat > /etc/nginx/sites-available/sora << 'EOF'
# Backend API
server {
    listen 80;
    server_name api.zuozuoliang999.xyz;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Admin 前端
server {
    listen 80;
    server_name admin.zuozuoliang999.xyz;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 3. 启用配置
ln -s /etc/nginx/sites-available/sora /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default 2>/dev/null || true

# 4. 测试配置
nginx -t

# 5. 重启 Nginx
systemctl restart nginx
systemctl enable nginx

# 6. 查看状态
systemctl status nginx
```

---

## 🎯 快速验证

### 现在立即测试

**1. 先访问 IP（不需要配置）：**
```
http://175.27.250.155:3000
```

**应该能看到登录页面！**

**2. 如果能访问，说明服务正常，只是需要 Nginx**

**3. 配置 Nginx 后，域名就能访问了：**
```
https://admin.zuozuoliang999.xyz
https://api.zuozuoliang999.xyz
```

---

## 📝 Cloudflare 配置提示

**在 Cloudflare SSL/TLS 设置中：**
- 设置为 **"Flexible"** 或 **"Full"**
- 不要用 "Full (strict)"（因为服务器还没配置 SSL 证书）

---

**🚀 先试试直接访问 http://175.27.250.155:3000 看看能否登录！**












































