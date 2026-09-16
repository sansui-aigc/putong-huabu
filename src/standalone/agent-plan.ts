type AgentOperation = { type: string; nodeType?: string; prompt?: string; metadata?: { count?: number; prompt?: string; nodeType?: string }; [key: string]: unknown };
export type AgentPlan = { reply?: string; ops?: AgentOperation[]; [key: string]: unknown };

export function parseAgentPlan(raw: unknown): AgentPlan {
    const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map(item => item?.text || "").join("") : "";
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const value = JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Agent 未返回操作对象");
    return value;
}

export function requestedImageCount(prompt: string, hasReferences: boolean) {
    // 如果用户明确说不要生成图片，返回0
    if (/不要(?:生图|生成|绘制)|不(?:要|用|需要)生成|只(?:要|写|需).*提示词/.test(prompt) && !/并(?:且)?生成/.test(prompt)) return 0;

    // 中文数字映射
    const digits: Record<string, number> = {
        一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
        六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
        十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15,
        十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20,
    };

    // 解析数字字符串（支持阿拉伯数字和中文数字）
    const parseNumber = (str: string): number => {
        if (!str) return 0;
        const trimmed = str.trim();
        // 阿拉伯数字
        const num = Number(trimmed);
        if (Number.isFinite(num) && num > 0) return num;
        // 中文数字
        if (digits[trimmed]) return digits[trimmed];
        return 0;
    };

    // 【策略1】优先匹配"数字+张/幅/个/组/套"的组合（最准确）
    // 例如："9张"、"三张"、"3幅"、"一组"、"两套"
    const countPattern = /([1-9]\d?|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十|[一二两三四五六七八九十])\s*(?:张|幅|个|组|套|款|种|样)/g;
    let bestMatch = 0;
    let match;
    while ((match = countPattern.exec(prompt)) !== null) {
        const count = parseNumber(match[1]);
        if (count > 0) {
            // 取最后一个匹配（通常是用户最明确的数量要求）
            bestMatch = count;
        }
    }
    if (bestMatch > 0) {
        // 检查是否是图片相关的请求
        if (/图[片像]?|写真|海报|插画|主图|详情|电商|商品|产品/.test(prompt) || hasReferences) {
            return Math.min(16, bestMatch);
        }
    }

    // 【策略2】匹配"生成/生图/绘制/画/制作 + 数字 + 张/幅/个"
    const generatePattern = /(?:生成|生图|绘制|画|制作|出|做)\s*([1-9]\d?|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十|[一二两三四五六七八九十])?\s*(?:张|幅|个|组|套|款)/;
    const generateMatch = prompt.match(generatePattern);
    if (generateMatch && generateMatch[1]) {
        const count = parseNumber(generateMatch[1]);
        if (count > 0 && (/图[片像]?|写真|海报|插画|主图|详情|电商|商品|产品/.test(prompt) || hasReferences)) {
            return Math.min(16, count);
        }
    }

    // 【策略3】如果有"生成/生图/绘制"等关键词，并且有图片相关的词，默认返回1
    if (/(?:生成|生图|绘制|画|制作|出|做).*(?:图[片像]?|写真|海报|插画|主图|详情|电商|商品|产品)/.test(prompt) ||
        (/(?:图[片像]?|写真|海报|插画|主图|详情|电商|商品|产品)/.test(prompt) && /(?:生成|生图|绘制|画|制作|出|做)/.test(prompt))) {
        return 1;
    }

    // 【策略4】如果有参考图，并且有"张/幅"等词，默认返回1
    if (hasReferences && /张|幅|个|组|套/.test(prompt) && /(?:生成|生图|绘制|画|制作|出|做|图)/.test(prompt)) {
        return 1;
    }

    return 0;
}

/**
 * 【多模型兼容】判断一个操作是否是图片节点
 * 支持多种格式：
 * - op.nodeType === "image" / "panorama"
 * - op.metadata.nodeType === "image" / "panorama"
 * - op.type === "image" / "panorama"（一些模型的格式）
 * - nodeType 的变体："img"、"picture"、"photo"、"image-generation" 等
 */
