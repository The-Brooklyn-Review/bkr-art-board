import type { MetadataRoute } from "next";

// Everything here is behind a password gate already — this is a second,
// belt-and-suspenders layer so well-behaved crawlers don't even try.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
