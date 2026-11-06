// Constant-time comparison of the caller bearer with the service key.
export function isServiceCaller(token: string, serviceKey: string): boolean {
  if (!token || !serviceKey || token.length !== serviceKey.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ serviceKey.charCodeAt(i)
  return diff === 0
}

