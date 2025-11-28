# MCP 工具配置说明

## 概述

本项目使用 Model Context Protocol (MCP) 工具来辅助开发和运维。以下是已配置的 MCP 服务器及其功能。

## 🐳 Docker 化 MCP 配置（推荐）

所有 MCP 服务器都可以使用 Docker 运行，更加稳定和一致。

> ⚠️ **Windows Docker Desktop 注意**: Windows 上 `--network host` 不起作用，需要使用 `host.docker.internal` 访问宿主机服务。

---

### 1. Redis MCP（官方 Docker 版）

**Docker 镜像**: `mcp/redis` (10K+ 拉取)

**配置 (Windows)**:
```json
"redis": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "--add-host", "host.docker.internal:host-gateway",
    "-e", "REDIS_HOST=host.docker.internal",
    "-e", "REDIS_PORT=6379",
    "-e", "REDIS_PWD=sora_redis_2024",
    "mcp/redis"
  ]
}
```

**配置 (Linux/macOS)**:
```json
"redis": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "--network", "host",
    "-e", "REDIS_HOST=localhost",
    "-e", "REDIS_PORT=6379",
    "-e", "REDIS_PWD=sora_redis_2024",
    "mcp/redis"
  ]
}
```

**环境变量说明**:
- `REDIS_HOST` - Redis 主机地址
- `REDIS_PORT` - Redis 端口（默认 6379）
- `REDIS_PWD` - Redis 密码
- `REDIS_USERNAME` - Redis 用户名（可选）
- `REDIS_DB` - 数据库编号（默认 0）
- `REDIS_SSL` - 是否使用 SSL（true/false）

**功能** (44 个工具):
- Hash 操作：`hset`, `hget`, `hdel`, `hgetall`, `hexists`
- JSON 操作：`json_set`, `json_get`, `json_del`
- List 操作：`lpush`, `rpush`, `lpop`, `rpop`, `lrange`, `llen`
- Key 管理：`delete`, `type`, `expire`, `rename`, `scan_keys`, `scan_all_keys`
- Set 操作：`sadd`, `srem`, `smembers`
- Sorted Set：`zadd`, `zrange`, `zrem`
- Stream：`xadd`, `xrange`, `xdel`
- String：`set`, `get`
- Vector 操作：`set_vector_in_hash`, `get_vector_from_hash`, `create_vector_index_hash`, `vector_search_hash`
- Pub/Sub：`publish`, `subscribe`, `unsubscribe`
- 服务器信息：`info`, `dbsize`, `client_list`, `get_indexes`, `get_index_info`, `get_indexed_keys_number`

**用途**:
- 监控任务轮询状态
- 调试 clientRequestId 存储
- 查看分布式锁状态

---

### 2. PostgreSQL MCP（官方 Docker 版）

**Docker 镜像**: `mcp/postgres` (100K+ 拉取)

**配置 (Windows)**:
```json
"postgres": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "--add-host", "host.docker.internal:host-gateway",
    "mcp/postgres",
    "postgresql://sorauser:sora_password_2024@host.docker.internal:5433/soraui"
  ]
}
```

**配置 (Linux/macOS)**:
```json
"postgres": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "--network", "host",
    "mcp/postgres",
    "postgresql://sorauser:sora_password_2024@localhost:5433/soraui"
  ]
}
```

**功能** (1 工具 + 22 资源):
- `query` - 执行只读 SQL 查询
- 22 个数据库资源（表、视图等）

**用途**:
- 调试数据库数据
- 查询任务状态
- 验证 clientRequestId 字段

---

### 3. Git MCP（官方 Docker 版）

**Docker 镜像**: `mcp/git`

**配置**:
```json
"git": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "--mount", "type=bind,src=D:/tecx/text,dst=/workspace",
    "mcp/git"
  ]
}
```

**功能** (12 个工具):
- `git_status` - 显示工作区状态
- `git_diff_unstaged` - 显示未暂存的更改
- `git_diff_staged` - 显示已暂存的更改
- `git_diff` - 比较分支/提交差异
- `git_commit` - 提交更改
- `git_add` - 添加到暂存区
- `git_reset` - 取消暂存
- `git_log` - 显示提交日志
- `git_create_branch` - 创建分支
- `git_checkout` - 切换分支
- `git_show` - 显示提交内容
- `git_branch` - 列出分支

