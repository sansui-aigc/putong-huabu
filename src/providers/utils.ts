/**
 * 模型提供者通用工具函数
 * 包括 CORS 代理、错误处理等通用逻辑
 */
import type { ApiConnection } from "./types";
import { ProviderError } from "./types";

/**
 * 判断是否为本地开发环境
 */
export function isLocalDev(): boolean {
  if (typeof window === "undefined") return true;
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(window.location.hostname);
}

/**
 * 构建目标 URL
 */
export function buildTargetUrl(connection: ApiConnection, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const baseUrl = connection.baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * 提供者专用 fetch，自动处理 CORS 代理
 * 在非本地开发环境下，请求会通过 /api/external-proxy/request 代理
 */
export async function providerFetch(
  connection: ApiConnection,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (connection.apiKey) {
    headers.set("Authorization", `Bearer ${connection.apiKey}`);
  }

  const target = buildTargetUrl(connection, path);

  // 非本地开发环境走服务器代理，避免浏览器 CORS 限制
  if (!isLocalDev()) {
    headers.set("X-Target-URL", target);
    return fetch("/api/external-proxy/request", { ...init, headers });
  }

  return fetch(target, { ...init, headers });
}

/**
 * 处理 fetch 错误，转换为 ProviderError
 */
export async function handleProviderError(
  response: Response,
  providerName: string,
): Promise<never> {
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

  if (response.status === 401) {
    throw new ProviderError(errorMessage, { statusCode: 401, code: errorCode || "INVALID_API_KEY", provider: providerName, raw: errorBody });
  }
  if (response.status === 429) {
    throw new ProviderError(errorMessage, { statusCode: 429, code: errorCode || "RATE_LIMIT", provider: providerName, raw: errorBody });
  }
  if (response.status === 408 || response.status === 504) {
    throw new ProviderError(errorMessage, { statusCode: response.status, code: errorCode || "TIMEOUT", provider: providerName, raw: errorBody });
  }

  throw new ProviderError(errorMessage, {
    statusCode: response.status,
    code: errorCode,
    provider: providerName,
    raw: errorBody,
  });
}

/**
 * 安全解析 JSON，失败返回 null
 */
export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
