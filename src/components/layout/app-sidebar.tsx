"use client";

import Link from "@/compat/link";
import { usePathname, useRouter } from "@/compat/navigation";

import { SiteLogo } from "@/components/layout/site-logo";
import { navigationGroups, navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { DEFAULT_SITE_TITLE, resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";

export function AppSidebar({ activeToolSlug, expanded }: { activeToolSlug?: NavigationToolSlug; expanded: boolean }) {
    const pathname = usePathname();
    const router = useRouter();
    const site = usePublicSessionStore((state) => state.payload?.settings?.site) || { title: DEFAULT_SITE_TITLE, logoUrl: "/logo.svg" };
    const siteTitle = resolveSiteTitle(site.title);

    return (
        <aside
            className={cn(
                "vozeb-sidebar hidden h-full shrink-0 flex-col border-r border-[#dfe5ed] bg-white text-[#172033] transition-[width] duration-200 lg:flex dark:border-[#29313d] dark:bg-[#151a21] dark:text-[#f3f5f7]",
                expanded ? "w-44" : "w-[72px]",
            )}
        >
            <Link href="/canvas" className={cn("flex h-16 shrink-0 items-center border-b border-[#e7ebf1] px-3 dark:border-[#29313d]", expanded ? "justify-start px-5" : "justify-center")} aria-label={siteTitle}>
                <SiteLogo logoUrl={site.logoUrl} className="size-8" />
                {expanded ? (
                    <span className="ml-3 min-w-0">
                        <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{siteTitle}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a96a6] dark:text-[#748194]">Canvas studio</span>
                    </span>
                ) : null}
            </Link>

            <nav className={cn("hide-scrollbar min-h-0 flex-1 overflow-y-auto py-5", expanded ? "px-3" : "px-2")} aria-label="工作空间导航">
                {navigationGroups.map((group, groupIndex) => {
                    const tools = navigationTools.filter((tool) => tool.group === group.id);
                    return (
                        <div key={group.id} className={cn(groupIndex > 0 && "mt-[22px]")}>
                            {expanded ? <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa6b5] dark:text-[#748194]">{group.label}</div> : null}
                            <div className="space-y-1">
                                {tools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    const primary = "primary" in tool && tool.primary;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            href={`/${tool.slug}`}
                                            prefetch
                                            title={tool.label}
                                            onMouseEnter={() => router.prefetch(`/${tool.slug}`)}
                                            onFocus={() => router.prefetch(`/${tool.slug}`)}
                                            className={cn(
                                                "group relative flex h-[42px] items-center rounded-[8px] px-2 text-sm font-medium transition-colors duration-150",
                                                expanded ? "justify-start gap-3 px-3" : "justify-center",
                                                active
                                                    ? "bg-[#edf4ff] text-[#174ea6] shadow-[inset_3px_0_0_#2563eb] dark:bg-[#1d2a40] dark:text-[#d9e8ff]"
                                                    : primary
                                                      ? "text-[#243247] hover:bg-[#f3f6fa] dark:text-[#d4d9df] dark:hover:bg-[#20242a]"
                                                      : "text-[#647286] hover:bg-[#f3f6fa] hover:text-[#243247] dark:text-[#aab5c4] dark:hover:bg-[#20242a] dark:hover:text-[#f3f5f7]",
                                            )}
                                            aria-current={active ? "page" : undefined}
                                        >
                                            <Icon className={cn("size-[18px] shrink-0", active ? "text-[#2563eb]" : "text-[#8290a3] dark:text-[#8592a4]")} />
                                            {expanded ? <span className="min-w-0 truncate">{tool.label}</span> : null}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>
        </aside>
    );
}
