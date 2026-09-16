import { creativeModelProfileForLogicalModel, reconcileCreativeGenerationPreferences, type CreativeModelCapabilityProfile, type CreativeModelCapabilityOption } from "@/lib/creative-model-capabilities";
import { isCreativeAutoValue } from "@/lib/creative-runtime-contract";
import type { CreativeGenerationPreferences } from "@/lib/creative-runtime-contract";
import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasGenerationMode, CanvasNodeMetadata } from "../types";

type MediaMode = Extract<CanvasGenerationMode, "image" | "video">;

export function canvasModelCapabilityProfile(config: AiConfig, model = config.model): CreativeModelCapabilityProfile | undefined {
    return creativeModelProfileForLogicalModel(config.logicalModels.find((item) => item.id.toLowerCase() === model.toLowerCase()));
}

export function canvasImageRetryConfig(config: AiConfig, metadata: Pick<CanvasNodeMetadata, "model" | "quality" | "errorDetails">) {
    const savedModel = metadata.model || config.imageModel || config.model;
    const savedQuality = metadata.quality || config.quality;
    const errorDetails = metadata.errorDetails || "";
    const unsupportedImagesApi = /images api is not supported for this platform/i.test(errorDetails);
    const unsupportedImageResolution = /(?:当前模型不支持|model\s+(?:does not|doesn't)\s+support).*?(?:分辨率|resolution)/i.test(errorDetails);
    const unsupportedImageQualityTier = /(?:image[_\s-]?size\s+tier|image_size_tier|尺寸档位|resolution tier|quality tier)/i.test(errorDetails) && /(?:not configured|未配置|unsupported|不支持)/i.test(errorDetails);
    if ((!unsupportedImagesApi && !unsupportedImageResolution && !unsupportedImageQualityTier) || !config.imageModel) return { model: savedModel, quality: savedQuality };

    const profile = canvasModelCapabilityProfile(config, config.imageModel);
    const supportedQuality =
        profile?.resolutions?.length && savedQuality && !isCreativeAutoValue(savedQuality)
            ? profile.resolutions.find((item) => normalizeCapabilityValue(item) === normalizeCapabilityValue(savedQuality)) || profile.resolutions[0]
            : profile?.resolutions?.length && unsupportedImageQualityTier
              ? profile.resolutions[0]
              : undefined;
    return { model: config.imageModel, quality: supportedQuality || (unsupportedImageQualityTier ? "low" : savedQuality) };
}

export function canvasModelConfigPatch(config: AiConfig, model: string, mode: MediaMode): Partial<CanvasNodeMetadata> {
    const capabilityProfile = canvasModelCapabilityProfile(config, model);
    const option: CreativeModelCapabilityOption = { id: model, name: model, capability: mode, ...(capabilityProfile ? { capabilityProfile } : {}) };
    const preferences: CreativeGenerationPreferences =
        mode === "image" ? { image: { size: config.size, quality: config.quality, count: positiveInteger(config.count, 1) } } : { video: { size: config.size, quality: config.vquality, seconds: positiveInteger(config.videoSeconds, 5) } };
    const reconciled = reconcileCreativeGenerationPreferences(preferences, [option]);
    return mode === "image"
        ? { model, size: reconciled.image?.size, quality: reconciled.image?.quality, count: reconciled.image?.count }
        : { model, size: reconciled.video?.size, vquality: reconciled.video?.quality, seconds: reconciled.video?.seconds === undefined ? undefined : String(reconciled.video.seconds) };
}

function positiveInteger(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeCapabilityValue(value: string) {
    return value.trim().replace(/p$/i, "").toLowerCase();
}
