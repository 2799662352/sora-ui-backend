// src/services/collaborationService.ts
// 🎬 协作系统服务 - 导演→组员完整流程管理

import { PrismaClient, MemberRole, TeamStatus, MemberStatus, ProjectStatus, TaskItemStatus, ReviewStatus, TaskPriority, TaskType, NotificationType, CommentType } from '@prisma/client';
import { wsService } from './websocket.service';

const prisma = new PrismaClient();

// ============ 团队管理 ============

/**
 * 获取用户的所有团队（作为成员或所有者）
 */
export async function getUserTeams(userId: string) {
  // 获取用户创建的团队
  const ownedTeams = await prisma.team.findMany({
    where: { ownerId: userId, status: { not: TeamStatus.ARCHIVED } },
    include: {
      owner: { select: { id: true, username: true, avatar: true } },
      members: {
        include: { user: { select: { id: true, username: true, avatar: true } } }
      },
      projects: { select: { id: true, name: true, status: true, progress: true } },
      _count: { select: { members: true, projects: true } }
    }
  });

  // 获取用户加入的团队
  const memberTeams = await prisma.team.findMany({
    where: {
      members: { some: { userId, status: MemberStatus.ACTIVE } },
      ownerId: { not: userId },
      status: { not: TeamStatus.ARCHIVED }
    },
    include: {
      owner: { select: { id: true, username: true, avatar: true } },
      members: {
        include: { user: { select: { id: true, username: true, avatar: true } } }
      },
      projects: { select: { id: true, name: true, status: true, progress: true } },
      _count: { select: { members: true, projects: true } }
    }
  });

  return [...ownedTeams, ...memberTeams];
}

/**
 * 创建团队
 */
export async function createTeam(userId: string, data: { name: string; description?: string }) {
  const team = await prisma.team.create({
    data: {
      name: data.name,
      description: data.description,
      ownerId: userId,
      // 自动将创建者添加为导演角色
      members: {
        create: {
          userId,
          role: MemberRole.DIRECTOR,
          status: MemberStatus.ACTIVE
        }
      }
    },
    include: {
      owner: { select: { id: true, username: true, avatar: true } },
      members: {
        include: { user: { select: { id: true, username: true, avatar: true } } }
      }
    }
  });

  return team;
}

/**
 * 获取团队详情
 */
export async function getTeamById(teamId: string, userId: string) {
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, status: MemberStatus.ACTIVE } } }
      ]
    },
    include: {
      owner: { select: { id: true, username: true, avatar: true, email: true } },
      members: {
        include: { user: { select: { id: true, username: true, avatar: true, email: true } } }
      },
      projects: {
        include: {
          _count: { select: { tasks: true } }
        }
      }
    }
  });

  return team;
}

/**
 * 更新团队
 */
export async function updateTeam(teamId: string, userId: string, data: { name?: string; description?: string }) {
  // 检查权限（只有导演可以更新）
  const membership = await checkTeamPermission(teamId, userId, [MemberRole.DIRECTOR]);
  if (!membership) throw new Error('无权限更新团队');

  return prisma.team.update({
    where: { id: teamId },
    data
  });
}

/**
 * 删除团队（归档）
 */
export async function deleteTeam(teamId: string, userId: string) {
  // 检查权限（只有所有者可以删除）
  const team = await prisma.team.findFirst({
    where: { id: teamId, ownerId: userId }
  });
  if (!team) throw new Error('无权限删除团队');

  return prisma.team.update({
    where: { id: teamId },
    data: { status: TeamStatus.ARCHIVED }
  });
}

// ============ 团队成员管理 ============

/**
 * 邀请成员加入团队
 */
