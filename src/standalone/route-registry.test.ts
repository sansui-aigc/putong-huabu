import { describe, expect, it } from "vitest";

import { apiRoutes } from "./route-registry";

describe("standalone API route registry", () => {
    it.each(["/api/maintenance/generation-tasks/heartbeat", "/api/maintenance/generation-tasks/run"])("registers the worker endpoint %s", (pathname) => {
        const route = apiRoutes.find((item) => item.pattern.test(pathname));

        expect(route).toBeDefined();
        expect(route?.module.POST).toEqual(expect.any(Function));
    });
});
