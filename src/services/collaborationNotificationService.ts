// src/services/collaborationNotificationService.ts
/**
 * 协作系统实时通知服务
 * 
 * 基于 SSE + Redis Pub/Sub 实现：
 * - 任务状态变更通知
 * - 团队消息广播
 * - 成员在线状态
 * - 导演指令下发
 */

import { sseService } from './sseService';
import { redisService } from './redisService';
import { PrismaClient, NotificationType } from '@prisma/client';

const prisma = new PrismaClient();

// 协作事件类型
export enum CollabEventType {
  // 任务相关
  TASK_CREATED = 'collab:task:created',
  TASK_ASSIGNED = 'collab:task:assigned',
  TASK_UPDATED = 'collab:task:updated',
  TASK_SUBMITTED = 'collab:task:submitted',
  TASK_REVIEWED = 'collab:task:reviewed',
  TASK_COMMENTED = 'collab:task:commented',
  
  // 项目相关
  PROJECT_UPDATED = 'collab:project:updated',
  PROJECT_PROGRESS = 'collab:project:progress',
  
  // 团队相关
  TEAM_MEMBER_JOINED = 'collab:team:member_joined',
  TEAM_MEMBER_LEFT = 'collab:team:member_left',
  TEAM_MESSAGE = 'collab:team:message',
  
  // 资源生成相关
  RESOURCE_GENERATING = 'collab:resource:generating',
  RESOURCE_GENERATED = 'collab:resource:generated',
  RESOURCE_CONFIRMED = 'collab:resource:confirmed',
  
  // 导演指令
  DIRECTOR_INSTRUCTION = 'collab:director:instruction',
}

// 通知负载
interface CollabNotificationPayload {
  type: CollabEventType;
  teamId: string;
  projectId?: string;
  taskId?: string;
  resourceId?: string;
  resourceType?: 'CHARACTER' | 'SCENE' | 'ITEM';
  actorId: string;
  actorName: string;
  targetUserId?: string;  // 特定用户
  data: Record<string, any>;
  message: string;
  timestamp: number;
}

class CollaborationNotificationService {
  private redisChannel = 'collab:notifications';
  private isSubscribed = false;

  constructor() {
    this.initRedisSubscription();
  }

  /**
   * 初始化 Redis 订阅（用于跨实例消息广播）
   */
  private async initRedisSubscription() {
    try {
      // 订阅协作通知频道
      await redisService.subscribe(this.redisChannel, (message) => {
        try {
          const payload: CollabNotificationPayload = JSON.parse(message);
          this.handleNotification(payload);
        } catch (error) {
          console.error('[CollabNotify] ❌ 解析消息失败:', error);
        }
      });
      this.isSubscribed = true;
      console.log('[CollabNotify] ✅ Redis 订阅已启动');
    } catch (error) {
      console.error('[CollabNotify] ❌ Redis 订阅失败:', error);
    }
  }

  /**
   * 处理通知消息，推送给相关用户
   */
  private async handleNotification(payload: CollabNotificationPayload) {
    const { teamId, targetUserId, type } = payload;

    // 如果有特定目标用户，只推送给该用户
    if (targetUserId) {
      this.pushToUser(targetUserId, payload);
      return;
    }

    // 否则推送给团队所有在线成员
    try {
      const teamMembers = await prisma.teamMember.findMany({
        where: { teamId, status: 'ACTIVE' },
        select: { userId: true },
      });

      for (const member of teamMembers) {
        this.pushToUser(member.userId, payload);
      }

      console.log(`[CollabNotify] 📤 已推送 ${type} 给 ${teamMembers.length} 个成员`);
    } catch (error) {
      console.error('[CollabNotify] ❌ 获取团队成员失败:', error);
    }
  }

