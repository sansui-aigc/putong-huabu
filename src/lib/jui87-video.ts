const JUI87_VIDEO_HOSTS = new Set(["api.jui87.com", "sub.jui87.com"]);

/**
 * JUI87 exposes the New API gateway and the Sub2 video gateway on different
 * hosts. Video requests are sent to the user-configured gateway as-is so the
 * same API key authenticates consistently; New API forwards video calls to
 * Sub2 upstream. No host rewriting is performed here.
 */
export function resolveJui87VideoBaseUrl(baseUrl: string, protocol?: string) {
    const value = baseUrl.trim();
    if (!value) return value;
    return value.replace(/\/$/, "");
}

export function isJui87VideoBaseUrl(baseUrl: string) {
    try {
        return JUI87_VIDEO_HOSTS.has(new URL(baseUrl).hostname.toLowerCase());
    } catch {
        return false;
    }
}

/** Build a video API URL when callers pass either a gateway root or /v1 base. */
export function buildJui87VideoApiUrl(baseUrl: string, path: string, protocol?: string) {
    if (/^https?:\/\//i.test(path)) return path;
    const base = resolveJui87VideoBaseUrl(baseUrl, protocol).replace(/\/v1\/?$/i, "");
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
