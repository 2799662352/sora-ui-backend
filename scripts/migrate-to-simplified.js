// scripts/migrate-to-simplified.js
// 🔥 执行数据库迁移到精简版

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function migrate() {
  console.log('🔄 开始数据库迁移到精简版...\n');

  try {
    // 1. 连接数据库
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');

    // 2. 检查当前数据
    const currentCount = await prisma.videoTask.count();
    console.log(`📊 当前任务数量: ${currentCount}\n`);

    if (currentCount === 0) {
      console.log('⚠️ 数据库为空，无需迁移');
      return;
    }

    // 3. 读取迁移脚本
    const sqlPath = path.join(__dirname, '..', 'migrate-to-simplified.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 SQL 脚本已加载\n');

    // 4. 执行迁移（使用事务）
    console.log('🔄 执行迁移...\n');
    
    await prisma.$executeRawUnsafe(sql);
    
    console.log('✅ 迁移执行完成\n');

    // 5. 验证结果
    console.log('🔍 验证迁移结果...\n');
    
    const newCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "VideoTask"
    `;
    
    console.log('迁移结果:');
    console.log(`  - 原任务数: ${currentCount}`);
    console.log(`  - 新任务数: ${newCount[0].count}`);
    
    if (currentCount !== parseInt(newCount[0].count)) {
      throw new Error('⚠️ 数据迁移后记录数不匹配！');
    }

    console.log('\n✅ 验证通过！数据迁移成功！');
    console.log('\n📌 下一步：');
    console.log('  1. 运行: cp prisma/schema-simplified.prisma prisma/schema.prisma');
    console.log('  2. 运行: npx prisma generate');
    console.log('  3. 重启后端服务');

  } catch (error) {
    console.error('\n❌ 迁移失败:', error);
    console.error('\n回滚建议：');
    console.error('  DROP TABLE IF EXISTS "VideoTask";');
    console.error('  ALTER TABLE "VideoTask_backup_20251115" RENAME TO "VideoTask";');
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('\n👋 数据库连接已关闭');
  }
}

// 执行迁移
migrate()
  .then(() => {
    console.log('\n🎉 迁移流程完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 迁移失败:', error);
    process.exit(1);
  });

