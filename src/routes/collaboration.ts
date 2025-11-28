// src/routes/collaboration.ts
// 🎬 协作系统 API 路由 - 导演→组员完整流程管理

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { collaborationService } from '../services/collaborationService';
import { APIResponse } from '../types';
import { prisma } from '../loaders/prisma';

const router = Router();

// 所有协作 API 需要认证
router.use(authMiddleware);

// ============ 用户搜索 ============

/**
 * GET /api/collab/users/search
 * 搜索用户（用于邀请成员）
 * @query q - 搜索关键词（用户名或邮箱）
 * @query teamId - 可选，排除已在该团队的成员
 */
router.get('/users/search', async (req: Request, res: Response) => {
  try {
    const { q, teamId } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: '搜索关键词至少需要2个字符'
      } as APIResponse);
    }
    
    const searchTerm = q.trim();
    
    // 搜索用户（按用户名或邮箱）
    let users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ],
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
      },
      take: 20, // 限制返回数量
    });
    
    // 如果提供了 teamId，排除已在该团队的成员
    if (teamId && typeof teamId === 'string') {
      const existingMembers = await prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });
      const existingUserIds = new Set(existingMembers.map((m: { userId: string }) => m.userId));
      users = users.filter((u: { id: string }) => !existingUserIds.has(u.id));
    }
    
    res.json({
      success: true,
      data: users
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 搜索用户失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '搜索用户失败'
    } as APIResponse);
  }
});

// ============ 团队管理 ============

/**
 * GET /api/collab/teams
 * 获取用户的所有团队
 */
router.get('/teams', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const teams = await collaborationService.getUserTeams(userId);
    
    res.json({
      success: true,
      data: teams
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取团队列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取团队列表失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/teams
 * 创建团队
 */
router.post('/teams', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '团队名称不能为空'
      } as APIResponse);
    }
    
    const team = await collaborationService.createTeam(userId, { name, description });
    
    res.json({
      success: true,
      data: team,
      message: '团队创建成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 创建团队失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '创建团队失败'
    } as APIResponse);
  }
});

/**
 * GET /api/collab/teams/:teamId
 * 获取团队详情
 */
router.get('/teams/:teamId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { teamId } = req.params;
    
    const team = await collaborationService.getTeamById(teamId, userId);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: '团队不存在或无权访问'
      } as APIResponse);
    }
    
    res.json({
      success: true,
      data: team
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取团队详情失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取团队详情失败'
    } as APIResponse);
  }
});

/**
 * PUT /api/collab/teams/:teamId
 * 更新团队
 */
router.put('/teams/:teamId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { teamId } = req.params;
    const { name, description } = req.body;
    
    const team = await collaborationService.updateTeam(teamId, userId, { name, description });
    
    res.json({
      success: true,
      data: team,
      message: '团队更新成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 更新团队失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '更新团队失败'
    } as APIResponse);
  }
});

/**
 * DELETE /api/collab/teams/:teamId
 * 删除团队（归档）
 */
router.delete('/teams/:teamId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { teamId } = req.params;
    
    await collaborationService.deleteTeam(teamId, userId);
    
    res.json({
      success: true,
      message: '团队已归档'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 删除团队失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '删除团队失败'
    } as APIResponse);
  }
});

// ============ 团队成员管理 ============

/**
 * GET /api/collab/teams/:teamId/members
 * 获取团队成员列表
 */
