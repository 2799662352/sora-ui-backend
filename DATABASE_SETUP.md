# 💾 Sora UI 数据库配置指南

## 🎯 两种数据库方案

### 方案1: 使用内存数据库 (开发/测试推荐) ✅

**优点**: 
- ✅ 无需安装 PostgreSQL
- ✅ 零配置，开箱即用
- ✅ 快速测试

**缺点**:
- ❌ 重启后数据丢失
- ❌ 不适合生产环境

**使用方法**: 
不设置 `DATABASE_URL` 环境变量，后端会自动使用内存数据库

---

### 方案2: 使用 PostgreSQL (生产环境推荐) ✅

**优点**:
- ✅ 数据永久保存
- ✅ 完整的数据库功能
- ✅ 生产级性能

**缺点**:
- ❌ 需要安装 PostgreSQL

---

## 🔧 方案1: 内存数据库 (快速开始)

### 步骤1: 直接启动后端

```bash
cd sora-ui-backend
npm run dev
```

✅ **完成!** 后端会自动使用内存数据库

---

## 🔧 方案2: PostgreSQL 数据库

### 步骤1: 安装 PostgreSQL

#### Windows 系统

1. **下载 PostgreSQL**
   - 访问: https://www.postgresql.org/download/windows/
   - 下载最新版本 (推荐 14.x 或 15.x)

2. **安装**
   - 双击安装包
   - 设置密码 (记住这个密码!)
   - 端口使用默认: 5432
   - 完成安装

3. **验证安装**
   ```bash
   # 打开 CMD 或 PowerShell
   psql --version
   ```

### 步骤2: 创建数据库

```sql
-- 使用 pgAdmin 或命令行
CREATE DATABASE soraui;

-- 或使用命令行
psql -U postgres
CREATE DATABASE soraui;
\q
```

### 步骤3: 配置环境变量

在 `sora-ui-backend/.env` 文件中添加:

```env
# 数据库连接
DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/soraui"

# 其他配置
PORT=3001
NODE_ENV=development
JWT_SECRET=your-secret-key
```

**格式说明**:
```
postgresql://用户名:密码@主机:端口/数据库名
```

### 步骤4: 运行数据库迁移

```bash
cd sora-ui-backend

# 运行迁移（创建表结构）
npx prisma migrate dev

# 生成 Prisma Client
npx prisma generate
```

### 步骤5: 启动后端

```bash
npm run dev
```

✅ **完成!** 后端现在使用 PostgreSQL 数据库

---

## 🎨 Prisma Studio - 可视化数据库管理

### 什么是 Prisma Studio?

Prisma Studio 是一个现代化的数据库管理界面，类似于 phpMyAdmin，但更美观易用。

### 启动 Prisma Studio

**方式1: 使用脚本**
```bash
# 双击运行
数据库管理.bat
# 选择 [1] 打开 Prisma Studio
```

**方式2: 命令行**
```bash
cd sora-ui-backend
npx prisma studio
```

### Prisma Studio 功能

✅ 浏览器打开: `http://localhost:5555`

功能清单:
- 📊 查看所有数据表
- ➕ 添加新记录
- ✏️ 编辑现有记录
- 🗑️ 删除记录
- 🔍 搜索和过滤数据
- 🔗 查看表关系

---

## 📋 数据库表结构

### 1. Users (用户表)
```typescript
- id: UUID (主键)
- username: String (唯一)
- email: String (唯一)
- password: String (加密)
- role: USER | ADMIN | SUPER_ADMIN
- isActive: Boolean
- createdAt: DateTime
- updatedAt: DateTime
```

### 2. Licenses (许可证表)
```typescript
- id: UUID (主键)
- licenseKey: String (唯一)
- type: TRIAL | PRO | ENTERPRISE
- userId: UUID (外键)
- isActive: Boolean
- features: JSON
- activatedAt: DateTime
- expiresAt: DateTime
```

### 3. ActivityLogs (活动日志表)
```typescript
- id: UUID (主键)
- userId: UUID (外键)
- action: String
- details: JSON
- ip: String
- userAgent: String
- createdAt: DateTime
```

### 4. SystemConfigs (系统配置表)
```typescript
- id: UUID (主键)
- key: String (唯一)
- value: JSON
- createdAt: DateTime
- updatedAt: DateTime
```

---

## 🛠️ 常用数据库命令

### Prisma CLI 命令

```bash
# 打开 Prisma Studio
npx prisma studio

# 运行迁移
npx prisma migrate dev

# 查看迁移状态
npx prisma migrate status

# 生成 Prisma Client
npx prisma generate

# 重置数据库
npx prisma migrate reset

# 格式化 schema 文件
npx prisma format

# 同步数据库（不创建迁移）
npx prisma db push
```

### PostgreSQL 命令

```bash
# 连接数据库
psql -U postgres -d soraui

# 查看所有表
\dt

# 查看表结构
\d users

# 查询数据
SELECT * FROM users;

# 退出
\q
```

---

## 🐛 常见问题

### ❌ 无法连接到 PostgreSQL

**解决方案**:
1. 确认 PostgreSQL 服务已启动
   ```bash
   # Windows: 服务管理器中查找 postgresql-x64-xx
   ```

2. 检查端口 5432 是否开放
   ```bash
   netstat -ano | findstr :5432
   ```

3. 验证用户名和密码
   ```bash
   psql -U postgres
   # 输入密码
   ```

### ❌ Prisma 迁移失败

**解决方案**:
1. 删除 `prisma/migrations` 文件夹
2. 重新运行迁移
   ```bash
   npx prisma migrate dev --name init
   ```

### ❌ Prisma Client 未生成

**解决方案**:
```bash
npx prisma generate
```

---

## 📊 数据库监控

### 查看数据库大小

```sql
SELECT 
  pg_size_pretty(pg_database_size('soraui')) as db_size;
```

### 查看表行数

```sql
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

---

## 🔐 数据库安全

### 生产环境建议

1. **使用强密码**
   ```env
   DATABASE_URL="postgresql://user:strong_random_password@localhost:5432/soraui"
   ```

2. **限制连接**
   - 配置 `pg_hba.conf` 限制访问 IP
   - 使用 SSL 连接

3. **定期备份**
   ```bash
   # 备份数据库
   pg_dump -U postgres soraui > backup.sql
   
   # 恢复数据库
   psql -U postgres soraui < backup.sql
   ```

---

## 🎯 快速开始 - 3步骤

```bash
# 1. 创建 .env 文件
echo DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/soraui" > .env

# 2. 运行迁移
npx prisma migrate dev

# 3. 打开 Prisma Studio
npx prisma studio
```

---

## 📚 更多资源

- 📖 Prisma 文档: https://www.prisma.io/docs
- 📘 PostgreSQL 文档: https://www.postgresql.org/docs/
- 🎨 Prisma Studio: https://www.prisma.io/studio

---

**💡 提示**: 开发测试时，使用内存数据库最简单！生产部署时再切换到 PostgreSQL。



