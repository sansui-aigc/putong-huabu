/**
 * Gemini 原生协议适配器
 * 支持 Google Gemini API 原生格式（非 OpenAI 兼容格式）
 */
import type {
  ApiConnection,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ImageGenerateRequest,
  ImageGenerateResponse,
  ModelInfo,
  ModelProvider,
} from "../types";
import { ProviderError } from "../types";
import { isLocalDev, buildTargetUrl, handleProviderError } from "../utils";
import { geminiImageSize } from "@/lib/gemini-image-config";

// ==================== 工具函数 ====================

/**
 * Gemini 专用 fetch，处理 CORS 代理和 x-goog-api-key 认证头
 */
async function geminiFetch(
  connection: ApiConnection,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (connection.apiKey) {
    headers.set("x-goog-api-key", connection.apiKey);
  }

  const target = buildTargetUrl(connection, path);

  // 非本地开发环境走服务器代理，避免浏览器 CORS 限制
  if (!isLocalDev()) {
    headers.set("X-Target-URL", target);
    return fetch("/api/external-proxy/request", { ...init, headers });
  }

  return fetch(target, { ...init, headers });
}

function isGeminiNativeUrl(baseUrl: string): boolean {
  const url = baseUrl.toLowerCase();
  return (
    url.includes("generativelanguage.googleapis.com") ||
    url.includes("gemini.googleapis.com") ||
    url.includes("aiplatform.googleapis.com")
  );
}

function isGeminiModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return /(?:^|[-_.\s/])gemini(?:$|[-_.\s/])/.test(id) || /(?:^|[-_.\s/])nano[-_.\s]?banana(?:$|[-_.\s/])/.test(id);
}

function buildHeaders(connection: ApiConnection, extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": connection.apiKey,
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
    if (errorBody) errorMessage = errorBody.slice(0, 500);
  }

  if (response.status === 401 || response.status === 403) {
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

// Gemini 内容转换
function convertMessagesToGeminiContents(messages: ChatRequest["messages"]): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role === "system") continue; // Gemini 的 system instruction 单独处理

    const parts: Array<Record<string, unknown>> = [];
    const content = message.content;

    if (typeof content === "string") {
      parts.push({ text: content });
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url") {
          const url = part.image_url.url;
          const match = url.match(/^data:([^;,]+);base64,(.+)$/s);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          } else {
            parts.push({ fileData: { fileUri: url, mimeType: "image/png" } });
          }
        }
      }
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts,
    });
  }

  return contents;
}

function extractTextFromGeminiResponse(data: Record<string, unknown>): string {
  const candidates = data.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";

  const candidate = candidates[0] as Record<string, unknown>;
  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => {
      if (part && typeof part === "object" && "text" in part) {
        return String((part as Record<string, unknown>).text || "");
      }
      return "";
    })
    .join("");
}

function extractImagesFromGeminiResponse(data: Record<string, unknown>): Array<{ b64Json?: string; url?: string }> {
  const results: Array<{ b64Json?: string; url?: string }> = [];
  const candidates = data.candidates;
  if (!Array.isArray(candidates)) return results;

  for (const candidate of candidates) {
    const content = candidate?.content;
    const parts = content?.parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const inline = (part.inlineData || part.inline_data) as Record<string, unknown> | undefined;
      const data = typeof inline?.data === "string" ? inline.data.trim() : "";
      if (data) {
        const mimeType = typeof inline?.mimeType === "string" ? inline.mimeType : "image/png";
        results.push({ b64Json: `data:${mimeType};base64,${data}` });
      }
    }
  }

  return results;
}

// ==================== 适配器实现 ====================

export class GeminiProvider implements ModelProvider {
  readonly protocol = "gemini" as const;
  readonly name = "Gemini 原生协议";

  /**
   * 检测连接是否适配 Gemini 原生协议
   */
  detect(connection: ApiConnection): boolean {
    const protocol = connection.protocol as string | undefined;
    if (protocol === "gemini") return true;
    if (protocol && protocol !== "gemini") return false;

    // 根据 baseUrl 自动检测
    if (isGeminiNativeUrl(connection.baseUrl)) return true;

    // 根据模型列表自动检测（如果有 Gemini 原生模型）
    if (connection.models?.some((m) => m.protocol === "gemini")) return true;

    return false;
  }

