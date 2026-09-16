"use client";

import { Check, Download, Pencil, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "@/compat/navigation";
import { App, Button, Input } from "antd";
import { useState } from "react";

import { useCanvasStore, type CanvasProjectSummary } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { exportCanvasProjects } from "../utils/canvas-export";

export function CanvasProjectCard({ project }: { project: CanvasProjectSummary }) {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const loadProject = useCanvasStore((state) => state.loadProject);
    const [exporting, setExporting] = useState(false);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const href = `/canvas/${project.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    const preload = () => {
        router.prefetch(href);
        void loadProject(project.id).catch(() => undefined);
    };
    const open = () => {
        preload();
        router.push(href);
    };
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };
    const exportProject = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const detail = await loadProject(project.id);
            await exportCanvasProjects([detail]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布导出失败");
        } finally {
            setExporting(false);
        }
    };

    return (
        <article
            className="group flex min-h-0 cursor-pointer flex-col justify-between border border-[#403a34]/15 bg-[#fbf8f2] p-2.5 text-[#403a34] transition hover:border-[#403a34]/40 sm:min-h-44 sm:p-5"
            onClick={() => !editing && open()}
            onPointerEnter={preload}
            onFocusCapture={preload}
        >
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    checked={selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => toggleSelected(project.id, event.target.checked)}
                    className="mt-1 size-4 accent-[#403a34]"
                    aria-label={`选择 ${project.title}`}
                />
                {editing ? (
                    <Input className="min-w-0" value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                ) : (
                    <button
                        type="button"
                        className="min-w-0 cursor-pointer text-left"
                        onClick={(event) => {
                            event.stopPropagation();
                            open();
                        }}
                    >
                        <h2 className="truncate text-xl font-medium tracking-[-0.02em] text-[#403a34] sm:text-2xl">{project.title}</h2>
                        <p className="mt-1.5 text-xs leading-5 text-[#555555] sm:mt-3 sm:text-sm sm:leading-6">
                            {project.nodeCount} 个节点 · {project.connectionCount} 条连线
                        </p>
                    </button>
                )}
            </div>
            <div className="mt-2 flex items-end justify-between gap-3 sm:mt-8">
                <p className="text-xs text-[#555555]">更新于 {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    {editing ? (
                        <>
                            <Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} aria-label="保存名称" />
                            <Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={stopEditing} aria-label="取消重命名" />
                        </>
                    ) : (
                        <>
                            <Button type="text" size="small" shape="circle" loading={exporting} icon={<Download className="size-4" />} onClick={() => void exportProject()} aria-label="导出" />
                            <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => startEditing(project.id, project.title)} aria-label="重命名" />
                            <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds([project.id])} aria-label="删除" />
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}
