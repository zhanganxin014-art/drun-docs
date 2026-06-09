const express = require('express');
const db = require('../db/connection');
const router = express.Router();

// POST /api/videos/compose - 合成最终视频
router.post('/compose', async (req, res) => {
  try {
    const { project_id, storyboard_ids, options } = req.body;

    // 创建合成任务记录
    const taskResult = db.prepare(
      "INSERT INTO tasks (project_id, type, status) VALUES (?, 'compose_video', 'running')"
    ).run(project_id || null);

    // 调用合成服务
    const { composeVideo } = require('../services/compose-service');
    const videoPath = await composeVideo(project_id, storyboard_ids, options || {}, taskResult.lastInsertRowid);

    // 更新任务状态
    db.prepare("UPDATE tasks SET status = 'completed', progress = 100, result = ?, completed_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify({ video_path: videoPath }), taskResult.lastInsertRowid);

    res.json({
      code: 0,
      data: {
        task_id: taskResult.lastInsertRowid,
        video_url: `${require('../config').storage.url}${videoPath}`,
        video_path: videoPath,
      },
    });
  } catch (err) {
    console.error('[Compose Error]', err);
    res.status(500).json({ error: err.message, code: 'COMPOSE_ERROR' });
  }
});

// POST /api/videos/generate - 用Kling为单个分镜生成视频
router.post('/generate', async (req, res) => {
  try {
    const { storyboard_id, motion, duration, mode, klingMode, model } = req.body;

    if (!storyboard_id) {
      return res.status(400).json({ error: '缺少 storyboard_id', code: 'INVALID_PARAM' });
    }

    const { generateVideo } = require('../services/video-service');

    // 在后台启动Kling视频生成（fire-and-forget模式，前端轮询task状态）
    const result = await generateVideo(storyboard_id, {
      model: model || undefined,
      motion: motion || 'dialogue',
      duration: duration || 5,
      mode: mode || 'Standard',
      klingMode: klingMode !== false,
    });

    res.json({
      code: 0,
      data: result,
    });
  } catch (err) {
    console.error('[Generate Error]', err);
    res.status(500).json({ 
      error: err.message, 
      code: 'GENERATE_ERROR',
      fallback: true,
    });
  }
});

// POST /api/videos/batch-generate - 批量Kling生成多个分镜视频
router.post('/batch-generate', async (req, res) => {
  try {
    const { storyboard_ids, motion, duration, mode, concurrency, model, negative_prompt } = req.body;

    if (!storyboard_ids || !Array.isArray(storyboard_ids) || storyboard_ids.length === 0) {
      return res.status(400).json({ error: '缺少 storyboard_ids 或格式错误', code: 'INVALID_PARAM' });
    }

    // 立即返回，后台执行
    res.json({
      code: 0,
      data: {
        message: `已启动 ${storyboard_ids.length} 个分镜的视频生成任务（Kling模式）`,
        storyboard_count: storyboard_ids.length,
      },
    });

    // 后台批量生成
    const { batchGenerateVideos } = require('../services/video-service');
    batchGenerateVideos(storyboard_ids, {
      model: model || undefined,
      motion: motion || 'dialogue',
      duration: duration || 5,
      mode: mode || 'Standard',
      negative_prompt: negative_prompt || undefined,
      concurrency: concurrency || 2, // Kling限制并发
    }).then(results => {
      const successCount = results.filter(r => !r.error && !r.fallback).length;
      console.log(`[BatchGenerate] 完成: ${successCount}/${results.length} 个分镜视频生成成功`);
    }).catch(err => {
      console.error('[BatchGenerate] 批量生成失败:', err);
    });
  } catch (err) {
    console.error('[BatchGenerate Error]', err);
    res.status(500).json({ error: err.message, code: 'BATCH_ERROR' });
  }
});

// POST /api/videos/compose-with-kling - Kling/Seedance模式一键合成
// 先为所有分镜生成视频片段，再拼接成完整视频
router.post('/compose-with-kling', async (req, res) => {
  try {
    const { project_id, storyboard_ids, options } = req.body;

    // 1. 创建合成任务
    const taskResult = db.prepare(
      "INSERT INTO tasks (project_id, type, status, progress) VALUES (?, 'compose_video_kling', 'running', 0)"
    ).run(project_id || null);

    const composeTaskId = taskResult.lastInsertRowid;

    // 2. 立即返回任务ID，后台执行
    res.json({
      code: 0,
      data: {
        task_id: composeTaskId,
        message: '视频合成已启动，请轮询 /api/tasks/:id 查看进度',
      },
    });

    // 3. 后台执行
    (async () => {
      try {
        const { batchGenerateVideos } = require('../services/video-service');
        const ids = storyboard_ids || [];

        // 3a. 获取所有分镜
        let storyboards;
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          storyboards = db.prepare(`SELECT * FROM storyboards WHERE id IN (${placeholders})`).all(...ids);
        } else {
          storyboards = db.prepare('SELECT * FROM storyboards WHERE project_id = ? ORDER BY scene_index ASC').all(project_id);
        }

        if (storyboards.length === 0) {
          throw new Error('没有找到分镜');
        }

        // 更新进度：视频生成阶段开始
        db.prepare("UPDATE tasks SET progress = 5 WHERE id = ?").run(composeTaskId);

        // 3b. 逐个生成视频（带实时进度更新）
        const { generateVideo } = require('../services/video-service');
        const total = storyboards.length;
        const results = [];

        for (let i = 0; i < total; i++) {
          const sb = storyboards[i];
          // 进度: 5% ~ 50%，按完成比例分配
          const progress = 5 + Math.round((i / total) * 45);
          db.prepare("UPDATE tasks SET progress = ? WHERE id = ?").run(progress, composeTaskId);
          console.log(`[ComposeWithVideo] 生成分镜 ${i+1}/${total} (${progress}%)`);

          try {
            const r = await generateVideo(sb.id, {
              model: options?.model || undefined,
              motion: options?.motion || 'dialogue',
              duration: options?.duration || 5,
              mode: options?.mode || 'Standard',
              negative_prompt: options?.negative_prompt || undefined,
            });
            results.push(r);
          } catch (err) {
            console.error(`[ComposeWithVideo] 分镜${sb.id}失败:`, err.message);
            results.push({ error: err.message, fallback: true });
          }
        }

        // 视频生成阶段完成
        db.prepare("UPDATE tasks SET progress = 50 WHERE id = ?").run(composeTaskId);

        const successCount = results.filter(r => !r.error && !r.fallback).length;
        console.log(`[ComposeWithVideo] 视频生成阶段完成: ${successCount}/${total}`);

        const sbIds = storyboards.map(s => s.id);

        // 3c. 用FFmpeg拼接 (50% → 95%)
        db.prepare("UPDATE tasks SET progress = 55 WHERE id = ?").run(composeTaskId);
        const { composeVideo } = require('../services/compose-service');
        const videoPath = await composeVideo(project_id, sbIds, options || {}, composeTaskId);

        // 完成
        db.prepare("UPDATE tasks SET status = 'completed', progress = 100, result = ?, completed_at = datetime('now') WHERE id = ?")
          .run(JSON.stringify({ video_path: videoPath, video_success_count: successCount }), composeTaskId);

        console.log(`[ComposeWithVideo] 完成: ${videoPath}`);
      } catch (err) {
        console.error('[ComposeWithVideo] 失败:', err);
        db.prepare("UPDATE tasks SET status = 'failed', result = ?, completed_at = datetime('now') WHERE id = ?")
          .run(JSON.stringify({ error: err.message }), composeTaskId);
      }
    })();
  } catch (err) {
    console.error('[ComposeWithVideo Error]', err);
    res.status(500).json({ error: err.message, code: 'COMPOSE_VIDEO_ERROR' });
  }
});