  /**
   * 获取模型列表
   */
  async listModels(connection: ApiConnection, signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      // geminiFetch 自动处理 CORS 代理和 x-goog-api-key 认证头
      const response = await geminiFetch(connection, "/v1beta/models", {
        method: "GET",
        signal,
      });

      if (!response.ok) await handleProviderError(response, this.name);

      const data = await response.json();
      const models: ModelInfo[] = [];
      const list = data.models || [];

      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const name = item.name as string; // 格式: models/gemini-1.5-pro
        const id = name.replace(/^models\//, "");
        const displayName = item.displayName as string | undefined;

        // 判断能力
        const methods = item.supportedGenerationMethods as string[] || [];
        let capability: ModelInfo["capability"] = "text";
        if (methods.includes("generateContent") && item.outputModality?.includes("IMAGE")) {
          capability = "image";
        } else if (methods.includes("generateContent")) {
          capability = "text";
        } else if (methods.includes("embedContent")) {
          capability = "embedding";
        }

        models.push({
          id,
          name: displayName,
          capability,
          protocol: "gemini",
          contextWindow: item.inputTokenLimit,
          maxOutputTokens: item.outputTokenLimit,
          supportsStreaming: methods.includes("streamGenerateContent"),
          supportsVision: /gemini-(1\.5|2|3)/.test(id),
          raw: item,
        });
      }

      return models;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ProviderTimeoutError("获取模型列表超时", { provider: this.name });
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
    const model = request.model.replace(/^models\//, "");

    const systemInstruction = request.messages.find((m) => m.role === "system");
    const contents = convertMessagesToGeminiContents(request.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {},
    };

    if (systemInstruction && typeof systemInstruction.content === "string") {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }
    if (request.temperature !== undefined) (body.generationConfig as Record<string, unknown>).temperature = request.temperature;
    if (request.topP !== undefined) (body.generationConfig as Record<string, unknown>).topP = request.topP;
    if (request.maxTokens !== undefined) (body.generationConfig as Record<string, unknown>).maxOutputTokens = request.maxTokens;
    if (request.responseFormat?.type === "json_object") {
      (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
    }

    try {
      const response = await geminiFetch(connection, `/v1beta/models/${model}:generateContent`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) await handleProviderError(response, this.name);

      const data = await response.json();
      const text = extractTextFromGeminiResponse(data);

      return {
        id: data.id as string | undefined,
        model: request.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: text },
            finishReason: data.candidates?.[0]?.finishReason,
          },
        ],
        usage: data.usageMetadata
          ? {
              promptTokens: data.usageMetadata.promptTokenCount,
              completionTokens: data.usageMetadata.candidatesTokenCount,
              totalTokens: data.usageMetadata.totalTokenCount,
            }
          : undefined,
        raw: data,
      };
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
    const model = request.model.replace(/^models\//, "");

    const systemInstruction = request.messages.find((m) => m.role === "system");
    const contents = convertMessagesToGeminiContents(request.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {},
    };

    if (systemInstruction && typeof systemInstruction.content === "string") {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }
    if (request.temperature !== undefined) (body.generationConfig as Record<string, unknown>).temperature = request.temperature;
    if (request.topP !== undefined) (body.generationConfig as Record<string, unknown>).topP = request.topP;
    if (request.maxTokens !== undefined) (body.generationConfig as Record<string, unknown>).maxOutputTokens = request.maxTokens;

    let response: Response;
    try {
      response = await geminiFetch(connection, `/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
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

    if (!response.ok) await handleProviderError(response, this.name);

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
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data) continue;

            try {
              const payload = JSON.parse(data);
              const text = extractTextFromGeminiResponse(payload);
              if (text) {
                yield {
                  id: payload.id as string | undefined,
                  model: request.model,
                  choices: [
                    {
                      index: 0,
                      delta: { role: "assistant", content: text },
                      finishReason: payload.candidates?.[0]?.finishReason,
                    },
                  ],
                  usage: payload.usageMetadata
                    ? {
                        promptTokens: payload.usageMetadata.promptTokenCount,
                        completionTokens: payload.usageMetadata.candidatesTokenCount,
                        totalTokens: payload.usageMetadata.totalTokenCount,
                      }
                    : undefined,
                  raw: payload,
                };
              }
            } catch {
              // 忽略无法解析的块
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 图片生成（Gemini 原生图片生成，如 Gemini 2.5 Flash Image / Nano Banana）
   */
  async generateImage(
    connection: ApiConnection,
    request: ImageGenerateRequest,
    signal?: AbortSignal,
  ): Promise<ImageGenerateResponse> {
    const model = request.model.replace(/^models\//, "");

    const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];

    // 参考图
    for (const ref of request.referenceImages || []) {
      const match = ref.url.match(/^data:([^;,]+);base64,(.+)$/s);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      } else {
        parts.push({ fileData: { fileUri: ref.url, mimeType: "image/png" } });
      }
    }

    const imageSize = geminiImageSize(request.quality);
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        ...(imageSize ? { imageConfig: imageSize } : {}),
      },
    };

    try {
      const response = await geminiFetch(connection, `/v1beta/models/${model}:generateContent`, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) await handleProviderError(response, this.name);

      const data = await response.json();
      const images = extractImagesFromGeminiResponse(data);

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
}

// 单例导出
export const geminiProvider = new GeminiProvider();
