import sharp, { type OverlayOptions } from "sharp";

import { CREATIVE_UPLOAD_MAX_BYTES } from "@/lib/creative-upload";
import { fetchInternalApi } from "@/lib/server/internal-origin";

export type StitchDirection = "vertical" | "horizontal";

export type StitchImagesInput = {
    images: string[];
    direction?: StitchDirection;
    gap?: number;
    background?: string;
    align?: "start" | "center" | "end";
};

export type StitchResult = {
    dataUrl: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const MAX_STITCH_IMAGES = 20;
const MAX_TOTAL_PIXELS = 120_000_000;

export class StitchImagesError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "StitchImagesError";
    }
}

type LoadedImage = { buffer: Buffer; width: number; height: number };

export async function stitchImages(input: { origin: string; cookie: string; body: StitchImagesInput }): Promise<StitchResult> {
    const sources = (Array.isArray(input.body.images) ? input.body.images : [])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
    if (sources.length < 2) throw new StitchImagesError("至少需要 2 张图片才能拼接", 400);
    if (sources.length > MAX_STITCH_IMAGES) throw new StitchImagesError(`一次最多拼接 ${MAX_STITCH_IMAGES} 张图片`, 400);

    const direction: StitchDirection = input.body.direction === "horizontal" ? "horizontal" : "vertical";
    const gap = Math.max(0, Math.min(400, Math.floor(Number(input.body.gap ?? 0) || 0)));
    const background = typeof input.body.background === "string" && input.body.background.trim() ? input.body.background.trim() : "#ffffff";
    const align: "start" | "center" | "end" = input.body.align === "start" || input.body.align === "end" ? input.body.align : "center";

    const loaded: LoadedImage[] = [];
    for (const source of sources) {
        loaded.push(await readImage(source, input.origin, input.cookie));
    }

    // 统一尺寸：竖排统一宽度，横排统一高度（以第一张为基准等比缩放）
    const base = loaded[0];
    const normalized: LoadedImage[] = [];
    for (const image of loaded) {
        if (direction === "vertical") {
            if (image.width === base.width) {
                normalized.push(image);
                continue;
            }
            const width = base.width;
            const height = Math.max(1, Math.round((image.height * width) / image.width));
            normalized.push({ buffer: await sharp(image.buffer).resize({ width, height }).jpeg({ quality: 92 }).toBuffer(), width, height });
        } else {
            if (image.height === base.height) {
                normalized.push(image);
                continue;
            }
            const height = base.height;
            const width = Math.max(1, Math.round((image.width * height) / image.height));
            normalized.push({ buffer: await sharp(image.buffer).resize({ width, height }).jpeg({ quality: 92 }).toBuffer(), width, height });
        }
    }

    const totalWidth = direction === "vertical" ? Math.max(...normalized.map((item) => item.width)) : normalized.reduce((sum, item) => sum + item.width, gap * (normalized.length - 1));
    const totalHeight = direction === "horizontal" ? Math.max(...normalized.map((item) => item.height)) : normalized.reduce((sum, item) => sum + item.height, gap * (normalized.length - 1));
    if (totalWidth * totalHeight > MAX_TOTAL_PIXELS) throw new StitchImagesError(`拼接后图片过大（${totalWidth}x${totalHeight}），请减少分屏数量或降低单张分辨率`, 413);

    const composites: OverlayOptions[] = [];
    if (direction === "vertical") {
        let top = 0;
        for (const item of normalized) {
            const left = align === "start" ? 0 : align === "end" ? totalWidth - item.width : Math.floor((totalWidth - item.width) / 2);
            composites.push({ input: item.buffer, top, left });
            top += item.height + gap;
        }
    } else {
        let left = 0;
        for (const item of normalized) {
            const top = align === "start" ? 0 : align === "end" ? totalHeight - item.height : Math.floor((totalHeight - item.height) / 2);
            composites.push({ input: item.buffer, top, left });
            left += item.width + gap;
        }
    }

    const outputBuffer = await sharp({ create: { width: totalWidth, height: totalHeight, channels: 3, background } })
        .composite(composites)
        .jpeg({ quality: 90 })
        .toBuffer();

    return {
        dataUrl: `data:image/jpeg;base64,${outputBuffer.toString("base64")}`,
        width: totalWidth,
        height: totalHeight,
        bytes: outputBuffer.byteLength,
        mimeType: "image/jpeg",
    };
}

async function readImage(source: string, origin: string, cookie: string): Promise<LoadedImage> {
    let bytes: Buffer;
    const dataMatch = source.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
    if (dataMatch) {
        bytes = Buffer.from(dataMatch[2], "base64");
    } else if (source.startsWith("/api/")) {
        const response = await fetchInternalApi(`${origin}${source}`, { headers: { cookie }, cache: "no-store" });
        if (!response.ok) throw new StitchImagesError("无法读取需要拼接的图片", 400);
        bytes = Buffer.from(await response.arrayBuffer());
    } else {
        throw new StitchImagesError("仅支持站内图片或 data URL", 400);
    }
    if (!bytes.length) throw new StitchImagesError("图片内容为空", 400);
    if (bytes.length > CREATIVE_UPLOAD_MAX_BYTES) throw new StitchImagesError("单张图片过大，请压缩后重试", 413);
    const image = sharp(bytes);
    const metadata = await image.metadata().catch(() => null);
    if (!metadata?.width || !metadata?.height) throw new StitchImagesError("无法读取图片尺寸", 400);
    return { buffer: await image.jpeg({ quality: 92 }).toBuffer(), width: metadata.width, height: metadata.height };
}
