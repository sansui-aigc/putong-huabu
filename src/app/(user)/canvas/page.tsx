"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "@/compat/navigation";
import { App, Button, Pagination } from "antd";
import { Download, FileUp } from "lucide-react";

import { readZip } from "@/lib/zip";
import { APP_EXPORT_ID } from "@/lib/storage-keys";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { nanoid } from "nanoid";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasFlowField } from "./components/canvas-flow-field";
import { CanvasProjectCard } from "./components/canvas-project-card";
import { writeCanvasComposerHandoff } from "./components/canvas-composer-handoff";
import { CreationIsland } from "./components/creation-island";
import type { CanvasExportFile } from "./export-types";
import { useCanvasStore } from "./stores/use-canvas-store";
import { useCanvasUiStore } from "./stores/use-canvas-ui-store";
import { resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useUserStore } from "@/stores/use-user-store";
import { exportCanvasProjects } from "./utils/canvas-export";
import { CanvasNodeType, type CanvasNodeData } from "./types";
import { CreativeWorkflowWorkspace } from "@/components/workflows/creative-workflow-workspace";

export default function CanvasPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const autoOpenRef = useRef(false);
    const [creating, setCreating] = useState(false);
    const [exporting, setExporting] = useState(false);
    const siteTitle = usePublicSessionStore((state) => resolveSiteTitle(state.payload?.settings?.site?.title));
    const userId = useUserStore((state) => state.user?.id || "");
    const hydrated = useCanvasStore((state) => state.hydrated);
    const hydratedUserId = useCanvasStore((state) => state.hydratedUserId);
    const syncError = useCanvasStore((state) => state.syncError);
    const hydrate = useCanvasStore((state) => state.hydrate);
    const projects = useCanvasStore((state) => state.summaries);
    const total = useCanvasStore((state) => state.summaryTotal);
    const page = useCanvasStore((state) => state.summaryPage);
    const pageSize = useCanvasStore((state) => state.summaryPageSize);
    const loadProject = useCanvasStore((state) => state.loadProject);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const ready = Boolean(userId && hydrated && hydratedUserId === userId);

    const mode = searchParams.get("mode");
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    const enterProject = (id: string) => {
        router.push(`/canvas/${id}${agentQuery}`);
    };
    /** 输入即创作：prompt + 素材 → 创建画布（素材作为初始节点）→ 交接给编辑页自动执行 */
    const createAndCompose = async (prompt: string, files: File[]) => {
        if (creating) return;
        setCreating(true);
        try {
            const title = prompt.trim().slice(0, 24) || `${siteTitle} 画布 ${total + 1}`;
            const handoffAssetIds: string[] = [];
            const nodes = files.length ? await buildInitialMediaNodes(files, handoffAssetIds) : [];
            // 用 importProject 一步创建带初始节点的画布，避免二次 updateProject 的持久化竞态
            const projectId = await importProject({ title, nodes, connections: [] });
            writeCanvasComposerHandoff({
                prompt: prompt.trim(),
                assetIds: handoffAssetIds,
                skillIds: [],
                modelIds: [],
            });
            enterProject(projectId);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布创建失败");
        } finally {
            setCreating(false);
        }
    };
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            if (data.app !== APP_EXPORT_ID) throw new Error("不是当前应用的画布包");
            await Promise.all(
                data.projects.map(async (item) => {
                    const uploaded = new Map<string, { storageKey: string; url: string }>();
                    await Promise.all(
                        item.files.map(async (file) => {
                            const blob = zip.get(file.path);
                            if (!blob) return;
                            const typedBlob = blob.type ? blob : blob.slice(0, blob.size, file.mimeType);
                            const media = file.mimeType.startsWith("image/") ? await uploadImage(typedBlob) : await uploadMediaFile(typedBlob, file.mimeType.startsWith("audio/") ? "audio" : "video");
                            uploaded.set(file.storageKey, media);
                        }),
                    );
                    await importProject(remapImportedProjectMedia(item.project, uploaded));
                }),
            );
            message.success(`已导入 ${data.projects.length} 个画布`);
        } catch {
            message.error("导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };
    const exportSelectedProjects = async () => {
        if (!selectedIds.length || exporting) return;
        setExporting(true);
        try {
            const selected = await Promise.all(selectedIds.map((id) => loadProject(id)));
            await exportCanvasProjects(selected);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布导出失败");
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        void hydrate();
    }, [hydrate, userId]);

    useEffect(() => {
        if (!ready || autoOpenRef.current || (mode !== "new" && mode !== "recent")) return;
        autoOpenRef.current = true;
        void (async () => {
            try {
                const defaultName = `${siteTitle} 画布 ${total + 1}`;
                const id = mode === "new" ? await createProject(defaultName) : projects[0]?.id || (await createProject(defaultName));
                enterProject(id);
            } catch (error) {
                autoOpenRef.current = false;
                message.error(error instanceof Error ? error.message : "画布打开失败");
            }
        })();
    }, [createProject, message, mode, projects, ready, siteTitle, total]);

    if (ready && (mode === "new" || mode === "recent")) return <main className="flex h-full items-center justify-center bg-background text-sm text-stone-500">正在打开画布...</main>;

    return (
        <main className="canvas-library relative h-full overflow-auto bg-[#f6f1eb] text-[#403a34]">
            {/* 无限画布动态流场背景 */}
            <CanvasFlowField />

            <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-2 py-6 sm:px-6 sm:py-10">
                <header className="flex flex-wrap items-end justify-between gap-2.5 border-b border-[#403a34]/12 pb-4 sm:gap-4">
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#555555]">画布库</p>
                        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] sm:mt-2 sm:text-4xl sm:tracking-[-0.03em]">我的画布</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length ? (
                            <>
                                <Button disabled={!ready} loading={exporting} icon={<Download className="size-4" />} onClick={() => void exportSelectedProjects()}>
                                    导出选中
                                </Button>
                                <Button disabled={!ready} onClick={() => setDeleteIds(selectedIds)}>
                                    删除选中
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!ready} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                删除当前页
                            </Button>
                        ) : null}
                    </div>
                </header>

                {/* 中央创作岛：视觉中心 */}
                <div className="flex flex-col justify-center pt-2 sm:min-h-[38vh] sm:pt-6">
                    <CreationIsland
                        creating={creating}
                        onSubmit={(prompt, files) => void createAndCompose(prompt, files)}
                        onImportClick={() => inputRef.current?.click()}
                    />
                </div>

                {/* 创作工作流：模板画廊 */}
                <CreativeWorkflowWorkspace />

                {/* 画布列表（精简为轻量展示） */}
                {ready && projects.length ? (
                    <section className="mt-6 border-t border-[#403a34]/12 pt-6 sm:mt-8">
                        {!ready ? (
                            <div className="flex min-h-24 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-[#555555]">
                                <span>{syncError || "正在加载画布..."}</span>
                                {syncError ? (
                                    <Button size="small" onClick={() => void hydrate(true)}>
                                        重新加载
                                    </Button>
                                ) : null}
                            </div>
                        ) : projects.length ? (
                            <>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#555555]">全部画布</p>
                                    <Button
                                        size="small"
                                        icon={<FileUp className="size-3.5" />}
                                        disabled={!ready}
                                        onClick={() => inputRef.current?.click()}
                                    >
                                        导入画布
                                    </Button>
                                </div>
                                <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                                    {projects.map((project) => (
                                        <CanvasProjectCard key={project.id} project={project} />
                                    ))}
                                </div>
                                {total > pageSize ? (
                                    <div className="flex justify-center py-2 sm:py-0">
                                        <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={(nextPage) => void hydrate(true, nextPage)} />
                                    </div>
                                ) : null}
                            </>
                        ) : null}
                    </section>
                ) : !ready ? (
                    <section className="mt-6 border-t border-[#403a34]/12 pt-6 sm:mt-8">
                        <div className="flex min-h-24 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-[#555555]">
                            <span>{syncError || "正在加载画布..."}</span>
                            {syncError ? (
                                <Button size="small" onClick={() => void hydrate(true)}>
                                    重新加载
                                </Button>
                            ) : null}
                        </div>
                    </section>
                ) : null}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
        </main>
    );
}

