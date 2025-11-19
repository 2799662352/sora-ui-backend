# 🚀 Sora UI Backend

Sora UI 视频生成应用的后端服务，提供用户认证、许可证管理和自动更新功能。

## 📋 功能特性

- ✅ **用户认证**
  - 用户注册/登录
  - JWT Token 管理
  - 密码加密（bcrypt）
  
- ✅ **许可证管理**
  - 许可证激活
  - 功能权限控制
  - 过期检查
  
- ✅ **自动更新**
  - 版本检查
  - 更新文件下载

- ✅ **视频任务管理** 🆕
  - 视频/图片生成任务创建
  - 任务状态实时追踪
  - 历史记录持久化存储
  - 异步任务自动轮询
  - 任务统计和分析
  - 批量任务管理

## 🛠️ 技术栈

- **Runtime**: Node.js (v16+)
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL (Prisma ORM) 
- **Authentication**: JWT (jsonwebtoken)
- **Password**: bcrypt
- **Dev Tools**: nodemon, ts-node
- **ORM**: Prisma
- **Container**: Docker & Docker Compose

## 📦 项目结构

```
sora-ui-backend/
├── src/
│   ├── app.ts                 # Express 应用入口
│   ├── types/                 # TypeScript 类型定义
│   │   └── index.ts
│   ├── storage/               # 数据存储
│   │   └── inMemoryDB.ts     # 内存数据库（演示）
│   ├── services/              # 业务逻辑
│   │   ├── authService.ts    # 认证服务
│   │   ├── licenseService.ts # 许可证服务
│   │   ├── updateService.ts  # 更新服务
│   │   └── videoTaskService.ts # 视频任务服务 🆕
│   ├── repositories/          # 数据访问层 🆕
│   │   └── videoTaskRepository.ts # 视频任务数据访问
│   ├── routes/                # API 路由
│   │   ├── auth.ts           # 认证路由
│   │   ├── license.ts        # 许可证路由
│   │   ├── update.ts         # 更新路由
│   │   └── videoTask.ts      # 视频任务路由 🆕
│   └── middleware/            # 中间件
│       └── auth.ts           # JWT 认证中间件
├── prisma/                    # Prisma 数据库配置
│   ├── schema.prisma         # 数据库模型定义
│   └── migrations/           # 数据库迁移文件
├── docs/                      # 文档 🆕
│   ├── VIDEO_TASK_API.md     # 视频任务 API 文档
│   ├── FRONTEND_INTEGRATION.md # 前端集成指南
│   └── DEPLOYMENT_GUIDE.md   # 部署指南
├── Dockerfile                 # Docker 镜像配置
├── docker-compose.yml         # Docker Compose 配置
├── nginx/                     # Nginx 配置
├── add-video-tasks-migration.sql # 视频任务表迁移脚本 🆕
│   └── nginx.conf
├── deploy.sh                  # 部署脚本（Linux）
├── deploy-docker.sh           # Docker 部署脚本
└── DEPLOYMENT.md              # 部署文档
```

## 🚦 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

服务器将在 `http://localhost:3001` 启动。

### 生产构建

```bash
npm run build
npm start
```

## 📡 API 端点

### 健康检查

```http
GET /health
```

### 认证 API

```http
POST /api/auth/register    # 用户注册
POST /api/auth/login       # 用户登录
```

### 许可证 API

```http
POST /api/license/activate  # 激活许可证
GET  /api/license/info      # 查询许可证信息
```

### 更新 API

```http
GET  /api/update/check           # 检查更新
GET  /api/update/download/:version  # 下载更新
```

### 视频任务 API 🆕

```http
POST /api/video/tasks             # 创建视频任务
GET  /api/video/tasks             # 获取任务列表
GET  /api/video/tasks/:videoId   # 获取任务详情
GET  /api/video/tasks/:videoId/content # 获取视频内容
POST /api/video/tasks/:videoId/cancel  # 取消任务
GET  /api/video/stats             # 获取任务统计
```

详细文档请查看 [视频任务 API 文档](docs/VIDEO_TASK_API.md)

## 🧪 测试

### 使用 PowerShell 测试

```powershell
# 健康检查
Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get

# 用户注册
Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"username":"testuser","email":"test@example.com","password":"Test123456"}'

# 用户登录
$loginResult = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"username":"testuser","password":"Test123456"}'

$token = $loginResult.data.token

# 激活许可证
$headers = @{
  "Authorization" = "Bearer $token"
  "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "http://localhost:3001/api/license/activate" `
  -Method Post `
  -Headers $headers `
  -Body '{"licenseKey":"SORA-PRO-UNLIMITED-LIFETIME-2024"}'

