import { apiRewrites } from "./lib/api-rewrites"
import { workerOrigin } from "./lib/worker-origin"

import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  rewrites: () => Promise.resolve(apiRewrites(workerOrigin())),
}

export default nextConfig
