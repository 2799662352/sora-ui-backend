
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// 配置
const API_BASE = 'http://localhost:3001';
const USERNAME = 'remix_tester_' + Date.now();
const PASSWORD = 'Test123456';
// 🔥 真实的外部任务 ID (由用户提供)
const REAL_EXTERNAL_ID = 'video_a90228d8-d776-4a1a-a1f0-2421e9971100';

const prisma = new PrismaClient();

async function main() {
  let createdUser = null;
  try {
    console.log('🚀 开始 Remix 功能真实集成测试 (使用真实 ExternalID)...');

    // 0. 创建临时测试用户
    console.log('\n0️⃣  创建临时测试用户...');
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    createdUser = await prisma.user.create({
      data: {
        username: USERNAME,
        password: hashedPassword,
        email: `${USERNAME}@example.com`,
        role: 'USER',
        isActive: true
      }
    });
    console.log(`✅ 用户已创建: ${USERNAME}`);

    // 1. 登录获取 Token
    console.log('\n1️⃣  正在登录...');
    const loginRes = await axios.post(`${API_BASE}/api/auth/login`, {
      username: USERNAME,
      password: PASSWORD
    });
    const token = loginRes.data.data.token;
    const userId = loginRes.data.data.user.id;
    console.log('✅ 登录成功，获取到 Token');

    // 1.5 创建一个关联真实外部ID的原任务
    console.log(`\n1️⃣.5️⃣  插入关联真实ID的原任务...`);
    console.log(`      External ID: ${REAL_EXTERNAL_ID}`);
    
    const originalVideoId = `video_real_${Date.now()}`;
    
    await prisma.videoTask.create({
      data: {
        videoId: originalVideoId,
        externalTaskId: REAL_EXTERNAL_ID, // 🔥 使用真实 ID
        userId: userId,
        status: 'COMPLETED',
        progress: 100,
        model: 'sora_video2',
        prompt: 'Original prompt placeholder',
        apiConfigId: 'backend-api'
      }
    });
    console.log(`✅ 任务已插入: ${originalVideoId}`);

    // 3. 发起 Remix 请求
    console.log('\n3️⃣  发起 Remix 请求 (真实调用)...');
    const remixPrompt = "Make it cyberpunk style"; // 简单的 Prompt
    
    try {
      const remixRes = await axios.post(
        `${API_BASE}/api/video/tasks/${originalVideoId}/remix`,
        {
          prompt: remixPrompt,
          model: 'sora_video2'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      console.log('✅ Remix 请求提交成功！');
      console.log('   - Response Data:', JSON.stringify(remixRes.data.data, null, 2));
      
      const newVideoId = remixRes.data.data.videoId;
      const newExternalId = remixRes.data.data.externalTaskId;
      
      console.log(`\n✨ [SUCCESS] 新任务创建成功:`);
      console.log(`   - Video ID: ${newVideoId}`);
      console.log(`   - New External ID: ${newExternalId}`);
      console.log('   - 状态: PROCESSING');

    } catch (apiError) {
      console.error('❌ Remix 请求失败:');
      if (apiError.response) {
        console.error('   - Status:', apiError.response.status);
        console.error('   - Data:', JSON.stringify(apiError.response.data, null, 2));
      } else {
        console.error('   - Error:', apiError.message);
      }
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  } finally {
    // 清理
    if (createdUser) {
      console.log('\n🧹 清理测试数据...');
      await prisma.user.delete({ where: { id: createdUser.id } });
      console.log('✅ 测试用户及其任务已删除');
    }
    await prisma.$disconnect();
  }
}

main();
