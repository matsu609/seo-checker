/**
 * 外部からの評価（旧・ドメインパワー）の型。
 *
 * 2026-09-19、利用者の決定「**打ち手のある項目だけを採点する**」により作り直した。
 * それまでは無料で取れる 8 指標を配点して 0〜100 の総合点にしていたが、
 * 100 点のうち 25 点は打ち手が無く（ドメインの年数・実ユーザーの規模）、
 * 25 点は施策の結果の再掲（対策キーワードの順位・ブランド名検索の順位）で、
 * **いちばん動けない数字がいちばん目立つ**状態だった。
 *
 * いまは「自分たちのコンサルの範囲で動かせる」2 つだけを出す。総合点もグレードも出さない。
 *   links  外部からのリンクの評価（Ahrefs の DR。無ければ Open PageRank）→ 打ち手: 掲載先を増やす
 *   index  Google に登録されているページ数（site: 検索）→ 打ち手: ページを増やす・インデックスを直す
 *
 * ドメインの登録年数は**採点しない**が、競合との比較表には文脈として残す
 * （新しいドメインだと結果が出るまで時間がかかる、という説明に要る）。
 * 取得できなかった指標は status = "unknown"（「弱い」と「測っていない」を書き分ける）。
 */

export type DomainPowerSignalId = "links" | "index";

export const SIGNAL_LABELS: Record<DomainPowerSignalId, string> = {
  links: "外部からのリンクの評価",
  index: "Google に登録されているページ数",
};

/** 何を見た指標かの説明（画面の「この数字の出どころ」に出す） */
export const SIGNAL_SOURCES: Record<DomainPowerSignalId, string> = {
  links: "Ahrefs の Domain Rating（0〜100。無料のドメインパワー測定サイトと同じ数値）。無ければ Open PageRank（Common Crawl のリンクグラフから算出された 0〜10）",
  index: "Google の site: 検索の概算件数（SerpApi）",
};

/** この指標を動かすために「こちらができること」。打ち手が書けない指標は載せない */
export const SIGNAL_ACTIONS: Record<DomainPowerSignalId, string> = {
  links: "掲載先を増やす（サイテーション調査で未掲載の媒体を洗い出し、業界団体・地域ポータル・取引先・プレスリリースに載せる）",
  index: "インデックスされていないページを見つけて直す（サイトマップ送信・内部リンク・重複の整理）。中身のあるページを増やす",
};

export type SignalStatus = "good" | "fair" | "poor" | "unknown";

export const SIGNAL_STATUS_LABELS: Record<SignalStatus, string> = {
  good: "強い",
  fair: "標準的",
  poor: "これから",
  unknown: "未取得",
};

export interface DomainPowerSignal {
  id: DomainPowerSignalId;
  label: string;
  status: SignalStatus;
  /** 実測値の表示（例: "DR 12 / 100"、"約 1,200 件"） */
  value: string;
  /** 判定の根拠と目安を 1 行で */
  detail: string;
}

/** 競合との比較に出す最小限の値（競合はクロールしないので 2 指標だけ） */
export interface DomainPowerPeer {
  host: string;
  /** Ahrefs の Domain Rating（0〜100）。取れなければ null */
  ahrefsDr: number | null;
  /** Open PageRank（0〜10）。取れなければ null */
  openPageRank: number | null;
  /** 登録日（ISO の日付）。取れなければ null */
  registeredAt: string | null;
  /** 登録からの年数（小数 1 桁）。取れなければ null */
  ageYears: number | null;
}

/**
 * 外部からの評価の結果。
 * 型の名前は保存済みの JSON（`analysis_runs.sheet.domain`）と揃えるために残してある。
 * 古い保存分には score / grade / measuredMax が入っているが、いまは読まない。
 */
export interface DomainPowerResult {
  /** 登録ドメイン（www を外し、co.jp などは 3 ラベルまで） */
  host: string;
  signals: DomainPowerSignal[];
  /** 自社の Ahrefs Domain Rating（0〜100）。取れなければ null */
  ahrefsDr: number | null;
  /** 自社の Open PageRank（0〜10）。取れなければ null */
  openPageRank: number | null;
  /** Open PageRank の世界順位。取れなければ null */
  openPageRankWorldRank: number | null;
  /** 採点はしない。競合比較の文脈としてだけ出す */
  registeredAt: string | null;
  ageYears: number | null;
  peers: DomainPowerPeer[];
  /** 取得できなかったものの説明（画面にそのまま出す） */
  notes: string[];
  /** どの取得が動いたか */
  sources: { ahrefs: boolean; openPageRank: boolean; rdap: boolean; serp: boolean };
}
