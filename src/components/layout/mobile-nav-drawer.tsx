"use client";

import { Drawer } from "antd";
import Link from "@/compat/link";
import { usePathname, useRouter } from "@/compat/navigation";
import { useEffect, useRef } from "react";

import { SiteLogo } from "@/components/layout/site-logo";
import { navigationGroups, navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { DEFAULT_SITE_TITLE, resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    const pathname = usePathname();
    const router = useRouter();
    const previousPathnameRef = useRef(pathname);
    const site = usePublicSessionStore((state) => state.payload?.settings?.site) || { title: DEFAULT_SITE_TITLE, logoUrl: "/logo.svg" };
    const siteTitle = resolveSiteTitle(site.title);

    useEffect(() => {
        if (previousPathnameRef.current === pathname) return;
        previousPathnameRef.current = pathname;
        onClose();
    }, [onClose, pathname]);

    return (
        <Drawer
            title={
                <Link href="/canvas" onClick={onClose} className="inline-flex min-w-0 items-center gap-2.5 text-base font-semibold leading-none text-[#20242a] dark:text-[#f3f5f7]">
                    <SiteLogo logoUrl={site.logoUrl} className="size-8" />
                    <span className="truncate">{siteTitle}</span>
                </Link>
            }
            placement="left"
            size={288}
            open={open}
            onClose={onClose}
            className="lg:hidden"
            styles={{ header: { borderBottomColor: "var(--border)", minHeight: 60, padding: "12px 16px" }, body: { padding: "12px 14px 18px" } }}
        >
            {navigationGroups.map((group, groupIndex) => (
                <div key={group.id} className={cn(groupIndex > 0 && "mt-5")}>
                    <div className="mb-1 px-3 text-[11px] font-medium text-[#9aa2ad] dark:text-[#737d89]">{group.label}</div>
                    <div className="space-y-1">
                        {navigationTools
                            .filter((tool) => tool.group === group.id)
                            .map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Link
                                        key={tool.slug}
                                        href={`/${tool.slug}`}
                                        prefetch
                                        onMouseEnter={() => router.prefetch(`/${tool.slug}`)}
                                        onFocus={() => router.prefetch(`/${tool.slug}`)}
                                        onClick={onClose}
                                        className={cn(
                                            "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                                            active
                                                ? "bg-[#f0f2f4] font-medium text-[#1d2127] dark:bg-[#22262c] dark:text-[#f3f5f7]"
                                                : "text-[#697381] hover:bg-[#f3f5f7] hover:text-[#20242a] dark:text-[#9aa3af] dark:hover:bg-[#20242a] dark:hover:text-[#f3f5f7]",
                                        )}
                                        aria-current={active ? "page" : undefined}
                                    >
                                        <Icon className="size-[18px] shrink-0" />
                                        <span className="min-w-0 flex-1 truncate">{tool.label}</span>
                                        <span className={cn("size-1.5 rounded-full", active ? "bg-current" : "bg-transparent")} />
                                    </Link>
                                );
                            })}
                    </div>
                </div>
            ))}
        </Drawer>
    );
}