router.get('/teams/:teamId/members', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { teamId } = req.params;
    
    const members = await collaborationService.getTeamMembers(teamId, userId);
    
    res.json({
      success: true,
      data: members
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取成员列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取成员列表失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/teams/:teamId/members
 * 邀请成员加入团队
 */
router.post('/teams/:teamId/members', async (req: Request, res: Response) => {
  try {
    const inviterId = (req as any).user.userId;
    const { teamId } = req.params;
    const { userId, role } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      } as APIResponse);
    }
    
    const member = await collaborationService.inviteMember(teamId, inviterId, { userId, role });
    
    res.json({
      success: true,
      data: member,
      message: '邀请已发送'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 邀请成员失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '邀请成员失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/teams/:teamId/members/accept
 * 接受团队邀请
 */
router.post('/teams/:teamId/members/accept', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { teamId } = req.params;
    
    const member = await collaborationService.acceptInvitation(teamId, userId);
    
    res.json({
      success: true,
      data: member,
      message: '已加入团队'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 接受邀请失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '接受邀请失败'
    } as APIResponse);
  }
});

/**
 * PUT /api/collab/teams/:teamId/members/:memberId/role
 * 更新成员角色
 */
router.put('/teams/:teamId/members/:memberId/role', async (req: Request, res: Response) => {
  try {
    const operatorId = (req as any).user.userId;
    const { teamId, memberId } = req.params;
    const { role } = req.body;
    
    const member = await collaborationService.updateMemberRole(teamId, operatorId, memberId, role);
    
    res.json({
      success: true,
      data: member,
      message: '角色已更新'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 更新角色失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '更新角色失败'
    } as APIResponse);
  }
});

/**
 * DELETE /api/collab/teams/:teamId/members/:memberId
 * 移除团队成员
 */
router.delete('/teams/:teamId/members/:memberId', async (req: Request, res: Response) => {
  try {
    const operatorId = (req as any).user.userId;
    const { teamId, memberId } = req.params;
    
    await collaborationService.removeMember(teamId, operatorId, memberId);
    
    res.json({
      success: true,
      message: '成员已移除'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 移除成员失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '移除成员失败'
    } as APIResponse);
  }
});

// ============ 项目管理 ============

/**
 * GET /api/collab/teams/:teamId/projects
 * 获取团队的所有项目
 */
router.get('/teams/:teamId/projects', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { teamId } = req.params;
    
    const projects = await collaborationService.getTeamProjects(teamId, userId);
    
    res.json({
      success: true,
      data: projects
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取项目列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取项目列表失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/teams/:teamId/projects
 * 创建项目
 */
router.post('/teams/:teamId/projects', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { teamId } = req.params;
    const { name, description, startDate, dueDate, priority } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '项目名称不能为空'
      } as APIResponse);
    }
    
    const project = await collaborationService.createProject(teamId, userId, {
      name,
      description,
      startDate: startDate ? new Date(startDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority
    });
    
    res.json({
      success: true,
      data: project,
      message: '项目创建成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 创建项目失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '创建项目失败'
    } as APIResponse);
  }
});

/**
 * GET /api/collab/projects/:projectId
 * 获取项目详情
 */
router.get('/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    
    const project = await collaborationService.getProjectById(projectId, userId);
    
    res.json({
      success: true,
      data: project
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取项目详情失败:', error);
    res.status(error.message.includes('不存在') ? 404 : 500).json({
      success: false,
      message: error.message || '获取项目详情失败'
    } as APIResponse);
  }
});

/**
 * PUT /api/collab/projects/:projectId
 * 更新项目
 */
router.put('/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { name, description, status, startDate, dueDate, priority } = req.body;
    
    const project = await collaborationService.updateProject(projectId, userId, {
      name,
      description,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority
    });
    
    res.json({
      success: true,
      data: project,
      message: '项目更新成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 更新项目失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '更新项目失败'
    } as APIResponse);
  }
});

// ============ 任务管理（核心流程） ============

/**
 * GET /api/collab/projects/:projectId/tasks
 * 获取项目的所有任务
 */
