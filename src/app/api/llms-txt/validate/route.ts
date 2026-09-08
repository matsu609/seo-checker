import { NextRequest } from "next/server";
import { FetchError, assertPublicHost, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { applyLinkStatuses, validateLlmsTxt } from "@/lib/llms-txt/validate";
import type { ValidationResult } from "@/lib/llms-txt/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const cache = globalCache<ValidationResult>("llms-txt-validate", 10 * 60 * 1000, 30);

/** 中に並んでいるリンクを確認する件数の上限（相手サイトへの負荷を抑える） */
const MAX_LINK_CHECKS = 40;
const LINK_TIMEOUT_MS = 8_000;
const LINK_CONCURRENCY = 4;
/** リンクの生死だけ見れば十分なので、本文は途中で打ち切る */
const LINK_MAX_BYTES = 64 * 1024;

/**
 * POST { url, checkLinks? }
 *
 * 既存の llms.txt を取得して形式を検証する。url にはサイトの URL でも
 * llms.txt の URL でもよい（前者ならオリジンの /llms.txt を見に行く）。
 */
export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  let body: { url?: unknown; checkLinks?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const { url, checkLinks } = body;
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "検証するサイトの URL を入力してください" }, { status: 400 });
  }

  let target: URL;
  try {
    const normalized = normalizeUrl(url);
    // llms.txt そのものを指していなければ、オリジンの /llms.txt を見る
    target = /llms(-full)?\.txt$/i.test(normalized.pathname)
      ? normalized
      : new URL("/llms.txt", normalized.origin);
    await assertPublicHost(target);
  } catch (err) {
    if (err instanceof FetchError) {
      const status = err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    return Response.json({ error: "URL の形式が正しくありません" }, { status: 400 });
  }

  const withLinks = checkLinks !== false;
  const key = `${target.toString()}|${withLinks ? "links" : "plain"}`;
  const cached = cache.get(key);
  if (cached) return Response.json({ validation: cached, cached: true });

  try {
    const response = await fetchText(target.toString(), { timeoutMs: 10_000 });
    // 404 ページを 200 の HTML で返すサイトがあるので、HTML なら「無い」とみなす
    const isHtml = /html/i.test(response.contentType) || /^\s*<!doctype html|^\s*<html/i.test(response.body.slice(0, 200));
    const found = response.ok && !isHtml && response.body.trim().length > 0;

    let validation = validateLlmsTxt(found ? response.body : "", {
      url: target.toString(),
      found,
      status: response.status,
    });

    if (found && withLinks && validation.links.length > 0) {
      // 確認するのは llms.txt と同じサイトのリンクだけ（理由は isSameSite のコメント）
      const checkable = validation.links
        .map((l) => l.url)
        .filter((u) => isSameSite(u, target))
        .slice(0, MAX_LINK_CHECKS);
      const statuses = await checkLinkStatuses(checkable);
      validation = applyLinkStatuses(validation, statuses);
    }

    cache.set(key, validation);
    return Response.json({ validation, cached: false });
  } catch (err) {
    if (err instanceof FetchError) {
      const status = err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[llms-txt/validate] unexpected error", err);
    return Response.json({ error: "llms.txt の検証中にエラーが発生しました" }, { status: 500 });
  }
}

/**
 * llms.txt に書かれたリンクのうち、同じサイトを指すものだけを確認対象にする。
 *
 * llms.txt の中身は第三者が書いたテキストで、`http://127.0.0.1:6379/` や
 * `http://169.254.169.254/latest/meta-data/` を並べておけば、こちらが順に取得して
 * その HTTP ステータスを応答に載せてしまう（内部ホストのポートスキャンになる）。
 * fetchText 側でも内部アドレスは弾くが、そもそも取りに行かないのが確実。
 * www の有無だけは同じサイトとして扱う。対象外のリンク（相対 URL を含む）は
 * status を埋めないので「未確認」になる（リンク切れとしては数えない）。
 */
function isSameSite(rawUrl: string, base: URL): boolean {
  // 相対 URL はそのまま fetch できないので確認対象にしない（別途「絶対 URL」で警告済み）
  if (!/^https?:\/\//i.test(rawUrl)) return false;
  try {
    const url = new URL(rawUrl);
    const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
    return bare(url.hostname) === bare(base.hostname);
  } catch {
    return false;
  }
}

/** リンク先のステータスを同時実行数を絞って確かめる */
async function checkLinkStatuses(urls: readonly string[]): Promise<Record<string, number>> {
  const statuses: Record<string, number> = {};
  let index = 0;
  const workers = Array.from({ length: Math.min(LINK_CONCURRENCY, urls.length) }, async () => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= urls.length) return;
      const url = urls[current];
      try {
        const res = await fetchText(url, { timeoutMs: LINK_TIMEOUT_MS, maxBytes: LINK_MAX_BYTES });
        statuses[url] = res.status;
      } catch {
        // 内部アドレスへの転送などは「確認できなかった」として扱い、結果に理由を出さない
        statuses[url] = 0;
      }
    }
  });
  await Promise.all(workers);
  return statuses;
}
