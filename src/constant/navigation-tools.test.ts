import { describe, expect, it } from "vitest";

import { landingNavigationTools, navigationGroups, navigationTools } from "./navigation-tools";

describe("user navigation order", () => {
    it("keeps the extracted workspace entries in their dedicated order", () => {
        expect(landingNavigationTools).toEqual([
            { slug: "canvas", label: "画布" },
        ]);
    });

    it("only exposes Canvas Agent in workspace navigation", () => {
        expect(navigationGroups.map((group) => group.label)).toEqual(["创作工作台"]);
        expect(navigationTools.map((tool) => tool.slug)).toEqual(["canvas"]);
        expect(navigationTools.map((tool) => tool.group)).toEqual(["studio"]);
    });
});
