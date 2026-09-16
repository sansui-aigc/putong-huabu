import type { MetadataRoute } from "next";

import { absoluteSiteUrl, siteMetadataBase } from "@/lib/server/site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
    const base = siteMetadataBase();
    return [{ url: absoluteSiteUrl("/", base), changeFrequency: "weekly", priority: 1 }];
}
