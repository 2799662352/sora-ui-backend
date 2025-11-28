/**
 * 🧪 测试参考图生成视频功能
 * 
 * 使用方法: node test-reference-image.js
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function main() {
  try {
    console.log('🧪 开始测试参考图生成视频功能...\n');

    // 1️⃣ 登录获取 token
    console.log('1️⃣ 登录获取 token...');
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginRes.data.data?.token;
    if (!token) {
      console.error('❌ 登录失败:', loginRes.data);
      return;
    }
    console.log('✅ 登录成功，获取 token:', token.substring(0, 20) + '...\n');

    // 2️⃣ 准备测试图片
    console.log('2️⃣ 准备测试图片...');
    const imagePath = path.resolve('D:/tecx/text/素材/第52话拼图(334KB).jpg');
    
    if (!fs.existsSync(imagePath)) {
      console.error('❌ 测试图片不存在:', imagePath);
      return;
    }
    
    const imageBuffer = fs.readFileSync(imagePath);
    const imageStats = fs.statSync(imagePath);
    console.log('✅ 图片已加载:', imagePath);
    console.log('   - 文件大小:', (imageStats.size / 1024).toFixed(2), 'KB\n');

    // 3️⃣ 构建 FormData
    console.log('3️⃣ 构建 FormData 请求...');
    const formData = new FormData();
    formData.append('prompt', '参考配图，使得动物们活跃起来，动态效果');
    formData.append('model', 'sora_video2');
    formData.append('size', '1280x720');
    formData.append('seconds', '5');
    formData.append('input_reference', imageBuffer, {
      filename: '第52话拼图.jpg',
      contentType: 'image/jpeg',
    });

    console.log('   - prompt: 参考配图，使得动物们活跃起来，动态效果');
    console.log('   - model: sora_video2');
    console.log('   - size: 1280x720');
    console.log('   - seconds: 5');
    console.log('   - input_reference: 第52话拼图.jpg\n');

    // 4️⃣ 调用 API
    console.log('4️⃣ 调用视频生成 API...');
    console.log('   URL:', `${BASE_URL}/api/relay/sora/videos`);
    
    const startTime = Date.now();
    
    const response = await axios.post(
      `${BASE_URL}/api/relay/sora/videos`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...formData.getHeaders(),
        },
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    
    const requestTime = Date.now() - startTime;
    
    console.log('\n✅ API 调用成功！');
    console.log('   - 耗时:', requestTime, 'ms');
    console.log('   - 响应:', JSON.stringify(response.data, null, 2));
    
    // 5️⃣ 输出任务信息
    if (response.data.success) {
      console.log('\n📋 任务信息:');
      console.log('   - videoId:', response.data.data?.videoId);
      console.log('   - externalTaskId:', response.data.data?.externalTaskId);
      console.log('   - status:', response.data.data?.status);
      console.log('\n🎉 测试完成！任务已提交，后端将自动轮询并通过 SSE 推送更新');
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   - 状态码:', error.response.status);
      console.error('   - 响应:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.code === 'ECONNREFUSED') {
      console.error('   - 后端服务未启动，请检查 docker-compose 状态');
    }
  }
}

main();


