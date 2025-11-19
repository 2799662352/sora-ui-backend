# ============ 预编译模式 Dockerfile ============
# 🔥 使用本地编译好的 dist/ 目录，跳过 Docker 内编译
# 
# 优势：
# - 避免 Docker 内 npm ci 依赖问题
# - 更快的构建速度
# - 确保使用最新代码

FROM node:20-alpine

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 复制 package 文件并安装生产依赖
COPY package*.json ./
RUN npm ci --only=production

# 🔥 复制本地预编译的 dist/ 目录
COPY dist ./dist
COPY prisma ./prisma

# 生成 Prisma 客户端
RUN npx prisma generate

# 创建必要的目录
RUN mkdir -p /app/updates /app/logs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["node", "dist/app.js"]

