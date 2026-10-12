export function shouldBypassGenerationCache(input: {
  forceRegenerate: boolean;
  bypassCacheRequested: boolean;
}): boolean {
  return input.forceRegenerate || input.bypassCacheRequested;
}