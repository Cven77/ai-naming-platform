/**
 * 模型配置表 modelConfigMap
 * ------------------------------------------------------------------
 * 所有平台都提供“OpenAI 兼容网关”，入参（messages / stream）、
 * SSE 分片格式（delta.content）、鉴权头（Authorization: Bearer xxx）完全一致，
 * 所以只写一套请求逻辑，循环读取这张表即可适配多个模型。
 *
 * 以后新增模型：只在这里加一条配置，不需要改动 api/name.js 的调用代码。
 * 所有密钥都从环境变量读取，代码里不留任何明文 key。
 */

function getModelConfigMap() {
  return {
    doubao: {
      label: '豆包（火山方舟）',
      baseURL: process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v1',
      apiKey: process.env.DOUBAO_API_KEY || '',
      // 方舟里填“推理接入点 ID（ep-xxxx）”或控制台的模型名称均可
      model: process.env.DOUBAO_MODEL || 'doubao-seed-1-6-250615',
      docs: 'https://www.volcengine.com/docs/82379'
    },
    deepseek: {
      label: 'DeepSeek',
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      docs: 'https://api-docs.deepseek.com/zh-cn/'
    },
    qwen: {
      label: '通义千问（DashScope）',
      // 注意：必须用 compatible-mode 地址，普通地址不是 OpenAI 兼容协议
      baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: process.env.QWEN_API_KEY || '',
      model: process.env.QWEN_MODEL || 'qwen-plus',
      docs: 'https://help.aliyun.com/zh/model-studio/'
    },
    kimi: {
      label: 'Kimi（月之暗面）',
      baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
      apiKey: process.env.KIMI_API_KEY || '',
      model: process.env.KIMI_MODEL || 'moonshot-v1-8k',
      docs: 'https://platform.moonshot.cn/docs'
    }
  };
}

/** 前端下拉框只暴露可用性，不暴露任何密钥内容 */
function listModels() {
  const map = getModelConfigMap();
  return Object.keys(map).map((key) => ({
    key,
    label: map[key].label,
    model: map[key].model,
    available: Boolean(map[key].apiKey)
  }));
}

module.exports = { getModelConfigMap, listModels };
