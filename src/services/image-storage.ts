"use client";

import { browserReadableMediaUrl } from "@/lib/browser-media-url";
import { readImageMeta } from "@/lib/image-utils";
import { blobToDataUrl, getServerMediaBlob, serverMediaUrl, uploadServerMedia } from "@/services/server-media-storage";

export type UploadedImage = {
    url: string;
    storageKey: string;
    remoteUrl?: string;
    serverUrl?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    const stored = await uploadServerMedia(input, "image");
    // The standalone runtime stores local uploads as data URLs. Keep that
    // inline value so Canvas remains usable without any media server route.
    const displayUrl = stored.url.startsWith("data:") ? stored.url : await resolveStoredImageDataUrl(stored.storageKey, stored.url);
    const meta = await readImageMeta(displayUrl);
    return { ...stored, url: displayUrl, serverUrl: stored.url.startsWith("data:") ? undefined : stored.url, width: meta.width, height: meta.height, mimeType: stored.mimeType || meta.mimeType };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    return serverMediaUrl(storageKey, fallback);
}

export async function resolveStoredImageDataUrl(storageKey?: string, fallback = "") {
    if (fallback.startsWith("data:")) return fallback;
    const local = await readStandaloneLocalMedia(storageKey);
    if (local) return local;
    if (typeof window !== "undefined" && (window as Window & { __SOCIAL_COW_STATIC__?: boolean }).__SOCIAL_COW_STATIC__ && /^(?:https?:\/\/|blob:)/i.test(fallback.trim())) return fallback;
    return serverMediaUrl(storageKey, fallback);
}

async function readStandaloneLocalMedia(storageKey?: string) {
    if (typeof window === "undefined" || !(window as Window & { __SOCIAL_COW_STATIC__?: boolean }).__SOCIAL_COW_STATIC__ || !storageKey) return "";
    try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("social-cow-creative-static");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const records = await new Promise<Array<{ id: string; dataUrl: string }>>((resolve, reject) => {
            const request = db.transaction("media", "readonly").objectStore("media").getAll();
            request.onsuccess = () => resolve(request.result as Array<{ id: string; dataUrl: string }>);
            request.onerror = () => reject(request.error);
        });
        const key = storageKey.replace(/\\/g, "/");
        db.close();
        const match = records.find((item) => item.id === key || item.id.endsWith(`/${key}`) || item.id.split("/").at(-1) === key);
        return match?.dataUrl?.startsWith("data:") ? match.dataUrl : "";
    } catch {
        return "";
    }
}

export function getImageBlob(storageKey: string, fallback = "") {
    return getServerMediaBlob(storageKey, fallback);
}

export async function setImageBlob(_storageKey: string, blob: Blob) {
    return (await uploadServerMedia(blob, "image")).url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; remoteUrl?: string; serverUrl?: string; storageKey?: string }) {
    const candidates = uniqueImageSources([serverMediaUrl(image.storageKey, image.serverUrl || image.url || image.dataUrl), image.serverUrl, image.remoteUrl, image.url, image.dataUrl]);
    let fallback = "";
    for (const url of candidates) {
        if (url.startsWith("data:")) return url;
        fallback ||= browserReadableMediaUrl(url);
        try {
            const response = await fetch(browserReadableMediaUrl(url), { cache: "no-store" });
            if (response.ok) return blobToDataUrl(await response.blob());
        } catch {
            // Continue with another stable server or upstream source.
        }
    }
    return fallback;
}

export async function deleteStoredImages(keys: Iterable<string>) {
    return deleteServerMedia(keys);
}

function uniqueImageSources(values: Array<string | undefined>) {
    return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean)));
}

async function deleteServerMedia(keys: Iterable<string>) {
    const storageKeys = Array.from(new Set(Array.from(keys, (key) => key.trim()).filter(Boolean)));
    if (!storageKeys.length) return { deletedFiles: 0, blocked: [] };
    const response = await fetch("/api/media-assets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storageKeys }) });
    const payload = (await response.json().catch(() => ({}))) as { data?: { deletedFiles?: number; blocked?: unknown[] }; msg?: string };
    if (!response.ok) throw new Error(payload.msg || "服务器图片删除失败");
    if (payload.data?.blocked?.length) throw new Error("部分图片仍被会话、项目或素材库引用，服务器文件已保留");
    return payload.data || { deletedFiles: 0, blocked: [] };
}
