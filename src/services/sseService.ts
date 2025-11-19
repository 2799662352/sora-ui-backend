// src/services/sseService.ts
/**
 * SSE (Server-Sent Events) 推送服务
 * 
 * 🔥 完全参考 n8n sse.push.ts 实现（156K⭐ 生产验证）
 * 
 * 核心改进：
 * 1. Socket 配置（setTimeout, setNoDelay, setKeepAlive）
 * 2. 立即确认连接（:ok + flush）
 * 3. Flush 机制（每次推送都 flush）
 * 4. sessionId 机制（支持多标签页）
 * 5. 三事件监听（end, close, finish）
 * 6. 心跳优化（:ping 注释格式）
 * 7. Redis Session 管理
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { redisService } from './redisService';

interface SSEConnection {
  req: Request;
  res: Response;
  userId: string;
  sessionId: string;
  connectedAt: Date;
}

class SSEService {
  // 🔥 n8n: sessionId → 连接（支持一个用户多个标签页）
  private connections = new Map<string, SSEConnection>();
  
  // 🔥 n8n: userId → Set<sessionId>
  private userSessions = new Map<string, Set<string>>();
  
  // 🔥 n8n: 60秒心跳
  private heartbeatInterval: NodeJS.Timeout;
  
  constructor() {
    // 🔥 n8n: 60秒心跳（参考 abstract.push.ts）
    this.heartbeatInterval = setInterval(() => this.pingAll(), 60 * 1000);
    console.log('[SSE] ✅ Service initialized (heartbeat: 60s)');
  }
  
  /**
   * 🔥 n8n: 添加连接（完全参考 sse.push.ts）
   */
  addConnection(userId: string, req: Request, res: Response) {
    const sessionId = `session_${uuidv4()}`;  // 🔥 n8n: 使用 pushRef/sessionId
    
    // 🔥 n8n: 关键 Socket 配置
    (req as any).socket.setTimeout(0);           // 禁用超时
    (req as any).socket.setNoDelay(true);        // 禁用 Nagle 算法，立即发送
    (req as any).socket.setKeepAlive(true);      // TCP 保持连接
    
    // 🔥 n8n: SSE 标准头
    res.setHeader('Content-Type', 'text/event-stream; charset=UTF-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.writeHead(200);
    
    // 🔥 n8n: 立即确认连接
    res.write(':ok\n\n');
    (res as any).flush?.();  // 🔥 立即刷新缓冲区
    
    // 保存连接
    const connection: SSEConnection = {
      req,
      res,
      userId,
      sessionId,
      connectedAt: new Date(),
    };
    
    this.connections.set(sessionId, connection);
    
    // 记录用户的所有 session
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);
    
    console.log(`[SSE] 🔄 新增连接: ${sessionId} (用户: ${userId})`);
    console.log(`[SSE] 📊 用户 ${userId} 当前有 ${this.userSessions.get(userId)!.size} 个连接`);
    console.log(`[SSE] 🔍 userSessions 内容:`, Array.from(this.userSessions.keys()));
    
    // 🔥 Redis: 存储 session（用于跨实例共享）
    redisService.addToSet(`sse:sessions:${userId}`, sessionId, 3600).catch(err => {
      console.error('[SSE] ⚠️ Redis存储失败:', err);
    });
    
    // 🔥 n8n: 监听三个断开事件
    const removeClient = () => this.removeConnection(sessionId);
    req.once('end', removeClient);      // 请求正常结束
    req.once('close', removeClient);    // 连接异常关闭
    res.once('finish', removeClient);   // 响应完成
  }
  
  /**
   * 🔥 n8n: 移除连接
   */
  private removeConnection(sessionId: string) {
    const connection = this.connections.get(sessionId);
    if (!connection) return;
    
    const { userId } = connection;
    
    // 移除连接
    this.connections.delete(sessionId);
    
    // 从用户 session 列表移除
    const userSessions = this.userSessions.get(userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userSessions.delete(userId);
      }
    }
    
    console.log(`[SSE] 🔌 移除连接: ${sessionId} (用户: ${userId})`);
    console.log(`[SSE] 📊 用户 ${userId} 剩余 ${userSessions?.size || 0} 个连接`);
    
    // 🔥 Redis: 移除 session
    redisService.removeFromSet(`sse:sessions:${userId}`, sessionId).catch(err => {
      console.error('[SSE] ⚠️ Redis移除失败:', err);
    });
  }
  
  /**
   * 🔥 n8n: 发送到单个连接（sendToOneConnection）
   */
  private sendToConnection(connection: SSEConnection, data: string): boolean {
    try {
      connection.res.write(`data: ${data}\n\n`);
      (connection.res as any).flush?.();  // 🔥 n8n: 每次都 flush
      return true;
    } catch (error) {
      console.error(`[SSE] ❌ 发送失败 (${connection.sessionId}):`, error);
      this.removeConnection(connection.sessionId);
      return false;
    }
  }
  
  /**
   * 🔥 n8n: 推送任务更新（支持多标签页）
   */
  pushTaskUpdate(userId: string, payload: {
    videoId: string;
    externalTaskId?: string;
    status: string;
    progress: number;
    videoUrl?: string;
    imageUrl?: string;
    error?: any;
    errorCode?: string;
  }): number {
    // 🔥 调试：打印所有连接
    console.log(`[SSE] 🔍 pushTaskUpdate 调用`);
    console.log(`[SSE] 🔍 目标用户: ${userId}`);
    console.log(`[SSE] 🔍 当前所有用户:`, Array.from(this.userSessions.keys()));
    console.log(`[SSE] 🔍 payload.videoUrl:`, payload.videoUrl);
    
    const sessions = this.userSessions.get(userId);
    if (!sessions || sessions.size === 0) {
      console.log(`[SSE] ⚠️ 用户 ${userId} 无连接`);
      console.log(`[SSE] 🔍 userSessions 详情:`, 
        Array.from(this.userSessions.entries()).map(([k, v]) => ({
          userId: k,
          sessionCount: v.size,
          sessions: Array.from(v)
        }))
      );
      return 0;
    }
    
    // 🔥 n8n: 推送到用户的所有连接（多标签页）
    const data = JSON.stringify({
      type: 'taskUpdate',
      timestamp: Date.now(),
      payload,
    });
    
    let successCount = 0;
    sessions.forEach(sessionId => {
      const connection = this.connections.get(sessionId);
      if (connection && this.sendToConnection(connection, data)) {
        successCount++;
      }
    });
    
    console.log(`[SSE] 📤 推送给 ${successCount}/${sessions.size} 个连接 (用户: ${userId})`);
    
    return successCount;
  }
  
  /**
   * 🔥 n8n: 心跳所有连接（ping）
   */
  private pingAll() {
    console.log(`[SSE] 💓 心跳检查: ${this.connections.size} 个连接`);
    
    this.connections.forEach((connection, sessionId) => {
      try {
        // 🔥 n8n: 使用 SSE 注释格式（不触发 onmessage）
        connection.res.write(':ping\n\n');
        (connection.res as any).flush?.();
      } catch (error) {
        console.error(`[SSE] ❌ 心跳失败 (${sessionId}):`, error);
        this.removeConnection(sessionId);
      }
    });
  }
  
  /**
   * 🔥 n8n: 广播所有连接（sendToAll）
   */
  broadcast(event: string, data: any): number {
    console.log(`[SSE] 📢 广播: ${event} → ${this.connections.size} 个连接`);
    
    const message = JSON.stringify({ type: event, timestamp: Date.now(), data });
    let successCount = 0;
    
    this.connections.forEach((connection) => {
      if (this.sendToConnection(connection, message)) {
        successCount++;
      }
    });
    
    console.log(`[SSE] ✅ 广播完成: ${successCount}/${this.connections.size} 成功`);
    
    return successCount;
  }
  
  /**
   * 检查用户是否已连接
   */
  isConnected(userId: string): boolean {
    return this.userSessions.has(userId) && (this.userSessions.get(userId)!.size > 0);
  }
  
  /**
   * 获取连接统计
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      totalUsers: this.userSessions.size,
      users: Array.from(this.userSessions.keys()),
      sessions: Array.from(this.connections.keys()),
    };
  }
  
  /**
   * 关闭所有连接
   */
  closeAll() {
    console.log(`[SSE] 🛑 关闭所有连接: ${this.connections.size} 个`);
    
    this.connections.forEach((connection) => {
      try {
        connection.res.end();
      } catch (error) {
        // 忽略错误
      }
    });
    
    this.connections.clear();
    this.userSessions.clear();
    clearInterval(this.heartbeatInterval);
  }
}

// 导出单例
export const sseService = new SSEService();
