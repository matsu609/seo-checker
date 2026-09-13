/**
 * 口コミの傾向分析（精密診断のみ）。純粋関数・生成 AI 不使用・API 費用ゼロ。
 *
 * Google Places が 1 回の取得で返す口コミは最新 5 件までしかない。精密診断は毎週
 * 取り直して保存しているので、**保存済みの報告書に貯まった口コミをまとめれば**
 * 週を追うごとに厚くなる（利用者の決定 2026-09-13。クイック診断には出さない）。
 *
 * 形態素解析は使わない（辞書を積むと重く、日本語の固有名詞で誤りも出る）。
 * 漢字・カタカナ・英字の連なりを語として数え、一般的すぎる語を除くだけにする。
 * 語の数え方は「その語を含む口コミの件数」。1 件の中で連呼されても 1 と数える。
 */
import type { PlaceReview } from "./types";

export interface ReviewInsights {
  /** 重複を除いた口コミの件数 */
  total: number;
  /** 本文がある件数 */
  withText: number;
  /** 集めた口コミの平均評価（本文なしも含む） */
  averageRating: number | null;
  /** 星ごとの件数（5 → 1） */
  byStar: { star: number; count: number }[];
  /** よく出る語（口コミ件数の多い順） */
  topics: { word: string; count: number; averageRating: number | null }[];
  /** 褒められている点（辞書に当たった口コミ件数） */
  positives: { word: string; count: number }[];
  /** 不満の兆候 */
  negatives: { word: string; count: number }[];
  /** 低評価（★1〜2）の実例。最新順に最大 3 件 */
  lowSamples: { rating: number | null; text: string; publishedAt: string | null }[];
  /** 集めた期間（ISO 8601）。1 件も日付が無ければ null */
  since: string | null;
  until: string | null;
}

/** 語として数えない一般語 */
const STOPWORDS = new Set([
  "お店", "店舗", "自分", "今回", "今度", "利用", "対応", "時間", "場所", "感じ", "人気", "予約", "料金", "値段", "以上", "以下", "今日", "昨日",
  "本当", "普通", "最初", "最後", "一番", "全部", "他店", "近所", "駐車", "場所", "気持", "所在", "説明", "内容", "皆様", "皆さん", "方々",
  "ここ", "そこ", "それ", "これ", "とても", "すごく", "かなり", "ちょっと", "いつも", "また", "あと", "まだ", "ので", "から", "こと", "もの",
]);

/** 褒め言葉（含まれていれば「良い点」として数える） */
const POSITIVE_WORDS = ["丁寧", "親切", "清潔", "きれい", "綺麗", "美味しい", "おいしい", "安心", "早い", "速い", "満足", "最高", "リピート", "また来", "居心地", "コスパ", "上手", "笑顔", "相談しやすい"] as const;
/** 不満のサイン */
const NEGATIVE_WORDS = ["遅い", "待たされ", "待ち時間", "汚い", "不潔", "高い", "残念", "最悪", "雑", "不愛想", "態度", "説明が無", "説明がな", "予約が取れ", "電話が繋が", "電話がつな", "二度と", "改善して"] as const;

/** 同じ口コミを二重に数えないための鍵 */
function reviewKey(r: PlaceReview): string {
  return [r.author ?? "", r.publishedAt ?? "", r.text.trim().slice(0, 60)].join("|");
}

/** 保存済みの報告書に入っている口コミをまとめ、重複を除く（新しい順） */
export function collectReviews(reviewLists: readonly (readonly PlaceReview[])[]): PlaceReview[] {
  const seen = new Set<string>();
  const out: PlaceReview[] = [];
  for (const list of reviewLists) {
    for (const r of list) {
      const key = reviewKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/** 本文から語を取り出す（漢字 2 文字以上・カタカナ 3 文字以上・英字 3 文字以上） */
export function words(text: string): string[] {
  const found = text.match(/[一-龠々]{2,}|[ァ-ヴー]{3,}|[A-Za-z]{3,}/g) ?? [];
  const out = new Set<string>();
  for (const w of found) {
    const word = w.length > 12 ? w.slice(0, 12) : w;
    if (STOPWORDS.has(word)) continue;
    out.add(word);
  }
  return [...out];
}

function countByWord(reviews: readonly PlaceReview[], list: readonly string[]): { word: string; count: number }[] {
  return list
    .map((word) => ({ word, count: reviews.filter((r) => r.text.includes(word)).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

export interface AnalyzeOptions {
  /** よく出る語をいくつ出すか */
  topicLimit?: number;
  /** よく出る語として扱う最低件数 */
  minCount?: number;
}

export function analyzeReviews(all: readonly PlaceReview[], options: AnalyzeOptions = {}): ReviewInsights {
  const { topicLimit = 8, minCount = 2 } = options;
  const withText = all.filter((r) => r.text.trim().length > 0);
  const rated = all.filter((r) => r.rating !== null);

  // 語 → その語を含む口コミ
  const buckets = new Map<string, PlaceReview[]>();
  for (const r of withText) {
    for (const w of words(r.text)) {
      const list = buckets.get(w);
      if (list) list.push(r);
      else buckets.set(w, [r]);
    }
  }
  const topics = [...buckets.entries()]
    .filter(([, list]) => list.length >= minCount)
    .map(([word, list]) => {
      const stars = list.filter((r) => r.rating !== null).map((r) => r.rating as number);
      return {
        word,
        count: list.length,
        averageRating: stars.length > 0 ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, topicLimit);

  const dates = all.map((r) => r.publishedAt).filter((d): d is string => typeof d === "string" && d.length > 0).sort();

  return {
    total: all.length,
    withText: withText.length,
    averageRating:
      rated.length > 0 ? Math.round((rated.reduce((sum, r) => sum + (r.rating as number), 0) / rated.length) * 10) / 10 : null,
    byStar: [5, 4, 3, 2, 1].map((star) => ({ star, count: rated.filter((r) => Math.round(r.rating as number) === star).length })),
    topics,
    positives: countByWord(withText, POSITIVE_WORDS),
    negatives: countByWord(withText, NEGATIVE_WORDS),
    lowSamples: all
      .filter((r) => r.rating !== null && r.rating <= 2 && r.text.trim().length > 0)
      .slice(0, 3)
      .map((r) => ({ rating: r.rating, text: r.text.trim().slice(0, 200), publishedAt: r.publishedAt })),
    since: dates[0] ?? null,
    until: dates[dates.length - 1] ?? null,
  };
}