export async function inviteMember(teamId: string, inviterId: string, data: { userId: string; role?: MemberRole }) {
  // 检查邀请者权限
  const inviterMembership = await checkTeamPermission(teamId, inviterId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!inviterMembership) throw new Error('无权限邀请成员');

  // 检查被邀请者是否已是成员
  const existingMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: data.userId } }
  });
  if (existingMember) throw new Error('用户已是团队成员');

  const member = await prisma.teamMember.create({
    data: {
      teamId,
      userId: data.userId,
      role: data.role || MemberRole.MEMBER,
      status: MemberStatus.INVITED,
      invitedBy: inviterId
    },
    include: {
      user: { select: { id: true, username: true, avatar: true } }
    }
  });

  // 发送通知
  await createNotification(data.userId, {
    type: NotificationType.TEAM_INVITATION,
    title: '团队邀请',
    content: '您被邀请加入团队',
    entityType: 'team',
    entityId: teamId,
    senderId: inviterId
  });

  return member;
}

/**
 * 接受团队邀请
 */
export async function acceptInvitation(teamId: string, userId: string) {
  return prisma.teamMember.update({
    where: { teamId_userId: { teamId, userId } },
    data: { status: MemberStatus.ACTIVE, joinedAt: new Date() }
  });
}

/**
 * 更新成员角色
 */
export async function updateMemberRole(teamId: string, operatorId: string, memberId: string, newRole: MemberRole) {
  // 检查操作者权限（只有导演可以更改角色）
  const operatorMembership = await checkTeamPermission(teamId, operatorId, [MemberRole.DIRECTOR]);
  if (!operatorMembership) throw new Error('无权限更改成员角色');

  return prisma.teamMember.update({
    where: { id: memberId },
    data: { role: newRole }
  });
}

/**
 * 移除团队成员
 */
export async function removeMember(teamId: string, operatorId: string, memberId: string) {
  // 检查操作者权限
  const operatorMembership = await checkTeamPermission(teamId, operatorId, [MemberRole.DIRECTOR]);
  if (!operatorMembership) throw new Error('无权限移除成员');

  return prisma.teamMember.update({
    where: { id: memberId },
    data: { status: MemberStatus.LEFT }
  });
}

/**
 * 获取团队成员列表
 */
export async function getTeamMembers(teamId: string, userId: string) {
  // 验证用户是否是团队成员
  await checkTeamPermission(teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);

  return prisma.teamMember.findMany({
    where: { teamId, status: { in: [MemberStatus.ACTIVE, MemberStatus.INVITED] } },
    include: {
      user: { select: { id: true, username: true, avatar: true, email: true } }
    },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }]
  });
}

// ============ 项目管理 ============

/**
 * 创建项目
 */
export async function createProject(teamId: string, userId: string, data: {
  name: string;
  description?: string;
  startDate?: Date;
  dueDate?: Date;
  priority?: number;
}) {
  // 检查权限
  const membership = await checkTeamPermission(teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!membership) throw new Error('无权限创建项目');

  return prisma.project.create({
    data: {
      teamId,
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      dueDate: data.dueDate,
      priority: data.priority || 1
    }
  });
}

/**
 * 获取团队的所有项目
 */
export async function getTeamProjects(teamId: string, userId: string) {
  // 验证权限
  await checkTeamPermission(teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);

  return prisma.project.findMany({
    where: { teamId, status: { not: ProjectStatus.CANCELLED } },
    include: {
      _count: { select: { tasks: true } },
      tasks: {
        select: { status: true }
      }
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
  });
}

/**
 * 获取项目详情
 */
export async function getProjectById(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: {
        include: {
          members: {
            where: { status: MemberStatus.ACTIVE },
            include: { user: { select: { id: true, username: true, avatar: true } } }
          }
        }
      },
      tasks: {
        include: {
          assignee: { select: { id: true, username: true, avatar: true } },
          createdBy: { select: { id: true, username: true, avatar: true } },
          _count: { select: { comments: true, attachments: true } }
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
      },
      milestones: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  if (!project) throw new Error('项目不存在');

  // 验证权限
  await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);

  return project;
}

/**
 * 更新项目
 */
export async function updateProject(projectId: string, userId: string, data: {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  startDate?: Date;
  dueDate?: Date;
  priority?: number;
}) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');

  // 检查权限
  const membership = await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!membership) throw new Error('无权限更新项目');

  return prisma.project.update({
    where: { id: projectId },
    data
  });
}

