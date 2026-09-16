import { jsonrepair } from "jsonrepair";

export function strictJsonObjectText(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() || "";
    return parseObjectText(text) || parseObjectText(fenced);
}

export function extractJsonObjectText(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.trim();

    // 1. 首先尝试严格解析
    const strict = strictJsonObjectText(text);
    if (strict) return strict;

    // 2. 遍历文本，找到第一个 "{"，然后尝试匹配对应的 "}"
    for (let start = 0; start < text.length; start += 1) {
        if (text[start] !== "{") continue;
        let depth = 0;
        let escaped = false;
        let inString = false;
        for (let index = start; index < text.length; index += 1) {
            const character = text[index];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (character === "\\" && inString) {
                escaped = true;
                continue;
            }
            if (character === '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;
            if (character === "{") depth += 1;
            if (character !== "}") continue;
            depth -= 1;
            if (depth !== 0) continue;
            const candidate = text.slice(start, index + 1);
            // 尝试直接解析
            const parsed = parseObjectText(candidate);
            if (parsed) return parsed;
            // 尝试用 jsonrepair 修复
            const repaired = repairObjectText(candidate);
            if (repaired) return repaired;
            // 尝试宽松解析（支持单引号、未加引号的键名等）
            const looseParsed = looseParseObjectText(candidate);
            if (looseParsed) return looseParsed;
            break;
        }
    }

    // 3. 再次尝试用 jsonrepair 修复从第一个 "{" 开始的所有文本
    for (let start = 0; start < text.length; start += 1) {
        if (text[start] !== "{") continue;
        const repaired = repairObjectText(text.slice(start));
        if (repaired) return repaired;
        // 尝试宽松解析
        const looseParsed = looseParseObjectText(text.slice(start));
        if (looseParsed) return looseParsed;
        break;
    }

    // 4. 尝试从文本中提取可能的 JSON 片段（即使不是以 "{" 开头）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        const matched = jsonMatch[0];
        const parsed = parseObjectText(matched);
        if (parsed) return parsed;
        const repaired = repairObjectText(matched);
        if (repaired) return repaired;
        const looseParsed = looseParseObjectText(matched);
        if (looseParsed) return looseParsed;
    }

    return "";
}

/**
 * 宽松的 JSON 对象解析
 * 支持：
 * - 单引号字符串
 * - 未加引号的键名
 * - 尾逗号
 * - 注释（// 和 /* *\/）
 */
function looseParseObjectText(value: string): string {
    if (!value.startsWith("{")) return "";
    try {
        // 移除注释
        let cleaned = value
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\n]*/g, "");

        // 替换单引号为双引号（简单处理，不处理嵌套）
        cleaned = cleaned.replace(/'/g, '"');

        // 为未加引号的键名添加双引号
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

        // 移除尾逗号
        cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");

        const parsed = JSON.parse(cleaned);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? JSON.stringify(parsed) : "";
    } catch {
        return "";
    }
}

function parseObjectText(value: string) {
    if (!value.startsWith("{") || !value.endsWith("}")) return "";
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? value : "";
    } catch {
        return "";
    }
}

function repairObjectText(value: string) {
    if (!value.startsWith("{")) return "";
    try {
        const repaired = jsonrepair(value);
        const parsed = JSON.parse(repaired);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? repaired : "";
    } catch {
        return "";
    }
}
