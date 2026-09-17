# 更新日志 (Changelog)

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
