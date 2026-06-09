const express = require('express');
const db = require('../db/connection');
const router = express.Router();

/**
 * 将 storyboards 的 character_ids 从 ID 数组解析为 {id, name}[] 便于前端展示
 */
function resolveCharacterNames(storyboards, projectId) {
  const characters = db.prepare('SELECT id, name FROM characters WHERE project_id = ?').all(projectId);
  const charMap = {};
  for (const c of characters) { charMap[c.id] = c.name; }

  for (const s of storyboards) {
    try {
      const ids = JSON.parse(s.character_ids || '[]');
      s.character_ids = ids.map(id => ({
        id: typeof id === 'number' ? id : (charMap[id] ? id : null),
        name: charMap[id] || (typeof id === 'string' ? id : String(id)),
      })).filter(c => c.name);
    } catch(e) { s.character_ids = []; }
    try { s.video_params = JSON.parse(s.video_params || '{}'); } catch(e) { s.video_params = {}; }
    // 解析 character_actions 并注入角色名
    try {
      const actions = JSON.parse(s.character_actions || '[]');
      for (const ca of actions) {
        if (ca.character_id && !ca.name) {
          ca.name = charMap[ca.character_id] || '';
        }
      }
      s.character_actions = actions;
    } catch(e) { s.character_actions = []; }
  }
}

