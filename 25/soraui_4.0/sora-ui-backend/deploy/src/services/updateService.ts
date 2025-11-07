// src/services/updateService.ts
// 自动更新服务 - 版本管理和文件下载

import fs from 'fs/promises';
import path from 'path';
import { UpdateInfo } from '../types';

const UPDATES_DIR = process.env.UPDATES_DIR || path.join(__dirname, '../../updates');

export class UpdateService {
  /**
   * 获取最新版本信息
   */
  async getLatestVersion(
    currentVersion: string,
    platform: 'win32' | 'darwin' | 'linux'
  ): Promise<UpdateInfo | null> {
    try {
      // 读取对应平台的 latest.yml 文件
      const ymlFile = this.getYmlFileName(platform);
      const ymlPath = path.join(UPDATES_DIR, ymlFile);

      // 检查文件是否存在
      try {
        await fs.access(ymlPath);
      } catch {
        console.warn(`⚠️  更新配置文件不存在: ${ymlPath}`);
        return null;
      }

      // 读取并解析 YAML
      const content = await fs.readFile(ymlPath, 'utf-8');
      const updateInfo = this.parseYaml(content);

      // 比较版本号
      if (this.compareVersions(updateInfo.version, currentVersion) <= 0) {
        console.log(`✅ 当前版本 ${currentVersion} 已是最新`);
        return null;
      }

      console.log(`🆕 发现新版本: ${updateInfo.version} (当前: ${currentVersion})`);
      return updateInfo;
    } catch (error: any) {
      console.error('获取更新信息失败:', error);
      return null;
    }
  }

  /**
   * 获取更新文件
   */
  async getUpdateFile(version: string, platform: string): Promise<Buffer> {
    const fileName = this.getUpdateFileName(version, platform);
    const filePath = path.join(UPDATES_DIR, version, fileName);

    try {
      const file = await fs.readFile(filePath);
      console.log(`📦 读取更新文件: ${fileName} (${file.length} bytes)`);
      return file;
    } catch (error) {
      throw new Error(`更新文件不存在: ${fileName}`);
    }
  }

  /**
   * 比较版本号
   * 返回: 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }

    return 0;
  }

  /**
   * 获取 YAML 文件名
   */
  private getYmlFileName(platform: string): string {
    switch (platform) {
      case 'win32':
        return 'latest.yml';
      case 'darwin':
        return 'latest-mac.yml';
      case 'linux':
        return 'latest-linux.yml';
      default:
        return 'latest.yml';
    }
  }

  /**
   * 获取更新文件名
   */
  private getUpdateFileName(version: string, platform: string): string {
    switch (platform) {
      case 'win32':
        return `Sora UI Setup ${version}.exe`;
      case 'darwin':
        return `Sora UI-${version}-mac.dmg`;
      case 'linux':
        return `Sora UI-${version}.AppImage`;
      default:
        throw new Error(`不支持的平台: ${platform}`);
    }
  }

  /**
   * 简单的 YAML 解析（仅支持基本格式）
   */
  private parseYaml(content: string): UpdateInfo {
    const lines = content.split('\n');
    const data: any = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        data[key] = value.trim();
      }
    }

    return {
      version: data.version || '1.0.0',
      releaseNotes: data.releaseNotes || '',
      releaseDate: data.releaseDate || new Date().toISOString().split('T')[0],
      downloadUrl: {
        win32: data.path || '',
        darwin: data.path || '',
        linux: data.path || '',
      },
      mandatory: data.mandatory === 'true',
    };
  }
}

export const updateService = new UpdateService();

