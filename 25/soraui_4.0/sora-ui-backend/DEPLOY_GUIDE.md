# 🚀 Sora UI Backend 生产部署指南

> 手动部署步骤（最稳定可靠）

---

## 📋 部署前准备

### 1. 服务器信息

```bash
服务器IP:   175.27.250.155
用户名:     root
SSH端口:    22
目标目录:   /root/sora-backend
```

### 2. 本地准备

确保已安装：
- ✅ OpenSSH Client（Windows 10+ 自带）
- ✅ Git for Windows（可选，包含更好的 tar 工具）

---

## 🎯 部署步骤

### 步骤1：打包本地代码 ⏱️ 5分钟

在 Windows PowerShell 中执行：

```powershell
# 进入后端目录
cd D:\备份\text\25\soraui_4.0\sora-ui-backend

# 创建部署文件夹
mkdir deploy
cd deploy

# 复制必需文件
Copy-Item -Path ..\src -Destination .\src -Recurse
Copy-Item -Path ..\prisma -Destination .\prisma -Recurse
Copy-Item -Path ..\package.json -Destination .\
Copy-Item -Path ..\package-lock.json -Destination .\
Copy-Item -Path ..\tsconfig.json -Destination .\

# 检查文件
Get-ChildItem -Recurse | Measure-Object | Select-Object Count
```

✅ **完成标志：** 看到所有文件复制成功

---

### 步骤2：压缩打包 ⏱️ 2分钟

```powershell
# 压缩为 zip（Windows 原生支持）
Compress-Archive -Path * -DestinationPath ..\sora-backend.zip -Force

# 返回上级目录
cd ..

# 检查压缩包
Get-Item sora-backend.zip
```

✅ **完成标志：** 看到 `sora-backend.zip` 文件

---

### 步骤3：上传到服务器 ⏱️ 5分钟

#### 方法A：使用 SCP（推荐）

```powershell
# 上传压缩包
scp sora-backend.zip root@175.27.250.155:/tmp/

# 输入密码后等待上传完成
```

#### 方法B：使用 WinSCP（图形界面）

1. 下载 WinSCP: https://winscp.net/
2. 连接服务器：175.27.250.155
3. 将 `sora-backend.zip` 拖拽到 `/tmp/` 目录

✅ **完成标志：** 文件上传成功，显示 100%

---

### 步骤4：SSH 登录服务器 ⏱️ 1分钟

```powershell
# SSH 连接
ssh root@175.27.250.155

# 输入密码后进入服务器
```

✅ **完成标志：** 看到服务器命令提示符

---

### 步骤5：在服务器上部署 ⏱️ 10分钟

**重要：** 以下命令在服务器上执行！

```bash
echo "╔════════════════════════════════════════╗"
echo "║  🚀 开始部署 Sora UI Backend           ║"
echo "╚════════════════════════════════════════╝"
echo ""

# ============ 1. 备份现有代码 ============
echo "[1/8] 备份现有代码..."
if [ -d "/root/sora-backend" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    mkdir -p /root/sora-backend-backup
    cp -r /root/sora-backend "/root/sora-backend-backup/backup_${TIMESTAMP}"
    echo "✅ 备份到: /root/sora-backend-backup/backup_${TIMESTAMP}"
else
    echo "⚠️  首次部署，无需备份"
fi
echo ""

# ============ 2. 停止现有服务 ============
echo "[2/8] 停止现有服务..."
if docker ps | grep -q sora-backend; then
    docker stop sora-backend
    docker rm sora-backend
    echo "✅ 服务已停止"
else
    echo "⚠️  服务未运行"
fi
echo ""

# ============ 3. 清理旧代码 ============
echo "[3/8] 清理旧代码..."
rm -rf /root/sora-backend
mkdir -p /root/sora-backend
echo "✅ 目录准备完成"
echo ""

# ============ 4. 解压代码 ============
echo "[4/8] 解压代码..."
cd /root/sora-backend
unzip -q /tmp/sora-backend.zip
echo "✅ 解压完成"
ls -la
echo ""

# ============ 5. 创建 Dockerfile ============
echo "[5/8] 创建 Dockerfile..."
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
echo ""

# ============ 6. 构建 Docker 镜像 ============
echo "[6/8] 构建 Docker 镜像（需要 5-10 分钟）..."
docker build -t sora-backend:latest .
if [ $? -eq 0 ]; then
    echo "✅ 镜像构建成功"
else
    echo "❌ 镜像构建失败！"
    exit 1
fi
echo ""

# ============ 7. 运行数据库迁移 ============
echo "[7/8] 运行数据库迁移..."
docker run --rm \
  --network sora-network \
  -e DATABASE_URL="postgresql://soraui:soraui@sora-postgres:5432/soraui?schema=public" \
  sora-backend:latest \
  npx prisma migrate deploy

echo "✅ 数据库迁移完成"
echo ""

# ============ 8. 启动服务 ============
echo "[8/8] 启动服务..."
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
else
    echo "❌ 服务启动失败！"
    docker logs sora-backend
    exit 1
fi
echo ""

# ============ 9. 等待服务启动 ============
echo "⏳ 等待服务完全启动（30秒）..."
sleep 30

# ============ 10. 验证部署 ============
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📊 部署结果验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查容器状态
if docker ps | grep -q sora-backend; then
    echo "✅ 容器运行正常"
    docker ps | grep sora-backend
else
    echo "❌ 容器未运行！"
    echo "查看日志:"
    docker logs sora-backend
    exit 1
fi
echo ""

# 测试 API
echo "测试 API..."
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ API 响应正常"
    curl -s http://localhost:3001/health | jq '.'
else
    echo "❌ API 无响应"
    docker logs sora-backend
fi
echo ""

# 测试数据库连接
echo "测试数据库连接..."
docker exec sora-postgres-local psql -U soraui -d soraui -c "SELECT COUNT(*) as user_count FROM users;"
echo ""

# 完成
echo "╔════════════════════════════════════════╗"
echo "║  ✅ 部署完成！                         ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "🌐 访问地址："
echo "   HTTPS: https://api.zuo2799662352.xyz/health"
echo "   HTTP:  http://175.27.250.155:3001/health"
echo ""
echo "📝 查看日志: docker logs -f sora-backend"
echo "🔄 重启服务: docker restart sora-backend"
echo "🛑 停止服务: docker stop sora-backend"
```

