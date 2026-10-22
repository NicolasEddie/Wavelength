import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Exported band data and hero images change only when the pipeline is re-run.
        // Cache for an hour, then revalidate in the background, so switching targets is instant.
        source: "/:dir(data|hero)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
