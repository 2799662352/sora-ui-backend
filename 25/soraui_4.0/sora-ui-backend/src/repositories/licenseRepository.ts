// src/repositories/licenseRepository.ts
// 许可证数据访问层

import { License, LicenseType, Prisma } from '@prisma/client';
import { db } from '../loaders/prisma';
import crypto from 'crypto';

/**
 * 许可证仓储
 */
export class LicenseRepository {
  /**
   * 生成许可证密钥
   */
  private generateLicenseKey(type: LicenseType): string {
    const prefix = {
      [LicenseType.TRIAL]: 'TRIAL',
      [LicenseType.PRO]: 'PRO',
      [LicenseType.ENTERPRISE]: 'ENT',
    }[type];

    const randomPart = crypto.randomBytes(12).toString('hex').toUpperCase();
    return `${prefix}-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}-${randomPart.slice(8, 12)}`;
  }

  /**
   * 创建许可证
   */
  async create(data: {
    type: LicenseType;
    expiresAt?: Date;
    features?: any;
  }): Promise<License> {
    const licenseKey = this.generateLicenseKey(data.type);

    return db.license.create({
      data: {
        licenseKey,
        type: data.type,
        expiresAt: data.expiresAt,
        features: data.features || {},
      },
    });
  }

  /**
   * 根据密钥查找
   */
  async findByKey(licenseKey: string): Promise<License | null> {
    return db.license.findUnique({
      where: { licenseKey },
      include: {
        user: true,
      },
    });
  }

  /**
   * 根据用户ID查找
   */
  async findByUserId(userId: string): Promise<License | null> {
    return db.license.findUnique({
      where: { userId },
    });
  }

  /**
   * 激活许可证
   */
  async activate(
    licenseKey: string,
    userId: string,
    deviceId: string
  ): Promise<License> {
    return db.license.update({
      where: { licenseKey },
      data: {
        userId,
        deviceId,
        isActive: true,
        activatedAt: new Date(),
      },
    });
  }

  /**
   * 更新许可证
   */
  async update(
    licenseKey: string,
    data: Prisma.LicenseUpdateInput
  ): Promise<License> {
    return db.license.update({
      where: { licenseKey },
      data,
    });
  }

  /**
   * 获取所有许可证（管理员功能）
   */
  async findAll(options?: {
    skip?: number;
    take?: number;
    type?: LicenseType;
    isActive?: boolean;
  }): Promise<{ licenses: License[]; total: number }> {
    const where: Prisma.LicenseWhereInput = {
      ...(options?.type && { type: options.type }),
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
    };

    const [licenses, total] = await Promise.all([
      db.license.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      db.license.count({ where }),
    ]);

    return { licenses, total };
  }

  /**
   * 统计许可证数量
   */
  async count(where?: Prisma.LicenseWhereInput): Promise<number> {
    return db.license.count({ where });
  }

  /**
   * 检查许可证是否过期
   */
  isExpired(license: License): boolean {
    if (!license.expiresAt) return false;
    return new Date() > license.expiresAt;
  }

  /**
   * 停用许可证
   */
  async deactivate(licenseKey: string): Promise<License> {
    return db.license.update({
      where: { licenseKey },
      data: {
        isActive: false,
      },
    });
  }
}

// 导出单例
export const licenseRepository = new LicenseRepository();

