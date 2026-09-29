const oneDecimal = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${oneDecimal.format(bytes / (1024 * 1024))} MB`
}
