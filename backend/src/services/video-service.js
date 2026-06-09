/**
 * 视频生成服务
 * 负责图生视频、文生视频
 * 支持Kling (可灵) 异步视频生成
 */
const ai = require('./ai-service');
const db = require('../db/connection');
const helpers = require('../utils/helpers');
const config = require('../config');

/**
 * 为分镜生成视频片段
 * @param {number} storyboardId - 分镜ID
 * @param {Object} options - {duration, motion, style, klingMode, mode, camera_control}
 * @returns {Object} 视频生成结果
 */
async function generateVideo(storyboardId, options = {}) {
  const sb = db.prepare('SELECT * FROM storyboards WHERE id = ?').get(storyboardId);
  if (!sb) throw new Error('分镜不存在');

  if (!sb.image_path) throw new Error('请先生成分镜图片再生成视频');

  // 合并 DB 中保存的分镜参数（video_params 作为默认值，请求体参数可覆盖）
  let savedParams = {};
  try { savedParams = JSON.parse(sb.video_params || '{}'); } catch(e) {}
  const mergedOptions = { ...savedParams, ...options };
  // 但是 options 里的空字符串/undefined 不应该覆盖已有值
  for (const k of Object.keys(mergedOptions)) {
    if (mergedOptions[k] === '' || mergedOptions[k] === undefined) {
      mergedOptions[k] = savedParams[k] !== undefined ? savedParams[k] : options[k];
    }
  }

  // 加载 DB 中的 character_actions 并注入角色名（如果请求体未提供）
  if (!mergedOptions.character_actions || mergedOptions.character_actions.length === 0) {
    try {
      const dbCharActions = JSON.parse(sb.character_actions || '[]');
      if (dbCharActions.length > 0) {
        // 注入角色名
        for (const ca of dbCharActions) {
          if (ca.character_id && !ca.name) {
            const ch = db.prepare('SELECT name FROM characters WHERE id = ?').get(ca.character_id);
            if (ch) ca.name = ch.name;
          }
        }
        mergedOptions.character_actions = dbCharActions;
      }
    } catch(e) { /* ignore */ }
  }

  // 判断模型类型（用于 camera_control 和 sourceTag）
  const model = mergedOptions.model || '';
  const isSeedance15 = model.toLowerCase().includes('seedance-v1.5');
  const isDoubao = model.toLowerCase().includes('doubao-seedance');
  const isKling = model.toLowerCase().includes('kling');

  // 创建任务记录
  const taskId = helpers.createTask(sb.project_id, 'generate_video', 'running');
  
  try {
    // 构建视频生成的提示词
    const videoPrompt = buildVideoPrompt(sb, mergedOptions);

    console.log(`[VideoService] 开始生成分镜#${storyboardId}的视频 (模型=${model || '默认'})...`);

    // 运镜参数映射（仅 Kling 支持 camera_control，Seedance/Doubao 不支持）
    let cameraControl = isKling ? mergedOptions.camera_control : null;
    if (!cameraControl && mergedOptions.motion && isKling) {
      cameraControl = mapMotionToCamera(mergedOptions.motion);
    }

    // 构建负面提示词（防止角色/场景漂移）
    const negativePrompt = buildNegativePrompt(sb, mergedOptions);

    // 收集 I2V 视觉参考图（角色定妆照 + 场景图）
    const referenceImages = collectReferenceImages(sb, isDoubao);

    // 调用AI视频生成（统一路由，自动适配参数）
    const result = await ai.generateVideo({
      model: mergedOptions.model || undefined,  // 默认 doubao-seedance-2.0
      prompt: videoPrompt,
      first_frame_url: `${config.storage.url}${sb.image_path}`, // 首帧图片URL
      reference_images: referenceImages,         // I2V视觉参考（仅doubao使用）
      // 统一参数（适配不同模型）
      duration: mergedOptions.duration || sb.duration || 4,
      resolution: mergedOptions.resolution || '480p',
      ratio: mergedOptions.aspect_ratio || '16:9',
      // Kling 专用参数
      mode: mergedOptions.mode,
      aspect_ratio: mergedOptions.aspect_ratio,
      seconds: mergedOptions.seconds,
      camera_control: cameraControl,
      // 可选参数
      negative_prompt: negativePrompt,
      onProgress: (status, elapsed) => {
        const progressMap = {
          'queued': 10,
          'pending': 15,
          'in_progress': Math.min(30 + Math.floor(elapsed / 2), 80),
          'completed': 95,
        };
        const progress = progressMap[status] || 50;
        db.prepare("UPDATE tasks SET progress = ? WHERE id = ?").run(progress, taskId);
        console.log(`[VideoService] 分镜#${storyboardId} ${model || '默认'}: ${status} (${elapsed}s, ${progress}%)`);
      },
    });

    // 处理返回结果 - 兼容Kling和Seedance格式
    let videoPath = null;

    if (result?.local_path) {
      videoPath = result.local_path;
      console.log(`[VideoService] 视频已下载: ${videoPath}`);
    } else if (result?.data?.[0]?.url) {
      videoPath = await downloadAndSaveVideo(result.data[0].url);
    } else if (typeof result === 'string' && result.startsWith('http')) {
      videoPath = await downloadAndSaveVideo(result);
    } else if (result?.video_url && result?.video_url.startsWith('http')) {
      videoPath = await downloadAndSaveVideo(result.video_url);
    } else if (result?.b64_json || result?.base64) {
      const saved = helpers.saveBase64Image(
        result.b64_json || result.base64, 'videos', '.mp4'
      );
      videoPath = saved.filePath;
    } else {
      console.warn('[VideoService] API未返回有效视频数据，使用静态图降级');
      videoPath = sb.image_path;
    }

    // 来源标签
    const sourceTag = isDoubao ? 'doubao' : (isSeedance15 ? 'seedance' : (isKling ? 'kling' : 'unknown'));

    // 更新数据库
    db.prepare("UPDATE storyboards SET video_path = ? WHERE id = ?")
      .run(videoPath, storyboardId);

    // 记录素材
    db.prepare(
      'INSERT INTO assets (project_id, type, name, file_path, source, metadata) VALUES (?,?,?,?,?,?)'
    ).run(sb.project_id, 'video', `视频_分镜${sb.scene_index}`, videoPath, 
       sourceTag,
       JSON.stringify({ 
         storyboard_id: storyboardId, 
         task_id: result?.task_id || null,
         model: model || 'auto',
       }));

    // 更新项目状态
    db.prepare("UPDATE projects SET status = 'generating', updated_at = datetime('now') WHERE id = ?")
      .run(sb.project_id);

    helpers.completeTask(taskId, { video_path: videoPath });

    return {
      task_id: taskId,
      video_path: videoPath,
      video_url: `${config.storage.url}${videoPath}`,
      storyboard_id: storyboardId,
      source_task_id: result?.task_id || null,
      model: model || 'auto',
    };

  } catch (err) {
    helpers.completeTask(taskId, null, err.message);

    // 如果视频生成失败，不要将图片路径写入 video_path（避免污染数据）
    // video_path 为 NULL 时表示该分镜没有可用视频
    if (err.message.includes('Kling') || err.message.includes('Seedance') || err.message.includes('超时') || err.message.includes('任务')) {
      console.log('[VideoService] 视频生成失败，已记录（video_path 保持为空）');
      
      return {
        task_id: taskId,
        fallback: true,
        video_path: null,
        video_url: null,
        message: `视频生成失败: ${err.message}。可重新尝试生成。`,
        storyboard_id: storyboardId,
      };
    }
    
    throw err;
  }
}

