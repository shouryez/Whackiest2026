import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kaiseho/shared"],
  agentRules: false,
  // Low-memory Windows machines can't always spawn helper processes (0xc0000142):
  // use worker threads and a single CPU for build/dev workers instead.
  experimental: { workerThreads: true, cpus: 1 },
};

export default nextConfig;
