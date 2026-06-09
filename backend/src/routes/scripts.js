const express = require('express');
const db = require('../db/connection');
const router = express.Router();

// POST /api/projects/:id/scripts - AI生成/保存剧本
router.post('/projects/:id/scripts', async (req, res) => {
  try {
    const { content, raw_text, title, action } = req.body; // action=generate|save
    const projectId = req.params.id;

    // 检查项目是否存在
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: '项目不存在', code: 'NOT_FOUND' });

    if (action === 'generate') {
      // AI生成剧本 - 调用AI服务
      const { aiGenerateScript, syncEpisodesAndScenes } = require('../services/script-service');
      const result = await aiGenerateScript(raw_text || '', projectId);
      
      // 保存生成的剧本
      const existing = db.prepare('SELECT id FROM scripts WHERE project_id = ?').get(projectId);
      if (existing) {
        db.prepare('UPDATE scripts SET content = ?, raw_text = ?, title = ?, status = \'completed\' WHERE project_id = ?')
          .run(JSON.stringify(result.script), raw_text || '', result.title, projectId);
      } else {
        db.prepare('INSERT INTO scripts (project_id, content, raw_text, title, status) VALUES (?,?,?,?,?)')
          .run(projectId, JSON.stringify(result.script), raw_text || '', result.title, 'completed');
      }

      // 同步 episodes 和 scenes 表
      syncEpisodesAndScenes(projectId);

      // 更新项目状态
      db.prepare("UPDATE projects SET status = 'scripting', updated_at = datetime('now') WHERE id = ?").run(projectId);

      return res.json({ code: 0, data: result });
    }

    // 直接保存剧本内容
    if (content) {
      const existing = db.prepare('SELECT id FROM scripts WHERE project_id = ?').get(projectId);
      if (existing) {
        db.prepare('UPDATE scripts SET content = ?, raw_text = COALESCE(?,raw_text), title = COALESCE(?,title) WHERE project_id = ?')
          .run(content, raw_text, title, projectId);
      } else {
        db.prepare('INSERT INTO scripts (project_id, content, raw_text, title) VALUES (?,?,?,?)')
          .run(projectId, content, raw_text || null, title || null);
      }
      db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
    }

    const script = db.prepare('SELECT * FROM scripts WHERE project_id = ?').get(projectId);
    res.json({ code: 0, data: script });

  } catch (err) {
    console.error('[Scripts Error]', err);
    res.status(500).json({ error: err.message, code: 'SCRIPT_ERROR' });
  }
});

// GET /api/projects/:id/scripts - 获取剧本
router.get('/projects/:id/scripts', (req, res) => {
  try {
    const script = db.prepare('SELECT * FROM scripts WHERE project_id = ?').get(req.params.id);
    res.json({ code: 0, data: script || null });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

module.exports = router;
