/**
 * 剧本生成服务
 * 负责AI剧本改写、角色提取、分镜拆解、集/场景同步
 */
const ai = require('./ai-service');
const db = require('../db/connection');

/**
 * AI生成剧本 - 将输入文本转换为结构化短剧剧本
 */
async function aiGenerateScript(rawText, projectId) {
  const systemPrompt = `你是一位专业的短剧编剧。请将用户提供的创意/小说文本改编为一部精彩的短剧剧本。

要求：
1. 输出严格的JSON格式
2. 短剧集数控制在1-3集，每集3-6个场景
3. 每个场景包含：场景号、地点、出场人物、画面描述、对白（含说话人+内容+情绪动作）、时长估算
4. 对白要口语化、有冲突感、有反转
5. 场景描述要适合AI绘画生成

输出JSON格式：
{
  "title": "短剧标题",
  "genre": "类型",
  "episodes": [
    {
      "id": "ep1",
      "title": "第X集 标题",
      "scenes": [
        {
          "id": "s1",
          "scene_number": 1,
          "location": "地点",
          "time_of_day": "时间",
          "characters": ["角色名"],
          "visual_description": "详细的画面描述（用于AI绘图）",
          "dialogue": [
            {
              "character": "角色名",
              "text": "台词内容",
              "emotion": "情绪",
              "action": "肢体动作描述"
            }
          ],
          "estimated_duration": 15
        }
      ]
    }
  ]
}`;

  const userPrompt = rawText || '帮我创作一部都市职场题材的短剧';

  console.log('[ScriptService] 开始AI生成剧本...');
  const result = await ai.chatJSON([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  console.log('[ScriptService] 剧本生成完成:', result.title);
  return { title: result.title, script: result };
}

/**
 * 从剧本JSON同步 episodes 和 scenes 表
 * 剧本生成后调用，确保DB中有对应的集和场景记录
 */
function syncEpisodesAndScenes(projectId) {
  const scriptRow = db.prepare('SELECT id, content FROM scripts WHERE project_id = ?').get(projectId);
  if (!scriptRow?.content) return { episodes: 0, scenes: 0 };

  let scriptData;
  try { scriptData = JSON.parse(scriptRow.content); } catch(e) { return { episodes: 0, scenes: 0 }; }

  const scriptId = scriptRow.id;
  let epCount = 0, scCount = 0;

  for (const ep of scriptData.episodes || []) {
    epCount++;
    let epRow = db.prepare(
      'SELECT id FROM episodes WHERE project_id = ? AND episode_number = ?'
    ).get(projectId, epCount);

    if (!epRow) {
      const epResult = db.prepare(
        'INSERT INTO episodes (project_id, script_id, episode_number, title, summary) VALUES (?,?,?,?,?)'
      ).run(projectId, scriptId, epCount, ep.title || `第${epCount}集`, '');
      epRow = { id: epResult.lastInsertRowid };
    }

    for (const scene of ep.scenes || []) {
      const location = scene.location || '';
      if (!location) continue;

      let scRow = db.prepare(
        'SELECT id FROM scenes WHERE project_id = ? AND name = ?'
      ).get(projectId, location);

      if (!scRow) {
        const scResult = db.prepare(
          'INSERT INTO scenes (project_id, episode_id, name, description, prompt_text) VALUES (?,?,?,?,?)'
        ).run(projectId, epRow.id, location, scene.visual_description || '', '');
        scRow = { id: scResult.lastInsertRowid };
      } else {
        db.prepare('UPDATE scenes SET episode_id = ? WHERE id = ?').run(epRow.id, scRow.id);
      }
      scCount++;
    }
  }

  console.log(`[ScriptService] 同步完成: ${epCount}集, ${scCount}个场景`);
  return { episodes: epCount, scenes: scCount };
}

/**
 * 从剧本自动提取角色列表
 */
async function extractCharacters(projectId) {
  const scriptRow = db.prepare('SELECT content FROM scripts WHERE project_id = ?').get(projectId);
  if (!scriptRow?.content) throw new Error('请先生成剧本');

  let scriptData;
  try { scriptData = JSON.parse(scriptRow.content); } catch(e) { throw new Error('剧本数据格式错误'); }

  const characterSet = new Set();
  for (const ep of scriptData.episodes || []) {
    for (const scene of ep.scenes || []) {
      (scene.characters || []).forEach(c => characterSet.add(c));
    }
  }

  const charactersList = Array.from(characterSet);

  const systemPrompt = `你是一位专业的角色设计师。根据以下短剧中出现的角色，为每个角色创建详细的角色档案。

对于每个角色，输出以下信息：
- name: 角色名
- description: 详细外貌和性格描述(50字内)
- appearance_prompt: 用于AI绘图的英文形象提示词(保持角色一致性)
- gender: 性别
- age_range: 年龄段
- personality_tags: 性格标签数组
- typical_clothing: 典型服装

输出JSON数组格式：[{...}, {...}]`;

  const userPrompt = `短剧《${scriptData.title}》中的角色列表：${charactersList.join('、')}\n\n剧本概要：${JSON.stringify(scriptData.episodes).substring(0, 3000)}`;

  console.log('[ScriptService] 开始AI提取角色...');
  let extractedCharacters = await ai.chatJSON([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  if (!Array.isArray(extractedCharacters)) {
    if (extractedCharacters?.characters) {
      extractedCharacters = extractedCharacters.characters;
    } else if (extractedCharacters?.name) {
      extractedCharacters = [extractedCharacters];
    } else {
      const arrValue = Object.values(extractedCharacters).find(v => Array.isArray(v));
      extractedCharacters = arrValue || [];
    }
  }

  if (extractedCharacters.length === 0) {
    throw new Error('AI未提取到任何角色，请检查剧本内容');
  }

  const insertedChars = [];
  for (const char of extractedCharacters) {
    const existing = db.prepare(
      'SELECT id FROM characters WHERE project_id = ? AND name = ?'
    ).get(projectId, char.name);

    if (!existing) {
      const result = db.prepare(
        'INSERT INTO characters (project_id, name, description, prompt_text) VALUES (?,?,?,?)'
      ).run(projectId, char.name, char.description, char.appearance_prompt);
      char.id = result.lastInsertRowid;
      char.images = [];
    } else {
      char.id = existing.id;
    }
    insertedChars.push(char);
  }

  console.log(`[ScriptService] 提取出${insertedChars.length}个角色`);
  return insertedChars;
}

/**
 * 从剧本自动提取场景列表
 */
async function extractScenes(projectId) {
  const scriptRow = db.prepare('SELECT content FROM scripts WHERE project_id = ?').get(projectId);
  if (!scriptRow?.content) throw new Error('请先生成剧本');

  let scriptData;
  try { scriptData = JSON.parse(scriptRow.content); } catch(e) { throw new Error('剧本数据格式错误'); }

  const locationSet = new Set();
  const locationContext = [];
  for (const ep of scriptData.episodes || []) {
    for (const scene of ep.scenes || []) {
      if (scene.location) {
        locationSet.add(scene.location);
        locationContext.push({
          location: scene.location,
          time: scene.time_of_day || '白天',
          visual: scene.visual_description || '',
        });
      }
    }
  }

  const locations = Array.from(locationSet);
  if (locations.length === 0) throw new Error('未在剧本中找到场景位置');

  const systemPrompt = `你是一位专业的场景设计师。根据以下短剧中出现的场景地点，为每个场景生成详细描述和AI绘图提示词。

对于每个场景，输出以下信息：
- name: 场景地点名称
- description: 详细场景描述(50字内，中文)
- prompt_text: 用于AI绘图的英文场景提示词（描述建筑/室内风格、光线、氛围、色调）

输出JSON数组格式：[{...}, {...}]`;

  const userPrompt = `短剧《${scriptData.title}》中的场景列表：${locations.join('、')}\n\n场景上下文：${JSON.stringify(locationContext).substring(0, 3000)}`;

  console.log('[ScriptService] 开始AI提取场景...');
  let extractedScenes = await ai.chatJSON([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  if (!Array.isArray(extractedScenes)) {
    if (extractedScenes?.scenes) {
      extractedScenes = extractedScenes.scenes;
    } else if (extractedScenes?.name) {
      extractedScenes = [extractedScenes];
    } else {
      const arrValue = Object.values(extractedScenes).find(v => Array.isArray(v));
      extractedScenes = arrValue || [];
    }
  }

  if (extractedScenes.length === 0) {
    throw new Error('AI未提取到任何场景，请检查剧本内容');
  }

  const insertedScenes = [];
  for (const sc of extractedScenes) {
    const existing = db.prepare(
      'SELECT id FROM scenes WHERE project_id = ? AND name = ?'
    ).get(projectId, sc.name);

    if (!existing) {
      const result = db.prepare(
        'INSERT INTO scenes (project_id, name, description, prompt_text) VALUES (?,?,?,?)'
      ).run(projectId, sc.name, sc.description, sc.prompt_text);
      sc.id = result.lastInsertRowid;
    } else {
      sc.id = existing.id;
    }
    insertedScenes.push(sc);
  }

  console.log(`[ScriptService] 提取出${insertedScenes.length}个场景`);
  return insertedScenes;
}

/**
 * AI生成分镜序列 — 使用 episode_id + 角色ID引用
 */
async function generateStoryboards(projectId) {
  const scriptRow = db.prepare('SELECT content FROM scripts WHERE project_id = ?').get(projectId);
  if (!scriptRow?.content) throw new Error('请先生成剧本');

  let scriptData;
  try { scriptData = JSON.parse(scriptRow.content); } catch(e) { throw new Error('剧本数据格式错误'); }

  // 角色 name -> id 映射
  const characters = db.prepare('SELECT id, name, prompt_text, description FROM characters WHERE project_id = ?').all(projectId);
  const charNameToId = {};
  for (const c of characters) { charNameToId[c.name] = c.id; }

  // 集 episode_number -> DB id 映射
  const episodes = db.prepare('SELECT id, episode_number FROM episodes WHERE project_id = ? ORDER BY episode_number').all(projectId);
  const epNumToId = {};
  for (const ep of episodes) { epNumToId[ep.episode_number] = ep.id; }

  const systemPrompt = `你是一位专业的分镜师。将以下剧本拆解为详细的分镜镜头。

每个分镜镜头必须包含以下字段（全部必填，缺少会导致错误）：
- scene_index: 镜头序号(number)
- shot_type: 镜头类型（全景/中景/近景/特写）
- description: 画面构图描述
- prompt_text: 英文AI绘图提示词（详细描述画面内容、光影、风格）
- duration: 镜头时长(秒, number)
- dialogue_text: 该镜头的对白（如有，没有则为空字符串""）
- character_ids: 出场角色名数组(array of strings) — 必填！根据场景出场人物填写
- character_actions: 每个出场角色的动作描述数组(array of objects) — 必填！格式如下：
  [{ "character_name": "角色名", "role": "lead", "position": "空间位置", "action": "动作描述", "expression": "表情", "is_speaking": true/false }]
  - role取值：lead（主位/主角）、support（配角）、extra（背景）
  - is_speaking标记谁在说本镜头的对白

⚠️ character_ids 和 character_actions 是必须填写的字段！即使该镜头没有对白，也必须填写出场角色的动作。
如果只有1个角色：character_ids=["角色名"], character_actions=[{character_name:"角色名",role:"lead",position:"中央",action:"站立",expression:"平静",is_speaking:false}]

要求：
1. 每个场景至少拆分为2-4个镜头
2. 镜头类型要有变化
3. 提示词必须详细
4. 保持视觉连贯性
5. 输出纯JSON数组`;

  let allStoryboards = [];
  let epIndex = 0;
  for (const ep of scriptData.episodes || []) {
    epIndex++;
    const episodeId = epNumToId[epIndex] || null;

    for (const scene of ep.scenes || []) {
      const userPrompt = `请为以下场景设计分镜：

场景${scene.scene_number}: ${scene.location} (${scene.time_of_day})
出场人物: ${(scene.characters || []).join(',')}
画面描述: ${scene.visual_description}
对白: ${JSON.stringify(scene.dialogue).substring(0, 1000)}

可用角色的形象提示词参考:
${characters.map(c => `- ${c.name}: ${c.prompt_text || c.description}`).join('\n')}

重要：为每个出场角色填写character_actions，描述他们在画面中的位置、动作和表情。如果角色在说对白，标记is_speaking为true。`;

      let sbResult = await ai.chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      let storyboards = [];
      if (Array.isArray(sbResult)) {
        storyboards = sbResult;
      } else if (sbResult?.storyboards) {
        storyboards = sbResult.storyboards;
      } else if (sbResult?.shots) {
        storyboards = sbResult.shots;
      } else if (sbResult?.scene_index || sbResult?.shot_type || sbResult?.shot_index) {
        storyboards = [sbResult];
      } else {
        const arrVal = Object.values(sbResult).find(v => Array.isArray(v));
        storyboards = arrVal || [];
      }

      storyboards = storyboards.filter(sb => {
        const hasType = sb.shot_type && sb.shot_type.length > 0 && sb.shot_type.length < 10;
        const hasDesc = sb.description && sb.description.length > 3;
        const hasPrompt = sb.prompt_text && sb.prompt_text.length > 10;
        return hasType && (hasDesc || hasPrompt);
      });

      for (const sb of storyboards) {
        let charNames = sb.character_ids || [];
        let charActions = sb.character_actions || [];

        // 兜底：如果 AI 没输出 character_ids，从描述和出场人物中匹配
        if (charNames.length === 0) {
          const sceneChars = scene.characters || [];
          const descText = (sb.description || '') + ' ' + (sb.prompt_text || '');
          for (const cName of sceneChars) {
            if (descText.toLowerCase().includes(cName.toLowerCase())) {
              charNames.push(cName);
            }
          }
          // 如果 desc 里没找到具体名字，但场景只有1-2个角色，直接引用所有场景角色
          if (charNames.length === 0 && sceneChars.length > 0 && sceneChars.length <= 2) {
            charNames = [...sceneChars];
          }
        }

        // 兜底：如果 AI 没输出 character_actions，从 character_ids 构建基础版本
        if (charActions.length === 0 && charNames.length > 0) {
          charActions = charNames.map((name, i) => ({
            character_name: name,
            role: i === 0 ? 'lead' : 'support',
            position: '画面中',
            action: '自然站位',
            expression: '自然表情',
            is_speaking: i === 0 && sb.dialogue_text ? true : false,
          }));
        }

        const charIds = charNames.map(n => charNameToId[n]).filter(Boolean);
        if (charActions.length > 0) {
          charActions = charActions.map(ca => ({
            ...ca,
            character_id: charNameToId[ca.character_name] || null,
            name: ca.character_name || ca.name || '',
          }));
        }

        const result = db.prepare(`
          INSERT INTO storyboards (project_id, episode_id, scene_number, scene_index, shot_type, description, prompt_text, duration, dialogue_text, character_ids, character_actions)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          projectId,
          episodeId,
          scene.scene_number || 1,
          sb.scene_index || 0,
          sb.shot_type || '中景',
          sb.description || '',
          sb.prompt_text || '',
          sb.duration || 3.0,
          sb.dialogue_text || '',
          JSON.stringify(charIds),
          JSON.stringify(charActions)
        );
        sb.id = result.lastInsertRowid;
        allStoryboards.push(sb);
      }
    }
  }

  console.log(`[ScriptService] 生成了${allStoryboards.length}个分镜`);
  return allStoryboards;
}

module.exports = {
  aiGenerateScript,
  syncEpisodesAndScenes,
  extractCharacters,
  extractScenes,
  generateStoryboards,
};
