#!/bin/bash
###########################################
# 腾讯云 Docker 快速部署脚本
# 一键完成：上传代码 → 构建 → 启动 → 配置SSL
###########################################

set -e  # 遇到错误立即退出

clear
echo "╔════════════════════════════════════════════════════════╗"
echo "║     🚀 腾讯云 Docker 快速部署脚本                     ║"
echo "║     Sora UI Backend 一键部署                           ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# ============ 配置区域 ============
SERVER_IP="175.27.250.155"
SERVER_USER="ubuntu"
DEPLOY_DIR="/opt/sora-ui-deploy"
DOMAIN_API="api.zuo2799662352.xyz"
DOMAIN_UPDATE="update.zuo2799662352.xyz"
EMAIL="zuozuoliang999@gmail.com"

# ============ 步骤1: 检查环境 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 步骤1/6: 检查本地环境"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查必要文件
if [ ! -f "package.json" ]; then
    echo "❌ 错误：未找到 package.json，请在项目根目录执行此脚本"
    exit 1
fi

if [ ! -f "Dockerfile" ]; then
    echo "❌ 错误：未找到 Dockerfile"
    exit 1
fi

echo "✅ 本地环境检查通过"
echo ""

# ============ 步骤2: 连接服务器 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 步骤2/6: 测试服务器连接"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ssh -o ConnectTimeout=5 ${SERVER_USER}@${SERVER_IP} "echo '连接成功'" > /dev/null 2>&1; then
    echo "✅ 服务器连接正常"
else
    echo "❌ 错误：无法连接到服务器 ${SERVER_IP}"
    echo "💡 请检查："
    echo "   1. 服务器IP是否正确"
    echo "   2. SSH密钥是否配置"
    echo "   3. 安全组是否开放22端口"
    exit 1
fi
echo ""

# ============ 步骤3: 准备部署目录 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 步骤3/6: 准备服务器部署目录"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh ${SERVER_USER}@${SERVER_IP} bash << 'REMOTE_PREPARE'
# 创建部署目录
sudo mkdir -p /opt/sora-ui-deploy/{backend,nginx/conf.d,certbot/{conf,www},logs,updates,postgres-data}
sudo chown -R ubuntu:ubuntu /opt/sora-ui-deploy
cd /opt/sora-ui-deploy

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo "⏳ 正在安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker ubuntu
fi

# 检查Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "⏳ 正在安装 Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

echo "✅ 服务器环境准备完成"
REMOTE_PREPARE

echo "✅ 服务器部署目录已准备"
echo ""

# ============ 步骤4: 上传项目文件 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 步骤4/6: 上传项目文件到服务器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 排除不需要上传的文件
echo "⏳ 正在上传项目文件（排除 node_modules）..."

rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude 'build' \
    --exclude '.env.local' \
    --exclude 'logs' \
    ./ ${SERVER_USER}@${SERVER_IP}:${DEPLOY_DIR}/backend/

echo "✅ 项目文件上传完成"
echo ""

# ============ 步骤5: 配置Docker Compose ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 步骤5/6: 配置 Docker Compose"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh ${SERVER_USER}@${SERVER_IP} bash << REMOTE_DOCKER
cd ${DEPLOY_DIR}

# 创建完整版 docker-compose.yml
cat > docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'

services:
  # ============ PostgreSQL 数据库 ============
  postgres:
    image: postgres:15-alpine
    container_name: sora-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=sorauser
      - POSTGRES_PASSWORD=sora_secure_pass_2024
      - POSTGRES_DB=sora_ui
      - TZ=Asia/Shanghai
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    networks:
      - sora-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sorauser -d sora_ui"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ============ Backend API ============
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: sora-api
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USER=sorauser
      - DB_PASSWORD=sora_secure_pass_2024
      - DB_NAME=sora_ui
      - JWT_SECRET=your-super-secure-jwt-secret-key-2024
      - LICENSE_SECRET=your-super-secure-license-key-2024
    volumes:
      - ./updates:/app/updates
      - ./logs:/app/logs
    networks:
      - sora-network
    depends_on:
      postgres:
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
    container_name: sora-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
      - ./updates:/usr/share/nginx/html/updates:ro
    networks:
      - sora-network
    depends_on:
      - api

  # ============ Certbot SSL证书续期 ============
  certbot:
    image: certbot/certbot
    container_name: sora-certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait \$\${!}; done;'"
    networks:
      - sora-network

volumes:
  postgres-data:

