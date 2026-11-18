/**
 * POST /api/name
 * 入参：{ requirement: string, model?: 'doubao' | 'deepseek' | 'qwen' | 'kimi' }
 * 出参：text/event-stream（SSE），边生成边推送；结束后把本次结果写入 Supabase
 *
 * 关键点：
 * 1. 只有一段 fetch 调用逻辑，模型差异全部来自 modelConfigMap；
 * 2. 密钥从环境变量读取（见 api/_config.js），代码里不出现任何 key；
 * 3. 流式转发的同时累积 delta.content，请求结束后一次性落库。
 */
const { getModelConfigMap } = require('./_config');

const SYSTEM_PROMPT = `你是一位精通中文姓名文化、字义训诂与命名心理学的起名顾问。
要求：
1. 根据用户给出的性别、风格、姓氏、寓意偏好等信息起名；
2. 固定输出 3 组方案，每组包含：姓名、逐字释义、整体寓意、风格归属、一句使用场景建议；
3. 用 Markdown 小标题分组排版，语言简洁有画面感，不要空泛套话；
4. 如果用户信息不足，可以合理补充但需说明依据；
5. 不要输出与起名无关的内容，不要编造生僻字读音。`;

function buildMessages(requirement) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `我的起名需求：${requirement}` }
  ];
}

function sendSSE(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 从 SSE 文本里抽出增量正文，同时维护缓冲区 */
function drainDeltas(buffer, onDelta) {
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf('\n')) !== -1) {
    const line = rest.slice(0, idx).trim();
    rest = rest.slice(idx + 1);
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const json = JSON.parse(payload);
      const delta = json.choices && json.choices[0] && json.choices[0].delta;
      const text = (delta && (delta.content || delta.reasoning_content)) || '';
      if (text) onDelta(text);
    } catch (e) {
      // 非 JSON 的心跳/注释分片，忽略即可
    }
  }
  return rest;
}

async function saveHistory({ requirement, answer, modelKey, modelName }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { saved: false, reason: '未配置 SUPABASE_URL / SUPABASE_ANON_KEY' };
  if (!answer.trim()) return { saved: false, reason: '生成内容为空，未写入' };

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.from('name_history').insert({
      user_requirement: requirement,
      name_result: answer,
      model_name: modelName || modelKey
    });
    if (error) return { saved: false, reason: error.message };
    return { saved: true };
  } catch (err) {
    return { saved: false, reason: err.message };
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const requirement = String(body.requirement || '').trim().slice(0, 300);
  const modelKey = String(body.model || 'doubao').trim();

  if (!requirement) {
    return res.status(400).json({ error: '请先填写起名需求，例如：男孩、国风、希望名字有山水的意境' });
  }

  const map = getModelConfigMap();
  const cfg = map[modelKey];
  if (!cfg) {
    return res.status(400).json({ error: `未知模型：${modelKey}，可选 ${Object.keys(map).join(' / ')}` });
  }
  if (!cfg.apiKey) {
    return res.status(400).json({ error: `模型「${cfg.label}」还没有配置密钥，请在 .env 中设置对应环境变量` });
  }

  // ---- 建立 SSE 长连接 ----
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 关闭 Nginx 类缓冲，保证逐字到达
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  sendSSE(res, 'meta', { model: modelKey, modelName: cfg.model, label: cfg.label });

  const ac = new AbortController();
  let finished = false;
  req.on('close', () => {
    if (!finished) ac.abort(); // 用户中途关页面，及时释放上游连接
  });

  let answer = '';
  let upstreamRes;
  try {
    upstreamRes = await fetch(`${cfg.baseURL.replace(/\\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        temperature: 0.8,
        messages: buildMessages(requirement)
      }),
      signal: ac.signal
    });
  } catch (err) {
    finished = true;
    sendSSE(res, 'error', { message: `连接模型失败：${err.message}` });
    return res.end();
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const detail = await upstreamRes.text().catch(() => '');
    finished = true;
    sendSSE(res, 'error', {
      message: `模型返回异常（HTTP ${upstreamRes.status}）`,
      detail: detail.slice(0, 800),
      hint: '请核对该模型的 baseURL、model 名称与鉴权方式'
    });
    return res.end();
  }

  const reader = upstreamRes.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      // 原样转发给浏览器，前端按 OpenAI 标准 SSE 解析
      res.write(chunk);
      buffer = drainDeltas(buffer, (text) => { answer += text; });
    }
    // 处理最后没有换行结尾的残留分片
    buffer = drainDeltas(buffer + '\n', (text) => { answer += text; });
  } catch (err) {
    if (err.name !== 'AbortError') {
      sendSSE(res, 'error', { message: `流式读取中断：${err.message}` });
    }
  } finally {
    finished = true;
  }

  const saveResult = await saveHistory({
    requirement,
    answer,
    modelKey,
    modelName: cfg.model
  });

  sendSSE(res, 'meta', { done: true, model: modelKey, ...saveResult });
  return res.end();
};

module.exports.config = { maxDuration: 60 };
