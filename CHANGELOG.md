# 更新日志 (Changelog)

## v0.0.9 (2026-09-20)

### ✨ 新增
- **电商详情页全案 Skill**：按「痛点→卖点→证据」两步工作流，先出 10-12 屏分屏规划表（主标题/副标题/画面需求），确认后逐屏生成统一视觉分屏。覆盖主图（1图1卖点+促销版）、详情页（8-12屏）、SKU图（统一模板）。
- **图片拼接长图**：选中多张图片后，工具栏出现「拼接」按钮，可竖排拼成淘宝详情页整页长图，或横排并排。纯浏览器 Canvas 实现，不依赖后端模型。
- **视频 API 通用兼容**：自动识别 seedance-2-pro/fast/mini/2.5-pro、wan-3/3.0、gemini-omni 等模型，统一使用 `POST /v1/videos` 标准格式（seconds + reference_images + resolution + aspect_ratio），不绑定特定中转站域名。

### 🔧 改进
- 中转站设置改为右下角浮动按钮，支持多连接、拖动位置。
- 未配置模型时可直接进入画布使用本地功能（上传/拼接/整理），不弹拦截。

## v0.0.8 (2026-09-17)

### 🐛 修复
- **启动说明错误**：修正 README 中 `Copy-Item ..\.env.example .env.local` 的错误路径（多了 `..\`），并补齐缺失的 `.env.example` 模板文件，老用户 `git pull` 后按新文档即可正常启动。
- 移除未使用的界面截图（home.png / canvas-dark.png）。

### ✨ 新增
- 新增 `.env.example` 环境变量模板（含 `VOZEB_PRO_PROVIDER_API_KEY` 等真实变量名）。
- README 全面重构：以 **Agent 自动创作**为主线，新增真实创作场景截图（电商全案批量生成 / 产品思维导图 / Skill 规则执行）。
- 明确 `config/models.example.json` → `config/models.json` 渠道配置步骤，及 `/install` 网页初始化向导说明。

### 🏷️ 协议
- 采用 **AGPL-3.0**（GNU Affero General Public License v3.0）：任何以本项目为基础提供网络服务的衍生作品必须开源。

### 🧹 移除
- 移除 3D 导演台（含节点类型、工具栏入口、静态资源 `public/director/`）。
- README 中移除"上传素材 / 装载素材 / 导入画布"等手动操作图文，聚焦 Agent 自动创作。
