/**
 * 统一模型提供者类型定义
 * 所有协议适配器（OpenAI / Gemini / 方舟 / ComfyUI 等）都必须实现这些接口
 */

// ==================== 基础类型 ====================

export type ModelCapability = "text" | "image" | "video" | "audio" | "embedding";

export type ModelProtocol = "openai" | "gemini" | "ark" | "comfyui" | "custom";

export interface ModelInfo {
  id: string;
  name?: string;
  capability: ModelCapability;
  protocol: ModelProtocol;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsStreaming?: boolean;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
  pricing?: {
    input?: number;
    output?: number;
    image?: number;
    video?: number;
  };
  raw?: Record<string, unknown>;
}

export interface ApiConnection {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol?: ModelProtocol;
  models?: ModelInfo[];
  enabled?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

// ==================== 文本生成 ====================

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[];
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" } };

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  responseFormat?: { type: "text" | "json_object" };
  tools?: ToolDefinition[];
  toolChoice?: "none" | "auto" | { type: "function"; function: { name: string } };
  reasoningEffort?: "low" | "medium" | "high";
  // 扩展字段，适配器可自行使用
  extra?: Record<string, unknown>;
}

export interface ChatResponse {
  id?: string;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finishReason?: "stop" | "length" | "tool_calls" | "content_filter" | string;
  }[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

export interface ChatStreamChunk {
  id?: string;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoningContent?: string;
      toolCalls?: ToolCall[];
    };
    finishReason?: string | null;
  }[];
  usage?: ChatResponse["usage"];
  raw?: unknown;
}

// ==================== 图片生成 ====================

export interface ImageGenerateRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  size?: string; // "1024x1024", "1024x1792", "1792x1024" 等
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  count?: number;
  responseFormat?: "url" | "b64_json";
  // 图生图参考图
  referenceImages?: {
    url: string;
    weight?: number;
  }[];
  // 扩展字段
  extra?: Record<string, unknown>;
}

export interface ImageGenerateResponse {
  model: string;
  images: {
    url?: string;
    b64Json?: string;
    revisedPrompt?: string;
  }[];
  usage?: {
    totalPixels?: number;
  };
  raw?: unknown;
}

// ==================== 视频生成 ====================

export interface VideoGenerateRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  duration?: number; // 秒
  resolution?: "480p" | "720p" | "1080p" | "4k";
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
  fps?: number;
  // 图生视频参考图
  referenceImages?: {
    url: string;
    type?: "first" | "last" | "reference";
  }[];
  // 视频生成通常是异步任务
  callbackUrl?: string;
  extra?: Record<string, unknown>;
}

export interface VideoTask {
  taskId: string;
  model: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
  progress?: number;
  videoUrl?: string;
  error?: string;
  createdAt?: number;
  completedAt?: number;
  raw?: unknown;
}

// ==================== 统一提供者接口 ====================

export interface ModelProvider {
  /** 协议类型 */
  readonly protocol: ModelProtocol;
  /** 提供者名称 */
  readonly name: string;

  /**
   * 检测该连接是否适配此协议
   * 根据 baseUrl、模型名等特征自动判断
   */
  detect(connection: ApiConnection): boolean;

  /**
   * 获取模型列表
   */
  listModels(connection: ApiConnection, signal?: AbortSignal): Promise<ModelInfo[]>;

  /**
   * 文本生成（非流式）
   */
  chat?(connection: ApiConnection, request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;

  /**
   * 文本生成（流式）
   * 返回异步迭代器，逐块返回
   */
  chatStream?(
    connection: ApiConnection,
    request: ChatRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, void, unknown>;

  /**
   * 图片生成
   */
  generateImage?(connection: ApiConnection, request: ImageGenerateRequest, signal?: AbortSignal): Promise<ImageGenerateResponse>;

  /**
   * 创建视频生成任务
   */
  createVideoTask?(connection: ApiConnection, request: VideoGenerateRequest, signal?: AbortSignal): Promise<VideoTask>;

  /**
   * 查询视频任务状态
   */
  getVideoTask?(connection: ApiConnection, taskId: string, signal?: AbortSignal): Promise<VideoTask>;

  /**
   * 取消视频任务
   */
  cancelVideoTask?(connection: ApiConnection, taskId: string, signal?: AbortSignal): Promise<void>;
}

// ==================== 提供者错误 ====================

export class ProviderError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  readonly provider?: string;
  readonly raw?: unknown;

  constructor(message: string, options?: { statusCode?: number; code?: string; provider?: string; raw?: unknown }) {
    super(message);
    this.name = "ProviderError";
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.provider = options?.provider;
    this.raw = options?.raw;
  }
}

export class ProviderAuthError extends ProviderError {
  constructor(message = "API Key 无效或已过期", options?: { provider?: string; raw?: unknown }) {
    super(message, { ...options, statusCode: 401, code: "INVALID_API_KEY" });
    this.name = "ProviderAuthError";
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(message = "请求频率超限，请稍后重试", options?: { provider?: string; raw?: unknown }) {
    super(message, { ...options, statusCode: 429, code: "RATE_LIMIT" });
    this.name = "ProviderRateLimitError";
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(message = "请求超时", options?: { provider?: string; raw?: unknown }) {
    super(message, { ...options, statusCode: 408, code: "TIMEOUT" });
    this.name = "ProviderTimeoutError";
  }
}
