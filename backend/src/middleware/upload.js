const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const fs = require('fs');

// 确保上传子目录存在
const uploadDirs = ['images', 'videos', 'audio', 'documents'];
uploadDirs.forEach(dir => {
  const fullPath = path.join(config.storage.path, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subdir = 'images';
    if (file.mimetype.startsWith('video')) subdir = 'videos';
    else if (file.mimetype.startsWith('audio')) subdir = 'audio';
    else if (file.mimetype.includes('text') || file.mimetype.includes('document')) subdir = 'documents';
    cb(null, path.join(config.storage.path, subdir));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB限制
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/wav', 'audio/mp3',
      'text/plain', 'application/pdf',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${file.mimetype}`));
    }
  },
});

module.exports = upload;
