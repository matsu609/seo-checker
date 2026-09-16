/**
 * ドメインパワーの採点（純関数。ネットワークにも DB にも出ない）。
 *
 * 入力はすべて「すでに取得済みの数値」。取れていない指標は null で渡すと
 * status = "unknown" になり、分母（measuredMax）から外れる。
 * しきい値は types.ts の配点表のとおり。数字の根拠は detail に日本語で残す。
 */
import { ageYearsFrom } from "./domain";
import {
  gradeOf,
  SIGNAL_LABELS,
  SIGNAL_MAX,
  type DomainPowerPeer,
  type DomainPowerResult,
  type DomainPowerSignal,
  type DomainPowerSignalId,
  type SignalStatus,
} from "./types";

/**
 * 合計点を出すのに最低限必要な配点。これを下回るときは点を出さない
 * （2〜3 個の指標だけで「ドメインパワー 90 点」と出すと嘘になるため）。
 */
export const MIN_MEASURED_MAX = 30;

/** CrUX にデータがあったか（url = ページ単位、origin = サイト単位、none = データ不足） */
export type CruxCoverage = "url" | "origin" | "none" | "unknown";

export interface ScoreDomainPowerInput {
  /** 登録ドメイン */
  host: string;
  /** Ahrefs の Domain Rating（0〜100）。未取得は null */
  ahrefsDr: number | null;
  /** Open PageRank（0〜10）。未取得は null */
  openPageRank: number | null;
  openPageRankWorldRank?: number | null;
  /** RDAP の登録日（ISO）。未取得は null */
  registeredAt: string | null;
  /** site: 検索の概算件数。未取得は null */
  indexedPages: number | null;
  /** ブランド名検索での自社の順位。圏外は null、検索していなければ brandMeasured = false */
  brandRank: number | null;
  brandMeasured: boolean;
  /** 対策キーワードごとの順位（圏外は null）。検索していなければ空配列 */
  keywordRanks: readonly (number | null)[];
  cruxCoverage: CruxCoverage;
  /** クロールで診断できたページ数 */
  crawledPages: number | null;
  /** 内部リンクの延べ本数 */
  internalLinks: number | null;
  /** 信頼の手がかりの合格数 / 判定数 */
  trust: { pass: number; total: number } | null;
  https: boolean;
  peers?: readonly DomainPowerPeer[];
  notes?: readonly string[];
  sources: DomainPowerResult["sources"];
  now?: Date;
}

function signal(id: DomainPowerSignalId, score: number, status: SignalStatus, value: string, detail: string): DomainPowerSignal {
  return { id, label: SIGNAL_LABELS[id], score: status === "unknown" ? 0 : Math.round(score), max: SIGNAL_MAX[id], status, value, detail };
}

function unknown(id: DomainPowerSignalId, detail: string): DomainPowerSignal {
  return signal(id, 0, "unknown", "未取得", detail);
}

/* ───────────── 指標ごとの採点 ───────────── */

/**
 * 外部からのリンクの評価。Ahrefs の DR（0〜100）があればそれを使い、
 * 無ければ Open PageRank（0〜10）で代用する。DR は無料のドメインパワー
 * 測定サイトが出しているのと同じ数値なので、あるときは必ずそちらを優先する。
 */
export function scoreLinks(dr: number | null, opr: number | null, worldRank: number | null): DomainPowerSignal {
  if (dr !== null) {
    const point = dr >= 60 ? 25 : dr >= 45 ? 22 : dr >= 30 ? 18 : dr >= 20 ? 14 : dr >= 10 ? 9 : dr >= 3 ? 4 : 0;
    const status: SignalStatus = dr >= 30 ? "good" : dr >= 10 ? "fair" : "poor";
    const also = opr !== null ? `。Open PageRank は ${opr.toFixed(2)} / 10` : "";
    return signal("links", point, status, `DR ${dr.toFixed(0)} / 100`, `Ahrefs の Domain Rating は ${dr.toFixed(0)}${also}。中小企業のサイトは 0〜20 が目安で、30 を超えると外部からのリンクがよく集まっている`);
  }
  if (opr === null) return unknown("links", "外部からのリンクの評価を取得していません（AHREFS_API_KEY と OPENPAGERANK_API_KEY のどちらも未設定か、このドメインのデータがありません）");
  const point = opr >= 6 ? 25 : opr >= 5 ? 22 : opr >= 4 ? 18 : opr >= 3 ? 14 : opr >= 2 ? 9 : opr >= 1 ? 4 : 0;
  const status: SignalStatus = opr >= 4 ? "good" : opr >= 2 ? "fair" : "poor";
  const world = worldRank ? `。世界順位 ${worldRank.toLocaleString("ja-JP")} 位` : "";
  return signal("links", point, status, `OPR ${opr.toFixed(2)} / 10`, `Open PageRank（0〜10）は ${opr.toFixed(2)}${world}。中小企業のサイトは 2〜4 が目安で、4 を超えると外部からのリンクがよく集まっている。Ahrefs の DR（0〜100）は AHREFS_API_KEY を入れると出る`);
}