// ============ 任务管理（核心流程） ============

/**
 * 创建任务（导演/组长下发任务）
 */
export async function createTask(projectId: string, userId: string, data: {
  title: string;
  description?: string;
  assigneeId?: string;
  taskType?: TaskType;
  priority?: TaskPriority;
  startDate?: Date;
  dueDate?: Date;
  estimatedHours?: number;
  tags?: string[];
  milestoneId?: string;
}) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');

  // 检查权限（导演/组长可以创建任务）
  const membership = await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!membership) throw new Error('无权限创建任务');

  const task = await prisma.collabTask.create({
    data: {
      projectId,
      createdById: userId,
      title: data.title,
      description: data.description,
      assigneeId: data.assigneeId,
      taskType: data.taskType || TaskType.GENERAL,
      priority: data.priority || TaskPriority.MEDIUM,
      startDate: data.startDate,
      dueDate: data.dueDate,
      estimatedHours: data.estimatedHours,
      tags: data.tags || [],
      milestoneId: data.milestoneId
    },
    include: {
      assignee: { select: { id: true, username: true, avatar: true } },
      createdBy: { select: { id: true, username: true, avatar: true } }
    }
  });

  // 记录历史
  await createTaskHistory(task.id, userId, 'created', null, null, null);

  // 如果分配了执行者，发送通知
  if (data.assigneeId) {
    await createNotification(data.assigneeId, {
      type: NotificationType.TASK_ASSIGNED,
      title: '新任务分配',
      content: `您被分配了新任务：${data.title}`,
      entityType: 'task',
      entityId: task.id,
      senderId: userId
    });
  }

  // 更新项目任务计数
  await updateProjectTaskCount(projectId);

  return task;
}

/**
 * 获取项目的所有任务
 */
export async function getProjectTasks(projectId: string, userId: string, filters?: {
  status?: TaskItemStatus;
  assigneeId?: string;
  priority?: TaskPriority;
}) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');

  // 验证权限
  await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);

  const where: any = { projectId };
  if (filters?.status) where.status = filters.status;
  if (filters?.assigneeId) where.assigneeId = filters.assigneeId;
  if (filters?.priority) where.priority = filters.priority;

  return prisma.collabTask.findMany({
    where,
    include: {
      assignee: { select: { id: true, username: true, avatar: true } },
      createdBy: { select: { id: true, username: true, avatar: true } },
      reviewer: { select: { id: true, username: true, avatar: true } },
      _count: { select: { comments: true, attachments: true } }
    },
    orderBy: [{ sortOrder: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }]
  });
}

/**
 * 获取任务详情
 */
