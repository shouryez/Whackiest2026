import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kaiseho/shared"],
  agentRules: false,
};

export default nextConfig;