// POST /api/videos/compose-existing - 仅拼接已有视频（不自动生成新视频）
router.post('/compose-existing', async (req, res) => {
  try {
    const { project_id, storyboard_ids, options } = req.body;

    // 1. 创建合成任务
    const taskResult = db.prepare(
      "INSERT INTO tasks (project_id, type, status, progress) VALUES (?, 'compose_video_existing', 'running', 0)"
    ).run(project_id || null);

    const composeTaskId = taskResult.lastInsertRowid;

    // 2. 立即返回任务ID，后台执行
    res.json({
      code: 0,
      data: {
        task_id: composeTaskId,
        message: '视频拼接已启动，请轮询 /api/tasks/:id 查看进度',
      },
    });

    // 3. 后台执行（仅拼接，不生成）
    (async () => {
      try {
        const ids = storyboard_ids || [];

        // 获取所有分镜
        let storyboards;
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          storyboards = db.prepare(`SELECT * FROM storyboards WHERE id IN (${placeholders})`).all(...ids);
        } else {
          storyboards = db.prepare('SELECT * FROM storyboards WHERE project_id = ? ORDER BY scene_index ASC').all(project_id);
        }

        if (storyboards.length === 0) {
          throw new Error('没有找到分镜');
        }

        // 检查有无已生成视频的分镜
        const hasVideos = storyboards.filter(s => s.video_path);
        if (hasVideos.length === 0) {
          throw new Error('没有已生成视频的分镜，请先生成视频再合成');
        }

        db.prepare("UPDATE tasks SET progress = 10 WHERE id = ?").run(composeTaskId);
        console.log(`[ComposeExisting] 拼接 ${hasVideos.length}/${storyboards.length} 个已有视频分镜...`);

        // 直接用FFmpeg拼接
        const { composeVideo } = require('../services/compose-service');
        const sbIds = storyboards.map(s => s.id);
        const videoPath = await composeVideo(project_id, sbIds, options || {}, composeTaskId);

        // 完成
        db.prepare("UPDATE tasks SET status = 'completed', progress = 100, result = ?, completed_at = datetime('now') WHERE id = ?")
          .run(JSON.stringify({ video_path: videoPath, composed_count: hasVideos.length, total_count: storyboards.length }), composeTaskId);

        console.log(`[ComposeExisting] 完成: ${videoPath}`);
      } catch (err) {
        console.error('[ComposeExisting] 失败:', err);
        db.prepare("UPDATE tasks SET status = 'failed', result = ?, completed_at = datetime('now') WHERE id = ?")
          .run(JSON.stringify({ error: err.message }), composeTaskId);
      }
    })();
  } catch (err) {
    console.error('[ComposeExisting Error]', err);
    res.status(500).json({ error: err.message, code: 'COMPOSE_EXISTING_ERROR' });
  }
});

// GET /api/videos/:project_id/info - 获取视频信息
router.get('/:project_id/info', (req, res) => {
  try {
    const videos = db.prepare("SELECT * FROM assets WHERE project_id = ? AND type = 'video'")
      .all(req.params.project_id);
    res.json({ code: 0, data: videos });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

module.exports = router;
