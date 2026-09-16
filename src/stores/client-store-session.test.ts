import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasProject, CanvasProjectSummary } from "@/lib/canvas-project-contract";
import { summarizeCanvasProjectRecord } from "@/lib/canvas-project-summary";
import type { Asset } from "@/lib/library-asset-contract";

const mocks = vi.hoisted(() => ({
    listAssets: vi.fn(),
    createAsset: vi.fn(),
    saveAsset: vi.fn(),
    deleteAsset: vi.fn(),
    uploadImage: vi.fn(),
    uploadMediaFile: vi.fn(),
    listCanvasProjectSummaries: vi.fn(),
    getCanvasProject: vi.fn(),
    createCanvasProject: vi.fn(),
    saveCanvasProjectMutation: vi.fn(),
    deleteCanvasProjects: vi.fn(),
}));

vi.mock("@/services/api/library-assets", () => ({
    listLibraryAssets: mocks.listAssets,
    createLibraryAsset: mocks.createAsset,
    saveLibraryAsset: mocks.saveAsset,
    deleteLibraryAsset: mocks.deleteAsset,
}));
vi.mock("@/services/image-storage", () => ({ uploadImage: mocks.uploadImage }));
vi.mock("@/services/file-storage", () => ({ uploadMediaFile: mocks.uploadMediaFile }));
vi.mock("@/services/api/canvas-projects", () => ({
    CanvasProjectRequestError: class extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    listCanvasProjectSummaries: mocks.listCanvasProjectSummaries,
    getCanvasProject: mocks.getCanvasProject,
    createCanvasProject: mocks.createCanvasProject,
    saveCanvasProjectMutation: mocks.saveCanvasProjectMutation,
    deleteCanvasProjects: mocks.deleteCanvasProjects,
}));

import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { CanvasProjectRequestError } from "@/services/api/canvas-projects";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";