export async function getTaskById(taskId: string, userId: string) {
  const task = await prisma.collabTask.findUnique({
    where: { id: taskId },
    include: {
      project: { include: { team: true } },
      assignee: { select: { id: true, username: true, avatar: true, email: true } },
      createdBy: { select: { id: true, username: true, avatar: true } },
      reviewer: { select: { id: true, username: true, avatar: true } },
      milestone: true,
      comments: {
        include: {
          author: { select: { id: true, username: true, avatar: true } },
          replies: {
            include: {
              author: { select: { id: true, username: true, avatar: true } }
            }
          }
        },
        where: { parentId: null },
        orderBy: { createdAt: 'desc' }
      },
      attachments: {
        include: {
          uploader: { select: { id: true, username: true, avatar: true } }
        },
        orderBy: { createdAt: 'desc' }
      },
      history: {
        include: {
          actor: { select: { id: true, username: true, avatar: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }
    }
  });

  if (!task) throw new Error('任务不存在');

  // 验证权限
  await checkTeamPermission(task.project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);

  return task;
}

/**
 * 更新任务（通用更新）
 */
export async function updateTask(taskId: string, userId: string, data: {
  title?: string;
  description?: string;
  assigneeId?: string;
  status?: TaskItemStatus;
  priority?: TaskPriority;
  startDate?: Date;
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  progress?: number;
  tags?: string[];
  milestoneId?: string;
}) {
  const task = await prisma.collabTask.findUnique({
    where: { id: taskId },
    include: { project: { include: { team: true } } }
  });
  if (!task) throw new Error('任务不存在');

  // 获取用户权限
  const membership = await checkTeamPermission(task.project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER]);
  if (!membership) throw new Error('无权限更新任务');

  // 组员只能更新自己的任务
  if (membership.role === MemberRole.MEMBER && task.assigneeId !== userId) {
    throw new Error('只能更新分配给自己的任务');
  }

  // 记录变更历史
  const changes: { field: string; oldValue: any; newValue: any }[] = [];
  if (data.status && data.status !== task.status) {
    changes.push({ field: 'status', oldValue: task.status, newValue: data.status });
  }
  if (data.assigneeId && data.assigneeId !== task.assigneeId) {
    changes.push({ field: 'assigneeId', oldValue: task.assigneeId, newValue: data.assigneeId });
  }
  if (data.priority && data.priority !== task.priority) {
    changes.push({ field: 'priority', oldValue: task.priority, newValue: data.priority });
  }

  const updatedTask = await prisma.collabTask.update({
    where: { id: taskId },
    data: {
      ...data,
      completedAt: data.status === TaskItemStatus.DONE ? new Date() : undefined
    },
    include: {
      assignee: { select: { id: true, username: true, avatar: true } },
      createdBy: { select: { id: true, username: true, avatar: true } }
    }
  });

  // 记录历史
  for (const change of changes) {
    await createTaskHistory(taskId, userId, 'updated', change.field, String(change.oldValue), String(change.newValue));
  }

  // 发送通知
  if (data.assigneeId && data.assigneeId !== task.assigneeId) {
    await createNotification(data.assigneeId, {
      type: NotificationType.TASK_ASSIGNED,
      title: '任务分配',
      content: `您被分配了任务：${task.title}`,
      entityType: 'task',
      entityId: taskId,
      senderId: userId
    });
  }

  // 🔥 WebSocket 实时推送（n8n 架构）
  wsService.pushTaskUpdate(taskId, data).catch(err => {
    console.error('[WebSocket] 推送任务更新失败:', err);
  });

  // 更新项目进度
  await updateProjectTaskCount(task.projectId);

  return updatedTask;
}

/**
 * 组员提交任务
 */
export async function submitTask(taskId: string, userId: string, data: {
  submissionUrl?: string;
  submissionNote?: string;
}) {
  const task = await prisma.collabTask.findUnique({
    where: { id: taskId },
    include: { project: { include: { team: true } } }
  });
  if (!task) throw new Error('任务不存在');

  // 检查是否是任务执行者
  if (task.assigneeId !== userId) {
    throw new Error('只有任务执行者可以提交任务');
  }

  const updatedTask = await prisma.collabTask.update({
    where: { id: taskId },
    data: {
      status: TaskItemStatus.SUBMITTED,
      submissionUrl: data.submissionUrl,
      submissionNote: data.submissionNote,
      submittedAt: new Date(),
      reviewStatus: ReviewStatus.PENDING
    }
  });

  // 记录历史
  await createTaskHistory(taskId, userId, 'submitted', null, null, null);

  // 通知导演/创建者
  await createNotification(task.createdById, {
    type: NotificationType.TASK_SUBMITTED,
    title: '任务已提交',
    content: `任务 "${task.title}" 已提交，等待审核`,
    entityType: 'task',
    entityId: taskId,
    senderId: userId
  });

  return updatedTask;
}

/**
 * 导演审核任务
 */
export async function reviewTask(taskId: string, reviewerId: string, data: {
  reviewStatus: ReviewStatus;
  reviewNote?: string;
}) {
  const task = await prisma.collabTask.findUnique({
    where: { id: taskId },
    include: { project: { include: { team: true } } }
  });
  if (!task) throw new Error('任务不存在');

  // 检查审核权限（导演/组长）
  const membership = await checkTeamPermission(task.project.teamId, reviewerId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!membership) throw new Error('无权限审核任务');

  // 根据审核结果更新状态
  let newStatus = task.status;
  if (data.reviewStatus === ReviewStatus.APPROVED) {
    newStatus = TaskItemStatus.DONE;
  } else if (data.reviewStatus === ReviewStatus.REJECTED || data.reviewStatus === ReviewStatus.NEEDS_REVISION) {
    newStatus = TaskItemStatus.REVISION;
  }

  const updatedTask = await prisma.collabTask.update({
    where: { id: taskId },
    data: {
      status: newStatus,
      reviewStatus: data.reviewStatus,
      reviewerId,
      reviewNote: data.reviewNote,
      reviewedAt: new Date(),
      completedAt: data.reviewStatus === ReviewStatus.APPROVED ? new Date() : null
    }
  });

  // 记录历史
  await createTaskHistory(taskId, reviewerId, 'reviewed', 'reviewStatus', task.reviewStatus || 'null', data.reviewStatus);

  // 通知任务执行者
  if (task.assigneeId) {
    const statusText = data.reviewStatus === ReviewStatus.APPROVED ? '已通过' : 
                       data.reviewStatus === ReviewStatus.REJECTED ? '被拒绝' : '需要修改';
    await createNotification(task.assigneeId, {
      type: NotificationType.TASK_REVIEWED,
      title: '任务审核结果',
      content: `您的任务 "${task.title}" ${statusText}`,
      entityType: 'task',
      entityId: taskId,
      senderId: reviewerId
    });
  }

  // 更新项目进度
  await updateProjectTaskCount(task.projectId);

  return updatedTask;
}

/**
 * 批量分配任务
 */
export async function batchAssignTasks(taskIds: string[], userId: string, assigneeId: string) {
  // 验证所有任务属于同一项目且用户有权限
  const tasks = await prisma.collabTask.findMany({
    where: { id: { in: taskIds } },
    include: { project: true }
  });

  if (tasks.length !== taskIds.length) {
    throw new Error('部分任务不存在');
  }

  const projectIds = [...new Set(tasks.map(t => t.projectId))];
  for (const projectId of projectIds) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project) {
      const membership = await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
      if (!membership) throw new Error('无权限分配任务');
    }
  }

  // 批量更新
  await prisma.collabTask.updateMany({
    where: { id: { in: taskIds } },
    data: { assigneeId }
  });

  // 发送通知
  await createNotification(assigneeId, {
    type: NotificationType.TASK_ASSIGNED,
    title: '批量任务分配',
    content: `您被分配了 ${taskIds.length} 个新任务`,
    entityType: 'project',
    entityId: projectIds[0],
    senderId: userId
  });

  return { success: true, count: taskIds.length };
}

