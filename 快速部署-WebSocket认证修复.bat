@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   🚀 快速部署 - WebSocket Token 认证修复 (v1.5.1)      ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

set SERVER_IP=175.27.250.155
set SERVER_USER=root

echo 📦 镜像版本: zuozuoliang999/sora-ui-backend:1.5.1-websocket-auth
echo 🌐 目标服务器: %SERVER_IP%
echo.
echo 💡 请输入服务器密码（只需输入一次）:
echo.

ssh %SERVER_USER%@%SERVER_IP% "cd /root/sora-ui-backend && echo '📥 拉取新镜像...' && docker pull zuozuoliang999/sora-ui-backend:1.5.1-websocket-auth && echo '' && echo '🔄 更新 docker-compose.yml...' && sed -i 's|image: zuozuoliang999/sora-ui-backend:.*|image: zuozuoliang999/sora-ui-backend:1.5.1-websocket-auth|g' docker-compose.yml && echo '' && echo '🚀 重启后端服务...' && docker-compose up -d backend --force-recreate && echo '' && echo '⏳ 等待服务启动...' && sleep 5 && echo '' && echo '📊 服务状态:' && docker ps | grep sora-ui-backend && echo '' && echo '✅ 部署完成！'"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   🎉 操作完成！                                         ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
pause

