/**
 * 工具函数集
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 生成唯一文件名
 */
function generateFileName(ext = '') {
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
}

/**
 * 将base64图片数据保存到本地文件
 * @param {string} base64Data - base64编码的图片数据
 * @param {string} subDir - 子目录(images/videos等)
 * @param {string} ext - 文件扩展名(.png/.jpg)
 * @returns {{ filePath: string, url: string }}
 */
function saveBase64Image(base64Data, subDir = 'images', ext = '.png') {
  const config = require('../config');
  const dirPath = path.join(config.storage.path, subDir);
  ensureDir(dirPath);

  // 去掉data:image/xxx;base64,前缀
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const fileName = generateFileName(ext);
  const filePath = path.join(dirPath, fileName);
  
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  
  return {
    filePath: `/${subDir}/${fileName}`,
    url: `${config.storage.url}/${subDir}/${fileName}`,
  };
}

/**
 * 从数据库获取设置值
 */
function getSetting(key, defaultValue = null) {
  const db = require('../db/connection');
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value); // 尝试解析JSON
  } catch {
    return row.value; // 返回原始字符串
  }
}

/**
 * 创建或更新任务记录并返回ID
 */
function createTask(projectId, type, status = 'pending') {
  const db = require('../db/connection');
  const result = db.prepare(
    'INSERT INTO tasks (project_id, type, status) VALUES (?,?,?)'
  ).run(projectId, type, status);
  return result.lastInsertRowid;
}

/**
 * 更新任务进度
 */
function updateTaskProgress(taskId, progress, status, extra = {}) {
  const db = require('../db/connection');
  const updates = { progress, updated_at: new Date().toISOString(), ...extra };
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), taskId];
  db.prepare(`UPDATE tasks SET ${sets} WHERE id = ?`).run(...values);
}

/**
 * 完成任务
 */
function completeTask(taskId, result, error = null) {
  const db = require('../db/connection');
  if (error) {
    db.prepare("UPDATE tasks SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?")
      .run(error, taskId);
  } else {
    db.prepare("UPDATE tasks SET status = 'completed', progress = 100, result = ?, completed_at = datetime('now') WHERE id = ?")
      .run(typeof result === 'string' ? result : JSON.stringify(result), taskId);
  }
}

module.exports = {
  ensureDir,
  generateFileName,
  saveBase64Image,
  getSetting,
  createTask,
  updateTaskProgress,
  completeTask,
};
