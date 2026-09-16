import type { ReactNode } from "react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Alert, Button, Input, Modal, Space, Tag, Typography } from "antd";
import { KeyRound, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { clearCreativeApiConnection, getCreativeApiBaseUrl, getCreativeApiConnections, isImagenModelName, loadCreativeModelsForConnection, saveCreativeApiConnections, staticModelProtocolLabel, type CreativeApiConnection, type StaticApiModel } from "./static-runtime";

type EditableConnection = CreativeApiConnection;
type ModelProbe = { status: "idle" | "loading" | "success" | "error"; models: StaticApiModel[]; error?: string };
type ConnectionButtonPosition = { top: number; right: number };

const CONNECTION_BUTTON_POSITION_KEY = "creative:connection-button-position";
const CONNECTION_BUTTON_SIZE = 44;
const CONNECTION_BUTTON_GAP = 12;

function readConnectionButtonPosition(): ConnectionButtonPosition {
    try {
        const parsed = JSON.parse(localStorage.getItem(CONNECTION_BUTTON_POSITION_KEY) || "null") as Partial<ConnectionButtonPosition> | null;
        if (Number.isFinite(parsed?.top) && Number.isFinite(parsed?.right)) return { top: Number(parsed?.top), right: Number(parsed?.right) };
    } catch {
        // Ignore malformed local UI preferences.
    }
    return { top: 76, right: 16 };
}

function clampConnectionButtonPosition(position: ConnectionButtonPosition): ConnectionButtonPosition {
    const maxTop = Math.max(CONNECTION_BUTTON_GAP, window.innerHeight - CONNECTION_BUTTON_SIZE - CONNECTION_BUTTON_GAP);
    const maxRight = Math.max(CONNECTION_BUTTON_GAP, window.innerWidth - CONNECTION_BUTTON_SIZE - CONNECTION_BUTTON_GAP);
    return {
        top: Math.min(Math.max(CONNECTION_BUTTON_GAP, position.top), maxTop),
        right: Math.min(Math.max(CONNECTION_BUTTON_GAP, position.right), maxRight),
    };
}

export function ApiKeyGate({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [connections, setConnections] = useState<EditableConnection[]>([]);
    const [remember, setRemember] = useState(() => Boolean(localStorage.getItem("creative:new-api-connections:remembered")));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [modelProbes, setModelProbes] = useState<Record<string, ModelProbe>>({});
    const [connectionButtonPosition, setConnectionButtonPosition] = useState<ConnectionButtonPosition>(() => readConnectionButtonPosition());
    const connectionButtonDragRef = useRef<{ pointerId: number; startX: number; startY: number; startTop: number; startRight: number; moved: boolean } | null>(null);
    const suppressConnectionButtonClickRef = useRef(false);
    const configured = getCreativeApiConnections().length > 0;

    useEffect(() => {
        const clampPosition = () => setConnectionButtonPosition((current) => clampConnectionButtonPosition(current));
        clampPosition();
        window.addEventListener("resize", clampPosition);
        return () => window.removeEventListener("resize", clampPosition);
    }, []);

    const handleConnectionButtonPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        connectionButtonDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startTop: connectionButtonPosition.top,
            startRight: connectionButtonPosition.right,
            moved: false,
        };
    };

    const handleConnectionButtonPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = connectionButtonDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const moved = Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4;
        if (moved) drag.moved = true;
        if (!drag.moved) return;
        setConnectionButtonPosition(clampConnectionButtonPosition({ top: drag.startTop + event.clientY - drag.startY, right: drag.startRight - event.clientX + drag.startX }));
    };

    const handleConnectionButtonPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = connectionButtonDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        connectionButtonDragRef.current = null;
        if (drag.moved) {
            suppressConnectionButtonClickRef.current = true;
            window.setTimeout(() => { suppressConnectionButtonClickRef.current = false; }, 0);
            const nextPosition = clampConnectionButtonPosition({ top: drag.startTop + event.clientY - drag.startY, right: drag.startRight - event.clientX + drag.startX });
            setConnectionButtonPosition(nextPosition);
            localStorage.setItem(CONNECTION_BUTTON_POSITION_KEY, JSON.stringify(nextPosition));
        }
    };

    const openSettings = () => {
        const current = getCreativeApiConnections();
        setConnections(current.length ? current : [{ id: "default", name: "默认中转站", baseUrl: getCreativeApiBaseUrl(), key: "" }]);
        setRemember(Boolean(localStorage.getItem("creative:new-api-connections:remembered")));
        setError("");
        setModelProbes({});
        setOpen(true);
    };

    const fetchModels = async (index: number) => {
        const connection = connections[index];
        if (!connection?.baseUrl.trim() || !connection.key.trim()) {
            setModelProbes((current) => ({ ...current, [connection?.id || String(index)]: { status: "error", models: [], error: "请先填写中转站地址和 API Key" } }));
            return;
        }
        setModelProbes((current) => ({ ...current, [connection.id]: { status: "loading", models: [] } }));
        try {
            const models = await loadCreativeModelsForConnection(connection);
            setModelProbes((current) => ({ ...current, [connection.id]: { status: "success", models } }));
        } catch (cause) {
            setModelProbes((current) => ({ ...current, [connection.id]: { status: "error", models: [], error: cause instanceof Error ? cause.message : "模型列表加载失败" } }));
        }
    };

    const fetchAllModels = async () => {
        await Promise.all(connections.map((_, index) => fetchModels(index)));
    };

    const save = async () => {
        const valid = connections.filter((connection) => connection.baseUrl.trim() && connection.key.trim());
        if (!valid.length) {
            setError("请至少填写一个中转站地址和 API Key");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const results = await Promise.all(valid.map(async (connection) => {
                try {
                    const models = await loadCreativeModelsForConnection(connection);
                    return { connection, models };
                } catch (cause) {
                    return { connection, error: cause instanceof Error ? cause.message : "连接失败" };
                }
            }));
            setModelProbes((current) => Object.fromEntries(results.map((result) => [result.connection.id, result.error ? { status: "error", models: [], error: result.error } : { status: "success", models: result.models || [] }])));
            const failed = results.filter((result) => result.error || !result.models?.length);
            if (failed.length) {
                setError(failed.map((result) => `${result.connection.name}：${result.error || "模型列表为空"}`).join("；"));
                return;
            }
            saveCreativeApiConnections(valid, valid[0].id, remember);
            setOpen(false);
            // 触发自定义事件，通知组件重新读取连接配置
            window.dispatchEvent(new CustomEvent("creative-api-connections-changed"));
            // 生产环境中刷新页面，确保所有组件重新读取连接配置和模型列表
            // 开发环境中不刷新，避免 vite 热更新/WebSocket 异常导致 dev 服务器崩溃
            if (!import.meta.env.DEV) {
                window.location.reload();
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "保存连接失败，请检查中转站 URL 和 API Key");
        } finally {
            setSaving(false);
        }
    };

    const update = (index: number, patch: Partial<EditableConnection>) => {
        setConnections((current) => current.map((connection, itemIndex) => itemIndex === index ? { ...connection, ...patch } : connection));
        const connection = connections[index];
        if (connection) setModelProbes((current) => ({ ...current, [connection.id]: { status: "idle", models: [] } }));
    };
    const add = () => setConnections((current) => [...current, { id: `connection-${Date.now()}`, name: `中转站 ${current.length + 1}`, baseUrl: "https://api.jui87.com", key: "" }]);
    const remove = (index: number) => setConnections((current) => current.length <= 1 ? current : current.filter((_, itemIndex) => itemIndex !== index));

    return <>
        {children}
        <button
            type="button"
            onClick={() => { if (!suppressConnectionButtonClickRef.current) openSettings(); }}
            onPointerDown={handleConnectionButtonPointerDown}
            onPointerMove={handleConnectionButtonPointerMove}
            onPointerUp={handleConnectionButtonPointerUp}
            onPointerCancel={handleConnectionButtonPointerUp}
            aria-label="设置中转站连接，可拖动"
            title="设置中转站连接；拖动调整位置"
            style={{ top: connectionButtonPosition.top, right: connectionButtonPosition.right }}
            className="fixed z-[100] grid size-11 touch-none cursor-grab place-items-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
            <Settings2 className="size-5" />
        </button>
        <Modal open={open} onCancel={() => setOpen(false)} onOk={save} okText={saving ? "检查模型中..." : "保存并连接"} cancelText="稍后设置" confirmLoading={saving} title={<Space><KeyRound className="size-4" />连接中转站</Space>} width={620}>
            <Space direction="vertical" size={14} className="w-full">
                <Alert type={error ? "error" : "info"} showIcon message={error || "不需要登录 New API 账号，浏览器会直接使用下面的 API Key。"} description="模型列表会按每个 Key 分别读取。文本/推理使用 OpenAI 兼容格式：GET /v1/models、POST /v1/chat/completions；图片、视频和音频使用对应的 OpenAI 兼容接口。地址可填写域名根地址或带 /v1 的地址。" />
                {connections.map((connection, index) => <div key={connection.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between gap-2"><Typography.Text strong>连接 {index + 1}</Typography.Text><Button type="text" danger icon={<Trash2 className="size-4" />} aria-label={`删除连接 ${index + 1}`} onClick={() => remove(index)} disabled={connections.length <= 1} /></div>
                    <Space direction="vertical" size={8} className="w-full">
                        <Input value={connection.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="连接名称" />
                        <Input value={connection.baseUrl} onChange={(event) => update(index, { baseUrl: event.target.value })} placeholder="https://api.example.com 或 https://api.example.com/v1" autoComplete="url" />
                        <Input.Password value={connection.key} onChange={(event) => update(index, { key: event.target.value })} placeholder="sk-..." autoComplete="off" />
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={modelProbes[connection.id]?.status === "loading"} onClick={() => void fetchModels(index)}>获取模型</Button>
                            {modelProbes[connection.id]?.status === "success" ? <Typography.Text type="secondary">已获取 {modelProbes[connection.id].models.length} 个模型</Typography.Text> : null}
                            {modelProbes[connection.id]?.status === "error" ? <Typography.Text type="danger" className="max-w-full truncate" title={modelProbes[connection.id].error}>{modelProbes[connection.id].error}</Typography.Text> : null}
                        </div>
                        {modelProbes[connection.id]?.status === "success" && modelProbes[connection.id].models.length ? <div className="max-h-36 overflow-y-auto rounded-md bg-slate-50 p-2 dark:bg-slate-900"><Space size={[4, 4]} wrap>{modelProbes[connection.id].models.map((model) => <Tag key={model.id} color={model.capability === "image" ? "blue" : undefined}>{model.id} · {staticModelProtocolLabel(model)}</Tag>)}</Space></div> : null}
                        {modelProbes[connection.id]?.status === "success" && modelProbes[connection.id].models.some((model) => model.capability === "image") && !modelProbes[connection.id].models.some((model) => isImagenModelName(model.id)) ? <Alert type="warning" showIcon message="此连接未返回 Imagen 模型" description="这不影响列表中明确标记为“Gemini 图片”或“OpenAI Images”的模型。只有当中转站图片渠道明确限制为 Imagen 时，Gemini、GPT Image 或 Seedream 请求才会失败；请为对应模型配置匹配的图片协议和渠道。" /> : null}
                    </Space>
                </div>)}
                <div className="flex items-center justify-between gap-3">
                    <Space wrap><Button type="dashed" icon={<Plus className="size-4" />} onClick={add}>增加连接</Button><Button icon={<RefreshCw className="size-3.5" />} onClick={() => void fetchAllModels()} disabled={saving}>获取全部模型</Button></Space>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />在此设备记住连接</label>
                </div>
                {configured ? <Button danger type="text" onClick={() => { clearCreativeApiConnection(); setOpen(false); window.location.reload(); }}>清除全部连接</Button> : null}
            </Space>
        </Modal>
    </>;
}
