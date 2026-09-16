import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { App as AntApp, Spin } from "antd";

import { AppProviders } from "@/components/layout/app-providers";
import { AppWorkspaceShell } from "@/components/layout/app-workspace-shell";
import CanvasPage from "@/app/(user)/canvas/page";
import CanvasProjectPage from "@/app/(user)/canvas/[id]/page";
import { initializeStandaloneSession, usePublicSessionStore } from "@/stores/use-public-session-store";
import { ApiKeyGate } from "./api-key-gate";

export function StandaloneApp() {
    const basename = typeof window !== "undefined" && window.location.pathname.startsWith("/creative") ? "/creative" : undefined;
    return (
        <BrowserRouter basename={basename}>
            <AppProviders>
                <ApiKeyGate>
                    <RoutesRoot />
                </ApiKeyGate>
            </AppProviders>
        </BrowserRouter>
    );
}

function RoutesRoot() {
    const sessionReady = usePublicSessionStore((state) => state.ready);
    useEffect(() => {
        initializeStandaloneSession();
    }, []);
    if (!sessionReady) return <LoadingScreen />;
    return (
        <AppWorkspaceShell>
            <Routes>
                <Route path="/canvas" element={<CanvasPage />} />
                <Route path="/canvas/:id" element={<CanvasProjectPage />} />
                <Route path="*" element={<Navigate to="/canvas" replace />} />
            </Routes>
        </AppWorkspaceShell>
    );
}

function LoadingScreen() {
    return (
        <div className="grid h-dvh place-items-center bg-background">
            <AntApp>
                <Spin />
            </AntApp>
        </div>
    );
}
