const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  port: process.env.PORT || 5680,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  api: {
    baseUrl: process.env.API_BASE_URL || 'https://api.openai.com/v1',
    key: process.env.API_KEY || '',
  },
  db: {
    path: process.env.DB_PATH || path.join(__dirname, '../data/drama.db'),
  },
  storage: {
    path: process.env.STORAGE_PATH || path.join(__dirname, '../data/storage'),
    url: process.env.STATIC_URL || 'http://localhost:5680/static',
  },
  // AI模型默认配置
  models: {
    text: process.env.TEXT_MODEL || 'gpt-4o-mini',
    image: process.env.IMAGE_MODEL || 'glm-image',
    video: process.env.VIDEO_MODEL || 'seedance-v1.5-pro-t2v',
    kling: process.env.KLING_MODEL || 'kling-v1.6-t2v',
    seedance_t2v: process.env.SEEDANCE_T2V_MODEL || 'seedance-v1.5-pro-t2v',
    seedance_i2v: process.env.SEEDANCE_I2V_MODEL || 'seedance-v1.5-pro-i2v',
    tts: process.env.TTS_MODEL || 'tts-1',
  },
};
