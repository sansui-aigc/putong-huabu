import { describe, expect, it } from "vitest";

import { buildGeminiImageRequest, isGeminiImageModel, isNativeGeminiImageModelName, normalizeImageModelName, openAiImageReferenceFieldName, parseGeminiImageDataUrls } from "./gemini-image";

describe("standalone Gemini image adapter", () => {
    it("routes Gemini image models to the native image capable API", () => {
        expect(isGeminiImageModel("gemini-3.1-flash-image", undefined, "image")).toBe(true);
        expect(isGeminiImageModel("imagen-4", undefined, "image")).toBe(false);
        expect(isNativeGeminiImageModelName("models/gemini-3.1-flash-image-preview")).toBe(true);
        expect(isNativeGeminiImageModelName("nano-banana-pro")).toBe(true);
        expect(isNativeGeminiImageModelName("nano-banana-2")).toBe(true);
    });

    it("normalizes logical and Gemini model resource names before routing", () => {
        expect(normalizeImageModelName("connection-1::models/gemini-3.1-flash-image-preview")).toBe("gemini-3.1-flash-image-preview");
        expect(isNativeGeminiImageModelName("connection-1::models/gemini-3.1-flash-image-preview")).toBe(true);
    });

    it("serializes one and multiple references as inlineData parts", () => {
        const body = buildGeminiImageRequest("gemini-3.1-flash-image", "保持构图并换成夜景", [
            { dataUrl: "data:image/png;base64,AAAA" },
            { dataUrl: "data:image/jpeg;base64,BBBB" },
        ]);
        expect(body.contents[0].parts).toEqual([
            { text: "保持构图并换成夜景" },
            { inlineData: { mimeType: "image/png", data: "AAAA" } },
            { inlineData: { mimeType: "image/jpeg", data: "BBBB" } },
        ]);
        expect(body).not.toHaveProperty("model");
    });

    it("passes the selected aspect ratio through Gemini imageConfig", () => {
        expect(buildGeminiImageRequest("gemini-3.1-flash-image", "生成竖版海报", [], undefined, "9:16").generationConfig).toEqual({
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: "9:16" },
        });
        expect(buildGeminiImageRequest("gemini-3.1-flash-image", "生成方图", [], undefined, "1024x1024").generationConfig.imageConfig).toEqual({ aspectRatio: "1:1" });
    });

    it("passes the selected image quality through Gemini imageConfig", () => {
        expect(buildGeminiImageRequest("gemini-3.1-flash-image", "生成竖版海报", [], undefined, "2160x3840", "high").generationConfig.imageConfig).toEqual({ aspectRatio: "9:16", imageSize: "4K" });
        expect(buildGeminiImageRequest("gemini-3.1-flash-image", "生成方图", [], undefined, "1:1", "medium").generationConfig.imageConfig).toEqual({ aspectRatio: "1:1", imageSize: "2K" });
    });

    it("uses the OpenAI single-image and multi-image field names", () => {
        expect(openAiImageReferenceFieldName(1)).toBe("image");
        expect(openAiImageReferenceFieldName(2)).toBe("image[]");
        expect(openAiImageReferenceFieldName(16)).toBe("image[]");
    });

    it("extracts every generated inline image from a Gemini response", () => {
        expect(parseGeminiImageDataUrls({ candidates: [{ content: { parts: [{ text: "完成" }, { inlineData: { mimeType: "image/png", data: "AAAA" } }, { inline_data: { mime_type: "image/jpeg", data: "BBBB" } }] } }] })).toEqual([
            "data:image/png;base64,AAAA",
            "data:image/jpeg;base64,BBBB",
        ]);
    });
});