# 创建视频任务
$videoTask = Invoke-RestMethod -Uri "http://localhost:3001/api/video/tasks" `
  -Method Post `
  -Headers $headers `
  -Body '{"prompt":"一只可爱的小猫在玩耍","model":"sora_video2","duration":10}'

$videoId = $videoTask.data.videoId

# 查询任务状态
Invoke-RestMethod -Uri "http://localhost:3001/api/video/tasks/$videoId" `
  -Method Get `
  -Headers $headers

# 获取任务列表
Invoke-RestMethod -Uri "http://localhost:3001/api/video/tasks?page=1&pageSize=10" `
  -Method Get `
  -Headers $headers
```

## 🐳 Docker 部署

### 使用 Docker Compose

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 使用 Dockerfile

```bash
# 构建镜像
docker build -t sora-ui-backend .

# 运行容器
docker run -d -p 3001:3001 --name sora-ui-backend sora-ui-backend
```

## ⚙️ 环境变量

创建 `.env` 文件：

```env
# Server
PORT=3001
NODE_ENV=production

# JWT
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Database (生产环境)
DATABASE_URL=postgresql://user:password@localhost:5432/soraui

# Update Server
UPDATE_BASE_URL=https://your-update-server.com

# 视频任务 API 🆕
APIYI_API_KEY=sk-fkmcuF2M7pwW1X9oE8E9Ba553e694f5388A85519A4D2Bc67
VIDEO_POLL_INTERVAL=30000
VIDEO_MAX_POLL_ATTEMPTS=20
VIDEO_TASK_RETENTION_DAYS=30
```

## 📚 相关文档

### 原有文档
- [🧪 测试后端集成指南](../sora-ui/docs/features/🧪测试后端集成指南.md)
- [📡 后端服务器实现指南](../sora-ui/docs/features/📡后端服务器实现指南.md)
- [⚡ 热更新部署指南](../sora-ui/docs/features/⚡热更新部署指南.md)
- [🚀 完整生产部署方案](../sora-ui/docs/features/🚀完整生产部署方案.md)

### 视频任务相关文档 🆕
- [📹 视频任务 API 文档](docs/VIDEO_TASK_API.md)
- [🔗 前端集成指南](docs/FRONTEND_INTEGRATION.md)
- [🚀 部署指南](docs/DEPLOYMENT_GUIDE.md)

## 🔒 安全注意事项

- ✅ 使用 bcrypt 加密密码（成本因子 10）
- ✅ JWT 令牌保护 API
- ✅ CORS 配置
- ⚠️ 生产环境请更改 `JWT_SECRET`
- ⚠️ 生产环境请使用 PostgreSQL 替换内存数据库
- ⚠️ 生产环境请配置 HTTPS
- ⚠️ API Key 请妥善保管，避免泄露
- ⚠️ 设置合理的任务配额限制
- ⚠️ 定期清理过期的视频任务记录

## 🐛 问题排查

### TypeScript 编译错误

```bash
# 清除缓存
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 端口占用

```bash
# Windows
netstat -ano | findstr :3001

# Linux/Mac
lsof -i :3001
```

### 无法连接

1. 确认服务器已启动
2. 检查防火墙设置
3. 验证端口是否正确

## 📝 开发指南

### 添加新的 API 端点

1. 在 `src/services/` 创建服务
2. 在 `src/routes/` 创建路由
3. 在 `src/app.ts` 注册路由

### 数据库迁移（生产环境）

```bash
# 安装 Prisma 或其他 ORM
npm install prisma @prisma/client

# 初始化
npx prisma init

# 创建迁移
npx prisma migrate dev

# 应用迁移
npx prisma migrate deploy
```

## 📈 性能优化

- ✅ 使用 bcrypt 异步方法
- ✅ JWT 令牌缓存
- ✅ Express 压缩中间件（计划）
- ✅ Redis 缓存（计划）
- ✅ 数据库连接池（计划）

## 🚧 未来计划

- [ ] 替换内存数据库为 PostgreSQL
- [ ] 添加 Redis 缓存
- [ ] 实现 Refresh Token
- [ ] 添加速率限制
- [ ] 添加日志系统
- [ ] 添加监控和告警
- [ ] 添加单元测试
- [ ] 添加集成测试

## 📄 许可证

MIT License

## 🙏 致谢

- Express.js
- TypeScript
- bcrypt
- jsonwebtoken
- nodemon

---

**Made with ❤️ for Sora UI**
