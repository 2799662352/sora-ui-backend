#!/bin/bash
# server-deploy.sh
# Sora UI Backend 服务器端部署脚本
# 使用方法：上传 sora-backend.zip 到 /tmp/ 后，SSH 登录服务器执行此脚本

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  🚀 Sora UI Backend 部署脚本           ║"
echo "╚════════════════════════════════════════╝"
echo ""

# ============ 配置信息 ============
BACKEND_DIR="/root/sora-backend"
BACKUP_DIR="/root/sora-backend-backup"
ZIP_FILE="/tmp/sora-backend.zip"

# 检查 ZIP 文件是否存在
if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ 错误：找不到 $ZIP_FILE"
    echo "请先上传 sora-backend.zip 到 /tmp/"
    exit 1
fi

echo "✅ 找到部署包: $ZIP_FILE"
echo ""

# ============ 1. 备份现有代码 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [1/9] 备份现有代码"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -d "$BACKEND_DIR" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_PATH="$BACKUP_DIR/backup_${TIMESTAMP}"
    mkdir -p "$BACKUP_DIR"
    cp -r "$BACKEND_DIR" "$BACKUP_PATH"
    echo "✅ 备份到: $BACKUP_PATH"
else
    echo "⚠️  首次部署，无需备份"
fi
echo ""

# ============ 2. 停止现有服务 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [2/9] 停止现有服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if docker ps | grep -q sora-backend; then
    docker stop sora-backend
    docker rm sora-backend
    echo "✅ 服务已停止"
else
    echo "⚠️  服务未运行"
fi
echo ""

# ============ 3. 清理旧代码 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [3/9] 清理旧代码"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

rm -rf "$BACKEND_DIR"
mkdir -p "$BACKEND_DIR"
echo "✅ 目录准备完成: $BACKEND_DIR"
echo ""

# ============ 4. 解压代码 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [4/9] 解压代码"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$BACKEND_DIR"
unzip -q "$ZIP_FILE"
echo "✅ 解压完成"
echo "文件列表："
ls -lh
echo ""

# ============ 5. 创建 Dockerfile ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [5/9] 创建 Dockerfile"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cat > Dockerfile << 'DOCKERFILE'
FROM node:18-alpine

WORKDIR /app

# 安装 OpenSSL（Prisma 需要）
RUN apk add --no-cache openssl

# 复制 package.json
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 编译 TypeScript
RUN npm run build

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3001/health',(r)=>{process.exit(r.statusCode==200?0:1)})"

# 启动应用
CMD ["node", "dist/app.js"]
DOCKERFILE

echo "✅ Dockerfile 创建成功"
cat Dockerfile
echo ""

# ============ 6. 构建 Docker 镜像 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [6/9] 构建 Docker 镜像（需要 5-10 分钟）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

docker build -t sora-backend:latest .

if [ $? -eq 0 ]; then
    echo "✅ 镜像构建成功"
    docker images | grep sora-backend
else
    echo "❌ 镜像构建失败！"
    exit 1
fi
echo ""

# ============ 7. 运行数据库迁移 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [7/9] 运行数据库迁移"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

docker run --rm \
  --network sora-network \
  -e DATABASE_URL="postgresql://soraui:soraui@sora-postgres:5432/soraui?schema=public" \
  sora-backend:latest \
  npx prisma migrate deploy

if [ $? -eq 0 ]; then
    echo "✅ 数据库迁移完成"
else
    echo "⚠️  数据库迁移失败（如果是首次部署，这是正常的）"
fi
echo ""

# ============ 8. 启动服务 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [8/9] 启动服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

docker run -d \
  --name sora-backend \
  --network sora-network \
  -p 3001:3001 \
  -e DATABASE_URL="postgresql://soraui:soraui@sora-postgres:5432/soraui?schema=public" \
  -e JWT_SECRET="your-super-secret-jwt-key-change-this-in-production-2024" \
  -e JWT_EXPIRES_IN="7d" \
  -e NODE_ENV="production" \
  -e PORT="3001" \
  -e ADMIN_KEY="admin-secret-key-2024" \
  -e LOG_LEVEL="info" \
  --restart always \
  sora-backend:latest

if [ $? -eq 0 ]; then
    echo "✅ 服务启动成功"
    docker ps | grep sora-backend
else
    echo "❌ 服务启动失败！"
    docker logs sora-backend
    exit 1
fi
echo ""

# ============ 9. 等待服务启动并验证 ============
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [9/9] 验证部署"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "⏳ 等待服务启动（30秒）..."
sleep 30

# 检查容器状态
if docker ps | grep -q sora-backend; then
    echo "✅ 容器运行正常"
    docker ps | grep sora-backend
else
    echo "❌ 容器未运行！"
    echo "查看日志："
    docker logs sora-backend
    exit 1
fi
echo ""

# 测试 API
echo "测试 API..."
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ API 响应正常"
    echo ""
    echo "健康检查响应："
    curl -s http://localhost:3001/health | jq '.' || curl -s http://localhost:3001/health
else
    echo "❌ API 无响应"
    echo "查看日志："
    docker logs --tail 50 sora-backend
    exit 1
fi
echo ""

# 测试数据库连接
echo "测试数据库连接..."
docker exec sora-postgres-local psql -U soraui -d soraui -c "SELECT COUNT(*) as user_count FROM users;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ 数据库连接正常"
else
    echo "⚠️  数据库连接测试失败（可能是首次部署）"
fi
echo ""

# ============ 完成 ============
echo "╔════════════════════════════════════════╗"
echo "║  ✅ 部署完成！                         ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "🌐 访问地址："
echo "   HTTPS: https://api.zuo2799662352.xyz/health"
echo "   HTTP:  http://175.27.250.155:3001/health"
echo ""
echo "📝 常用命令："
echo "   查看日志:   docker logs -f sora-backend"
echo "   重启服务:   docker restart sora-backend"
echo "   停止服务:   docker stop sora-backend"
echo "   查看状态:   docker ps | grep sora"
echo ""
echo "📊 下一步："
echo "   1. 在本地测试: curl https://api.zuo2799662352.xyz/health"
echo "   2. 配置前端连接到新后端"
echo "   3. 测试完整功能"
echo ""