// ============ 评论管理 ============

/**
 * 添加任务评论
 */
export async function addTaskComment(taskId: string, userId: string, data: {
  content: string;
  type?: CommentType;
  parentId?: string;
}) {
  const task = await prisma.collabTask.findUnique({
    where: { id: taskId },
    include: { project: { include: { team: true } } }
  });
  if (!task) throw new Error('任务不存在');

  // 验证权限
  await checkTeamPermission(task.project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER]);

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      authorId: userId,
      content: data.content,
      type: data.type || CommentType.COMMENT,
      parentId: data.parentId
    },
    include: {
      author: { select: { id: true, username: true, avatar: true } }
    }
  });

  // 通知相关人员
  const notifyUsers = new Set<string>();
  if (task.assigneeId && task.assigneeId !== userId) notifyUsers.add(task.assigneeId);
  if (task.createdById !== userId) notifyUsers.add(task.createdById);

  for (const notifyUserId of notifyUsers) {
    await createNotification(notifyUserId, {
      type: NotificationType.TASK_COMMENTED,
      title: '新评论',
      content: `任务 "${task.title}" 有新评论`,
      entityType: 'task',
      entityId: taskId,
      senderId: userId
    });
  }

  return comment;
}

/**
 * 获取任务评论
 */
export async function getTaskComments(taskId: string, userId: string) {
  const task = await prisma.collabTask.findUnique({
    where: { id: taskId },
    include: { project: { include: { team: true } } }
  });
  if (!task) throw new Error('任务不存在');

  // 验证权限
  await checkTeamPermission(task.project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);

  return prisma.taskComment.findMany({
    where: { taskId, parentId: null },
    include: {
      author: { select: { id: true, username: true, avatar: true } },
      replies: {
        include: {
          author: { select: { id: true, username: true, avatar: true } }
        },
        orderBy: { createdAt: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

// ============ 通知管理 ============

/**
 * 获取用户通知
 */
export async function getUserNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number }) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(options?.unreadOnly ? { isRead: false } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50
  });
}

/**
 * 标记通知为已读
 */
export async function markNotificationRead(notificationId: string, userId: string) {
  return prisma.notification.update({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() }
  });
}

/**
 * 标记所有通知为已读
 */
export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() }
  });
}

