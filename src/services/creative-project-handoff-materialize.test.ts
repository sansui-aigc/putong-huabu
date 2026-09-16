import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreativeAsset, CreativeProjectHandoff } from "@/lib/creative-runtime-contract";

const mocks = vi.hoisted(() => {
    const canvasProjects: Array<{ id: string; sourceHandoffId?: string }> = [];
    const canvasState = {
        hydrated: true,
        summaries: canvasProjects,
        projects: canvasProjects,
        hydrate: vi.fn(async () => undefined),
        importProject: vi.fn(async (_project: unknown, sourceHandoffId?: string) => {
            const id = `canvas-${canvasProjects.length + 1}`;
            canvasProjects.push({ id, sourceHandoffId });
            return id;
        }),
    };
    return {
        canvasProjects,
        canvasState,
    };
});

vi.mock("@/app/(user)/canvas/stores/use-canvas-store", () => ({
    useCanvasStore: { getState: () => mocks.canvasState },
}));

import { getMaterializedCreativeProject, materializeCreativeProjectHandoff } from "./creative-project-handoff";

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

function handoff(surface: CreativeProjectHandoff["surface"], assets: CreativeAsset[] = []): CreativeProjectHandoff {
    return {
        id: `handoff-${surface}`,
        sourceRunId: `run-${surface}`,
        conversationId: "conversation-one",
        surface,
        title: "品牌画布",
        summary: "由创作 Agent 交接",
        style: "写实电影感",
        ratio: "16:9",
        assetIds: assets.map((item) => item.id),
        assets,
    };
}

describe("创作项目交接落地", () => {
    beforeEach(() => {
        mocks.canvasProjects.splice(0);
        mocks.canvasState.importProject.mockClear();
        mocks.canvasState.hydrate.mockClear();
    });

    it("deduplicates concurrent and replayed canvas handoffs", async () => {
        const value = handoff("canvas", [asset({ id: "image-one", type: "image", title: "主视觉", serverUrl: "/assets/image-one" })]);
        const first = materializeCreativeProjectHandoff(value);
        const second = materializeCreativeProjectHandoff(value);

        expect(first).toBe(second);
        const [created, replayed] = await Promise.all([first, second]);
        expect(replayed).toEqual(created);
        expect(mocks.canvasState.importProject).toHaveBeenCalledTimes(1);
        expect(await getMaterializedCreativeProject(value)).toEqual(created);
        expect(await materializeCreativeProjectHandoff(value)).toEqual(created);
        expect(mocks.canvasState.importProject).toHaveBeenCalledTimes(1);
    });

    it("creates one canvas project from a handed-off handoff", async () => {
        const value = handoff("canvas", [asset({ id: "text-one", type: "text", title: "第一幕", textContent: "女主走进雨夜车站。" })]);
        const created = await materializeCreativeProjectHandoff(value);

        expect(created).toMatchObject({ surface: "canvas", projectId: "canvas-1", href: "/canvas/canvas-1" });
        expect(mocks.canvasState.importProject).toHaveBeenCalledTimes(1);
        expect(mocks.canvasState.importProject).toHaveBeenCalledWith(expect.objectContaining({ title: "品牌画布" }), "handoff-canvas");
    });
});
