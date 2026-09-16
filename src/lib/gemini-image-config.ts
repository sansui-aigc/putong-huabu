export type GeminiImageSize = "1K" | "2K" | "4K";

export function geminiImageSize(value: unknown): GeminiImageSize | undefined {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "low" || normalized === "1k" || normalized === "standard") return "1K";
    if (normalized === "medium" || normalized === "2k" || normalized === "hd") return "2K";
    if (normalized === "high" || normalized === "4k") return "4K";
    return undefined;
}
