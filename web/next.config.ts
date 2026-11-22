import path from "node:path";
import type { NextConfig } from "next";

const workspaceRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    "/api/check": ["../engine/data/recalls.json"],
    "/api/peptide-recalls": ["../engine/data/recalls.json"],
  },
  turbopack: {
    root: workspaceRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
