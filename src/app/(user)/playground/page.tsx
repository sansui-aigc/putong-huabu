"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Input, InputNumber, Select, Spin, Tag } from "antd";
import { Check, Copy, Download, ImagePlus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";

import { getCreativeApiBaseUrl, getCreativeApiKey, loadCreativeModels, newApiFetch, type StaticApiModel } from "@/standalone/static-runtime";

type PlaygroundResult = { url: string; remoteUrl?: string };
type HistoryItem = { id: string; prompt: string; model: string; count: number; createdAt: string; resultCount: number };

const HISTORY_KEY = "creative:new-api-playground-history";
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 120;

export default function PlaygroundPage() {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [models, setModels] = useState<StaticApiModel[]>([]);
    const [model, setModel] = useState("");
    const [prompt, setPrompt] = useState("");
    const [reference, setReference] = useState<{ dataUrl: string; name: string } | null>(null);
    const [count, setCount] = useState(1);
    const [size, setSize] = useState("1024x1024");
    const [quality, setQuality] = useState("standard");
    const [loadingModels, setLoadingModels] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [results, setResults] = useState<PlaygroundResult[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>(() => readHistory());

    const imageModels = useMemo(() => models.filter((item) => !item.capabilities?.length || item.capabilities.includes("image")), [models]);
    const availableModels = imageModels.length ? imageModels : models;
    const connected = Boolean(getCreativeApiKey());

    const refreshModels = async () => {
        setLoadingModels(true);
        setError("");
        try {
            const next = await loadCreativeModels();
            setModels(next);
            if (!model && next[0]?.id) setModel(next[0].id);
            if (!next.length) setError("中转站没有返回模型，请确认 API Key 和模型渠道配置");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "模型列表加载失败");
        } finally {
            setLoadingModels(false);
        }
    };

    useEffect(() => { void refreshModels(); }, []);

    const chooseReference = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) { setError("参考图必须是图片文件"); return; }
        if (file.size > 15 * 1024 * 1024) { setError("参考图不能超过 15 MB"); return; }
        const reader = new FileReader();
        reader.onload = () => setReference({ dataUrl: String(reader.result || ""), name: file.name });
        reader.onerror = () => setError("参考图读取失败");
        reader.readAsDataURL(file);
    };

    const generate = async () => {
        if (generating) return;
        if (!connected) { setError("请先点击右下角设置按钮，配置 New API Base URL 和 API Key"); return; }
        if (!model.trim()) { setError("请选择或填写图像模型"); return; }
        if (!prompt.trim()) { setError("请输入提示词"); return; }
        setGenerating(true);
        setError("");
        setResults([]);
        setStatus(reference ? "正在提交编辑任务..." : "正在提交生成任务...");
        try {
            const path = reference ? "/v1/images/edits" : "/v1/images/generations";
            const payload: Record<string, unknown> = { model: model.trim(), prompt: prompt.trim(), n: count, size, quality, response_format: "b64_json" };
            if (reference) payload.image = reference.dataUrl;
            const response = await newApiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const body = await readBody(response);
            if (!response.ok) throw new Error(errorMessage(body, `请求失败（HTTP ${response.status}）`));
            const taskId = findTaskId(body);
            let finalBody = body;
            if (response.status === 202 || (taskId && !extractResults(body).length)) {
                if (!taskId) throw new Error("中转站返回异步响应，但没有 task_id");
                finalBody = await pollTask(taskId);
            }
            const nextResults = extractResults(finalBody);
            if (!nextResults.length) throw new Error("任务已完成，但响应中没有图片 URL 或 b64_json");
            setResults(nextResults);
            setStatus(`已完成 ${nextResults.length} 张图片`);
            const item: HistoryItem = { id: `${Date.now()}`, prompt: prompt.trim(), model: model.trim(), count, createdAt: new Date().toISOString(), resultCount: nextResults.length };
            const nextHistory = [item, ...history].slice(0, 20);
            setHistory(nextHistory);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
            message.success("图片生成完成");
        } catch (cause) {
            const text = cause instanceof Error ? cause.message : "图片生成失败";
            setError(text);
            setStatus("");
        } finally {
            setGenerating(false);
        }
    };

    const pollTask = async (taskId: string) => {
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
            setStatus(`任务 ${taskId} 处理中... (${Math.round((attempt * POLL_INTERVAL_MS) / 1000)} 秒)`);
            await wait(POLL_INTERVAL_MS);
            const response = await newApiFetch(`/v1/images/tasks/${encodeURIComponent(taskId)}`);
            const body = await readBody(response);
            if (!response.ok) throw new Error(errorMessage(body, `任务查询失败（HTTP ${response.status}）`));
            const state = taskState(body);
            if (["succeeded", "success", "completed", "done"].includes(state)) return body;
            if (["failed", "error", "cancelled", "canceled"].includes(state)) throw new Error(errorMessage(body, "上游图片任务失败"));
        }
        throw new Error("任务等待超过 5 分钟，请在中转站日志中使用 task_id 核对上游状态");
    };

    return (
        <main className="h-full overflow-auto bg-[#f5f7fa] dark:bg-[#10141a]">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-7">
                <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#dfe5ed] pb-5 dark:border-[#29313d]">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#718096]"><Sparkles className="size-4 text-[#2563eb]" /> New API Playground</div>
                        <h1 className="mt-2 text-2xl font-semibold text-[#172033] dark:text-white">浏览器直连创作</h1>
                        <p className="mt-1 text-sm text-[#647286] dark:text-[#9aa6b5]">任务、提示词和生成历史只保存在当前浏览器，不经过本项目后端。</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#647286] dark:text-[#9aa6b5]"><span className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />{connected ? getCreativeApiBaseUrl() : "未配置中转站"}</div>
                </header>

                {!connected ? <Alert type="warning" showIcon message="尚未连接 New API" description="点击右下角齿轮，填写独立域名的 New API 地址和 API Key。密钥只保存在浏览器，不会写入项目代码。" /> : null}
                {error ? <Alert type="error" showIcon closable message={error} onClose={() => setError("")} /> : null}

                <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
                    <section className="min-w-0 border border-[#dfe5ed] bg-white p-4 shadow-sm dark:border-[#29313d] dark:bg-[#151a21] sm:p-6">
                        <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-[#172033] dark:text-white">生成任务</h2><p className="mt-1 text-xs text-[#718096]">无参考图使用 generations，有参考图使用 edits。</p></div><Tag color={reference ? "blue" : "default"}>{reference ? "图像编辑" : "文生图"}</Tag></div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-[#59677a] dark:text-[#aab5c4]">模型</span><div className="flex gap-2"><Select showSearch className="min-w-0 flex-1" value={model || undefined} placeholder="选择图像模型" options={availableModels.map((item) => ({ label: item.id, value: item.id }))} onChange={setModel} loading={loadingModels} /><Button aria-label="刷新模型列表" title="刷新模型列表" icon={<RefreshCw className="size-4" />} onClick={() => void refreshModels()} /></div></label>
                            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-[#59677a] dark:text-[#aab5c4]">提示词</span><Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 6, maxRows: 12 }} placeholder="描述主体、构图、光线、风格和需要修改的内容" maxLength={9000} showCount /></label>
                            <label><span className="mb-1.5 block text-xs font-medium text-[#59677a] dark:text-[#aab5c4]">尺寸</span><Select className="w-full" value={size} options={["1024x1024", "1536x1024", "1024x1536", "auto"].map((value) => ({ label: value, value }))} onChange={setSize} /></label>
                            <label><span className="mb-1.5 block text-xs font-medium text-[#59677a] dark:text-[#aab5c4]">质量</span><Select className="w-full" value={quality} options={[{ label: "Standard", value: "standard" }, { label: "HD", value: "hd" }, { label: "Auto", value: "auto" }]} onChange={setQuality} /></label>
                            <label><span className="mb-1.5 block text-xs font-medium text-[#59677a] dark:text-[#aab5c4]">生成数量</span><InputNumber className="w-full" min={1} max={10} value={count} onChange={(value) => setCount(Math.min(10, Math.max(1, Number(value) || 1)))} /></label>
                            <div><span className="mb-1.5 block text-xs font-medium text-[#59677a] dark:text-[#aab5c4]">参考图</span><div className="flex gap-2"><Button icon={<Upload className="size-4" />} onClick={() => fileInputRef.current?.click()}>选择图片</Button>{reference ? <Button danger type="text" icon={<Trash2 className="size-4" />} onClick={() => setReference(null)}>移除</Button> : null}</div>{reference ? <div className="mt-2 flex items-center gap-2 truncate text-xs text-[#718096]"><Check className="size-3.5 text-emerald-500" />{reference.name}</div> : null}</div>
                        </div>
                        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#edf0f4] pt-5 dark:border-[#29313d]"><Button type="primary" size="large" icon={<ImagePlus className="size-4" />} loading={generating} onClick={() => void generate()}>生成图片</Button>{status ? <span className="text-xs text-[#647286] dark:text-[#9aa6b5]"><Spin size="small" /> <span className="ml-2">{status}</span></span> : null}</div>
                    </section>

                    <section className="min-w-0 border border-[#dfe5ed] bg-white p-4 shadow-sm dark:border-[#29313d] dark:bg-[#151a21] sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-[#172033] dark:text-white">生成结果</h2>{results.length ? <span className="text-xs text-[#718096]">{results.length} 张</span> : null}</div>{results.length ? <div className="grid grid-cols-2 gap-3">{results.map((item, index) => <ResultTile key={`${item.url}-${index}`} item={item} index={index} message={message} />)}</div> : <div className="grid min-h-64 place-items-center border border-dashed border-[#dfe5ed] px-5 text-center text-sm text-[#8a96a6] dark:border-[#364252]">提交任务后，图片会直接显示在这里</div>}</section>
                </div>

                <section className="border-t border-[#dfe5ed] pt-5 dark:border-[#29313d]"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#172033] dark:text-white">本地任务记录</h2><p className="mt-1 text-xs text-[#718096]">仅保存提示词和任务摘要，不上传到服务器。</p></div>{history.length ? <Button type="text" danger icon={<Trash2 className="size-4" />} onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }}>清空</Button> : null}</div>{history.length ? <div className="divide-y divide-[#e7ebf1] border-y border-[#e7ebf1] bg-white dark:divide-[#29313d] dark:border-[#29313d] dark:bg-[#151a21]">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><div className="min-w-0"><div className="truncate font-medium text-[#273449] dark:text-[#e2e8f0]">{item.prompt}</div><div className="mt-1 text-xs text-[#8a96a6]">{item.model} · {item.resultCount} 张 · {new Date(item.createdAt).toLocaleString()}</div></div><Tag>{item.count} 张请求</Tag></div>)}</div> : <div className="border-y border-[#e7ebf1] py-8 text-center text-sm text-[#8a96a6] dark:border-[#29313d]">暂无本地记录</div>}</section>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => chooseReference(event.target.files?.[0])} />
        </main>
    );
}

function ResultTile({ item, index, message }: { item: PlaygroundResult; index: number; message: ReturnType<typeof App.useApp>["message"] }) {
    const copy = async () => { await navigator.clipboard.writeText(item.remoteUrl || item.url); message.success("图片地址已复制"); };
    return <div className="group relative overflow-hidden border border-[#e1e6ee] bg-[#f8fafc] dark:border-[#303b4b] dark:bg-[#11161d]"><div className="aspect-square"><img src={item.url} alt={`生成结果 ${index + 1}`} className="size-full object-contain" /></div><div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-black/55 p-1.5 opacity-0 transition group-hover:opacity-100"><a href={item.url} download={`new-api-${index + 1}.png`} aria-label="下载图片" title="下载图片" className="grid size-7 place-items-center rounded bg-white/90 text-slate-700"><Download className="size-3.5" /></a><button type="button" onClick={() => void copy()} aria-label="复制图片地址" title="复制图片地址" className="grid size-7 place-items-center rounded bg-white/90 text-slate-700"><Copy className="size-3.5" /></button></div></div>;
}

type ApiObject = Record<string, unknown>;

function asObject(value: unknown): ApiObject { return value && typeof value === "object" && !Array.isArray(value) ? value as ApiObject : {}; }
function asString(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
async function readBody(response: Response): Promise<ApiObject> { const text = await response.text(); try { return asObject(JSON.parse(text)); } catch { return { error: text }; } }
function findTaskId(body: ApiObject) { const data = asObject(body.data); return asString(body.task_id || body.taskId || body.id || data.task_id || data.taskId || data.id); }
function taskState(body: ApiObject) { const data = asObject(body.data); return asString(body.status || body.state || data.status || data.state || "running").toLowerCase(); }
function errorMessage(body: ApiObject, fallback: string) { const error = asObject(body.error); return String(error.message || body.error || body.message || body.msg || fallback).slice(0, 500); }
function extractResults(body: ApiObject): PlaygroundResult[] {
    const data = asObject(body.data);
    const source = [body.data, body.images, body.output, body.result, data.images].find(Array.isArray);
    const items: unknown[] = Array.isArray(source) ? source : [];
    const direct = [body.url, body.image_url, body.result_url, data.url, data.image_url, data.result_url].find(Boolean);
    const candidates: unknown[] = items.length ? items : (direct ? [direct] : []);
    return candidates.map((item: unknown): PlaygroundResult => {
        if (typeof item === "string") return { url: item };
        const object = asObject(item);
        const remoteUrl = asString(object.url || object.image_url || object.uri);
        const base64 = asString(object.b64_json || object.base64 || object.bytesBase64Encoded);
        return { url: remoteUrl || (base64 ? `data:image/png;base64,${base64}` : ""), ...(remoteUrl ? { remoteUrl } : {}) };
    }).filter((item: PlaygroundResult) => item.url);
}
function wait(ms: number) { return new Promise<void>((resolve) => window.setTimeout(resolve, ms)); }
function readHistory(): HistoryItem[] { try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
