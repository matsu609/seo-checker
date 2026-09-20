/**
 * NAP チェック（表記ゆれ）の型。クライアントでも読める。
 *
 * NAP = Name / Address / Phone（+ サイト URL）。入力した「正」の 4 項目と、
 * 自社サイト（構造化データ・フッター・会社概要・お問い合わせ）・Google マップ・掲載ページ・
 * ウェブ検索で見つかったページに書かれている値を突き合わせ、一致 / 不一致 / 記載なし で答える。
 * 網羅的な「どこに載っているか」ではなく「載っているものがずれていないか」を主眼にする（利用者の決定 2026-09-20）。
 */

export interface NapInput {
  name: string;
  address: string;
  phone: string;
  website: string;
}

export const NAP_FIELDS = ["name", "address", "phone", "website"] as const;
export type NapField = (typeof NAP_FIELDS)[number];

export const NAP_FIELD_LABELS: Record<NapField, string> = { name: "店名", address: "住所", phone: "電話番号", website: "サイト URL" };

/**
 * match    … 正規化（全角 / 半角・空白・ハイフン・法人格の略記）したうえで同じ
 * mismatch … 書いてあるが違う（見つかった値を found に）
 * missing  … その項目が書かれていない
 * skipped  … 比べていない（入力が空、またはその媒体では取れない項目）
 */
export type FieldStatus = "match" | "mismatch" | "missing" | "skipped";

export const FIELD_STATUS_LABELS: Record<FieldStatus, string> = { match: "一致", mismatch: "不一致", missing: "記載なし", skipped: "—" };

export interface FieldCheck {
  field: NapField;
  status: FieldStatus;
  expected: string;
  /** 見つかった値（複数あれば代表 1 件）。無ければ null */
  found: string | null;
  /** 違いの説明（不一致のとき。例: 建物名が違う） */
  note?: string;
}

export type NapSourceKind = "site_jsonld" | "site_page" | "google_maps" | "listing" | "web";

export const NAP_SOURCE_KIND_LABELS: Record<NapSourceKind, string> = {
  site_jsonld: "自社サイトの構造化データ",
  site_page: "自社サイトのページ",
  google_maps: "Google マップ",
  listing: "掲載ページ（登録済み）",
  web: "ウェブ上のページ（検索で発見）",
};

export interface NapSource {
  kind: NapSourceKind;
  /** 画面に出す名前（ページ名・媒体名） */
  label: string;
  url: string | null;
  fields: FieldCheck[];
  /** 取得できなかった理由（このとき fields は空） */
  error: string | null;
}

export type IssueSeverity = "fail" | "warn";

/** 直すべき箇所 1 件 */
export interface NapIssue {
  severity: IssueSeverity;
  sourceKind: NapSourceKind;
  source: string;
  url: string | null;
  field: NapField | null;
  title: string;
  /** 何が書いてあったか（found → expected） */
  detail: string;
  /** どこをどう直すか */
  action: string;
}

export interface NapSummary {
  sources: number;
  match: number;
  mismatch: number;
  missing: number;
}

export interface NapCheckResult {
  input: NapInput;
  checkedAt: string;
  sources: NapSource[];
  issues: NapIssue[];
  summary: NapSummary;
  /** 自社サイトに構造化データが無い・ずれているときに貼る JSON-LD（無ければ null） */
  jsonLdSuggestion: string | null;
  /** 飛ばした確認とその理由（キー未設定など） */
  notes: string[];
}
