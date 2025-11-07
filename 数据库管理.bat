@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   💾 Sora UI 数据库管理工具
echo ========================================
echo.

cd /d "%~dp0"

:menu
echo 请选择数据库操作:
echo.
echo [1] 🎨 打开 Prisma Studio (可视化数据库管理)
echo [2] 🔧 初始化数据库 (运行迁移)
echo [3] 📊 查看数据库状态
echo [4] 🗑️ 重置数据库 (清空所有数据)
echo [5] 📝 生成 Prisma Client
echo [6] 💡 查看数据库连接配置
echo [7] 🔄 创建新的迁移
echo [0] 退出
echo.
set /p choice=请输入选项 (0-7): 

if "%choice%"=="1" goto studio
if "%choice%"=="2" goto migrate
if "%choice%"=="3" goto status
if "%choice%"=="4" goto reset
if "%choice%"=="5" goto generate
if "%choice%"=="6" goto config
if "%choice%"=="7" goto create_migration
if "%choice%"=="0" goto end
goto menu

:studio
echo.
echo 🎨 启动 Prisma Studio...
echo ========================================
echo.
echo Prisma Studio 是一个可视化数据库管理工具
echo 将在浏览器中打开: http://localhost:5555
echo.
echo 按 Ctrl+C 停止
echo.
call npx prisma studio
goto menu

:migrate
echo.
echo 🔧 初始化数据库 (运行迁移)...
echo ========================================
echo.
call npx prisma migrate dev
echo.
echo ✅ 数据库迁移完成!
echo.
pause
goto menu

:status
echo.
echo 📊 数据库状态...
echo ========================================
echo.
call npx prisma migrate status
echo.
pause
goto menu

:reset
echo.
echo 🗑️ 重置数据库...
echo ========================================
echo.
echo ⚠️ 警告: 这将删除所有数据!
set /p confirm=确认重置? (Y/N): 
if /i "%confirm%"=="Y" (
    call npx prisma migrate reset
    echo.
    echo ✅ 数据库已重置!
) else (
    echo.
    echo ❌ 操作已取消
)
echo.
pause
goto menu

:generate
echo.
echo 📝 生成 Prisma Client...
echo ========================================
echo.
call npx prisma generate
echo.
echo ✅ Prisma Client 生成完成!
echo.
pause
goto menu

:config
echo.
echo 💡 数据库连接配置
echo ========================================
echo.
if exist ".env" (
    echo 当前 .env 配置:
    echo.
    findstr "DATABASE_URL" .env
    echo.
) else (
    echo ❌ 未找到 .env 文件
    echo.
    echo 请创建 .env 文件并添加:
    echo DATABASE_URL="postgresql://user:password@localhost:5432/soraui"
    echo.
)
echo.
echo 📚 配置说明:
echo ┌─────────────────────────────────────────────┐
echo │ 格式: postgresql://USER:PASSWORD@HOST:PORT/DB │
echo └─────────────────────────────────────────────┘
echo.
echo 示例:
echo DATABASE_URL="postgresql://postgres:123456@localhost:5432/soraui"
echo.
echo 💡 如果没有 PostgreSQL，可以使用内存数据库
echo    (后端会自动切换，无需配置)
echo.
pause
goto menu

:create_migration
echo.
echo 🔄 创建新的数据库迁移...
echo ========================================
echo.
set /p migration_name=请输入迁移名称 (例如: add_user_avatar): 
if "%migration_name%"=="" (
    echo ❌ 迁移名称不能为空
) else (
    call npx prisma migrate dev --name %migration_name%
    echo.
    echo ✅ 迁移创建完成!
)
echo.
pause
goto menu

:end
echo.
echo 👋 再见!
timeout /t 2 >nul
exit



