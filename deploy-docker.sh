#!/bin/bash
# ============================================
# Sora UI Backend Docker 部署脚本
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🐳 开始 Docker 部署...${NC}"

# ============ 1. 环境检查 ============
echo -e "\n${YELLOW}📋 步骤 1: 检查 Docker 环境...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ 未安装 Docker${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ 未安装 docker-compose${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker: $(docker -v)${NC}"
echo -e "${GREEN}✅ docker-compose: $(docker-compose -v)${NC}"

# ============ 2. 环境变量 ============
echo -e "\n${YELLOW}🔐 步骤 2: 检查环境变量...${NC}"

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env 文件不存在，从 .env.example 复制...${NC}"
    cp .env.example .env
    echo -e "${RED}❗ 请修改 .env 文件中的配置${NC}"
    read -p "按 Enter 继续..."
fi

# ============ 3. 停止旧容器 ============
echo -e "\n${YELLOW}🛑 步骤 3: 停止旧容器...${NC}"
docker-compose down || true

# ============ 4. 构建镜像 ============
echo -e "\n${YELLOW}🔨 步骤 4: 构建 Docker 镜像...${NC}"
docker-compose build --no-cache

# ============ 5. 启动服务 ============
echo -e "\n${YELLOW}🚀 步骤 5: 启动服务...${NC}"
docker-compose up -d

# ============ 6. 健康检查 ============
echo -e "\n${YELLOW}🏥 步骤 6: 健康检查...${NC}"
sleep 5

if docker ps | grep -q sora-ui-backend; then
    echo -e "${GREEN}✅ 容器运行正常${NC}"
else
    echo -e "${RED}❌ 容器启动失败${NC}"
    docker-compose logs
    exit 1
fi

# ============ 完成 ============
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Docker 部署成功！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}📡 服务地址:${NC}"
echo -e "  - API: ${GREEN}http://localhost:3001${NC}"
echo -e "  - Nginx: ${GREEN}http://localhost:80${NC}"
echo ""
echo -e "${YELLOW}📋 常用命令:${NC}"
echo -e "  - 查看日志: ${GREEN}docker-compose logs -f${NC}"
echo -e "  - 重启服务: ${GREEN}docker-compose restart${NC}"
echo -e "  - 停止服务: ${GREEN}docker-compose down${NC}"
echo -e "  - 查看状态: ${GREEN}docker-compose ps${NC}"
echo ""