  /**
   * 推送给单个用户
   */
  private pushToUser(userId: string, payload: CollabNotificationPayload) {
    const data = JSON.stringify({
      type: 'collabNotification',
      timestamp: Date.now(),
      payload,
    });

    // 使用 SSE 服务推送
    const sessions = (sseService as any).userSessions?.get(userId);
    if (sessions && sessions.size > 0) {
      sessions.forEach((sessionId: string) => {
        const connection = (sseService as any).connections?.get(sessionId);
        if (connection) {
          try {
            connection.res.write(`data: ${data}\n\n`);
            connection.res.flush?.();
          } catch (error) {
            console.error(`[CollabNotify] ❌ 推送失败 (${sessionId}):`, error);
          }
        }
      });
    }
  }

  /**
   * 发送协作通知（通过 Redis Pub/Sub 广播）
   */
  async notify(payload: Omit<CollabNotificationPayload, 'timestamp'>) {
    const fullPayload: CollabNotificationPayload = {
      ...payload,
      timestamp: Date.now(),
    };

    // 发布到 Redis 频道
    try {
      await redisService.publish(this.redisChannel, JSON.stringify(fullPayload));
      console.log(`[CollabNotify] 📢 已发布 ${payload.type}`);
    } catch (error) {
      console.error('[CollabNotify] ❌ Redis 发布失败:', error);
      // 降级：直接处理
      this.handleNotification(fullPayload);
    }

    // 存储到数据库（持久化通知）
    await this.saveNotification(fullPayload);
  }

  /**
   * 保存通知到数据库
   */
  private async saveNotification(payload: CollabNotificationPayload) {
    try {
      // 确定通知类型
      let notificationType: NotificationType = NotificationType.SYSTEM;
      switch (payload.type) {
        case CollabEventType.TASK_ASSIGNED:
          notificationType = NotificationType.TASK_ASSIGNED;
          break;
        case CollabEventType.TASK_SUBMITTED:
          notificationType = NotificationType.TASK_SUBMITTED;
          break;
        case CollabEventType.TASK_REVIEWED:
          notificationType = NotificationType.TASK_REVIEWED;
          break;
        case CollabEventType.TASK_COMMENTED:
          notificationType = NotificationType.TASK_COMMENTED;
          break;
        case CollabEventType.TASK_UPDATED:
          notificationType = NotificationType.TASK_UPDATED;
          break;
        case CollabEventType.PROJECT_UPDATED:
          notificationType = NotificationType.PROJECT_UPDATED;
          break;
        case CollabEventType.TEAM_MEMBER_JOINED:
          notificationType = NotificationType.TEAM_INVITATION;
          break;
      }

      // 获取目标用户列表
      let targetUserIds: string[] = [];
      if (payload.targetUserId) {
        targetUserIds = [payload.targetUserId];
      } else {
        const members = await prisma.teamMember.findMany({
          where: { teamId: payload.teamId, status: 'ACTIVE' },
          select: { userId: true },
        });
        targetUserIds = members.map(m => m.userId);
      }

      // 批量创建通知记录
      await prisma.notification.createMany({
        data: targetUserIds.map(userId => ({
          userId,
          type: notificationType,
          title: this.getNotificationTitle(payload.type),
          content: payload.message,
          entityType: payload.taskId ? 'task' : payload.projectId ? 'project' : 'team',
          entityId: payload.taskId || payload.projectId || payload.teamId,
          senderId: payload.actorId,
        })),
      });
    } catch (error) {
      console.error('[CollabNotify] ❌ 保存通知失败:', error);
    }
  }

  /**
   * 获取通知标题
   */
  private getNotificationTitle(type: CollabEventType): string {
    const titles: Record<CollabEventType, string> = {
      [CollabEventType.TASK_CREATED]: '新任务创建',
      [CollabEventType.TASK_ASSIGNED]: '任务分配',
      [CollabEventType.TASK_UPDATED]: '任务更新',
      [CollabEventType.TASK_SUBMITTED]: '任务提交',
      [CollabEventType.TASK_REVIEWED]: '任务审核',
      [CollabEventType.TASK_COMMENTED]: '新评论',
      [CollabEventType.PROJECT_UPDATED]: '项目更新',
      [CollabEventType.PROJECT_PROGRESS]: '项目进度',
      [CollabEventType.TEAM_MEMBER_JOINED]: '新成员加入',
      [CollabEventType.TEAM_MEMBER_LEFT]: '成员离开',
      [CollabEventType.TEAM_MESSAGE]: '团队消息',
      [CollabEventType.RESOURCE_GENERATING]: '资源生成中',
      [CollabEventType.RESOURCE_GENERATED]: '资源生成完成',
      [CollabEventType.RESOURCE_CONFIRMED]: '资源已确认',
      [CollabEventType.DIRECTOR_INSTRUCTION]: '导演指令',
    };
    return titles[type] || '系统通知';
  }

