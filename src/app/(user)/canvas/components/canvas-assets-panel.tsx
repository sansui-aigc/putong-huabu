"use client";

import { Drawer, Dropdown, Grid, Input, Modal, Spin, Tooltip } from "antd";
import { ChevronDown, FileAudio, FileText, FolderOpen, ImageIcon, LayoutGrid, LibraryBig, LocateFixed, Plus, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Asset, AssetKind } from "@/lib/library-asset-contract";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { libraryAssetToInsertPayload, type InsertAssetPayload } from "./canvas-asset-insert";

type PanelTab = "current" | "assets";
type CurrentMediaKind = "image" | "video";
type CurrentMedia = { id: string; title: string; kind: CurrentMediaKind; url: string };
type MediaPreview = { kind: CurrentMediaKind; title: string; url: string; posterUrl?: string };
type PagedCollection<T> = { items: T[]; page: number; total: number; loading: boolean; loaded: boolean; error: string; categories: string[] };

const emptyCollection = <T,>(): PagedCollection<T> => ({ items: [], page: 0, total: 0, loading: false, loaded: false, error: "", categories: [] });

export function collectCanvasPanelMedia(nodes: CanvasNodeData[]): CurrentMedia[] {
    return nodes.reduce<CurrentMedia[]>((items, node) => {
        const url = node.metadata?.content;
        if (!url) return items;
        if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Panorama) items.push({ id: node.id, title: node.title || "画布图片", kind: "image", url });
        if (node.type === CanvasNodeType.Video) items.push({ id: node.id, title: node.title || "画布视频", kind: "video", url });
        return items;
    }, []);
}

export function canvasProjectMenuItemStyle(theme: CanvasTheme): CSSProperties {
    return {
        background: "transparent",
        color: theme.node.text,
    };
}

