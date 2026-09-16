"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import { ClientRootInit } from "@/components/layout/client-root-init";
import { getAntThemeConfig } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60_000,
            gcTime: 15 * 60_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

dayjs.locale("zh-cn");

export function AppProviders({ children }: { children: ReactNode }) {
    const theme = useThemeStore((state) => state.theme);
    const dark = theme === "dark";

    useEffect(() => {
        const reportChunkError = (reason: unknown) => {
            const text = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason);
            if (!/ChunkLoadError|Loading chunk|dynamically imported module|failed to fetch/i.test(text)) return;
            console.error("[app] 页面资源加载失败，请手动重新加载当前画布", reason);
        };

        const handleError = (event: ErrorEvent) => reportChunkError(event.error || event.message);
        const handleRejection = (event: PromiseRejectionEvent) => reportChunkError(event.reason);
        window.addEventListener("error", handleError);
        window.addEventListener("unhandledrejection", handleRejection);
        return () => {
            window.removeEventListener("error", handleError);
            window.removeEventListener("unhandledrejection", handleRejection);
        };
    }, []);

    useLayoutEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = theme;
    }, [dark, theme]);

    return (
        <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark)}>
            <App message={{ top: 84, duration: 2.4, maxCount: 3 }}>
                <QueryClientProvider client={queryClient}>
                    <ClientRootInit>{children}</ClientRootInit>
                </QueryClientProvider>
            </App>
        </ConfigProvider>
    );
}
