// src/services/licenseService.ts
// 许可证服务 - 生成、验证、激活许可证

import crypto from 'crypto';
import { License, LicenseType, Feature } from '../types';
import { db } from '../storage/inMemoryDB';

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'default-license-secret';

export class LicenseService {
  /**
   * 生成许可证密钥
   */
  generateLicenseKey(type: LicenseType, durationDays?: number): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // 格式：SORA-{TYPE}-{RANDOM}-{TIMESTAMP}
    const baseKey = `SORA-${type.toUpperCase()}-${random}-${timestamp}`;
    
    // 生成签名（HMAC-SHA256）
    const signature = this.signLicenseKey(baseKey);
    
    const fullKey = `${baseKey}-${signature}`;
    
    console.log(`🔑 生成许可证: ${fullKey.substring(0, 30)}...`);
    return fullKey;
  }

  /**
   * 签名许可证密钥
   */
  private signLicenseKey(key: string): string {
    return crypto
      .createHmac('sha256', LICENSE_SECRET)
      .update(key)
      .digest('hex')
      .substring(0, 8)
      .toUpperCase();
  }

  /**
   * 验证许可证密钥格式和签名
   */
  private validateKeyFormat(licenseKey: string): boolean {
    try {
      const parts = licenseKey.split('-');
      if (parts.length < 5) return false;

      const signature = parts[parts.length - 1];
      const keyWithoutSignature = parts.slice(0, -1).join('-');

      // 验证签名
      const expectedSignature = this.signLicenseKey(keyWithoutSignature);
      return signature === expectedSignature;
    } catch (error) {
      return false;
    }
  }

  /**
   * 验证许可证（检查格式、数据库、过期时间）
   */
  async validateLicense(licenseKey: string): Promise<{
    isValid: boolean;
    licenseType?: LicenseType;
    expiresAt?: number;
    features?: Feature[];
    message?: string;
  }> {
    try {
      // 1. 验证格式和签名
      if (!this.validateKeyFormat(licenseKey)) {
        return { 
          isValid: false,
          message: '许可证格式无效或签名验证失败',
        };
      }

      // 2. 从数据库查询
      const license = await db.findLicenseByKey(licenseKey);

      if (!license) {
        return { 
          isValid: false,
          message: '许可证不存在',
        };
      }

      // 3. 检查是否过期
      if (license.expiresAt && license.expiresAt < Date.now()) {
        return { 
          isValid: false,
          licenseType: license.type,
          expiresAt: license.expiresAt,
          message: '许可证已过期',
        };
      }

      return {
        isValid: true,
        licenseType: license.type,
        expiresAt: license.expiresAt,
        features: license.features,
      };
    } catch (error: any) {
      console.error('验证许可证失败:', error);
      return { 
        isValid: false,
        message: error.message || '验证失败',
      };
    }
  }

  /**
   * 激活许可证（绑定到用户）
   */
  async activateLicense(licenseKey: string, userId: string): Promise<License> {
    // 1. 验证许可证
    const validation = await this.validateLicense(licenseKey);
    if (!validation.isValid) {
      throw new Error(validation.message || '许可证无效');
    }

    // 2. 获取许可证
    const license = await db.findLicenseByKey(licenseKey);
    if (!license) {
      throw new Error('许可证不存在');
    }

    // 3. 检查是否已被其他用户激活
    if (license.userId && license.userId !== userId) {
      throw new Error('许可证已被其他用户激活');
    }

    // 4. 绑定用户
    const updatedLicense = await db.updateLicense(licenseKey, {
      userId,
      activatedAt: Date.now(),
    });

    if (!updatedLicense) {
      throw new Error('激活失败');
    }

    console.log(`✅ 许可证激活成功: ${licenseKey} -> 用户 ${userId}`);
    return updatedLicense;
  }

  /**
   * 获取用户许可证信息
   */
  async getUserLicense(userId: string): Promise<License | null> {
    return await db.findLicenseByUserId(userId);
  }

  /**
   * 创建许可证（管理员功能）
   */
  async createLicense(
    type: LicenseType,
    durationDays?: number
  ): Promise<License> {
    const licenseKey = this.generateLicenseKey(type, durationDays);
    
    const features = this.getFeaturesForType(type);
    const expiresAt = durationDays 
      ? Date.now() + durationDays * 24 * 60 * 60 * 1000
      : undefined;

    const license: License = {
      id: crypto.randomUUID(),
      licenseKey,
      type,
      features,
      expiresAt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.createLicense(license);

    console.log(`✅ 许可证创建成功: ${licenseKey}`);
    return license;
  }

  /**
   * 获取许可证类型对应的功能列表
   */
  private getFeaturesForType(type: LicenseType): Feature[] {
    const featureMap: Record<LicenseType, Feature[]> = {
      [LicenseType.TRIAL]: [
        Feature.BASIC_GENERATION,
        Feature.ADVANCED_FEATURES,
      ],
      [LicenseType.PRO]: [
        Feature.BASIC_GENERATION,
        Feature.ADVANCED_FEATURES,
        Feature.BATCH_PROCESSING,
      ],
      [LicenseType.ENTERPRISE]: [
        Feature.BASIC_GENERATION,
        Feature.ADVANCED_FEATURES,
        Feature.BATCH_PROCESSING,
        Feature.PRIORITY_SUPPORT,
        Feature.CUSTOM_BRANDING,
      ],
    };

    return featureMap[type] || [];
  }
}

export const licenseService = new LicenseService();

