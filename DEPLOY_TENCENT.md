# 腾讯云部署配置
# ====================================

服务器信息:
- IP: 175.27.250.155
- 用户: ubuntu
- 部署目录: /opt/sora-ui-backend

镜像信息:
- 镜像: zuozuoliang999/sora-ui-backend:1.3.1-back
- 功能: 图片去重 + 30分钟自动清理 + URL方式支持大图

环境变量:
- PUBLIC_BASE_URL=http://175.27.250.155

部署步骤:
1. SSH 连接服务器
2. 拉取最新镜像
3. 启动 docker-compose
4. 配置 nginx 静态文件服务 /uploads/
5. 测试验证

注意事项:
- 确保 80 端口可用（nginx）
- 确保安全组开放 80, 443, 3001 端口
- uploads 目录会自动创建
- Redis 和 PostgreSQL 数据会持久化
