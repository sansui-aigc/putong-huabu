import { describe, expect, it } from "vitest";

import { createDefaultWorkflowInputValues, createStarterWorkflows, createWorkflowVariable, renderPromptTemplate, renderWorkflowPrompt, validateWorkflowInputs } from "./creative-workflow-contract";

describe("creative workflow contract", () => {
    it("renders prompt template with {{variable}} placeholders", () => {
        expect(renderPromptTemplate("为 {{product_name}} 生成海报。卖点：{{selling_points}}", { product_name: "保温杯", selling_points: "长效保温" })).toBe("为 保温杯 生成海报。卖点：长效保温");
        expect(renderPromptTemplate("未知变量：{{missing}}", {})).toBe("未知变量：");
    });

    it("renders full workflow prompt with boolean formatting and negative prompt", () => {
        const workflow = createStarterWorkflows()[0];
        workflow.config.negativePrompt = "模糊、低清";
        const prompt = renderWorkflowPrompt(workflow, { product_name: "咖啡机", selling_points: "一键萃取", campaign: "双十一" });
        expect(prompt).toContain("咖啡机");
        expect(prompt).toContain("一键萃取");
        expect(prompt).toContain("双十一");
        expect(prompt).toContain("避免：模糊、低清");
    });

    it("creates default input values from variables", () => {
        const workflow = createStarterWorkflows()[1];
        const values = createDefaultWorkflowInputValues(workflow);
        expect(Object.keys(values)).toEqual(workflow.variables.map((item) => item.key));
    });

    it("validates required variables", () => {
        const workflow = createStarterWorkflows()[0];
        expect(validateWorkflowInputs(workflow, {})).toEqual(["产品名称", "核心卖点", "活动信息"]);
        expect(validateWorkflowInputs(workflow, { product_name: "A", selling_points: "B", campaign: "C" })).toEqual([]);
    });

    it("normalizes variables and starter workflows", () => {
        const workflow = createStarterWorkflows()[0];
        expect(workflow.scope).toBe("public");
        expect(workflow.editable).toBe(true);
        expect(workflow.mode).toBe("single_image");
        expect(workflow.variables[0].key).toBe("product_name");
        const series = createStarterWorkflows()[1];
        expect(series.mode).toBe("multi_image_series");
        expect(series.seriesConfig.targetCount).toBe("6");
    });

    it("sanitizes variable keys", () => {
        const variable = createWorkflowVariable("product name!", "产品名");
        expect(variable.key).toBe("product_name_");
    });
});