✅ **完成标志：** 看到 "✅ 部署完成！"

---

## 🧪 部署后测试

### 1. 测试健康检查

```bash
# 在服务器上
curl http://localhost:3001/health

# 在本地
curl https://api.zuo2799662352.xyz/health
```

预期输出：
```json
{
  "status": "ok",
  "database": "connected",
  "uptime": 12345
}
```

### 2. 测试登录 API

```bash
curl -X POST https://api.zuo2799662352.xyz/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zuozuoliang999","password":"zuozuoliang999"}'
```

预期输出：
```json
{
  "success": true,
  "data": {
    "token": "...",
    "user": {...}
  }
}
```

### 3. 测试管理后台

```bash
curl https://api.zuo2799662352.xyz/api/admin/stats \
  -H "x-admin-key: admin-secret-key-2024"
```

---

## ⚠️ 故障排查

### 问题1：容器启动失败

```bash
# 查看日志
docker logs sora-backend

# 检查网络
docker network ls
docker network inspect sora-network

# 检查数据库
docker exec sora-postgres-local psql -U soraui -d soraui -c "\dt"
```

### 问题2：API 无响应

```bash
# 检查端口
netstat -tlnp | grep 3001

# 检查防火墙
firewall-cmd --list-ports

# 测试本地连接
curl http://localhost:3001/health
```

### 问题3：数据库连接失败

```bash
# 检查 PostgreSQL
docker ps | grep postgres

# 测试数据库连接
docker exec sora-postgres-local psql -U soraui -d soraui -c "SELECT 1;"

# 检查网络连接
docker exec sora-backend ping sora-postgres
```

---

## 🔄 更新部署

如果需要更新代码，重复以下步骤：

1. 打包新代码
2. 上传到服务器 `/tmp/sora-backend-new.zip`
3. 停止容器：`docker stop sora-backend && docker rm sora-backend`
4. 解压新代码到 `/root/sora-backend`
5. 重新构建镜像
6. 启动新容器

---

## 📊 监控和维护

### 查看日志

```bash
# 实时日志
docker logs -f sora-backend

# 最近 100 行
docker logs --tail 100 sora-backend

# 按时间过滤
docker logs --since 1h sora-backend
```

### 性能监控

```bash
# 容器资源使用
docker stats sora-backend

# 磁盘使用
df -h

# 内存使用
free -h
```

### 定期备份

```bash
# 备份数据库
docker exec sora-postgres-local pg_dump -U soraui soraui > backup_$(date +%Y%m%d).sql

# 备份代码
tar -czf /root/backups/sora-backend-$(date +%Y%m%d).tar.gz /root/sora-backend
```

---

## ✅ 部署检查清单

- [ ] 代码已打包
- [ ] 文件已上传到服务器
- [ ] 旧服务已停止
- [ ] 代码已解压
- [ ] Docker 镜像已构建
- [ ] 数据库迁移已执行
- [ ] 新服务已启动
- [ ] 健康检查通过
- [ ] API 测试通过
- [ ] HTTPS 访问正常
- [ ] 日志正常
- [ ] 前端可以连接

---

**🎉 完成后你将拥有：**

✅ 生产级的后端服务  
✅ 自动重启的 Docker 容器  
✅ 完整的日志记录  
✅ HTTPS 加密通信  
✅ 数据持久化  
✅ 管理后台 API  

**📞 遇到问题？**

1. 检查 Docker 日志
2. 查看数据库连接
3. 测试网络连通性
4. 参考故障排查部分


