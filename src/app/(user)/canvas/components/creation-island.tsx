"use client";

import { useRouter } from "@/compat/navigation";
import { App, Button } from "antd";
import { ArrowRight, ArrowUp, FileUp, ImagePlus, Sparkles, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useUserStore } from "@/stores/use-user-store";
import { resolveSiteTitle } from "@/lib/site-brand";
import { useCanvasStore } from "../stores/use-canvas-store";

/**
 * 中央创作岛：高阶创作入口，双层精密倒角 + 光影质感
 * - 外层大倒角画布（rounded-[2.75rem]），内层岛面（rounded-[2rem]），双层嵌套精密倒角
 * - 顶部冷光扫过 + 底部暖光回折，形成"悬浮岛"光影
 * - 输入即创作：输入构思意图 + 装载参考素材，一键创建画布并交给 Agent
 */
export function CreationIsland({
    creating,
    onSubmit,
    onImportClick,
    children,
}: {
    creating: boolean;
    onSubmit: (prompt: string, files: File[]) => void;
    onImportClick: () => void;
    children?: ReactNode;
}) {
    const { message } = App.useApp();
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const siteTitle = usePublicSessionStore((state) => resolveSiteTitle(state.payload?.settings?.site?.title));
    const userId = useUserStore((state) => state.user?.id || "");
    const hydrated = useCanvasStore((state) => state.hydrated);
    const hydratedUserId = useCanvasStore((state) => state.hydratedUserId);
    const total = useCanvasStore((state) => state.summaryTotal);
    const ready = Boolean(userId && hydrated && hydratedUserId === userId);
    const [prompt, setPrompt] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const previews = useMemo(() => files.map((file) => ({ id: `${file.name}-${file.size}`, name: file.name, url: URL.createObjectURL(file), kind: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "audio" as const })), [files]);

    const canSubmit = Boolean(prompt.trim() || files.length);
    const submit = () => {
        if (!ready) {
            message.info("画布数据加载中，请稍候");
            return;
        }
        if (creating || !canSubmit) return;
        const trimmed = prompt.trim();
        if (!trimmed && !files.length) return;
        onSubmit(trimmed, files);
    };

    return (
        <section className="relative mx-auto w-full max-w-4xl px-4 sm:px-6">
            {/* 外框：大倒角舞台 */}
            <div className="relative overflow-hidden rounded-[2.75rem] border border-[#403a34]/12 bg-[#f3ecdf] shadow-[0_30px_80px_-24px_rgba(64,58,52,0.35)]">
                {/* 顶部冷光扫过 */}
                <div className="pointer-events-none absolute inset-x-10 top-0 h-24 bg-gradient-to-b from-white/80 to-transparent sm:inset-x-16" />
                {/* 底部暖光回折 */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#e7ddca]/70 to-transparent" />

                {/* 内层岛面：精密倒角 */}
                <div className="relative m-3 overflow-hidden rounded-[2rem] border border-[#403a34]/10 bg-[#faf6ee]/90 px-4 py-8 sm:m-4 sm:px-8 sm:py-12">
                    {/* 极细网格微光（非线框，仅呼吸感） */}
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(64,58,52,0.045),transparent_65%)]" />

                    <div className="relative flex flex-col items-center text-center">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#403a34]/20 bg-[#f6f1eb] px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#555555]">
                            <Sparkles className="size-3" />
                            {siteTitle} 创作工作台
                        </span>

                        <h2 className="mt-6 text-4xl font-semibold tracking-[-0.03em] text-[#403a34] sm:text-6xl">
                            开始你的创作
                        </h2>
                        <p className="mt-3 max-w-md text-sm leading-6 text-[#555555] sm:text-base sm:leading-7">
                            输入构思意图，或装载参考素材。一键创建画布，让 Agent 帮你完成创作。
                        </p>

                        {/* 输入即创作：prompt + 素材 */}
                        <div className="mt-8 w-full max-w-2xl">
                            <div className="relative rounded-2xl border border-[#403a34]/14 bg-white/70 px-4 py-3 text-left shadow-sm transition focus-within:border-[#403a34]/30 focus-within:shadow-[0_10px_30px_-12px_rgba(64,58,52,0.25)]">
                                <textarea
                                    ref={textareaRef}
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            submit();
                                        }
                                    }}
                                    rows={2}
                                    placeholder="输入构思意图、镜头调度指令，或粘贴装载参考素材..."
                                    className="thin-scrollbar min-h-[52px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-[#403a34] outline-none placeholder:text-[#8a857c]"
                                    aria-label="创作意图"
                                />
                                {previews.length ? (
                                    <div className="hide-scrollbar mt-2 flex max-w-full gap-2 overflow-x-auto pb-0.5">
                                        {previews.map((item) => (
                                            <div key={item.id} className="group relative size-12 shrink-0 overflow-hidden rounded-lg border border-[#403a34]/12">
                                                {item.kind === "video" ? (
                                                    <video src={item.url} muted playsInline preload="metadata" className="pointer-events-none size-full object-cover" />
                                                ) : item.kind === "audio" ? (
                                                    <div className="grid size-full place-items-center bg-[#f3ecdf] text-[10px] text-[#555555]">音频</div>
                                                ) : (
                                                    <img src={item.url} alt="" className="size-full object-cover" />
                                                )}
                                                <button
                                                    type="button"
                                                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-[#403a34]/20 bg-[#faf6ee] opacity-0 shadow-sm transition group-hover:opacity-100"
                                                    onClick={() => setFiles((current) => current.filter((file) => `${file.name}-${file.size}` !== item.id))}
                                                    aria-label={`移除素材 ${item.name}`}
                                                >
                                                    <X className="size-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="mt-3 flex items-center justify-between border-t border-[#403a34]/10 pt-2.5">
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={fileInputRef}
                                            hidden
                                            type="file"
                                            accept="image/*,video/*,audio/*"
                                            multiple
                                            onChange={(event) => {
                                                const next = Array.from(event.target.files || []);
                                                if (next.length) setFiles((current) => [...current, ...next]);
                                                event.target.value = "";
                                            }}
                                        />
                                        <Button
                                            size="small"
                                            icon={<ImagePlus className="size-3.5" />}
                                            className="rounded-full !border-[#403a34]/18 !bg-transparent text-xs text-[#555555] hover:!border-[#403a34]/35 hover:!bg-[#f6f1eb]"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            装载素材
                                        </Button>
                                        <Button
                                            size="small"
                                            icon={<FileUp className="size-3.5" />}
                                            className="rounded-full !border-[#403a34]/18 !bg-transparent text-xs text-[#555555] hover:!border-[#403a34]/35 hover:!bg-[#f6f1eb]"
                                            disabled={!ready}
                                            onClick={() => onImportClick()}
                                        >
                                            导入画布
                                        </Button>
                                    </div>
                                    <Button
                                        type="primary"
                                        disabled={!ready || creating || !canSubmit}
                                        loading={creating}
                                        icon={!creating ? <ArrowUp className="size-4" /> : undefined}
                                        className="rounded-full !bg-[#403a34]"
                                        onClick={submit}
                                        aria-label="提交创作"
                                    >
                                        创建并创作
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {ready && total > 0 ? (
                            <button
                                type="button"
                                className="group mt-7 inline-flex items-center gap-1.5 text-sm text-[#555555] transition hover:text-[#403a34]"
                                onClick={() => router.push("/canvas")}
                            >
                                查看全部 {total} 个画布
                                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                            </button>
                        ) : null}

                        {children}
                    </div>
                </div>
            </div>
        </section>
    );
}
