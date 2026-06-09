const express = require('express');
const db = require('../db/connection');
const upload = require('../middleware/upload');
const path = require('path');
const config = require('../config');
const router = express.Router();

// GET /api/projects/:id/assets - 素材列表
router.get('/projects/:id/assets', (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM assets WHERE project_id = ?';
    const params = [req.params.id];
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    sql += ' ORDER BY created_at DESC';
    const assets = db.prepare(sql).all(...params);
    assets.forEach(a => {
      try { a.metadata = JSON.parse(a.metadata); } catch(e) { a.metadata = {}; }
    });
    res.json({ code: 0, data: assets });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/assets/upload - 上传素材
router.post('/assets/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件', code: 'NO_FILE' });

    const { project_id, type, name } = req.body;
    
    // 确定文件类型
    let assetType = type || 'image';
    if (!type) {
      if (req.file.mimetype.startsWith('image')) assetType = 'scene';
      else if (req.file.mimetype.startsWith('video')) assetType = 'video';
      else if (req.file.mimetype.startsWith('audio')) assetType = 'audio';
    }

    // 构建相对路径
    const relativePath = path.relative(config.storage.path, req.file.path).replace(/\\/g, '/');

    const result = db.prepare(
      'INSERT INTO assets (project_id, type, name, file_path, source) VALUES (?,?,?,?,?)'
    ).run(project_id || null, assetType, name || req.file.originalname, `/${path.basename(path.dirname(req.file.path))}/${path.basename(req.file.path)}`, 'uploaded');

    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(result.lastInsertRowid);
    // 添加完整URL
    asset.url = `${config.storage.url}${asset.file_path}`;
    try { asset.metadata = JSON.parse(asset.metadata); } catch(e) { asset.metadata = {}; }
    res.status(201).json({ code: 0, data: asset });

  } catch (err) {
    console.error('[Upload Error]', err);
    res.status(500).json({ error: err.message, code: 'UPLOAD_ERROR' });
  }
});

// DELETE /api/assets/:id - 删除素材
router.delete('/assets/:id', (req, res) => {
  try {
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    if (!asset) return res.status(404).json({ error: '素材不存在' });

    // 尝试删除物理文件
    if (asset.file_path) {
      const fullPath = path.join(config.storage.path, asset.file_path);
      try { require('fs').unlinkSync(fullPath); } catch(e) {}
    }

    db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

module.exports = router;
