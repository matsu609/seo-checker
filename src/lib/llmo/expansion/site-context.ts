/**
 * 対象サイトのトップページから文脈（サービス名・カテゴリ・主要見出し）を取る。
 * サーバー専用。取得は必ず normalizeUrl → assertPublicHost → fetchText を通す。
 */
import * as cheerio from "cheerio";
import { assertPublicHost, FetchError, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";
import type { SiteContext } from "./types";

/** ナビゲーションのラベルは多すぎても文脈にならない */
const MAX_NAV_LABELS = 24;
const MAX_HEADINGS = 20;
const MAX_LABEL_CHARS = 40;

function cleanLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_CHARS);
}

function uniquePush(out: string[], value: string, limit: number): void {
  if (!value || out.includes(value) || out.length >= limit) return;
  out.push(value);
}

/** HTML → 文脈（純関数。テストはここだけを見る） */
export function extractSiteContext(html: string, url: string): SiteContext {
  const $ = cheerio.load(html);
  const title = cleanLabel($("title").first().text()) || null;
  const description =
    cleanLabel($('meta[name="description"]').attr("content") ?? "").slice(0, 200) ||
    cleanLabel($('meta[property="og:description"]').attr("content") ?? "").slice(0, 200) ||
    null;

  const navLabels: string[] = [];
  $("nav a, header a, [role=navigation] a").each((_, el) => {
    uniquePush(navLabels, cleanLabel($(el).text()), MAX_NAV_LABELS);
  });

  const headings: string[] = [];
  $("h1, h2").each((_, el) => {
    uniquePush(headings, cleanLabel($(el).text()), MAX_HEADINGS);
  });

  return { url, title, description, navLabels, headings };
}

export interface SiteContextResult {
  context: SiteContext | null;
  /** 取得できなかった理由（日本語）。取得できたときは null */
  error: string | null;
}

/**
 * トップページを取得して文脈を作る。
 * 取得できなくても生成自体は続けたいので、例外にせず error を返す。
 */
export async function fetchSiteContext(input: string): Promise<SiteContextResult> {
  let url: URL;
  try {
    url = normalizeUrl(input);
    await assertPublicHost(url);
  } catch (err) {
    if (err instanceof FetchError) return { context: null, error: err.message };
    return { context: null, error: "対象サイトの URL を解釈できませんでした" };
  }
  try {
    const page = await fetchText(url.toString());
    if (!page.ok || !page.body) {
      return { context: null, error: `対象サイトを取得できませんでした（HTTP ${page.status}）` };
    }
    if (!/html/i.test(page.contentType)) {
      return { context: null, error: "対象サイトの応答が HTML ではありませんでした" };
    }
    return { context: extractSiteContext(page.body, page.finalUrl), error: null };
  } catch (err) {
    if (err instanceof FetchError) return { context: null, error: err.message };
    return { context: null, error: "対象サイトの取得中にエラーが発生しました" };
  }
}

/** LLM に渡す文脈テキスト（長すぎないように整形する） */
export function contextToPrompt(context: SiteContext | null): string {
  if (!context) return "（対象サイトの内容は取得できませんでした。参考プロンプトだけを手掛かりにしてください）";
  return [
    `URL: ${context.url}`,
    context.title ? `サイトタイトル: ${context.title}` : null,
    context.description ? `説明: ${context.description}` : null,
    context.navLabels.length > 0 ? `ナビゲーション: ${context.navLabels.join(" / ")}` : null,
    context.headings.length > 0 ? `主要見出し: ${context.headings.join(" / ")}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
