"use client";

import type { CanvasImageDecompositionResponse } from "@/lib/canvas-image-decomposition";
import { refreshUserPointsIfSystem } from "@/services/api/points";
import { throwIfClientSessionExpired } from "@/services/api/session-expiration";
import { decomposeImageClient, isClientDecompositionAvailable } from "@/services/api/canvas-image-decomposition-client";

export async function requestCanvasImageDecomposition(input: { requestId: string; source: string }) {
    // 优先使用前端分层分析服务（直接调用用户配置的中转站）
    if (isClientDecompositionAvailable()) {
        try {
            return await decomposeImageClient(input);
        } catch (error) {
            console.warn("前端分层分析失败，回退到服务端 API:", error);
            // 回退到服务端 API
        }
    }

    // 回退到服务端 API
    try {
        const response = await fetch("/api/canvas/image-decomposition", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        throwIfClientSessionExpired(response);
        const payload = (await response.json().catch(() => null)) as { data?: CanvasImageDecompositionResponse; msg?: string } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.msg || "图片分层识别失败");
        return payload.data;
    } finally {
        void refreshUserPointsIfSystem("system");
    }
}
