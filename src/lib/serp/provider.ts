/**
 * SERP プロバイダの入口。今は SerpApi のみ。
 * SERPAPI_KEY が無ければ null を返し、呼び出し側は SetupNotice を出す（ダミーは返さない）。
 */
import { createSerpApiProvider } from "./serpapi";
import type { SerpProvider } from "./types";

export type { SerpProvider };

let cached: { key: string; provider: SerpProvider } | null = null;

export function isSerpEnabled(): boolean {
  return Boolean(process.env.SERPAPI_KEY?.trim());
}

export function getSerpProvider(): SerpProvider | null {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return null;
  if (!cached || cached.key !== key) cached = { key, provider: createSerpApiProvider(key) };
  return cached.provider;
}
