"use client";

import { App, Button, Drawer, Input, Select, Switch, Tag } from "antd";
import { Copy, FilePlus2, Globe2, Layers3, LoaderCircle, LockKeyhole, Play, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CreativeWorkflow, WorkflowVariable } from "@/lib/creative-workflow-contract";
import { createDefaultWorkflowInputValues, renderWorkflowPrompt, validateWorkflowInputs } from "@/lib/creative-workflow-contract";
import { deleteCreativeWorkflow, forkCreativeWorkflow, listCreativeWorkflows, saveCreativeWorkflow, touchCreativeWorkflowRun } from "@/services/api/creative-workflows";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import { nanoid } from "nanoid";
import { useRouter } from "@/compat/navigation";

type RunState = { workflowId: string; prompt: string; creating: boolean } | null;

/**
 * 创作工作流：公开 / 个人模板、变量表单、AI 创建、单图 / 多图系列
 * 运行 = 变量渲染 prompt → 创建画布（带初始文本节点）→ 跳转编辑页
 */
export function CreativeWorkflowWorkspace() {
    const { message } = App.useApp();
    const router = useRouter();
    const [workflows, setWorkflows] = useState<CreativeWorkflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [editing, setEditing] = useState<CreativeWorkflow | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [running, setRunning] = useState<RunState>(null);
    const [aiDrafting, setAiDrafting] = useState(false);
    const importProject = useCanvasStore((state) => state.importProject);

    const refresh = useCallback(async () => {
        try {
            setWorkflows(await listCreativeWorkflows());
            setLoadError("");
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "工作流加载失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const publics = useMemo(() => workflows.filter((item) => item.scope === "public"), [workflows]);
    const mine = useMemo(() => workflows.filter((item) => item.scope === "private"), [workflows]);

    const openWorkflow = (workflow: CreativeWorkflow) => {
        setEditing(workflow);
        setValues(createDefaultWorkflowInputValues(workflow));
    };

    const closeEditor = () => {
        setEditing(null);
        setValues({});
    };

    const saveDraft = async () => {
        if (!editing) return;
        if (!editing.name.trim()) {
            message.warning("请输入工作流名称");
            return;
        }
        if (!editing.config.promptTemplate.trim()) {
            message.warning("请输入提示词模板");
            return;
        }
        try {
            const saved = await saveCreativeWorkflow(editing);
            setWorkflows((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
            message.success("工作流已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        }
    };

    const runWorkflow = async () => {
        if (!editing) return;
        const missing = validateWorkflowInputs(editing, values);
        if (missing.length) {
            message.warning(`请填写：${missing.join("、")}`);
            return;
        }
        const prompt = renderWorkflowPrompt(editing, values);
        if (!prompt.trim()) {
            message.warning("提示词渲染为空，请检查模板与变量");
            return;
        }
        setRunning({ workflowId: editing.id, prompt, creating: true });
        try {
            const title = `${editing.name} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
            const projectId = await importProject({
                title,
                nodes: [
                    {
                        id: `text-${nanoid()}`,
                        type: CanvasNodeType.Text,
                        title: editing.name,
                        position: { x: 80, y: 100 },
                        width: 420,
                        height: 260,
                        metadata: { content: prompt, status: "success" },
                    },
                ],
                connections: [],
            });
            void touchCreativeWorkflowRun(editing.id).catch(() => undefined);
            closeEditor();
            router.push(`/canvas/${projectId}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布创建失败");
        } finally {
            setRunning(null);
        }
    };

    const forkTemplate = async (workflow: CreativeWorkflow) => {
        try {
            const copy = await forkCreativeWorkflow(workflow.id);
            setWorkflows((current) => [copy, ...current]);
            openWorkflow(copy);
            message.success("已复制到我的工作流");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "复制失败");
        }
    };

    const removeWorkflow = async (workflow: CreativeWorkflow) => {
        try {
            await deleteCreativeWorkflow(workflow.id);
            setWorkflows((current) => current.filter((item) => item.id !== workflow.id));
            message.success("工作流已删除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };

    return (
        <section className="relative border-t border-[#403a34]/12 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#555555]">创作工作流</p>
                    <p className="mt-1 text-sm text-[#555555]">公开模板直接使用，或复制为个人模板后自定义变量与提示词。</p>
                </div>
                <Button type="primary" icon={<FilePlus2 className="size-4" />} className="rounded-full !bg-[#403a34]" disabled={aiDrafting} onClick={() => openWorkflow(blankWorkflow())}>
                    <span className="flex items-center gap-1.5">
                        {aiDrafting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        新建工作流
                    </span>
                </Button>            </div>

            {/* 模板画廊 */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {loading ? (
                    <div className="col-span-full flex min-h-28 items-center justify-center text-sm text-[#555555]">
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                        加载工作流模板...
                    </div>
                ) : loadError ? (
                    <div className="col-span-full rounded-2xl border border-[#403a34]/10 bg-[#faf6ee]/80 px-4 py-6 text-center">
                        <p className="text-sm text-[#555555]">{loadError}</p>
                        <p className="mt-1.5 text-xs text-[#8a857c]">配置中转站连接后即可使用公开模板与个人工作流。</p>
                    </div>
                ) : (
                    <>
                        {mine.length ? (
                            <div className="col-span-full">
                                <p className="text-xs font-medium text-[#555555]">我的工作流</p>
                                <div className="mt-2.5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {mine.map((workflow) => (
                                        <WorkflowCard key={workflow.id} workflow={workflow} onOpen={() => openWorkflow(workflow)} onDelete={() => void removeWorkflow(workflow)} />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {publics.length ? (
                            <div className="col-span-full">
                                <p className="text-xs font-medium text-[#555555]">公开模板</p>
                                <div className="mt-2.5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {publics.map((workflow) => (
                                        <WorkflowCard key={workflow.id} workflow={workflow} onOpen={() => (workflow.editable ? openWorkflow(workflow) : void forkTemplate(workflow))} onFork={() => void forkTemplate(workflow)} />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            {/* 变量表单抽屉 */}
            <Drawer title={editing ? `运行：${editing.name}` : "工作流"} placement="right" width={440} open={Boolean(editing)} onClose={closeEditor} className="!bg-[#faf6ee]" styles={{ body: { padding: 20 } }}>
                {editing ? (
                    <div className="flex flex-col gap-5">
                        <div>
                            <p className="text-xs font-medium text-[#555555]">{editing.description || "填写变量后运行，将创建画布并跳转。"}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <Tag className="!rounded-full !border-[#403a34]/15 !bg-[#f6f1eb] !text-[#555555]">{editing.mode === "multi_image_series" ? "多图系列" : "单图生成"}</Tag>
                                {editing.scope === "public" ? <Tag icon={<Globe2 className="size-3" />} className="!rounded-full !border-[#403a34]/15 !bg-[#f6f1eb] !text-[#555555]">公开</Tag> : <Tag icon={<LockKeyhole className="size-3" />} className="!rounded-full !border-[#403a34]/15 !bg-[#f6f1eb] !text-[#555555]">我的</Tag>}
                            </div>
                        </div>

                        {/* 可编辑区域：仅我的模板/新建 */}
                        {editing.editable ? (
                            <div className="flex flex-col gap-4">
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-[#403a34]">工作流名称</span>
                                    <Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="!rounded-xl !border-[#403a34]/15 !bg-white/70 !text-[#403a34]" />
                                </label>
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-[#403a34]">描述</span>
                                    <Input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="!rounded-xl !border-[#403a34]/15 !bg-white/70 !text-[#403a34]" />
                                </label>
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-[#403a34]">
                                        提示词模板 <span className="ml-0.5 text-[#c0392b]">*</span>
                                        <span className="ml-1.5 font-normal text-[#8a857c]">使用 {"{{变量名}}"} 插入变量</span>
                                    </span>
                                    <Input.TextArea value={editing.config.promptTemplate} autoSize={{ minRows: 6, maxRows: 12 }} onChange={(event) => setEditing({ ...editing, config: { ...editing.config, promptTemplate: event.target.value } })} className="!rounded-xl !border-[#403a34]/15 !bg-white/70 !text-[#403a34]" />
                                </label>
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-[#403a34]">负面提示词（可选）</span>
                                    <Input value={editing.config.negativePrompt} onChange={(event) => setEditing({ ...editing, config: { ...editing.config, negativePrompt: event.target.value } })} className="!rounded-xl !border-[#403a34]/15 !bg-white/70 !text-[#403a34]" />
                                </label>
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-[#403a34]">分类</span>
                                    <Input value={editing.category} placeholder="如：电商海报 / 多图创作" onChange={(event) => setEditing({ ...editing, category: event.target.value })} className="!rounded-xl !border-[#403a34]/15 !bg-white/70 !text-[#403a34]" />
                                </label>
                            </div>
                        ) : null}

                        {/* 变量填写区 */}
                        {editing.variables.length ? (
                            <div className="flex flex-col gap-4">
                                <p className="text-xs font-medium text-[#403a34]">填写变量</p>
                                {editing.variables.map((variable) => (
                                    <WorkflowVariableField key={variable.id} variable={variable} value={values[variable.key] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [variable.key]: value }))} />
                                ))}
                            </div>
                        ) : null}

                        <div className="rounded-2xl border border-[#403a34]/10 bg-[#f6f1eb] p-3.5">
                            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#555555]">渲染后的提示词预览</p>
                            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#403a34]">{renderWorkflowPrompt(editing, values)}</p>
                        </div>

                        <div className="flex items-center gap-2">
                            {editing.editable ? (
                                <Button icon={<FilePlus2 className="size-4" />} className="rounded-full !border-[#403a34]/18 !bg-transparent text-[#555555]" disabled={running?.creating} onClick={() => void saveDraft()}>
                                    保存模板
                                </Button>
                            ) : null}
                            <Button type="primary" size="large" loading={running?.creating} disabled={running?.creating} icon={<Play className="size-4" />} className="flex-1 rounded-full !bg-[#403a34]" onClick={() => void runWorkflow()}>
                                创建画布并运行
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Drawer>
        </section>
    );
}

function WorkflowCard({ workflow, onOpen, onFork, onDelete }: { workflow: CreativeWorkflow; onOpen: () => void; onFork?: () => void; onDelete?: () => void }) {
    return (
        <button type="button" onClick={onOpen} className="group relative flex flex-col gap-2 rounded-2xl border border-[#403a34]/10 bg-[#faf6ee]/80 p-4 text-left shadow-sm transition hover:border-[#403a34]/25 hover:shadow-[0_10px_30px_-16px_rgba(64,58,52,0.25)]">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    {workflow.scope === "public" ? <Globe2 className="size-3.5 text-[#555555]" /> : <LockKeyhole className="size-3.5 text-[#555555]" />}
                    <p className="text-sm font-medium text-[#403a34]">{workflow.name}</p>
                </div>
                <span className="shrink-0 rounded-full border border-[#403a34]/12 bg-[#f6f1eb] px-2 py-0.5 text-[10px] text-[#555555]">{workflow.mode === "multi_image_series" ? "多图系列" : "单图"}</span>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-[#555555]">{workflow.description || "无描述"}</p>
            <p className="line-clamp-2 text-[11px] leading-4 text-[#8a857c]">{workflow.config.promptTemplate}</p>
            <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-[#8a857c]">{workflow.variables.length} 个变量</span>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    {workflow.scope === "public" && onFork ? (
                        <button type="button" className="grid size-7 place-items-center rounded-full border border-[#403a34]/12 bg-[#f6f1eb] text-[#555555] transition hover:text-[#403a34]" onClick={(event) => { event.stopPropagation(); onFork(); }} aria-label="复制为我的工作流">
                            <Copy className="size-3.5" />
                        </button>
                    ) : null}
                    {onDelete ? (
                        <button type="button" className="grid size-7 place-items-center rounded-full border border-[#403a34]/12 bg-[#f6f1eb] text-[#555555] transition hover:text-[#c0392b]" onClick={(event) => { event.stopPropagation(); onDelete(); }} aria-label="删除工作流">
                            <Trash2 className="size-3.5" />
                        </button>
                    ) : null}
                </div>
            </div>
        </button>
    );
}

function WorkflowVariableField({ variable, value, onChange }: { variable: WorkflowVariable; value: string; onChange: (value: string) => void }) {
    const label = (
        <span className="text-xs font-medium text-[#403a34]">
            {variable.label}
            {variable.required ? <span className="ml-0.5 text-[#c0392b]">*</span> : null}
        </span>
    );
    if (variable.type === "textarea") {
        return (
            <label className="flex flex-col gap-1.5">
                {label}
                <Input.TextArea value={value} placeholder={variable.placeholder} autoSize={{ minRows: 3, maxRows: 6 }} onChange={(event) => onChange(event.target.value)} className="!rounded-xl !border-[#403a34]/15 !bg-white/70 !text-[#403a34]" />
            </label>
        );
    }
    if (variable.type === "boolean") {
        return (
            <div className="flex items-center justify-between">
                {label}
                <Switch size="small" checked={value === "true"} onChange={(checked) => onChange(checked ? "true" : "false")} className="!bg-[#403a34]/30" />
            </div>
        );
    }
    if (variable.type === "select") {
        return (
            <label className="flex flex-col gap-1.5">
                {label}
                <Select value={value || undefined} placeholder={variable.placeholder || "请选择"} options={variable.options.map((option) => ({ label: option, value: option }))} onChange={onChange} className="!rounded-xl" />
            </label>
        );
    }
    return (
        <label className="flex flex-col gap-1.5">
            {label}
            <Input value={value} type={variable.type === "number" ? "number" : "text"} placeholder={variable.placeholder} onChange={(event) => onChange(event.target.value)} className="!rounded-xl !border-[#403a34]/15 !bg-white/70 !text-[#403a34]" />
        </label>
    );
}

function blankWorkflow(): CreativeWorkflow {
    const now = Date.now();
    return {
        id: nanoid(),
        scope: "private",
        editable: true,
        mode: "single_image",
        name: "未命名工作流",
        category: "",
        description: "",
        variables: [
            { id: nanoid(), key: "subject", label: "主体", type: "text", required: true, defaultValue: "", options: [] },
            { id: nanoid(), key: "style", label: "风格", type: "text", required: false, defaultValue: "", options: [] },
        ],
        config: {
            model: "",
            imageModel: "",
            imageChannelId: "",
            quality: "",
            size: "",
            count: "1",
            systemPrompt: "",
            promptTemplate: "为 {{subject}} 生成一张图片。\n风格：{{style}}",
            negativePrompt: "",
        },
        seriesConfig: { targetCount: "4", promptInstruction: "", reviewRequired: true, concurrency: "3" },
        createdAt: now,
        updatedAt: now,
    };
}