**用途**:
- 查看项目 Git 状态
- 查看提交历史
- 比较分支差异

---

### 4. GitHub MCP（官方 Docker 版）

**Docker 镜像**: `ghcr.io/github/github-mcp-server`

**配置**:
```json
"github": {
  "command": "docker",
  "args": [
    "run", "-i", "--rm",
    "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
    "ghcr.io/github/github-mcp-server"
  ],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "your_github_pat"
  }
}
```

**功能**:
- 仓库管理
- Issue 管理
- Pull Request 管理
- 代码搜索
- 分支管理
- 提交管理

**用途**:
- 参考开源项目实现
- 搜索类似问题解决方案
- 管理项目 Issue 和 PR

---

### 5. DockerHub MCP（官方 Docker 版）

**Docker 镜像**: `mcp/dockerhub`

**配置**:
```json
"dockerhub": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "-e", "HUB_PAT_TOKEN",
    "mcp/dockerhub"
  ],
  "env": {
    "HUB_PAT_TOKEN": "your_dockerhub_pat"
  }
}
```

**功能** (13 个工具):
- `checkRepository` - 检查仓库是否存在
- `checkRepositoryTag` - 检查标签是否存在
- `createRepository` - 创建仓库
- `getRepositoryInfo` - 获取仓库信息
- `getRepositoryTag` - 获取标签详情
- `listRepositoriesByNamespace` - 列出命名空间下的仓库
- `listRepositoryTags` - 列出仓库标签
- `search` - 搜索仓库
- `updateRepositoryInfo` - 更新仓库信息
- `getPersonalNamespace` - 获取个人命名空间
- `listNamespaces` - 列出命名空间
- `listAllNamespacesMemberOf` - 列出所属命名空间
- `dockerHardenedImages` - 列出 Docker Hardened Images（企业版）

**用途**:
- 验证镜像推送状态
- 查看镜像标签版本
- 管理 DockerHub 仓库

---

### 6. Sequential Thinking MCP（官方 Docker 版）

**Docker 镜像**: `mcp/sequentialthinking` (100K+ 拉取)

**配置**:
```json
"sequential-thinking": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "mcp/sequentialthinking"
  ]
}
```

**功能**:
- `sequentialthinking` - 动态和反思性问题解决

**用途**:
- 复杂问题分步推理
- 多步骤任务规划

---

### 7. Fetch MCP（官方 Docker 版）

**Docker 镜像**: `mcp/fetch` (500K+ 拉取)

**配置**:
```json
"fetch": {
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "mcp/fetch"
  ]
}
```

**功能**:
- `fetch` - 获取 URL 内容并转换为 Markdown

**用途**:
- 获取网页内容
- 提取文档信息

---

## 使用示例

### Redis MCP 示例

```
# 查看 Redis 服务器信息
mcp_redis_info()

# 查看数据库大小
mcp_redis_dbsize()

# 查看所有轮询任务
mcp_redis_scan_keys(pattern="polling:*")

# 查看任务详情
mcp_redis_hgetall(name="sora-ui:polling:video_xxx")

# 查看分布式锁
mcp_redis_scan_keys(pattern="lock:*")
```

### DockerHub MCP 示例

```
# 获取仓库信息
mcp_dockerhub_getRepositoryInfo(
  namespace="zuozuoliang999",
  repository="sora-ui-backend"
)

# 检查镜像标签
mcp_dockerhub_checkRepositoryTag(
  namespace="zuozuoliang999",
  repository="sora-ui-backend",
  tag="1.6.0-clientRequestId"
)

# 列出所有标签
mcp_dockerhub_listRepositoryTags(
  namespace="zuozuoliang999",
  repository="sora-ui-backend"
)

# 搜索官方 MCP 镜像
mcp_dockerhub_search(query="mcp server")
```

### PostgreSQL MCP 示例

```sql
-- 查询任务统计
SELECT COUNT(*) as total, 
       COUNT("clientRequestId") as with_client_id,
       COUNT("externalTaskId") as with_external_id 
FROM "VideoTask";

-- 查询特定任务
SELECT * FROM "VideoTask" WHERE "clientRequestId" = '1764291396110';

-- 查看表结构
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'VideoTask';
```

