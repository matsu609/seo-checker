/**
 * サイテーション（ウェブ上の掲載・言及チェック）の型。クライアントでも読める純粋な型。
 *
 * 「サイテーション」= 自社の店名・住所・電話番号（NAP）が、自社サイト以外のウェブ
 * （地図・ディレクトリ・口コミ・SNS・メディア）に載っていること。生成 AI と検索エンジンは、
 * 複数の媒体で一致した基本情報を「実在する事業者」と認識して回答に含めるので、
 * 「どこに載っているか」「食い違っていないか」を見えるようにする。
 */

export interface CitationInput {
  /** 店名・屋号（必須） */
  name: string;
  /** 電話番号（空なら電話番号の検索は行わない） */
  phone: string;
  /** 住所（空なら住所の検索は行わない） */
  address: string;
  /** 自社サイトの URL（空なら「自社サイト以外」の絞り込みをしない） */
  website: string;
}

export type CitationQueryId = "phone" | "address" | "name";

export interface CitationQuery {
  id: CitationQueryId;
  label: string;
  /** Google に投げた検索語 */
  q: string;
  /** 取得できた結果の数。null は未実行（電話番号や住所が空） */
  results: number | null;
  /** 取得に失敗したときの理由。成功なら null */
  error: string | null;
}

/** 言及しているサイトの種類 */
export type CitationSourceKind = "own" | "map" | "directory" | "review" | "sns" | "media" | "other";

export const CITATION_KIND_LABELS: Record<CitationSourceKind, string> = {
  own: "自社サイト",
  map: "地図",
  directory: "ディレクトリ・予約",
  review: "口コミ",
  sns: "SNS・動画",
  media: "メディア・ブログ",
  other: "その他",
};

/** 検索結果のタイトル・スニペットに電話番号が出ていて一致 / 別の番号が出ている / 出ていない */
export type PhoneStatus = "match" | "mismatch" | "absent";
/** 検索結果のタイトル・スニペットに住所が出ている / 出ていない */
export type AddressStatus = "match" | "absent";

export interface CitationHit {
  /** ホスト名（www. を除く）。1 サイト 1 行にまとめる */
  domain: string;
  /** そのサイトでいちばん上に出たページ */
  url: string;
  title: string;
  snippet: string;
  kind: CitationSourceKind;
  /** 分かっている媒体の名前（食べログ、Yahoo!ロコ など）。無ければ null */
  sourceLabel: string | null;
  /** 基本情報掲載の媒体 id（src/lib/listings/media.ts）。無ければ null */
  mediaId: string | null;
  /** どの検索で見つかったか */
  foundBy: CitationQueryId[];
  phone: PhoneStatus;
  address: AddressStatus;
  /** そのサイトの最上位の順位（1 始まり） */
  bestPosition: number;
  /** そのサイトで見つかったページ数 */
  pages: number;
}

export interface MediaCoverage {
  mediaId: string;
  name: string;
  priority: 1 | 2 | 3;
  /** 登録（オーナー確認）画面 */
  registerUrl: string;
  /** 検索結果で自社の掲載ページが見つかったか */
  found: boolean;
  /** 見つかったページ */
  url: string | null;
}

export interface CitationSummary {
  /** 自社サイト以外で言及しているサイトの数 */
  sites: number;
  phoneMatch: number;
  phoneMismatch: number;
  addressMatch: number;
  /** 自社サイトが検索結果に出たか */
  ownFound: boolean;
  /** 主要媒体のうち見つかった数 / 数えた数 */
  mediaFound: number;
  mediaTotal: number;
}

export interface CitationReport {
  input: CitationInput;
  queries: CitationQuery[];
  hits: CitationHit[];
  coverage: MediaCoverage[];
  summary: CitationSummary;
  generatedAt: string;
}
