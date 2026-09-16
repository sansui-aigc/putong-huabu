import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getInstallStatus: vi.fn(),
    getPublicSiteSettings: vi.fn(),
    redirect: vi.fn(),
}));

vi.mock("@/compat/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/site-metadata", () => ({ getPublicSiteSettings: mocks.getPublicSiteSettings }));
vi.mock("@/lib/server/install-status", () => ({ getInstallStatus: mocks.getInstallStatus }));
vi.mock("./install/install-scroll-unlock", () => ({ InstallScrollUnlock: () => null }));
vi.mock("./install/install-wizard", () => ({ InstallWizard: () => null }));

import HomePage from "./page";
import InstallPage from "./install/page";

describe("installation page routing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPublicSiteSettings.mockResolvedValue({
            title: "社会牛码",
            logoUrl: "/logo.svg",
            seoDescription: "",
            footerCopyright: "",
            privacyUrl: "",
            termsUrl: "",
            friendLinks: [],
            socials: {},
        });
        mocks.redirect.mockImplementation((path: string) => {
            throw new Error(`redirect:` + path);
        });
    });

    it("redirects the standalone root to the Canvas workspace", async () => {
        expect(() => HomePage()).toThrow("redirect:/canvas");
        expect(mocks.redirect).toHaveBeenCalledWith("/canvas");
    });

    it("keeps the installation page until setup is complete", async () => {
        mocks.getInstallStatus.mockResolvedValue({ ready: false });

        await expect(InstallPage()).resolves.toBeTruthy();
        expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("redirects completed installations away from the setup page", async () => {
        mocks.getInstallStatus.mockResolvedValue({ ready: true });

        await expect(InstallPage()).rejects.toThrow("redirect:/");
        expect(mocks.redirect).toHaveBeenCalledWith("/");
    });
});