// ============ 统计和报表 ============

/**
 * 获取团队统计
 */
export async function getTeamStats(teamId: string, userId: string) {
  await checkTeamPermission(teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);

  const [
    projectCount,
    memberCount,
    taskStats,
    recentTasks
  ] = await Promise.all([
    prisma.project.count({ where: { teamId, status: { not: ProjectStatus.CANCELLED } } }),
    prisma.teamMember.count({ where: { teamId, status: MemberStatus.ACTIVE } }),
    prisma.collabTask.groupBy({
      by: ['status'],
      where: { project: { teamId } },
      _count: true
    }),
    prisma.collabTask.findMany({
      where: { project: { teamId } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        assignee: { select: { id: true, username: true, avatar: true } },
        project: { select: { name: true } }
      }
    })
  ]);

  return {
    projectCount,
    memberCount,
    taskStats: taskStats.reduce((acc, curr) => {
      acc[curr.status] = curr._count;
      return acc;
    }, {} as Record<string, number>),
    recentTasks
  };
}

/**
 * 获取用户任务统计
 */
export async function getUserTaskStats(userId: string) {
  const [assigned, created, reviewed] = await Promise.all([
    prisma.collabTask.groupBy({
      by: ['status'],
      where: { assigneeId: userId },
      _count: true
    }),
    prisma.collabTask.count({ where: { createdById: userId } }),
    prisma.collabTask.count({ where: { reviewerId: userId } })
  ]);

  return {
    assignedTasks: assigned.reduce((acc, curr) => {
      acc[curr.status] = curr._count;
      return acc;
    }, {} as Record<string, number>),
    createdTasksCount: created,
    reviewedTasksCount: reviewed
  };
}

// ============ 辅助函数 ============

/**
 * 检查团队权限
 */
async function checkTeamPermission(teamId: string, userId: string, allowedRoles: MemberRole[]) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } }
  });

  if (!membership || membership.status !== MemberStatus.ACTIVE) {
    return null;
  }

  if (!allowedRoles.includes(membership.role)) {
    return null;
  }

  return membership;
}

/**
 * 创建任务历史记录
 */
async function createTaskHistory(taskId: string, actorId: string, action: string, field: string | null, oldValue: string | null, newValue: string | null) {
  return prisma.taskHistory.create({
    data: { taskId, actorId, action, field, oldValue, newValue }
  });
}

/**
 * 创建通知
 */
async function createNotification(userId: string, data: {
  type: NotificationType;
  title: string;
  content: string;
  entityType?: string;
  entityId?: string;
  senderId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId,
      type: data.type,
      title: data.title,
      content: data.content,
      entityType: data.entityType,
      entityId: data.entityId,
      senderId: data.senderId
    }
  });
}

/**
 * 更新项目任务计数
 */
