import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(bodyParser.json());

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data', 'votes.json');

// 确保数据目录存在
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化数据文件
if (!fs.existsSync(DATA_FILE)) {
  const initialData = {
    votes: [],
    eloRatings: {},
    userSessions: {}
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// 类型定义
interface VoteData {
  sessionId: string;
  dimension: string;
  winner: string;
  loser: string;
  timestamp: number;
  userVoteCount: number;
}

interface EloRating {
  rating: number;
  votes: number;
}

// 读取数据
function readData(): any {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取数据文件失败:', error);
    return { votes: [], eloRatings: {}, userSessions: {} };
  }
}

// 保存数据
function saveData(data: any): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('保存数据文件失败:', error);
  }
}

// Elo 计算函数
function calculateElo(R1: number, R2: number, K: number, result: number): [number, number] {
  const E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
  const E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
  const newR1 = R1 + K * (result - E1);
  const newR2 = R2 + K * ((1 - result) - E2);
  return [newR1, newR2];
}

// API 路由

// 提交投票
app.post('/api/vote', (req, res) => {
  try {
    const { sessionId, dimension, winner, loser, userVoteCount } = req.body;
    
    if (!sessionId || !dimension || !winner || !loser) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const data = readData();
    const K = 32; // Elo K 因子
    
    // 初始化或获取当前 Elo 分数
    const initialRating = 1000;
    const winnerRating = data.eloRatings[winner]?.rating || initialRating;
    const loserRating = data.eloRatings[loser]?.rating || initialRating;
    
    // 计算新的 Elo 分数
    const [newWinnerRating, newLoserRating] = calculateElo(winnerRating, loserRating, K, 1);
    
    // 更新 Elo 分数
    data.eloRatings[winner] = {
      rating: Math.round(newWinnerRating),
      votes: (data.eloRatings[winner]?.votes || 0) + 1
    };
    
    data.eloRatings[loser] = {
      rating: Math.round(newLoserRating),
      votes: (data.eloRatings[loser]?.votes || 0) + 1
    };
    
    // 记录投票
    const vote: VoteData = {
      sessionId,
      dimension,
      winner,
      loser,
      timestamp: Date.now(),
      userVoteCount
    };
    
    data.votes.push(vote);
    
    // 更新用户会话
    if (!data.userSessions[sessionId]) {
      data.userSessions[sessionId] = {
        createdAt: Date.now(),
        totalVotes: 0
      };
    }
    data.userSessions[sessionId].totalVotes = userVoteCount;
    data.userSessions[sessionId].lastActivity = Date.now();
    
    // 保存数据
    saveData(data);
    
    res.json({
      success: true,
      message: '投票已保存',
      newRatings: {
        [winner]: data.eloRatings[winner],
        [loser]: data.eloRatings[loser]
      }
    });
    
  } catch (error) {
    console.error('投票处理错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取排名数据
app.get('/api/rankings', (req, res) => {
  try {
    const data = readData();
    
    // 将 Elo 评分转换为数组并排序
    const rankings = Object.entries(data.eloRatings)
      .map(([photoId, rating]: [string, any]) => ({
        photoId,
        rating: rating.rating,
        votes: rating.votes,
        isNight: photoId.startsWith('night')
      }))
      .sort((a, b) => b.rating - a.rating);
    
    res.json({
      success: true,
      rankings,
      totalVotes: data.votes.length,
      uniqueUsers: Object.keys(data.userSessions).length
    });
    
  } catch (error) {
    console.error('获取排名错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取统计数据
app.get('/api/stats', (req, res) => {
  try {
    const data = readData();
    
    const stats = {
      totalVotes: data.votes.length,
      uniqueUsers: Object.keys(data.userSessions).length,
      uniquePhotos: Object.keys(data.eloRatings).length,
      dayPhotos: Object.keys(data.eloRatings).filter(id => id.startsWith('day')).length,
      nightPhotos: Object.keys(data.eloRatings).filter(id => id.startsWith('night')).length,
      dimensions: {} as Record<string, number>
    };
    
    // 统计各维度的投票数
    data.votes.forEach((vote: VoteData) => {
      stats.dimensions[vote.dimension] = (stats.dimensions[vote.dimension] || 0) + 1;
    });
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 后端服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 API 文档:`);
  console.log(`   POST /api/vote - 提交投票`);
  console.log(`   GET  /api/rankings - 获取排名`);
  console.log(`   GET  /api/stats - 获取统计数据`);
});