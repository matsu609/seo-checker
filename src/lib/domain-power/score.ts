/**
 * 外部からの評価（旧・ドメインパワー）の判定。純関数。ネットワークにも DB にも出ない。
 *
 * 利用者の決定（2026-09-19）「打ち手のある項目だけを採点する」に沿って、
 * 打ち手のある 2 指標だけを判定する。総合点・グレードは出さない（types.ts の冒頭を参照）。
 * 入力はすべて「すでに取得済みの数値」。取れていない指標は null で渡すと "unknown" になる。
 */
import { ageYearsFrom } from "./domain";
import {
  SIGNAL_LABELS,
  type DomainPowerPeer,
  type DomainPowerResult,
  type DomainPowerSignal,
  type DomainPowerSignalId,
  type SignalStatus,
} from "./types";

export interface ExternalEvaluationInput {
  /** 登録ドメイン */
  host: string;
  /** Ahrefs の Domain Rating（0〜100）。未取得は null */
  ahrefsDr: number | null;
  /** Open PageRank（0〜10）。未取得は null */
  openPageRank: number | null;
  openPageRankWorldRank?: number | null;
  /** RDAP / JPRS の登録日（ISO）。採点はしないが比較表に出す */
  registeredAt: string | null;
  /** site: 検索の概算件数。未取得は null */
  indexedPages: number | null;
  /** クロールで診断できたページ数（インデックス数と突き合わせる） */
  crawledPages: number | null;
  peers?: readonly DomainPowerPeer[];
  notes?: readonly string[];
  sources: DomainPowerResult["sources"];
  now?: Date;
}

function signal(id: DomainPowerSignalId, status: SignalStatus, value: string, detail: string): DomainPowerSignal {
  return { id, label: SIGNAL_LABELS[id], status, value, detail };
}

function unknown(id: DomainPowerSignalId, detail: string): DomainPowerSignal {
  return signal(id, "unknown", "未取得", detail);
}

/**
 * 外部からのリンクの評価。Ahrefs の DR（0〜100）があればそれを使い、
 * 無ければ Open PageRank（0〜10）で代用する。DR は無料のドメインパワー
 * 測定サイトが出しているのと同じ数値なので、あるときは必ずそちらを優先する。
 *
 * 判定は**中小企業のサイトの実勢**に合わせる（DR 0〜20 が普通）。
 * 0 を「弱い」と赤で出しても動けないので、「これから」と書いて打ち手につなげる。
 */
export function scoreLinks(dr: number | null, opr: number | null, worldRank: number | null): DomainPowerSignal {
  if (dr !== null) {
    const status: SignalStatus = dr >= 30 ? "good" : dr >= 10 ? "fair" : "poor";
    const also = opr !== null ? `。Open PageRank は ${opr.toFixed(2)} / 10` : "";
    return signal(
      "links",
      status,
      `DR ${dr.toFixed(0)} / 100`,
      `Ahrefs の Domain Rating は ${dr.toFixed(0)}${also}。中小企業のサイトは 0〜20 が普通で、30 を超えると外部からのリンクがよく集まっている`,
    );
  }
  if (opr === null) return unknown("links", "外部からのリンクの評価を取得していません（AHREFS_API_KEY と OPENPAGERANK_API_KEY のどちらも未設定か、このドメインのデータがありません）");
  const status: SignalStatus = opr >= 4 ? "good" : opr >= 2 ? "fair" : "poor";
  const world = worldRank ? `。世界順位 ${worldRank.toLocaleString("ja-JP")} 位` : "";
  return signal(
    "links",
    status,
    `OPR ${opr.toFixed(2)} / 10`,
    `Open PageRank（0〜10）は ${opr.toFixed(2)}${world}。中小企業のサイトは 2〜4 が普通。Ahrefs の DR（0〜100）は AHREFS_API_KEY を入れると出る`,
  );
}

/**
 * Google に登録されているページ数。クロールで見つけたページ数と比べて、
 * 「作ったのに載っていない」ページがあるかを見る（ここが打ち手になる）。
 */
export function scoreIndex(pages: number | null, crawled: number | null): DomainPowerSignal {
  if (pages === null) return unknown("index", "site: 検索の件数を取得していません（SERPAPI_KEY が未設定）");
  const gap = crawled !== null && crawled > 0 ? pages / crawled : null;
  // クロールで見つけた数を大きく下回る = 載っていないページがある
  const status: SignalStatus = gap === null ? (pages >= 50 ? "good" : pages >= 10 ? "fair" : "poor") : gap >= 0.9 ? "good" : gap >= 0.6 ? "fair" : "poor";
  const compare =
    crawled !== null && crawled > 0
      ? `。クロールで見つけた ${crawled.toLocaleString("ja-JP")} ページに対して${gap !== null && gap < 0.9 ? "少ないので、載っていないページがある可能性がある" : "ほぼ同じで、取りこぼしは少ない"}`
      : "";
  return signal("index", status, `約 ${pages.toLocaleString("ja-JP")} 件`, `site: 検索の概算件数${compare}`);
}

export function buildExternalEvaluation(input: ExternalEvaluationInput): DomainPowerResult {
  const signals: DomainPowerSignal[] = [
    scoreLinks(input.ahrefsDr, input.openPageRank, input.openPageRankWorldRank ?? null),
    scoreIndex(input.indexedPages, input.crawledPages),
  ];
  const notes = [...(input.notes ?? [])];
  const missing = signals.filter((s) => s.status === "unknown");
  if (missing.length > 0) notes.push(`未取得の指標: ${missing.map((s) => s.label).join("・")}`);

  return {
    host: input.host,
    signals,
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
