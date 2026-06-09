/**
 * AI服务核心层 - OpenAI兼容API封装
 * 支持用户自己的聚合API Key (OpenAI格式)
 * 集成可灵(Kling) + Seedance 视频生成异步任务模式
 */
const OpenAI = require('openai');
const db = require('../db/connection');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 获取OpenAI客户端实例（使用settings表或环境变量配置）
 * @returns {OpenAI}
 */
function getClient() {
  const apiBase = db.prepare("SELECT value FROM settings WHERE key = 'api_base_url'").get()?.value
    || process.env.API_BASE_URL;
  const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get()?.value
    || process.env.API_KEY;

  if (!apiKey) {
    throw new Error('未配置API Key，请在系统设置中配置聚合API Key');
  }

  return new OpenAI({
    baseURL: apiBase,
    apiKey: apiKey,
    timeout: 120000, // 2分钟超时(生成任务可能较慢)
  });
}

/**
 * 获取当前配置的模型名称
 */
function getModel(type = 'text') {
  const modelKey = `${type}_model`;
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(modelKey);
  
  // 默认模型映射（IPS Union当前可用模型）
  const defaults = {
    text: 'gpt-4o-mini',
    image: 'glm-image',
    video: 'doubao-seedance-2.0',           // 默认视频模型
    video_i2v: 'doubao-seedance-2.0',       // 图生视频
    video_t2v: 'kling-v1.6-t2v',            // 文生视频
    kling: 'kling-v1.6-t2v',
    seedance_t2v: 'seedance-v1.5-pro-t2v',
    seedance_i2v: 'seedance-v1.5-pro-i2v',
    tts: 'tts-1',
  };

  return row?.value || defaults[type] || defaults.text;
}

/**
 * LLM对话调用
 * @param {Array} messages - 消息数组 [{role, content}]
 * @param {Object} options - 可选参数 {model, temperature, max_tokens}
 * @returns {string} 助手回复文本
 */
