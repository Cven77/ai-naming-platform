/**
 * 阶段一：单模型版本（只调用豆包，跑通功能用）
 * 对照 api/name.js 可以看出：调用逻辑一模一样，
 * 区别只在于这里的 baseURL / apiKey / model 是写死的三个常量。
 * 阶段二把它们搬进 modelConfigMap，就得到多模型版本。
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST' });

  const requirement = String((req.body && req.body.requirement) || '').trim();
  if (!requirement) return res.status(400).json({ error: '请填写起名需求' });

  // 单模型：只有豆包这一套配置
  const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v1';
  const MODEL = process.env.DOUBAO_MODEL || 'doubao-seed-1-6-250615';
  const API_KEY = process.env.DOUBAO_API_KEY;

  if (!API_KEY) return res.status(400).json({ error: '缺少 DOUBAO_API_KEY' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const upstream = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        { role: 'system', content: '你是一位中文起名顾问，给出 3 组名字并解释寓意。' },
        { role: 'user', content: requirement }
      ]
    })
  });

  if (!upstream.ok || !upstream.body) {
    res.write(`data: ${JSON.stringify({ error: '模型接口异常' })}\n\n`);
    return res.end();
  }

  let answer = '';
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder('utf-8');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    res.write(chunk);
    chunk.split('\n').forEach((line) => {
      if (!line.startsWith('data:')) return;
      try {
        const json = JSON.parse(line.slice(5).trim());
        const text = (json.choices && json.choices[0].delta.content) || '';
        answer += text;
      } catch (e) { /* [DONE] 或心跳分片 */ }
    });
  }

  // 写入 Supabase：阶段一没有任何配置，直接写豆包的表记录
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    await supabase.from('name_history').insert({
      user_requirement: requirement,
      name_result: answer,
      model_name: MODEL
    });
  } catch (e) { /* 落库失败不影响生成结果 */ }

  res.end();
};
