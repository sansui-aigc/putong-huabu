import { geminiImageSize } from "@/lib/gemini-image-config";

export type GeminiImageApiFormat = "openai" | "gemini";

export type GeminiImageReference = {
    dataUrl: string;
    mimeType?: string;
};

export function normalizeImageModelName(model: string) {
    return model.trim().replace(/^.*::/, "").replace(/^models\//i, "").trim();
}

export function isNativeGeminiImageModelName(model: string) {
    const value = normalizeImageModelName(model).toLowerCase();
    return (/(?:^|[-_.\s/])gemini(?:$|[-_.\s/])/.test(value) && /image|flash-image/.test(value)) || /(?:^|[-_.\s/])nano[-_.\s]?banana(?:$|[-_.\s/])/.test(value);
}

/**
 * 判断是否是 OpenAI 原生图片模型（如 gpt-image-1、gpt-image-2、dall-e-3 等）
 * 这些模型应该走 OpenAI 兼容格式，而不是 Gemini 原生格式
 */
export function isOpenAiNativeImageModelName(model: string) {
    const value = normalizeImageModelName(model).toLowerCase();
    return /(?:^|[-_.\s/])gpt[-_.\s]?image(?:$|[-_.\s/])/.test(value) || /(?:^|[-_.\s/])dall[-_.\s]?e(?:$|[-_.\s/])/.test(value);
}

/**
 * 判断是否是 Grok 图片模型（如 grok-imagine-image 等）
 * 这些模型走 OpenAI 兼容格式，但有特殊的参数限制：
 * - quality 只支持 low 或 medium，不支持 hd 或 4k
 * - 尺寸参数会被映射到固定尺寸（960x960 或 768x1152）
 */
export function isGrokImageModelName(model: string) {
    const value = normalizeImageModelName(model).toLowerCase();
    return /(?:^|[-_.\s/])grok(?:$|[-_.\s/])/.test(value) && /image|imagine/.test(value);
}

export function isGeminiImageModel(model: string, apiFormat?: GeminiImageApiFormat, capability?: string) {
    // 【多中转站兼容】优先级：
    // 1. 如果 apiFormat 明确设置为 "gemini"，返回 true
    // 2. 如果 apiFormat 明确设置为 "openai"，返回 false
    // 3. 如果 apiFormat 没有设置，根据模型名称自动识别：
    //    - OpenAI 原生模型（gpt-image、dall-e）→ false（OpenAI 格式）
    //    - Gemini 原生模型（nano-banana、gemini-*-image）→ true（Gemini 格式）
    //    - 其他 → false（默认 OpenAI 格式）
    if (apiFormat === "gemini") {
        return capability === "image" || isNativeGeminiImageModelName(model);
    }
    // 【多中转站兼容】即使 apiFormat 是 "openai"，如果模型名称明确是 Gemini 原生模型，也使用 Gemini 原生格式
    if (apiFormat === "openai") {
        // 只有当模型名称明确是 Gemini 原生模型时，才使用 Gemini 原生格式
        if (isNativeGeminiImageModelName(model)) {
            return capability === "image" || true;
        }
        return false;
    }
    // 自动识别：如果是 OpenAI 原生模型，返回 false
    if (isOpenAiNativeImageModelName(model)) {
        return false;
    }
    // 自动识别：如果是 Gemini 原生模型，返回 true
    if (isNativeGeminiImageModelName(model)) {
        return capability === "image" || true;
    }
    // 其他模型默认走 OpenAI 兼容格式
    return false;
}

export function buildGeminiImageRequest(model: string, prompt: string, references: GeminiImageReference[], mask?: GeminiImageReference, size?: string, quality?: string) {
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    for (const reference of references) parts.push(toGeminiInlinePart(reference));
    if (mask) parts.push(toGeminiInlinePart(mask));
    const aspectRatio = geminiAspectRatio(size);
    const imageSize = geminiImageSize(quality);
    const imageConfig = { ...(aspectRatio ? { aspectRatio } : {}), ...(imageSize ? { imageSize } : {}) };
    return {
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(Object.keys(imageConfig).length ? { imageConfig } : {}) },
    };
}