/**
 * 批量生成多个分镜的视频片段
 * 并发控制：最多同时3个
 */
async function batchGenerateVideos(storyboardIds, options = {}) {
  const results = [];
  const concurrency = options.concurrency || 3;
  
  for (let i = 0; i < storyboardIds.length; i += concurrency) {
    const batch = storyboardIds.slice(i, i + concurrency);
    console.log(`[VideoService] 批量生成第${i+1}-${Math.min(i+concurrency, storyboardIds.length)}/${storyboardIds.length}个分镜视频`);
    
    // 每个分镜用自己的 video_params（DB已保存），options 仅做全局 fallback
    const batchResults = await Promise.allSettled(
      batch.map(id => generateVideo(id, options.klingMode === false ? { klingMode: false } : {}))
    );
    
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        console.error('[VideoService] 分镜视频生成失败:', r.reason);
        results.push({ error: r.reason?.message || '未知错误' });
      }
    }
  }
  
  return results;
}

/**
 * 映射运镜风格到Kling camera_control
 */
function mapMotionToCamera(motion) {
  const motionMap = {
    slow_zoom: { type: 'simple', config: { zoom: 3 } },
    zoom_in: { type: 'simple', config: { zoom: 5 } },
    zoom_out: { type: 'simple', config: { zoom: -3 } },
    pan_left: { type: 'simple', config: { horizontal: -5 } },
    pan_right: { type: 'simple', config: { horizontal: 5 } },
    tilt_up: { type: 'simple', config: { vertical: 3 } },
    tilt_down: { type: 'simple', config: { vertical: -3 } },
  };
  return motionMap[motion] || null;
}