export function CanvasAssetsPanel({
    open,
    projectId,
    projectTitle,
    nodes,
    onOpenProject,
    onOpenProjects,
    onCreateProject,
    onInsertAsset,
    onLocateNode,
    onClose,
}: {
    open: boolean;
    projectId: string;
    projectTitle: string;
    nodes: CanvasNodeData[];
    onOpenProject: (id: string) => void;
    onOpenProjects: () => void;
    onCreateProject: () => void;
    onInsertAsset: (payload: InsertAssetPayload) => void;
    onLocateNode: (id: string) => void;
    onClose: () => void;
}) {
    const screens = Grid.useBreakpoint();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const userId = useUserStore((state) => state.user?.id || "");
    const projectSummaries = useCanvasStore((state) => state.summaries);
    const [activeTab, setActiveTab] = useState<PanelTab>("current");
    const [assetKind, setAssetKind] = useState<AssetKind | "all">("all");
    const [assetKeyword, setAssetKeyword] = useState("");
    const [assetSearch, setAssetSearch] = useState("");
    const [assets, setAssets] = useState<PagedCollection<Asset>>(emptyCollection);
    const [preview, setPreview] = useState<MediaPreview>();
    const requestVersions = useRef({ assets: 0 });
    const currentMedia = useMemo(() => collectCanvasPanelMedia(nodes), [nodes]);

    const loadAssets = useCallback(async (page: number, kind: AssetKind | "all", keyword: string) => {
        const requestId = ++requestVersions.current.assets;
        setAssets((current) => ({ ...current, loading: true, error: "" }));
        try {
            const result = await listLibraryAssetPage({ page, pageSize: 16, kind: kind === "all" ? undefined : kind, keyword });
            if (requestVersions.current.assets !== requestId) return;
            setAssets((current) => ({ items: page === 1 ? result.assets : uniqueById([...current.items, ...result.assets]), page: result.page, total: result.total, loading: false, loaded: true, error: "", categories: [] }));
        } catch (error) {
            if (requestVersions.current.assets !== requestId) return;
            setAssets((current) => ({ ...current, loading: false, loaded: true, error: error instanceof Error ? error.message : "素材加载失败" }));
        }
    }, []);

    useEffect(() => {
        requestVersions.current = { assets: requestVersions.current.assets + 1 };
        setAssets(emptyCollection());
    }, [userId]);

    useEffect(() => {
        if (open && activeTab === "assets" && !assets.loaded && !assets.loading) void loadAssets(1, assetKind, assetKeyword);
    }, [activeTab, assetKind, assetKeyword, assets.loaded, assets.loading, loadAssets, open]);

    const projectOptions = useMemo(() => {
        const options = projectSummaries.map((project) => ({ id: project.id, title: project.title, nodeCount: project.nodeCount }));
        if (!options.some((project) => project.id === projectId)) options.unshift({ id: projectId, title: projectTitle, nodeCount: nodes.length });
        return options;
    }, [nodes.length, projectId, projectSummaries, projectTitle]);

    const panel = (
        <div className="flex h-full min-h-0 flex-col" style={{ background: theme.node.panel, color: theme.node.text }} aria-label="Canvas 资产面板" data-testid="canvas-assets-panel">
            <header className="shrink-0 border-b px-3 pb-0 pt-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="mb-3 flex items-center gap-2">
                    <LibraryBig className="size-4" aria-hidden="true" />
                    <h2 className="min-w-0 flex-1 text-sm font-semibold">资产</h2>
                    <Tooltip title="关闭资产面板">
                        <button type="button" className="grid size-8 place-items-center rounded-lg transition hover:opacity-70" onClick={onClose} aria-label="关闭资产面板">
                            <X className="size-4" />
                        </button>
                    </Tooltip>
                </div>
                <div className="mb-2 flex gap-2">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                ...projectOptions.map((project) => ({
                                    key: project.id,
                                    style: canvasProjectMenuItemStyle(theme),
                                    label: (
                                        <span className="flex min-w-48 items-center justify-between gap-4" aria-current={project.id === projectId ? "page" : undefined}>
                                            <span className="max-w-40 truncate">{project.title}</span>
                                            <span className="text-xs opacity-45">{project.nodeCount} 节点</span>
                                        </span>
                                    ),
                                })),
                                { type: "divider" as const },
                                { key: "__all__", icon: <LayoutGrid className="size-4" />, label: "全部画布" },
                            ],
                            onClick: ({ key }) => (key === "__all__" ? onOpenProjects() : onOpenProject(key)),
                        }}
                    >
                        <button
                            type="button"
                            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 text-left text-xs font-medium transition hover:opacity-80"
                            style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover, color: theme.node.text }}
                            aria-label="切换画布"
                        >
                            <FolderOpen className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{projectTitle}</span>
                            <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                        </button>
                    </Dropdown>
                    <button
                        type="button"
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition hover:opacity-80"
                        style={{ borderColor: theme.toolbar.border, background: theme.node.panel, color: theme.node.text }}
                        onClick={onCreateProject}
                        aria-label="新建画布"
                    >
                        <Plus className="size-3.5" aria-hidden="true" />
                        新建
                    </button>
                </div>
                <div className="grid grid-cols-2" role="tablist" aria-label="资产分类">
                    <PanelTabButton label="当前" active={activeTab === "current"} count={currentMedia.length} onClick={() => setActiveTab("current")} />
                    <PanelTabButton label="素材" active={activeTab === "assets"} count={assets.loaded ? assets.total : undefined} onClick={() => setActiveTab("assets")} />
                </div>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">
                {activeTab === "current" ? <CurrentCanvasAssets items={currentMedia} onLocate={onLocateNode} onPreview={setPreview} /> : null}
                {activeTab === "assets" ? (
                    <LibraryAssets
                        collection={assets}
                        kind={assetKind}
                        keyword={assetSearch}
                        onKeywordChange={setAssetSearch}
                        onSearch={(keyword) => {
                            requestVersions.current.assets += 1;
                            setAssetKeyword(keyword);
                            setAssets(emptyCollection());
                        }}
                        onKindChange={(kind) => {
                            requestVersions.current.assets += 1;
                            setAssetKind(kind);
                            setAssets(emptyCollection());
                        }}
                        onInsert={(asset) => onInsertAsset(libraryAssetToInsertPayload(asset))}
                        onPreview={setPreview}
                        onRetry={() => void loadAssets(1, assetKind, assetKeyword)}
                        onLoadMore={() => void loadAssets(assets.page + 1, assetKind, assetKeyword)}
                    />
                ) : null}
            </div>
        </div>
    );

    return (
        <>
            {open && screens.lg === true ? (
                <aside className="h-full min-h-0 w-80 shrink-0 border-r" style={{ borderColor: theme.toolbar.border }}>
                    {panel}
                </aside>
            ) : null}
            <Drawer
                rootClassName="canvas-assets-drawer"
                placement="left"
                size={336}
                open={open && screens.lg !== true}
                closable={false}
                onClose={onClose}
                styles={{ wrapper: { maxWidth: "100vw" }, body: { height: "100%", padding: 0, overflow: "hidden" } }}
            >
                {screens.lg !== true ? panel : null}
            </Drawer>
            <MediaPreviewModal preview={preview} onClose={() => setPreview(undefined)} />
        </>
    );
}

