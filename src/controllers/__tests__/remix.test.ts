import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../../loaders/prisma';
import { remixSoraVideo } from '../soraRelayController';
import { startTaskPolling } from '../../services/taskPollingService';
import { TaskStatus } from '@prisma/client';

// Mock 依赖
jest.mock('axios');
jest.mock('../../loaders/prisma', () => ({
  prisma: {
    videoTask: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));
jest.mock('../../services/taskPollingService', () => ({
  startTaskPolling: jest.fn(),
}));

// Mock Request/Response
const mockRequest = () => {
  const req: any = {
    params: { videoId: 'video_123' },
    body: { prompt: 'New Prompt', model: 'sora_v2' },
    user: { userId: 'user_123' },
  };
  return req as Request;
};

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe('remixSoraVideo Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SORA_API_KEY = 'test_key'; // 确保环境变量存在
  });

  it('should successfully create a remix task', async () => {
    const req = mockRequest();
    const res = mockResponse();

    // Mock findUnique (Original Task)
    (prisma.videoTask.findUnique as jest.Mock).mockResolvedValue({
      videoId: 'video_123',
      externalTaskId: 'ext_123',
      model: 'sora_v1',
      size: '1024x1024',
      duration: 10,
      aspectRatio: '16:9',
    });

    // Mock Axios (External API)
    (axios.post as jest.Mock).mockResolvedValue({
      data: { id: 'new_ext_456' },
    });

    // Mock Create (New Task)
    (prisma.videoTask.create as jest.Mock).mockResolvedValue({
      videoId: 'new_video_456',
    });

    await remixSoraVideo(req, res);

    // Assertions
    expect(prisma.videoTask.findUnique).toHaveBeenCalledWith({ where: { videoId: 'video_123' } });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/sora/v1/videos/ext_123/remix'),
      expect.objectContaining({ prompt: 'New Prompt' }),
      expect.any(Object)
    );
    expect(prisma.videoTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: {
          type: 'remix',
          remix_from: 'video_123',
          remix_from_external: 'ext_123',
        },
      }),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ remixed_from: 'video_123' }),
    }));
  });

  it('should return 404 if original task not found', async () => {
    const req = mockRequest();
    const res = mockResponse();

    (prisma.videoTask.findUnique as jest.Mock).mockResolvedValue(null);

    await remixSoraVideo(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: '原视频任务不存在' }));
  });

  it('should return 400 if original task has no externalTaskId', async () => {
    const req = mockRequest();
    const res = mockResponse();

    (prisma.videoTask.findUnique as jest.Mock).mockResolvedValue({
      videoId: 'video_123',
      externalTaskId: null,
    });

    await remixSoraVideo(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('should throw error if API Key is missing', async () => {
    delete process.env.SORA_API_KEY; // 模拟缺少环境变量
    const req = mockRequest();
    const res = mockResponse();

    (prisma.videoTask.findUnique as jest.Mock).mockResolvedValue({
      videoId: 'video_123',
      externalTaskId: 'ext_123',
    });

    await remixSoraVideo(req, res);

    expect(res.status).toHaveBeenCalledWith(500); // 或捕获特定的错误处理逻辑
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'SORA_API_KEY 未配置' }));
  });
});