/**
 * 收集 I2V 视觉参考图
 * 从分镜关联的角色和场景中提取画像URL，用于 doubao-seedance-2.0 的 image_urls
 * 控制总数<=4张（1首帧 + 最多3张参考），避免请求体过大
 * 
 * @param {Object} sb - storyboard 记录
 * @param {boolean} isDoubao - 是否为 doubao 模型（仅 doubao 支持多图参考）
 * @returns {string[]} 参考图完整URL数组
 */
function collectReferenceImages(sb, isDoubao = true) {
  if (!isDoubao) return [];
  
  const refs = [];
  
  try {
    const charIds = JSON.parse(sb.character_ids || '[]');
    for (const cid of charIds) {
      if (refs.length >= 3) break;
      const ch = db.prepare('SELECT images, reference_image_path FROM characters WHERE id = ?').get(cid);
      if (!ch) continue;
      // 优先使用用户上传的参考照片（真人照一致性更好）
      if (ch.reference_image_path) {
        refs.push(`${config.storage.url}${ch.reference_image_path}`);
        if (refs.length >= 3) break;
      }
      // 补充AI生成的定妆照
      const imgs = JSON.parse(ch.images || '[]');
      for (const img of imgs) {
        if (refs.length >= 3) break;
        if (img && img !== ch.reference_image_path) refs.push(`${config.storage.url}${img}`);
      }
    }
  } catch (e) {
    console.warn('[VideoService] 收集角色参考图失败:', e.message);
  }

  try {
    if (refs.length < 3 && sb.scene_id) {
      const scene = db.prepare('SELECT image_path FROM scenes WHERE id = ?').get(sb.scene_id);
      if (scene?.image_path) {
        refs.push(`${config.storage.url}${scene.image_path}`);
      }
    }
  } catch (e) {
    console.warn('[VideoService] 收集场景参考图失败:', e.message);
  }

  if (refs.length > 0) {
    console.log(`[VideoService] I2V 收集到 ${refs.length} 张参考图: ${refs.map(r => r.substring(r.lastIndexOf('/')+1)).join(', ')}`);
  }
  return refs;
}

/**
 * 构建视频运动提示词 — 多角色同框版
 * 
 * 输出格式：[风格] 场景描述。[角色A(站位)在位置，动作，表情]；[角色B...]。
 *           台词：[说话者]说"..."。[运镜]。质量标准。
 * 
 * 核心改造：从小云雀分镜模式学习，每个角色独立描述动作+位置+表情，
 * 而非简单罗列名字。支持 character_actions 结构化数据。
 */