// GET /api/projects/:id/storyboards - 分镜列表（支持 ?episode_id= 过滤）
router.get('/projects/:id/storyboards', (req, res) => {
  try {
    const projectId = req.params.id;
    const episodeId = req.query.episode_id ? Number(req.query.episode_id) : null;

    let sql = 'SELECT * FROM storyboards WHERE project_id = ?';
    const params = [projectId];
    if (episodeId) {
      sql += ' AND episode_id = ?';
      params.push(episodeId);
    }
    sql += ' ORDER BY episode_id ASC, scene_number ASC, scene_index ASC';

    const storyboards = db.prepare(sql).all(...params);

    const fs = require('fs');
    const path = require('path');
    const storagePath = path.join(__dirname, '../../data/storage');

    resolveCharacterNames(storyboards, projectId);

    storyboards.forEach(s => {
      s.video_available = false;
      if (s.video_path && s.video_path.startsWith('/videos/')) {
        const filePath = path.join(storagePath, s.video_path);
        s.video_available = fs.existsSync(filePath);
      }
    });

    res.json({ code: 0, data: storyboards });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/projects/:id/storyboards - AI生成分镜 / 手动添加
router.post('/projects/:id/storyboards', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { action, storyboard_data } = req.body;

    if (action === 'ai_generate') {
      const { generateStoryboards } = require('../services/script-service');
      const result = await generateStoryboards(projectId);
      db.prepare("UPDATE projects SET status = 'storyboard', updated_at = datetime('now') WHERE id = ?")
        .run(projectId);

      resolveCharacterNames(result, projectId);
      res.json({ code: 0, data: result });

      // 后台：先确保角色/场景有定妆照，再生分镜图
      const { generateImage, ensureProjectAssets } = require('../services/image-service');
      const pending = result.filter(s => !s.image_path);
      if (pending.length > 0) {
        batchGenerateStoryboards(pending, generateImage, projectId, ensureProjectAssets);
      }
      return;
    }

    // 手动添加分镜
    if (storyboard_data) {
      const { episode_id, scene_number, scene_index, shot_type, description, prompt_text, duration, dialogue_text, character_ids, character_actions } = storyboard_data;
      // character_ids 从前端传来的是 {id, name}[] 或纯 ID 数组，提取纯 ID
      const rawIds = character_ids || [];
      const pureIds = rawIds.map(c => (typeof c === 'object' ? c.id : c)).filter(Boolean);
      // character_actions 存储为 JSON
      const charActions = character_actions || [];

      const result = db.prepare(`
        INSERT INTO storyboards (project_id, episode_id, scene_number, scene_index, shot_type, description, prompt_text, duration, dialogue_text, character_ids, character_actions)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(projectId, episode_id || null, scene_number || 1, scene_index || 0, shot_type || '\u4e2d\u666f', description || '',
             prompt_text || '', duration || 3.0, dialogue_text || '', JSON.stringify(pureIds), JSON.stringify(charActions));

      const sb = db.prepare('SELECT * FROM storyboards WHERE id = ?').get(result.lastInsertRowid);
      resolveCharacterNames([sb], projectId);
      return res.status(201).json({ code: 0, data: sb });
    }

    res.status(400).json({ error: '\u8bf7\u63d0\u4f9baction\u6216storyboard_data\u53c2\u6570' });

  } catch (err) {
    console.error('[Storyboard Error]', err);
    res.status(500).json({ error: err.message, code: 'STORYBOARD_ERROR' });
  }
});

// PUT /api/storyboards/:id - 更新分镜
router.put('/storyboards/:id', (req, res) => {
  try {
    const { episode_id, scene_number, scene_index, shot_type, description, prompt_text, duration, dialogue_text, character_ids, character_actions } = req.body;
    // character_ids 从前端传来的是 {id, name}[] 或纯 ID 数组
    const rawIds = character_ids || [];
    const pureIds = rawIds.map(c => (typeof c === 'object' ? c.id : c)).filter(Boolean);

    db.prepare(`
      UPDATE storyboards SET
        episode_id = COALESCE(?, episode_id),
        scene_number = COALESCE(?, scene_number),
        scene_index = COALESCE(?, scene_index),
        shot_type = COALESCE(?, shot_type),
        description = COALESCE(?, description),
        prompt_text = COALESCE(?, prompt_text),
        duration = COALESCE(?, duration),
        dialogue_text = COALESCE(?, dialogue_text),
        character_ids = COALESCE(?, character_ids),
        character_actions = COALESCE(?, character_actions)
      WHERE id = ?
    `).run(episode_id, scene_number, scene_index, shot_type, description, prompt_text, duration, dialogue_text,
           character_ids ? JSON.stringify(pureIds) : undefined, 
           character_actions !== undefined ? JSON.stringify(character_actions) : undefined,
           req.params.id);

    const sb = db.prepare('SELECT * FROM storyboards WHERE id = ?').get(req.params.id);
    const projectId = sb.project_id;
    resolveCharacterNames([sb], projectId);
    res.json({ code: 0, data: sb });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// DELETE /api/storyboards/:id - 删除分镜
router.delete('/storyboards/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM storyboards WHERE id = ?').run(req.params.id);
    res.json({ code: 0, message: '\u5220\u9664\u6210\u529f' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// PATCH /api/storyboards/:id/video-params
router.patch('/storyboards/:id/video-params', (req, res) => {
  try {
    const sb = db.prepare('SELECT id FROM storyboards WHERE id = ?').get(req.params.id);
    if (!sb) return res.status(404).json({ error: '\u5206\u955c\u4e0d\u5b58\u5728' });

    const params = req.body;
    const clean = {};
    const validKeys = ['model', 'motion', 'mode', 'duration', 'negative_prompt', 'style_tags', 'character_actions'];
    for (const k of validKeys) {
      if (params[k] !== undefined) clean[k] = params[k];
    }

    db.prepare("UPDATE storyboards SET video_params = ? WHERE id = ?")
      .run(JSON.stringify(clean), req.params.id);

    res.json({ code: 0, data: { id: Number(req.params.id), video_params: clean } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/storyboards/:id/generate-image
router.post('/storyboards/:id/generate-image', async (req, res) => {
  try {
    const { generateImage } = require('../services/image-service');
    const result = await generateImage('storyboard', req.params.id, req.body);
    res.json({ code: 0, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'GENERATE_ERROR' });
  }
});

// GET /api/storyboards/:id/video-prompt - 预览视频提示词
router.get('/storyboards/:id/video-prompt', (req, res) => {
  try {
    const sb = db.prepare('SELECT * FROM storyboards WHERE id = ?').get(req.params.id);
    if (!sb) return res.status(404).json({ error: '分镜不存在' });

    let savedParams = {};
    try { savedParams = JSON.parse(sb.video_params || '{}'); } catch(e) {}
    const mergedOptions = { ...savedParams, ...req.query };

    // 注入 DB 中的 character_actions
    if (!mergedOptions.character_actions) {
      try {
        const dbCharActions = JSON.parse(sb.character_actions || '[]');
        if (dbCharActions.length > 0) {
          for (const ca of dbCharActions) {
            if (ca.character_id && !ca.name) {
              const ch = db.prepare('SELECT name FROM characters WHERE id = ?').get(ca.character_id);
              if (ch) ca.name = ch.name;
            }
          }
          mergedOptions.character_actions = dbCharActions;
        }
      } catch(e) {}
    }

    const { buildVideoPrompt } = require('../services/video-service');
    const prompt = buildVideoPrompt(sb, mergedOptions);

    res.json({ code: 0, data: { prompt, storyboard_id: Number(req.params.id) } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'PROMPT_ERROR' });
  }
});

// POST /api/storyboards/:id/generate-video
router.post('/storyboards/:id/generate-video', async (req, res) => {
  try {
    const { generateVideo } = require('../services/video-service');
    const result = await generateVideo(req.params.id, req.body);
    res.json({ code: 0, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'VIDEO_ERROR' });
  }
});

async function batchGenerateStoryboards(items, generateFn, projectId, ensureProjectAssets) {
  console.log(`[BatchGenerate] 准备为 ${items.length} 个分镜生成图片...`);

  // 第一步：确保关联的角色/场景有定妆照
  if (ensureProjectAssets && projectId) {
    try {
      console.log(`[BatchGenerate] 检查并生成缺失的角色/场景定妆照...`);
      const assetResult = await ensureProjectAssets(projectId);
      console.log(`[BatchGenerate] 资产准备: 新生成${assetResult.generated}, 已就绪${assetResult.skipped}`);
    } catch (e) {
      console.error(`[BatchGenerate] 资产准备异常:`, e.message);
    }
  }

  // 第二步：并发生成分镜图（每批最多3个）
  console.log(`[BatchGenerate] 后台开始为 ${items.length} 个分镜生成图片...`);
  const LIMIT = 3;
  for (let i = 0; i < items.length; i += LIMIT) {
    const batch = items.slice(i, i + LIMIT);
    await Promise.allSettled(
      batch.map(item => generateFn('storyboard', item.id).catch(e =>
        console.error(`[BatchGenerate] 分镜 ${item.scene_index} 生图失败:`, e.message)
      ))
    );
  }
  console.log(`[BatchGenerate] 全部分镜图生成完成`);
}

module.exports = router;
