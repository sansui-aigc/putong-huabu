/**
 * OpenAI 协议适配器
 * 支持所有兼容 OpenAI API 格式的中转站（new-api / sub2api / one-api 等）
 */
import type {
  ApiConnection,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ImageGenerateRequest,
  ImageGenerateResponse,
  ModelCapability,
  ModelInfo,
  ModelProvider,
  VideoGenerateRequest,
  VideoTask,
} from "../types";
import { ProviderError } from "../types";
import { providerFetch, handleProviderError } from "../utils";

// ==================== 工具函数 ====================

function normalizeBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "");
  // 自动补全 /v1 后缀（如果没有）
  if (!/\/v\d+$/.test(url)) {
    url = `${url}/v1`;
  }
  return url;
}

function inferModelCapability(modelId: string): ModelCapability {
  const id = modelId.toLowerCase();
  // 视频模型
  if (/(wan|cogvideo|kling|sora|veo|runway|pika|luma|hailuo|即梦|jimeng|video)/.test(id)) {
    return "video";
  }
  // 图片模型
  if (/(dall|gpt-image|imagen|flux|sd|stable-diffusion|midjourney|mj|recraft|ideogram|image)/.test(id)) {
    return "image";
  }
  // 音频模型
  if (/(whisper|tts|speech|audio|voice)/.test(id)) {
    return "audio";
  }
  // 嵌入模型
  if (/(embedding|embed)/.test(id)) {
    return "embedding";
  }
  // 默认文本模型
  return "text";
}