export function scoreAge(registeredAt: string | null, now?: Date): DomainPowerSignal {
  const years = ageYearsFrom(registeredAt, now);
  if (years === null) return unknown("age", "ドメインの登録日を取得できませんでした（RDAP に対応していない TLD か、取得に失敗）");
  const point = years >= 10 ? 15 : years >= 5 ? 13 : years >= 3 ? 10 : years >= 1 ? 6 : 2;
  const status: SignalStatus = years >= 5 ? "good" : years >= 1 ? "fair" : "poor";
  return signal("age", point, status, `${years.toFixed(1)} 年`, `${registeredAt?.slice(0, 10)} 登録。運用年数そのものが順位を上げるわけではないが、長いほど評価が積み上がりやすい`);
}

export function scoreIndex(pages: number | null, crawled: number | null): DomainPowerSignal {
  if (pages === null) return unknown("index", "site: 検索の件数を取得していません（SERPAPI_KEY が未設定）");
  const point = pages >= 1000 ? 15 : pages >= 200 ? 13 : pages >= 50 ? 10 : pages >= 10 ? 7 : pages >= 1 ? 4 : 0;
  const status: SignalStatus = pages >= 50 ? "good" : pages >= 10 ? "fair" : "poor";
  const compare = crawled !== null && crawled > 0 ? `。クロールで見つけた ${crawled.toLocaleString("ja-JP")} ページと比べる（大きく下回るならインデックスされていないページがある）` : "";
  return signal("index", point, status, `約 ${pages.toLocaleString("ja-JP")} 件`, `site: 検索の概算件数${compare}`);
}

export function scoreKeyword(ranks: readonly (number | null)[]): DomainPowerSignal {
  if (ranks.length === 0) return unknown("keyword", "対策キーワードの順位を取得していません（キーワード未入力か SERPAPI_KEY が未設定）");
  const point = (r: number | null) => (r === null ? 0 : r <= 3 ? 3 : r <= 10 ? 2.5 : r <= 30 ? 1.5 : 0.7);
  const sum = ranks.reduce<number>((acc, r) => acc + point(r), 0);
  const score = (sum / (3 * ranks.length)) * SIGNAL_MAX.keyword;
  const top10 = ranks.filter((r) => r !== null && r <= 10).length;
  const inRange = ranks.filter((r) => r !== null).length;
  const status: SignalStatus = score >= 10 ? "good" : score >= 5 ? "fair" : "poor";
  return signal("keyword", score, status, `${top10} / ${ranks.length} 語が 10 位以内`, `${ranks.length} 語のうち ${inRange} 語が 100 位以内、${top10} 語が 10 位以内`);
}

export function scoreBrand(rank: number | null, measured: boolean): DomainPowerSignal {
  if (!measured) return unknown("brand", "ブランド名検索をしていません（ブランド名を推定できなかったか SERPAPI_KEY が未設定）");
  const point = rank === null ? 0 : rank === 1 ? 10 : rank <= 3 ? 8 : rank <= 10 ? 5 : 2;
  const status: SignalStatus = rank !== null && rank <= 3 ? "good" : rank !== null && rank <= 10 ? "fair" : "poor";
  return signal("brand", point, status, rank === null ? "100 位以内に無し" : `${rank} 位`, rank === 1 ? "自社名で 1 位。ブランドの検索需要を取り切れている" : "自社名での検索で上位に出ないと、指名検索の受け皿になれていない");
}

