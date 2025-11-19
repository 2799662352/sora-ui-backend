// 测试创建视频任务的脚本
const axios = require('axios');

async function test() {
  try {
    // 1. 登录
    console.log('1. 登录...');
    const loginRes = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'testuser',
      password: 'Test123456!'
    });
    const token = loginRes.data.data.token;
    console.log(`✅ 登录成功，Token: ${token.substring(0, 30)}...`);

    // 2. 创建任务
    console.log('\n2. 创建视频任务...');
    const taskRes = await axios.post(
      'http://localhost:3001/api/video/tasks',
      {
        prompt: '一只可爱的小猫',
        model: 'sora_video2',
        duration: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ 任务创建成功!');
    console.log(JSON.stringify(taskRes.data, null, 2));
    
  } catch (error) {
    console.error('❌ 错误发生:');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('响应头:', error.response.headers);
    } else if (error.request) {
      console.error('请求已发送但未收到响应');
      console.error(error.request);
    } else {
      console.error('错误信息:', error.message);
    }
    console.error('完整错误:', error);
  }
}

test();

