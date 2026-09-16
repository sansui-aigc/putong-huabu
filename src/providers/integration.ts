/**
 * 模型提供者集成适配层
 * 把新的 providers 架构和现有的 static-runtime 代码对接
 * 逐步迁移，确保不破坏现有功能
 */
import type { ApiConnection, ModelInfo } from "./types";
import { listModels as providerListModels, detectProvider } from "./registry";
import type { CreativeApiConnection, StaticApiModel } from "@/standalone/static-runtime";

// ==================== 类型转换 ====================

/**
 * 把现有的 CreativeApiConnection 转换为新的 ApiConnection
 */
export function toProviderConnection(connection: CreativeApiConnection): ApiConnection {
  return {
    id: connection.id,
    name: connection.name,
    baseUrl: connection.baseUrl,
    apiKey: connection.key,
    // 协议自动检测
    protocol: undefined,
  };
}

/**
 * 把新的 ModelInfo 转换为现有的 StaticApiModel
 */
export function fromProviderModel(model: ModelInfo): StaticApiModel {
  return {
    id: model.id,
    object: model.raw?.object as string | undefined,
    owned_by: model.raw?.owned_by as string | undefined,
    capabilities: model.raw?.capabilities as string[] | undefined,
    capability: model.capability as StaticApiModel["capability"],
    apiFormat: model.protocol === "gemini" ? "gemini" : undefined,
  };
}

// ==================== 集成函数 ====================

/**
 * 使用新架构获取模型列表
 * 这是第一个集成点，用于验证新架构的稳定性
 */
export async function listModelsForConnection(
  connection: CreativeApiConnection,
  signal?: AbortSignal,
): Promise<StaticApiModel[]> {
  const providerConnection = toProviderConnection(connection);
  const models = await providerListModels(providerConnection, signal);
  return models.map(fromProviderModel);
}

/**
 * 检测连接适配的提供者名称（用于调试）
 */
export function detectConnectionProvider(connection: CreativeApiConnection): string {
  try {
    const providerConnection = toProviderConnection(connection);
    const provider = detectProvider(providerConnection);
    return `${provider.name} (${provider.protocol})`;
  } catch (error) {
    return `未知 (${error instanceof Error ? error.message : String(error)})`;
  }
}

/**
 * 检查连接是否支持某个能力
 */
export function connectionSupports(
  connection: CreativeApiConnection,
  capability: "text" | "image" | "video" | "audio",
): boolean {
  try {
    const providerConnection = toProviderConnection(connection);
    const provider = detectProvider(providerConnection);
    switch (capability) {
      case "text":
        return !!provider.chat || !!provider.chatStream;
      case "image":
        return !!provider.generateImage;
      case "video":
        return !!provider.createVideoTask;
      case "audio":
        return false; // 暂不支持音频
      default:
        return false;
    }
  } catch {
    return false;
  }
}
