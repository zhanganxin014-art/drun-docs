const express = require('express');
const db = require('../db/connection');
const router = express.Router();

// GET /api/projects - 项目列表
router.get('/', (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM scripts s WHERE s.project_id = p.id) as script_count,
        (SELECT COUNT(*) FROM characters c WHERE c.project_id = p.id) as character_count,
        (SELECT COUNT(*) FROM storyboards sb WHERE sb.project_id = p.id) as storyboard_count
      FROM projects p 
      ORDER BY p.updated_at DESC
    `).all();
    res.json({ code: 0, data: projects });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/projects - 创建项目
router.post('/', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: '项目名称不能为空', code: 'NAME_REQUIRED' });

    const result = db.prepare(
      'INSERT INTO projects (name, description) VALUES (?, ?)'
    ).run(name, description || '');

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ code: 0, data: project });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// GET /api/projects/:id - 项目详情
router.get('/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: '项目不存在', code: 'NOT_FOUND' });
    res.json({ code: 0, data: project });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// PUT /api/projects/:id - 更新项目
router.put('/:id', (req, res) => {
  try {
    const { name, description, status, cover_image } = req.body;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '项目不存在', code: 'NOT_FOUND' });

    db.prepare(`
      UPDATE projects SET 
        name = COALESCE(? , name),
        description = COALESCE(? , description),
        status = COALESCE(? , status),
        cover_image = COALESCE(? , cover_image),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(name, description, status, cover_image, req.params.id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ code: 0, data: project });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// DELETE /api/projects/:id - 删除项目
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '项目不存在', code: 'NOT_FOUND' });

    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

module.exports = router;
