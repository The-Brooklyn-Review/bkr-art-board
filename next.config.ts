import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Next infers the workspace root from the nearest lockfile
  // above this directory — there's another package-lock.json further up
  // this machine's directory tree, so builds emit a warning and resolution
  // ends up depending on a file outside this repo entirely.
  turbopack: {
    root: __dirname,
  },
  // The share-link preview cards (/share/…/og) render with sharp. Its
  // native libvips library is loaded at runtime, so Next's file tracing
  // doesn't see it and Vercel's function bundle shipped without it ("cannot
  // open shared object file: libvips-cpp.so"). Listed here explicitly.
  // Only installed on Linux, so this matches nothing on a Mac build.
  outputFileTracingIncludes: {
    "/share/**": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
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