function PanelTabButton({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            className="flex h-10 items-center justify-center gap-1 border-b-2 text-xs font-medium transition hover:opacity-75"
            style={{ borderColor: active ? theme.node.activeStroke : "transparent", color: active ? theme.node.text : theme.node.muted }}
            onClick={onClick}
        >
            {label}
            {typeof count === "number" ? <span className="text-[10px] font-normal opacity-45">{count}</span> : null}
        </button>
    );
}

function CurrentCanvasAssets({ items, onLocate, onPreview }: { items: CurrentMedia[]; onLocate: (id: string) => void; onPreview: (preview: MediaPreview) => void }) {
    const [preferredKind, setPreferredKind] = useState<CurrentMediaKind>("image");
    const images = items.filter((item) => item.kind === "image");
    const videos = items.filter((item) => item.kind === "video");
    if (!items.length) return <PanelEmpty icon={<ImageIcon className="size-5" />} text="当前画布还没有图片或视频" />;
    const kind = preferredKind === "image" && images.length ? "image" : preferredKind === "video" && videos.length ? "video" : images.length ? "image" : "video";
    const visibleItems = kind === "image" ? images : videos;
    return (
        <div className="flex h-full min-h-0 flex-col">
            {images.length && videos.length ? <MediaKindSwitch kind={kind} imageCount={images.length} videoCount={videos.length} onChange={setPreferredKind} /> : null}
            <div className="hide-scrollbar grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-2 overflow-y-auto px-3 py-3" data-testid="canvas-current-assets-grid">
                {visibleItems.map((item) => (
                    <ThumbnailActionCard key={item.id} title={item.title} action="定位" actionIcon={<LocateFixed className="size-3" />} onAction={() => onLocate(item.id)} onPreview={() => onPreview(item)}>
                        <MediaThumbnail kind={item.kind} url={item.url} title={item.title} />
                    </ThumbnailActionCard>
                ))}
            </div>
        </div>
    );
}

function LibraryAssets({
    collection,
    kind,
    keyword,
    onKeywordChange,
    onSearch,
    onKindChange,
    onInsert,
    onPreview,
    onRetry,
    onLoadMore,
}: {
    collection: PagedCollection<Asset>;
    kind: AssetKind | "all";
    keyword: string;
    onKeywordChange: (value: string) => void;
    onSearch: (value: string) => void;
    onKindChange: (value: AssetKind | "all") => void;
    onInsert: (asset: Asset) => void;
    onPreview: (preview: MediaPreview) => void;
    onRetry: () => void;
    onLoadMore: () => void;
}) {
    const kindLabels: Record<AssetKind | "all", string> = { all: "全部", image: "图片", video: "视频", audio: "音频", text: "文本" };
    return (
        <PanelScroll>
            <PanelFilters
                keyword={keyword}
                onKeywordChange={onKeywordChange}
                onSearch={onSearch}
                filterLabel={kindLabels[kind]}
                filterItems={(Object.keys(kindLabels) as Array<AssetKind | "all">).map((value) => ({ key: value, label: kindLabels[value] }))}
                onFilterChange={(value) => onKindChange(value as AssetKind | "all")}
            />
            <CollectionState collection={collection} emptyText="没有找到素材" onRetry={onRetry} />
            {collection.items.length ? (
                <div className="grid grid-cols-4 gap-2 pb-3" data-testid="canvas-library-assets-grid">
                    {collection.items.map((asset) => {
                        const preview = assetPreview(asset);
                        return (
                            <ThumbnailActionCard key={asset.id} title={asset.title} action="插入" onAction={() => onInsert(asset)} onPreview={preview ? () => onPreview(preview) : undefined}>
                                <LibraryAssetThumbnail asset={asset} />
                            </ThumbnailActionCard>
                        );
                    })}
                </div>
            ) : null}
            <LoadMore collection={collection} onLoadMore={onLoadMore} />
        </PanelScroll>
    );
}

