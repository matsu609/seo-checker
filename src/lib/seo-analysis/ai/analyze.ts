/**
 * 事実シート → AI の分析（Claude）。サーバー専用。
 *
 * 原則（docs/dev/seo-analysis-spec.md §0.2）:
 * - AI は事実シート（facts）しか見ない。HTML も URL の中身も渡さない
 * - 主張ごとに事実 ID を引用させ、引用の無い主張は画面に出さない
 * - 本文の数値が事実シートに無ければ 1 回だけ作り直させる。それでも残れば注意として出す
 */
import { generateStructured } from "@/lib/llm/structured";
import { MODELS } from "@/lib/llm/anthropic";
import { untrustedLines } from "@/lib/page-diagnosis/analyze";
import { factsToLines } from "../sheet/build";
import { GOAL_LABELS, type Fact, type SeoFactSheet } from "../sheet/types";
import { AnalysisSchema, CommentSchema, tidyAnalysis, tidyComment, type Analysis, type AnalysisRecord, type Comment } from "./schema";
import { unknownFactIds, unverifiedNumbers } from "./verify";

/** プロンプトに載せる facts の上限（1 行 100 字前後 × 400 行 ≒ 40,000 字） */
const MAX_FACT_LINES = 400;

/**
 * 出力の上限。**思考（adaptive thinking）もこの枠を使う**ので、報告書の JSON だけを見て
 * 決めると足りなくなり、`stop_reason: "max_tokens"` で「出力が長すぎて途中で切れました」に
 * なる（2026-09-19 の不具合。8,192 では毎回足りなかった）。ストリーミングなので大きくしても
 * 接続は切れない。実際に使った分だけ課金される。
 */
const ANALYSIS_MAX_TOKENS = 32_000;
/** 画面ごとの短い講評。こちらも思考の分を見込む */
const COMMENT_MAX_TOKENS = 8_000;

const SYSTEM_PROMPT = `あなたは中小企業のウェブサイトを 10 年以上改善してきた SEO コンサルタントです。日本語で書きます。

守ること:
- 渡された「事実シート」の行だけを根拠にします。シートに無いことは事実として書きません。一般論を言うときは「一般に」と断り、推測は cautions に分けます。
- 主張には必ず事実 ID（例: S-03）を factIds に入れます。ID はシートにあるものだけ。
- 数値はシートにある数値だけを使います。期待効果に「◯% 改善」のような数字を作りません。
- 「SEO を強化しましょう」「コンテンツを充実させましょう」のような、何をどうするか分からない言い方は禁止です。どのページの、何を、どう変えるかまで書きます。
- 改善案は**5〜6 件だけ**。効果の大きい順に絞り、細かいものは捨てます。優先度 1（今すぐ・効果が大きい）から 3 まで。手間（effort）は担当者の作業量の目安です。
- **短く書きます。**読むのは忙しい経営者です。同じことを言い換えない。前置きを書かない。各項目の文字数の目安はスキーマの説明に従います。
- 比率や平均を自分で計算して書かないでください（シートに無い数字になります）。「◯ 件中 ◯ 件」のようにシートの数字をそのまま使います。
- consultant.real には「この数字を見たからこそ言えること」を最大 3 つ書きます。一般論はここに書きません。
- データが無い領域（例: 検索順位を取っていない、Google 連携が無い）については、無いことを前提に書き、あるかのように書きません。
- 断定は根拠の強さに合わせます。1 ページのデータで全体を語らない。
- llms.txt は AI 検索向けの案内ファイルで、**まだ必須ではありません**。無いことを致命的な欠陥のように書かず、「置けば差がつく」程度の位置づけで、優先度も高くしすぎません。
- 「ドメインパワー」という総合点は出しません（打ち手が無いため廃止しました）。外部の評価について書くときは、被リンク（Ahrefs の DR）とインデックス数のどちらを、どう増やすかだけを書きます。`;

function inputSummary(sheet: SeoFactSheet): string[] {
  const i = sheet.input;
  return [
    `対象: ${sheet.site.origin}`,
    `目的: ${GOAL_LABELS[i.goal]}${i.industry ? `／業種: ${i.industry}` : ""}${i.region ? `／地域: ${i.region}` : ""}`,
    i.keywords.length > 0 ? `対策キーワード: ${i.keywords.join(" / ")}` : "対策キーワード: 未入力",
    `取得できた領域: ${[
      "テクニカル・構成・信頼（クロール）",
      sheet.coverage.psi ? "PageSpeed" : null,
      sheet.coverage.crux ? "CrUX（実ユーザーの速度）" : null,
      sheet.coverage.serp ? "検索順位（SerpApi）" : null,
      sheet.coverage.domainPower ? "外部からの評価（被リンク・インデックス数）" : null,
    ]
      .filter(Boolean)
      .join("、")}`,
  ];
}

function collectTexts(a: Analysis): string[] {
  return [
    a.headline,
    ...a.situation,
    ...a.strengths.map((s) => s.text),
    ...a.weaknesses.map((w) => w.text),
    ...a.recommendations.flatMap((r) => [r.title, r.what, r.why, r.expected]),
    ...a.consultant.real,
  ];
}

function collectFactIds(a: Analysis): string[] {
  return [...a.strengths.flatMap((s) => s.factIds), ...a.weaknesses.flatMap((w) => w.factIds), ...a.recommendations.flatMap((r) => r.factIds)];
}

