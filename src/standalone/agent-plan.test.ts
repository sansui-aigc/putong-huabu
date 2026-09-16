import { describe, expect, it } from "vitest";
import { canvasPlanError, parseAgentPlan, requestedImageCount } from "./agent-plan";

describe("Agent Skill execution plan", () => {
    it("rejects a claimed generation with no real operations", () => {
        expect(canvasPlanError({ reply: "已生成两张写真", ops: [] }, "生成2张", true)).toContain("2 张");
    });
    it("accepts actual image operations and checks each full prompt", () => {
        const ops = [1, 2].map(i => ({ type: "add_node", nodeType: "image", metadata: { count: 1, prompt: `写真 ${i}` } }));
        expect(canvasPlanError({ ops }, "生成2张", true)).toBe("");
        expect(canvasPlanError({ ops: [{ ...ops[0], metadata: {} }] }, "生成写真", true)).toContain("prompt");
    });
    it("does not interpret prompt writing as image generation", () => {
        expect(requestedImageCount("只写3张图片的提示词，不要生成图片", true)).toBe(0);
        expect(requestedImageCount("写写真提示词并生成三张图像", true)).toBe(3);
    });
    it("parses fenced JSON without inventing operations from plain replies", () => {
        expect(parseAgentPlan('```json\n{"reply":"好","ops":[]}\n```')).toEqual({ reply: "好", ops: [] });
        expect(() => parseAgentPlan("已生成图片")).toThrow();
        expect(canvasPlanError({ ops: [{ type: "image" }] }, "生成图片", false)).toContain("类型");
    });
});
