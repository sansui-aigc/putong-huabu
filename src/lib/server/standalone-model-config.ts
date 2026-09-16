import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import { applyChannelProtocol, registeredChannelProtocolDefinitions } from "@/lib/channel-protocol-registry";
import { normalizeModelId } from "@/lib/model-capability";
import { resolveServerDataPath } from "@/lib/server/data-dir";
import type { AuthSettings, GenerationDefaultSettings, LogicalModel, LogicalModelCapability, SystemChannelAdvancedConfig, SystemChannelModelConfig, SystemChannelProtocol, SystemDefaultModels, SystemModelChannel } from "@/lib/auth/store-types";
import { normalizeSettings } from "@/lib/auth/store-normalizers";

const MODEL_CONFIG_ENV = "VOZEB_PRO_MODEL_CONFIG_FILE";
const DEFAULT_MODEL_CONFIG_FILE = "models.json";
const protocolIds = new Set(registeredChannelProtocolDefinitions.map((item) => item.id));

export type StandaloneModelConfig = {
    channels?: SystemModelChannel[];
    logicalModels?: LogicalModel[];
    defaults?: Partial<SystemDefaultModels>;
    defaultModels?: Partial<SystemDefaultModels>;
    generationDefaults?: Partial<GenerationDefaultSettings>;
};

export function standaloneModelConfigPath() {
    const configured = process.env[MODEL_CONFIG_ENV]?.trim();
    if (!configured) return resolveServerDataPath(DEFAULT_MODEL_CONFIG_FILE);
    if (isAbsolute(configured)) return configured;
    const cwd = /*turbopackIgnore: true*/ process.cwd();
    if (basename(cwd) === "standalone" && basename(dirname(cwd)) === ".next") return resolve(/*turbopackIgnore: true*/ cwd, "..", "..", configured);
    return resolve(/*turbopackIgnore: true*/ cwd, configured);
}