function PanelFilters({
    keyword,
    onKeywordChange,
    onSearch,
    filterLabel,
    filterItems,
    onFilterChange,
}: {
    keyword: string;
    onKeywordChange: (value: string) => void;
    onSearch: (value: string) => void;
    filterLabel: string;
    filterItems: Array<{ key: string; label: string }>;
    onFilterChange: (value: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="sticky top-0 z-10 mb-3 flex gap-1.5 pb-2 pt-3 backdrop-blur-sm">
            <Input
                size="small"
                allowClear
                value={keyword}
                prefix={<Search className="size-3.5 opacity-55" aria-hidden="true" />}
                placeholder="搜索"
                className="min-w-0 flex-1"
                onChange={(event) => {
                    onKeywordChange(event.target.value);
                    if (!event.target.value) onSearch("");
                }}
                onPressEnter={() => onSearch(keyword.trim())}
                aria-label="搜索资产"
            />
            <Dropdown trigger={["click"]} menu={{ items: filterItems, onClick: ({ key }) => onFilterChange(key) }}>
                <button type="button" className="flex h-8 max-w-24 items-center gap-1 rounded-md border px-2 text-xs" style={{ borderColor: theme.toolbar.border, background: theme.node.panel, color: theme.node.text }} aria-label="筛选分类">
                    <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{filterLabel}</span>
                </button>
            </Dropdown>
        </div>
    );
}

function PanelScroll({ children }: { children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="hide-scrollbar h-full min-h-0 overflow-y-auto px-3" style={{ background: theme.node.panel }}>
            {children}
        </div>
    );
}

function CollectionState<T>({ collection, emptyText, onRetry }: { collection: PagedCollection<T>; emptyText: string; onRetry: () => void }) {
    if (collection.loading && !collection.items.length)
        return (
            <div className="grid min-h-40 place-items-center">
                <Spin size="small" />
            </div>
        );
    if (collection.error && !collection.items.length) return <PanelError message={collection.error} onRetry={onRetry} />;
    if (collection.loaded && !collection.items.length) return <PanelEmpty icon={<Search className="size-5" />} text={emptyText} />;
    return null;
}

function LoadMore<T>({ collection, onLoadMore }: { collection: PagedCollection<T>; onLoadMore: () => void }) {
    if (!collection.items.length || collection.items.length >= collection.total) return null;
    return (
        <button type="button" className="mb-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs transition hover:opacity-70" onClick={onLoadMore} disabled={collection.loading}>
            {collection.loading ? <Spin size="small" /> : null}
            加载更多
        </button>
    );
}

function ThumbnailActionCard({ title, action, actionIcon, onAction, onPreview, children }: { title: string; action: string; actionIcon?: ReactNode; onAction: () => void; onPreview?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <article className="min-w-0" title={title}>
            {onPreview ? (
                <button
                    type="button"
                    className="block aspect-square w-full overflow-hidden rounded-md border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2"
                    style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                    onClick={onPreview}
                    aria-label={`预览${title}`}
                >
                    {children}
                </button>
            ) : (
                <div className="aspect-square w-full overflow-hidden rounded-md border" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    {children}
                </div>
            )}
            <button type="button" className="mt-1 flex h-5 w-full items-center justify-center gap-1 text-[11px] font-medium transition hover:opacity-65" style={{ color: theme.toolbar.item }} onClick={onAction} aria-label={`${action}${title}`}>
                {actionIcon}
                {action}
            </button>
        </article>
    );
}

function MediaKindSwitch({ kind, imageCount, videoCount, onChange }: { kind: CurrentMediaKind; imageCount: number; videoCount: number; onChange: (kind: CurrentMediaKind) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="mx-3 mt-3 grid grid-cols-2 gap-1 rounded-lg border p-1" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }} role="tablist" aria-label="当前资产类型">
            {(["image", "video"] as const).map((value) => {
                const active = kind === value;
                return (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className="h-7 rounded-md text-xs font-medium transition"
                        style={{ background: active ? theme.node.panel : "transparent", color: active ? theme.node.text : theme.node.muted }}
                        onClick={() => onChange(value)}
                    >
                        {value === "image" ? "图片" : "视频"} <span className="text-[10px] opacity-45">{value === "image" ? imageCount : videoCount}</span>
                    </button>
                );
            })}
        </div>
    );
}

