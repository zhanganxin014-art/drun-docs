/**
 * 视频合成服务
 * 使用FFmpeg将图片/视频片段 + 音频 + 字幕 合成为最终MP4
 */
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const db = require('../db/connection');
const config = require('../config');
const helpers = require('../utils/helpers');

/**
 * 合成最终视频
 * @param {number} projectId - 项目ID
 * @param {Array<number>} storyboardIds - 要合成的分镜ID数组（空=全部）
 * @param {Object} options - 合成选项 {resolution, fps, withSubtitles, bgMusic}
 * @param {number} taskId - 任务ID
 * @returns {string} 最终视频相对路径
 */
async function composeVideo(projectId, storyboardIds, options = {}, taskId) {
  const resolution = options.resolution || '1344x768';   // 默认16:9
  const fps = options.fps || 30;
  const withSubtitles = options.withSubtitles !== false;  // 默认开启字幕

  // 获取要合成的分镜
  let whereSql = 'WHERE project_id = ? AND (image_path IS NOT NULL OR video_path IS NOT NULL)';
  const params = [projectId];
  
  if (storyboardIds && storyboardIds.length > 0) {
    whereSql += ' AND id IN (' + storyboardIds.map(() => '?').join(',') + ')';
    params.push(...storyboardIds);
  }
  
  whereSql += ' ORDER BY scene_index ASC';
  
  const storyboards = db.prepare(`SELECT * FROM storyboards ${whereSql}`).all(...params);

  if (storyboards.length === 0) {
    throw new Error('没有可合成的分镜素材，请先生成图片或视频');
  }

  console.log(`[ComposeService] 开始合成${storyboards.length}个分镜...`);

  // 准备输出目录
  const outputDir = config.storage.path;
  const outputPath = path.join(outputDir, `videos`, `final_${Date.now()}.mp4`);
  
  // 确保输出目录存在
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 构建FFmpeg命令
  return new Promise((resolve, reject) => {
    let command = ffmpeg();

    // 方案A: 如果有视频片段则拼接视频
    const hasVideos = storyboards.some(s => s.video_path && !s.video_path.endsWith('.png') && !s.video_path.endsWith('.jpg'));
    
    if (hasVideos) {
      // 有真实视频 - 直接拼接
      const inputFiles = storyboards.map(s => {
        const filePath = s.video_path || s.image_path;
        return path.join(config.storage.path, filePath.replace(/^\//, ''));
      }).filter(f => fs.existsSync(f));

      if (inputFiles.length === 0) {
        return reject(new Error('没有找到有效的视频/图片文件'));
      }

      // 创建临时concat文件
      const concatFile = path.join(outputDir, `concat_${Date.now()}.txt`);
      const concatContent = inputFiles.map(f =>
        `file '${f.replace(/'/g, "\\'")}'`
      ).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      command = ffmpeg()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .videoCodec('libx264')
        .videoBitrate('4000k')
        .size(resolution)
        .fps(fps)
        .outputOptions([
          '-pix_fmt yuv420p',
          '-preset fast',
          '-movflags +faststart',
        ])
        .on('progress', (p) => {
          try {
            const progress = Math.round(p.percent || 0);
            helpers.updateTaskProgress(taskId, progress);
          } catch(e) { /* 进度更新非关键 */ }
        })
        .on('end', () => {
          // 清理临时文件
          try { fs.unlinkSync(concatFile); } catch(e) {}
          
          // 记录最终视频到数据库
          const relativeOut = `/videos/${path.basename(outputPath)}`;
          db.prepare(
            "INSERT INTO assets (project_id, type, name, file_path, source) VALUES (?,?,?,?,?)"
          ).run(projectId, 'video', '合成_最终视频', relativeOut, 'composed');

          // 更新项目状态
          db.prepare("UPDATE projects SET status = 'completed', updated_at = datetime('now') WHERE id = ?")
            .run(projectId);

          console.log(`[ComposeService] 视频合成完成: ${relativeOut}`);
          resolve(relativeOut);
        })
        .on('error', (err) => {
          console.error('[ComposeService] FFmpeg错误:', err.message);
          try { fs.unlinkSync(concatFile); } catch(e) {}
          reject(new Error(`视频合成失败: ${err.message}`));
        })
        .save(outputPath);

    } else {
      // 方案B: 纯图片 → 幻灯片式视频（带时长控制）
      const imagesWithDurations = storyboards.map(s => ({
        path: path.join(config.storage.path, (s.image_path || '').replace(/^\//, '')),
        duration: s.duration || 3,
      })).filter(i => fs.existsSync(i.path));

      if (imagesWithDurations.length === 0) {
        return reject(new Error('没有找到有效的图片文件'));
      }

      // 用 concat demuxer 做图片序列
      const concatFile = path.join(outputDir, `img_concat_${Date.now}.txt`);
      const concatContent = imagesWithDurations.map(img =>
        `file '${img.path.replace(/'/g, "\\'")}'\nduration ${img.duration}`
      ).join('\n') + `\nfile '${imagesWithDurations[imagesWithDurations.length - 1].path.replace(/'/g, "\\'")}'`;

      fs.writeFileSync(concatFile, concatContent);

      command = ffmpeg()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .videoCodec('libx264')
        .videoBitrate('3000k')
        .size(resolution)
        .fps(fps)
        .outputOptions([
          '-pix_fmt yuv420p',
          '-preset fast',
          '-vf', 'format=yuv420p',
          '-movflags +faststart',
        ])
        .on('progress', (p) => {
          try {
            const progress = Math.round(p.percent || 0);
            helpers.updateTaskProgress(taskId, progress);
          } catch(e) { /* 进度更新非关键 */ }
        })
        .on('end', () => {
          try { fs.unlinkSync(concatFile); } catch(e) {}

          const relativeOut = `/videos/${path.basename(outputPath)}`;
          db.prepare(
            "INSERT INTO assets (project_id, type, name, file_path, source) VALUES (?,?,?,?,?)"
          ).run(projectId, 'video', '合成_最终视频(幻灯片)', relativeOut, 'composed');

          db.prepare("UPDATE projects SET status = 'completed', updated_at = datetime('now') WHERE id = ?")
            .run(projectId);

          console.log(`[ComposeService] 幻灯片视频合成完成: ${relativeOut}`);
          resolve(relativeOut);
        })
        .on('error', (err) => {
          console.error('[ComposeService] FFmpeg错误:', err.message);
          try { fs.unlinkSync(concatFile); } catch(e) {}
          reject(new Error(`视频合成失败: ${err.message}`));
        })
        .save(outputPath);
    }
  });
}

/**
 * 生成SRT字幕文件
 * @param {number} projectId
 * @returns {Promise<string>} SRT文件内容
 */
async function generateSubtitles(projectId) {
  const scriptRow = db.prepare('SELECT content FROM scripts WHERE project_id = ?').get(projectId);
  if (!scriptRow?.content) throw new Error('剧本不存在');

  let scriptData;
  try { scriptData = JSON.parse(scriptRow.content); } catch(e) { throw new Error('剧本格式错误'); }

  let srt = '';
  let index = 1;
  let currentTime = 0;

  for (const ep of scriptData.episodes || []) {
    for (const scene of ep.scenes || []) {
      for (const line of scene.dialogue || []) {
        if (!line.text) continue;
        
        const startTime = formatSRTTime(currentTime);
        const duration = parseFloat(line.estimated_duration || 3);
        currentTime += duration;
        const endTime = formatSRTTime(currentTime);

        srt += `${index}\n${startTime} --> ${endTime}\n${line.character}: ${line.text}\n\n`;
        index++;
      }
    }
  }

  return srt;
}

/**
 * 格式化为SRT时间格式 HH:MM:SS,mmm
 */
function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

module.exports = {
  composeVideo,
  generateSubtitles,
};
