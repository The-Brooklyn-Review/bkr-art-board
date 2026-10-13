import type { MetadataRoute } from "next";

// Everything but share links is behind the password gate already — this
// is a second layer so well-behaved crawlers don't even try. Share pages
// stay fetchable on purpose: link-preview bots (X, LinkedIn) honour
// robots.txt and would show no preview, and a crawler that can't fetch a
// page never sees its noindex, so a share URL posted somewhere public
// could still be listed by its address. Fetchable + noindex (layout
// metadata and the X-Robots-Tag header in next.config.ts) keeps it out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/share/",
      disallow: "/",
    },
  };
}
