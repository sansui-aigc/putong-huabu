import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";

import { prepareFailedAgentTaskRetry } from "./agent-run-task-input";

const channel = {
    id: "image-channel",
    name: "图片渠道",
    baseUrl: "https://provider.example",
    apiKey: "key",
    apiFormat: "openai" as const,
    models: ["gpt-image-2"],
    enabled: true,
};

const run = {
    id: "run",
    userId: "user",
    conversationId: "conversation",
    clientRequestId: "request",
    surface: "chat" as const,
    inputMessageId: "input",
    assistantMessageId: "assistant",
    prompt: "生成一张图",
    referencedAssetIds: [],
    assetIds: [],
    status: "failed" as const,
    tasks: [],
    reviewed: false,
    createdAt: 1,
    updatedAt: 1,
};

describe("prepareFailedAgentTaskRetry", () => {
    it("switches unsupported Images API retries to the current default image model", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            defaultModels: { ...DEFAULT_SETTINGS.defaultModels, imageModel: "gpt-image-2" },
            systemChannels: [channel],
            logicalModels: [
                {
                    id: "gpt-image-2",
                    name: "gpt-image-2",
                    capability: "image" as const,
                    enabled: true,
                    bindings: [{ id: "binding", channelId: channel.id, upstreamModel: "gpt-image-2", enabled: true, priority: 1, capabilityProfile: { resolutions: ["1K"] } }],
                },
            ],
        };
        const task = {
            id: "task",
            title: "图片",
            type: "image" as const,
            model: "gemini-3.1-flash-image",
            prompt: "生成一张图",
            quality: "high",
            count: 1,
            dependencies: [],
            status: "failed" as const,
            attempts: 1,
            error: "Images API is not supported for this platform",
        };

        expect(prepareFailedAgentTaskRetry(run, task, settings)).toMatchObject({ model: "gpt-image-2", quality: "1K" });
    });

    it("downgrades a failed image retry to the configured binding resolution", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            defaultModels: { ...DEFAULT_SETTINGS.defaultModels, imageModel: "gpt-image-2" },
            systemChannels: [channel],
            logicalModels: [
                {
                    id: "gpt-image-2",
                    name: "gpt-image-2",
                    capability: "image" as const,
                    enabled: true,
                    bindings: [{ id: "binding", channelId: channel.id, upstreamModel: "gpt-image-2", enabled: true, priority: 1, capabilityProfile: { resolutions: ["1K"] } }],
                },
            ],
        };
        const task = { id: "task", title: "图片", type: "image" as const, model: "gpt-image-2", prompt: "生成一张图", quality: "high", count: 1, dependencies: [], status: "failed" as const, attempts: 1, error: "当前图片渠道未配置所选尺寸档位" };

        expect(prepareFailedAgentTaskRetry(run, task, settings).quality).toBe("1K");
    });

    it("uses low quality when a failed image has no configured resolution profile", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            defaultModels: { ...DEFAULT_SETTINGS.defaultModels, imageModel: "gpt-image-2" },
            systemChannels: [channel],
            logicalModels: [{ id: "gpt-image-2", name: "gpt-image-2", capability: "image" as const, enabled: true, bindings: [{ id: "binding", channelId: channel.id, upstreamModel: "gpt-image-2", enabled: true, priority: 1 }] }],
        };
        const task = {
            id: "task",
            title: "图片",
            type: "image" as const,
            model: "gpt-image-2",
            prompt: "生成一张图",
            quality: "high",
            count: 1,
            dependencies: [],
            status: "failed" as const,
            attempts: 1,
            error: "当前图片渠道未配置所选尺寸档位，请管理员在 New API 为该模型用户组启用对应图片档位后重试。",
        };

        expect(prepareFailedAgentTaskRetry(run, task, settings).quality).toBe("low");
    });
});
