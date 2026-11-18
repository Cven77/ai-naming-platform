/**
 * GET /api/models
 * 返回 modelConfigMap 里配置的模型清单，前端据此渲染下拉框
 */
const { listModels } = require('./_config');

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ models: listModels() });
};
