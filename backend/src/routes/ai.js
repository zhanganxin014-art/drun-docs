const express = require('express');
const OpenAI = require('openai');
const db = require('../db/connection');
const router = express.Router();

/**
 * 测试API连接 + AI模型测试
 */
router.post('/test', async (req, res) => {
  try {
    // 从settings表获取最新API配置
    const apiBaseSetting = db.prepare("SELECT value FROM settings WHERE key = 'api_base_url'").get();
    const apiKeySetting = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get();

    const baseUrl = apiBaseSetting?.value || process.env.API_BASE_URL;
    const apiKey = apiKeySetting?.value || process.env.API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: '未配置API Key，请在设置中填写', code: 'NO_API_KEY' });
    }

    const client = new OpenAI({
      baseURL: baseUrl,
      apiKey: apiKey,
    });

    // 发送简单测试请求
    const response = await client.chat.completions.create({
      model: req.body.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: '回复"连接成功"' }],
      max_tokens: 10,
    });

    res.json({
      code: 0,
      data: {
        connected: true,
        model: response.model,
        reply: response.choices[0]?.message?.content,
        baseUrl: baseUrl.replace(/\/v\d+\/?$/, ''),
      },
    });
  } catch (err) {
    console.error('[AI Test Error]', err);
    res.status(502).json({
      error: `API连接失败: ${err.message}`,
      code: 'AI_CONNECTION_ERROR',
      details: err.status || err.code,
    });
  }
});

/**
 * 获取可用的模型列表（从聚合API）
 */
router.get('/models', async (req, res) => {
  try {
    const apiBaseSetting = db.prepare("SELECT value FROM settings WHERE key = 'api_base_url'").get();
    const apiKeySetting = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get();
    const baseUrl = apiBaseSetting?.value || process.env.API_BASE_URL;
    const apiKey = apiKeySetting?.value || process.env.API_KEY;

    if (!apiKey) {
      return res.json({ code: 0, data: [] }); // 未配置时返回空列表
    }

    const client = new OpenAI({ baseURL: baseUrl, apiKey });
    const models = await client.models.list();
    res.json({ code: 0, data: models.data.map(m => ({ id: m.id, owned_by: m.owned_by })) });
  } catch (err) {
    console.error('[Models Error]', err);
    res.status(502).json({ error: err.message, code: 'MODELS_ERROR' });
  }
});

module.exports = router;
