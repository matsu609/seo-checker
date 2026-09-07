/**
 * 生成 AI 参照元の辞書（docs/reference/04_implementation-guide.md §7）。
 *
 * GA4 の sessionSource はホスト名（"chatgpt.com"）で入ってくるが、
 * サブドメイン付き・www 付き・大文字混じりで来ることもあるので、
 * 判定は「正規化してから、いちばん具体的なホストに一致させる」純関数にする。
 * ユーザーが追加した辞書（localStorage）は extras として渡す。
 */

export interface AiSourceEntry {
  /** ホスト（www. は付けない。サブドメインにも一致する） */
  host: string;
  /** 画面に出すサービス名 */
  service: string;
}

/** 既定の辞書。ここに無い参照元は「その他」ではなく null（AI 流入として数えない） */
export const AI_SOURCE_DICTIONARY: readonly AiSourceEntry[] = [
  { host: "chatgpt.com", service: "ChatGPT" },
  { host: "chat.openai.com", service: "ChatGPT" },
  { host: "openai.com", service: "ChatGPT" },
  { host: "gemini.google.com", service: "Gemini" },
  { host: "bard.google.com", service: "Gemini" },
  { host: "perplexity.ai", service: "Perplexity" },
  { host: "www.perplexity.ai", service: "Perplexity" },
  { host: "claude.ai", service: "Claude" },
  { host: "copilot.microsoft.com", service: "Microsoft Copilot" },
  { host: "grok.com", service: "Grok" },
  { host: "x.ai", service: "Grok" },
  { host: "you.com", service: "You.com" },
  { host: "poe.com", service: "Poe" },
  { host: "felo.ai", service: "Felo" },
  { host: "genspark.ai", service: "Genspark" },
  { host: "chat.mistral.ai", service: "Le Chat（Mistral）" },
  { host: "meta.ai", service: "Meta AI" },
  { host: "notebooklm.google.com", service: "NotebookLM" },
] as const;

/**
 * 参照元の表記をホスト名に寄せる。
 * "https://Chat.OpenAI.com/path" / "www.perplexity.ai" / " CHATGPT.COM " をすべて
 * "chat.openai.com" / "perplexity.ai" / "chatgpt.com" にする。
 */
export function normalizeHost(source: string): string {
  let s = (source ?? "").trim().toLowerCase();
  if (!s) return "";
  // スキーム付き・パス付きで入ってくることがある
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0] ?? "";
  // ユーザー情報とポート
  const at = s.lastIndexOf("@");
  if (at >= 0) s = s.slice(at + 1);
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.+$/, "");
  if (s.startsWith("www.")) s = s.slice(4);
  return s;
}

/** 辞書を「具体的なホストが先」に並べる（openai.com より chat.openai.com を優先） */
function ordered(entries: readonly AiSourceEntry[]): AiSourceEntry[] {
  return entries
    .map((e) => ({ host: normalizeHost(e.host), service: e.service.trim() }))
    .filter((e) => e.host.length > 0 && e.service.length > 0)
    .sort((a, b) => b.host.length - a.host.length || a.host.localeCompare(b.host));
}

/**
 * 参照元 → サービス名。辞書に無ければ null。
 * extras（ユーザー追加）を既定辞書より優先する。
 */
export function matchAiSource(source: string, extras: readonly AiSourceEntry[] = []): string | null {
  const host = normalizeHost(source);
  if (!host) return null;
  for (const list of [ordered(extras), ordered(AI_SOURCE_DICTIONARY)]) {
    for (const entry of list) {
      if (host === entry.host || host.endsWith(`.${entry.host}`)) return entry.service;
    }
  }
  return null;
}

export function isAiSource(source: string, extras: readonly AiSourceEntry[] = []): boolean {
  return matchAiSource(source, extras) !== null;
}

/**
 * GA4 の dimensionFilter（inListFilter）に渡すホスト一覧。
 * サブドメインまでは列挙できないので、www 付きと無しの両方を入れておく。
 */
export function aiSourceFilterValues(extras: readonly AiSourceEntry[] = []): string[] {
  const out = new Set<string>();
  for (const entry of [...AI_SOURCE_DICTIONARY, ...extras]) {
    const host = normalizeHost(entry.host);
    if (!host) continue;
    out.add(host);
    out.add(`www.${host}`);
  }
  return Array.from(out).sort();
}

/** 辞書に載っているサービス名（表示順は既定辞書の並び → 追加分） */
export function aiServiceNames(extras: readonly AiSourceEntry[] = []): string[] {
  const out: string[] = [];
  for (const entry of [...AI_SOURCE_DICTIONARY, ...extras]) {
    const name = entry.service.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
