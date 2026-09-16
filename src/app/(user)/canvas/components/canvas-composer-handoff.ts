"use client";

import type { CreativeGenerationPreferences } from "@/lib/creative-runtime-contract";

/**
 * 首页"输入即创作" → 编辑页的交接负载。
 * 首页提交 prompt/素材后写入，编辑页加载完成时消费并自动打开 Agent 提交。
 */
export type CanvasComposerHandoff = {
    prompt: string;
    /** 引用素材（图片/视频等）的 storageKey 列表，编辑页加载后按需构建引用节点 */
    assetIds?: string[];
    skillIds?: string[];
    modelIds?: string[];
    preferences?: CreativeGenerationPreferences;
    createdAt: number;
};

const HANDOFF_KEY = "canvas-composer-handoff:v1";

export function writeCanvasComposerHandoff(handoff: Omit<CanvasComposerHandoff, "createdAt">) {
    try {
        sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ ...handoff, createdAt: Date.now() }));
    } catch {
        // sessionStorage 不可用时静默降级（例如隐私模式）
    }
}

export function readCanvasComposerHandoff(): CanvasComposerHandoff | null {
    try {
        const raw = sessionStorage.getItem(HANDOFF_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<CanvasComposerHandoff>;
        if (!value?.prompt?.trim()) return null;
        return {
            prompt: value.prompt.trim(),
            ...(Array.isArray(value.assetIds) && value.assetIds.length ? { assetIds: value.assetIds } : {}),
            ...(Array.isArray(value.skillIds) && value.skillIds.length ? { skillIds: value.skillIds } : {}),
            ...(Array.isArray(value.modelIds) && value.modelIds.length ? { modelIds: value.modelIds } : {}),
            ...(value.preferences && typeof value.preferences === "object" ? { preferences: value.preferences } : {}),
            createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
        };
    } catch {
        return null;
    }
}

export function consumeCanvasComposerHandoff() {
    const handoff = readCanvasComposerHandoff();
    try {
        sessionStorage.removeItem(HANDOFF_KEY);
    } catch {
        // 忽略
    }
    return handoff;
}