router.get('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { status, assigneeId, priority } = req.query;
    
    const tasks = await collaborationService.getProjectTasks(projectId, userId, {
      status: status as any,
      assigneeId: assigneeId as string,
      priority: priority as any
    });
    
    res.json({
      success: true,
      data: tasks
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取任务列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取任务列表失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/projects/:projectId/tasks
 * 创建任务（导演/组长下发任务）
 */
router.post('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { 
      title, description, assigneeId, taskType, priority,
      startDate, dueDate, estimatedHours, tags, milestoneId 
    } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        message: '任务标题不能为空'
      } as APIResponse);
    }
    
    const task = await collaborationService.createTask(projectId, userId, {
      title,
      description,
      assigneeId,
      taskType,
      priority,
      startDate: startDate ? new Date(startDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      estimatedHours,
      tags,
      milestoneId
    });
    
    res.json({
      success: true,
      data: task,
      message: '任务创建成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 创建任务失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '创建任务失败'
    } as APIResponse);
  }
});

/**
 * GET /api/collab/tasks/:taskId
 * 获取任务详情
 */
router.get('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskId } = req.params;
    
    const task = await collaborationService.getTaskById(taskId, userId);
    
    res.json({
      success: true,
      data: task
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取任务详情失败:', error);
    res.status(error.message.includes('不存在') ? 404 : 500).json({
      success: false,
      message: error.message || '获取任务详情失败'
    } as APIResponse);
  }
});

/**
 * PUT /api/collab/tasks/:taskId
 * 更新任务
 */
router.put('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskId } = req.params;
    const data = req.body;
    
    // 转换日期字段
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.dueDate) data.dueDate = new Date(data.dueDate);
    
    const task = await collaborationService.updateTask(taskId, userId, data);
    
    res.json({
      success: true,
      data: task,
      message: '任务更新成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 更新任务失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '更新任务失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/tasks/:taskId/submit
 * 组员提交任务
 */
router.post('/tasks/:taskId/submit', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskId } = req.params;
    const { submissionUrl, submissionNote } = req.body;
    
    const task = await collaborationService.submitTask(taskId, userId, {
      submissionUrl,
      submissionNote
    });
    
    res.json({
      success: true,
      data: task,
      message: '任务已提交，等待审核'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 提交任务失败:', error);
    res.status(error.message.includes('执行者') ? 403 : 500).json({
      success: false,
      message: error.message || '提交任务失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/tasks/:taskId/review
 * 导演审核任务
 */
router.post('/tasks/:taskId/review', async (req: Request, res: Response) => {
  try {
    const reviewerId = (req as any).user.userId;
    const { taskId } = req.params;
    const { reviewStatus, reviewNote } = req.body;
    
    if (!reviewStatus) {
      return res.status(400).json({
        success: false,
        message: '审核结果不能为空'
      } as APIResponse);
    }
    
    const task = await collaborationService.reviewTask(taskId, reviewerId, {
      reviewStatus,
      reviewNote
    });
    
    res.json({
      success: true,
      data: task,
      message: '审核完成'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 审核任务失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '审核任务失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/tasks/batch-assign
 * 批量分配任务
 */
router.post('/tasks/batch-assign', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskIds, assigneeId } = req.body;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '任务ID列表不能为空'
      } as APIResponse);
    }
    
    if (!assigneeId) {
      return res.status(400).json({
        success: false,
        message: '执行者ID不能为空'
      } as APIResponse);
    }
    
    const result = await collaborationService.batchAssignTasks(taskIds, userId, assigneeId);
    
    res.json({
      success: true,
      data: result,
      message: `已分配 ${result.count} 个任务`
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 批量分配失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '批量分配失败'
    } as APIResponse);
  }
});

// ============ 评论管理 ============

/**
 * GET /api/collab/tasks/:taskId/comments
 * 获取任务评论
 */
router.get('/tasks/:taskId/comments', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskId } = req.params;
    
    const comments = await collaborationService.getTaskComments(taskId, userId);
    
    res.json({
      success: true,
      data: comments
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取评论失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取评论失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/tasks/:taskId/comments
 * 添加任务评论
 */
router.post('/tasks/:taskId/comments', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskId } = req.params;
    const { content, type, parentId } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: '评论内容不能为空'
      } as APIResponse);
    }
    
    const comment = await collaborationService.addTaskComment(taskId, userId, {
      content,
      type,
      parentId
    });
    
    res.json({
      success: true,
      data: comment,
      message: '评论已添加'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 添加评论失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '添加评论失败'
    } as APIResponse);
  }
});

// ============ 通知管理 ============

/**
 * GET /api/collab/notifications
 * 获取用户通知
 */
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { unreadOnly, limit } = req.query;
    
    const notifications = await collaborationService.getUserNotifications(userId, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit as string) : undefined
    });
    
    res.json({
      success: true,
      data: notifications
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取通知失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取通知失败'
    } as APIResponse);
  }
});

