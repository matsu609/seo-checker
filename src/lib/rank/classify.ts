/**
 * 順位計測・AI Overviews の判定ロジック（純関数）。
 *
 * 画面・API・CSV のどこから見ても同じ区分になるよう、5 区分・順位帯・変化・
 * 日付比較の計算はすべてここに集約する（ネットワークにも localStorage にも触らない）。
 */
import { palette } from "@/lib/ui/palette";
import type { AioSnapshot } from "./types";

/* ───────────── AI Overviews の 5 区分（docs/reference/04_implementation-guide.md §5.1） ───────────── */

export type AioClass = "none" | "self" | "competitor" | "both" | "neither";

/** 表示順（グラフの積み上げ順もこれに合わせる） */
export const AIO_CLASS_ORDER: readonly AioClass[] = ["self", "both", "competitor", "neither", "none"];

export const AIO_CLASS_LABELS: Record<AioClass, string> = {
  none: "AIO 表示なし",
  self: "自社のみ",
  competitor: "競合のみ",
  both: "自社&競合あり",
  neither: "自社&競合なし",
};

/** 区分ごとの説明（表の凡例に出す） */
export const AIO_CLASS_HINTS: Record<AioClass, string> = {
  none: "AI による概要が表示されなかった",
  self: "AI による概要に自社だけが引用された",
  competitor: "AI による概要に競合だけが引用された",
  both: "AI による概要に自社と競合の両方が引用された",
  neither: "AI による概要はあるが自社も競合も引用されていない（取りに行ける余地が大きい）",
};

/** 区分の色（palette の hex。SVG の fill にそのまま使う） */
export const AIO_CLASS_COLORS: Record<AioClass, string> = {
  self: palette.pass,
  both: palette.chart[0],
  competitor: palette.warn,
  neither: palette.chart[4],
  none: palette.chartTrack,
};

/** 未取得（分類できない観測）の表示ラベル */
export const AIO_UNKNOWN_LABEL = "未取得";
export const AIO_UNKNOWN_HINT = "AI による概要を取得できなかった（集計の分母から外す）";

/** 5 区分または未取得のラベル */
export function aioClassLabel(cls: AioClass | null | undefined): string {
  return cls ? AIO_CLASS_LABELS[cls] : AIO_UNKNOWN_LABEL;
}

/** 5 区分または未取得の説明 */
export function aioClassHint(cls: AioClass | null | undefined): string {
  return cls ? AIO_CLASS_HINTS[cls] : AIO_UNKNOWN_HINT;
}

/**
 * 1 観測の 5 区分。AIO が出ていなければ "none"、
 * 出ていれば自社 / 競合の引用有無で 4 区分に分かれる。
 * 観測そのものが無い（null）／取得に失敗した（unavailable）ときは
 * 分類せず null を返す。null は summarizeAioClasses で「未取得」として
 * 分母から外れる（実装ガイド §5.1「未取得日は分類に含めない」）。
 */
export function classifyAio(
  aio: (Pick<AioSnapshot, "present" | "selfCited" | "competitorCited"> & { unavailable?: boolean }) | null | undefined,
): AioClass | null {
  if (!aio || aio.unavailable) return null;
  if (!aio.present) return "none";
  if (aio.selfCited && aio.competitorCited) return "both";
  if (aio.selfCited) return "self";
  if (aio.competitorCited) return "competitor";
  return "neither";
}

export type AioClassCounts = Record<AioClass, number>;

export function emptyAioCounts(): AioClassCounts {
  return { none: 0, self: 0, competitor: 0, both: 0, neither: 0 };
}

export interface AioSummary {
  /** 登録キーワード数（未取得の件数を出すための母数。割合の分母ではない） */
  registered: number;
  /** 取得できた観測数（＝出現率・引用率の分母） */
  observed: number;
  /** 未取得（分類に含めない） */
  missing: number;
  counts: AioClassCounts;
  /** 出現率 = AIO 表示あり / 取得できた観測数（0〜1） */
  presenceRate: number;
  /** 引用率 = （自社のみ + 自社&競合あり）/ 取得できた観測数（0〜1） */
  citationRate: number;
}

/** 0 除算を避けた割合（0〜1） */
export function rate(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return part / total;
}