export async function readStandaloneModelConfig(): Promise<StandaloneModelConfig | null> {
    const filePath = standaloneModelConfigPath();
    let raw: string;
    try {
        raw = await readFile(/*turbopackIgnore: true*/ filePath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new Error(`模型配置文件无法读取：${filePath}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch {
        throw new Error(`模型配置文件不是有效 JSON：${filePath}`);
    }
    return normalizeStandaloneModelConfig(parsed);
}

export function mergeStandaloneModelConfig(settings: AuthSettings, config: StandaloneModelConfig) {
    const next = {
        ...settings,
        ...(config.channels ? { systemChannels: config.channels } : {}),
        ...(config.logicalModels ? { logicalModels: config.logicalModels } : {}),
        ...(config.generationDefaults ? { generationDefaults: { ...settings.generationDefaults, ...config.generationDefaults } } : {}),
        defaultModels: {
            ...settings.defaultModels,
            ...(config.defaults || {}),
            ...(config.defaultModels || {}),
        },
    };
    return normalizeSettings(next);
}

function normalizeStandaloneModelConfig(value: unknown): StandaloneModelConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("模型配置文件根节点必须是 JSON 对象");
    const source = value as Record<string, unknown>;
    const nested = source.settings && typeof source.settings === "object" && !Array.isArray(source.settings) ? (source.settings as Record<string, unknown>) : {};
    const channelsValue = source.channels ?? nested.systemChannels;
    const channels = Array.isArray(channelsValue) ? channelsValue.map(normalizeStandaloneChannel).filter((channel): channel is SystemModelChannel => Boolean(channel)) : undefined;
    const logicalModels = Array.isArray(source.logicalModels ?? nested.logicalModels) ? ((source.logicalModels ?? nested.logicalModels) as LogicalModel[]) : undefined;
    const defaults = normalizeDefaults(source.defaults ?? nested.defaultModels);
    const defaultModels = normalizeDefaults(source.defaultModels ?? nested.defaultModels);
    const generationDefaults = source.generationDefaults && typeof source.generationDefaults === "object" && !Array.isArray(source.generationDefaults) ? (source.generationDefaults as Partial<GenerationDefaultSettings>) : undefined;
    return {
        ...(channelsValue !== undefined ? { channels: channels || [] } : {}),
        ...(logicalModels ? { logicalModels } : {}),
        ...(defaults ? { defaults } : {}),
        ...(defaultModels ? { defaultModels } : {}),
        ...(generationDefaults ? { generationDefaults } : {}),
    };
}

function normalizeStandaloneChannel(value: unknown, index: number): SystemModelChannel | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    const rawAdvanced = source.advancedConfig && typeof source.advancedConfig === "object" && !Array.isArray(source.advancedConfig) ? (source.advancedConfig as Record<string, unknown>) : {};
    const protocol = normalizeProtocol(source.protocol ?? rawAdvanced.protocol, source.apiFormat);
    const modelCapabilities: Record<string, LogicalModelCapability> = isRecord(rawAdvanced.modelCapabilities) ? { ...(rawAdvanced.modelCapabilities as Record<string, LogicalModelCapability>) } : {};
    const modelConfigs: Record<string, SystemChannelModelConfig> = isRecord(rawAdvanced.modelConfigs) ? { ...(rawAdvanced.modelConfigs as Record<string, SystemChannelModelConfig>) } : {};
    const models = normalizeModels(source.models, modelCapabilities, modelConfigs);
    const advancedConfig = {
        ...rawAdvanced,
        protocol,
        modelCapabilities,
        modelConfigs,
    } as Partial<SystemChannelAdvancedConfig>;
    const channel: SystemModelChannel = {
        id: text(source.id) || `standalone-${index + 1}`,
        name: text(source.name) || `模型渠道 ${index + 1}`,
        baseUrl: text(source.baseUrl),
        apiKey: resolveSecret(source.apiKey, source.apiKeyEnv),
        webhookSecret: resolveSecret(source.webhookSecret, source.webhookSecretEnv),
        apiFormat: source.apiFormat === "gemini" ? "gemini" : "openai",
        models,
        enabled: source.enabled !== false,
        advancedConfig: advancedConfig as SystemChannelAdvancedConfig,
    };
    return protocol === "auto" ? channel : applyChannelProtocol(channel, protocol);
}

function normalizeModels(value: unknown, capabilities: Record<string, LogicalModelCapability>, configs: Record<string, SystemChannelModelConfig>) {
    if (!Array.isArray(value)) return [];
    const models: string[] = [];
    for (const item of value) {
        const source = typeof item === "string" ? { id: item } : isRecord(item) ? item : null;
        if (!source) continue;
        const model = text(source.id ?? source.model ?? source.name);
        if (!model || models.includes(model)) continue;
        models.push(model);
        const key = normalizeModelId(model);
        const capability = normalizeCapability(source.capability);
        if (capability) capabilities[key] = capability;
        if (isRecord(source.config) || isRecord(source.advancedConfig)) {
            const config = (source.config || source.advancedConfig) as Record<string, unknown>;
            configs[key] = { ...configs[key], ...config, ...(capability ? { capability } : {}) } as SystemChannelModelConfig;
        }
    }
    return models;
}

function normalizeDefaults(value: unknown): Partial<SystemDefaultModels> | undefined {
    if (!isRecord(value)) return undefined;
    const keys: Array<keyof SystemDefaultModels> = ["textModel", "imageModel", "videoModel", "audioModel"];
    const result = Object.fromEntries(
        keys.flatMap((key) => {
            const model = text(value[key]);
            return model ? [[key, model]] : [];
        }),
    ) as Partial<SystemDefaultModels>;
    return Object.keys(result).length ? result : undefined;
}

function normalizeProtocol(value: unknown, apiFormat: unknown): SystemChannelProtocol {
    const candidate = text(value) as SystemChannelProtocol;
    if (protocolIds.has(candidate)) return candidate;
    return apiFormat === "gemini" ? "gemini" : "openai";
}

function normalizeCapability(value: unknown): LogicalModelCapability | undefined {
    return value === "text" || value === "image" || value === "video" || value === "audio" ? value : undefined;
}

function resolveSecret(value: unknown, envName: unknown) {
    const configuredEnv = text(envName);
    if (configuredEnv) return process.env[configuredEnv]?.trim() || "";
    const raw = text(value);
    if (raw.startsWith("env:")) return process.env[raw.slice(4).trim()]?.trim() || "";
    return raw;
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
