import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress } from "./ip";

export const USER_AGENT =
  "Mozilla/5.0 (compatible; SEOChecker/0.1; +https://github.com/wolf-ookami/seo-checker)";

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BYTES = 3 * 1024 * 1024; // 3MB

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_url"
      | "blocked_host"
      | "timeout"
      | "network"
      | "too_large",
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/** 入力 URL を正規化する。スキーム省略時は https を補う */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new FetchError("URLを入力してください", "invalid_url");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new FetchError("URLの形式が正しくありません", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("http / https のURLのみ診断できます", "invalid_url");
  }
  url.hash = "";
  return url;
}

/** DNS の解決に待つ上限。getaddrinfo は止められないので、待つのをやめるだけ */
const DNS_TIMEOUT_MS = 5_000;

/**
 * ホスト名を解決する。タイムアウトと呼び出し側の中断（fetchText のタイムアウト）を効かせる。
 * 2026-09-23: 以前は `lookup` を素で待っていたため、応答しない DNS で fetchText の
 * タイムアウト（12 秒）が効かず、リクエストが Vercel の上限まで居座ることがあった。
 */
async function resolveHost(host: string, signal?: AbortSignal): Promise<string[]> {
  if (signal?.aborted) throw new FetchError("ページの取得がタイムアウトしました", "timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      lookup(host, { all: true }).then(
        (results) => results.map((r) => r.address),
        () => {
          throw new FetchError("ホスト名を解決できませんでした", "network");
        },
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new FetchError("ホスト名の解決がタイムアウトしました", "timeout")),
          DNS_TIMEOUT_MS,
        );
        onAbort = () => reject(new FetchError("ページの取得がタイムアウトしました", "timeout"));
        signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * SSRF 対策: localhost / プライベートアドレスへの到達を拒否する。
 * サーバー側でユーザー指定のURLを fetch するツールでは必須。
 * 判定の中身（IPv6 の展開・埋め込み IPv4 の取り出し）は `ip.ts`。
 *
 * 残っている穴: ここで解決したアドレスと、直後の fetch が接続するアドレスは別の解決の結果
 * （DNS rebinding）。接続先を固定するには undici の Agent（`connect.lookup`）が要るが、
 * undici は直接の依存に入っていないため見送っている（2026-09-23）。
 */
export async function assertPublicHost(url: URL, signal?: AbortSignal): Promise<void> {
  // ローカル開発中に手元のサイト（localhost:3000 など）を診断したいときだけ許可する
  if (process.env.ALLOW_PRIVATE_HOSTS === "1") return;
  // 末尾のドット（`localhost.`）も同じ名前として扱う
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new FetchError("ローカルホストは診断できません", "blocked_host");
  }
  const addresses = isIP(host) ? [host] : await resolveHost(host, signal);
  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      throw new FetchError("内部ネットワークのアドレスは診断できません", "blocked_host");
    }
  }
}

/**
 * 404 ページが 200 で返るサイト対策: HTML が返ってきたらテキストファイル（robots.txt /
 * llms.txt）とみなさない。`crawl/url.ts` の `looksLikeHtmlResponse` は**別物**（判定範囲が
 * 2000 文字・xhtml も対象）なので、統合してはいけない。
 */
export function looksLikeHtml(res: { contentType: string; body: string }): boolean {
  if (res.contentType.includes("text/html")) return true;
  const head = res.body.slice(0, 500).trim().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

export interface FetchedText {
  ok: boolean;
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
  headers: Headers;
}

/** 追跡してよいリダイレクトの回数 */
const MAX_REDIRECTS = 5;

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/**
 * リダイレクトを自分で追う。
 *
 * `redirect: "follow"` に任せると転送先のホストを検査できず、
 * 外部サイトが内部アドレス（169.254.169.254 / 10.x / 127.0.0.1 など）へ
 * 302 するだけでサーバーを踏み台にできてしまう。
 *
 * 検査は「接続する直前」に毎回行う。最初のホップも例外ではない：
 * 呼び出し側が渡す URL には、取得したページの canonical や llms.txt の
 * リンクなど第三者が書いた値が混ざるため、ここで止めないと内部ホストの
 * 到達性やポートの開閉を調べる踏み台（SSRF）になってしまう。
 */
async function fetchFollowingRedirects(
  url: string,
  init: RequestInit,
): Promise<{ res: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; ; hop++) {
    // ここを通ってから初めてそのホストへ接続する（1 ホップ目を含む）
    let target: URL;
    try {
      target = new URL(current);
    } catch {
      throw new FetchError("URLの形式が正しくありません", "invalid_url");
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new FetchError("http / https のURLのみ診断できます", "blocked_host");
    }
    await assertPublicHost(target, init.signal ?? undefined);

    const res = await fetch(current, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (!REDIRECT_STATUS.has(res.status) || !location) {
      return { res, finalUrl: res.url || current };
    }
    if (hop >= MAX_REDIRECTS) {
      res.body?.cancel().catch(() => {});
      throw new FetchError("リダイレクトが多すぎます", "network");
    }
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      res.body?.cancel().catch(() => {});
      throw new FetchError("転送先のURLの形式が正しくありません", "invalid_url");
    }
    res.body?.cancel().catch(() => {});
    next.hash = "";
    current = next.toString();
  }
}

/**
 * テキスト系リソースを取得する。タイムアウトとサイズ上限付き。
 * ネットワーク例外は投げず `ok: false, status: 0` として返す（robots.txt 等の任意ファイル向け）。
 * リダイレクトは自分で追い、最初のホップを含めて毎回 `assertPublicHost` を通す
 * （内部アドレスは接続前に `blocked_host` の FetchError になる）。
 */
export async function fetchText(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchedText> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  try {
    const { res, finalUrl } = await fetchFollowingRedirects(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "accept-language": "ja,en;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          reader.cancel().catch(() => {});
          throw new FetchError("ページサイズが大きすぎます", "too_large");
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const body = decodeBody(merged, contentType);

    return {
      ok: res.ok,
      status: res.status,
      finalUrl: finalUrl || url,
      contentType,
      body,
      headers: res.headers,
    };
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new FetchError("ページの取得がタイムアウトしました", "timeout");
    }
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      body: "",
      headers: new Headers(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Content-Type / meta charset を見て文字コードを決めてデコードする */
export function decodeBody(bytes: Uint8Array, contentType: string): string {
  // `charset="Shift_JIS"` のように引用符で囲む書き方も読む（2026-09-23）
  const fromHeader = /charset=["']?\s*([\w-]+)/i.exec(contentType)?.[1];
  let charset = fromHeader?.toLowerCase();
  if (!charset) {
    // 先頭 2KB を ASCII として読んで meta charset を探す
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
    charset =
      /<meta[^>]+charset=["']?\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase() ??
      "utf-8";
  }
  // `euc_jp` のように下線で書いたラベルは WHATWG の一覧に無い（`shift_jis` はある）ので、
  // そのままで読めなければハイフンに直して読み直す（2026-09-23）
  for (const label of [charset, charset.replace(/_/g, "-")]) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // 次の候補へ
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}