/**
 * PUT /api/collab/notifications/:notificationId/read
 * 标记通知为已读
 */
router.put('/notifications/:notificationId/read', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { notificationId } = req.params;
    
    const notification = await collaborationService.markNotificationRead(notificationId, userId);
    
    res.json({
      success: true,
      data: notification
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 标记已读失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '标记已读失败'
    } as APIResponse);
  }
});

/**
 * PUT /api/collab/notifications/read-all
 * 标记所有通知为已读
 */
router.put('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    await collaborationService.markAllNotificationsRead(userId);
    
    res.json({
      success: true,
      message: '所有通知已标记为已读'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 标记全部已读失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '标记全部已读失败'
    } as APIResponse);
  }
});

// ============ 资源管理 (Episodes/Characters/Scenes/Items) ============

/**
 * GET /api/collab/projects/:projectId/episodes
 * 获取项目的所有片段
 */
router.get('/projects/:projectId/episodes', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    
    const episodes = await collaborationService.getProjectEpisodes(projectId, userId);
    
    res.json({
      success: true,
      data: episodes
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取片段列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取片段列表失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/projects/:projectId/episodes
 * 创建片段
 */
router.post('/projects/:projectId/episodes', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { name, description, duration } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '片段名称不能为空'
      } as APIResponse);
    }
    
    const episode = await collaborationService.createEpisode(projectId, userId, {
      name,
      description,
      duration
    });
    
    res.json({
      success: true,
      data: episode,
      message: '片段创建成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 创建片段失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '创建片段失败'
    } as APIResponse);
  }
});

/**
 * GET /api/collab/projects/:projectId/characters
 * 获取项目的所有角色
 */
router.get('/projects/:projectId/characters', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    
    const characters = await collaborationService.getProjectCharacters(projectId, userId);
    
    res.json({
      success: true,
      data: characters
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取角色列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取角色列表失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/projects/:projectId/characters
 * 创建角色
 */
router.post('/projects/:projectId/characters', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { name, description, personality, appearance } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '角色名称不能为空'
      } as APIResponse);
    }
    
    const character = await collaborationService.createCharacter(projectId, userId, {
      name,
      description,
      personality,
      appearance
    });
    
    res.json({
      success: true,
      data: character,
      message: '角色创建成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 创建角色失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '创建角色失败'
    } as APIResponse);
  }
});

/**
 * GET /api/collab/projects/:projectId/scenes
 * 获取项目的所有场景
 */
router.get('/projects/:projectId/scenes', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    
    const scenes = await collaborationService.getProjectScenes(projectId, userId);
    
    res.json({
      success: true,
      data: scenes
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取场景列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取场景列表失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/projects/:projectId/scenes
 * 创建场景
 */
router.post('/projects/:projectId/scenes', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { name, description, location, timeOfDay, weather } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '场景名称不能为空'
      } as APIResponse);
    }
    
    const scene = await collaborationService.createScene(projectId, userId, {
      name,
      description,
      location,
      timeOfDay,
      weather
    });
    
    res.json({
      success: true,
      data: scene,
      message: '场景创建成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 创建场景失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '创建场景失败'
    } as APIResponse);
  }
});

/**
 * GET /api/collab/projects/:projectId/items
 * 获取项目的所有道具
 */