export interface GenerateAnalysisOptions {
  signal?: AbortSignal;
  /**
   * 数値の照合が合わないときに作り直す回数（既定 0 = 作り直さない）。
   *
   * 2026-09-19 まで既定 1 だった。AI が比率を自分で計算すると必ず照合に落ちるため
   * ほぼ毎回 2 回生成しており、時間と費用が 2 倍になっていた。残った食い違いは
   * `unverifiedNumbers` として画面に注意表示するので、作り直しの見返りが小さい。
   */
  retries?: number;
  /** 進捗（何回目の生成か・出力の累計文字数）。渡すとストリーミングで生成する */
  onProgress?: (progress: { attempt: number; outputChars: number }) => void;
}

export async function generateAnalysis(sheet: SeoFactSheet, options: GenerateAnalysisOptions = {}): Promise<AnalysisRecord> {
  const facts = sheet.facts.slice(0, MAX_FACT_LINES);
  const lines = factsToLines(facts);
  const base = [
    "次の事実シートだけを根拠に、このサイトの現状分析と改善案を書いてください。",
    ...inputSummary(sheet),
    "",
    "事実シート（1 行 1 事実。先頭が事実 ID）:",
    ...untrustedLines(lines),
  ];

  let extra: string[] = [];
  let last: { data: Analysis; usage: { inputTokens: number; outputTokens: number }; model: string } | null = null;
  const retries = options.retries ?? 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const onProgress = options.onProgress;
    const { data, usage } = await generateStructured({
      schema: AnalysisSchema,
      system: SYSTEM_PROMPT,
      prompt: [...base, ...extra].join("\n"),
      model: "default",
      maxTokens: ANALYSIS_MAX_TOKENS,
      // 思考の深さ。既定（high）は長考して 3 分以上かかる。medium で十分な品質が出る
      effort: "medium",
      signal: options.signal,
      ...(onProgress ? { onProgress: (p) => onProgress({ attempt: attempt + 1, outputChars: p.outputChars }) } : {}),
    });
    last = { data: tidyAnalysis(data), usage, model: MODELS.default };
    const bad = unverifiedNumbers(collectTexts(last.data), facts);
    const badIds = unknownFactIds(collectFactIds(last.data), facts);
    if (bad.length === 0 && badIds.length === 0) break;
    extra = [
      "",
      "前回の出力には事実シートに無い数値・事実 IDが含まれていました。次の数値は使わず、シートの数値と ID だけで書き直してください:",
      bad.length > 0 ? `数値: ${bad.join(", ")}` : "",
      badIds.length > 0 ? `事実 ID: ${badIds.join(", ")}` : "",
    ];
  }
  if (!last) throw new Error("分析を生成できませんでした");
  const analysis = dropUnknownIds(last.data, facts);
  return {
    analysis,
    model: last.model,
    generatedAt: new Date().toISOString(),
    usage: last.usage,
    unverifiedNumbers: unverifiedNumbers(collectTexts(analysis), facts),
    unknownFactIds: unknownFactIds(collectFactIds(last.data), facts),
  };
}

/** 存在しない事実 ID を落とし、引用が 1 つも残らない主張は捨てる（改善案は残して ID だけ落とす） */
function dropUnknownIds(a: Analysis, facts: readonly Fact[]): Analysis {
  const known = new Set(facts.map((f) => f.id));
  const clean = (ids: string[]) => ids.filter((id) => known.has(id));
  return {
    ...a,
    strengths: a.strengths.map((s) => ({ ...s, factIds: clean(s.factIds) })).filter((s) => s.factIds.length > 0),
    weaknesses: a.weaknesses.map((w) => ({ ...w, factIds: clean(w.factIds) })).filter((w) => w.factIds.length > 0),
    recommendations: a.recommendations.map((r) => ({ ...r, factIds: clean(r.factIds) })),
  };
}

/* ───────────── 画面ごとの短い分析 ───────────── */

const COMMENT_SYSTEM = `あなたは中小企業のウェブサイトを改善してきた SEO コンサルタントです。日本語で、短く具体的に書きます。
渡された事実だけを根拠にし、主張には事実 ID を factIds に入れます。シートに無い数値は使いません。
「強化する」「充実させる」のような曖昧な助言は禁止。どのページの何をどう変えるかまで書きます。`;

export interface GenerateCommentOptions {
  signal?: AbortSignal;
}

/** 部分的な事実（1 画面分）に対する短い分析 */
export async function generateComment(title: string, facts: readonly Fact[], options: GenerateCommentOptions = {}): Promise<{ comment: Comment; model: string }> {
  const trimmed = facts.slice(0, MAX_FACT_LINES);
  const { data } = await generateStructured({
    schema: CommentSchema,
    system: COMMENT_SYSTEM,
    prompt: [`次は「${title}」の事実です。この数字から言えること（要約 1 段落・ポイント・次にやること）を書いてください。`, "", ...untrustedLines(factsToLines(trimmed))].join("\n"),
    model: "default",
    maxTokens: COMMENT_MAX_TOKENS,
    effort: "medium",
    signal: options.signal,
  });
  const known = new Set(trimmed.map((f) => f.id));
  const clean = (ids: string[]) => ids.filter((id) => known.has(id));
  const tidy = tidyComment(data);
  return {
    comment: {
      ...tidy,
      points: tidy.points.map((p) => ({ ...p, factIds: clean(p.factIds) })),
      actions: tidy.actions.map((p) => ({ ...p, factIds: clean(p.factIds) })),
    },
    model: MODELS.default,
  };
}
