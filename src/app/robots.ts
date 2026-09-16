import type { MetadataRoute } from "next";

import { absoluteSiteUrl, siteMetadataBase } from "@/lib/server/site-metadata";

export default function robots(): MetadataRoute.Robots {
    const base = siteMetadataBase();
    return {
        rules: {
            userAgent: "*",
            allow: ["/"],
            disallow: ["/api/", "/canvas", "/install", "/login", "/register", "/forgot-password"],
        },
        sitemap: absoluteSiteUrl("/sitemap.xml", base),
    };
}
