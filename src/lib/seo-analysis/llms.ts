/**
 * llms.txt（AI 向けの案内ファイル）の評価。サーバー専用。
 *
 * 精密診断の中で `/llms.txt` と `/llms-full.txt` を取りに行き、
 * **有無**と、あるときは中身の作りを既存の検証（`src/lib/llms-txt/validate.ts`）
 * で判定する。生成ツール（`/tools/llms-txt`）と同じ基準を使うので、
 * 「無い / あるが中身が足りない」を同じ物差しで言える。
 *
 * ネットワークに出るのはこの 2 ファイルだけ（リンク切れの確認はしない。
 * それは `/tools/llms-txt` の検証タブの役目）。失敗しても例外は投げず、
 * 「取得できず」として返す（報告書全体を止めない）。
 */
import { fetchText, looksLikeHtml } from "@/lib/analyzer/fetch";
import { validateLlmsTxt } from "@/lib/llms-txt/validate";
import type { SheetLlmsTxt } from "./sheet/types";

const TIMEOUT_MS = 8_000;
/** 事実シートに載せるセクション名の上限 */
const MAX_SECTIONS = 10;


export interface CollectLlmsOptions {
  signal?: AbortSignal;
  fetchImpl?: (url: string, options: { timeoutMs?: number }) => Promise<{ ok: boolean; status: number; contentType: string; body: string }>;
}

export async function collectLlmsTxt(origin: string, options: CollectLlmsOptions = {}): Promise<SheetLlmsTxt> {
  const get = options.fetchImpl ?? ((url: string, o: { timeoutMs?: number }) => fetchText(url, o));
  const url = `${origin}/llms.txt`;
  const fullUrl = `${origin}/llms-full.txt`;

  const [res, fullRes] = await Promise.all([
    get(url, { timeoutMs: TIMEOUT_MS }).catch(() => null),
    get(fullUrl, { timeoutMs: TIMEOUT_MS }).catch(() => null),
  ]);

  const found = res !== null && res.ok && !looksLikeHtml(res) && res.body.trim().length > 0;
  const result = validateLlmsTxt(found && res ? res.body : "", { url, found, status: res?.status ?? 0 });
  const fullFound = fullRes !== null && fullRes.ok && !looksLikeHtml(fullRes) && fullRes.body.trim().length > 0;

  return {
    url,
    present: result.present,
    status: result.status,
    length: result.length,
    bytes: result.bytes,
    title: result.title,
    summary: result.summary,
    sections: result.sections.slice(0, MAX_SECTIONS),
    linkCount: result.links.length,
    describedLinks: result.links.filter((l) => l.description.trim().length > 0).length,
    checks: result.checks,
    full: { present: fullFound, length: fullFound && fullRes ? fullRes.body.trim().length : 0 },
  };
}