function isImageNode(op: AgentOperation): boolean {
    if (!op || typeof op !== "object") return false;

    // 支持的图片节点类型
    const imageNodeTypes = new Set(["image", "panorama", "img", "picture", "photo", "image-generation", "image_generation", "生成图片"]);

    // 1. 标准格式：op.nodeType
    const nodeType = String(op.nodeType || "").toLowerCase().trim();
    if (imageNodeTypes.has(nodeType)) return true;

    // 2. metadata.nodeType 格式
    const metadataNodeType = String(op.metadata?.nodeType || "").toLowerCase().trim();
    if (imageNodeTypes.has(metadataNodeType)) return true;

    // 3. op.type 直接是 image（一些模型的非标准格式）
    const opType = String(op.type || "").toLowerCase().trim();
    if (imageNodeTypes.has(opType)) return true;

    // 4. 有 metadata.prompt 且 op.type 是 add_node（可能是图片节点）
    if (op.type === "add_node" && op.metadata?.prompt && !op.metadata?.content) return true;

    return false;
}

/**
 * 【多模型兼容】获取图片节点的数量
 */
function getImageNodeCount(op: AgentOperation): number {
    const count = Number(op.metadata?.count || op.count || 1);
    return Math.max(1, Number.isFinite(count) ? count : 1);
}

/**
 * 【多模型兼容】获取图片节点的 prompt
 */
function getImageNodePrompt(op: AgentOperation): string {
    return String(op.metadata?.prompt || op.prompt || op.metadata?.content || "").trim();
}

export function canvasPlanError(plan: AgentPlan, prompt: string, hasReferences: boolean) {
    if (!Array.isArray(plan.ops)) return "缺少 ops 数组";
    const validTypes = new Set(["add_node", "connect_nodes", "update_node", "delete_node", "delete_connections", "clear_canvas", "select_nodes", "set_viewport", "run_generation", "image", "panorama", "img", "picture", "photo"]);
    // 放宽操作类型校验：如果 op.type 不在 validTypes 中，但 op.nodeType 是有效的，也认为是有效的
    const hasInvalidOp = plan.ops.some(op => {
        if (!op) return true;
        if (validTypes.has(op.type)) return false;
        // 如果 op.type 不是标准类型，但 op.nodeType 是图片/文本/视频/音频等类型，也认为有效
        const nodeType = String(op.nodeType || op.metadata?.nodeType || "").toLowerCase();
        return !["image", "panorama", "text", "video", "audio", "config", "task", "brief", "brand-kit", "img", "picture", "photo"].includes(nodeType);
    });
    if (hasInvalidOp) return "包含未支持的操作类型";

    // 【多模型兼容】使用更宽容的图片节点过滤逻辑
    const images = plan.ops.filter(isImageNode);
    const count = requestedImageCount(prompt, hasReferences);
    const outputCount = images.reduce((sum, op) => sum + getImageNodeCount(op), 0);

    // 【多模型兼容】放宽数量匹配逻辑
    // 如果用户要求了图片数量，但是模型返回的 image 节点数量不匹配：
    // 1. 如果模型返回了 image 节点，但是数量少于要求，可以认为是部分完成，不报错
    // 2. 如果模型返回了 image 节点，但是数量多于要求，也可以接受
    // 3. 只有当用户明确要求了图片数量，但是模型完全没有返回 image 节点时，才报错
    if (count > 0 && images.length === 0) {
        return `用户要求 ${count} 张图片，必须创建对应数量的 image 节点，每个节点 metadata.count=1`;
    }

    // 检查图片节点是否有完整的 prompt
    const imagesWithoutPrompt = images.filter(op => !getImageNodePrompt(op));
    if (imagesWithoutPrompt.length > 0) return "图片节点缺少完整的 metadata.prompt";

    return "";
}
