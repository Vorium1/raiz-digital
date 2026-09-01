import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    deviceSizes: [640, 768, 1024, 1440],
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
