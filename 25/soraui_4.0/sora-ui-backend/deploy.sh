#!/bin/bash
# ============================================
# Sora UI Backend 自动化部署脚本
# ============================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 开始部署 Sora UI Backend...${NC}"

# ============ 1. 环境检查 ============
echo -e "\n${YELLOW}📋 步骤 1: 检查环境...${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未安装 Node.js${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js: $(node -v)${NC}"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ 未安装 npm${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm: $(npm -v)${NC}"

# 检查 Docker (可选)
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker: $(docker -v)${NC}"
else
    echo -e "${YELLOW}⚠️  未安装 Docker (可选)${NC}"
fi

# ============ 2. 安装依赖 ============
echo -e "\n${YELLOW}📦 步骤 2: 安装依赖...${NC}"
npm ci --production=false

# ============ 3. 构建项目 ============
echo -e "\n${YELLOW}🔨 步骤 3: 构建 TypeScript...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ 构建失败，dist 目录不存在${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 构建成功${NC}"

# ============ 4. 环境变量检查 ============
echo -e "\n${YELLOW}🔐 步骤 4: 检查环境变量...${NC}"

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env 文件不存在，从 .env.example 复制...${NC}"
    cp .env.example .env
    echo -e "${RED}❗ 请修改 .env 文件中的配置（JWT_SECRET, LICENSE_SECRET 等）${NC}"
    read -p "按 Enter 继续..."
fi

# 检查关键环境变量
source .env 2>/dev/null || true

if [ "$JWT_SECRET" == "请修改为你的密钥" ] || [ -z "$JWT_SECRET" ]; then
    echo -e "${RED}❌ 请设置 JWT_SECRET 环境变量${NC}"
    exit 1
fi

if [ "$LICENSE_SECRET" == "请修改为你的许可证密钥" ] || [ -z "$LICENSE_SECRET" ]; then
    echo -e "${RED}❌ 请设置 LICENSE_SECRET 环境变量${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 环境变量检查通过${NC}"

# ============ 5. 创建必要目录 ============
echo -e "\n${YELLOW}📁 步骤 5: 创建必要目录...${NC}"
mkdir -p updates logs
echo -e "${GREEN}✅ 目录创建完成${NC}"

# ============ 6. 使用 PM2 部署 ============
echo -e "\n${YELLOW}🚀 步骤 6: 使用 PM2 部署...${NC}"

if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  未安装 PM2，正在安装...${NC}"
    npm install -g pm2
fi

# 停止旧进程
pm2 delete sora-ui-backend 2>/dev/null || true

# 启动新进程
pm2 start dist/app.js \
    --name sora-ui-backend \
    --time \
    --instances 1 \
    --max-memory-restart 500M

# 保存 PM2 配置
pm2 save

echo -e "${GREEN}✅ PM2 部署成功${NC}"

# ============ 7. 设置开机自启 ============
echo -e "\n${YELLOW}⚙️  步骤 7: 设置开机自启...${NC}"
pm2 startup || echo -e "${YELLOW}⚠️  请手动运行 PM2 startup 命令${NC}"

# ============ 8. 健康检查 ============
echo -e "\n${YELLOW}🏥 步骤 8: 健康检查...${NC}"
sleep 3

HEALTH_URL="http://localhost:${PORT:-3001}/health"
if curl -f -s "$HEALTH_URL" > /dev/null; then
    echo -e "${GREEN}✅ 服务健康检查通过${NC}"
else
    echo -e "${RED}❌ 服务健康检查失败${NC}"
    pm2 logs sora-ui-backend --lines 20
    exit 1
fi

# ============ 完成 ============
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 部署成功！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}📡 服务地址: http://localhost:${PORT:-3001}${NC}"
echo -e "${GREEN}🏥 健康检查: $HEALTH_URL${NC}"
echo ""
echo -e "${YELLOW}📋 常用命令:${NC}"
echo -e "  - 查看日志: ${GREEN}pm2 logs sora-ui-backend${NC}"
echo -e "  - 重启服务: ${GREEN}pm2 restart sora-ui-backend${NC}"
echo -e "  - 停止服务: ${GREEN}pm2 stop sora-ui-backend${NC}"
echo -e "  - 查看状态: ${GREEN}pm2 status${NC}"
echo ""

