import { Maximize2 } from "lucide-react";

export const navigationGroups = [{ id: "studio", label: "创作工作台" }] as const;

export const landingNavigationTools = [
    { slug: "canvas", label: "画布" },
] as const;

export const navigationTools = [
    {
        slug: "canvas",
        label: "画布",
        description: "节点式创作与画布 Agent",
        group: "studio",
        icon: Maximize2,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
export type NavigationGroupId = (typeof navigationGroups)[number]["id"];

export function navigationToolForPathname(pathname: string) {
    const slug = pathname.split("/").filter(Boolean)[0];
    return navigationTools.find((tool) => tool.slug === slug);
}
