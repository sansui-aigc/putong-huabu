# 社会牛码创作工作台 Web

独立的画布与画布 Agent 创作工作台。应用入口为 `/canvas`；生成、素材、项目保存和模型渠道仍使用服务端能力，默认文件存储无需 SQL，也无需安装令牌。

```powershell
Copy-Item ..\.env.example .env.local
pnpm install --frozen-lockfile
pnpm run dev
```

默认入口为 `http://localhost:3002/canvas`，避免与原项目的 3000 端口冲突。`pnpm run dev` 会同时启动独立 API 与生成 Worker；模型渠道配置见 `config/models.example.json`。

完整目录说明见项目根目录的 `DIRECTORY.md`。
