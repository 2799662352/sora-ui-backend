@echo off
chcp 65001 >nul
echo ╔══════════════════════════════════════════════════════════╗
echo ║     🔐 SSH密钥配置向导                                  ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

echo 📋 步骤1：查看公钥内容
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
type 123456.pub
echo.
echo.

echo 📋 步骤2：手动上传公钥到服务器
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 请按照以下步骤操作：
echo.
echo 1. 复制上面显示的公钥内容（从 ssh-rsa 开始到结尾）
echo.
echo 2. 在新的终端窗口中执行：
echo    ssh ubuntu@175.27.250.155
echo.
echo 3. 登录服务器后，执行：
echo    mkdir -p ~/.ssh
echo    chmod 700 ~/.ssh
echo    nano ~/.ssh/authorized_keys
echo.
echo 4. 将复制的公钥粘贴到文件末尾
echo.
echo 5. 保存并退出（Ctrl+O, Enter, Ctrl+X）
echo.
echo 6. 设置正确的权限：
echo    chmod 600 ~/.ssh/authorized_keys
echo.
echo 7. 退出服务器：
echo    exit
echo.
echo.

echo 📋 步骤3：测试免密登录
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 完成上述步骤后，执行以下命令测试：
echo    ssh -i 123456 ubuntu@175.27.250.155 "echo '连接成功'"
echo.
echo 或者不指定密钥文件（如果添加到SSH agent）：
echo    ssh ubuntu@175.27.250.155 "echo '连接成功'"
echo.
echo.

echo 💡 提示：如果您已经可以SSH登录，可以直接运行：
echo    一键部署.bat
echo.
pause



































