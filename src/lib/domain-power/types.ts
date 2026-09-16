/**
 * ドメインパワー（サイト全体の地力）の型。
 *
 * Ahrefs の DR や Moz の DA のような有料の被リンク指標は使わず、
 * **無料で取れる指標だけを束ねた推定値**として 0〜100 で出す。
 * 何から出した数字かを画面に必ず出すため、指標は 1 つずつ独立した
 * DomainPowerSignal として持ち、合計点はその積み上げにする。
 *
 * 指標の内訳（配点。合計 100）:
 *   links   25  外部リンクの評価（Ahrefs の DR。無ければ Open PageRank）
 *   age     15  ドメインの登録からの年数（RDAP）
 *   index   15  Google に登録されているページ数（site: 検索）
 *   keyword 15  対策キーワードの順位
 *   brand   10  ブランド名検索での自社の順位
 *   traffic 10  実ユーザーの規模（CrUX にデータがあるか）
 *   scale    5  サイトの規模（クロールしたページ数・内部リンク）
 *   trust    5  信頼の手がかり（会社概要・問い合わせなど）と HTTPS
 *
 * 取得できなかった指標は status = "unknown" にして分母から外す
 * （未取得を 0 点にすると、キー未設定のサイトが不当に低く出るため）。
 */

export type DomainPowerSignalId = "links" | "age" | "index" | "keyword" | "brand" | "traffic" | "scale" | "trust";

export const SIGNAL_LABELS: Record<DomainPowerSignalId, string> = {
  links: "外部からのリンクの評価",
  age: "ドメインの年数",
  index: "Google に登録されているページ数",
  keyword: "対策キーワードの順位",
  brand: "ブランド名検索での順位",
  traffic: "実ユーザーの規模",
  scale: "サイトの規模",
  trust: "信頼の手がかり",
};

/** 指標ごとの配点（合計 100） */
export const SIGNAL_MAX: Record<DomainPowerSignalId, number> = {
  links: 25,
  age: 15,
  index: 15,
  keyword: 15,
  brand: 10,
  traffic: 10,
  scale: 5,
  trust: 5,
};

/** 何を見た指標かの説明（画面の「この数字の出どころ」に出す） */
export const SIGNAL_SOURCES: Record<DomainPowerSignalId, string> = {
  links: "Ahrefs の Domain Rating（0〜100。無料のドメインパワー測定サイトと同じ数値）。無ければ Open PageRank（Common Crawl のリンクグラフから算出された 0〜10）",
  age: "RDAP（ドメイン登録情報）の登録日",
  index: "Google の site: 検索の概算件数（SerpApi）",
  keyword: "入力した対策キーワードの検索順位（SerpApi）",
  brand: "ブランド名での検索順位（SerpApi）",
  traffic: "CrUX（Chrome の実ユーザーデータがあるかどうか）",
  scale: "自前クローラーが取得したページ数と内部リンク数",
  trust: "クロールから判定した信頼の手がかり（会社概要・問い合わせなど）と HTTPS",
};

export type SignalStatus = "good" | "fair" | "poor" | "unknown";

export const SIGNAL_STATUS_LABELS: Record<SignalStatus, string> = {
  good: "強い",
  fair: "普通",
  poor: "弱い",
  unknown: "未取得",
};

export interface DomainPowerSignal {
  id: DomainPowerSignalId;
  label: string;
  /** 獲得点（unknown のときは 0） */
  score: number;
  /** 配点 */
  max: number;
  status: SignalStatus;
  /** 実測値の表示（例: "12.3 年"、"約 1,200 件"） */
  value: string;
  /** 判定の根拠を 1 行で */
  detail: string;
}

export type DomainPowerGrade = "very-strong" | "strong" | "average" | "weak" | "very-weak";

export const GRADE_LABELS: Record<DomainPowerGrade, string> = {
  "very-strong": "非常に強い",
  strong: "強い",
  average: "標準的",
  weak: "弱い",
  "very-weak": "かなり弱い",
};

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

export interface DomainPowerResult {
  /** 登録ドメイン（www を外し、co.jp などは 3 ラベルまで） */
  host: string;
  /** 0〜100。採点できる指標が 1 つも無ければ null */
  score: number | null;
  grade: DomainPowerGrade | null;
  signals: DomainPowerSignal[];
  /** 採点に使えた配点の合計（100 未満なら一部の指標が未取得） */
  measuredMax: number;
  /** 自社の Ahrefs Domain Rating（0〜100）。取れなければ null */
  ahrefsDr: number | null;
  /** 自社の Open PageRank（0〜10）。取れなければ null */
  openPageRank: number | null;
  /** Open PageRank の世界順位。取れなければ null */
  openPageRankWorldRank: number | null;
  registeredAt: string | null;
  ageYears: number | null;
  peers: DomainPowerPeer[];
  /** 取得できなかったものの説明（画面にそのまま出す） */
  notes: string[];
  /** どの取得が動いたか */
  sources: { ahrefs: boolean; openPageRank: boolean; rdap: boolean; serp: boolean; crux: boolean };
}

export function gradeOf(score: number): DomainPowerGrade {
  if (score >= 80) return "very-strong";
  if (score >= 60) return "strong";
  if (score >= 40) return "average";
  if (score >= 20) return "weak";
  return "very-weak";
}
