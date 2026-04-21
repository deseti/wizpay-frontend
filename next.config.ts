import path from "node:path";

import type { NextConfig } from "next";

const reownAppKitCoreShim = path.resolve(
  __dirname,
  "lib/shims/reown-appkit-core.ts"
);
const reownAppKitCoreShimImport = "./lib/shims/reown-appkit-core.ts";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@reown/appkit/core": reownAppKitCoreShimImport,
    },
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias["@reown/appkit/core"] = reownAppKitCoreShim;
    return config;
  },
};

export default nextConfig;