### Git MCP 示例

```
# 查看状态
mcp_git_git_status(repo_path="/workspace/25/soraui_4.0/sora-ui-backend")

# 查看提交日志
mcp_git_git_log(repo_path="/workspace/25/soraui_4.0/sora-ui-backend", max_count=10)

# 查看分支
mcp_git_git_branch(repo_path="/workspace/25/soraui_4.0/sora-ui-backend", branch_type="all")
```

---

## 完整配置示例 (Windows)

```json
{
  "mcpServers": {
    "redis": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--add-host", "host.docker.internal:host-gateway",
        "-e", "REDIS_HOST=host.docker.internal",
        "-e", "REDIS_PORT=6379",
        "-e", "REDIS_PWD=sora_redis_2024",
        "mcp/redis"
      ]
    },
    "postgres": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--add-host", "host.docker.internal:host-gateway",
        "mcp/postgres",
        "postgresql://sorauser:sora_password_2024@host.docker.internal:5433/soraui"
      ]
    },
    "dockerhub": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "HUB_PAT_TOKEN",
        "mcp/dockerhub"
      ],
      "env": {
        "HUB_PAT_TOKEN": "your_dockerhub_pat"
      }
    },
    "git": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--mount", "type=bind,src=D:/tecx/text,dst=/workspace",
        "mcp/git"
      ]
    },
    "github": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your_github_pat"
      }
    },
    "sequential-thinking": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "mcp/sequentialthinking"
      ]
    },
    "fetch": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "mcp/fetch"
      ]
    }
  }
}
```

---

## 配置文件位置

- **Windows**: `C:\Users\<用户名>\.cursor\mcp.json`
- **macOS**: `~/.cursor/mcp.json`
- **Linux**: `~/.cursor/mcp.json`

---

## Docker 镜像拉取

```bash
# 拉取所有官方 MCP 镜像
docker pull mcp/postgres
docker pull mcp/redis
docker pull mcp/git
docker pull mcp/dockerhub
docker pull mcp/sequentialthinking
docker pull mcp/fetch
docker pull ghcr.io/github/github-mcp-server
```

---

## 注意事项

1. **重启 Cursor**: 修改 `mcp.json` 后需要重启 Cursor 或开始新对话才能加载新工具
2. **Docker 服务**: 所有 Docker 版 MCP 需要 Docker 服务运行
3. **Windows 网络**: Windows Docker Desktop 不支持 `--network host`，使用 `host.docker.internal` 代替
4. **密码安全**: 不要将真实密码提交到 Git 仓库
5. **Windows 路径**: Windows 下挂载路径使用 `D:/tecx/text` 格式（正斜杠）
6. **Redis 环境变量**: `mcp/redis` 使用 `REDIS_HOST`, `REDIS_PORT`, `REDIS_PWD`（不是 `REDIS_URL`）

---

## 当前验证状态

| MCP | 状态 | 工具数 | 说明 |
|-----|------|--------|------|
| Redis | ✅ 工作 | 44 | Redis 7.4.7 |
| PostgreSQL | ✅ 工作 | 1 | 469 个任务 |
| DockerHub | ✅ 工作 | 13 | 550 次拉取 |
| Git | ✅ 工作 | 12 | - |
| GitHub | ✅ 配置 | - | - |
| Sequential Thinking | ✅ 配置 | 1 | - |
| Fetch | ✅ 配置 | 1 | - |

---

## 相关文档

- [BUG-003 修复文档](../bugfix/🐛BUG-003-本地任务重复与externalTaskId丢失修复.md)

---

## 更新日志

| 日期 | 更新内容 |
|------|----------|
| 2025-11-28 | ✅ 修复 Windows Redis MCP 配置，使用 `REDIS_HOST/PORT/PWD` 环境变量 |
| 2025-11-28 | 添加 Windows 完整配置示例 |
| 2025-11-28 | 添加 Sequential Thinking 和 Fetch Docker 化配置 |
| 2025-11-28 | 更新 DockerHub MCP 为官方 Docker 镜像 `mcp/dockerhub` |
| 2025-11-28 | 更新为 Docker 化配置，使用官方镜像 |
