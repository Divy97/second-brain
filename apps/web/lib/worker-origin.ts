export function workerOrigin(): string {
  return process.env.WORKER_ORIGIN ?? "http://localhost:8787"
}
