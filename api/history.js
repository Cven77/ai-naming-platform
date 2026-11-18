/**
 * GET /api/history?limit=10
 * 读取最近 N 条起名记录，供前端历史列表使用
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '只支持 GET 请求' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(200).json({ items: [], warning: '未配置 Supabase，历史记录不可用' });
  }

  const limit = Math.min(Number(req.query.limit) || 10, 50);

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('name_history')
      .select('id, user_requirement, name_result, model_name, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(200).json({ items: [], warning: `读取失败：${error.message}` });
    }
    return res.status(200).json({ items: data || [] });
  } catch (err) {
    return res.status(200).json({ items: [], warning: `读取失败：${err.message}` });
  }
};

module.exports.config = { maxDuration: 30 };