/**
 * 5 区分の集計。`null` の要素は「未取得」として分母から外す
 * （§5.1「未取得日は分類に含めない」）。
 *
 * registered（登録キーワード数）は「未取得が何件あるか」を出すためだけに使い、
 * 割合の分母には使わない。未取得を分母に残すと「AIO 表示なし」と同じ扱いになり、
 * API 上限などでその日の計測件数が減っただけで出現率・引用率が下がってしまうため。
 */
export function summarizeAioClasses(classes: ReadonlyArray<AioClass | null>, registered?: number): AioSummary {
  const counts = emptyAioCounts();
  let observed = 0;
  for (const c of classes) {
    if (c === null || c === undefined) continue;
    counts[c] += 1;
    observed += 1;
  }
  // registered を渡さなければ配列の長さ（観測 + 未取得）が登録数。観測数を下回る値は無視する
  const registeredCount = Math.max(registered ?? classes.length, observed);
  const present = observed - counts.none;
  return {
    registered: registeredCount,
    observed,
    missing: registeredCount - observed,
    counts,
    presenceRate: rate(present, observed),
    citationRate: rate(counts.self + counts.both, observed),
  };
}

export interface AioObservation {
  keywordId: string;
  /** YYYY-MM-DD */
  takenOn: string;
  aioClass: AioClass;
}

export interface AioDailyPoint extends AioSummary {
  date: string;
}

/**
 * 日付ごとの 5 区分（積み上げ棒 + 出現率 / 引用率の折れ線用）。
 * 同じキーワード × 同じ日に複数の観測があれば後勝ちにする。
 */
export function aioTimeline(
  observations: readonly AioObservation[],
  keywordIds: readonly string[],
): AioDailyPoint[] {
  const targets = new Set(keywordIds);
  const byDate = new Map<string, Map<string, AioClass>>();
  for (const o of observations) {
    if (targets.size > 0 && !targets.has(o.keywordId)) continue;
    const day = byDate.get(o.takenOn) ?? new Map<string, AioClass>();
    day.set(o.keywordId, o.aioClass);
    byDate.set(o.takenOn, day);
  }
  const registered = targets.size > 0 ? targets.size : new Set(observations.map((o) => o.keywordId)).size;
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, day]) => {
      const classes: Array<AioClass | null> = [];
      const ids = targets.size > 0 ? Array.from(targets) : Array.from(day.keys());
      for (const id of ids) classes.push(day.get(id) ?? null);
      return { date, ...summarizeAioClasses(classes, registered) };
    });
}

/* ───────────── 順位帯と変化 ───────────── */

export type RankBand = "top5" | "top10" | "beyond" | "out";

export const RANK_BAND_ORDER: readonly RankBand[] = ["top5", "top10", "beyond", "out"];

export const RANK_BAND_LABELS: Record<RankBand, string> = {
  top5: "1〜5位",
  top10: "6〜10位",
  beyond: "11位以下",
  out: "圏外",
};

/** 順位帯の色（hex）。棒・ドットなど SVG 側で使う */
export const RANK_BAND_COLORS: Record<RankBand, string> = {
  top5: palette.pass,
  top10: palette.info,
  beyond: palette.warn,
  out: palette.muted,
};

/** 順位帯の Tailwind クラス（表のセル・ピル用） */
export const RANK_BAND_CLASSES: Record<RankBand, string> = {
  top5: "text-pass border-pass bg-pass-soft",
  top10: "text-info border-info bg-info-soft",
  beyond: "text-warn border-warn bg-warn-soft",
  out: "text-muted border-line bg-surface",
};

/** 順位 → 帯。null（圏外）と 100 位より下は "out" */
export function rankBand(rank: number | null | undefined): RankBand {
  if (rank === null || rank === undefined || !Number.isFinite(rank) || rank < 1 || rank > 100) return "out";
  if (rank <= 5) return "top5";
  if (rank <= 10) return "top10";
  return "beyond";
}

export type RankDirection = "up" | "down" | "flat" | "in" | "out" | "unknown";

export interface RankDelta {
  /** 改善なら正（前回 - 今回）。比較できないときは null */
  diff: number | null;
  direction: RankDirection;
}