async function updateProjectTaskCount(projectId: string) {
  const [totalTasks, completedTasks] = await Promise.all([
    prisma.collabTask.count({ where: { projectId } }),
    prisma.collabTask.count({ where: { projectId, status: TaskItemStatus.DONE } })
  ]);

  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  await prisma.project.update({
    where: { id: projectId },
    data: { totalTasks, completedTasks, progress }
  });
}

// ============ 资源管理 (Episodes/Characters/Scenes/Items) ============

/**
 * 获取项目的所有片段
 */
export async function getProjectEpisodes(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);
  
  return prisma.episode.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' }
  });
}

/**
 * 创建片段
 */
export async function createEpisode(projectId: string, userId: string, data: {
  name: string;
  description?: string;
  duration?: number;
}) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  const membership = await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!membership) throw new Error('无权限创建片段');
  
  return prisma.episode.create({
    data: {
      projectId,
      name: data.name,
      description: data.description,
      duration: data.duration || 10,
      sortOrder: 0
    }
  });
}

/**
 * 获取项目的所有角色
 */
export async function getProjectCharacters(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);
  
  return prisma.character.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * 创建角色
 */
export async function createCharacter(projectId: string, userId: string, data: {
  name: string;
  description?: string;
  personality?: string;
  appearance?: string;
}) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  const membership = await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!membership) throw new Error('无权限创建角色');
  
  return prisma.character.create({
    data: {
      projectId,
      name: data.name,
      description: data.description,
      personality: data.personality,
      appearance: data.appearance
    }
  });
}

/**
 * 获取项目的所有场景
 */
export async function getProjectScenes(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);
  
  return prisma.scene.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * 创建场景
 */
export async function createScene(projectId: string, userId: string, data: {
  name: string;
  description?: string;
  location?: string;
  timeOfDay?: string;
  weather?: string;
}) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  const membership = await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!membership) throw new Error('无权限创建场景');
  
  return prisma.scene.create({
    data: {
      projectId,
      name: data.name,
      description: data.description,
      location: data.location,
      timeOfDay: data.timeOfDay,
      weather: data.weather
    }
  });
}

/**
 * 获取项目的所有道具
 */
export async function getProjectItems(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);
  
  return prisma.item.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * 创建道具
 */
export async function createItem(projectId: string, userId: string, data: {
  name: string;
  description?: string;
  category?: string;
  properties?: any;
}) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  const membership = await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  if (!membership) throw new Error('无权限创建道具');
  
  return prisma.item.create({
    data: {
      projectId,
      name: data.name,
      description: data.description,
      category: data.category,
      properties: data.properties || {}
    }
  });
}

// ============ 生成任务管理 (EpisodeWorkbench 核心) ============

/**
 * 获取项目的生成任务列表
 */
export async function getProjectGenerationTasks(
  projectId: string, 
  userId: string,
  filters?: { status?: string; resourceType?: string }
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER, MemberRole.VIEWER]);
  
  const where: any = { projectId };
  if (filters?.status) where.status = filters.status;
  if (filters?.resourceType) where.resourceType = filters.resourceType;
  
  return prisma.generationTask.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });
}

/**
 * 创建生成任务
 */
export async function createGenerationTask(
  projectId: string,
  userId: string,
  data: {
    resourceType: string;
    resourceId?: string;
    resourceName?: string;
    episodeId?: string;
    aiModel: string;
    prompt: string;
    referenceImage?: string;
    params?: any;
  }
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('项目不存在');
  
  await checkTeamPermission(project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER]);
  
  // 计算积分消耗（基于模型和参数）
  let creditsUsed = 8; // 默认积分
  if (data.aiModel?.includes('ADVANCED')) {
    creditsUsed = 12;
  }
  if (data.params?.generationCount) {
    creditsUsed *= data.params.generationCount;
  }
  
  return prisma.generationTask.create({
    data: {
      projectId,
      resourceType: data.resourceType as any,
      resourceId: data.resourceId,
      resourceName: data.resourceName,
      episodeId: data.episodeId,
      aiModel: data.aiModel,
      prompt: data.prompt,
      referenceImage: data.referenceImage,
      params: data.params || {},
      status: 'PENDING',
      creditsUsed,
      createdById: userId,
    },
    include: {
      createdBy: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });
}

