export const DEFAULT_SITE_TITLE = "社会牛码创作工作台";

export function resolveSiteTitle(value: unknown) {
    const title = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_SITE_TITLE;
    const legacyTitle = ["VOZEB", "PRO"].join(" ");
    return title === legacyTitle ? DEFAULT_SITE_TITLE : title;
}
