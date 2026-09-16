/**
 * 模型提供者注册中心
 * 负责自动发现、加载和管理所有协议适配器
 */
import type { ApiConnection, ModelInfo, ModelProvider, ModelProtocol } from "./types";
import { ProviderError } from "./types";

// 内置适配器（延迟加载，避免循环依赖）
const providerLoaders: Array<() => ModelProvider> = [];
const providers: ModelProvider[] = [];
let initialized = false;

/**
 * 注册一个模型提供者
 * 可以在应用启动时注册，也可以动态注册
 */
export function registerProvider(provider: ModelProvider): void {
  const existing = providers.find((p) => p.protocol === provider.protocol);
  if (existing) {
    console.warn(`[ModelRegistry] 协议 ${provider.protocol} 已注册，将被覆盖`);
    const index = providers.indexOf(existing);
    providers[index] = provider;
  } else {
    providers.push(provider);
  }
  console.log(`[ModelRegistry] 已注册提供者: ${provider.name} (${provider.protocol})`);
}

/**
 * 注册一个延迟加载的提供者
 * 用于避免循环依赖
 */
export function registerProviderLoader(loader: () => ModelProvider): void {
  providerLoaders.push(loader);
}

/**
 * 初始化所有延迟加载的提供者
 */
function ensureInitialized(): void {
  if (initialized) return;
  for (const loader of providerLoaders) {
    try {
      const provider = loader();
      registerProvider(provider);
    } catch (error) {
      console.error("[ModelRegistry] 加载提供者失败:", error);
    }
  }
  initialized = true;
}

/**
 * 获取所有已注册的提供者
 */
export function getAllProviders(): ModelProvider[] {
  ensureInitialized();
  return [...providers];
}

/**
 * 根据协议类型获取提供者
 */
export function getProviderByProtocol(protocol: ModelProtocol): ModelProvider | undefined {
  ensureInitialized();
  return providers.find((p) => p.protocol === protocol);
}

/**
 * 自动检测连接适配的提供者
 * 优先使用连接显式指定的 protocol，否则自动检测
 */
export function detectProvider(connection: ApiConnection): ModelProvider {
  ensureInitialized();

  // 1. 优先使用连接显式指定的协议
  if (connection.protocol) {
    const provider = providers.find((p) => p.protocol === connection.protocol);
    if (provider) return provider;
    console.warn(`[ModelRegistry] 连接 ${connection.name} 指定的协议 ${connection.protocol} 未找到适配提供者，将自动检测`);
  }

  // 2. 自动检测
  for (const provider of providers) {
    try {
      if (provider.detect(connection)) {
        console.log(`[ModelRegistry] 连接 ${connection.name} 自动匹配到提供者: ${provider.name}`);
        return provider;
      }
    } catch (error) {
      console.warn(`[ModelRegistry] 提供者 ${provider.name} 检测失败:`, error);
    }
  }

  // 3. 兜底：使用第一个提供者（通常是 OpenAI，因为最通用）
  const fallback = providers.find((p) => p.protocol === "openai") || providers[0];
  if (fallback) {
    console.warn(`[ModelRegistry] 连接 ${connection.name} 未匹配到任何提供者，使用兜底: ${fallback.name}`);
    return fallback;
  }

  throw new ProviderError(`没有可用的模型提供者，请检查连接配置`, {
    code: "NO_PROVIDER",
    provider: "registry",
  });
}

/**
 * 获取连接的模型列表
 * 自动选择适配的提供者
 */
export async function listModels(connection: ApiConnection, signal?: AbortSignal): Promise<ModelInfo[]> {
  const provider = detectProvider(connection);
  if (!provider.listModels) {
    throw new ProviderError(`提供者 ${provider.name} 不支持获取模型列表`, {
      code: "UNSUPPORTED_OPERATION",
      provider: provider.name,
    });
  }
  return provider.listModels(connection, signal);
}

/**
 * 批量获取多个连接的模型列表
 * 返回连接ID -> 模型列表的映射
 */
export async function listModelsForConnections(
  connections: ApiConnection[],
  signal?: AbortSignal,
): Promise<Map<string, ModelInfo[]>> {
  const result = new Map<string, ModelInfo[]>();
  const promises = connections.map(async (connection) => {
    try {
      const models = await listModels(connection, signal);
      result.set(connection.id, models);
    } catch (error) {
      console.error(`[ModelRegistry] 获取连接 ${connection.name} 模型列表失败:`, error);
      result.set(connection.id, []);
    }
  });
  await Promise.all(promises);
  return result;
}

/**
 * 执行文本生成（自动选择提供者）
 */
export async function chat(
  connection: ApiConnection,
  request: Parameters<NonNullable<ModelProvider["chat"]>>[1],
  signal?: AbortSignal,
) {
  const provider = detectProvider(connection);
  if (!provider.chat) {
    throw new ProviderError(`提供者 ${provider.name} 不支持文本生成`, {
      code: "UNSUPPORTED_OPERATION",
      provider: provider.name,
    });
  }
  return provider.chat(connection, request, signal);
}

/**
 * 执行流式文本生成（自动选择提供者）
 */
export function chatStream(
  connection: ApiConnection,
  request: Parameters<NonNullable<ModelProvider["chatStream"]>>[1],
  signal?: AbortSignal,
) {
  const provider = detectProvider(connection);
  if (!provider.chatStream) {
    throw new ProviderError(`提供者 ${provider.name} 不支持流式文本生成`, {
      code: "UNSUPPORTED_OPERATION",
      provider: provider.name,
    });
  }
  return provider.chatStream(connection, request, signal);
}

/**
 * 执行图片生成（自动选择提供者）
 */
export async function generateImage(
  connection: ApiConnection,
  request: Parameters<NonNullable<ModelProvider["generateImage"]>>[1],
  signal?: AbortSignal,
) {
  const provider = detectProvider(connection);
  if (!provider.generateImage) {
    throw new ProviderError(`提供者 ${provider.name} 不支持图片生成`, {
      code: "UNSUPPORTED_OPERATION",
      provider: provider.name,
    });
  }
  return provider.generateImage(connection, request, signal);
}

/**
 * 创建视频生成任务（自动选择提供者）
 */
export async function createVideoTask(
  connection: ApiConnection,
  request: Parameters<NonNullable<ModelProvider["createVideoTask"]>>[1],
  signal?: AbortSignal,
) {
  const provider = detectProvider(connection);
  if (!provider.createVideoTask) {
    throw new ProviderError(`提供者 ${provider.name} 不支持视频生成`, {
      code: "UNSUPPORTED_OPERATION",
      provider: provider.name,
    });
  }
  return provider.createVideoTask(connection, request, signal);
}

/**
 * 查询视频任务状态（自动选择提供者）
 */
export async function getVideoTask(
  connection: ApiConnection,
  taskId: string,
  signal?: AbortSignal,
) {
  const provider = detectProvider(connection);
  if (!provider.getVideoTask) {
    throw new ProviderError(`提供者 ${provider.name} 不支持查询视频任务`, {
      code: "UNSUPPORTED_OPERATION",
      provider: provider.name,
    });
  }
  return provider.getVideoTask(connection, taskId, signal);
}