networks:
  sora-network:
    driver: bridge
COMPOSE_EOF

echo "✅ Docker Compose 配置已创建"

# 创建基础 Nginx 配置（HTTP only，用于申请SSL）
cat > nginx/conf.d/default.conf << 'NGINX_EOF'
server {
    listen 80;
    server_name ${DOMAIN_API} ${DOMAIN_UPDATE};
    
    # ACME验证路径
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 200 'Server is ready for SSL setup';
        add_header Content-Type text/plain;
    }
}
NGINX_EOF

echo "✅ Nginx 配置已创建"
REMOTE_DOCKER

echo "✅ Docker Compose 配置完成"
echo ""

# ============ 步骤6: 启动服务 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 步骤6/6: 启动服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh ${SERVER_USER}@${SERVER_IP} bash << REMOTE_START
cd ${DEPLOY_DIR}

echo "⏳ 启动 PostgreSQL..."
docker-compose up -d postgres
sleep 10

echo "⏳ 构建并启动 Backend API..."
docker-compose up -d --build api
sleep 10

echo "⏳ 启动 Nginx..."
docker-compose up -d nginx
sleep 5

echo "✅ 所有服务已启动"
echo ""
echo "📋 服务状态："
docker-compose ps
REMOTE_START

echo ""
echo "✅ 服务启动完成"
echo ""

# ============ 步骤7: SSL证书配置（可选） ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 SSL证书配置（可选）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

read -p "是否立即配置SSL证书？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "⏳ 正在申请SSL证书..."
    
    ssh ${SERVER_USER}@${SERVER_IP} bash << SSL_SETUP
    cd ${DEPLOY_DIR}
    
    # 停止Nginx
    docker-compose stop nginx
    
    # 申请SSL证书
    docker run --rm \
      -v ${DEPLOY_DIR}/certbot/conf:/etc/letsencrypt \
      -v ${DEPLOY_DIR}/certbot/www:/var/www/certbot \
      -p 80:80 \
      certbot/certbot certonly \
      --standalone \
      --non-interactive \
      --email ${EMAIL} \
      --agree-tos \
      --no-eff-email \
      --force-renewal \
      -d ${DOMAIN_API} \
      -d ${DOMAIN_UPDATE}
    
    if [ \$? -eq 0 ]; then
        echo "✅ SSL证书申请成功"
        
        # 创建HTTPS版Nginx配置
        cat > nginx/conf.d/default.conf << 'HTTPS_NGINX_EOF'
# API Server - HTTP 重定向
server {
    listen 80;
    server_name ${DOMAIN_API};
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# API Server - HTTPS
server {
    listen 443 ssl http2;
    server_name ${DOMAIN_API};
    
    ssl_certificate /etc/letsencrypt/live/${DOMAIN_API}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_API}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location / {
        proxy_pass http://api:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

# Update Server - HTTP 重定向
server {
    listen 80;
    server_name ${DOMAIN_UPDATE};
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Update Server - HTTPS
server {
    listen 443 ssl http2;
    server_name ${DOMAIN_UPDATE};
    
    ssl_certificate /etc/letsencrypt/live/${DOMAIN_API}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_API}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    root /usr/share/nginx/html/updates;
    autoindex on;
}
HTTPS_NGINX_EOF
        
        # 重启Nginx和Certbot
        docker-compose up -d nginx certbot
        echo "✅ HTTPS配置完成"
    else
        echo "❌ SSL证书申请失败"
        docker-compose up -d nginx
    fi
SSL_SETUP
fi

# ============ 完成 ============
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║     🎉 部署完成！                                     ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 访问地址："
echo "   HTTP:  http://${DOMAIN_API}"
echo "   HTTPS: https://${DOMAIN_API} (如果已配置SSL)"
echo ""
echo "📋 管理命令："
echo "   查看日志:   ssh ${SERVER_USER}@${SERVER_IP} 'cd ${DEPLOY_DIR} && docker-compose logs -f api'"
echo "   重启服务:   ssh ${SERVER_USER}@${SERVER_IP} 'cd ${DEPLOY_DIR} && docker-compose restart api'"
echo "   停止服务:   ssh ${SERVER_USER}@${SERVER_IP} 'cd ${DEPLOY_DIR} && docker-compose down'"
echo ""
echo "🧪 测试命令："
echo "   curl http://${DOMAIN_API}/health"
echo "   curl https://${DOMAIN_API}/health"
echo ""



























































































































































