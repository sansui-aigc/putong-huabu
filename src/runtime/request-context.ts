import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<Request>();

export function runWithRequest<T>(request: Request, callback: () => T) {
    return storage.run(request, callback);
}

export function currentRequest() {
    return storage.getStore();
}
