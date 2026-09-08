import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dkqfwocdittldjxujjku.supabase.co",
      },
    ],
  },
};

export default nextConfig;