  // ==================== 便捷方法 ====================

  /**
   * 任务被分配
   */
  async notifyTaskAssigned(
    teamId: string,
    taskId: string,
    taskTitle: string,
    assigneeId: string,
    actorId: string,
    actorName: string
  ) {
    await this.notify({
      type: CollabEventType.TASK_ASSIGNED,
      teamId,
      taskId,
      targetUserId: assigneeId,
      actorId,
      actorName,
      data: { taskTitle },
      message: `${actorName} 将任务「${taskTitle}」分配给了你`,
    });
  }

  /**
   * 任务被提交
   */
  async notifyTaskSubmitted(
    teamId: string,
    taskId: string,
    taskTitle: string,
    submitterId: string,
    submitterName: string,
    directorId: string
  ) {
    await this.notify({
      type: CollabEventType.TASK_SUBMITTED,
      teamId,
      taskId,
      targetUserId: directorId,
      actorId: submitterId,
      actorName: submitterName,
      data: { taskTitle },
      message: `${submitterName} 提交了任务「${taskTitle}」，等待审核`,
    });
  }

  /**
   * 任务被审核
   */
  async notifyTaskReviewed(
    teamId: string,
    taskId: string,
    taskTitle: string,
    assigneeId: string,
    reviewerId: string,
    reviewerName: string,
    approved: boolean,
    comment?: string
  ) {
    await this.notify({
      type: CollabEventType.TASK_REVIEWED,
      teamId,
      taskId,
      targetUserId: assigneeId,
      actorId: reviewerId,
      actorName: reviewerName,
      data: { taskTitle, approved, comment },
      message: approved 
        ? `${reviewerName} 已批准任务「${taskTitle}」` 
        : `${reviewerName} 驳回了任务「${taskTitle}」${comment ? '：' + comment : ''}`,
    });
  }

  /**
   * 新评论
   */
  async notifyTaskCommented(
    teamId: string,
    taskId: string,
    taskTitle: string,
    commenterId: string,
    commenterName: string,
    commentContent: string
  ) {
    await this.notify({
      type: CollabEventType.TASK_COMMENTED,
      teamId,
      taskId,
      actorId: commenterId,
      actorName: commenterName,
      data: { taskTitle, commentContent },
      message: `${commenterName} 在任务「${taskTitle}」中发表了评论`,
    });
  }

  /**
   * 导演指令
   */
  async notifyDirectorInstruction(
    teamId: string,
    targetUserId: string,
    directorId: string,
    directorName: string,
    instruction: string
  ) {
    await this.notify({
      type: CollabEventType.DIRECTOR_INSTRUCTION,
      teamId,
      targetUserId,
      actorId: directorId,
      actorName: directorName,
      data: { instruction },
      message: `导演 ${directorName} 给你发送了指令：${instruction}`,
    });
  }

  /**
   * 资源生成完成
   */
  async notifyResourceGenerated(
    teamId: string,
    resourceId: string,
    resourceType: 'CHARACTER' | 'SCENE' | 'ITEM',
    resourceName: string,
    actorId: string,
    actorName: string
  ) {
    const typeNames = {
      CHARACTER: '角色',
      SCENE: '场景',
      ITEM: '物品',
    };
    
    await this.notify({
      type: CollabEventType.RESOURCE_GENERATED,
      teamId,
      resourceId,
      resourceType,
      actorId,
      actorName,
      data: { resourceName, resourceType },
      message: `${typeNames[resourceType]}「${resourceName}」生成完成，请确认`,
    });
  }
}

export const collaborationNotificationService = new CollaborationNotificationService();

