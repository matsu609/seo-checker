/**
 * サイトの構成・信頼の分析結果の型（docs/dev/seo-analysis-spec.md §0.1）。
 *
 * サイト診断（A1）の結果に `structure` / `trust` として同梱し、画面と
 * 事実シート（パワーアップ分析）の両方がこれを読む。数値の根拠は
 * すべてクロール結果（AuditPage）から純関数で計算する。
 */

/** URL とタイトルから見分けたページの用途 */
export type PageKind =
  | "home"
  | "service"
  | "article"
  | "list"
  | "company"
  | "contact"
  | "recruit"
  | "legal"
  | "not-for-search"
  | "other";

export const PAGE_KIND_LABELS: Record<PageKind, string> = {
  home: "トップ",
  service: "サービス・商品",
  article: "記事・お知らせ",
  list: "一覧・カテゴリ",
  company: "会社・店舗情報",
  contact: "問い合わせ",
  recruit: "採用",
  legal: "規約・ポリシー",
  "not-for-search": "検索に載せないページ",
  other: "その他",
};

/** ページ 1 件分の構成指標 */
export interface StructurePage {
  url: string;
  title: string | null;
  kind: PageKind;
  /** 入力 URL からの最短クリック数。到達できなければ null */
  depth: number | null;
  /** URL のパス階層の深さ（/a/b/ = 2） */
  urlDepth: number;
  /** 他のページからの被リンク数（ナビ・フッター含む） */
  inlinks: number;
  /** 本文領域からの被リンク数 */
  inContentInlinks: number;
  /** このページから出ている内部リンク数 */
  outlinks: number;
  /** nofollow 付きの被リンク数 */
  nofollowInlinks: number;
  /** 内部リンクだけで見た重要度（0〜100。最大のページが 100） */
  importance: number;
}

export interface DepthBucket {
  /** "0" "1" "2" "3" "4+" "unreachable" */
  label: string;
  count: number;
}

export interface AnchorTextStats {
  /** 本文中のリンクの総数（アンカー付き） */
  total: number;
  /** 「こちら」「詳しくはこちら」「more」のような、リンク先が分からないアンカーの数 */
  generic: number;
  /** generic / total（total が 0 なら 0） */
  genericShare: number;
  /** 汎用アンカーの実例（最大 5） */
  samples: string[];
}

export interface CannibalGroup {
  /** 揃ってしまっている title または h1 */
  key: string;
  field: "title" | "h1";
  urls: string[];
}

export interface SiteStructure {
  pageCount: number;
  /** クリック階層の分布 */
  depth: {
    buckets: DepthBucket[];
    /** 4 クリック以上かかるページの数 */
    deep: number;
    /** 内部リンクで到達できないページの数 */
    unreachable: number;
    maxDepth: number;
  };
  links: {
    /** 内部リンクの延べ本数 */
    total: number;
    /** 1 ページあたりの発リンク数（平均） */
    avgOutlinks: number;
    /** 本文領域のリンクが延べ本数に占める割合 */
    inContentShare: number;
    /** 発リンクが 0 のページ（行き止まり） */
    deadEnds: string[];
    /** 被リンクが 0 のページ（入力 URL を除く） */
    orphans: string[];
    /** 本文からの被リンクが 0 のページの数 */
    withoutContentInlinks: number;
    /** nofollow 付きの内部リンクの延べ本数 */
    nofollow: number;
    /** 被リンクの集中: 上位 10% のページが受けている被リンクの割合 */
    concentration: { topPages: number; share: number };
    anchors: AnchorTextStats;
  };
  /** 重要度の高い順（最大 10 件） */
  topPages: StructurePage[];
  /** 集客に効くはずなのにリンクが弱いページ（サービス・問い合わせ・会社情報で本文からの被リンクが 1 以下。最大 10 件） */
  weakKeyPages: StructurePage[];
  /** ページ種別ごとの数 */
  kinds: { kind: PageKind; count: number }[];
  coverage: {
    /** パンくずのあるページ数（トップを除いた分母つき） */
    breadcrumb: { count: number; of: number };
    hreflang: { count: number };
    /** og:title / og:description / og:image がそろっているページ数 */
    og: { complete: number; of: number };
  };
  freshness: {
    /** 公開日か更新日を持つページ数 */
    withDates: number;
    newest: string | null;
    oldest: string | null;
    /** 更新日（無ければ公開日）が 1 年より前のページ数 */
    olderThanYear: number;
  };
  /** title / h1 が揃ってしまっているページの組（最大 20） */
  cannibalization: CannibalGroup[];
  /** 全ページ（重要度の高い順） */
  pages: StructurePage[];
}

export type TrustStatus = "pass" | "warn" | "fail" | "info";

export interface TrustCheck {
  id: string;
  label: string;
  status: TrustStatus;
  /** 判定の根拠（画面にそのまま出す 1 行） */
  detail: string;
  /** 該当ページなど（あれば） */
  url?: string;
}

export interface TrustSignals {
  /** 見つかったページ（無ければ null） */
  pages: {
    company: string | null;
    contact: string | null;
    privacy: string | null;
    terms: string | null;
    tokushoho: string | null;
  };
  organization: { url: string; type: string; telephone: string | null; hasAddress: boolean; sameAs: number } | null;
  nap: {
    /** サイト内で見つかった電話番号（重複なし・最大 5） */
    phones: string[];
    schemaTelephone: string | null;
    /** 構造化データの電話番号が本文にもあるか。どちらかが無ければ null */
    consistent: boolean | null;
    /** 住所らしき記述のあるページ数 */
    pagesWithAddress: number;
  };
  contact: {
    pagesWithPhone: number;
    pagesWithEmail: number;
    /** トップページに電話番号があるか */
    phoneOnHome: boolean;
  };
  author: { articles: number; withAuthor: number };
  checks: TrustCheck[];
}
