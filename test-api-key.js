// test-api-key.js
// 测试 API 密钥接口

const axios = require('axios');

async function testAPIKeyService() {
  console.log('🔍 测试 API 密钥服务...\n');

  try {
    // 1. 登录获取 token
    console.log('1️⃣ 登录...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });

    const token = loginResponse.data.data.token;
    console.log('✅ 登录成功，token:', token.substring(0, 20) + '...\n');

    // 2. 测试获取 API 配置列表
    console.log('2️⃣ 获取 API 配置列表...');
    const configsResponse = await axios.get('http://localhost:3001/api/api-configs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ API 配置列表:');
    console.log(JSON.stringify(configsResponse.data, null, 2));
    console.log('');

    // 3. 测试获取 API 密钥
    console.log('3️⃣ 获取 API 密钥...');
    const keyResponse = await axios.get('http://localhost:3001/api/api-key', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ API 密钥响应:');
    const config = keyResponse.data.config;
    console.log(`  - ID: ${config.id}`);
    console.log(`  - Name: ${config.name}`);
    console.log(`  - BaseURL: ${config.baseUrl}`);
    console.log(`  - ApiKey: ${config.apiKey.substring(0, 10)}...`);
    console.log(`  - Model: ${config.model}`);
    console.log('');

    // 4. 测试创建任务映射
    console.log('4️⃣ 测试创建任务映射...');
    const mappingResponse = await axios.post('http://localhost:3001/api/video/mapping', {
      videoId: `video_test_${Date.now()}`,
      externalTaskId: `ext_test_${Date.now()}`,
      apiConfigId: config.id,
      model: config.model,
      promptHash: 'test_hash_123',
      promptPreview: '测试任务 - 验证映射功能',
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ 任务映射创建成功:');
    console.log(JSON.stringify(mappingResponse.data, null, 2));
    console.log('');

    // 5. 测试查询任务状态
    const videoId = mappingResponse.data.videoId;
    console.log('5️⃣ 查询任务状态...');
    const statusResponse = await axios.get(
      `http://localhost:3001/api/video/${videoId}/status`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    console.log('✅ 任务状态:');
    console.log(JSON.stringify(statusResponse.data, null, 2));
    console.log('');

    // 6. 测试任务列表
    console.log('6️⃣ 获取任务列表...');
    const listResponse = await axios.get(
      'http://localhost:3001/api/video/list?page=1&limit=5',
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    console.log('✅ 任务列表（前5条）:');
    console.log(`  - 总数: ${listResponse.data.pagination.total}`);
    console.log(`  - 当前页: ${listResponse.data.tasks.length} 条`);
    listResponse.data.tasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.videoId} - ${task.status} (${task.progress}%)`);
    });

    console.log('\n🎉 所有测试通过！API 密钥服务正常工作！');

  } catch (error) {
    if (error.response) {
      console.error('❌ API 错误:', error.response.status, error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ 连接被拒绝：后端服务器可能未启动');
      console.error('   请运行: npm run dev');
    } else {
      console.error('❌ 测试失败:', error.message);
    }
  }
}

// 运行测试
testAPIKeyService();

