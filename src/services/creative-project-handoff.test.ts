import { describe, expect, it } from "vitest";

import { CanvasNodeType } from "@/app/(user)/canvas/types";
import type { CreativeAsset, CreativeProjectHandoff } from "@/lib/creative-runtime-contract";
import { buildCanvasHandoffNodes } from "./creative-project-handoff";

function asset(input: Partial<CreativeAsset> & Pick<CreativeAsset, "id" | "type" | "title">): CreativeAsset {
    return {
        userId: "user-one",
        conversationId: "conversation-one",
        ordinal: 0,
        status: "ready",
        metadata: {},
        createdAt: 1,
        updatedAt: 1,
        ...input,
    };
}

function handoff(assets: CreativeAsset[], surface: CreativeProjectHandoff["surface"] = "canvas"): CreativeProjectHandoff {
    return {
        id: "handoff-run-one",
        sourceRunId: "run-one",
        conversationId: "conversation-one",
        surface,
        title: "城市夜行",
        summary: "一部发生在雨夜城市的悬疑视觉企划",
        style: "写实电影感",
        ratio: "16:9",
        assetIds: assets.map((item) => item.id),
        assets,
    };
}

describe("创作项目交接转换", () => {
    it("converts stable text and media assets into canvas nodes without changing image ratio", () => {
        const nodes = buildCanvasHandoffNodes(
            handoff([asset({ id: "image-one", type: "image", title: "主视觉", serverUrl: "/api/assets/image-one", width: 1600, height: 800 }), asset({ id: "text-one", type: "text", title: "故事梗概", textContent: "雨夜里，女主收到一封来自未来的信。" })]),
        );

        expect(nodes).toHaveLength(3);
        expect(nodes[0]).toMatchObject({ type: CanvasNodeType.Brief, title: "城市夜行", metadata: { agentRunId: "run-one" } });
        expect(nodes[1]).toMatchObject({ type: CanvasNodeType.Image, width: 360, height: 180, metadata: { content: "/api/assets/image-one", status: "success" } });
        expect(nodes[2]).toMatchObject({ type: CanvasNodeType.Text, metadata: { content: "雨夜里，女主收到一封来自未来的信。", status: "success" } });
    });
});
