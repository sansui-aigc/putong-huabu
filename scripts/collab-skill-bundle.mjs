import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SKILL_ID = "server-nuyoah-xiezhen-prompt";
const SOURCE = "https://github.com/nuyoah-ai-works/nuyoah-xiezhen-prompt";
const DEFAULT_COMMIT = "7482a14074bcffb9fed8eb8fe2ddcdc4ac2e980b";
const RUNTIME_APPENDIX = `

## 创作工作台执行适配

本 Skill 在社会牛码创作工作台中运行。只返回工作台要求的结构化结果：画布 Agent 返回 JSON 的 reply 和 ops。用户没有明确要求生成时，只写入提示词、分析或计划；明确要求生成时，才创建对应的待执行任务。不要声称尚未收到或尚未完成的图片、视频、音频已经生成或检查完成。`;

export const runtimeSkillFiles = [
    "SKILL.md",
    "references/prompt-logic.md",
    "references/production-reshoot.md",
];

export async function loadSkillBundle(root, options = {}) {
    const files = await Promise.all(runtimeSkillFiles.map(async (relativePath) => {
        const data = await readFile(path.join(root, relativePath));
        return {
            path: relativePath,
            bytes: data.byteLength,
            sha256: createHash("sha256").update(data).digest("hex"),
            text: data.toString("utf8"),
        };
    }));
    const manifest = {
        id: SKILL_ID,
        version: options.version || "1.1.0",
        source: SOURCE,
        sourceCommit: options.sourceCommit || DEFAULT_COMMIT,
        files: files.map(({ path: relativePath, bytes, sha256 }) => ({ path: relativePath, bytes, sha256 })),
    };
    return {
        ...manifest,
        instructions: `${files.map((file) => `# ${file.path}\n\n${file.text}`).join("\n\n")}\n${RUNTIME_APPENDIX}`,
    };
}

export { DEFAULT_COMMIT, RUNTIME_APPENDIX, SKILL_ID, SOURCE };
