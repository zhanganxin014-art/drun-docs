const express = require('express');
const db = require('../db/connection');
const router = express.Router();

// GET /api/settings - 获取所有设置
router.get('/', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings ORDER BY category ASC').all();
    const grouped = {};
    settings.forEach(s => {
      if (!grouped[s.category]) grouped[s.category] = {};
      grouped[s.category][s.key] = s.value;
    });
    res.json({ code: 0, data: grouped });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// PUT /api/settings - 批量更新设置
router.put('/', (req, res) => {
  try {
    const { settings } = req.body; // { key: value, ... }
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, category, updated_at) VALUES (?,?,?,datetime('now'))"
    );

    for (const [key, value] of Object.entries(settings)) {
      // 自动分类
      let category = 'general';
      if (key.includes('api') || key.includes('model')) category = 'ai';
      else if (key.includes('url') || key.includes('key')) category = 'auth';
      
      stmt.run(key, typeof value === 'object' ? JSON.stringify(value) : String(value), category);
    }

    // 同步更新运行时配置
    const allSettings = db.prepare('SELECT key, value FROM settings').all();
    res.json({ code: 0, message: '设置已保存', data: allSettings });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SETTINGS_ERROR' });
  }
});

module.exports = router;
