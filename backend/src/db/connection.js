const Database = require('better-sqlite3');
const path = require('path');
const config = require('../config');
const fs = require('fs');

// 确保数据目录存在
const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.db.path);

// 启用WAL模式提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化表结构
const initSchema = `
-- 项目表
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

-- 剧本表
CREATE TABLE IF NOT EXISTS scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  raw_text TEXT,
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT (datetime('now'))
);

-- 集表
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  script_id INTEGER REFERENCES scripts(id) ON DELETE SET NULL,
  episode_number INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  summary TEXT,
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

-- 场景资产表
CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  prompt_text TEXT,
  image_path TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);

-- 角色表
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prompt_text TEXT,
  seed INTEGER,
  images TEXT DEFAULT '[]',
  voice_id TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);

-- 分镜表
CREATE TABLE IF NOT EXISTS storyboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  scene_index INTEGER DEFAULT 0,
  shot_type TEXT DEFAULT '中景',
  description TEXT,
  prompt_text TEXT,
  image_path TEXT,
  video_path TEXT,
  duration REAL DEFAULT 3.0,
  character_ids TEXT DEFAULT '[]',
  dialogue_text TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);

-- 素材资产表
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT,
  file_path TEXT,
  thumbnail_path TEXT,
  metadata TEXT DEFAULT '{}',
  source TEXT DEFAULT 'ai_generated',
  created_at DATETIME DEFAULT (datetime('now'))
);

-- 生成任务表
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  result TEXT,
  error TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  completed_at DATETIME
);

-- 系统设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  category TEXT DEFAULT 'general',
  updated_at DATETIME DEFAULT (datetime('now'))
);
`;

db.exec(initSchema);

// 迁移：v1.1
try {
  db.exec("ALTER TABLE storyboards ADD COLUMN video_params TEXT DEFAULT '{}'");
  console.log('[DB] 迁移 v1.1: storyboards.video_params 列已添加');
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    console.warn('[DB] 迁移 v1.1 警告:', e.message);
  }
}

// 迁移：v1.2
try {
  db.exec("ALTER TABLE storyboards ADD COLUMN scene_number INTEGER DEFAULT 1");
  console.log('[DB] 迁移 v1.2: storyboards.scene_number 列已添加');
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    console.warn('[DB] 迁移 v1.2 警告:', e.message);
  }
}

// 迁移：v1.3 — episode_id + character_ids 名字转ID
try {
  db.exec("ALTER TABLE storyboards ADD COLUMN episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL");
  console.log('[DB] 迁移 v1.3: storyboards.episode_id 列已添加');
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    console.warn('[DB] 迁移 v1.3 警告:', e.message);
  }
}

// v1.3 兼容：character_ids 名字 → ID
try {
  const rows = db.prepare('SELECT id, project_id, character_ids FROM storyboards').all();
  let converted = 0;
  for (const row of rows) {
    try {
      const ids = JSON.parse(row.character_ids || '[]');
      if (ids.length === 0) continue;
      if (typeof ids[0] === 'number') continue;
      const newIds = [];
      for (const name of ids) {
        const char = db.prepare('SELECT id FROM characters WHERE project_id = ? AND name = ?').get(row.project_id, name);
        if (char) newIds.push(char.id);
      }
      if (newIds.length > 0) {
        db.prepare('UPDATE storyboards SET character_ids = ? WHERE id = ?').run(JSON.stringify(newIds), row.id);
        converted++;
      }
    } catch {}
  }
  if (converted > 0) console.log("[DB] 迁移 v1.3: " + converted + "条分镜的character_ids已转为ID引用");
} catch (e) {
  console.warn('[DB] 迁移 v1.3 character_ids转换警告:', e.message);
}

console.log('[DB] 数据库初始化完成:', config.db.path);

// 迁移：v1.4 — storyboards加scene_id外键
try {
  db.exec("ALTER TABLE storyboards ADD COLUMN scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL");
  console.log('[DB] 迁移 v1.4: storyboards.scene_id 列已添加');
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    console.warn('[DB] 迁移 v1.4 警告:', e.message);
  }
}

// 迁移：v1.5 — storyboards 加 character_actions 列（多角色同框动作/站位/台词）
try {
  db.exec("ALTER TABLE storyboards ADD COLUMN character_actions TEXT DEFAULT '[]'");
  console.log('[DB] 迁移 v1.5: storyboards.character_actions 列已添加');
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    console.warn('[DB] 迁移 v1.5 警告:', e.message);
  }
}

// 迁移：v1.6 — scenes 加 episode_id 外键（syncEpisodesAndScenes 需要）
try {
  db.exec("ALTER TABLE scenes ADD COLUMN episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL");
  console.log('[DB] 迁移 v1.6: scenes.episode_id 列已添加');
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    console.warn('[DB] 迁移 v1.6 警告:', e.message);
  }
}

// 迁移：v1.7 — characters 加 reference_image_path（用户上传的角色参考照片）
try {
  db.exec("ALTER TABLE characters ADD COLUMN reference_image_path TEXT DEFAULT NULL");
  console.log('[DB] 迁移 v1.7: characters.reference_image_path 列已添加');
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    console.warn('[DB] 迁移 v1.7 警告:', e.message);
  }
}

module.exports = db;
