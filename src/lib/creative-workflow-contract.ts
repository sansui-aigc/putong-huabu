/**
 * 创作工作流契约：模板 + 变量 + 渲染纯函数
 * 对齐开源 CreativeWorkflowWorkspace，适配本项目的服务器存储与 canvas 执行链路。
 */

export type WorkflowVariableType = "text" | "textarea" | "number" | "select" | "boolean";
export type WorkflowMode = "single_image" | "multi_image_series";
export type WorkflowScope = "private" | "public";

export type WorkflowVariable = {
    id: string;
    key: string;
    label: string;
    type: WorkflowVariableType;
    required: boolean;
    defaultValue: string;
    options: string[];
    placeholder?: string;
};

export type WorkflowSeriesConfig = {
    targetCount: string;
    promptInstruction: string;
    reviewRequired: boolean;
    concurrency: string;
};

export type CreativeWorkflow = {
    id: string;
    ownerUserId?: string;
    scope: WorkflowScope;
    editable: boolean;
    mode: WorkflowMode;
    name: string;
    category: string;
    description: string;
    variables: WorkflowVariable[];
    config: {
        model: string;
        imageModel: string;
        imageChannelId: string;
        quality: string;
        size: string;
        count: string;
        systemPrompt: string;
        promptTemplate: string;
        negativePrompt: string;
    };
    seriesConfig: WorkflowSeriesConfig;
    createdAt: number;
    updatedAt: number;
    lastRunAt?: number;
};

/** 用户工作流记录（服务端存储形态） */
export type CreativeWorkflowRecord = {
    id: string;
    ownerUserId?: string;
    scope: WorkflowScope;
    editable: boolean;
    name: string;
    category: string;
    description: string;
    data: Omit<CreativeWorkflow, "id" | "ownerUserId" | "scope" | "editable" | "name" | "category" | "description" | "createdAt" | "updatedAt" | "lastRunAt">;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
};

export const WORKFLOW_DEFAULT_COUNT = "1";
export const WORKFLOW_DEFAULT_SERIES_TARGET = "4";
export const WORKFLOW_DEFAULT_SERIES_CONCURRENCY = "3";

export function createWorkflowVariable(key = "", label = "", type: WorkflowVariableType = "text"): WorkflowVariable {
    return normalizeWorkflowVariable({ id: nanoidLike(), key, label, type, required: true, defaultValue: "", options: [] });
}

/** 渲染提示词模板：{{变量名}} 占位符替换 */
export function renderPromptTemplate(template: string, values: Record<string, string>) {
    return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key: string) => values[key] || "");
}

export function renderWorkflowPrompt(workflow: Pick<CreativeWorkflow, "variables" | "config">, values: Record<string, string>) {
    const formatted = Object.fromEntries(workflow.variables.map((variable) => [variable.key, formatWorkflowVariableValue(variable, values[variable.key])]));
    const prompt = renderPromptTemplate(workflow.config.promptTemplate, formatted).trim();
    const negativePrompt = (workflow.config.negativePrompt || "").trim();
    return negativePrompt ? `${prompt}\n\n避免：${negativePrompt}` : prompt;
}

export function formatWorkflowVariableValue(variable: WorkflowVariable, value: string | undefined) {
    const raw = value ?? variable.defaultValue ?? "";
    if (variable.type !== "boolean") return raw;
    return raw === "true" ? "开启" : "关闭";
}

export function createDefaultWorkflowInputValues(workflow: Pick<CreativeWorkflow, "variables">) {
    return Object.fromEntries(workflow.variables.map((variable) => [variable.key, variable.defaultValue || (variable.type === "boolean" ? "false" : "")]));
}

export function normalizeWorkflowVariable(variable: WorkflowVariable): WorkflowVariable {
    const key = variable.key.replace(/[^\w.-]/g, "_");
    return {
        ...variable,
        key,
        label: variable.label || key,
        defaultValue: variable.defaultValue == null ? "" : String(variable.defaultValue),
        options: Array.isArray(variable.options) ? variable.options : parseVariableOptions(String(variable.options || "")),
    };
}

