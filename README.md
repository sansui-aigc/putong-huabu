# 普通画布 (Putong Canvas)

独立的画布与画布 Agent 创作工作台。应用入口为 `/canvas`；生成、素材、项目保存和模型渠道仍使用服务端能力，默认文件存储无需 SQL，也无需安装令牌。

## 快速开始

```powershell
Copy-Item ..\.env.example .env.local
pnpm install --frozen-lockfile
pnpm run dev
```

默认入口为 `http://localhost:3002/canvas`，避免与原项目的 3000 端口冲突。`pnpm run dev` 会同时启动独立 API 与生成 Worker；模型渠道配置见 `config/models.example.json`。

## 功能

- **无限画布创作**：图片 / 全景 / 文本 / 配置 / 视频 / 音频节点自由连接
- **Agent 创作工作流**：公开模板 / 个人模板 / 变量表单 / 多图系列
- **全景图节点**：2:1 全景生成 / 导入
- **摄像机控制**：图片 / 视频 / 配置节点可设相机 / 镜头 / 焦距 / 光圈，自动写入提示词

## 许可

本项目采用 **GNU Affero General Public License v3.0 (AGPL-3.0)**。

这是最严格的开源协议之一：任何以本项目为基础提供网络服务（SaaS）的衍生作品，都必须以 AGPL-3.0 协议完整开放其源代码。详见 [LICENSE](./LICENSE)。
