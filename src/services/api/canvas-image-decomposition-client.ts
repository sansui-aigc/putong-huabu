/**
 * 前端图片分层分析服务
 * 直接调用用户配置的中转站 AI 视觉模型，去掉服务端依赖
 * 使用 Function Calling 方式，强制 AI 返回结构化分层数据
 */
import {
  canvasImageDecompositionInstruction,
  canvasImageDecompositionTool,
  normalizeCanvasImageDecomposition,
  type CanvasImageDecomposition,
  type CanvasImageDecompositionResponse,
} from "@/lib/canvas-image-decomposition";
import { getActiveCreativeApiConnection, getCreativeApiConnections } from "@/standalone/static-runtime";
import { nanoid } from "nanoid";

// ==================== 类型定义 ====================

type DecompositionOptions = {
  requestId?: string;
  source: string; // 图片 URL 或 data URL
  connectionId?: string; // 指定使用哪个中转站连接
  model?: string; // 指定使用哪个模型（必须支持视觉输入）
};

// ==================== 工具函数 ====================

/**
 * 读取图片的 data URL 和尺寸
 */
async function readSourceImage(source: string): Promise<{ dataUrl: string; mimeType: string; width: number; height: number }> {
  // 如果已经是 data URL，直接解析
  const dataMatch = source.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (dataMatch) {
    const mimeType = dataMatch[1].toLowerCase();
    const dataUrl = source;
    // 用 Image 读取尺寸
    const dimensions = await getImageDimensions(dataUrl);
    return { dataUrl, mimeType, width: dimensions.width, height: dimensions.height };
  }

  // 如果是 URL，先下载图片再转 data URL
  const response = await fetch(source);
  if (!response.ok) throw new Error(`无法读取图片: HTTP ${response.status}`);
  const blob = await response.blob();
  const mimeType = blob.type || "image/png";
  const dataUrl = await blobToDataUrl(blob);
  const dimensions = await getImageDimensions(dataUrl);
  return { dataUrl, mimeType, width: dimensions.width, height: dimensions.height };
}

/**
 * blob 转 data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 获取图片尺寸
 */
function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * 选择用于分层分析的模型（优先选择支持视觉的文本模型）
 */
function selectVisionModel(connectionId?: string, model?: string): { connection: { id: string; name: string; baseUrl: string; key: string }; model: string } | null {
  const connections = getCreativeApiConnections();
  if (connections.length === 0) return null;

  // 如果指定了连接和模型，直接使用
  if (connectionId && model) {
    const connection = connections.find((c) => c.id === connectionId);
    if (connection) return { connection, model };
  }

  // 否则使用当前激活的连接
  const activeConnection = connectionId
    ? connections.find((c) => c.id === connectionId)
    : getActiveCreativeApiConnection();

  if (!activeConnection) return null;

  // 如果指定了模型，使用指定的
  if (model) return { connection: activeConnection, model };

  // 否则默认使用 gpt-4o 或第一个可用的视觉模型
  // 这里简单返回一个默认模型，实际使用时应该从模型列表中选择
  const defaultVisionModel = "gpt-4o";
  return { connection: activeConnection, model: defaultVisionModel };
}

/**
 * 调用 OpenAI 兼容协议的视觉模型进行分层分析
 */
async function callOpenAIVisionModel(
  connection: { baseUrl: string; key: string },
  model: string,
  source: { dataUrl: string; width: number; height: number },
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = connection.baseUrl.trim().replace(/\/+$/, "");
  const url = `${baseUrl}/v1/chat/completions`;
  const instruction = canvasImageDecompositionInstruction(source.width, source.height);
  const prompt = `请分析这张 ${source.width}x${source.height} 图片，先判断电商或普通主体策略，再按要求完成分层。JSON Schema：${JSON.stringify(canvasImageDecompositionTool.parameters)}`;

  const body = {
    model,
    messages: [
      { role: "system", content: instruction },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: source.dataUrl } },
        ],
      },
    ],
    tools: [{ type: "function", function: canvasImageDecompositionTool }],
    tool_choice: { type: "function", function: { name: canvasImageDecompositionTool.name } },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${connection.key}`,
  };

  // 非本地开发环境走服务器代理，避免浏览器 CORS 限制
  const isLocalDev = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(window.location.hostname);
  let fetchUrl = url;
  if (!isLocalDev) {
    headers["X-Target-URL"] = url;
    fetchUrl = "/api/external-proxy/request";
  }

  const response = await fetch(fetchUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`AI 模型调用失败 (HTTP ${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();

  // 从 tool_calls 中提取分层参数
  const message = data.choices?.[0]?.message;
  const toolCall = message?.tool_calls?.find(
    (tc: Record<string, unknown>) => tc.function?.name === canvasImageDecompositionTool.name,
  );

  if (toolCall?.function?.arguments) {
    return toolCall.function.arguments as string;
  }

  // 如果没有 tool_calls，尝试从 message.content 中提取 JSON
  if (typeof message?.content === "string") {
    const jsonMatch = message.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
  }

  throw new Error("AI 模型没有返回分层结构数据");
}

// ==================== 主函数 ====================

/**
 * 前端图片分层分析
 * 直接调用用户配置的中转站 AI 视觉模型
 */
export async function decomposeImageClient(
  options: DecompositionOptions,
): Promise<CanvasImageDecompositionResponse> {
  const requestId = options.requestId || nanoid();

  // 1. 选择模型和连接
  const selected = selectVisionModel(options.connectionId, options.model);
  if (!selected) {
    throw new Error("请先配置可用的中转站连接");
  }

  // 2. 读取图片
  const source = await readSourceImage(options.source);

  // 3. 调用 AI 视觉模型进行分层分析
  const argumentsText = await callOpenAIVisionModel(
    selected.connection,
    selected.model,
    source,
  );

  // 4. 解析和规范化分层结果
  const decomposition = normalizeCanvasImageDecomposition(
    JSON.parse(argumentsText),
    source.width,
    source.height,
  );

  if (!decomposition) {
    throw new Error("AI 模型返回的分层数据无效");
  }

  if (!decomposition.layers.length) {
    throw new Error("没有识别到可独立分层的元素");
  }

  // 5. 生成 batchGrant（前端版本，简单生成一个唯一标识）
  const batchGrant = `client-${requestId}-${Date.now()}`;

  return {
    ...decomposition,
    batchGrant,
  };
}

/**
 * 检查前端分层功能是否可用
 */
export function isClientDecompositionAvailable(): boolean {
  const connections = getCreativeApiConnections();
  return connections.length > 0;
}
