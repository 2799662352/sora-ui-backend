#!/bin/bash

# Sora UI Backend 生产部署脚本
# 用于首次部署或更新后端服务

set -e  # 遇到错误立即退出

echo "🚀 开始部署 Sora UI Backend..."

# 配置变量
APP_DIR="/var/www/sora-ui-backend"
APP_NAME="sora-ui-backend"
NODE_ENV="production"

# 1. 创建应用目录
echo "📁 创建应用目录..."
mkdir -p $APP_DIR
cd $APP_DIR

# 2. 拉取最新代码（如果使用 Git）
if [ -d ".git" ]; then
    echo "🔄 拉取最新代码..."
    git pull origin main
else
    echo "⚠️  首次部署，请手动上传代码到 $APP_DIR"
    echo "   或使用: git clone <your-repo-url> ."
    exit 1
fi

# 3. 安装依赖
echo "📦 安装依赖..."
npm install --production

# 4. 编译 TypeScript
echo "🔨 编译 TypeScript..."
npm run build

# 5. 配置环境变量
echo "⚙️  配置环境变量..."
if [ ! -f ".env" ]; then
    cat > .env << EOF
# 生产环境配置
NODE_ENV=production
PORT=3001

# JWT 配置（生产环境请使用强密钥）
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# 数据库配置
DATABASE_URL=postgresql://sora_user:YOUR_PASSWORD@localhost:5432/sora_ui_db

# CORS 配置
CORS_ORIGIN=https://yourdomain.com
EOF
    echo "✅ 已创建 .env 文件，请修改数据库密码！"
else
    echo "ℹ️  .env 文件已存在，跳过"
fi

# 6. 设置数据库
echo "🗄️  初始化数据库..."
if ! psql -U postgres -lqt | cut -d \| -f 1 | grep -qw sora_ui_db; then
    echo "创建数据库..."
    sudo -u postgres psql -f setup-database.sql
    echo "✅ 数据库创建成功"
else
    echo "ℹ️  数据库已存在"
fi

# 7. 使用 PM2 启动应用
echo "🚀 启动应用..."
pm2 delete $APP_NAME 2>/dev/null || true  # 删除旧进程（如果存在）
pm2 start dist/app.js --name $APP_NAME --env production

# 8. 配置 PM2 开机自启
echo "⚙️  配置开机自启..."
pm2 startup
pm2 save

# 9. 显示状态
echo ""
echo "✅ 部署完成！"
echo ""
echo "📊 应用状态:"
pm2 status

echo ""
echo "📝 后续步骤:"
echo "1. 修改 .env 文件中的数据库密码"
echo "2. 配置 Nginx 反向代理"
echo "3. 申请 SSL 证书"
echo ""
echo "📚 常用命令:"
echo "  pm2 logs $APP_NAME       # 查看日志"
echo "  pm2 restart $APP_NAME    # 重启应用"
echo "  pm2 stop $APP_NAME       # 停止应用"
echo "  pm2 monit                # 监控应用"

