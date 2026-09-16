export function isFullscreenWorkspacePath(pathname: string) {
    return /^\/(?:canvas)\/[^/]+(?:\/|$)/.test(pathname);
}
