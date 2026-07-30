import type { MetadataRoute } from "next";

const siteUrl = "https://taekchef.github.io/claude-code-zh-cn/";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