describe("client store session isolation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useUserStore.getState().setUser(null);
        useAssetStore.getState().reset();
        useCanvasStore.getState().reset();
    });

    it("reloads assets after a reset instead of reusing the previous user's request", async () => {
        const oldRequest = deferred<Asset[]>();
        const freshAssets = [textAsset("asset-b", "用户 B 素材")];
        mocks.listAssets.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(freshAssets);

        useUserStore.getState().setUser(user("user-a"));
        const oldHydrate = useAssetStore.getState().hydrate();
        useAssetStore.getState().reset();
        useUserStore.getState().setUser(user("user-b"));
        const freshHydrate = useAssetStore.getState().hydrate();

        oldRequest.resolve([textAsset("asset-a", "用户 A 素材")]);
        await Promise.all([oldHydrate, freshHydrate]);

        expect(mocks.listAssets).toHaveBeenCalledTimes(2);
        expect(useAssetStore.getState().assets).toEqual(freshAssets);
    });

    it("refreshes hydrated assets when a picker requests the latest server state", async () => {
        const initialAssets = [textAsset("asset-old", "旧素材")];
        const freshAssets = [textAsset("asset-new", "新素材")];
        mocks.listAssets.mockResolvedValueOnce(initialAssets).mockResolvedValueOnce(freshAssets);
        useUserStore.getState().setUser(user("user-a"));

        await useAssetStore.getState().hydrate();
        await useAssetStore.getState().hydrate(true);

        expect(mocks.listAssets).toHaveBeenCalledTimes(2);
        expect(useAssetStore.getState().assets).toEqual(freshAssets);
    });

    it("reloads Canvas projects for the new user after a reset", async () => {
        const oldRequest = deferred<{ projects: CanvasProjectSummary[]; total: number; page: number; pageSize: number }>();
        const freshProjects = [summarizeCanvasProjectRecord(canvasProject("canvas-b", "用户 B 画布"))];
        mocks.listCanvasProjectSummaries.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce({ projects: freshProjects, total: 1, page: 1, pageSize: 12 });

        useUserStore.getState().setUser(user("user-a"));
        const oldHydrate = useCanvasStore.getState().hydrate();
        useCanvasStore.getState().reset();
        useUserStore.getState().setUser(user("user-b"));
        const freshHydrate = useCanvasStore.getState().hydrate();

        oldRequest.resolve({ projects: [summarizeCanvasProjectRecord(canvasProject("canvas-a", "用户 A 画布"))], total: 1, page: 1, pageSize: 12 });
        await Promise.all([oldHydrate, freshHydrate]);

        expect(mocks.listCanvasProjectSummaries).toHaveBeenCalledTimes(2);
        expect(useCanvasStore.getState().summaries).toEqual(freshProjects);
        expect(useCanvasStore.getState().summaryTotal).toBe(1);
        expect(useCanvasStore.getState().projects).toEqual([]);
    });

    it("loads only the requested Canvas detail and ignores a previous user's late response", async () => {
        const oldRequest = deferred<CanvasProject>();
        const freshProject = canvasProject("canvas-shared", "用户 B 画布");
        mocks.getCanvasProject.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(freshProject);

        useUserStore.getState().setUser(user("user-a"));
        const oldLoad = useCanvasStore.getState().loadProject("canvas-shared");
        useCanvasStore.getState().reset();
        useUserStore.getState().setUser(user("user-b"));
        const freshLoad = useCanvasStore.getState().loadProject("canvas-shared");

        oldRequest.resolve(canvasProject("canvas-shared", "用户 A 画布"));
        await Promise.allSettled([oldLoad, freshLoad]);

        expect(useCanvasStore.getState().projects).toEqual([freshProject]);
        expect(useCanvasStore.getState().summaries).toEqual([summarizeCanvasProjectRecord(freshProject)]);
    });

    it("forces a fresh Canvas detail and ignores the older overlapping response", async () => {
        const staleRequest = deferred<CanvasProject>();
        const freshProject = canvasProject("canvas-shared", "服务端最新画布");
        mocks.getCanvasProject.mockReturnValueOnce(staleRequest.promise).mockResolvedValueOnce(freshProject);
        useUserStore.getState().setUser(user("user-a"));

        const staleLoad = useCanvasStore.getState().loadProject("canvas-shared");
        const freshLoad = useCanvasStore.getState().loadProject("canvas-shared", true);
        staleRequest.resolve(canvasProject("canvas-shared", "旧缓存画布"));
        await Promise.all([staleLoad, freshLoad]);

        expect(mocks.getCanvasProject).toHaveBeenCalledTimes(2);
        expect(useCanvasStore.getState().projects).toEqual([freshProject]);
    });

    it("clamps a stale Canvas page to the last available server page", async () => {
        const firstPage = [summarizeCanvasProjectRecord(canvasProject("canvas-a", "画布一"))];
        mocks.listCanvasProjectSummaries.mockResolvedValueOnce({ projects: [], total: 1, page: 2, pageSize: 12 }).mockResolvedValueOnce({ projects: firstPage, total: 1, page: 1, pageSize: 12 });
        useUserStore.getState().setUser(user("user-a"));

        await useCanvasStore.getState().hydrate(true, 2);

        expect(mocks.listCanvasProjectSummaries).toHaveBeenNthCalledWith(1, { page: 2, pageSize: 12 });
        expect(mocks.listCanvasProjectSummaries).toHaveBeenNthCalledWith(2, { page: 1, pageSize: 12 });
        expect(useCanvasStore.getState()).toMatchObject({ summaries: firstPage, summaryPage: 1, summaryTotal: 1 });
    });

    it("keeps a newly created Canvas off a later summary page", async () => {
        const secondPage = [summarizeCanvasProjectRecord(canvasProject("canvas-old", "第二页画布"))];
        const created = canvasProject("canvas-new", "新画布");
        mocks.listCanvasProjectSummaries.mockResolvedValue({ projects: secondPage, total: 13, page: 2, pageSize: 12 });
        mocks.createCanvasProject.mockResolvedValue(created);
        useUserStore.getState().setUser(user("user-a"));

        await useCanvasStore.getState().hydrate(true, 2);
        await useCanvasStore.getState().createProject("新画布");

        expect(useCanvasStore.getState().summaries).toEqual(secondPage);
        expect(useCanvasStore.getState().summaryTotal).toBe(14);
        expect(useCanvasStore.getState().projects).toContainEqual(created);
    });

    it("coalesces rapid Canvas edits and exposes a non-blocking save state", async () => {
        vi.useFakeTimers();
        try {
            const project = canvasProject("canvas-save", "保存队列");
            useUserStore.getState().setUser(user("user-a"));
            mocks.getCanvasProject.mockResolvedValue(project);
            mocks.saveCanvasProjectMutation.mockResolvedValue({ projectId: project.id, updatedAt: "2026-08-05T12:00:00.000Z", mutationId: "mutation-one" });
            await useCanvasStore.getState().loadProject(project.id);

            useCanvasStore.getState().updateProject(project.id, { backgroundMode: "dots" });
            useCanvasStore.getState().updateProject(project.id, { backgroundMode: "blank" });

            expect(useCanvasStore.getState().saveStateByProject[project.id]).toEqual({ status: "saving" });
            await vi.advanceTimersByTimeAsync(250);

            expect(mocks.saveCanvasProjectMutation).toHaveBeenCalledTimes(1);
            expect(mocks.saveCanvasProjectMutation).toHaveBeenCalledWith(project.id, expect.objectContaining({ baseUpdatedAt: project.updatedAt, backgroundMode: "blank", mutationId: expect.any(String) }));
            expect(useCanvasStore.getState().saveStateByProject[project.id]).toEqual({ status: "saved" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps a failed Canvas snapshot available for an automatic retry", async () => {
        vi.useFakeTimers();
        try {
            const project = canvasProject("canvas-retry", "失败重试");
            useUserStore.getState().setUser(user("user-a"));
            mocks.getCanvasProject.mockResolvedValue(project);
            mocks.saveCanvasProjectMutation.mockRejectedValueOnce(new Error("网络暂时不可用")).mockResolvedValueOnce({ projectId: project.id, updatedAt: "2026-08-05T12:00:01.000Z", mutationId: "mutation-two" });
            await useCanvasStore.getState().loadProject(project.id);

            useCanvasStore.getState().updateProject(project.id, { showImageInfo: true });
            await vi.advanceTimersByTimeAsync(250);

            expect(useCanvasStore.getState().projects[0]).toMatchObject({ id: project.id, showImageInfo: true });
            expect(useCanvasStore.getState().saveStateByProject[project.id]).toEqual({ status: "saving", message: "网络波动，正在重新保存" });
            await vi.advanceTimersByTimeAsync(1_000);

            expect(mocks.saveCanvasProjectMutation).toHaveBeenCalledTimes(2);
            expect(useCanvasStore.getState().saveStateByProject[project.id]).toEqual({ status: "saved" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("replays the failed Canvas mutation before saving newer edits", async () => {
        vi.useFakeTimers();
        try {
            const project = canvasProject("canvas-retry-order", "重试顺序");
            useUserStore.getState().setUser(user("user-a"));
            mocks.getCanvasProject.mockResolvedValue(project);
            mocks.saveCanvasProjectMutation
                .mockRejectedValueOnce(new Error("响应丢失"))
                .mockResolvedValueOnce({ projectId: project.id, updatedAt: "2026-08-05T12:00:01.000Z", mutationId: "mutation-first" })
                .mockResolvedValueOnce({ projectId: project.id, updatedAt: "2026-08-05T12:00:02.000Z", mutationId: "mutation-second" });
            await useCanvasStore.getState().loadProject(project.id);

            useCanvasStore.getState().updateProject(project.id, { backgroundMode: "dots" });
            await vi.advanceTimersByTimeAsync(250);
            const firstMutation = mocks.saveCanvasProjectMutation.mock.calls[0][1];

            useCanvasStore.getState().updateProject(project.id, { backgroundMode: "blank" });
            await vi.advanceTimersByTimeAsync(1_000);

            expect(mocks.saveCanvasProjectMutation).toHaveBeenCalledTimes(3);
            expect(mocks.saveCanvasProjectMutation.mock.calls[1][1]).toMatchObject({ mutationId: firstMutation.mutationId, baseUpdatedAt: project.updatedAt, backgroundMode: "dots" });
            expect(mocks.saveCanvasProjectMutation.mock.calls[2][1]).toMatchObject({ baseUpdatedAt: "2026-08-05T12:00:01.000Z", backgroundMode: "blank" });
            expect(useCanvasStore.getState().saveStateByProject[project.id]).toEqual({ status: "saved" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("exposes a Canvas version conflict instead of retrying it as a network error", async () => {
        vi.useFakeTimers();
        try {
            const project = canvasProject("canvas-conflict", "并发冲突");
            useUserStore.getState().setUser(user("user-a"));
            mocks.getCanvasProject.mockResolvedValue(project);
            mocks.saveCanvasProjectMutation.mockRejectedValue(new CanvasProjectRequestError("画布项目已在其他页面更新，请刷新后重试", 409));
            await useCanvasStore.getState().loadProject(project.id);

            useCanvasStore.getState().updateProject(project.id, { showImageInfo: true });
            await vi.advanceTimersByTimeAsync(250);

            expect(useCanvasStore.getState().saveStateByProject[project.id]).toEqual({ status: "conflict", message: "画布项目已在其他页面更新，请刷新后重试" });
        } finally {
            vi.useRealTimers();
        }
    });

    it("flushes the current Canvas snapshot with keepalive when the page is leaving", async () => {
        const project = canvasProject("canvas-keepalive", "离开前保存");
        useUserStore.getState().setUser(user("user-a"));
        mocks.getCanvasProject.mockResolvedValue(project);
        mocks.saveCanvasProjectMutation.mockResolvedValue({ projectId: project.id, updatedAt: "2026-08-05T12:00:02.000Z", mutationId: "mutation-keepalive" });
        await useCanvasStore.getState().loadProject(project.id);

        useCanvasStore.getState().updateProject(project.id, { showImageInfo: true });
        await useCanvasStore.getState().flushProjectSave(project.id, true);

        expect(mocks.saveCanvasProjectMutation).toHaveBeenCalledWith(project.id, expect.objectContaining({ showImageInfo: true }), { keepalive: true });
        expect(useCanvasStore.getState().saveStateByProject[project.id]).toEqual({ status: "saved" });
    });

    it("serializes a second Canvas edit against the acknowledged revision", async () => {
        const project = canvasProject("canvas-serialized", "串行保存");
        const first = deferred<{ projectId: string; updatedAt: string; mutationId: string }>();
        useUserStore.getState().setUser(user("user-a"));
        mocks.getCanvasProject.mockResolvedValue(project);
        mocks.saveCanvasProjectMutation.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ projectId: project.id, updatedAt: "2026-08-05T12:00:03.000Z", mutationId: "mutation-second" });
        await useCanvasStore.getState().loadProject(project.id);

        vi.useFakeTimers();
        try {
            useCanvasStore.getState().updateProject(project.id, { backgroundMode: "dots" });
            await vi.advanceTimersByTimeAsync(250);
            useCanvasStore.getState().updateProject(project.id, { backgroundMode: "blank" });
            const pending = useCanvasStore.getState().flushProjectSave(project.id);
            expect(mocks.saveCanvasProjectMutation).toHaveBeenCalledTimes(1);

            first.resolve({ projectId: project.id, updatedAt: "2026-08-05T12:00:02.500Z", mutationId: "mutation-first" });
            await pending;
            expect(mocks.saveCanvasProjectMutation).toHaveBeenCalledTimes(2);
            expect(mocks.saveCanvasProjectMutation).toHaveBeenLastCalledWith(project.id, expect.objectContaining({ baseUpdatedAt: "2026-08-05T12:00:02.500Z", backgroundMode: "blank" }));
        } finally {
            vi.useRealTimers();
        }
    });
});

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((promiseResolve) => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}

function user(id: string) {
    return {
        id,
        accountId: id === "user-a" ? "0001" : "0002",
        username: id,
        email: `${id}@example.test`,
        displayName: id,
        bio: "",
        role: "user" as const,
        adminPermissions: [],
        status: "active" as const,
        planId: "free",
        planName: "免费",
        hasActivePlan: false,
        pointsBalance: 0,
        mfaEnabled: false,
    };
}

function textAsset(id: string, title: string): Asset {
    const now = new Date().toISOString();
    return { id, kind: "text", title, coverUrl: "", tags: [], data: { content: title }, createdAt: now, updatedAt: now };
}

function canvasProject(id: string, title: string): CanvasProject {
    const now = new Date().toISOString();
    return {
        id,
        title,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
        createdAt: now,
        updatedAt: now,
    };
}
