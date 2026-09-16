import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ files: new Map<string, unknown>() }));

vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(mocks.files.has(name) ? mocks.files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => mocks.files.set(name, structuredClone(value))),
    withJsonDataFileLock: vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback()),
}));

import { createStarterWorkflows } from "@/lib/creative-workflow-contract";
import { deleteCreativeWorkflow, forkCreativeWorkflow, listCreativeWorkflows, saveCreativeWorkflow } from "./creative-workflow-store";

describe("creative workflow store", () => {
    beforeEach(() => {
        mocks.files.clear();
    });

    it("saves and lists private workflows per user", async () => {
        const [starter] = createStarterWorkflows();
        const saved = await saveCreativeWorkflow("user-one", { ...starter, id: "wf-1", scope: "private", editable: true, name: "我的模板" });
        expect(saved.ownerUserId).toBe("user-one");
        const [other] = createStarterWorkflows();
        const otherSaved = await saveCreativeWorkflow("user-two", { ...other, id: "wf-2", scope: "private", editable: true, name: "别人模板" });
        expect(otherSaved.ownerUserId).toBe("user-two");

        const mine = await listCreativeWorkflows("user-one");
        expect(mine.some((item) => item.id === "wf-1" && item.name === "我的模板")).toBe(true);
        expect(mine.some((item) => item.id === "wf-2")).toBe(false);
    });

    it("exposes builtin public templates and allows fork", async () => {
        const workflows = await listCreativeWorkflows("user-one");
        expect(workflows.some((item) => item.name === "电商海报生成")).toBe(true);
        expect(workflows.some((item) => item.name === "小红书文章配图组")).toBe(true);

        const publicWorkflow = workflows.find((item) => item.name === "电商海报生成");
        const fork = await forkCreativeWorkflow("user-one", publicWorkflow!.id);
        expect(fork.scope).toBe("private");
        expect(fork.editable).toBe(true);
        expect(fork.name).toContain("副本");
    });

    it("deletes only user-owned workflows", async () => {
        const [starter] = createStarterWorkflows();
        await saveCreativeWorkflow("user-one", { ...starter, id: "wf-del", scope: "private", editable: true, name: "删除我" });
        await deleteCreativeWorkflow("user-one", "wf-del");
        const mine = await listCreativeWorkflows("user-one");
        expect(mine.some((item) => item.id === "wf-del")).toBe(false);
    });
});
