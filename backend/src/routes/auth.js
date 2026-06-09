const express = require('express');
const crypto = require('crypto');
const db = require('../db/connection');

const router = express.Router();

// 获取或初始化管理员密码
function getAdminPassword() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  if (!row) {
    // 默认密码 admin123
    db.prepare("INSERT INTO settings (key, value, category) VALUES ('admin_password', 'admin123', 'auth')").run();
    return 'admin123';
  }
  return row.value;
}

// 内存中存储 token（进程重启失效，需重新登录）
const tokens = new Set();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: '请输入密码', code: 'MISSING_PASSWORD' });
  }

  const adminPassword = getAdminPassword();
  if (password !== adminPassword) {
    return res.status(401).json({ error: '密码错误', code: 'INVALID_PASSWORD' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  tokens.add(token);

  res.json({ code: 0, message: '登录成功', token });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) tokens.delete(token);
  res.json({ code: 0, message: '已退出登录' });
});

// GET /api/auth/verify — 验证 token 是否有效
router.get('/verify', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: '未登录或登录已过期', code: 'UNAUTHORIZED' });
  }
  res.json({ code: 0, message: 'ok' });
});

// PUT /api/auth/password — 修改密码
router.put('/password', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' });
  }

  const { oldPassword, newPassword } = req.body;
  const adminPassword = getAdminPassword();

  if (oldPassword !== adminPassword) {
    return res.status(400).json({ error: '原密码错误', code: 'WRONG_OLD_PASSWORD' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: '新密码至少4位', code: 'PASSWORD_TOO_SHORT' });
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value, category, updated_at) VALUES ('admin_password', ?, 'auth', datetime('now'))").run(newPassword);
  res.json({ code: 0, message: '密码已更新' });
});

// 导出 token 验证中间件，供其他路由使用（可选）
router.verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: '未登录或登录已过期', code: 'UNAUTHORIZED' });
  }
  next();
};

module.exports = router;
