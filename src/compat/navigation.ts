import { useCallback, useMemo } from "react";
import { useLocation, useNavigate as useReactRouterNavigate, useParams as useReactRouterParams, useSearchParams as useReactRouterSearchParams } from "react-router-dom";

export function usePathname() {
    return useLocation().pathname;
}

export function useSearchParams() {
    const [params] = useReactRouterSearchParams();
    return params;
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>() {
    return useReactRouterParams() as T;
}

export function useRouter() {
    const navigate = useReactRouterNavigate();
    const push = useCallback(
        (url: string) => {
            void navigate(url);
        },
        [navigate],
    );
    const replace = useCallback(
        (url: string) => {
            void navigate(url, { replace: true });
        },
        [navigate],
    );
    const back = useCallback(() => void navigate(-1), [navigate]);
    const refresh = useCallback(() => void navigate(0), [navigate]);
    const prefetch = useCallback((_url?: string) => undefined, []);
    return useMemo(() => ({ push, replace, back, refresh, prefetch }), [back, prefetch, push, refresh, replace]);
}

export function redirect(url: string): never {
    if (typeof window !== "undefined") window.location.replace(url);
    throw new Error(`Redirect: ${url}`);
}
