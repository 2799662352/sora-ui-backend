// src/storage/inMemoryDB.ts
// 内存数据库（简化版，生产环境建议使用 PostgreSQL）

import { User, License, LicenseType, Feature } from '../types';
import bcrypt from 'bcrypt';
import { licenseService } from '../services/licenseService';

class InMemoryDB {
  private users: Map<string, User> = new Map();
  private licenses: Map<string, License> = new Map();
  private usersByUsername: Map<string, User> = new Map();
  private licensesByUser: Map<string, License> = new Map();

  // ============ 用户管理 ============

  async createUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    this.usersByUsername.set(user.username, user);
    return user;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findUserByUsername(username: string): Promise<User | null> {
    return this.usersByUsername.get(username) || null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: Date.now(),
    };

    this.users.set(id, updatedUser);
    if (updates.username) {
      this.usersByUsername.delete(user.username);
      this.usersByUsername.set(updatedUser.username, updatedUser);
    }

    return updatedUser;
  }

  // ============ 许可证管理 ============

  async createLicense(license: License): Promise<License> {
    this.licenses.set(license.licenseKey, license);
    return license;
  }

  async findLicenseByKey(licenseKey: string): Promise<License | null> {
    return this.licenses.get(licenseKey) || null;
  }

  async findLicenseByUserId(userId: string): Promise<License | null> {
    return this.licensesByUser.get(userId) || null;
  }

  async updateLicense(
    licenseKey: string,
    updates: Partial<License>
  ): Promise<License | null> {
    const license = this.licenses.get(licenseKey);
    if (!license) return null;

    const updatedLicense = {
      ...license,
      ...updates,
      updatedAt: Date.now(),
    };

    this.licenses.set(licenseKey, updatedLicense);

    // 更新用户许可证映射
    if (updatedLicense.userId) {
      this.licensesByUser.set(updatedLicense.userId, updatedLicense);
    }

    return updatedLicense;
  }

  // ============ 演示数据初始化 ============

  async initializeDemoData(): Promise<void> {
    console.log('');
    console.log('🔧 初始化演示数据...');

    try {
      // 1. 创建演示用户
      const demoUser: User = {
        id: 'demo-user-001',
        username: 'admin',
        email: 'admin@soraui.com',
        password: await bcrypt.hash('admin123', 10),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.createUser(demoUser);
      console.log('✅ 演示用户创建成功: admin / admin123');

      // 2. 导入 licenseService（延迟导入避免循环依赖）
      const { licenseService: ls } = await import('../services/licenseService');

      // 3. 创建试用版许可证（30天）
      const trialLicense = await ls.createLicense(LicenseType.TRIAL, 30);
      console.log(`✅ 试用版许可证: ${trialLicense.licenseKey}`);

      // 4. 创建专业版许可证（永久）
      const proLicense = await ls.createLicense(LicenseType.PRO);
      console.log(`✅ 专业版许可证: ${proLicense.licenseKey}`);

      // 5. 创建企业版许可证（永久）
      const entLicense = await ls.createLicense(LicenseType.ENTERPRISE);
      console.log(`✅ 企业版许可证: ${entLicense.licenseKey}`);

      console.log('');
      console.log('📋 演示数据总结:');
      console.log(`   - 用户: ${this.users.size} 个`);
      console.log(`   - 许可证: ${this.licenses.size} 个`);
      console.log('');
    } catch (error) {
      console.error('❌ 初始化演示数据失败:', error);
      throw error;
    }
  }
}

export const db = new InMemoryDB();
