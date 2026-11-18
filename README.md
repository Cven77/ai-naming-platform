# AI 起名平台（实验三）

一个跑在 Vercel 上的 Node 网页：输入起名需求 → 大模型流式输出 3 组名字与寓意 → 结果自动存入 Supabase → 页面展示历史记录。支持豆包、DeepSeek、通义千问、Kimi 四个模型一键切换。

## 目录结构

```
ai-naming-platform/
├─ api/
│  ├─ _config.js         # modelConfigMap：四个模型的 baseURL / apiKey / model
│  ├─ name.js            # POST /api/name：流式调用模型 + 落库
│  ├─ history.js         # GET  /api/history：读取最近记录
│  └─ models.js          # GET  /api/models：给下拉框返回模型清单
├─ versions/single-model/api/name.js   # 阶段一：单模型（写死豆包）版本，用于对照
├─ sql/init.sql          # 建表 + 索引 + RLS 权限（含调试/上线两套方案）
├─ index.html            # 前端：需求输入、模型下拉、流式渲染、历史列表
├─ local-server.js       # 不装 vercel CLI 也能本地预览的服务器
├─ .env.example          # 环境变量模板
├─ .gitignore            # 已排除 .env，密钥不会进 Git
└─ package.json
```

## 本地运行

```bash
npm install                       # 安装 @supabase/supabase-js、dotenv
cp .env.example .env              # 填写自己的密钥
node local-server.js              # 打开 http://localhost:3000
# 或使用官方 CLI：npx vercel dev
```

`.env` 至少要有：

```ini
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
DOUBAO_API_KEY=...
DOUBAO_MODEL=ep-xxxx 或 doubao-seed-1-6-250615
```

其余三个模型按需填写 `DEEPSEEK_API_KEY` / `QWEN_API_KEY` / `KIMI_API_KEY`，没填的模型在下拉框里会标注“未配置密钥”，点击时给出明确提示，不会 500。

## 数据库

Supabase 控制台 → SQL Editor → 执行 `sql/init.sql`。

- 调试阶段：脚本默认启用 `debug_anon_all` 策略，anon key 可读写，方便先跑通；
- 正式上线：注释掉该策略，改用 `public_read_only` + service_role 写入（脚本第 3 节已给出，配套说明见实验报告）。

## 部署

```bash
git init && git add . && git commit -m "feat: AI 起名平台"
git remote add origin https://github.com/<你的账号>/ai-naming-platform.git
git push -u origin main
```

Vercel → New Project → 导入该仓库 → 在 Settings/Environment Variables 中逐个填入 `.env` 里的键值 → Deploy，拿到公网域名。

## 两个版本的差别

| | 阶段一 `versions/single-model` | 阶段二 `api/name.js` |
|---|---|---|
| 模型配置 | 三个常量写死在函数内 | `modelConfigMap` 统一管理 |
| 调用代码 | 一套 | 还是一套，循环读配置 |
| 新增模型 | 要改代码 | 只加一行配置 |
| 前端 | 无下拉框 | 下拉框 + 可用性提示 |

## 踩坑对照

| 现象 | 原因 | 处理 |
|---|---|---|
| 401 / 404 | baseURL 或 model 名不对 | 回到该平台官方 curl 示例逐字核对 |
| 通义千问报错 | 用了 dashscope 普通地址 | 必须 `compatible-mode/v1` |
| 页面一次性刷出全文 | 反向代理缓冲 | 后端已加 `X-Accel-Buffering: no`、`Cache-Control: no-transform` |
| 历史为空 | SQL 未执行或 RLS 拦住写入 | 先跑 `sql/init.sql`，看 `/api/history` 返回的 warning |
| 部署后无密钥 | Vercel 环境变量没配 | 在 Project Settings → Environment Variables 补齐后 Redeploy |