/** 把用户装载的素材文件上传，并构造为画布初始节点（横向排列，顺序即参考图编号） */
async function buildInitialMediaNodes(files: File[], handoffAssetIds: string[]) {
    const nodes: CanvasNodeData[] = [];
    const gap = 32;
    let cursorX = 80;
    const cursorY = 120;
    for (const file of files) {
        const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "other";
        if (kind === "other") continue;
        try {
            const media = kind === "image" ? await uploadImage(file) : await uploadMediaFile(file, kind === "audio" ? "audio" : "video");
            handoffAssetIds.push(media.storageKey);
            const id = `${kind}-${nanoid()}`;
            const width = kind === "image" ? 256 : kind === "video" ? 340 : 300;
            const height = kind === "image" ? 256 : kind === "video" ? 200 : 72;
            nodes.push({
                id,
                type: kind === "image" ? CanvasNodeType.Image : kind === "video" ? CanvasNodeType.Video : CanvasNodeType.Audio,
                title: file.name.slice(0, 32) || `${kind} 素材`,
                position: { x: cursorX, y: cursorY },
                width,
                height,
                metadata: {
                    content: media.url,
                    storageKey: media.storageKey,
                    serverUrl: media.url,
                    status: "success",
                    naturalWidth: kind === "image" ? width : undefined,
                    naturalHeight: kind === "image" ? height : undefined,
                },
            });
            cursorX += width + gap;
        } catch {
            // 单个素材失败不影响其余素材
        }
    }
    return nodes;
}

function remapImportedProjectMedia(project: CanvasExportFile["projects"][number]["project"], uploaded: Map<string, { storageKey: string; url: string }>) {
    const visit = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(visit);
        if (!value || typeof value !== "object") return value;
        const source = value as Record<string, unknown>;
        const next = Object.fromEntries(Object.entries(source).map(([key, item]) => [key, visit(item)]));
        const media = typeof source.storageKey === "string" ? uploaded.get(source.storageKey) : undefined;
        if (!media) return next;
        next.storageKey = media.storageKey;
        next.serverUrl = media.url;
        delete next.remoteUrl;
        if ("content" in source) next.content = media.url;
        if ("dataUrl" in source) next.dataUrl = media.url;
        if ("url" in source) next.url = media.url;
        return next;
    };
    return visit(project) as typeof project;
}
