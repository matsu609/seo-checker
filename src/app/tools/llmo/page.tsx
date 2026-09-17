import { redirect } from "next/navigation";

/**
 * LLMO モニタリング・LLM リサーチは提供を終了した（利用者の決定 2026-09-17: AI の計測を
 * DataForSEO 経由の「AI 検索モニタリング」に一本化し、OpenAI / Gemini / Perplexity の契約をやめる）。
 * 古いリンクとブックマークのために転送だけ残す。
 */
export default function Page() {
  redirect("/tools/geo");
}