function buildVideoPrompt(sb, options) {
  const basePrompt = options.custom_prompt || sb.prompt_text || sb.description || '';

  // === 1. 风格标签（项目级设置，可选） ===
  let stylePrefix = '';
  if (options.style_tags) {
    const tags = Array.isArray(options.style_tags) ? options.style_tags : [options.style_tags];
    stylePrefix = tags.filter(Boolean).join('，');
  }

  // === 2. 多角色动作描述（核心改造） ===
  let characterPart = '';
  const charActions = options.character_actions;
  
  if (charActions && charActions.length > 0) {
    // 新模式：结构化角色动作
    const actions = charActions.map(ca => {
      const roleMarkers = { lead: '（主位）', support: '', extra: '（背景）' };
      const roleTag = roleMarkers[ca.role] || '';
      const name = ca.name || ca.character_name || '';

      let desc = `${name}${roleTag}`;
      if (ca.position) desc += `在${ca.position}`;
      if (ca.action) desc += `，${ca.action}`;
      if (ca.expression) desc += `，表情${ca.expression}`;
      return desc;
    });
    characterPart = actions.join('；');
  } else {
    // 兼容旧模式：从 DB character_ids 读取角色名
    try {
      const charIds = JSON.parse(sb.character_ids || '[]');
      if (charIds.length > 0) {
        const chars = [];
        for (const cid of charIds) {
          const ch = db.prepare('SELECT name FROM characters WHERE id = ?').get(cid);
          if (ch) chars.push(ch.name);
        }
        if (chars.length > 0) {
          characterPart = `出场角色：${chars.join('、')}`;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // === 3. 场景描述 ===
  let sceneContext = '';
  try {
    let scene = null;
    if (sb.scene_id) {
      scene = db.prepare('SELECT name, description FROM scenes WHERE id = ?').get(sb.scene_id);
    } else if (sb.project_id) {
      scene = db.prepare('SELECT name, description FROM scenes WHERE project_id = ? LIMIT 1').get(sb.project_id);
    }
    if (scene && scene.description) {
      sceneContext = scene.description.substring(0, 200);
    }
  } catch (e) { /* ignore */ }

  // === 4. 台词（驱动口型 — 新功能） ===
  let dialogLine = '';
  const dialogText = options.dialog_text || sb.dialogue_text;
  if (dialogText) {
    // 优先从 character_actions 找 is_speaking 角色
    let speaker = options.dialog_speaker || '';
    if (!speaker && charActions?.length > 0) {
      const speakerAction = charActions.find(ca => ca.is_speaking);
      if (speakerAction) speaker = speakerAction.name || speakerAction.character_name || '';
    }
    dialogLine = speaker 
      ? `${speaker}说："${dialogText}"`
      : `台词："${dialogText}"`;
  }

  // === 5. 运镜描述 ===
  const motions = {
    slow_zoom: '缓慢推进的镜头，画面自然流畅',
    pan_left: '镜头从左向右平滑横移',
    pan_right: '镜头从右向左平滑横移',
    static: '静态镜头，自然的微动和呼吸感',
    dialogue: '角色对话场景，自然的表情和手势',
    dramatic: '戏剧性运镜，有张力的构图和光影',
  };
  const motion = motions[options.motion] || motions.dialogue;

  // === 6. 组合：风格 → 场景 → 角色动作 → 台词 → 原始prompt → 运镜 → 质量 ===
  const parts = [
    stylePrefix,
    sceneContext,
    characterPart,
    dialogLine,
    basePrompt,
    motion,
    '高质量视频，电影质感，画面稳定，角色一致性高',
  ].filter(Boolean);

  return parts.join('。');
}

/**
 * 构建视频负面提示词（防止角色/场景漂移）
 */
function buildNegativePrompt(sb, options) {
  const negatives = [
    'deformed face', 'distorted features', 'extra limbs', 'missing limbs',
    'blurry face', 'changed hairstyle', 'different clothing', 'wrong color outfit',
    'different person', 'extra people', 'disappearing characters',
    'background change', 'scene shift', 'lighting mismatch', 'color shift',
    'low quality', 'watermark', 'text overlay',
  ];

  // 如果有角色，追加角色相关负面词
  try {
    const charIds = JSON.parse(sb.character_ids || '[]');
    if (charIds.length > 0) {
      negatives.push('character replacement', 'face swap', 'altered appearance');
    }
  } catch (e) {}

  return negatives.join(', ');
}

/**
 * 下载远程视频并保存到本地
 */
async function downloadAndSaveVideo(url) {
  const https = require('https');
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  return new Promise((resolve, reject) => {
    const fileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp4`;
    const savePath = path.join(config.storage.path, 'videos', fileName);
    
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(savePath);
    
    function followRedirects(url, maxRedirects = 5) {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && maxRedirects > 0) {
          followRedirects(response.headers.location, maxRedirects - 1);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(`/videos/${fileName}`);
        });
      }).on('error', reject);
    }
    
    followRedirects(url);
  });
}

module.exports = { generateVideo, batchGenerateVideos, buildVideoPrompt };
