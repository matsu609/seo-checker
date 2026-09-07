/**
 * llms.txt の生成（純関数・ネットワークに出ない）。
 *
 * 出力は llmstxt.org の形:
 *   # サイト名
 *   > 1〜2 文の概要
 *   （補足段落）
 *   ## セクション名
 *   - [タイトル](URL): 説明
 *
 * 「クロールを許可しない」を選んだ場合は、robots.txt に貼れる Disallow
 * ブロックも作る（renderRobotsBlock）。
 */
import { AI_BOTS, PURPOSE_LABELS } from "@/lib/page-report/robots";
import { SECTION_ORDER, type LlmsPage, type LlmsSection, type LlmsTxtState } from "./types";

/** Markdown のリンク記法を壊す文字を落とす（タイトル用） */
export function escapeLinkTitle(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[[\]]/g, "")
    .trim();
}

/** 説明は 1 行に畳む（改行が入ると箇条書きが壊れる） */
export function escapeDescription(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** URL に空白や改行が混ざっていると Markdown のリンクが壊れる */
export function escapeUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.includes(" ") ? encodeURI(trimmed) : trimmed;
}

/** ページ 1 件 → "- [タイトル](URL): 説明" */
export function renderPageLine(page: Pick<LlmsPage, "title" | "url" | "description">): string {
  const title = escapeLinkTitle(page.title) || escapeUrl(page.url);
  const description = escapeDescription(page.description);
  const link = `- [${title}](${escapeUrl(page.url)})`;
  return description ? `${link}: ${description}` : link;
}

/** 出力に含めるページを、セクションの規定順にまとめる */
export function groupPages(pages: readonly LlmsPage[]): { section: LlmsSection; pages: LlmsPage[] }[] {
  const groups = new Map<LlmsSection, LlmsPage[]>();
  for (const page of pages) {
    if (!page.enabled || !page.url.trim()) continue;
    const list = groups.get(page.section);
    if (list) list.push(page);
    else groups.set(page.section, [page]);
  }
  return SECTION_ORDER.filter((section) => (groups.get(section)?.length ?? 0) > 0).map((section) => ({
    section,
    pages: groups.get(section) ?? [],
  }));
}

/** サイト名が空のときは URL のホスト名で代用する */
export function fallbackSiteName(state: Pick<LlmsTxtState, "siteName" | "siteUrl">): string {
  const name = state.siteName.trim();
  if (name) return name;
  try {
    return new URL(state.siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return "サイト名";
  }
}

/**
 * ウィザードの状態 → llms.txt の本文。
 * 空のセクションは出力しない（llmstxt.org の形として見出しだけが残ると読みにくい）。
 */
export function renderLlmsTxt(state: LlmsTxtState): string {
  const blocks: string[] = [`# ${fallbackSiteName(state)}`];

  const summary = escapeDescription(state.summary);
  if (summary) blocks.push(`> ${summary}`);

  const details = state.details.trim();
  if (details) blocks.push(details.replace(/\r\n/g, "\n").trim());

  if (state.languages.length > 0) {
    blocks.push(`対応言語: ${state.languages.join(", ")}`);
  }

  for (const group of groupPages(state.pages)) {
    blocks.push([`## ${group.section}`, ...group.pages.map(renderPageLine)].join("\n"));
  }

  const company = renderCompany(state);
  if (company) blocks.push(company);

  const optional = renderOptional(state);
  if (optional) blocks.push(optional);

  // 末尾は改行 1 つで終える（テキストファイルの慣習）
  return `${blocks.join("\n\n")}\n`;
}

/** 会社情報（③）を「## 会社情報」として出す。ページ側に同名セクションがあればそちらへ足す */
function renderCompany(state: LlmsTxtState): string {
  const lines: string[] = [];
  const name = state.companyName.trim();
  const summary = escapeDescription(state.companySummary);
  const address = escapeDescription(state.companyAddress);
  const contact = escapeDescription(state.companyContact);
  const url = escapeUrl(state.companyUrl);

  if (name) lines.push(url ? `- [${escapeLinkTitle(name)}](${url})${summary ? `: ${summary}` : ""}` : `- ${name}${summary ? `: ${summary}` : ""}`);
  else if (summary) lines.push(`- ${summary}`);
  if (address) lines.push(`- 所在地: ${address}`);
  if (contact) lines.push(`- 連絡先: ${contact}`);

  // ページ一覧の「会社情報」セクションと二重に見出しが出ないよう、そちらがあれば見出しを付けない
  const alreadyHasSection = groupPages(state.pages).some((g) => g.section === "会社情報");
  if (lines.length === 0) return "";
  return alreadyHasSection ? lines.join("\n") : ["## 会社情報", ...lines].join("\n");
}

/** 執筆者・RSS・サイトマップ（⑤）を「## Optional」に入れる */
function renderOptional(state: LlmsTxtState): string {
  const lines: string[] = [];
  for (const author of state.authors) {
    const name = escapeLinkTitle(author.name);
    if (!name) continue;
    const description = escapeDescription(author.description);
    const url = escapeUrl(author.url);
    lines.push(url ? `- [${name}](${url})${description ? `: ${description}` : ""}` : `- ${name}${description ? `: ${description}` : ""}`);
  }
  if (state.rssUrl.trim()) lines.push(`- [RSS](${escapeUrl(state.rssUrl)}): 更新情報`);
  if (state.sitemapUrl.trim()) lines.push(`- [サイトマップ](${escapeUrl(state.sitemapUrl)}): 全ページの一覧`);

  if (lines.length === 0) return "";
  // ページ一覧に Optional があれば、見出しを重ねない
  const alreadyHasSection = groupPages(state.pages).some((g) => g.section === "Optional");
  return alreadyHasSection ? lines.join("\n") : ["## Optional", ...lines].join("\n");
}

/**
 * 「クロールを許可しない」を選んだときの robots.txt 追記案。
 * 学習用と検索用を分けてコメントを付ける（全部止めると AI 検索にも出なくなるため）。
 */
export function renderRobotsBlock(): string {
  const lines: string[] = ["# AI クローラのアクセスを拒否する設定（seo-checker が生成）"];
  const byPurpose = new Map<string, string[]>();
  for (const bot of AI_BOTS) {
    const list = byPurpose.get(bot.purpose);
    if (list) list.push(bot.ua);
    else byPurpose.set(bot.purpose, [bot.ua]);
  }
  for (const [purpose, uas] of byPurpose) {
    lines.push("", `# ${PURPOSE_LABELS[purpose as keyof typeof PURPOSE_LABELS]}`);
    for (const ua of uas) {
      lines.push(`User-agent: ${ua}`);
    }
    lines.push("Disallow: /");
  }
  lines.push(
    "",
    "# 注意: 検索用クローラまで拒否すると、AI 検索の回答に載る機会そのものを失います。",
    "# 学習だけを断りたい場合は「学習用」のブロックだけを残してください。",
  );
  return `${lines.join("\n")}\n`;
}

/** ダウンロードするファイル名（ASCII のみ） */
export function llmsTxtFileName(allowCrawl: boolean): string {
  return allowCrawl ? "llms.txt" : "robots.txt";
}
