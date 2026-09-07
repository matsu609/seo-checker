/**
 * 検索意図の分類（実装ガイド §8.3）。
 *
 * まずルールで付け、残りだけを高速モデル（claude-haiku-4-5）に
 * 1 リクエストでまとめて投げる。ANTHROPIC_API_KEY が無い環境では
 * ルールで付いた分だけを返し、残りは「未分類」と正直に出す。
 */
import { z } from "zod";
import { generateStructured } from "@/lib/llm/structured";
import { INTENT_LABELS, type SearchIntent } from "./types";

export interface IntentRule {
  intent: SearchIntent;
  /** 一致した語（画面に根拠として出す） */
  label: string;
  pattern: RegExp;
}

/**
 * 判定の優先順位はこの配列の順（先に当たったものを採用）。
 *
 * 実装ガイド §8.3 の「『とは』『方法』『やり方』→ 情報収集」を守りつつ、
 * 「購入方法」（取引 > 情報収集）「料金比較」（商業調査 > 取引）のように
 * 複数の語が混ざるキーワードでは、より購買に近い意図を優先する。
 * そのため「定義を問う語尾（〜とは）」だけを最優先に置き、
 * 「手順を問う語尾（〜方法）」は取引・商業調査の下、サイト誘導の上に置く。
 * こうしないと「価格 とは」が取引、「アクセス 方法」がサイト誘導になり、
 * 語尾で意図を言い切っているキーワードを取り違える。
 */
export const INTENT_RULES: readonly IntentRule[] = [
  // 情報収集（最優先）: 語尾で定義・意味を問うている。前に何が付いても意図は変わらない
  { intent: "informational", label: "定義を問う語尾", pattern: /とは\s*(?:何|なに)?\s*(?:ですか)?[?？]*$|って\s*(?:何|なに)[?？]*$|(?:の)?(?:意味|定義)[?？]*$/i },
  // 商業調査: 買う前に比べたい
  { intent: "commercial", label: "比較・評価系", pattern: /比較|くらべ|比べ|おすすめ|オススメ|お勧め|ランキング|人気|評判|口コミ|クチコミ|レビュー|選び方|違い|どっち|どれがいい|best|vs/i },
  // 取引: 買いたい・申し込みたい（「購入方法」はここで取引になる）
  { intent: "transactional", label: "購入・料金系", pattern: /購入|買う|買い方|通販|注文|申込|申し込|加入|契約|予約|見積|資料請求|無料体験|トライアル|価格|料金|費用|値段|いくら|相場|安い|最安|割引|クーポン|セール|求人|転職|ダウンロード/i },
  // 情報収集: 語尾で手順を問うている（取引語が無いので「知りたい」が主目的）
  { intent: "informational", label: "手順を問う語尾", pattern: /(?:方法|やり方|仕方|手順|使い方|作り方|始め方|はじめ方)\s*[?？]*$/i },
  // サイト誘導: 特定のサイトへ行きたい
  { intent: "navigational", label: "公式・ログイン系", pattern: /ログイン|log\s?in|サインイン|公式|オフィシャル|マイページ|会員登録|問い合わせ|お問合せ|会社概要|採用情報|営業時間|アクセス|店舗|ダウンロード先/i },
  // 情報収集: 知りたい・調べたい（語尾に来ない言い回し）
  { intent: "informational", label: "情報収集系", pattern: /とは|意味|定義|方法|やり方|使い方|作り方|手順|始め方|はじめ方|入門|初心者|基礎|基本|理由|なぜ|why|how|できない|直し方|対処|原因|例|事例|一覧|まとめ/i },
];

export interface RuleMatch {
  intent: SearchIntent;
  matched: string;
}

/**
 * ルールで意図を付ける。どれにも当たらなければ null（LLM 送りにする）。
 * brandTerms（プロジェクト名・ドメイン・種 KW のブランド名）を含み、
 * かつ他のルールに当たらないものはサイト誘導とみなす。
 */
export function classifyByRule(keyword: string, brandTerms: readonly string[] = []): RuleMatch | null {
  const k = keyword.trim();
  if (!k) return null;
  for (const rule of INTENT_RULES) {
    const hit = rule.pattern.exec(k);
    if (hit) return { intent: rule.intent, matched: hit[0] };
  }
  const lower = k.toLowerCase();
  for (const term of brandTerms) {
    const t = term.trim().toLowerCase();
    if (t.length >= 2 && lower.includes(t)) {
      return { intent: "navigational", matched: term.trim() };
    }
  }
  return null;
}

const IntentBatchSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int().describe("入力リストの番号（1 始まり）"),
      intent: z
        .enum(["informational", "navigational", "transactional", "commercial"])
        .describe("検索意図の 4 区分"),
    }),
  ),
});