export function scoreTraffic(coverage: CruxCoverage): DomainPowerSignal {
  if (coverage === "unknown") return unknown("traffic", "CrUX を取得していません（PAGESPEED_API_KEY か CRUX_API_KEY が未設定）");
  const point = coverage === "url" ? 10 : coverage === "origin" ? 7 : 0;
  const status: SignalStatus = coverage === "url" ? "good" : coverage === "origin" ? "fair" : "poor";
  const value = coverage === "url" ? "ページ単位でデータあり" : coverage === "origin" ? "サイト単位でデータあり" : "データ不足";
  return signal("traffic", point, status, value, "CrUX は Chrome の実利用者が一定数いるサイトにしか載らないので、載っていること自体がアクセス規模の目安になる（アクセス数そのものは公開されない）");
}

export function scoreScale(pages: number | null, links: number | null): DomainPowerSignal {
  if (pages === null) return unknown("scale", "クロールの結果がありません");
  const point = pages >= 200 ? 5 : pages >= 50 ? 4 : pages >= 20 ? 3 : pages >= 5 ? 2 : 1;
  const status: SignalStatus = pages >= 50 ? "good" : pages >= 20 ? "fair" : "poor";
  const linkText = links !== null ? `、内部リンク ${links.toLocaleString("ja-JP")} 本` : "";
  return signal("scale", point, status, `${pages.toLocaleString("ja-JP")} ページ`, `クロールで診断できたページ数${linkText}（クロール上限で頭打ちになることがある）`);
}

export function scoreTrust(trust: { pass: number; total: number } | null, https: boolean): DomainPowerSignal {
  if (!trust || trust.total === 0) return unknown("trust", "信頼の手がかりを判定できませんでした");
  const ratio = trust.pass / trust.total;
  const point = Math.round(4 * ratio) + (https ? 1 : 0);
  const status: SignalStatus = ratio >= 0.8 && https ? "good" : ratio >= 0.5 ? "fair" : "poor";
  return signal("trust", point, status, `${trust.pass} / ${trust.total} 項目`, `会社概要・問い合わせ・規約などの手がかりが ${trust.pass} 項目で合格${https ? "。HTTPS も有効" : "。HTTPS になっていない"}`);
}

/* ───────────── 合計 ───────────── */

export function scoreDomainPower(input: ScoreDomainPowerInput): DomainPowerResult {
  const signals: DomainPowerSignal[] = [
    scoreLinks(input.ahrefsDr, input.openPageRank, input.openPageRankWorldRank ?? null),
    scoreAge(input.registeredAt, input.now),
    scoreIndex(input.indexedPages, input.crawledPages),
    scoreKeyword(input.keywordRanks),
    scoreBrand(input.brandRank, input.brandMeasured),
    scoreTraffic(input.cruxCoverage),
    scoreScale(input.crawledPages, input.internalLinks),
    scoreTrust(input.trust, input.https),
  ];
  const measured = signals.filter((s) => s.status !== "unknown");
  const measuredMax = measured.reduce((acc, s) => acc + s.max, 0);
  const earned = measured.reduce((acc, s) => acc + s.score, 0);
  const enough = measuredMax >= MIN_MEASURED_MAX;
  const score = enough ? Math.round((earned / measuredMax) * 100) : null;

  const notes = [...(input.notes ?? [])];
  const missing = signals.filter((s) => s.status === "unknown");
  if (missing.length > 0) {
    notes.push(`未取得の指標: ${missing.map((s) => s.label).join("・")}（配点 ${100 - measuredMax} 点分を除いて計算しています）`);
  }
  if (!enough) {
    notes.push(`採点に使える指標が足りないため、合計点は出していません（配点 ${MIN_MEASURED_MAX} 点分以上が必要。いまは ${measuredMax} 点分）。指標ごとの値は下の内訳で確認できます`);
  }

  return {
    host: input.host,
    score,
    grade: score === null ? null : gradeOf(score),
    signals,
    measuredMax,
    ahrefsDr: input.ahrefsDr,
    openPageRank: input.openPageRank,
    openPageRankWorldRank: input.openPageRankWorldRank ?? null,
    registeredAt: input.registeredAt,
    ageYears: ageYearsFrom(input.registeredAt, input.now),
    peers: [...(input.peers ?? [])],
    notes,
    sources: input.sources,
  };
}
