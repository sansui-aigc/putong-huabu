import { describe, expect, it } from "vitest";

import { imagePreviewUrl, originalImageDownloadUrl, originalImageExtension, originalImageSourceUrl, originalMediaDownloadUrl } from "./media-image-url";

describe("media image urls", () => {
    it("builds bounded WebP previews while preserving signed query values", () => {
        expect(imagePreviewUrl("/api/reference-assets/permanent/file.png?purpose=provider-read&expires=1&signature=test", 4096)).toBe("/api/reference-assets/permanent/file.png?expires=1&format=webp&purpose=provider-read&signature=test&width=2048");
        expect(imagePreviewUrl("/api/reference-assets/permanent/file.png", 257)).toBe("/api/reference-assets/permanent/file.png?format=webp&width=320");
    });

    it("returns one canonical preview address for equivalent requests", () => {
        const source = "/api/reference-assets/permanent/file.png?signature=test&purpose=provider-read&expires=1#duplicate-view";

        expect(imagePreviewUrl(source, 257)).toBe(imagePreviewUrl("/api/reference-assets/permanent/file.png?expires=1&purpose=provider-read&signature=test&width=320&format=webp", 320));
        expect(imagePreviewUrl(imagePreviewUrl(source, 257), 320)).toBe(imagePreviewUrl(source, 257));
    });

    it("builds original-file downloads from a preview url", () => {
        expect(originalImageSourceUrl("/api/reference-assets/file.png?purpose=provider-read&expires=1&signature=test&format=webp&width=960")).toBe("/api/reference-assets/file.png?expires=1&purpose=provider-read&signature=test");
        expect(originalImageDownloadUrl("/api/generation-log-assets/file.jpg?format=webp&width=960")).toBe("/api/generation-log-assets/file.jpg?download=original");
        expect(originalMediaDownloadUrl("/api/reference-assets/file.webm?format=webp&width=960")).toBe("/api/reference-assets/file.webm?download=original");
        expect(originalImageExtension("/api/generation-log-assets/file.jpeg?download=original")).toBe("jpeg");
        expect(originalImageExtension("data:image/webp;base64,AAAA")).toBe("webp");
        expect(originalImageExtension("/api/generation-log-assets/file.png", "image/jpeg")).toBe("jpg");
    });

    it("does not rewrite unrelated urls", () => {
        expect(imagePreviewUrl("https://cdn.example.com/file.png")).toBe("https://cdn.example.com/file.png");
        expect(imagePreviewUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    });
});
