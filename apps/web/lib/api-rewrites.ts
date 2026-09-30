export interface ApiRewrite {
  source: string
  destination: string
}

export function apiRewrites(workerOrigin: string): ApiRewrite[] {
  const origin = workerOrigin.replace(/\/$/, "")
  return [
    {
      source: "/api/auth/:path*",
      destination: `${origin}/api/auth/:path*`,
    },
    { source: "/api/:path*", destination: `${origin}/:path*` },
  ]
}
