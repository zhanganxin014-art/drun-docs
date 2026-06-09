/**
 * TTS语音合成服务
 * 负责为对白生成配音
 */
const ai = require('./ai-service');
const db = require('../db/connection');
const helpers = require('../utils/helpers');
const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * 可用的TTS音色列表
 */
const VOICE_OPTIONS = [
  { id: 'alloy', name: '合金(中性)', gender: 'neutral', lang: 'zh' },
  { id: 'echo', name: '回声(男)', gender: 'male', lang: 'zh' },
  { id: 'fable', name: '寓言(中性)', gender: 'neutral', lang: 'zh' },
  { id: 'onyx', name: '玛瑙(男低沉)', gender: 'male', lang: 'zh' },
  { id: 'nova', name: '新星(女)', gender: 'female', lang: 'zh' },
  { id: 'shimmer', name: '微光(女柔和)', gender: 'female', lang: 'zh' },
];

/**
 * 根据角色自动选择合适的音色
 * @param {Object} character - 角色信息
 * @returns {string} 音色ID
 */
function selectVoiceForCharacter(character) {
  // 如果角色已有指定音色
  if (character.voice_id) return character.voice_id;

  // 根据角色描述/名称启发式选择
  const name = (character.name || '').toLowerCase();
  const desc = (character.description || '').toLowerCase();

  if (name.includes('女') || desc.includes('她') || desc.includes('女')) {
    return desc.includes('温柔') || desc.includes('柔') ? 'shimmer' : 'nova';
  }
  if (name.includes('男') || desc.includes('他') || desc.includes('男')) {
    return desc.includes('深沉') || desc.includes('成熟') ? 'onyx' : 'echo';
  }

  // 默认中性音色
  return 'alloy';
}

/**
 * 为单句台词生成TTS音频
 * @param {string} text - 台词文字
 * @param {Object} options - {voice, speed}
 * @returns {{ filePath: string, url: string }}
 */
async function generateLineAudio(text, options = {}) {
  if (!text || !text.trim()) throw new Error('台词内容为空');

  const voice = options.voice || 'alloy';

  try {
    const audioBuffer = await ai.generateTTS(text.trim(), {
      voice: voice,
      speed: options.speed || 1.0,
    });

    // 保存音频文件
    const dirPath = path.join(config.storage.path, 'audio');
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    const crypto = require('crypto');
    const fileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp3`;
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, audioBuffer);

    return {
      filePath: `/audio/${fileName}`,
      url: `${config.storage.url}/audio/${fileName}`,
      duration: estimateDuration(text),
    };
  } catch (err) {
    console.error('[TTSService] TTS生成失败:', err.message);
    throw new Error(`TTS语音合成失败: ${err.message}`);
  }
}

/**
 * 为整个项目的所有对白批量生成TTS
 * @param {number} projectId
 * @returns {Array<{ storyboardId, character, text, audioUrl }>}
 */
async function generateProjectTTS(projectId) {
  // 获取剧本
  const scriptRow = db.prepare('SELECT content FROM scripts WHERE project_id = ?').get(projectId);
  if (!scriptRow?.content) throw new Error('请先生成剧本');

  let scriptData;
  try { scriptData = JSON.parse(scriptRow.content); } catch(e) { throw new Error('剧本数据格式错误'); }

  // 获取角色信息(含音色)
  const characters = db.prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId);
  const charMap = {};
  characters.forEach(c => { charMap[c.name] = c; });

  // 创建任务
  const taskId = helpers.createTask(projectId, 'tts_generate', 'running');
  const results = [];
  let totalLines = 0;

  try {
    for (const ep of scriptData.episodes || []) {
      for (const scene of ep.scenes || []) {
        for (const line of scene.dialogue || []) {
          if (!line.text || !line.character) continue;
          totalLines++;

          const char = charMap[line.character];
          const voice = selectVoiceForCharacter(char || {});

          const audio = await generateLineAudio(line.text, { voice });
          
          results.push({
            episode_id: ep.id,
            scene_id: scene.id,
            character: line.character,
            text: line.text,
            emotion: line.emotion,
            audio_url: audio.url,
            audio_file_path: audio.filePath,
            duration: audio.duration,
            voice_id: voice,
          });

          // 更新进度
          helpers.updateTaskProgress(taskId, Math.round((results.length / totalLines) * 100));
        }
      }
    }

    helpers.completeTask(taskId, { total_lines: results.length, audios: results });
    console.log(`[TTSService] 完成${results.length}条TTS音频生成`);
    return results;
  } catch (err) {
    helpers.completeTask(taskId, null, err.message);
    throw err;
  }
}

/**
 * 估算音频时长（中文约3.5字/秒）
 */
function estimateDuration(text) {
  const chineseChars = (text || '').replace(/[^\u4e00-\u9fa5]/g, '').length;
  const otherChars = (text || '').length - chineseChars;
  return ((chineseChars / 3.5) + (otherChars / 5)).toFixed(1);
}

module.exports = {
  VOICE_OPTIONS,
  selectVoiceForCharacter,
  generateLineAudio,
  generateProjectTTS,
};
