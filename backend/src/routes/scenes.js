const express = require('express');
const db = require('../db/connection');
const router = express.Router();

// GET /api/projects/:id/scenes - 场景列表
router.get('/projects/:id/scenes', (req, res) => {
  try {
    const scenes = db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY id ASC').all(req.params.id);
    res.json({ code: 0, data: scenes });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/projects/:id/scenes - AI提取场景或手动创建
router.post('/projects/:id/scenes', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { name, description, prompt_text, action } = req.body;

    if (action === 'extract_from_script') {
      const { extractScenes } = require('../services/script-service');
      const scenes = await extractScenes(projectId);
      
      // 先返回场景列表，后台并发生成背景图
      res.json({ code: 0, data: scenes });
      
      const { generateImage } = require('../services/image-service');
      const pending = scenes.filter(s => !s.image_path);
      if (pending.length > 0) {
        batchGenerateScenes(pending, generateImage);
      }
      return;
    }

    // 手动创建场景
    if (!name) return res.status(400).json({ error: '场景名称不能为空' });

    const result = db.prepare(
      'INSERT INTO scenes (project_id, name, description, prompt_text) VALUES (?,?,?,?)'
    ).run(projectId, name, description || '', prompt_text || '');

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ code: 0, data: scene });

  } catch (err) {
    console.error('[Scene Error]', err);
    res.status(500).json({ error: err.message, code: 'SCENE_ERROR' });
  }
});

// PUT /api/scenes/:id - 更新场景
router.put('/scenes/:id', (req, res) => {
  try {
    const { name, description, prompt_text, image_path } = req.body;
    
    const existing = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '场景不存在', code: 'NOT_FOUND' });

    db.prepare(`
      UPDATE scenes SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        prompt_text = COALESCE(?, prompt_text),
        image_path = COALESCE(?, image_path)
      WHERE id = ?
    `).run(name, description, prompt_text, image_path, req.params.id);

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id);
    res.json({ code: 0, data: scene });

  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// DELETE /api/scenes/:id - 删除场景
router.delete('/scenes/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM scenes WHERE id = ?').run(req.params.id);
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/scenes/:id/generate - AI生成场景背景图
router.post('/scenes/:id/generate', async (req, res) => {
  try {
    const { generateImage } = require('../services/image-service');
    const result = await generateImage('scene', req.params.id, req.body);
    res.json({ code: 0, data: result });
  } catch (err) {
    console.error('[Scene Generate Error]', err);
    res.status(500).json({ error: err.message, code: 'GENERATE_ERROR' });
  }
});

async function batchGenerateScenes(items, generateFn) {
  console.log(`[BatchGenerate] 后台开始为 ${items.length} 个场景生成背景图...`);
  const LIMIT = 3;
  for (let i = 0; i < items.length; i += LIMIT) {
    const batch = items.slice(i, i + LIMIT);
    await Promise.allSettled(
      batch.map(item => generateFn('scene', item.id).catch(e =>
        console.error(`[BatchGenerate] 场景「${item.name}」生图失败:`, e.message)
      ))
    );
  }
  console.log(`[BatchGenerate] 全部场景背景图生成完成`);
}

module.exports = router;
