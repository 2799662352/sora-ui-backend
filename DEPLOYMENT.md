# 🚀 Sora UI Backend 部署指南

完整的生产环境部署文档。

---

## 📋 目录

1. [部署前准备](#部署前准备)
2. [方式一：PM2 部署](#方式一pm2-部署)
3. [方式二：Docker 部署](#方式二docker-部署)
4. [方式三：手动部署](#方式三手动部署)
5. [Nginx 配置](#nginx-配置)
6. [更新服务器配置](#更新服务器配置)
7. [监控和维护](#监控和维护)
8. [故障排查](#故障排查)

---

## 部署前准备

### 1. 服务器要求

- **操作系统**: Ubuntu 20.04+ / CentOS 7+ / Debian 10+
- **内存**: 至少 1GB RAM
- **CPU**: 至少 1 核心
- **磁盘**: 至少 10GB 可用空间
- **Node.js**: v18.x 或更高
- **npm**: v9.x 或更高

### 2. 域名和 SSL 证书

```bash
# 申请免费 SSL 证书（Let's Encrypt）
sudo apt install certbot
sudo certbot certonly --standalone -d api.soraui.com
```

### 3. 环境变量配置

复制 `.env.example` 为 `.env` 并修改：

```env
# ⚠️ 生产环境必须修改这些值！
NODE_ENV=production
PORT=3001
JWT_SECRET=请使用强密码替换（至少32字符）
LICENSE_SECRET=请使用强密码替换（至少32字符）
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://soraui.com
```

**生成强密钥：**

```bash
# 生成随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 方式一：PM2 部署

### 1. 安装 PM2

```bash
npm install -g pm2
```

### 2. 使用自动化脚本

```bash
# 给脚本执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh
```

### 3. 手动部署步骤

```bash
# 1. 安装依赖
npm ci --production

# 2. 构建
npm run build

# 3. 启动服务
pm2 start dist/app.js \
  --name sora-ui-backend \
  --time \
  --instances 1 \
  --max-memory-restart 500M

# 4. 保存配置
pm2 save

# 5. 设置开机自启
pm2 startup
# 执行输出的命令
```

### 4. PM2 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs sora-ui-backend

# 重启服务
pm2 restart sora-ui-backend

# 停止服务
pm2 stop sora-ui-backend

# 删除服务
pm2 delete sora-ui-backend

# 监控
pm2 monit
```

---

## 方式二：Docker 部署

### 1. 安装 Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 安装 docker-compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 使用自动化脚本

```bash
# 给脚本执行权限
chmod +x deploy-docker.sh

# 执行部署
./deploy-docker.sh
```

### 3. 手动部署步骤

```bash
# 1. 构建镜像
docker-compose build

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 健康检查
curl http://localhost:3001/health
```

### 4. Docker 常用命令

```bash
# 查看容器状态
docker-compose ps

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 查看日志
docker-compose logs -f backend

# 进入容器
docker-compose exec backend sh
```

---

## 方式三：手动部署

### 1. 上传代码

```bash
# 使用 Git
git clone https://github.com/your-repo/sora-ui-backend.git
cd sora-ui-backend

# 或使用 SCP
scp -r sora-ui-backend user@server:/path/to/app
```

### 2. 安装和构建

```bash
npm ci --production
npm run build
```

### 3. 使用 systemd 管理

创建服务文件：

```bash
sudo nano /etc/systemd/system/sora-ui-backend.service
```

内容：

```ini
[Unit]
Description=Sora UI Backend API
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/sora-ui-backend
Environment="NODE_ENV=production"
Environment="PORT=3001"
EnvironmentFile=/path/to/sora-ui-backend/.env
ExecStart=/usr/bin/node dist/app.js
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable sora-ui-backend
sudo systemctl start sora-ui-backend
sudo systemctl status sora-ui-backend
```

---

## Nginx 配置

### 1. 安装 Nginx

```bash
sudo apt update
sudo apt install nginx
```

### 2. 配置反向代理

创建配置文件：

```bash
sudo nano /etc/nginx/sites-available/sora-ui-backend
```

内容：

```nginx
server {
    listen 80;
    server_name api.soraui.com;

    # HTTP 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.soraui.com;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/api.soraui.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.soraui.com/privkey.pem;

    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # API 代理
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 健康检查
    location /health {
        proxy_pass http://localhost:3001/health;
    }

    # 更新文件服务
    location /updates/ {
        alias /path/to/updates/;
        autoindex off;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/sora-ui-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 更新服务器配置

### 1. 目录结构

```
/var/www/updates/
├── 1.0.70/
│   ├── Sora UI Setup 1.0.70.exe
│   ├── Sora UI-1.0.70-mac.dmg
│   └── Sora UI-1.0.70.AppImage
├── latest.yml
├── latest-mac.yml
└── latest-linux.yml
```

### 2. latest.yml 格式

**Windows (latest.yml):**

```yaml
version: 1.0.70
files:
  - url: Sora UI Setup 1.0.70.exe
    sha512: 文件SHA512哈希
    size: 文件大小（字节）
path: Sora UI Setup 1.0.70.exe
sha512: 文件SHA512哈希
releaseDate: '2025-11-06'
releaseNotes: |
  ✨ 新功能
  - 添加了企业级认证系统
  - 支持许可证管理
  
  🐛 问题修复
  - 修复了内存泄漏问题
mandatory: false
```

**macOS (latest-mac.yml):**

```yaml
version: 1.0.70
files:
  - url: Sora UI-1.0.70-mac.dmg
    sha512: 文件SHA512哈希
    size: 文件大小
path: Sora UI-1.0.70-mac.dmg
releaseDate: '2025-11-06'
```

### 3. 生成 SHA512

```bash
shasum -a 512 "Sora UI Setup 1.0.70.exe"
```

---

## 监控和维护

### 1. 日志管理

```bash
# PM2 日志
pm2 logs sora-ui-backend --lines 100

# Docker 日志
docker-compose logs -f --tail=100

# Nginx 日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 2. 性能监控

```bash
# PM2 监控
pm2 monit

# 系统资源
htop
```

### 3. 定期备份

```bash
# 备份脚本
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups/sora-ui-backend

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz \
  /path/to/sora-ui-backend \
  --exclude=node_modules \
  --exclude=dist

# 保留最近 7 天的备份
find $BACKUP_DIR -type f -mtime +7 -delete
```

### 4. 自动更新

```bash
# crontab -e
# 每天凌晨 2 点备份
0 2 * * * /path/to/backup.sh

# 每周日凌晨 3 点重启服务
0 3 * * 0 pm2 restart sora-ui-backend
```

---

## 故障排查

### 1. 服务无法启动

**检查日志：**

```bash
pm2 logs sora-ui-backend --err --lines 50
```

**常见原因：**

- 端口被占用：`lsof -i:3001`
- 环境变量未设置：检查 `.env` 文件
- 依赖未安装：`npm ci`

### 2. API 请求失败

**检查健康状态：**

```bash
curl http://localhost:3001/health
```

**检查 Nginx 配置：**

```bash
sudo nginx -t
sudo systemctl status nginx
```

### 3. 内存泄漏

**查看内存使用：**

```bash
pm2 status
free -h
```

**重启服务：**

```bash
pm2 restart sora-ui-backend
```

### 4. 数据库连接失败

目前使用内存数据库，生产环境建议：

- 使用 PostgreSQL 或 MySQL
- 配置连接池
- 定期备份数据

---

## 🎉 部署完成检查清单

- [ ] ✅ 环境变量已配置（JWT_SECRET, LICENSE_SECRET）
- [ ] ✅ 服务正常运行（`pm2 status` 或 `docker ps`）
- [ ] ✅ 健康检查通过（`/health` 返回 200）
- [ ] ✅ API 测试通过（登录、许可证激活）
- [ ] ✅ Nginx 反向代理配置正确
- [ ] ✅ SSL 证书安装（HTTPS）
- [ ] ✅ 防火墙规则配置
- [ ] ✅ 日志系统正常
- [ ] ✅ 备份策略实施
- [ ] ✅ 监控告警配置

---

## 📞 技术支持

如有问题，请参考：

- 📚 [完整文档](./README.md)
- 🐛 [Issue Tracker](https://github.com/your-repo/issues)
- 💬 [社区讨论](https://github.com/your-repo/discussions)

---

**祝部署顺利！** 🚀

