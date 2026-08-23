import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker deploy: traces only the files each page needs into .next/standalone,
  // so the runtime image doesn't need the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
