import type { NextConfig } from "next";

// Sharing the dev server through a VS Code forwarded port: the browser sends the
// tunnel host as Origin while the server sees localhost, so Server Actions are
// rejected unless the tunnel host is allowed. Development only.
const devTunnelHosts =
  process.env.NODE_ENV === "development" ? ["**.devtunnels.ms"] : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: devTunnelHosts,
  experimental: {
    serverActions: {
      allowedOrigins: devTunnelHosts,
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  // PDF rendering loads a native canvas and its own font files at run time.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
