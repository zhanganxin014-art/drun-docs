const express = require('express');
const db = require('../db/connection');
const upload = require('../middleware/upload');
const router = express.Router();

// GET /api/projects/:id/characters - 角色列表
router.get('/projects/:id/characters', (req, res) => {
  try {
    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY id ASC').all(req.params.id);
    // 解析images JSON
    characters.forEach(c => {
      try { c.images = JSON.parse(c.images); } catch(e) { c.images = []; }
    });
    res.json({ code: 0, data: characters });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/projects/:id/characters - AI提取角色或手动创建
router.post('/projects/:id/characters', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { name, description, prompt_text, action } = req.body;

    if (action === 'extract_from_script') {
      // 从剧本AI自动提取角色
      const { extractCharacters } = require('../services/script-service');
      const characters = await extractCharacters(projectId);
      
      // 先返回角色列表，后台并发生成形象图（不阻塞）
      res.json({ code: 0, data: characters });
      
      // fire-and-forget 后台生图
      const { generateImage } = require('../services/image-service');
      const pending = characters.filter(c => !c.images || c.images.length === 0);
      if (pending.length > 0) {
        batchGenerate(pending, generateImage);
      }
      return;
    }

    // 手动创建角色
    if (!name) return res.status(400).json({ error: '角色名称不能为空' });

    const result = db.prepare(
      'INSERT INTO characters (project_id, name, description, prompt_text) VALUES (?,?,?,?)'
    ).run(projectId, name, description || '', prompt_text || '');

    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
    character.images = [];
    res.status(201).json({ code: 0, data: character });

  } catch (err) {
    console.error('[Character Error]', err);
    res.status(500).json({ error: err.message, code: 'CHARACTER_ERROR' });
  }
});

// PUT /api/characters/:id - 更新角色
router.put('/characters/:id', (req, res) => {
  try {
    const { name, description, prompt_text, voice_id, voice_text, reference_audio_path, reference_image_path, images } = req.body;
    
    const existing = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '角色不存在', code: 'NOT_FOUND' });

    db.prepare(`
      UPDATE characters SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        prompt_text = COALESCE(?, prompt_text),
        voice_id = COALESCE(?, voice_id),
        voice_text = COALESCE(?, voice_text),
        reference_audio_path = COALESCE(?, reference_audio_path),
        reference_image_path = COALESCE(?, reference_image_path),
        images = COALESCE(?, images)
      WHERE id = ?
    `).run(name, description, prompt_text, voice_id, voice_text, reference_audio_path, reference_image_path,
           images ? JSON.stringify(images) : undefined, req.params.id);

    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    try { character.images = JSON.parse(character.images); } catch(e) { character.images = []; }
    res.json({ code: 0, data: character });

  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// DELETE /api/characters/:id - 删除角色
router.delete('/characters/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/characters/:id/generate - AI生成角色形象
router.post('/characters/:id/generate', async (req, res) => {
  try {
    const { generateImage } = require('../services/image-service');
    const result = await generateImage('character', req.params.id, req.body);
    res.json({ code: 0, data: result });
  } catch (err) {
    console.error('[Char Generate Error]', err);
    res.status(500).json({ error: err.message, code: 'GENERATE_ERROR' });
  }
});

// POST /api/characters/:id/upload-reference - 上传角色参考照片
router.post('/characters/:id/upload-reference', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择图片文件', code: 'NO_FILE' });

    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!character) return res.status(404).json({ error: '角色不存在', code: 'NOT_FOUND' });

    const relativePath = `/images/${req.file.filename}`;

    // 更新 reference_image_path
    db.prepare('UPDATE characters SET reference_image_path = ? WHERE id = ?').run(relativePath, req.params.id);

    // 同时加入 images 数组
    let images = [];
    try { images = JSON.parse(character.images); } catch(e) { images = []; }
    images.push(relativePath);
    db.prepare('UPDATE characters SET images = ? WHERE id = ?').run(JSON.stringify(images), req.params.id);

    // 插入资产表
    const projectId = character.project_id;
    db.prepare(
      'INSERT INTO assets (project_id, type, name, file_path, source) VALUES (?,?,?,?,?)'
    ).run(projectId, 'character_reference', character.name, relativePath, 'user_uploaded');

    const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    try { updated.images = JSON.parse(updated.images); } catch(e) { updated.images = []; }
    res.json({ code: 0, data: updated });
  } catch (err) {
    console.error('[Upload Reference Error]', err);
    res.status(500).json({ error: err.message, code: 'UPLOAD_ERROR' });
  }
});

// POST /api/characters/:id/generate-with-reference - 基于参考照片AI生成角色形象
router.post('/characters/:id/generate-with-reference', async (req, res) => {
  try {
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!character) return res.status(404).json({ error: '角色不存在', code: 'NOT_FOUND' });
    if (!character.reference_image_path) return res.status(400).json({ error: '请先上传参考照片', code: 'NO_REFERENCE' });

    const { generateImage } = require('../services/image-service');
    const result = await generateImage('character', req.params.id, {
      referenceImagePath: character.reference_image_path,
      ...req.body
    });
    res.json({ code: 0, data: result });
  } catch (err) {
    console.error('[Generate With Ref Error]', err);
    res.status(500).json({ error: err.message, code: 'GENERATE_ERROR' });
  }
});

// DELETE /api/characters/:id/reference - 删除参考照片
router.delete('/characters/:id/reference', (req, res) => {
  try {
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!character) return res.status(404).json({ error: '角色不存在', code: 'NOT_FOUND' });

    const refPath = character.reference_image_path;
    // 从 images 数组中也移除
    let images = [];
    try { images = JSON.parse(character.images); } catch(e) { images = []; }
    images = images.filter(p => p !== refPath);

    db.prepare('UPDATE characters SET reference_image_path = NULL, images = ? WHERE id = ?')
      .run(JSON.stringify(images), req.params.id);

    const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    try { updated.images = JSON.parse(updated.images); } catch(e) { updated.images = []; }
    res.json({ code: 0, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// 后台并发生图工具：每批最多3个，失败不中断
async function batchGenerate(items, generateFn) {
  console.log(`[BatchGenerate] 后台开始为 ${items.length} 个角色生成形象图...`);
  const LIMIT = 3;
  for (let i = 0; i < items.length; i += LIMIT) {
    const batch = items.slice(i, i + LIMIT);
    await Promise.allSettled(
      batch.map(item => generateFn('character', item.id).catch(e =>
        console.error(`[BatchGenerate] 「${item.name}」生图失败:`, e.message)
      ))
    );
  }
  console.log(`[BatchGenerate] 全部角色形象图生成完成`);
}

module.exports = router;

