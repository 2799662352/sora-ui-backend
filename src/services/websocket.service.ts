/**
 * WebSocket Service - 基于 n8n 架构
 * 
 * 架构设计：
 * - 抽象 Push 类（支持 SSE/WebSocket 切换）
 * - 心跳检测机制（60秒间隔）
 * - 用户会话管理
 * - 广播/单播/多播支持
 * - 🔥 支持 JWT Token 认证
 * 
 * 参考：n8n/packages/cli/src/push/
 * 
 * @author Sora UI Team
 * @date 2025-11-27
 */

import WebSocket, { WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'http';
import type { Express, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authService } from './authService';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// 消息类型定义
export interface PushMessage {
  type: string;
  data: any;
}

// 扩展的 WebSocket 类型
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  pushRef?: string;
}

// 连接信息
interface Connection {
  ws: ExtendedWebSocket;
  userId: string;
  pushRef: string;
  isAlive: boolean;
  connectedAt: Date;
}

export class WebSocketService {
  private wsServer: WebSocketServer | null = null;
  private connections: Map<string, Connection> = new Map();
  private userIdByPushRef: Map<string, string> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    console.log('[WebSocket] 🚀 WebSocket Service 初始化');
  }

  /**
   * 设置 WebSocket 服务器
   */
  setupWebSocketServer(server: HttpServer, app: Express) {
    this.wsServer = new WebSocketServer({ noServer: true });

    // 处理 HTTP 升级请求
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      
      if (url.pathname === '/api/collab/ws') {
        this.wsServer!.handleUpgrade(request, socket, head, (ws) => {
          this.wsServer!.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // 处理新连接
    this.wsServer.on('connection', (ws: ExtendedWebSocket, request: Request) => {
      this.handleConnection(ws, request);
    });

    // 启动心跳检测
    this.startHeartbeat();

    console.log('[WebSocket] ✅ WebSocket Server 已启动');
  }

  /**
   * 处理新的 WebSocket 连接
   * 🔥 支持两种认证方式：
   * 1. token 参数 - 验证 JWT Token 获取 userId
   * 2. pushRef + userId 参数 - 直接使用
   */
  private handleConnection(ws: ExtendedWebSocket, request: Request) {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    
    // 🔥 获取参数
    const token = url.searchParams.get('token');
    let pushRef = url.searchParams.get('pushRef');
    let userId = url.searchParams.get('userId');

    // 🔥 Token 认证模式
    if (token && !userId) {
      try {
        const decoded = authService.verifyToken(token);
        userId = decoded.userId;
        pushRef = pushRef || `ws-${userId}-${uuidv4().substring(0, 8)}`;
        console.log(`[WebSocket] 🔑 Token 验证成功: 用户 ${decoded.username} (${userId})`);
      } catch (error: any) {
        console.log(`[WebSocket] ❌ Token 验证失败: ${error.message}`);
        ws.close(1008, 'Invalid token');
        return;
      }
    }

    // 🔥 直接参数模式（向后兼容）
    if (!pushRef || !userId) {
      console.log('[WebSocket] ❌ 缺少认证参数 (需要 token 或 pushRef+userId)');
      ws.close(1008, 'Missing authentication parameters');
      return;
    }

    // 初始化连接
    ws.isAlive = true;
    ws.pushRef = pushRef;
    ws.userId = userId;

    const connection: Connection = {
      ws,
      userId,
      pushRef,
      isAlive: true,
      connectedAt: new Date(),
    };

    // 如果已存在同 pushRef 的连接，关闭旧连接
    const existingConnection = this.connections.get(pushRef);
    if (existingConnection) {
      console.log(`[WebSocket] 🔄 关闭旧连接: ${pushRef}`);
      existingConnection.ws.close();
    }

    // 注册新连接
    this.connections.set(pushRef, connection);
    this.userIdByPushRef.set(pushRef, userId);

    console.log(`[WebSocket] ✅ 新连接: ${pushRef} (用户: ${userId})`);
    console.log(`[WebSocket] 📊 当前连接数: ${this.connections.size}`);

    // 监听 pong 响应
    ws.on('pong', () => {
      connection.isAlive = true;
    });

    // 监听消息
    ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(pushRef, data);
    });

    // 监听关闭
    ws.on('close', () => {
      console.log(`[WebSocket] 🔌 连接断开: ${pushRef}`);
      this.connections.delete(pushRef);
      this.userIdByPushRef.delete(pushRef);
    });

    // 监听错误
    ws.on('error', (error) => {
      console.error(`[WebSocket] ❌ 连接错误: ${pushRef}`, error);
    });

    // 发送欢迎消息
    this.sendToOne({
      type: 'connected',
      data: {
        message: 'WebSocket 连接成功',
        pushRef,
        userId,
        timestamp: new Date().toISOString(),
      },
    }, pushRef);
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(pushRef: string, data: WebSocket.RawData) {
    try {
      const buffer = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;

      const message = JSON.parse(buffer.toString('utf8'));

      // 处理客户端心跳
      if (message.type === 'heartbeat') {
        const connection = this.connections.get(pushRef);
        if (connection) {
          connection.isAlive = true;
          this.sendToOne({
            type: 'heartbeat-response',
            data: { timestamp: new Date().toISOString() },
          }, pushRef);
        }
        return;
      }

      console.log(`[WebSocket] 📨 收到消息: ${message.type}`, { pushRef });

      // TODO: 根据消息类型处理业务逻辑
      this.handleBusinessMessage(pushRef, message);
    } catch (error) {
      console.error('[WebSocket] ❌ 解析消息失败:', error);
    }
  }

  /**
   * 处理业务消息
   */
  private async handleBusinessMessage(pushRef: string, message: any) {
    const userId = this.userIdByPushRef.get(pushRef);
    if (!userId) return;

    switch (message.type) {
      case 'task:subscribe':
        // 订阅任务更新
        console.log(`[WebSocket] 📡 用户 ${userId} 订阅任务: ${message.data.taskId}`);
        break;
      
      case 'project:subscribe':
        // 订阅项目更新
        console.log(`[WebSocket] 📡 用户 ${userId} 订阅项目: ${message.data.projectId}`);
        break;
      
      default:
        console.log(`[WebSocket] ⚠️  未知消息类型: ${message.type}`);
    }
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // 每 60 秒检测一次
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((connection, pushRef) => {
        if (!connection.isAlive) {
          console.log(`[WebSocket] 💀 心跳超时，断开连接: ${pushRef}`);
          connection.ws.terminate();
          this.connections.delete(pushRef);
          this.userIdByPushRef.delete(pushRef);
          return;
        }

        connection.isAlive = false;
        connection.ws.ping();
      });
    }, 60 * 1000);

    console.log('[WebSocket] ❤️  心跳检测已启动（60秒间隔）');
  }

  /**
   * 发送消息给所有连接
   */
  broadcast(pushMsg: PushMessage) {
    const pushRefs = Array.from(this.connections.keys());
    this.sendTo(pushMsg, pushRefs);
    
    console.log(`[WebSocket] 📢 广播消息: ${pushMsg.type} → ${pushRefs.length} 个连接`);
  }

  /**
   * 发送消息给单个连接
   */
  sendToOne(pushMsg: PushMessage, pushRef: string, asBinary: boolean = false) {
    const connection = this.connections.get(pushRef);
    
    if (!connection) {
      console.log(`[WebSocket] ⚠️  连接不存在: ${pushRef}`);
      return;
    }

    this.sendTo(pushMsg, [pushRef], asBinary);
  }

  /**
   * 发送消息给多个用户
   */
  sendToUsers(pushMsg: PushMessage, userIds: string[]) {
    const pushRefs = Array.from(this.userIdByPushRef.entries())
      .filter(([, userId]) => userIds.includes(userId))
      .map(([pushRef]) => pushRef);

    this.sendTo(pushMsg, pushRefs);
    
    console.log(`[WebSocket] 👥 发送给用户: ${pushMsg.type} → ${userIds.length} 个用户`);
  }

  /**
   * 核心发送逻辑
   */
  private sendTo(pushMsg: PushMessage, pushRefs: string[], asBinary: boolean = false) {
    const payload = JSON.stringify(pushMsg);

    for (const pushRef of pushRefs) {
      const connection = this.connections.get(pushRef);
      if (!connection) continue;

      try {
        connection.ws.send(payload, { binary: asBinary });
      } catch (error) {
        console.error(`[WebSocket] ❌ 发送失败: ${pushRef}`, error);
      }
    }
  }

  /**
   * 检查连接是否存在
   */
  hasPushRef(pushRef: string): boolean {
    return this.connections.has(pushRef);
  }

  /**
   * 获取所有活跃连接
   */
  getActiveConnections() {
    return Array.from(this.connections.values()).map(conn => ({
      pushRef: conn.pushRef,
      userId: conn.userId,
      connectedAt: conn.connectedAt,
      isAlive: conn.isAlive,
    }));
  }

  /**
   * 关闭所有连接
   */
  closeAllConnections() {
    console.log(`[WebSocket] 🔌 关闭所有连接: ${this.connections.size} 个`);
    
    this.connections.forEach((connection) => {
      connection.ws.close();
    });

    this.connections.clear();
    this.userIdByPushRef.clear();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 任务相关事件推送
   */
  async pushTaskUpdate(taskId: string, updates: any) {
    const task = await prisma.collabTask.findUnique({
      where: { id: taskId },
      include: { assignee: true, project: true },
    });

    if (!task) return;

    // 推送给任务相关的所有用户
    const userIds = [task.assigneeId, task.createdById].filter(Boolean) as string[];

    this.sendToUsers({
      type: 'task:updated',
      data: { task, updates },
    }, userIds);

    console.log(`[WebSocket] 📋 任务更新推送: ${taskId} → ${userIds.length} 个用户`);
  }

  /**
   * 项目相关事件推送
   */
  async pushProjectUpdate(projectId: string, updates: any) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        team: {
          include: { members: true },
        },
      },
    });

    if (!project) return;

    // 推送给项目团队所有成员
    const userIds = project.team.members.map(m => m.userId);

    this.sendToUsers({
      type: 'project:updated',
      data: { project, updates },
    }, userIds);

    console.log(`[WebSocket] 📁 项目更新推送: ${projectId} → ${userIds.length} 个用户`);
  }

  /**
   * 🆕 生成任务更新推送
   */
  async pushGenerationTaskUpdate(taskId: string, updates: {
    status: string;
    candidateImages?: string[];
    errorMessage?: string;
  }) {
    const task = await prisma.generationTask.findUnique({
      where: { id: taskId },
      include: {
        createdBy: true,
        project: {
          include: {
            team: { include: { members: true } },
          },
        },
      },
    });

    if (!task) return;

    // 推送给任务创建者和团队成员
    const userIds = [
      task.createdById,
      ...task.project.team.members.map(m => m.userId),
    ].filter(Boolean) as string[];

    // 去重
    const uniqueUserIds = [...new Set(userIds)];

    this.sendToUsers({
      type: 'generation:updated',
      data: {
        taskId,
        status: updates.status,
        candidateImages: updates.candidateImages || [],
        errorMessage: updates.errorMessage,
        resourceType: task.resourceType,
        resourceName: task.resourceName,
      },
    }, uniqueUserIds);

    console.log(`[WebSocket] 🎨 生成任务更新推送: ${taskId} (${updates.status}) → ${uniqueUserIds.length} 个用户`);
  }

  /**
   * 评论事件推送
   */
  async pushCommentCreated(commentId: string) {
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
      include: {
        author: true,
        task: {
          include: {
            assignee: true,
            project: {
              include: {
                team: { include: { members: true } },
              },
            },
          },
        },
      },
    });

    if (!comment) return;

    // 推送给任务相关用户
    const userIds = [
      comment.task.assigneeId,
      comment.task.createdById,
    ].filter(Boolean) as string[];

    this.sendToUsers({
      type: 'comment:created',
      data: { comment },
    }, userIds);

    console.log(`[WebSocket] 💬 评论推送: 任务 ${comment.taskId} → ${userIds.length} 个用户`);
  }
}

// 导出单例
export const wsService = new WebSocketService();