router.get('/projects/:projectId/items', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    
    const items = await collaborationService.getProjectItems(projectId, userId);
    
    res.json({
      success: true,
      data: items
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取道具列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取道具列表失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/projects/:projectId/items
 * 创建道具
 */
router.post('/projects/:projectId/items', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { name, description, category, properties } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '道具名称不能为空'
      } as APIResponse);
    }
    
    const item = await collaborationService.createItem(projectId, userId, {
      name,
      description,
      category,
      properties
    });
    
    res.json({
      success: true,
      data: item,
      message: '道具创建成功'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 创建道具失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '创建道具失败'
    } as APIResponse);
  }
});

// ============ 生成任务管理 (EpisodeWorkbench 核心) ============

/**
 * GET /api/collab/projects/:projectId/generation-tasks
 * 获取项目的生成任务列表
 */
router.get('/projects/:projectId/generation-tasks', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { status, resourceType } = req.query;
    
    const tasks = await collaborationService.getProjectGenerationTasks(projectId, userId, {
      status: status as string,
      resourceType: resourceType as string,
    });
    
    res.json({
      success: true,
      data: tasks
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取生成任务失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取生成任务失败'
    } as APIResponse);
  }
});

/**
 * POST /api/collab/projects/:projectId/generation-tasks
 * 创建生成任务（EpisodeWorkbench 提交）
 */
router.post('/projects/:projectId/generation-tasks', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.params;
    const { 
      resourceType, resourceId, resourceName, episodeId,
      aiModel, prompt, referenceImage, params 
    } = req.body;
    
    if (!resourceType || !aiModel || !prompt) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: resourceType, aiModel, prompt'
      } as APIResponse);
    }
    
    const task = await collaborationService.createGenerationTask(projectId, userId, {
      resourceType,
      resourceId,
      resourceName,
      episodeId,
      aiModel,
      prompt,
      referenceImage,
      params,
    });
    
    res.json({
      success: true,
      data: task,
      message: '生成任务已创建'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 创建生成任务失败:', error);
    res.status(error.message.includes('无权限') ? 403 : 500).json({
      success: false,
      message: error.message || '创建生成任务失败'
    } as APIResponse);
  }
});

/**
 * PATCH /api/collab/generation-tasks/:taskId/confirm
 * 确认生成结果
 */
router.patch('/generation-tasks/:taskId/confirm', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskId } = req.params;
    const { confirmedImage } = req.body;
    
    if (!confirmedImage) {
      return res.status(400).json({
        success: false,
        message: '请选择要确认的图片'
      } as APIResponse);
    }
    
    const task = await collaborationService.confirmGenerationTask(taskId, userId, confirmedImage);
    
    res.json({
      success: true,
      data: task,
      message: '已确认生成结果'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 确认生成任务失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '确认生成任务失败'
    } as APIResponse);
  }
});

/**
 * DELETE /api/collab/generation-tasks/:taskId
 * 取消生成任务
 */
router.delete('/generation-tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { taskId } = req.params;
    
    await collaborationService.cancelGenerationTask(taskId, userId);
    
    res.json({
      success: true,
      message: '生成任务已取消'
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 取消生成任务失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '取消生成任务失败'
    } as APIResponse);
  }
});

// ============ 统计和报表 ============

/**
 * GET /api/collab/teams/:teamId/stats
 * 获取团队统计
 */
router.get('/teams/:teamId/stats', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { teamId } = req.params;
    
    const stats = await collaborationService.getTeamStats(teamId, userId);
    
    res.json({
      success: true,
      data: stats
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取团队统计失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取团队统计失败'
    } as APIResponse);
  }
});

/**
 * GET /api/collab/user/stats
 * 获取用户任务统计
 */
router.get('/user/stats', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    const stats = await collaborationService.getUserTaskStats(userId);
    
    res.json({
      success: true,
      data: stats
    } as APIResponse);
  } catch (error: any) {
    console.error('[Collab] 获取用户统计失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取用户统计失败'
    } as APIResponse);
  }
});

export default router;