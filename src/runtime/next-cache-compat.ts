export function unstable_cache<T extends (...args: never[]) => Promise<unknown>>(callback: T, _keys?: string[], _options?: unknown) {
    return callback;
}

export function revalidateTag(_tag: string, _profile?: string) {}
