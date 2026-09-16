"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { App } from "antd";
import { usePathname } from "@/compat/navigation";

import { applyPublicSystemSettings, useConfigStore } from "@/stores/use-config-store";
import { inferModelCapability, capabilityFromHint } from "@/lib/model-capability";
import { useUserStore } from "@/stores/use-user-store";
import { initializeStandaloneSession, loadPublicSession, PUBLIC_SETTINGS_CHANGED_EVENT } from "@/stores/use-public-session-store";
import { loadCreativeModelCatalogs, staticModelProtocolLabel } from "@/standalone/static-runtime";
import { isNativeGeminiImageModelName } from "@/standalone/gemini-image";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const pathname = usePathname();
    const installRoute = pathname === "/install";
    const standaloneBuild = typeof window !== "undefined" && Boolean((window as Window & { __SOCIAL_COW_STATIC__?: boolean }).__SOCIAL_COW_STATIC__);
    const setConfig = useConfigStore((state) => state.setConfig);
    const setUser = useUserStore((state) => state.setUser);

    useEffect(() => {
        if (installRoute) return;
        let cancelled = false;
        const hydrate = (force = false) => {
            const sessionRequest = standaloneBuild ? Promise.resolve(initializeStandaloneSession()) : loadPublicSession({ force });
            void sessionRequest
                .then((payload) => {
                    if (cancelled) return;
                    setUser(payload.user || null);
                    const settings = { ...(payload.settings || {}) } as NonNullable<typeof payload.settings>;
                    void loadCreativeModelCatalogs().then((catalogs) => {
                        const systemChannels = catalogs.filter((catalog) => catalog.models.length).map((catalog) => ({
                            id: catalog.connection.id,
                            name: catalog.connection.name,
                            baseUrl: `/api/ai/system/${encodeURIComponent(catalog.connection.id)}`,
                            apiFormat: "openai" as const,
                            apiKey: "system",
                            models: catalog.models.map((item) => item.id),
                        }));
                        const logicalModels = catalogs.flatMap((catalog) => catalog.models.map((item) => {
                            const id = `${catalog.connection.id}::${item.id}`;
                            return {
                                id,
                                name: `${item.id} · ${staticModelProtocolLabel(item)}（${catalog.connection.name}）`,
                                capability: item.capability || (isNativeGeminiImageModelName(item.id) ? "image" : undefined) || capabilityFromHint(item.capabilities) || inferModelCapability(item.id),
                                enabled: true,
                                bindings: [{ id: `${id}:binding`, channelId: catalog.connection.id, upstreamModel: item.id, enabled: true, priority: 0 }],
                            };
                        }));
                        setConfig(applyPublicSystemSettings(useConfigStore.getState().config, { ...settings, systemChannels, logicalModels }));
                    }).catch(() => setConfig(applyPublicSystemSettings(useConfigStore.getState().config, settings)));
                })
                .catch(() => undefined);
        };
        const handleSettingsChanged = () => hydrate(true);
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") hydrate(true);
        };
        hydrate();
        window.addEventListener(PUBLIC_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            cancelled = true;
            window.removeEventListener(PUBLIC_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [installRoute, setConfig, setUser, standaloneBuild]);

    useEffect(() => {
        const handleMissingConfig = () => {
            message.warning("尚未配置可用的中转站模型");
        };
        window.addEventListener("vozeb-pro-system-config-missing", handleMissingConfig);
        return () => window.removeEventListener("vozeb-pro-system-config-missing", handleMissingConfig);
    }, [message]);

    return children;
}
