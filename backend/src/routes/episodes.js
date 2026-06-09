const express = require('express');
const db = require('../db/connection');
const router = express.Router();

// GET /api/projects/:id/episodes - 集列表
router.get('/projects/:id/episodes', (req, res) => {
  try {
    const episodes = db.prepare(
      'SELECT * FROM episodes WHERE project_id = ? ORDER BY episode_number ASC'
    ).all(req.params.id);
    res.json({ code: 0, data: episodes });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/projects/:id/episodes - 手动创建集
router.post('/projects/:id/episodes', (req, res) => {
  try {
    const projectId = req.params.id;
    const { episode_number, title, summary } = req.body;
    if (!title) return res.status(400).json({ error: '集标题不能为空' });

    const result = db.prepare(
      'INSERT INTO episodes (project_id, episode_number, title, summary) VALUES (?,?,?,?)'
    ).run(projectId, episode_number || 1, title, summary || '');

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ code: 0, data: episode });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'EPISODE_ERROR' });
  }
});

// PUT /api/episodes/:id - 更新集
router.put('/episodes/:id', (req, res) => {
  try {
    const { episode_number, title, summary, status } = req.body;
    const existing = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '集不存在', code: 'NOT_FOUND' });

    db.prepare(`
      UPDATE episodes SET
        episode_number = COALESCE(?, episode_number),
        title = COALESCE(?, title),
        summary = COALESCE(?, summary),
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(episode_number, title, summary, status, req.params.id);

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    res.json({ code: 0, data: episode });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// DELETE /api/episodes/:id - 删除集
router.delete('/episodes/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM episodes WHERE id = ?').run(req.params.id);
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

module.exports = router;