function MediaThumbnail({ kind, url, title, posterUrl }: { kind: CurrentMediaKind; url: string; title: string; posterUrl?: string }) {
    if (kind === "image") return <img src={imagePreviewUrl(url, 320)} alt={title} className="size-full object-cover" loading="lazy" />;
    return <video src={url} poster={posterUrl ? imagePreviewUrl(posterUrl, 320) : undefined} aria-label={title} className="pointer-events-none size-full object-cover" muted playsInline preload="metadata" />;
}

function LibraryAssetThumbnail({ asset }: { asset: Asset }) {
    const preview = assetPreview(asset);
    if (preview) return <MediaThumbnail {...preview} />;
    if (asset.kind === "audio") return <FallbackThumbnail icon={<FileAudio className="size-5" />} />;
    return <FallbackThumbnail icon={<FileText className="size-5" />} />;
}

function FallbackThumbnail({ icon }: { icon: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="grid size-full place-items-center" style={{ color: theme.node.muted }}>
            {icon}
        </div>
    );
}

function PanelEmpty({ icon, text }: { icon: ReactNode; text: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="grid min-h-48 place-items-center px-5 text-center">
            <div>
                <div className="mx-auto mb-2 grid size-9 place-items-center rounded-full" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    {icon}
                </div>
                <p className="text-xs" style={{ color: theme.node.muted }}>
                    {text}
                </p>
            </div>
        </div>
    );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="grid min-h-48 place-items-center px-5 text-center">
            <div>
                <p className="mb-2 text-xs" style={{ color: theme.node.danger }}>
                    {message}
                </p>
                <button type="button" className="mx-auto flex items-center gap-1 text-xs" onClick={onRetry}>
                    <RefreshCw className="size-3.5" />
                    重试
                </button>
            </div>
        </div>
    );
}

function MediaPreviewModal({ preview, onClose }: { preview?: MediaPreview; onClose: () => void }) {
    return (
        <Modal open={Boolean(preview)} onCancel={onClose} footer={null} centered width="auto" destroyOnHidden title={null} styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "82dvh" } }}>
            {preview?.kind === "image" ? <img src={imagePreviewUrl(preview.url, 1920)} alt={preview.title} className="block max-h-[82dvh] max-w-[min(88vw,1100px)] rounded-lg object-contain" /> : null}
            {preview?.kind === "video" ? (
                <video
                    src={preview.url}
                    poster={preview.posterUrl ? imagePreviewUrl(preview.posterUrl, 1280) : undefined}
                    aria-label={preview.title}
                    className="block max-h-[82dvh] max-w-[min(88vw,1100px)] rounded-lg object-contain"
                    controls
                    autoPlay
                    playsInline
                />
            ) : null}
        </Modal>
    );
}

function assetPreview(asset: Asset): MediaPreview | undefined {
    if (asset.kind === "image") return { kind: "image", title: asset.title, url: asset.data.serverUrl || asset.data.remoteUrl || asset.data.dataUrl };
    if (asset.kind === "video") return { kind: "video", title: asset.title, url: asset.data.serverUrl || asset.data.remoteUrl || asset.data.url, posterUrl: asset.coverUrl || undefined };
    return undefined;
}

function uniqueById<T extends { id: string }>(items: T[]) {
    return [...new Map(items.map((item) => [item.id, item])).values()];
}
