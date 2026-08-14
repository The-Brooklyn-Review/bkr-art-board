import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Next infers the workspace root from the nearest lockfile
  // above this directory — there's another package-lock.json further up
  // this machine's directory tree, so builds emit a warning and resolution
  // ends up depending on a file outside this repo entirely.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
