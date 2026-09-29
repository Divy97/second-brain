/** An HTTP failure from a BYOK extraction provider, carrying the status the caller branches on. */
export class ProviderError extends Error {
  readonly status: number

  constructor(provider: string, message: string, status: number) {
    super(message)
    this.name = `${provider}Error`
    this.status = status
  }
}
