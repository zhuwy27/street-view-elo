import React, { useEffect, useState } from 'react';

type PhotoRaw = { id: string; url: string };
type Photo = PhotoRaw & { isNight: boolean };

const DIMENSIONS = [
  { key: 'comfort', label: '舒适感' },
  { key: 'safety', label: '安全感' },
  { key: 'oppression', label: '压抑感' },
  { key: 'accident', label: '事故倾向' },
];

const MIN_COMPARE = 5;
const MAX_VOTES = 30;
const K = 32;

// API 基础 URL
const API_BASE_URL = 'http://localhost:3001/api';

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dimension, setDimension] = useState('comfort');
  const [pair, setPair] = useState<[Photo, Photo] | null>(null);
  const [userVoteCount, setUserVoteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [rankings, setRankings] = useState<any[] | null>(null);

  // Helper: Randomly pick an element
  function pickRandom<T>(arr: T[]) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Helper: Fetch pair of photos with required constraints
  function randomPairWithCounts(all: Photo[], countsSnapshot: Record<string, number>) {
    const need = all.filter((p) => (countsSnapshot[p.id] ?? 0) < MIN_COMPARE);

    if (need.length < 2) return null;

    const A = pickRandom(need);
    let candidates = need.filter((p) => p.id !== A.id && p.isNight === A.isNight);

    if (candidates.length === 0) {
      candidates = all.filter((p) => p.id !== A.id && p.isNight === A.isNight);
      if (candidates.length === 0) {
        candidates = need.filter((p) => p.id !== A.id);
        if (candidates.length === 0) return null;
      }
    }

    const B = pickRandom(candidates);
    return [A, B] as [Photo, Photo];
  }

  // 获取排名数据
  const fetchRankings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/rankings`);
      const data = await response.json();
      if (data.success) {
        setRankings(data.rankings);
      }
    } catch (error) {
      console.error('获取排名失败:', error);
      alert('无法连接到服务器，请确保后端服务正在运行');
    }
  };

  // Load photos.json and initialize counts
  useEffect(() => {
    fetch('/photos.json')
      .then((r) => {
        if (!r.ok) throw new Error('无法加载 /photos.json');
        return r.json();
      })
      .then((data) => {
        const dayPhotos: Photo[] = (data.day || []).map((p: any) => ({ ...p, isNight: false }));
        const nightPhotos: Photo[] = (data.night || []).map((p: any) => ({ ...p, isNight: true }));
        const all = [...dayPhotos, ...nightPhotos];

        const initCounts: Record<string, number> = {};
        all.forEach((p) => {
          initCounts[p.id] = 0;
        });

        setPhotos(all);
        setCounts(initCounts);

        const initialPair = randomPairWithCounts(all, initCounts);
        if (!initialPair) {
          setFinished(true);
        } else {
          setPair(initialPair);
        }

        setLoading(false);
      })
      .catch((err) => {
        console.error('加载 photos.json 失败：', err);
        setLoading(false);
      });
  }, []);

  // Handle vote: update counts and send to backend
  async function handleVote(result: number) {
    if (!pair) return;

    const [A, B] = pair;
    const winner = result === 1 ? A.id : B.id;
    const loser = result === 1 ? B.id : A.id;

    // 更新本地状态
    const newCounts: Record<string, number> = { ...counts };
    newCounts[A.id] = (newCounts[A.id] ?? 0) + 1;
    newCounts[B.id] = (newCounts[B.id] ?? 0) + 1;

    const newUserVoteCount = userVoteCount + 1;
    setUserVoteCount(newUserVoteCount);

    // 发送到后端
    try {
      const response = await fetch(`${API_BASE_URL}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: 'user-' + Date.now(), // 简单生成会话ID
          dimension,
          winner,
          loser,
          userVoteCount: newUserVoteCount
        }),
      });

      if (!response.ok) {
        throw new Error('保存投票失败');
      }

      const resultData = await response.json();
      console.log('投票保存成功:', resultData);
    } catch (error) {
      console.error('保存投票到服务器失败:', error);
      // 这里可以添加用户提示
    }

    // 检查投票限制
    if (newUserVoteCount >= MAX_VOTES) {
      setFinished(true);
    }

    const nextPair = randomPairWithCounts(photos, newCounts);
    setPair(nextPair);
    setCounts(newCounts);
  }

  if (loading) {
    return (
      <div className="loading">
        <div>加载中...</div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="finished">
        <div>所有评分任务已完成！</div>
        <button 
          onClick={fetchRankings}
          style={{ 
            marginTop: '20px', 
            padding: '10px 20px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          查看排名结果
        </button>
        {rankings && (
          <div className="rankings" style={{ marginTop: '20px', textAlign: 'left' }}>
            <h3>照片排名 (按 Elo 分数)</h3>
            <div className="ranking-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5' }}>
                    <th style={{ padding: '10px', border: '1px solid #ddd' }}>排名</th>
                    <th style={{ padding: '10px', border: '1px solid #ddd' }}>照片ID</th>
                    <th style={{ padding: '10px', border: '1px solid #ddd' }}>Elo分数</th>
                    <th style={{ padding: '10px', border: '1px solid #ddd' }}>投票数</th>
                    <th style={{ padding: '10px', border: '1px solid #ddd' }}>类型</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((item, index) => (
                    <tr key={item.photoId}>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>#{index + 1}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{item.photoId}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{item.rating}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{item.votes}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                        {item.isNight ? '夜晚' : '白天'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!pair) {
    return (
      <div className="no-pair">
        <div>没有更多可供比较的照片。</div>
      </div>
    );
  }

  const [A, B] = pair;

  return (
    <div className="app">
      <header className="header">
        <h1>街景感知 Elo 比较评分</h1>
        <p>请选择更符合当前评分维度的街景照片。</p>

        <div>
          <label>评分维度：</label>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
          >
            {DIMENSIONS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <h3>
          请选择更符合【
          {DIMENSIONS.find((d) => d.key === dimension)?.label}
          】的照片
        </h3>
      </header>

      <div className="photo-comparison">
        {[A, B].map((p, i) => (
          <div key={p.id} className={`photo-card ${p.isNight ? 'night' : 'day'}`}>
            <img src={p.url} alt={p.id} />
            <p>{p.isNight ? '夜晚' : '白天'}</p>
            <button onClick={() => handleVote(i === 0 ? 1 : 0)}>
              {i === 0 ? '选择A' : '选择B'}
            </button>
          </div>
        ))}
      </div>

      <div className="footer">
        <p>剩余投票次数：{MAX_VOTES - userVoteCount}</p>
        <p>照片A的投票次数：{counts[A.id]}</p>
        <p>照片B的投票次数：{counts[B.id]}</p>
      </div>
    </div>
  );
}