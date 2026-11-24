import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/agendar`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/mis-citas`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
