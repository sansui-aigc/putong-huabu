import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";
import type { SystemChannelAdvancedConfig } from "@/lib/auth/store-types";
import { mergeStandaloneModelConfig } from "./standalone-model-config";

describe("standalone model config", () => {
    it("merges explicit channels, capabilities, and defaults without guessing model ids", () => {
        const settings = mergeStandaloneModelConfig(DEFAULT_SETTINGS, {
            channels: [
                {
                    id: "local-provider",
                    name: "测试渠道",
                    baseUrl: "https://provider.example.test/v1",
                    apiKey: "test-key",
                    apiFormat: "openai",
                    models: ["writer-test", "image-test"],
                    enabled: true,
                    advancedConfig: {
                        protocol: "auto",
                        modelCapabilities: { "writer-test": "text", "image-test": "image" },
                        modelConfigs: {},
                    } as unknown as SystemChannelAdvancedConfig,
                },
            ],
            defaults: { textModel: "writer-test", imageModel: "image-test" },
        });

        expect(settings.systemChannels).toHaveLength(1);
        expect(settings.systemChannels[0]).toMatchObject({ id: "local-provider", models: ["writer-test", "image-test"] });
        expect(settings.defaultModels).toMatchObject({ textModel: "writer-test", imageModel: "image-test", videoModel: "", audioModel: "" });
        expect(settings.logicalModels.some((model) => model.id === "writer-test" && model.capability === "text")).toBe(true);
        expect(settings.logicalModels.some((model) => model.id === "image-test" && model.capability === "image")).toBe(true);
    });
});