/** 変化の記号（表の ↑↓） */
export const RANK_DIRECTION_SYMBOLS: Record<RankDirection, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
  in: "IN",
  out: "OUT",
  unknown: "—",
};

/**
 * 順位の変化。`undefined` は「その日の観測が無い」、`null` は「圏外」。
 * 圏外との出入りは数値にできないので direction だけで表す。
 */
export function rankDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): RankDelta {
  if (current === undefined || previous === undefined) return { diff: null, direction: "unknown" };
  if (current === null && previous === null) return { diff: null, direction: "flat" };
  if (previous === null) return { diff: null, direction: "in" };
  if (current === null) return { diff: null, direction: "out" };
  const diff = previous - current;
  return { diff, direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat" };
}

/* ───────────── 日付の扱い ───────────── */

/** ローカル時刻の YYYY-MM-DD（UTC に寄せると日本時間の午前が前日になる） */
export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface Dated {
  takenOn: string;
}

/** 保存されている日付（昇順・重複なし） */
export function storedDates(rows: readonly Dated[]): string[] {
  return Array.from(new Set(rows.map((r) => r.takenOn))).sort((a, b) => a.localeCompare(b));
}

/** 指定日ぴったりの観測。無ければ undefined（= 未取得） */
export function snapshotOn<T extends Dated>(rows: readonly T[], date: string): T | undefined {
  let found: T | undefined;
  for (const r of rows) if (r.takenOn === date) found = r;
  return found;
}

/** 指定日以前で最も新しい観測（比較日に穴があるときの補完に使う） */
export function latestOnOrBefore<T extends Dated>(rows: readonly T[], date: string): T | undefined {
  let best: T | undefined;
  for (const r of rows) {
    if (r.takenOn > date) continue;
    if (!best || r.takenOn > best.takenOn) best = r;
  }
  return best;
}

/** 新しい順に並べた観測 */
export function sortByDateDesc<T extends Dated>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.takenOn.localeCompare(a.takenOn));
}

export interface ComparePair<T> {
  current: T | undefined;
  previous: T | undefined;
}

/**
 * 比較する 2 点を選ぶ。
 * - 日付を指定しないときは最新とその 1 つ前
 * - 指定したときはその日ぴったり（未取得なら undefined のまま返し、画面に「未取得」と出す）
 * - 比較日だけを省略したときは「基準日より前で最も新しい観測」。
 *   ここで一律に sorted[1]（全履歴の 2 番目に新しい観測）を返すと、
 *   基準日を過去に指定したときに基準日より後の観測が「前回」になり、
 *   変化（↑↓）が逆向きに出てしまうため。
 */
export function pickComparison<T extends Dated>(
  rows: readonly T[],
  currentDate?: string | null,
  previousDate?: string | null,
): ComparePair<T> {
  const sorted = sortByDateDesc(rows);
  const current = currentDate ? snapshotOn(sorted, currentDate) : sorted[0];
  if (previousDate) {
    return { current, previous: snapshotOn(sorted, previousDate) };
  }
  // 基準日（指定が無ければ最新日）より前で最も新しい観測。sorted は降順なので
  // 先頭から見て最初に見つかる「基準日より古い行」がそれにあたる。
  const anchor = currentDate ?? sorted[0]?.takenOn ?? null;
  const previous = anchor === null ? undefined : sorted.find((r) => r.takenOn < anchor);
  return { current, previous };
}

/** 順位の推移（スパークライン用）。圏外は 101 として扱い、上向き = 改善になるよう反転する */
export function rankSparkValues(rows: ReadonlyArray<Dated & { rank: number | null }>): number[] {
  return [...rows]
    .sort((a, b) => a.takenOn.localeCompare(b.takenOn))
    .map((r) => 101 - (r.rank === null || r.rank === undefined ? 101 : Math.min(101, Math.max(1, r.rank))));
}

/** 割合を「12.3%」の形にする（小数 1 桁、0 と 100 は整数） */
export function formatRate(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const pct = value * 100;
  if (Math.abs(pct - Math.round(pct)) < 0.05) return `${Math.round(pct)}%`;
  return `${pct.toFixed(digits)}%`;
}
