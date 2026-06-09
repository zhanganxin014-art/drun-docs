const express = require('express');
const db = require('../db/connection');
const router = express.Router();

// GET /api/tasks - 任务列表
router.get('/', (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    if (project_id) { sql += ' AND project_id = ?'; params.push(project_id); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    
    const tasks = db.prepare(sql).all(...params);
    tasks.forEach(t => {
      try { t.result = JSON.parse(t.result); } catch(e) {}
    });
    res.json({ code: 0, data: tasks });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// GET /api/tasks/:id - 任务详情(SSE进度推送)
router.get('/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    try { task.result = JSON.parse(task.result); } catch(e) {}
    res.json({ code: 0, data: task });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// SSE实时进度推送
router.get('/:id/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const taskId = req.params.id;
  const interval = setInterval(() => {
    const task = db.prepare('SELECT id, status, progress, error, result FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      clearInterval(interval);
      res.write('event: done\ndata: {}\n\n');
      res.end();
      return;
    }
    
    res.write(`data: ${JSON.stringify(task)}\n\n`);

    if (task.status === 'completed' || task.status === 'failed') {
      clearInterval(interval);
      setTimeout(() => res.end(), 1000);
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

module.exports = router;