export function normalizeWorkflow(workflow: CreativeWorkflow): CreativeWorkflow {
    return {
        ...workflow,
        scope: workflow.scope === "public" ? "public" : "private",
        editable: workflow.editable !== false,
        mode: workflow.mode === "multi_image_series" ? "multi_image_series" : "single_image",
        variables: (workflow.variables || []).map(normalizeWorkflowVariable),
        config: {
            model: workflow.config?.model || "",
            imageModel: workflow.config?.imageModel || "",
            imageChannelId: workflow.config?.imageChannelId || "",
            quality: workflow.config?.quality || "",
            size: workflow.config?.size || "",
            count: workflow.config?.count || WORKFLOW_DEFAULT_COUNT,
            systemPrompt: workflow.config?.systemPrompt || "",
            promptTemplate: workflow.config?.promptTemplate || "",
            negativePrompt: workflow.config?.negativePrompt || "",
        },
        seriesConfig: {
            targetCount: workflow.seriesConfig?.targetCount || WORKFLOW_DEFAULT_SERIES_TARGET,
            promptInstruction: workflow.seriesConfig?.promptInstruction || "",
            reviewRequired: workflow.seriesConfig?.reviewRequired !== false,
            concurrency: workflow.seriesConfig?.concurrency || WORKFLOW_DEFAULT_SERIES_CONCURRENCY,
        },
        createdAt: workflow.createdAt || Date.now(),
        updatedAt: workflow.updatedAt || Date.now(),
    };
}

/** 校验变量值是否满足必填约束，返回缺失项 label 列表 */
export function validateWorkflowInputs(workflow: Pick<CreativeWorkflow, "variables">, values: Record<string, string>) {
    return workflow.variables.filter((variable) => variable.required && !String(values[variable.key] ?? variable.defaultValue ?? "").trim()).map((variable) => variable.label);
}

function parseVariableOptions(text: string) {
    return text
        .split(/[\/\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function nanoidLike() {
    return `var-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 内置公开模板：电商海报 */
export function createStarterWorkflow(): CreativeWorkflow {
    const now = Date.now();
    return normalizeWorkflow({
        id: "starter-ecommerce-poster",
        scope: "public",
        editable: true,
        mode: "single_image",
        name: "电商海报生成",
        category: "电商海报",
        description: "固定海报构图、商业摄影质感和营销文案结构，只替换产品与卖点。",
        variables: [
            createWorkflowVariable("product_name", "产品名称"),
            createWorkflowVariable("selling_points", "核心卖点", "textarea"),
            createWorkflowVariable("campaign", "活动信息"),
        ],
        config: {
            model: "",
            imageModel: "",
            imageChannelId: "",
            quality: "",
            size: "",
            count: WORKFLOW_DEFAULT_COUNT,
            systemPrompt: "",
            promptTemplate: "为 {{product_name}} 生成一张高端电商海报。\n核心卖点：{{selling_points}}\n活动信息：{{campaign}}\n要求：主体清晰、构图高级、商品有强烈质感，画面适合社交媒体和电商首图。",
            negativePrompt: "",
        },
        seriesConfig: { targetCount: WORKFLOW_DEFAULT_SERIES_TARGET, promptInstruction: "", reviewRequired: true, concurrency: WORKFLOW_DEFAULT_SERIES_CONCURRENCY },
        createdAt: now,
        updatedAt: now,
    });
}

/** 内置公开模板：小红书文章配图组（多图系列） */
export function createStarterSeriesWorkflow(): CreativeWorkflow {
    const now = Date.now();
    return normalizeWorkflow({
        id: "starter-xhs-article-series",
        scope: "public",
        editable: true,
        mode: "multi_image_series",
        name: "小红书文章配图组",
        category: "多图创作",
        description: "根据文章主题和内容生成多张风格统一的封面、步骤、要点和总结配图。",
        variables: [
            createWorkflowVariable("article_topic", "文章主题"),
            createWorkflowVariable("article_content", "文章内容", "textarea"),
            createWorkflowVariable("visual_style", "视觉风格"),
        ],
        config: {
            model: "",
            imageModel: "",
            imageChannelId: "",
            quality: "",
            size: "",
            count: WORKFLOW_DEFAULT_COUNT,
            systemPrompt: "",
            promptTemplate: "为小红书/公众号文章《{{article_topic}}》生成系列配图。\n文章内容：{{article_content}}\n视觉风格：{{visual_style}}\n要求：画面适合移动端阅读，主题连贯，每张图表达一个清晰信息点。",
            negativePrompt: "",
        },
        seriesConfig: {
            targetCount: "6",
            promptInstruction: "拆成封面图、问题/痛点图、核心步骤图、细节说明图、对比/案例图和总结图；每张图都需要独立完整的图片提示词。",
            reviewRequired: true,
            concurrency: "3",
        },
        createdAt: now,
        updatedAt: now,
    });
}

export function createStarterWorkflows() {
    return [createStarterWorkflow(), createStarterSeriesWorkflow()];
}
