import type { AgentSkillWorkspace } from "@/lib/auth/store-types";

export type AgentSkillSummary = {
    id: string;
    name: string;
    description: string;
    instructions?: string;
    plannerSummary?: string;
    keywords?: string[];
    enabled?: boolean;
    source?: "local" | "server";
    action?: "generate" | "edit";
    requiresReference?: boolean;
    defaultConfig?: Record<string, string | number | boolean>;
    workspaces?: AgentSkillWorkspace[];
};

export type AgentSkillInput = {
    name: string;
    description: string;
    instructions: string;
    keywords?: string[];
    workspaces: AgentSkillWorkspace[];
    action?: "generate" | "edit";
    requiresReference?: boolean;
};

type ApiResponse<T> = { code: number; data: T; msg: string };

export async function listAgentSkills(workspace: AgentSkillWorkspace | "all" = "all") {
    const response = await fetch(`/api/agent/skills?workspace=${encodeURIComponent(workspace)}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as ApiResponse<{ skills: AgentSkillSummary[] }> | null;
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload?.msg || "获取创作 Skill 失败");
    return payload.data.skills;
}

export async function createAgentSkill(input: AgentSkillInput) {
    const response = await fetch("/api/agent/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<{ skill: AgentSkillSummary }> | null;
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload?.msg || "创建 Skill 失败");
    return payload.data.skill;
}

export async function updateAgentSkill(id: string, input: Partial<AgentSkillInput>) {
    const response = await fetch(`/api/agent/skills/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<{ skill: AgentSkillSummary }> | null;
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload?.msg || "更新 Skill 失败");
    return payload.data.skill;
}

export async function deleteAgentSkill(id: string) {
    const response = await fetch(`/api/agent/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => null)) as ApiResponse<{ deleted: boolean }> | null;
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload?.msg || "删除 Skill 失败");
    return payload.data.deleted;
}

// ==================== 导出/导入功能 ====================

export type SkillExportFile = {
    version: "1.0";
    exportedAt: string;
    skills: Array<{
        name: string;
        description: string;
        instructions: string;
        keywords?: string[];
        workspaces: AgentSkillWorkspace[];
        action?: "generate" | "edit";
        requiresReference?: boolean;
    }>;
};

/**
 * 导出所有用户自定义 Skill 为 JSON 文件
 * 只导出 source === "local" 的用户自定义 Skill，不导出内置 Skill
 */
export function exportAgentSkills(skills: AgentSkillSummary[]): void {
    const customSkills = skills.filter((skill) => skill.source === "local" || !skill.source);
    const exportData: SkillExportFile = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        skills: customSkills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions || skill.plannerSummary || "",
            keywords: skill.keywords,
            workspaces: skill.workspaces || ["canvas"],
            action: skill.action,
            requiresReference: skill.requiresReference,
        })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creative-skills-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 从 JSON 文件导入 Skill
 * 返回导入的 Skill 列表，调用方需要逐个创建
 */
export async function importAgentSkillsFromFile(file: File): Promise<AgentSkillInput[]> {
    const text = await file.text();
    let data: SkillExportFile;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("文件格式错误，请选择有效的 Skill 导出文件");
    }

    if (!data.version || !Array.isArray(data.skills)) {
        throw new Error("文件格式错误，缺少 version 或 skills 字段");
    }

    return data.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        keywords: skill.keywords,
        workspaces: skill.workspaces,
        action: skill.action,
        requiresReference: skill.requiresReference,
    }));
}
