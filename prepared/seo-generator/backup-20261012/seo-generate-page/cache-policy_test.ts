import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldBypassGenerationCache } from "./cache-policy.ts";

Deno.test("a normal first generation may use the cache", () => {
  assertEquals(shouldBypassGenerationCache({ forceRegenerate: false, bypassCacheRequested: false }), false);
});

Deno.test("a retry bypasses a previously invalid cached response", () => {
  assertEquals(shouldBypassGenerationCache({ forceRegenerate: false, bypassCacheRequested: true }), true);
});

Deno.test("an explicit regeneration bypasses the cache", () => {
  assertEquals(shouldBypassGenerationCache({ forceRegenerate: true, bypassCacheRequested: false }), true);
});