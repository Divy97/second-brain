export function workerOrigin(): string {
  return process.env.API_ORIGIN ?? "http://localhost:8787"
}
