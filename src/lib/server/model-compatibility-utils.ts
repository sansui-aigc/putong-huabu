/**
 * 多模型兼容性工具函数
 * 支持 Claude、GPT、Grok、Gemini、Kimi、GLM 等市面上主流模型
 */

export type ModelFamily = "claude" | "gpt" | "grok" | "gemini" | "kimi" | "glm" | "qwen" | "deepseek" | "yi" | "mistral" | "llama" | "other";

/**
 * 检测模型所属的家族
 */
export function detectModelFamily(modelName: string): ModelFamily {
    const name = modelName.toLowerCase().trim();

    if (name.includes("claude")) return "claude";
    if (name.startsWith("gpt") || name.includes("gpt-")) return "gpt";
    if (name.includes("grok")) return "grok";
    if (name.includes("gemini")) return "gemini";
    if (name.includes("kimi") || name.includes("moonshot")) return "kimi";
    if (name.includes("glm") || name.includes("chatglm") || name.includes("zhipu")) return "glm";
    if (name.includes("qwen") || name.includes("tongyi") || name.includes("dashscope")) return "qwen";
    if (name.includes("deepseek")) return "deepseek";
    if (name.includes("yi-") || name.includes("lingyi")) return "yi";
    if (name.includes("mistral") || name.includes("mixtral")) return "mistral";
    if (name.includes("llama") || name.includes("llama3")) return "llama";

    return "other";
}

/**
 * 判断模型是否原生支持 function calling
 */
export function modelSupportsFunctionCalling(modelName: string): boolean {
    const family = detectModelFamily(modelName);

    // 这些模型家族原生支持 function calling
    const supportedFamilies: ModelFamily[] = ["gpt", "grok", "gemini", "glm", "qwen", "deepseek", "mistral"];

    if (supportedFamilies.includes(family)) return true;

    // Claude 模型较新版本支持 function calling
    if (family === "claude") {
        const name = modelName.toLowerCase();
        // Claude 3.5 及以上版本支持 function calling
        if (name.includes("3-5") || name.includes("3.5") || name.includes("opus-4") || name.includes("sonnet-4") || name.includes("haiku-4")) {
            return true;
        }
        // 旧版本可能不支持
        return false;
    }

    // Kimi 模型部分支持
    if (family === "kimi") {
        const name = modelName.toLowerCase();
        return name.includes("kimi-k2") || name.includes("moonshot-v1");
    }

    // 其他模型默认不支持
    return false;
}

/**
 * 获取模型的提示词策略
 * 对于不支持 function calling 的模型，需要更明确地要求返回 JSON
 */
export function getModelPromptStrategy(modelName: string): {
    useFunctionCalling: boolean;
    emphasizeJsonFormat: boolean;
    maxResponseTokens?: number;
} {
    const supportsFC = modelSupportsFunctionCalling(modelName);
    const family = detectModelFamily(modelName);

    return {
        useFunctionCalling: supportsFC,
        emphasizeJsonFormat: !supportsFC || family === "claude" || family === "kimi",
        maxResponseTokens: family === "claude" ? 8192 : undefined,
    };
}

/**
 * 从多种格式的响应中提取 function call 参数
 * 支持：
 * - OpenAI 标准 tool_calls 格式
 * - 旧版 function_call 格式
 * - tool_calls[].function.arguments 是对象的情况
 * - 多个 tool_calls 的情况
 * - 直接在 message 中返回 JSON 的情况
 */
export function extractFunctionCallArguments(
    payload: Record<string, unknown>,
    toolName?: string,
): string | null {
    const message = firstRecord(payload.choices)?.message as Record<string, unknown> | undefined;
    if (!message) return null;

    // 1. 标准 OpenAI tool_calls 格式
    const toolCalls = records(message.tool_calls);
    if (toolCalls.length > 0) {
        // 优先匹配名称
        const matchedCall = toolCalls.find((item) => {
            const funcName = record(item.function)?.name;
            return !toolName || funcName === toolName || !funcName;
        });

        const call = matchedCall || (toolCalls.length === 1 ? toolCalls[0] : undefined);
        if (call) {
            const args = record(call.function)?.arguments;
            if (typeof args === "string") {
                return args;
            }
            if (args && typeof args === "object") {
                try {
                    return JSON.stringify(args);
                } catch {
                    return null;
                }
            }
        }
    }

    // 2. 旧版 OpenAI function_call 格式
    const functionCall = record(message.function_call);
    if (functionCall) {
        const funcName = functionCall.name;
        if (!toolName || funcName === toolName || !funcName) {
            const args = functionCall.arguments;
            if (typeof args === "string") {
                return args;
            }
            if (args && typeof args === "object") {
                try {
                    return JSON.stringify(args);
                } catch {
                    return null;
                }
            }
        }
    }

    // 3. 有些中转站把 tool_calls 放在 message.tools 或 message.calls 中
    const alternativeCallArrays = [message.tools, message.calls, message.function_calls];
    for (const arr of alternativeCallArrays) {
        const calls = records(arr);
        if (calls.length > 0) {
            const call = calls.find((item) => {
                const funcName = record(item.function)?.name || item.name;
                return !toolName || funcName === toolName || !funcName;
            }) || (calls.length === 1 ? calls[0] : undefined);

            if (call) {
                const args = record(call.function)?.arguments || call.arguments || call.args;
                if (typeof args === "string") return args;
                if (args && typeof args === "object") {
                    try {
                        return JSON.stringify(args);
                    } catch {
                        return null;
                    }
                }
            }
        }
    }

    return null;
}

/**
 * 从流式响应的 delta 中累积 function call 参数
 */
export function accumulateStreamFunctionCall(
    delta: Record<string, unknown>,
    currentArguments: string,
    toolName?: string,
): string {
    // 标准 tool_calls 格式
    const toolCalls = records(delta.tool_calls);
    if (toolCalls.length > 0) {
        const call = toolCalls.find((item) => {
            const funcName = record(item.function)?.name;
            return !toolName || funcName === toolName || !funcName;
        }) || (toolCalls.length === 1 ? toolCalls[0] : undefined);

        if (call) {
            const args = record(call.function)?.arguments;
            if (typeof args === "string") {
                return currentArguments + args;
            }
        }
    }

    // 旧版 function_call 格式
    const functionCall = record(delta.function_call);
    if (functionCall) {
        const args = functionCall.arguments;
        if (typeof args === "string") {
            return currentArguments + args;
        }
    }

    return currentArguments;
}

// 辅助函数
function firstRecord(value: unknown): Record<string, unknown> | undefined {
    if (!Array.isArray(value) || value.length === 0) return undefined;
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : undefined;
}

function records(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => item && typeof item === "object");
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}
