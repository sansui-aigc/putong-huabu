import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { stitchImages, StitchImagesError } from "./detail-page-stitch-service";

async function makeImageDataUrl(width: number, height: number, color: string): Promise<string> {
    const buffer = await sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 90 }).toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function dimensionsOf(dataUrl: string): Promise<{ width: number; height: number }> {
    const base64 = dataUrl.split(",", 2)[1];
    const metadata = await sharp(Buffer.from(base64, "base64")).metadata();
    return { width: metadata.width || 0, height: metadata.height || 0 };
}

describe("stitchImages", () => {
    it("vertical stacks images of equal width into one long image", async () => {
        const top = await makeImageDataUrl(600, 400, "#ff0000");
        const bottom = await makeImageDataUrl(600, 300, "#0000ff");

        const result = await stitchImages({ origin: "http://local", cookie: "", body: { images: [top, bottom], direction: "vertical" } });

        expect(result.mimeType).toBe("image/jpeg");
        expect(result.width).toBe(600);
        expect(result.height).toBe(700);
        expect(result.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    });

    it("horizontal places images side by side", async () => {
        const left = await makeImageDataUrl(400, 300, "#ff0000");
        const right = await makeImageDataUrl(300, 300, "#0000ff");

        const result = await stitchImages({ origin: "http://local", cookie: "", body: { images: [left, right], direction: "horizontal" } });

        expect(result.height).toBe(300);
        expect(result.width).toBe(700);
    });

    it("adds gap between stacked images", async () => {
        const a = await makeImageDataUrl(600, 200, "#ff0000");
        const b = await makeImageDataUrl(600, 200, "#0000ff");

        const result = await stitchImages({ origin: "http://local", cookie: "", body: { images: [a, b], direction: "vertical", gap: 20 } });

        expect(result.height).toBe(420);
    });

    it("normalizes widths in vertical mode to the first image width", async () => {
        const wide = await makeImageDataUrl(800, 200, "#ff0000");
        const narrow = await makeImageDataUrl(400, 200, "#0000ff");

        const result = await stitchImages({ origin: "http://local", cookie: "", body: { images: [wide, narrow], direction: "vertical" } });

        expect(result.width).toBe(800);
        // narrow 400x200 scaled to 800 width -> height 400
        expect(result.height).toBe(200 + 400);
    });

    it("rejects fewer than two images", async () => {
        const one = await makeImageDataUrl(100, 100, "#ff0000");
        await expect(stitchImages({ origin: "http://local", cookie: "", body: { images: [one] } })).rejects.toBeInstanceOf(StitchImagesError);
    });

    it("produces a readable output image", async () => {
        const a = await makeImageDataUrl(500, 300, "#112233");
        const b = await makeImageDataUrl(500, 300, "#445566");
        const result = await stitchImages({ origin: "http://local", cookie: "", body: { images: [a, b], direction: "vertical" } });

        const dimensions = await dimensionsOf(result.dataUrl);
        expect(dimensions.width).toBe(500);
        expect(dimensions.height).toBe(600);
    });
});
