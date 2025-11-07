# ============ Stage 1: Build ============
FROM node:18-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，用于构建）
RUN npm ci

# 复制源代码
COPY . .

# 生成 Prisma 客户端
RUN npx prisma generate

# 构建 TypeScript
RUN npm run build

# 清理 devDependencies（可选，节省空间）
RUN npm prune --production

# ============ Stage 2: Runtime ============
FROM node:18-alpine

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 复制生产依赖
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# 复制 Prisma schema 和生成的客户端
COPY --from=builder /app/prisma ./prisma

# 创建必要的目录
RUN mkdir -p /app/updates /app/logs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["node", "dist/app.js"]