async function chat(messages, options = {}) {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: options.model || getModel('text'),
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens || 4096,
    ...options,
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * JSON模式LLM调用（确保返回有效JSON）
 * @param {Array} messages
 * @param {Object} options
 * @returns {Object} 解析后的JSON对象
 */
async function chatJSON(messages, options = {}) {
  const result = await chat(messages, {
    ...options,
    response_format: { type: "json_object" },
  });

  try {
    return JSON.parse(result);
  } catch (e) {
    console.error('[AI] JSON解析失败，尝试修复:', result.substring(0, 200));
    // 尝试提取JSON部分
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('AI返回的JSON格式无效');
  }
}

/**
 * 图片生成（支持同步和异步任务两种模式）
 * 
 * IPS Union 的 glm-image / gpt-image-2 等模型已切换为异步任务模式，
 * 返回 {task_id, status: "queued"} 而非直接的 [{b64_json}]。
 * 本函数自动检测模式并处理。
 * 
 * @param {Object} params - {prompt, size, quality, n, pollInterval, maxWait}
 * @returns {Array<{b64_json, revised_prompt}>} 生成的图片数据（统一转为同步格式）
 */
async function generateImage(params) {
  const model = params.model || getModel('image');
  const apiBase = getApiBase();

  console.log(`[AI-Image] 开始生成图片: model=${model}, size=${params.size || '1024x576'}`);

  // IPS Union 图片生成返回异步任务，OpenAI SDK 无法正确解析
  // 改用 httpRequest 直接调用
  const endpoint = `${apiBase.replace(/\/$/, '')}/images/generations`;
  const body = {
    model,
    prompt: params.prompt,
    n: params.n || 1,
    size: params.size || '1024x576',
  };

  // 参考图模式：支持 image_urls 或 base64 参考图输入
  if (params.reference_images && params.reference_images.length > 0) {
    body.reference_images = params.reference_images;
    console.log(`[AI-Image] 参考图模式: 传入 ${params.reference_images.length} 张参考图`);
  }

  let response;
  try {
    response = await httpRequest(endpoint, {
      method: 'POST',
      body,
      timeout: 30000,
    });
  } catch (err) {
    console.error(`[AI-Image] API调用失败: ${err.message}`);
    throw new Error(`图片生成API调用失败: ${err.message}`);
  }

  console.log(`[AI-Image] 响应keys: [${Object.keys(response).join(',')}], status=${response.status}`);

  // === 判断响应格式 ===
  // A) 异步任务: {id, task_id, status: "queued"} — IPS Union glm-image
  // B) 同步返回: {data: [{b64_json}]} — OpenAI 标准
  // C) 同步URL: {data: [{url}]} — OpenAI URL 格式

  // 情况A：异步任务
  const taskId = response.task_id || response.id;
  if (taskId && (response.status === 'queued' || response.status === 'pending' || response.status === 'processing' || response.status === 'in_progress')) {
    console.log(`[AI-Image] 异步任务: task_id=${taskId}, status=${response.status}`);
    return await pollImageTask(taskId, {
      pollInterval: params.pollInterval || 5000,
      maxWait: params.maxWait || 300000,
    });
  }

  // 情况A2：有 task_id 但已完成
  if (taskId && (response.status === 'completed' || response.status === 'succeeded')) {
    console.log(`[AI-Image] 异步任务已完成: task_id=${taskId}`);
    const extracted = await extractImageData(response);
    if (extracted) return extracted;
    return await pollImageTask(taskId, {
      pollInterval: params.pollInterval || 5000,
      maxWait: params.maxWait || 300000,
    });
  }

  // 情况B/C：同步返回 data 数组
  const itemList = response.data;
  if (itemList && Array.isArray(itemList) && itemList.length > 0) {
    const firstItem = itemList[0];
    if (firstItem.b64_json) {
      console.log('[AI-Image] 同步模式 b64_json');
      return itemList;
    }
    if (firstItem.url) {
      console.log('[AI-Image] 同步模式 URL，下载转 base64');
      const b64 = await downloadImageAsBase64(firstItem.url);
      return [{ b64_json: b64, revised_prompt: firstItem.revised_prompt }];
    }
    // 可能是 data 里的异步任务
    if (firstItem.task_id) {
      console.log(`[AI-Image] data数组中的异步任务: task_id=${firstItem.task_id}`);
      return await pollImageTask(firstItem.task_id, {
        pollInterval: params.pollInterval || 5000,
        maxWait: params.maxWait || 300000,
      });
    }
  }

  // 无法识别
  const safeLog = JSON.stringify(response).substring(0, 500);
  console.error(`[AI-Image] 无法识别的格式: ${safeLog}`);
  throw new Error('AI图片API返回格式无法识别');
}

/**
 * 轮询异步图片任务直到完成，并下载图片转 base64
 * @param {string} taskId
 * @param {Object} opts - {pollInterval, maxWait}
 * @returns {Array<{b64_json}>}
 */
async function pollImageTask(taskId, opts = {}) {
  const apiBase = getApiBase();
  const pollInterval = opts.pollInterval || 5000;
  const maxWait = opts.maxWait || 300000;
  const startTime = Date.now();

  // 尝试多种轮询端点
  const pollEndpoints = [
    `${apiBase.replace(/\/$/, '')}/images/generations/${taskId}`,
    `${apiBase.replace(/\/$/, '')}/tasks/${taskId}`,
  ];

  let taskResult = null;

  while (Date.now() - startTime < maxWait) {
    await sleep(pollInterval);

    for (const endpoint of pollEndpoints) {
      try {
        const resp = await httpRequest(endpoint, { method: 'GET', timeout: 15000 });
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // 兼容两种响应格式：裸任务对象 vs {data: [...]} 包装
        const taskObj = resp.data?.[0] || resp.data || resp;
        const taskStatus = taskObj.status || resp.status;

        console.log(`[AI-Image] 轮询 ${taskId}: status=${taskStatus} (${elapsed}s)`);

        if (taskStatus === 'completed' || taskStatus === 'succeeded') {
          taskResult = taskObj;
          break;
        }
        if (taskStatus === 'failed') {
          throw new Error(`图片生成任务失败: ${taskObj.error || taskObj.message || '未知错误'}`);
        }
        // queued/pending/processing → 继续等待
      } catch (err) {
        // 端点不存在或其他错误，尝试下一个
        if (err.message.includes('图片生成任务失败')) throw err;
        continue;
      }
    }

    if (taskResult) break;
  }

  if (!taskResult || taskResult.status !== 'completed') {
    throw new Error(`图片生成任务超时 (${Math.round(maxWait/1000)}s)，最后状态: ${taskResult?.status || 'unknown'}`);
  }

  // 从完成响应中提取图片 URL — 兼容多种返回格式
  const imageUrl = taskResult.image_url
    || taskResult.data?.[0]?.url
    || taskResult.data?.[0]?.b64_json
    || taskResult.result?.url
    || taskResult.result?.image_url
    || taskResult.metadata?.url
    || taskResult.url;

  if (!imageUrl) {
    console.error('[AI-Image] 完成但无图片URL，完整响应:', JSON.stringify(taskResult).substring(0, 500));
    throw new Error('图片任务完成但未返回图片数据');
  }

  // 如果已经是 base64，直接包装返回
  if (imageUrl.startsWith('data:') || !imageUrl.startsWith('http')) {
    console.log('[AI-Image] 任务返回 base64 数据');
    return [{ b64_json: imageUrl.replace(/^data:image\/\w+;base64,/, '') }];
  }

  // 下载图片并转 base64
  console.log(`[AI-Image] 下载图片: ${imageUrl.substring(0, 80)}...`);
  const b64 = await downloadImageAsBase64(imageUrl);
  return [{ b64_json: b64 }];
}

/**
 * 从已完成的异步任务响应中提取图片数据（b64_json 格式）
 * 兼容多种响应结构：{image_url}, {data: [{url}]}, {result: {url}}, etc.
 * @param {Object} item - 任务响应项
 * @returns {Array<{b64_json}>|null}
 */
async function extractImageData(item) {
  // 尝试多种可能的图片URL/数据字段
  const imageUrl = item.image_url
    || item.data?.[0]?.url
    || item.data?.[0]?.b64_json
    || item.result?.url
    || item.result?.image_url
    || item.url;

  if (!imageUrl) {
    console.error('[AI-Image] extractImageData: 未找到图片数据字段');
    return null;
  }

  // 已经是 base64
  if (imageUrl.startsWith('data:') || !imageUrl.startsWith('http')) {
    console.log('[AI-Image] extractImageData: 返回 base64 数据');
    return [{ b64_json: imageUrl.replace(/^data:image\/\w+;base64,/, '') }];
  }

  // 是URL，下载并转 base64
  console.log(`[AI-Image] extractImageData: 下载图片 ${imageUrl.substring(0, 80)}...`);
  try {
    const b64 = await downloadImageAsBase64(imageUrl);
    return [{ b64_json: b64 }];
  } catch (err) {
    console.error(`[AI-Image] extractImageData: 下载失败 ${err.message}，回退轮询`);
    return null;
  }
}

/**
 * 下载远程图片并转为 base64 字符串
 * @param {string} url - 图片URL
 * @returns {Promise<string>} base64 编码字符串（不含 data: 前缀）
 */
function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    // Node.js https 模块对某些带签名参数的 URL 会超时
    // 改用 curl 命令下载（更可靠）
    const { execFile } = require('child_process');
    const tmpFile = path.join(require('os').tmpdir(), `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    
    execFile('curl', ['-s', '-o', tmpFile, '--max-time', '60', url], (err) => {
      if (err) {
        // curl 失败，回退到 https 模块
        console.log(`[AI-Image] curl下载失败(${err.message})，回退https模块`);
        return downloadImageAsBase64Https(url, resolve, reject);
      }
      
      try {
        const buffer = fs.readFileSync(tmpFile);
        if (buffer.length < 100) {
          // 文件太小，可能不是真实图片
          console.error(`[AI-Image] 下载的文件太小: ${buffer.length} bytes`);
          fs.unlinkSync(tmpFile);
          return downloadImageAsBase64Https(url, resolve, reject);
        }
        const b64 = buffer.toString('base64');
        console.log(`[AI-Image] 图片下载完成(curl): ${(buffer.length / 1024).toFixed(1)}KB`);
        fs.unlinkSync(tmpFile);
        resolve(b64);
      } catch (readErr) {
        fs.unlinkSync(tmpFile);
        return downloadImageAsBase64Https(url, resolve, reject);
      }
    });
  });
}

function downloadImageAsBase64Https(url, resolve, reject) {
  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === 'https:' ? https : http;

  const req = client.get(url, (response) => {
    // 处理重定向
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      downloadImageAsBase64(response.headers.location).then(resolve).catch(reject);
      return;
    }
    if (response.statusCode !== 200) {
      reject(new Error(`图片下载失败: HTTP ${response.statusCode}`));
      return;
    }

    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const b64 = buffer.toString('base64');
      console.log(`[AI-Image] 图片下载完成(https): ${(buffer.length / 1024).toFixed(1)}KB`);
      resolve(b64);
    });
  });

  req.on('error', reject);
  req.setTimeout(60000, () => {
    req.destroy();
    reject(new Error('图片下载超时'));
  });
}

/**
 * 通用HTTP请求（用于Kling API等非OpenAI端点）
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`,
        ...options.headers,
      },
      timeout: options.timeout || 30000,
    };

    const req = client.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        // 调试：打印原始响应
        console.log(`[HTTP] ${options.method || 'GET'} ${url.substring(url.lastIndexOf('/'))} → HTTP${res.statusCode}, body长度=${body.length}, 前200字符=${body.substring(0, 200)}`);

        // 空body处理（某些API返回204或空响应）
        if (!body || body.trim() === '') {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: 空响应`));
          } else {
            console.warn('[HTTP] 收到空body，返回空对象');
            resolve({});
          }
          return;
        }

        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400) {
            const errDetail = typeof json.error === 'object' ? JSON.stringify(json.error) : (json.error || json.message || body);
            reject(new Error(`HTTP ${res.statusCode}: ${errDetail}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          console.error(`[HTTP] JSON解析失败: ${e.message}, body长度=${body.length}, 前500字符=${body.substring(0, 500)}`);
          // 尝试修复：截断的JSON可能是网络问题导致响应不完整
          // 尝试找到最后一个完整的JSON对象
          const lastBrace = body.lastIndexOf('}');
          if (lastBrace > 0 && body[0] === '{') {
            const truncated = body.substring(0, lastBrace + 1);
            try {
              const json = JSON.parse(truncated);
              console.warn('[HTTP] 截断JSON修复成功');
              resolve(json);
              return;
            } catch (e2) {
              // 修复也失败，放弃
            }
          }
          reject(new Error(`Parse error (HTTP ${res.statusCode}): ${body.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * 获取API Key
 */
function getApiKey() {
  return db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get()?.value
    || process.env.API_KEY
    || '';
}

/**
 * 获取API Base URL
 */
function getApiBase() {
  return db.prepare("SELECT value FROM settings WHERE key = 'api_base_url'").get()?.value
    || process.env.API_BASE_URL
    || 'https://api.ipsunion.com/v1';
}

// ===== 模型专属 Body 构建函数（完全隔离，杜绝参数交叉污染） =====

/**
 * Doubao-Seedance-2.0 请求体
 * 仅支持: model, prompt, async, duration, image_urls, image_with_roles
 * 不支持: resolution, size, negative_prompt, aspect_ratio
 */
function buildDoubaoBody(params) {
  const body = {
    model: params.model,
    prompt: params.prompt,
    async: true,
    duration: params.duration || 5,
  };

  // 构建 image_urls：首帧 + 角色/场景参考图，控制总量<=4
  const imageUrls = [];
  if (params.first_frame_url) {
    imageUrls.push(params.first_frame_url);
  }
  if (params.reference_images?.length > 0) {
    // 补充参考图（最多3张，确保总数<=4）
    for (const ref of params.reference_images) {
      if (imageUrls.length >= 4) break;
      if (ref && ref !== params.first_frame_url) {
        imageUrls.push(ref);
      }
    }
  }

  if (params.last_frame_url) {
    // 首尾帧模式：使用 image_with_roles
    body.image_with_roles = [];
    if (params.first_frame_url) {
      body.image_with_roles.push({ url: params.first_frame_url, role: 'first_frame' });
    }
    body.image_with_roles.push({ url: params.last_frame_url, role: 'last_frame' });
  } else if (imageUrls.length > 0) {
    // 普通图生视频：使用 image_urls 数组
    body.image_urls = imageUrls;
  }

  return body;
}

/**
 * Seedance-1.5 请求体
 * 支持: model, prompt, resolution, duration, ratio, image, negative_prompt
 * 不支持: size, image_urls, async, mode
 */
function buildSeedance15Body(params) {
  const isPureT2V = params.model === 'seedance-v1.5-pro-t2v';
  const body = {
    model: params.model,
    prompt: params.prompt,
    resolution: params.resolution || '480p',
    duration: params.duration || 4,
    ratio: params.ratio || '16:9',
  };
  if (params.first_frame_url && !isPureT2V) {
    body.image = params.first_frame_url;
  }
  if (params.negative_prompt) {
    body.negative_prompt = params.negative_prompt;
  }
  return body;
}

/**
 * Kling 请求体
 * 支持: model, prompt, mode, aspect_ratio, seconds, first_frame_url, last_frame_url, camera_control, negative_prompt
 * 不支持: resolution, size, ratio, image, duration, async
 */
function buildKlingBody(params) {
  const isPureT2V = params.model === 'kling-v1.6-t2v';
  const body = {
    model: params.model,
    prompt: params.prompt,
    mode: isPureT2V ? 'Standard' : (params.mode || 'pro'),
    aspect_ratio: params.aspect_ratio || '16:9',
    seconds: params.seconds || '5',
  };
  if (params.first_frame_url && !isPureT2V) {
    body.first_frame_url = params.first_frame_url;
  }
  if (params.last_frame_url && !isPureT2V) {
    body.last_frame_url = params.last_frame_url;
  }
  if (params.camera_control && !isPureT2V && !params.first_frame_url) {
    body.camera_control = params.camera_control;
  }
  if (params.negative_prompt) {
    body.negative_prompt = params.negative_prompt;
  }
  return body;
}

// ===== 模型路由映射表 =====
const MODEL_ROUTING = [
  { test: (m) => m.toLowerCase().includes('doubao-seedance'), builder: buildDoubaoBody, tag: '[Doubao-Seedance2]' },
  { test: (m) => m.toLowerCase().includes('seedance-v1.5'), builder: buildSeedance15Body, tag: '[Seedance1.5]' },
  { test: (m) => m.toLowerCase().includes('kling'), builder: buildKlingBody, tag: '[Kling]' },
];

function resolveModelRouting(model) {
  return MODEL_ROUTING.find(r => r.test(model)) || null;
}

/**
 * 异步视频生成 - 通过模型路由表自动分发到专属参数构建器
 * 
 * 参数完全隔离：每个模型的 allowed/forbidden 参数在 builder 中独立定义，
 * 调用方传入的无关参数会被自动忽略，不会造成交叉污染。
 * 
 * @param {Object} params - 原始参数，builder 自动过滤无关字段
 * @returns {Promise<{video_url: string, local_path: string, task_id: string, model: string}>}
 */
async function generateKlingVideo(params = {}) {
  const model = params.model || getModel('video') || 'doubao-seedance-2.0';
  const route = resolveModelRouting(model);
  if (!route) {
    throw new Error(`不支持的视频模型: ${model}`);
  }

  const isDoubao = model.includes('doubao-seedance');
  const apiBase = getApiBase();
  const videoEndpoint = `${apiBase.replace(/\/$/, '')}/video/generations`;

  // 通过专属 builder 构建请求体，只包含该模型允许的参数
  const body = route.builder({ ...params, model });
  const modelTag = route.tag;

  // 调试日志
  console.log(`${modelTag} 创建视频任务: model=${model}, endpoint=${videoEndpoint}`);
  console.log(`${modelTag} 请求体:`, JSON.stringify(body).substring(0, 300));

  // 1. 创建异步任务
  let createResp;
  try {
    createResp = await httpRequest(videoEndpoint, {
      method: 'POST',
      body: body,
      timeout: 30000,
    });
  } catch (err) {
    console.error(`${modelTag} 创建任务失败:`, err.message);
    throw new Error(`${modelTag}任务创建失败: ${err.message}`);
  }

  // 提取 task_id — 兼容多种响应格式
  // IPS Union seedance/kling: {id, task_id, status}
  // doubao-seedance-2.0 (apimart格式): {code:200, data:[{task_id, status}]}
  const taskId = createResp.id || createResp.task_id || createResp.data?.[0]?.task_id;
  if (!taskId) {
    console.error(`${modelTag} 未返回task_id:`, JSON.stringify(createResp).substring(0, 500));
    throw new Error(`${modelTag} API未返回任务ID`);
  }

  const initialStatus = createResp.status || createResp.data?.[0]?.status || 'queued';
  console.log(`${modelTag} 任务已创建: ${taskId}, 初始状态: ${initialStatus}`);

  // 2. 轮询直到完成
  const pollInterval = params.pollInterval || 5000;
  const maxWait = params.maxWait || 600000;
  const startTime = Date.now();
  let taskStatus;

  while (Date.now() - startTime < maxWait) {
    await sleep(pollInterval);

    // 轮询端点 — doubao-seedance-2.0 可能走不同格式
    let pollResp;
    try {
      pollResp = await httpRequest(`${videoEndpoint}/${taskId}`, {
        method: 'GET',
        timeout: 15000,
      });
    } catch (err) {
      // 可能端点格式不同，尝试兼容路径
      if (isDoubao && err.message.includes('HTTP 404')) {
        try {
          pollResp = await httpRequest(`${apiBase.replace(/\/$/, '')}/tasks/${taskId}`, {
            method: 'GET',
            timeout: 15000,
          });
        } catch (err2) {
          console.warn(`${modelTag} 轮询出错 (将继续重试): ${err2.message}`);
          continue;
        }
      } else {
        console.warn(`${modelTag} 轮询出错 (将继续重试): ${err.message}`);
        continue;
      }
    }

    // 兼容多种轮询响应格式
    taskStatus = pollResp.data?.[0] || pollResp.result || pollResp;
    const status = taskStatus.status || pollResp.status;

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    if (params.onProgress) {
      params.onProgress(status, elapsed);
    }

    console.log(`${modelTag} 任务 ${taskId}: ${status} (${elapsed}s)`);

    if (status === 'completed' || status === 'succeeded') {
      break; // 成功
    }

    if (status === 'failed') {
      throw new Error(`${modelTag}任务失败: ${taskStatus.error || taskStatus.error_message || taskStatus.message || '未知错误'}`);
    }

    // queued / pending / in_progress / processing / submitted 继续等待
  }

  if (!taskStatus || (taskStatus.status !== 'completed' && taskStatus.status !== 'succeeded')) {
    throw new Error(`${modelTag}任务超时 (${Math.round(maxWait/1000)}s)，最后状态: ${taskStatus?.status || 'unknown'}`);
  }

  // 3. 提取视频URL - 兼容多种返回格式
  const videoUrl = taskStatus.video_url 
    || taskStatus.output?.video_url
    || taskStatus.metadata?.url 
    || taskStatus.data?.[0]?.url 
    || taskStatus.result?.video_url
    || taskStatus.content?.url;
  if (!videoUrl) {
    console.error(`${modelTag} 无视频URL，完整响应:`, JSON.stringify(taskStatus).substring(0, 500));
    throw new Error(`${modelTag}任务完成但未返回视频URL`);
  }

  console.log(`${modelTag} 视频生成完成，开始下载: ${videoUrl.substring(0,100)}...`);

  const localPath = await downloadVideo(videoUrl, modelTag.replace(/[\[\]]/g, '').toLowerCase());

  return {
    video_url: videoUrl,
    local_path: localPath,
    task_id: taskId,
    model,
    usage: taskStatus.usage || {},
  };
}

/**
 * 下载视频到本地存储
 */
async function downloadVideo(url, prefix = 'kling') {
  const config = require('../config');
  const storageDir = path.join(config.storage.path, 'videos');
  
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const fileName = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp4`;
  const savePath = path.join(storageDir, fileName);

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(url, (response) => {
      // 处理重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        resolve(downloadVideo(response.headers.location, prefix));
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`视频下载失败: HTTP ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(savePath);
      let downloaded = 0;
      const total = parseInt(response.headers['content-length'], 10) || 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.round(downloaded / total * 100);
          if (pct % 20 === 0) console.log(`[${prefix}] 下载进度: ${pct}%`);
        }
      });

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`[${prefix}] 视频已保存: ${savePath}`);
        resolve(`/videos/${fileName}`);
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('视频下载超时'));
    });
  });
}

/**
 * Seedance 2.0 图生视频 — 独立API（/api/v3 协议）
 * 三步流程：①将图片编为base64 → ②提交任务 → ③轮询下载视频
 * 
 * @param {Object} params
 * @param {string} params.prompt - 文本提示词
 * @param {string} [params.image] - 本地图片路径（如 /images/xxx.png）
 * @param {string} [params.model] - AlCC-doubao-seedance-2.0 / AlCC-doubao-seedance-2.0-fast
 * @param {string} [params.resolution] - 480p / 720p / 1080p，默认 720p
 * @param {string} [params.ratio] - 16:9 / 9:16 / 1:1 等
 * @param {number} [params.duration] - 4-15秒
 * @param {Function} [params.onProgress] - 进度回调
 * @returns {Promise<{video_url, local_path, task_id, model}>}
 */
async function generateSeedance2Video(params = {}) {
  const config = require('../config');
  const SD2_BASE = 'https://zhenze-huhehaote.cmecloud.cn';
  const SD2_KEY = '44eHRkgBeK9KJOGQ-8oHc7HeC0XNQkwYWCOnpBeadiU';
  const model = params.model || 'AlCC-doubao-seedance-2.0';

  const sd2Headers = {
    'Authorization': `Bearer ${SD2_KEY}`,
    'Content-Type': 'application/json',
  };

  console.log(`[Seedance2] 开始图生视频: model=${model}, duration=${params.duration || 5}s`);

  // === 步骤 1：准备参考图片（base64 data URI） ===
  // /api/v3 协议要求公网URL，先用 base64 data URI 内嵌
  let imageDataUri;
  if (params.image) {
    let localPath;
    if (params.image.startsWith('http://') || params.image.startsWith('https://')) {
      const urlPrefix = (config.storage.url || '').replace(/\/$/, '');
      const relPath = params.image.startsWith(urlPrefix)
        ? params.image.slice(urlPrefix.length)
        : null;
      if (relPath) {
        localPath = path.join(config.storage.path, relPath);
      }
      // 非本地URL → 下载
      if (!localPath || !fs.existsSync(localPath)) {
        console.log(`[Seedance2] 从URL下载参考图: ${params.image}`);
        const tmpPath = path.join(config.storage.path, 'tmp', `sd2_${Date.now()}.png`);
        await downloadToFile(params.image, tmpPath);
        localPath = tmpPath;
      }
    } else {
      localPath = path.join(config.storage.path, params.image);
    }

    if (!fs.existsSync(localPath)) {
      throw new Error(`参考图片不存在: ${localPath}`);
    }
    
    const ext = path.extname(localPath).toLowerCase();
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    const mimeType = mimeMap[ext] || 'image/png';
    const imgBuffer = fs.readFileSync(localPath);
    const b64 = imgBuffer.toString('base64');
    imageDataUri = `data:${mimeType};base64,${b64}`;
    console.log(`[Seedance2] 参考图已编码: ${localPath} (${(imgBuffer.length/1024).toFixed(1)}KB → base64)`);

    // 清理临时文件
    if (localPath.includes('/tmp/sd2_')) {
      try { fs.unlinkSync(localPath); } catch (e) {}
    }
  } else if (params.first_frame_url) {
    console.log(`[Seedance2] 下载并编码参考图: ${params.first_frame_url}`);
    const tmpPath = path.join(config.storage.path, 'tmp', `sd2_${Date.now()}.png`);
    await downloadToFile(params.first_frame_url, tmpPath);
    const imgBuffer = fs.readFileSync(tmpPath);
    const b64 = imgBuffer.toString('base64');
    imageDataUri = `data:image/png;base64,${b64}`;
    try { fs.unlinkSync(tmpPath); } catch (e) {}
  }

  // === 步骤 2：提交生成任务 ===
  const content = [];
  if (imageDataUri) {
    content.push({ type: 'image_url', image_url: imageDataUri });
  }
  if (params.prompt) {
    content.push({ type: 'text', text: params.prompt });
  }

  const taskBody = {
    model,
    content,
    resolution: params.resolution || '720p',
    ratio: params.ratio || params.aspect_ratio || '16:9',
    duration: params.duration || 5,
    generate_audio: false,
  };

  console.log(`[Seedance2] 提交任务:`, JSON.stringify(taskBody).substring(0, 300));
  
  const submitResp = await httpRequestRaw(`${SD2_BASE}/api/v3/contents/generations/tasks`, {
    method: 'POST',
    body: taskBody,
    headers: sd2Headers,
    timeout: 30000,
  });

  // /api/v3 返回格式: { id, status, ... } 或 { code, result: { task_id } }
  const taskId = submitResp.id || submitResp.result?.task_id || submitResp.task_id;
  if (!taskId) {
    throw new Error(`Seedance2 任务提交失败: ${submitResp.message || JSON.stringify(submitResp)}`);
  }
  console.log(`[Seedance2] 任务已创建: ${taskId}${submitResp.credit_cost ? `, 预计消耗: ${submitResp.credit_cost} 积分` : ''}`);

  // === 步骤 3：轮询等待完成 ===
  const pollInterval = 5000;
  const maxWait = 600000;
  const startTime = Date.now();
  let taskResult;

  while (Date.now() - startTime < maxWait) {
    await sleep(pollInterval);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const pollResp = await httpRequestRaw(`${SD2_BASE}/api/v3/contents/generations/tasks/${taskId}`, {
      method: 'GET',
      headers: sd2Headers,
      timeout: 15000,
    });

    // /api/v3 返回格式: { id, status, output: { video_url }, ... }
    taskResult = pollResp;
    const status = taskResult.status;

    if (params.onProgress) {
      const progressMap = { pending: 5, queued: 10, processing: Math.min(20 + elapsed, 80), completed: 95 };
      params.onProgress(status, elapsed);
    }

    console.log(`[Seedance2] ${taskId}: ${status} (${elapsed}s)`);

    if (status === 'completed') break;
    if (['failed', 'cancelled', 'expired'].includes(status)) {
      throw new Error(`Seedance2 任务失败: ${taskResult.error_message || taskResult.error || status}`);
    }
  }

  if (!taskResult || taskResult.status !== 'completed') {
    throw new Error(`Seedance2 任务超时 (${Math.round(maxWait/1000)}s)`);
  }

  // /api/v3: video_url 可能在 output 或根级别
  const videoUrl = taskResult.output?.video_url || taskResult.video_url || taskResult.result?.video_url;
  if (!videoUrl) {
    throw new Error('Seedance2 任务完成但未返回视频URL');
  }

  console.log(`[Seedance2] 视频生成完成，开始下载: ${videoUrl.substring(0, 80)}...`);
  const localPath = await downloadVideo(videoUrl, 'seedance2');

  return {
    video_url: videoUrl,
    local_path: localPath,
    task_id: taskId,
    model,
  };
}

/**
 * Seedance 2.0 图片上传：获取预签名URL → PUT上传 → 返回 file_path
 */
async function seedance2UploadImage(localPath, apiBase, apiKey) {
  const fileName = path.basename(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  const contentType = mimeMap[ext] || 'image/png';

  // 1. 获取预签名上传URL
  const presignResp = await httpRequestRaw(
    `${apiBase}/api/v1/video/upload/presign?filename=${encodeURIComponent(fileName)}&content_type=${encodeURIComponent(contentType)}`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, timeout: 15000 }
  );

  if (presignResp.code !== '200' || !presignResp.result?.presigned_url) {
    throw new Error(`Seedance2 预签名获取失败: ${presignResp.message || JSON.stringify(presignResp)}`);
  }

  const { presigned_url, file_path } = presignResp.result;
  console.log(`[Seedance2] 预签名获取成功: file_path=${file_path}`);

  // 2. PUT 上传文件到预签名URL
  const fileBuffer = fs.readFileSync(localPath);
  await s3PutUpload(presigned_url, fileBuffer, contentType);

  console.log(`[Seedance2] 图片上传完成: ${file_path}`);
  return file_path;
}

/**
 * S3 预签名 PUT 上传
 */
function s3PutUpload(url, data, contentType) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': data.length },
      timeout: 60000,
    }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => reject(new Error(`S3上传失败: HTTP ${res.statusCode} ${body}`)));
      }
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('S3上传超时')); });
    req.write(data);
    req.end();
  });
}

/**
 * 通用HTTP请求（原始模式，不走httpRequest的OpenAI兼容路径）
 */
function httpRequestRaw(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || { 'Content-Type': 'application/json' },
      timeout: options.timeout || 30000,
    };

    const req = client.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        // 空body处理
        if (!body || body.trim() === '') {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: 空响应`));
          } else {
            resolve({});
          }
          return;
        }
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Parse error (HTTP ${res.statusCode}): ${body.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * 下载文件到本地
 */
function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        resolve(downloadToFile(response.headers.location, destPath));
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`下载失败: HTTP ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

/**
 * 视频生成统一入口
 * 通过模型路由表自动识别类型，builder 自动过滤无关参数
 * 调用方传什么都不会污染其他模型——不在 builder 里的字段直接丢弃
 * 
 * @param {Object} params - {prompt, model, image, first_frame_url, ...} 
 * @returns {Object} 视频生成结果
 */
async function generateVideo(params = {}) {
  const model = params.model || getModel('video') || 'doubao-seedance-2.0';
  const imageUrl = params.image || params.first_frame_url;
  const route = resolveModelRouting(model);
  const modelType = route ? route.tag : '[Unknown]';
  const isI2V = !!imageUrl;

  console.log(`[VideoService] 模型=${model}, 类型=${modelType}, 模式=${isI2V ? 'I2V' : 'T2V'}`);

  // 透传原始参数，由 generateKlingVideo → builder 自动过滤
  return await generateKlingVideo({
    model,
    prompt: params.prompt,
    first_frame_url: imageUrl,
    last_frame_url: params.last_frame_url,
    duration: params.duration,
    resolution: params.resolution,
    ratio: params.ratio || params.aspect_ratio,
    aspect_ratio: params.aspect_ratio,
    seconds: params.seconds,
    mode: params.mode,
    camera_control: params.camera_control,
    negative_prompt: params.negative_prompt,
    reference_images: params.reference_images,
    onProgress: params.onProgress,
    pollInterval: params.pollInterval,
    maxWait: params.maxWait,
  });
}

/**
* TTS语音合成
 * @param {string} text - 要合成的文字
 * @param {Object} options - {voice, speed}
 * @returns {Buffer} 音频数据
 */
async function generateTTS(text, options = {}) {
  const client = getClient();
  const mp3 = await client.audio.speech.create({
    model: getModel('tts'),
    voice: options.voice || 'alloy',
    input: text,
    speed: options.speed || 1.0,
    response_format: 'mp3',
  });

  return Buffer.from(await mp3.arrayBuffer());
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  getClient,
  getModel,
  chat,
  chatJSON,
  generateImage,
  generateVideo,
  generateKlingVideo,
  generateSeedance2Video,
  generateTTS,
};
