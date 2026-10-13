import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Next infers the workspace root from the nearest lockfile
  // above this directory — there's another package-lock.json further up
  // this machine's directory tree, so builds emit a warning and resolution
  // ends up depending on a file outside this repo entirely.
  turbopack: {
    root: __dirname,
  },
  // Never indexed, archived or used for AI training — on every response,
  // not just HTML: the noindex <meta> (layout.tsx) can't cover images and
  // API responses, and robots.txt only asks crawlers not to fetch. Link
  // previews (Slack, iMessage) still work; this only affects indexing.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
