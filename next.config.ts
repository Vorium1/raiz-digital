import type { NextConfig } from "next";
import { getHttpSecurityHeaders } from "./src/domain/http-security";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    deviceSizes: [640, 768, 1024, 1440],
    minimumCacheTTL: 86400,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getHttpSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
