/**
 * 模型提供者统一入口
 * 导出所有内置适配器和注册中心
 */

// 先导入注册中心和适配器
import { registerProviderLoader } from "./registry";
import { openAIProvider } from "./openai";
import { geminiProvider } from "./gemini";

// 类型导出
export type {
  ApiConnection,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ChatContentPart,
  ToolCall,
  ToolDefinition,
  ImageGenerateRequest,
  ImageGenerateResponse,
  VideoGenerateRequest,
  VideoTask,
  ModelInfo,
  ModelCapability,
  ModelProtocol,
  ModelProvider,
} from "./types";

export {
  ProviderError,
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderTimeoutError,
} from "./types";

// 注册中心导出
export {
  registerProvider,
  registerProviderLoader,
  getAllProviders,
  getProviderByProtocol,
  detectProvider,
  listModels,
  listModelsForConnections,
  chat,
  chatStream,
  generateImage,
  createVideoTask,
  getVideoTask,
} from "./registry";

// 内置适配器导出
export { OpenAIProvider, openAIProvider } from "./openai";
export { GeminiProvider, geminiProvider } from "./gemini";

/**
 * 初始化所有内置提供者
 * 在应用启动时调用一次
 */
export function initBuiltinProviders(): void {
  // 内置提供者已通过 registerProviderLoader 注册
  // 实际加载在 registry.ensureInitialized() 中进行
}

// 自动注册内置提供者（通过延迟加载）
registerProviderLoader(() => openAIProvider);
registerProviderLoader(() => geminiProvider);