/** 1 リクエストにまとめる上限。多すぎると出力が切れる */
export const INTENT_BATCH_SIZE = 100;

const SYSTEM = [
  "あなたは日本語の検索キーワードを検索意図で分類するアナリストです。",
  "区分は次の 4 つだけです。",
  `・informational（${INTENT_LABELS.informational}）: 知りたい・調べたい。用語の意味、方法、原因など。`,
  `・navigational（${INTENT_LABELS.navigational}）: 特定のサイト・ブランド・店舗にたどり着きたい。`,
  `・transactional（${INTENT_LABELS.transactional}）: 購入・申込・予約など行動に直結する。`,
  `・commercial（${INTENT_LABELS.commercial}）: 買う前に比較・検討している。おすすめ、比較、評判など。`,
  "入力の全ての番号に対して 1 件ずつ、番号と区分だけを返してください。説明は不要です。",
].join("\n");

/** 差し替え可能な分類器（テストはこれを渡す） */
export type IntentClassifier = (
  keywords: readonly string[],
  signal?: AbortSignal,
) => Promise<Map<string, SearchIntent>>;

/** 既定の分類器（claude-haiku-4-5 + 構造化出力、1 バッチ 1 リクエスト） */
export const llmIntentClassifier: IntentClassifier = async (keywords, signal) => {
  const out = new Map<string, SearchIntent>();
  for (let i = 0; i < keywords.length; i += INTENT_BATCH_SIZE) {
    const batch = keywords.slice(i, i + INTENT_BATCH_SIZE);
    const prompt = [
      "次のキーワードを分類してください。",
      ...batch.map((k, n) => `${n + 1}. ${k}`),
    ].join("\n");
    const { data } = await generateStructured({
      schema: IntentBatchSchema,
      model: "fast",
      system: SYSTEM,
      maxTokens: 4_000,
      temperature: 0,
      prompt,
      ...(signal ? { signal } : {}),
    });
    for (const item of data.items) {
      const keyword = batch[item.index - 1];
      if (keyword) out.set(keyword, item.intent);
    }
  }
  return out;
};

export interface ClassifyOptions {
  keywords: readonly string[];
  brandTerms?: readonly string[];
  /** 未設定なら LLM 分類を行わない（未分類のまま返す） */
  classifier?: IntentClassifier | null;
  signal?: AbortSignal;
}

export interface ClassifiedKeyword {
  keyword: string;
  intent: SearchIntent | null;
  judge: "rule" | "llm" | "unknown";
  matched?: string;
}

export interface ClassifyResult {
  items: ClassifiedKeyword[];
  ruleCount: number;
  llmCount: number;
  unknownCount: number;
  /** LLM 分類に失敗したときの理由（分類は諦めるが調査結果は返す） */
  llmError: string | null;
}

/** ルール → 残りを LLM。LLM が落ちても全体は失敗させない */
export async function classifyIntents(options: ClassifyOptions): Promise<ClassifyResult> {
  const items: ClassifiedKeyword[] = [];
  const pending: string[] = [];
  for (const keyword of options.keywords) {
    const rule = classifyByRule(keyword, options.brandTerms ?? []);
    if (rule) {
      items.push({ keyword, intent: rule.intent, judge: "rule", matched: rule.matched });
    } else {
      items.push({ keyword, intent: null, judge: "unknown" });
      pending.push(keyword);
    }
  }

  let llmError: string | null = null;
  if (options.classifier && pending.length > 0) {
    try {
      const map = await options.classifier(pending, options.signal);
      for (const item of items) {
        const intent = map.get(item.keyword);
        if (item.judge === "unknown" && intent) {
          item.intent = intent;
          item.judge = "llm";
        }
      }
    } catch (err) {
      llmError = err instanceof Error ? err.message : "検索意図の分類に失敗しました";
    }
  }

  return {
    items,
    ruleCount: items.filter((i) => i.judge === "rule").length,
    llmCount: items.filter((i) => i.judge === "llm").length,
    unknownCount: items.filter((i) => i.judge === "unknown").length,
    llmError,
  };
}

/** 意図ごとの件数（円グラフ用）。未分類も 1 区分として数える */
export function intentDistribution(
  items: readonly { intent: SearchIntent | null }[],
): Record<SearchIntent | "unknown", number> {
  const out: Record<SearchIntent | "unknown", number> = {
    informational: 0,
    commercial: 0,
    transactional: 0,
    navigational: 0,
    unknown: 0,
  };
  for (const item of items) out[item.intent ?? "unknown"] += 1;
  return out;
}
