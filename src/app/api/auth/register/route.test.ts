import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "@/runtime/next-server-compat";

const mocks = vi.hoisted(() => ({
    checkAuthRateLimit: vi.fn(),
    createFirstAdmin: vi.fn(),
    createSession: vi.fn(),
    createUser: vi.fn(),
    getInstallStatus: vi.fn(),
    readJsonBody: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
    createFirstAdmin: mocks.createFirstAdmin,
    createSession: mocks.createSession,
    createUser: mocks.createUser,
    isAuthInputError: vi.fn(() => false),
}));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/auth/session", () => ({
    serializeCurrentUser: vi.fn((user) => user),
    setSessionCookie: vi.fn(),
}));
vi.mock("@/lib/server/install-status", () => ({ getInstallStatus: mocks.getInstallStatus, invalidateInstallStatusCache: vi.fn() }));
vi.mock("@/lib/server/security", () => ({ checkAuthRateLimit: mocks.checkAuthRateLimit }));

import { POST } from "./route";

function registerRequest() {
    return new NextRequest("http://localhost/api/auth/register", {
        method: "POST",
    });
}

describe("POST /api/auth/register", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getInstallStatus.mockResolvedValue({ ready: true, firstAdminRequired: false });
        mocks.checkAuthRateLimit.mockResolvedValue({ allowed: true });
        mocks.createUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.createFirstAdmin.mockResolvedValue({ id: "admin-one", role: "admin" });
        mocks.createSession.mockResolvedValue("session-token");
    });

    it("creates the first administrator without commercial attribution fields", async () => {
        mocks.getInstallStatus.mockResolvedValue({ ready: false, firstAdminRequired: true });
        mocks.readJsonBody.mockResolvedValue({ username: "admin", password: "password123", installToken: "install-token" });

        const response = await POST(registerRequest());

        expect(response.status).toBe(200);
        expect(mocks.createFirstAdmin).toHaveBeenCalledWith(expect.objectContaining({ username: "admin", installToken: "install-token" }));
        expect(mocks.createUser).not.toHaveBeenCalled();
    });

    it("passes missing policy agreement as false for server-side validation", async () => {
        mocks.readJsonBody.mockResolvedValue({ username: "new-user", password: "password123" });

        await POST(registerRequest());

        expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ policyAccepted: false }));
    });
});