/**
 * 确认生成结果
 * 🔥 确认后自动更新关联资源的图片
 */
export async function confirmGenerationTask(taskId: string, userId: string, confirmedImage: string) {
  const task = await prisma.generationTask.findUnique({
    where: { id: taskId },
    include: { project: true }
  });
  if (!task) throw new Error('任务不存在');
  
  await checkTeamPermission(task.project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD, MemberRole.MEMBER]);
  
  // 更新任务状态
  const updatedTask = await prisma.generationTask.update({
    where: { id: taskId },
    data: {
      confirmedImage,
      status: 'CONFIRMED',
      completedAt: new Date(),
    }
  });

  // 🔥 如果有关联资源，更新资源的确认图片
  if (task.resourceId) {
    try {
      switch (task.resourceType) {
        case 'CHARACTER':
          await prisma.character.update({
            where: { id: task.resourceId },
            data: {
              confirmedImage,
              status: 'CONFIRMED',
            }
          });
          console.log(`[Collab] ✅ 角色 ${task.resourceId} 图片已更新`);
          break;
          
        case 'SCENE':
          await prisma.scene.update({
            where: { id: task.resourceId },
            data: {
              confirmedImage,
              status: 'CONFIRMED',
            }
          });
          console.log(`[Collab] ✅ 场景 ${task.resourceId} 图片已更新`);
          break;
          
        case 'ITEM':
          await prisma.item.update({
            where: { id: task.resourceId },
            data: {
              confirmedImage,
              status: 'CONFIRMED',
            }
          });
          console.log(`[Collab] ✅ 物品 ${task.resourceId} 图片已更新`);
          break;
          
        default:
          console.log(`[Collab] ℹ️ 资源类型 ${task.resourceType} 无需更新关联资源`);
      }
    } catch (error: any) {
      console.warn(`[Collab] ⚠️ 更新关联资源失败:`, error.message);
      // 不抛出错误，任务确认仍然成功
    }
  }

  return updatedTask;
}

/**
 * 取消生成任务
 */
export async function cancelGenerationTask(taskId: string, userId: string) {
  const task = await prisma.generationTask.findUnique({
    where: { id: taskId },
    include: { project: true }
  });
  if (!task) throw new Error('任务不存在');
  
  await checkTeamPermission(task.project.teamId, userId, [MemberRole.DIRECTOR, MemberRole.LEAD]);
  
  // 只能取消未完成的任务
  if (task.status === 'CONFIRMED' || task.status === 'CANCELLED') {
    throw new Error('该任务已完成或已取消');
  }
  
  return prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: 'CANCELLED',
    }
  });
}

// 导出服务对象
export const collaborationService = {
  // 团队
  getUserTeams,
  createTeam,
  getTeamById,
  updateTeam,
  deleteTeam,
  
  // 成员
  inviteMember,
  acceptInvitation,
  updateMemberRole,
  removeMember,
  getTeamMembers,
  
  // 项目
  createProject,
  getTeamProjects,
  getProjectById,
  updateProject,
  
  // 任务
  createTask,
  getProjectTasks,
  getTaskById,
  updateTask,
  submitTask,
  reviewTask,
  batchAssignTasks,
  
  // 评论
  addTaskComment,
  getTaskComments,
  
  // 通知
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  
  // 资源管理
  getProjectEpisodes,
  createEpisode,
  getProjectCharacters,
  createCharacter,
  getProjectScenes,
  createScene,
  getProjectItems,
  createItem,
  
  // 🆕 生成任务
  getProjectGenerationTasks,
  createGenerationTask,
  confirmGenerationTask,
  cancelGenerationTask,
  
  // 统计
  getTeamStats,
  getUserTaskStats
};

export default collaborationService;

