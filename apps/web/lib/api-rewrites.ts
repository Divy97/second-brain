export interface ApiRewrite {
  source: string
  destination: string
}

export function apiRewrites(workerOrigin: string): ApiRewrite[] {
  return [
    {
      source: "/api/auth/:path*",
      destination: `${workerOrigin}/api/auth/:path*`,
    },
    { source: "/api/:path*", destination: `${workerOrigin}/:path*` },
  ]
}
