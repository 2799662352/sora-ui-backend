#!/bin/bash

# 设置远程仓库
git remote add origin https://github.com/2799662352/sora-ui-backend.git

# 设置主分支为 main
git branch -M main

# 推送到 GitHub
git push -u origin main

echo "✅ 代码已推送到 GitHub!"
echo "🔗 仓库地址: https://github.com/2799662352/sora-ui-backend"

