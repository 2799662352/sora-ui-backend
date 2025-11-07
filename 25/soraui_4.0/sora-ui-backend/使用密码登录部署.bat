@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║     🔑 使用密码登录方式部署（交互式）                  ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

set SERVER_IP=175.27.250.155
set SERVER_USER=ubuntu
set DEPLOY_DIR=/opt/sora-ui-deploy

echo 💡 此脚本需要您多次输入SSH密码
echo    建议配置SSH密钥免密登录后使用【一键部署.bat】
echo.
pause

echo.
echo [1/6] 📋 检查本地环境...
if not exist "package.json" (
    echo ❌ 错误: 未找到 package.json
    pause
    exit /b 1
)
echo ✅ 本地环境检查通过
echo.

echo [2/6] 🔍 测试服务器连接...
echo 💡 请输入SSH密码:
ssh %SERVER_USER%@%SERVER_IP% "echo '✅ 服务器连接成功'"
if errorlevel 1 (
    echo ❌ 连接失败
    pause
    exit /b 1
)
echo.

echo [3/6] 📦 准备服务器环境...
echo 💡 请再次输入SSH密码:
ssh %SERVER_USER%@%SERVER_IP% "sudo mkdir -p %DEPLOY_DIR%/backend %DEPLOY_DIR%/nginx/conf.d %DEPLOY_DIR%/certbot/conf %DEPLOY_DIR%/certbot/www %DEPLOY_DIR%/logs %DEPLOY_DIR%/updates %DEPLOY_DIR%/postgres-data && sudo chown -R ubuntu:ubuntu %DEPLOY_DIR% && echo '✅ 环境准备完成'"
echo.

echo [4/6] 📤 上传项目文件...
echo 💡 请再次输入SSH密码（上传大文件需要时间）:
scp -r Dockerfile package.json src %SERVER_USER%@%SERVER_IP%:%DEPLOY_DIR%/backend/
if errorlevel 1 (
    echo ❌ 上传失败
    pause
    exit /b 1
)
echo ✅ 文件上传完成
echo.

echo [5/6] ⚙️ 配置 Docker Compose...
echo 💡 请再次输入SSH密码:
ssh %SERVER_USER%@%SERVER_IP% "cd %DEPLOY_DIR% && cat > docker-compose.yml << 'EOFDC'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: sora-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=sorauser
      - POSTGRES_PASSWORD=sora_secure_pass_2024
      - POSTGRES_DB=sora_ui
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    networks:
      - sora-network
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U sorauser -d sora_ui\"]
      interval: 10s
      timeout: 5s
      retries: 5

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
      - JWT_SECRET=your-super-secure-jwt-secret-2024
      - LICENSE_SECRET=your-super-secure-license-key-2024
    volumes:
      - ./updates:/app/updates
      - ./logs:/app/logs
    networks:
      - sora-network
    depends_on:
      postgres:
        condition: service_healthy

  nginx:
    image: nginx:alpine
    container_name: sora-nginx
    restart: unless-stopped
    ports:
      - \"80:80\"
      - \"443:443\"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./updates:/usr/share/nginx/html/updates:ro
    networks:
      - sora-network
    depends_on:
      - api

networks:
  sora-network:
    driver: bridge
EOFDC
echo '✅ 配置文件创建完成'"
echo.

echo [6/6] 🚀 启动服务...
echo 💡 请最后一次输入SSH密码（构建需要5-10分钟）:
ssh %SERVER_USER%@%SERVER_IP% "cd %DEPLOY_DIR% && docker-compose up -d --build && echo '✅ 服务启动完成' && docker-compose ps"
echo.

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║     🎉 部署完成！                                       ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo 🌐 访问地址:
echo    http://api.zuo2799662352.xyz
echo.
echo 💡 建议：
echo    1. 配置SSH密钥免密登录
echo    2. 运行【配置SSH密钥.bat】查看步骤
echo.
pause



