function buildHeaders(connection: ApiConnection, extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${connection.apiKey}`,
    ...extra,
  };
}

async function handleFetchError(response: Response, providerName: string): Promise<never> {
  let errorBody: string;
  try {
    errorBody = await response.text();
  } catch {
    errorBody = "";
  }

  let errorMessage = `请求失败 (${response.status})`;
  let errorCode: string | undefined;

  try {
    const parsed = JSON.parse(errorBody);
    errorMessage = parsed.error?.message || parsed.message || errorMessage;
    errorCode = parsed.error?.code || parsed.code;
  } catch {
    // 非 JSON 响应，使用原始文本
    if (errorBody) errorMessage = errorBody.slice(0, 500);
  }

  if (response.status === 401) {
    throw new ProviderAuthError(errorMessage, { provider: providerName, raw: errorBody });
  }
  if (response.status === 429) {
    throw new ProviderRateLimitError(errorMessage, { provider: providerName, raw: errorBody });
  }
  if (response.status === 408 || response.status === 504) {
    throw new ProviderTimeoutError(errorMessage, { provider: providerName, raw: errorBody });
  }

  throw new ProviderError(errorMessage, {
    statusCode: response.status,
    code: errorCode,
    provider: providerName,
    raw: errorBody,
  });
}

// ==================== 适配器实现 ====================

export class OpenAIProvider implements ModelProvider {
  readonly protocol = "openai" as const;
  readonly name = "OpenAI 兼容协议";

  /**
   * 检测连接是否适配 OpenAI 协议
   * OpenAI 协议是最通用的，默认适配所有连接（除非显式指定其他协议）
   */
  detect(connection: ApiConnection): boolean {
    // 如果显式指定了协议且不是 openai，则不适配
    if (connection.protocol && connection.protocol !== "openai") return false;
    // OpenAI 协议是兜底协议，默认适配
    return true;
  }

  /**
   * 获取模型列表
   */
  async listModels(connection: ApiConnection, signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      // providerFetch 自动处理 baseUrl、Authorization 头和 CORS 代理
      const response = await providerFetch(connection, "/models", {
        method: "GET",
        signal,
      });

      if (!response.ok) {
        await handleProviderError(response, this.name);
      }

      const data = await response.json();
      const models: ModelInfo[] = [];

      // OpenAI 格式: { data: [{ id, object, owned_by, ... }] }
      const list = Array.isArray(data) ? data : data.data || data.models || [];

      for (const item of list) {
        if (typeof item === "string") {
          models.push({
            id: item,
            capability: inferModelCapability(item),
            protocol: "openai",
          });
        } else if (item && typeof item === "object") {
          const id = item.id || item.name || item.model;
          if (!id) continue;
          const capability = item.capability || inferModelCapability(id);
          models.push({
            id,
            name: item.name || item.display_name,
            capability,
            protocol: "openai",
            contextWindow: item.context_window,
            maxOutputTokens: item.max_output_tokens,
            supportsStreaming: true,
            supportsVision: capability === "text" && /(gpt-4|gpt-5|claude|gemini|qwen|glm|deepseek|kimi|moonshot)/i.test(id),
            pricing: item.pricing,
            raw: item,
          });
        }
      }

      return models;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ProviderError("获取模型列表超时", { provider: this.name, code: "TIMEOUT", statusCode: 408 });
      }
      throw new ProviderError(`获取模型列表失败: ${error instanceof Error ? error.message : String(error)}`, {
        provider: this.name,
        code: "FETCH_ERROR",
      });
    }
  }

  /**
   * 文本生成（非流式）
   */
  async chat(connection: ApiConnection, request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: false,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.responseFormat) body.response_format = request.responseFormat;
    if (request.tools) body.tools = request.tools;
    if (request.toolChoice) body.tool_choice = request.toolChoice;
    if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort;
    Object.assign(body, request.extra || {});

    try {
      const response = await providerFetch(connection, "/chat/completions", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) await handleProviderError(response, this.name);

      const data = await response.json();
      return this.parseChatResponse(data, request.model);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ProviderError("文本生成超时", { provider: this.name, code: "TIMEOUT", statusCode: 408 });
      }
      throw new ProviderError(`文本生成失败: ${error instanceof Error ? error.message : String(error)}`, {
        provider: this.name,
        code: "FETCH_ERROR",
      });
    }
  }

  /**
   * 文本生成（流式）
   */
  async *chatStream(
    connection: ApiConnection,
    request: ChatRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: true,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.responseFormat) body.response_format = request.responseFormat;
    if (request.tools) body.tools = request.tools;
    if (request.toolChoice) body.tool_choice = request.toolChoice;
    if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort;
    Object.assign(body, request.extra || {});

    let response: Response;
    try {
      response = await providerFetch(connection, "/chat/completions", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ProviderError("流式请求超时", { provider: this.name, code: "TIMEOUT", statusCode: 408 });
      }
      throw new ProviderError(`流式请求失败: ${error instanceof Error ? error.message : String(error)}`, {
        provider: this.name,
        code: "FETCH_ERROR",
      });
    }

    if (!response.ok) {
      await handleProviderError(response, this.name);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProviderError("响应流不可读", { provider: this.name, code: "NO_STREAM" });
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按空行分割 SSE 事件（兼容 \n\n 和 \r\n\r\n）
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;

            try {
              const payload = JSON.parse(data);
              const chunk = this.parseStreamChunk(payload, request.model);
              if (chunk) yield chunk;
            } catch {
              // 忽略无法解析的 SSE 数据块
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 图片生成
   */
  async generateImage(
    connection: ApiConnection,
    request: ImageGenerateRequest,
    signal?: AbortSignal,
  ): Promise<ImageGenerateResponse> {
    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
      n: request.count || 1,
      size: request.size || "1024x1024",
    };
    if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
    if (request.quality) body.quality = request.quality;
    if (request.style) body.style = request.style;
    if (request.responseFormat) body.response_format = request.responseFormat;
    Object.assign(body, request.extra || {});

    try {
      const response = await providerFetch(connection, "/images/generations", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) await handleProviderError(response, this.name);

      const data = await response.json();
      const images = (data.data || []).map((item: Record<string, unknown>) => ({
        url: item.url as string | undefined,
        b64Json: item.b64_json as string | undefined,
        revisedPrompt: item.revised_prompt as string | undefined,
      }));

      return {
        model: request.model,
        images,
        raw: data,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ProviderError("图片生成超时", { provider: this.name, code: "TIMEOUT", statusCode: 408 });
      }
      throw new ProviderError(`图片生成失败: ${error instanceof Error ? error.message : String(error)}`, {
        provider: this.name,
        code: "FETCH_ERROR",
      });
    }
  }

  /**
   * 创建视频生成任务
   * OpenAI 协议本身没有标准的视频生成接口，这里适配常见的中转站扩展格式
   */
  async createVideoTask(
    connection: ApiConnection,
    request: VideoGenerateRequest,
    signal?: AbortSignal,
  ): Promise<VideoTask> {
    // 常见的视频生成端点（不同中转站可能不同）
    const possiblePaths = [
      "/videos/generations",
      "/video/generations",
      "/videos",
    ];

    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
    };
    if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
    if (request.duration) body.duration = request.duration;
    if (request.resolution) body.resolution = request.resolution;
    if (request.aspectRatio) body.aspect_ratio = request.aspectRatio;
    if (request.fps) body.fps = request.fps;
    if (request.referenceImages?.length) {
      body.image = request.referenceImages[0]?.url;
      body.images = request.referenceImages.map((img) => img.url);
    }
    Object.assign(body, request.extra || {});

    let lastError: Error | null = null;

    for (const path of possiblePaths) {
      try {
        const response = await providerFetch(connection, path, {
          method: "POST",
          body: JSON.stringify(body),
          signal,
        });

        if (response.status === 404) {
          // 端点不存在，尝试下一个
          continue;
        }
        if (!response.ok) {
          await handleProviderError(response, this.name);
        }

        const data = await response.json();
        const taskId = data.id || data.task_id || data.taskId || data.data?.id;
        if (!taskId) {
          throw new ProviderError("视频任务创建失败：未返回任务ID", { provider: this.name, raw: data });
        }

        return {
          taskId,
          model: request.model,
          status: (data.status || "pending") as VideoTask["status"],
          progress: data.progress,
          videoUrl: data.video_url || data.url || data.data?.url,
          error: data.error,
          createdAt: Date.now(),
          raw: data,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // 404 继续尝试下一个端点，其他错误直接抛出
        if (!(error instanceof ProviderError) || error.statusCode !== 404) {
          if (error instanceof ProviderError) throw error;
        }
      }
    }

    throw new ProviderError(
      `视频生成失败：所有端点均不可用${lastError ? ` (${lastError.message})` : ""}`,
      { provider: this.name, code: "NO_VIDEO_ENDPOINT" },
    );
  }

  /**
   * 查询视频任务状态
   */
  async getVideoTask(connection: ApiConnection, taskId: string, signal?: AbortSignal): Promise<VideoTask> {
    const possiblePaths = [
      `/videos/generations/${taskId}`,
      `/video/generations/${taskId}`,
      `/videos/${taskId}`,
      `/tasks/${taskId}`,
    ];

    for (const path of possiblePaths) {
      try {
        const response = await providerFetch(connection, path, {
          method: "GET",
          signal,
        });

        if (response.status === 404) continue;
        if (!response.ok) await handleProviderError(response, this.name);

        const data = await response.json();
        const status = (data.status || data.data?.status || "processing") as VideoTask["status"];
        const videoUrl = data.video_url || data.url || data.data?.url || data.data?.video_url;

        return {
          taskId,
          model: data.model || "",
          status,
          progress: data.progress || data.data?.progress,
          videoUrl,
          error: data.error || data.data?.error,
          createdAt: data.created_at,
          completedAt: data.completed_at,
          raw: data,
        };
      } catch (error) {
        if (error instanceof ProviderError && error.statusCode !== 404) throw error;
      }
    }

    throw new ProviderError(`查询视频任务失败：任务 ${taskId} 未找到`, {
      provider: this.name,
      code: "TASK_NOT_FOUND",
    });
  }

  // ==================== 内部解析方法 ====================

  private parseChatResponse(data: Record<string, unknown>, model: string): ChatResponse {
    const rawChoices = (data.choices || []) as Array<Record<string, any>>;
    const choices = rawChoices.map((choice, index) => ({
      index,
      message: {
        role: (choice.message?.role || "assistant") as "assistant",
        content: choice.message?.content || "",
        toolCalls: choice.message?.tool_calls,
      },
      finishReason: choice.finish_reason as string | undefined,
    }));

    return {
      id: data.id as string | undefined,
      model: (data.model as string) || model,
      choices,
      usage: data.usage
        ? {
            promptTokens: (data.usage as Record<string, unknown>).prompt_tokens as number | undefined,
            completionTokens: (data.usage as Record<string, unknown>).completion_tokens as number | undefined,
            totalTokens: (data.usage as Record<string, unknown>).total_tokens as number | undefined,
          }
        : undefined,
      raw: data,
    };
  }

  private parseStreamChunk(payload: Record<string, unknown>, model: string): ChatStreamChunk | null {
    const choices = payload.choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;

    const choice = choices[0] as Record<string, any>;
    const delta = (choice.delta || {}) as Record<string, any>;

    return {
      id: payload.id as string | undefined,
      model: (payload.model as string) || model,
      choices: [
        {
          index: (choice.index as number) || 0,
          delta: {
            role: delta.role as string | undefined,
            content: delta.content as string | undefined,
            reasoningContent: delta.reasoning_content as string | undefined,
            toolCalls: delta.tool_calls as ChatStreamChunk["choices"][0]["delta"]["toolCalls"],
          },
          finishReason: (choice.finish_reason as string | null) || null,
        },
      ],
      usage: payload.usage
        ? {
            promptTokens: (payload.usage as Record<string, unknown>).prompt_tokens as number | undefined,
            completionTokens: (payload.usage as Record<string, unknown>).completion_tokens as number | undefined,
            totalTokens: (payload.usage as Record<string, unknown>).total_tokens as number | undefined,
          }
        : undefined,
      raw: payload,
    };
  }
}

// 单例导出
export const openAIProvider = new OpenAIProvider();
