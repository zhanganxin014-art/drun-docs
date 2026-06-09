/**
 * 图片生成服务
 * 负责角色形象图、场景背景图、分镜图的AI生成
 */
const ai = require('./ai-service');
const db = require('../db/connection');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const helpers = require('../utils/helpers');

/**
 * 统一图片生成入口
 * @param {string} type - 'character' | 'storyboard' | 'scene' | 'cover'
 * @param {number|string} targetId - 角色ID或分镜ID
 * @param {Object} options - 生成参数
 * @returns {Object} 生成结果含文件路径和URL
 */
async function generateImage(type, targetId, options = {}) {
  let prompt = '';
  let size = options.size || '1024x576'; // 默认16:9横版

  switch (type) {
    case 'character': {
      // 生成角色形象图
      const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(targetId);
      if (!character) throw new Error('角色不存在');

      prompt = options.customPrompt || character.prompt_text || buildCharacterPrompt(character);
      size = '768x1344'; // 竖版角色立绘

      // 参考图模式：在prompt中注入"保持参考图人物特征"指令
      if (options.referenceImagePath) {
        const refInstruction = 'IMPORTANT: The generated character MUST closely match the facial features, proportions, and appearance of the reference person in the provided image. Preserve the exact same face shape, eye shape, nose, mouth, and overall likeness. Apply the described character style/clothing to this same person.';
        prompt = `${refInstruction}. ${prompt}`;
      }
      
      break;
    }
    case 'storyboard': {
      // 生成分镜图
      const sb = db.prepare('SELECT * FROM storyboards WHERE id = ?').get(targetId);
      if (!sb) throw new Error('分镜不存在');

      const basePrompt = options.customPrompt || sb.prompt_text || sb.description;
      prompt = basePrompt;

      // 收集角色图 + 场景图作为视觉参考
      const referenceImages = [];
      if (!options.customPrompt) {
        const { images: refs, promptParts } = buildCharacterSceneContext(sb);
        referenceImages.push(...refs);

        if (refs.length > 0) {
          // 有参考图时：instruction在前，引导AI匹配角色外貌
          prompt = [
            'IMPORTANT: Use the provided reference images for visual consistency.',
            'Match the faces, hairstyles, clothing, and body proportions from the character reference images.',
            'If there is a scene reference image, use it as the background setting.',
            `Now create this storyboard frame: ${basePrompt}`,
          ].join(' ');
        }

        if (promptParts.length > 0) {
          prompt = `${prompt}. ${promptParts.join('. ')}`;
        }
      }

      if (referenceImages.length > 0) {
        options.reference_images = referenceImages;
      }
      size = options.size || '1344x768';
      break;
    }
    case 'scene': {
      // 生成场景背景图
      const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(targetId);
      if (!scene) throw new Error('场景不存在');

      prompt = options.customPrompt || scene.prompt_text || buildScenePrompt(scene);
      size = '1344x768';
      break;
    }
    default:
      throw new Error('不支持的图片类型: ' + type);
  }

  // 添加全局风格后缀（角色图默认用clean立绘风格）
  const defaultStyle = type === 'character' ? 'character' : 'realistic';
  const styleSuffix = getStyleSuffix(options.style || defaultStyle);
  const fullPrompt = `${prompt}, ${styleSuffix}`;

  console.log(`[ImageService] 开始生成${type}图片... Prompt: ${fullPrompt.substring(0, 100)}...`);

  // 创建任务记录
  const taskId = helpers.createTask(null, type === 'character' ? 'generate_character_image' : 'generate_scene_image', 'running');
  
  try {
    // 构建AI生成参数
    const aiParams = {
      prompt: fullPrompt,
      size: size,
      n: 1,
      quality: 'hd',
    };

    // 参考图模式：将参考图编码为base64传入
    if (options.referenceImagePath) {
      const refPath = options.referenceImagePath;
      // 路径格式统一为 /images/xxx.jpg，需拼接 storage.path 得到绝对路径
      const absoluteRefPath = refPath.startsWith('/')
        ? path.join(config.storage.path, refPath.substring(1))
        : refPath;
      if (fs.existsSync(absoluteRefPath)) {
        const refBuffer = fs.readFileSync(absoluteRefPath);
        const refBase64 = refBuffer.toString('base64');
        const ext = path.extname(absoluteRefPath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        aiParams.reference_images = [`data:${mimeType};base64,${refBase64}`];
        console.log(`[ImageService] 参考图模式: 使用 ${path.basename(absoluteRefPath)} 作为参考`);
      } else {
        console.warn(`[ImageService] 参考图文件不存在: ${absoluteRefPath}，回退到纯文本模式`);
      }
    }

    // 多参考图模式（已有 base64 data URI 的引用数组）
    if (options.reference_images && options.reference_images.length > 0) {
      aiParams.reference_images = options.reference_images;
      console.log(`[ImageService] 多参考图模式: ${options.reference_images.length} 张参考图`);
    }

    // 调用AI生成图片
    const imageData = await ai.generateImage(aiParams);

    if (!imageData || !imageData[0]?.b64_json) {
      console.error('[ImageService] AI返回数据格式异常:',
        `type=${typeof imageData}`,
        `isArray=${Array.isArray(imageData)}`,
        `length=${imageData?.length}`,
        `firstKeys=${imageData?.[0] ? Object.keys(imageData[0]).join(',') : 'N/A'}`);
      throw new Error('AI未返回有效的图片数据');
    }

    // 保存图片到本地
    const saved = helpers.saveBase64Image(imageData[0].b64_json, 'images', '.png');

    // 更新数据库记录
    let recordId = null;
    if (type === 'character') {
      const char = db.prepare('SELECT images FROM characters WHERE id = ?').get(targetId);
      let images = [];
      try { images = JSON.parse(char?.images || '[]'); } catch(e) {}
      images.push(saved.filePath);
      db.prepare("UPDATE characters SET images = ? WHERE id = ?")
        .run(JSON.stringify(images), targetId);
      recordId = targetId;

      // 同时插入素材库
      const charInfo = db.prepare('SELECT * FROM characters WHERE id = ?').get(targetId);
      db.prepare(
        'INSERT INTO assets (project_id, type, name, file_path, source, metadata) VALUES (?,?,?,?,?,?)'
      ).run(charInfo.project_id, 'character', `${charInfo.name}_形象`, saved.filePath, 'ai_generated',
         JSON.stringify({ character_id: targetId }));
    } else if (type === 'storyboard') {
      db.prepare("UPDATE storyboards SET image_path = ? WHERE id = ?")
        .run(saved.filePath, targetId);
      recordId = targetId;

      const sb = db.prepare('SELECT * FROM storyboards WHERE id = ?').get(targetId);
      db.prepare(
        'INSERT INTO assets (project_id, type, name, file_path, source, metadata) VALUES (?,?,?,?,?,?)'
      ).run(sb.project_id, 'storyboard', `分镜_${sb.scene_index}`, saved.filePath, 'ai_generated',
         JSON.stringify({ storyboard_id: targetId }));
    } else if (type === 'scene') {
      db.prepare("UPDATE scenes SET image_path = ? WHERE id = ?")
        .run(saved.filePath, targetId);
      recordId = targetId;

      const sc = db.prepare('SELECT * FROM scenes WHERE id = ?').get(targetId);
      db.prepare(
        'INSERT INTO assets (project_id, type, name, file_path, source, metadata) VALUES (?,?,?,?,?,?)'
      ).run(sc.project_id, 'scene', sc.name, saved.filePath, 'ai_generated',
         JSON.stringify({ scene_id: targetId }));
    }

    helpers.completeTask(taskId, { file_path: saved.filePath, url: saved.url, type });

    console.log(`[ImageService] 图片生成成功: ${saved.url}`);
    return {
      task_id: taskId,
      file_path: saved.filePath,
      url: saved.url,
      type,
      record_id: recordId,
    };
  } catch (err) {
    helpers.completeTask(taskId, null, err.message);
    throw err;
  }
}

/**
 * 构建角色形象提示词（参考小云雀风格：结构化描述 + 干净立绘）
 */
function buildCharacterPrompt(character) {
  const name = character.name || '角色';
  const desc = character.description || '';

  // 解析description中的结构化信息：性别、年龄、背景、面部特征、发型、气质等
  const parts = parseCharacterDesc(desc);

  // 构建结构化提示词：基本信息 → 面部特征 → 发型 → 气质 → 整体形象
  const basicInfo = [
    `Character name: "${name}"`,
    parts.gender ? `Gender: ${parts.gender}` : '',
    parts.age ? `Age: ${parts.age}` : '',
    parts.background ? `Background: ${parts.background}` : '',
  ].filter(Boolean).join('. ');

  const facialFeatures = parts.facial ? `Facial features: ${parts.facial}` : '';
  const hairstyle = parts.hair ? `Hairstyle: ${parts.hair}` : '';
  const temperament = parts.temperament ? `Temperament & aura: ${parts.temperament}` : '';

  // 组合所有结构化描述
  const structuredDesc = [basicInfo, facialFeatures, hairstyle, temperament]
    .filter(Boolean).join('. ');

  return `${structuredDesc || desc}. full body standing portrait, \
facing forward, pure solid light gray background with absolutely no objects or furniture, \
clean commercial character design sheet, soft even studio lighting from front, \
no harsh shadows, high quality detailed face and clothing, 8k resolution`.trim();
}

/**
 * 解析角色描述的结构化内容
 */
function parseCharacterDesc(desc) {
  if (!desc) return {};
  
  // 尝试按中文逗号/句号/分号拆分
  const segments = desc.split(/[,，。；;]+/).map(s => s.trim()).filter(Boolean);
  
  const result = {
    gender: '',
    age: '',
    background: '',
    facial: '',
    hair: '',
    temperament: '',
  };

  for (const seg of segments) {
    const lower = seg.toLowerCase();
    // 性别
    if (/男|女|male|female/i.test(seg) && !result.gender) result.gender = seg;
    // 年龄
    else if (/[\d一二三四五六七八九十百]+[多岁岁]|年轻|中年|老年|young|middle.age|old/i.test(seg) && !result.age) result.age = seg;
    // 背景/职业
    else if (/公司|企业|工作|职业|身份|背景|CEO|经理|员工|工程师|学生|医生|教师|律师|职员|上司|下属|同事|business|company|office/i.test(seg) && !result.background) result.background = seg;
    // 面部特征
    else if (/脸|眼|眉|鼻|嘴|皮肤|肤色|五官|面容|表情|face|eye|nose|lips|skin|expression/i.test(seg) && !result.facial) result.facial = seg;
    // 发型
    else if (/头|发|辫|刘海|短发|长发|寸头|卷发|马尾|hair/gi.test(seg) && !result.hair) result.hair = seg;
    // 气质
    else if (/气质|气场|神态|性格|干练|温柔|严肃|开朗|沉稳|自信|坚韧|成熟|专业|professional|confident|serious|gentle/i.test(seg)) result.temperament = seg;
    else if (!result.temperament) result.temperament = seg; // fallback
  }

  return result;
}

/**
 * 获取风格后缀提示词
 */
function getStyleSuffix(style) {
  const styles = {
    // 角色立绘专用：干净商业人像
    character: 'clean commercial character sheet, full body standing pose centered, pure solid light gray background with zero objects or scene elements, front view, no background details, soft even front lighting, flawless skin, professional portrait style',
    anime: 'anime style, vibrant colors, detailed illustration, professional art, clean white background, character reference sheet',
    realistic: 'photorealistic, cinematic lighting, 8k uhd, movie still',
    comic: 'comic book style, bold lines, dynamic composition, manga style',
    watercolor: 'watercolor illustration, soft colors, artistic, dreamy',
    dark: 'dark atmosphere, moody lighting, dramatic shadows, film noir',
    scifi: 'sci-fi style, futuristic, neon lights, cyberpunk atmosphere',
  };
  return styles[style] || styles.realistic;
}

/**
 * 构建场景背景提示词
 */
function buildScenePrompt(scene) {
  const name = scene.name || '场景';
  const desc = scene.description || '';
  return `A cinematic wide shot of ${name}. ${desc}. \
pure background environment, NO people, NO characters, NO humans, empty location, no persons visible, \
photorealistic, cinematic lighting, 8k uhd, movie still quality, \
rich atmosphere, detailed environment, professional film set`.trim();
}

/**
 * 为分镜图收集角色/场景参考图 + 文字描述
 * @param {Object} sb - storyboard 行
 * @returns {{ images: string[], promptParts: string[] }}
 *   - images: base64 Data URI 数组
 *   - promptParts: 结构化文字片段（shot_type、角色外貌关键词、场景描述）
 */
function buildCharacterSceneContext(sb) {
  const images = [];
  const promptParts = [];

  // 辅助：读取图片文件并转 base64 Data URI
  function readImageAsDataUri(relPath) {
    if (!relPath || typeof relPath !== 'string') return null;
    const cleanPath = relPath.startsWith('/') ? relPath.substring(1) : relPath;
    const absPath = path.join(config.storage.path, cleanPath);
    if (!fs.existsSync(absPath)) {
      console.warn(`[ImageService] 参考图不存在: ${absPath}`);
      return null;
    }
    try {
      const buf = fs.readFileSync(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                        '.gif': 'image/gif', '.webp': 'image/webp' };
      const mime = mimeMap[ext] || 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e) {
      console.warn(`[ImageService] 读取参考图失败: ${absPath}`, e.message);
      return null;
    }
  }

  // 1. 收集角色图片（每个角色取第一张生成图；无生成图则用 reference_image_path）
  try {
    const charIds = JSON.parse(sb.character_ids || '[]');
    for (const cid of charIds) {
      const ch = db.prepare('SELECT id, name, description, prompt_text, images, reference_image_path FROM characters WHERE id = ?').get(cid);
      if (!ch) continue;

      // 角色图片
      let charImagePath = null;
      try {
        const charImgs = JSON.parse(ch.images || '[]');
        if (charImgs.length > 0) charImagePath = charImgs[0];
      } catch (e) {}
      if (!charImagePath) charImagePath = ch.reference_image_path;

      if (charImagePath) {
        const dataUri = readImageAsDataUri(charImagePath);
        if (dataUri) {
          images.push(dataUri);
          console.log(`[ImageService] 角色参考图: ${ch.name} -> ${path.basename(charImagePath)}`);
        }
      }

      // 文字描述（不截断，取 description 或 prompt_text）
      const descText = ch.description || ch.prompt_text || '';
      if (descText) {
        promptParts.push(`"${ch.name}": ${descText}`);
      }
    }
  } catch (e) { /* ignore */ }

  // 2. 收集场景图片
  try {
    if (sb.scene_id) {
      const scene = db.prepare('SELECT name, description, prompt_text, image_path FROM scenes WHERE id = ?').get(sb.scene_id);
      if (scene) {
        if (scene.image_path) {
          const dataUri = readImageAsDataUri(scene.image_path);
          if (dataUri) {
            images.push(dataUri);
            console.log(`[ImageService] 场景参考图: ${scene.name} -> ${path.basename(scene.image_path)}`);
          }
        }
        const sceneDesc = scene.description || scene.prompt_text || '';
        if (sceneDesc) {
          promptParts.push(`Background: "${scene.name}" - ${sceneDesc}`);
        }
      }
    }
  } catch (e) { /* ignore */ }

  // 3. shot_type 构图指令
  if (sb.shot_type) {
    promptParts.push(`Shot type: ${sb.shot_type}`);
  }

  return { images, promptParts };
}

/**
 * 确保项目中的角色和场景有定妆照/背景图
 * 返回 { generated: number, skipped: number }
 */
async function ensureProjectAssets(projectId) {
  const results = { generated: 0, skipped: 0, errors: [] };

  // 收集项目中所有分镜引用的角色
  const storyboards = db.prepare('SELECT character_ids, scene_id FROM storyboards WHERE project_id = ?').all(projectId);
  const charIds = new Set();
  const sceneIds = new Set();
  for (const sb of storyboards) {
    try {
      for (const cid of JSON.parse(sb.character_ids || '[]')) charIds.add(cid);
    } catch (e) {}
    if (sb.scene_id) sceneIds.add(sb.scene_id);
  }

  // 检查角色是否有图片
  for (const cid of charIds) {
    const ch = db.prepare('SELECT id, name, images FROM characters WHERE id = ?').get(cid);
    if (!ch) continue;
    let imgs;
    try { imgs = JSON.parse(ch.images || '[]'); } catch (e) { imgs = []; }
    if (imgs.length > 0) { results.skipped++; continue; }

    console.log(`[AssetEnsure] 角色 ${ch.name} 无定妆照，自动生成...`);
    try {
      await generateImage('character', cid);
      results.generated++;
      console.log(`[AssetEnsure] 角色 ${ch.name} 定妆照生成完成`);
    } catch (e) {
      results.errors.push(`角色 ${ch.name}: ${e.message}`);
      console.error(`[AssetEnsure] 角色 ${ch.name} 定妆照生成失败:`, e.message);
    }
  }

  // 检查场景是否有图片
  for (const sid of sceneIds) {
    const sc = db.prepare('SELECT id, name, image_path FROM scenes WHERE id = ?').get(sid);
    if (!sc) continue;
    if (sc.image_path) { results.skipped++; continue; }

    console.log(`[AssetEnsure] 场景 ${sc.name} 无背景图，自动生成...`);
    try {
      await generateImage('scene', sid);
      results.generated++;
      console.log(`[AssetEnsure] 场景 ${sc.name} 背景图生成完成`);
    } catch (e) {
      results.errors.push(`场景 ${sc.name}: ${e.message}`);
      console.error(`[AssetEnsure] 场景 ${sc.name} 背景图生成失败:`, e.message);
    }
  }

  console.log(`[AssetEnsure] 完成: 生成${results.generated}, 跳过${results.skipped}, 失败${results.errors.length}`);
  return results;
}

module.exports = { generateImage, ensureProjectAssets };
