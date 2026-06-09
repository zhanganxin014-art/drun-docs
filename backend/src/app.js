const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

// 确保存储目录存在
const fs = require('fs');
if (!fs.existsSync(config.storage.path)) {
  fs.mkdirSync(config.storage.path, { recursive: true });
}

const app = express();

// 中间件
app.use(cors({
  origin: [config.corsOrigin, 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务(生成的图片/视频等)
app.use('/static', express.static(config.storage.path));

// API路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api', require('./routes/characters'));
app.use('/api', require('./routes/storyboards'));
app.use('/api', require('./routes/assets'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/ai', require('./routes/ai'));

// 剧本API挂在/api下面
app.use('/api', require('./routes/scenes'));
app.use('/api', require('./routes/scripts'));
app.use('/api', require('./routes/episodes'));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
    code: err.code || 'INTERNAL_ERROR',
  });
});

// 前端静态文件（生产构建产物）
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  console.log(`  🌐 前端页面: http://localhost:${config.port}`);
}

// API 404处理
app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在', code: 'NOT_FOUND' });
});

// SPA 回退：非 API 路径返回前端 index.html
app.get('*', (req, res) => {
  if (fs.existsSync(frontendDist)) {
    res.sendFile(path.join(frontendDist, 'index.html'));
  } else {
    res.status(404).json({ error: '页面不存在', code: 'NOT_FOUND' });
  }
});

// 启动服务
app.listen(config.port, () => {
  console.log('');
  console.log('====================================');
  console.log('  🎬 AI短剧平台 后端服务已启动');
  console.log(`  📍 API地址: http://localhost:${config.port}`);
  console.log(`  📂 静态资源: http://localhost:${config.port}/static`);
  console.log(`  🔗 CORS来源: ${config.corsOrigin}`);
  console.log('====================================');
  console.log('');
});

module.exports = app;
