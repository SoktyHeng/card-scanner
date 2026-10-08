import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.121"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;
