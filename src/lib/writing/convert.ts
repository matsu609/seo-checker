/**
 * 画面でも使う上限値と純関数（クライアント安全）。
 *
 * outline.ts / plan.ts / rewrite.ts / prompt.ts は Anthropic SDK を読み込むサーバー専用の
 * モジュールなので、"use client" のコンポーネントから直接 import すると SDK まで
 * クライアントバンドルに入ってしまう。両方から使うものだけをここに集め、
 * サーバー側モジュールはここから再エクスポートする。
 */
import type { ArticleOutline, ArticlePlan } from "./types";

/* ───────────── 上限値 ───────────── */

/** 構成案の h2 の上限（本文生成の回数がそのまま料金と時間になる） */
export const MAX_SECTIONS = 12;
/** h2 ひとつあたりの h3 の上限 */
export const MAX_SUBSECTIONS = 6;
/** 1 見出しの想定文字数の範囲 */
export const MIN_SECTION_CHARS = 100;
export const MAX_SECTION_CHARS = 2_000;
/** 上位ページ 1 件あたりに渡す本文の上限 */
export const MAX_REFERENCE_CHARS = 1_200;
/** 企画書モードの「書きたい内容」の上限（実装ガイド §11.2） */
export const MAX_PLAN_CONTENT_CHARS = 1_000;
/** リライト対象として一度に渡す本文の上限 */
export const MAX_REWRITE_CHARS = 12_000;
/** チェック（ファクト / コピペ / 薬機法）に渡す本文の上限 */
export const MAX_CHECK_CHARS = 20_000;

/* ───────────── エディターのクイック指示（実装ガイド §11.3） ───────────── */

export const QUICK_ACTIONS = [
  {
    id: "proofread",
    label: "文章を校正して",
    instruction: "誤字脱字・二重表現・冗長な言い回しを直し、読みやすく整えてください。内容と文体は変えないでください。",
  },
  {
    id: "dearu",
    label: "だ・である調に変えて",
    instruction: "文体を「だ・である調」に統一してください。内容は変えないでください。",
  },
  {
    id: "related",
    label: "関連語を増やして",
    instruction: "内容を変えずに、関連語・共起語を自然な形で本文に織り込んでください。不自然な詰め込みはしないでください。",
  },
] as const;

export type QuickActionId = (typeof QUICK_ACTIONS)[number]["id"];

/* ───────────── 変換 ───────────── */

/** 企画書 → 構成案（「この企画書で執筆」で D1 の本文生成に渡す） */
export function planToOutline(plan: ArticlePlan): ArticleOutline {
  return {
    search_intent: plan.purpose,
    audience: plan.audience,
    common_topics: [],
    missing_topics: [],
    title_suggestions: plan.title_suggestions,
    description_suggestions: [],
    outline: plan.outline.map((s) => ({
      h2: s.h2,
      h3: s.h3,
      goal: s.points,
      target_chars: 600,
    })),
  };
}

/** 応答に混じることがあるコードフェンスを外す */
export function stripCodeFence(text: string): string {
  const fenced = /^\s*```(?:markdown|md)?\n([\s\S]*?)\n?```\s*$/.exec(text);
  return fenced ? fenced[1] : text;
}
