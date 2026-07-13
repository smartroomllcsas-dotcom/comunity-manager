import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.comunitymanager.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/terms", "/data-deletion"],
        disallow: [
          "/api/",
          "/dashboard/",
          "/inbox/",
          "/settings/",
          "/reports/",
          "/broadcasts/",
          "/contacts/",
          "/chatbot/",
          "/clients/",
          "/webhooks/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