function geminiAspectRatio(value?: string) {
    const text = String(value || "").trim().replace(/[：；;]/g, ":");
    const ratio = text.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (ratio && Number(ratio[1]) > 0 && Number(ratio[2]) > 0) return `${ratio[1]}:${ratio[2]}`;
    const dimensions = text.match(/^(\d+)\s*[x*×]\s*(\d+)$/i);
    if (!dimensions || Number(dimensions[1]) <= 0 || Number(dimensions[2]) <= 0) return "";
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    const candidates = [
        ["1:1", 1],
        ["3:2", 3 / 2],
        ["2:3", 2 / 3],
        ["4:3", 4 / 3],
        ["3:4", 3 / 4],
        ["16:9", 16 / 9],
        ["9:16", 9 / 16],
    ] as const;
    return candidates.reduce((best, candidate) => Math.abs(Math.log(width / height / candidate[1])) < Math.abs(Math.log(width / height / best[1])) ? candidate : best)[0];
}

export function openAiImageReferenceFieldName(referenceCount: number) {
    // 始终使用 "image" 字段名，兼容更多中转站（new-api/sub 不支持 image[] 数组格式）
    // 多个参考图时使用多个同名 "image" 字段，这是标准 multipart/form-data 做法
    return "image";
}

export function toGeminiInlinePart(reference: GeminiImageReference) {
    const match = reference.dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) return { fileData: { fileUri: reference.dataUrl, mimeType: reference.mimeType || "image/png" } };
    return { inlineData: { mimeType: match[1], data: match[2] } };
}

export function parseGeminiImageDataUrls(payload: unknown) {
    const results: string[] = [];
    const seen = new Set<string>();
    const candidates = payload && typeof payload === "object" ? (payload as Record<string, unknown>).candidates : undefined;
    if (!Array.isArray(candidates)) return results;
    for (const candidate of candidates) {
        const parts = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>).content : undefined;
        const values = parts && typeof parts === "object" ? (parts as Record<string, unknown>).parts : undefined;
        if (!Array.isArray(values)) continue;
        for (const part of values) {
            if (!part || typeof part !== "object") continue;
            const record = part as Record<string, unknown>;
            // 解析 inlineData（base64格式）
            const inline = (record.inlineData || record.inline_data) as Record<string, unknown> | undefined;
            const data = typeof inline?.data === "string" ? inline.data.trim() : "";
            if (data) {
                const mimeType = String(inline?.mimeType || inline?.mime_type || "image/png");
                const dataUrl = `data:${mimeType};base64,${data}`;
                if (!seen.has(dataUrl)) {
                    seen.add(dataUrl);
                    results.push(dataUrl);
                }
                continue;
            }
            // 解析文本中的图片链接（Markdown格式和直接URL）
            const text = typeof record.text === "string" ? record.text : "";
            if (text) {
                // 解析 Markdown 图片链接：![alt](url)
                const markdownMatches = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g);
                if (markdownMatches) {
                    for (const match of markdownMatches) {
                        const urlMatch = match.match(/\((https?:\/\/[^\s)]+)\)/);
                        if (urlMatch && urlMatch[1]) {
                            const url = urlMatch[1];
                            if (!seen.has(url)) {
                                seen.add(url);
                                results.push(url);
                            }
                        }
                    }
                }
                // 解析直接的图片URL（以图片扩展名结尾）
                const urlMatches = text.match(/https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg)(?:\?[^\s]*)?/gi);
                if (urlMatches) {
                    for (const url of urlMatches) {
                        if (!seen.has(url)) {
                            seen.add(url);
                            results.push(url);
                        }
                    }
                }
            }
        }
    }
    return results;
}



