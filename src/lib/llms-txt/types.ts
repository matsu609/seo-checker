/**
 * D6 llms.txt 生成ウィザードの状態と、生成・検証の結果の型。
 *
 * ウィザードの入力はすべてこの 1 つのオブジェクトに入れ、localStorage に
 * そのまま保存する（store.ts）。生成は純関数（render.ts）なので、
 * この型の値さえ作ればテストからも同じ出力を得られる。
 */

/** ウィザードの手順（docs/reference/04_implementation-guide.md §3） */
export const WIZARD_STEPS = [
  { id: 1, label: "基本情報", hint: "クロール許可・トップページ・言語" },
  { id: 2, label: "クロール設定", hint: "対象パス・除外パス・上限" },
  { id: 3, label: "会社情報", hint: "名称・概要・所在地・連絡先" },
  { id: 4, label: "コンテンツページ", hint: "主要ページの候補を編集" },
  { id: 5, label: "執筆者・RSS", hint: "著者情報・RSS・サイトマップ" },
  { id: 6, label: "結果", hint: "プレビュー・コピー・ダウンロード" },
] as const;

export type StepId = (typeof WIZARD_STEPS)[number]["id"];

/** llms.txt の見出しに使う区分。順序はこの配列のとおり */
export const SECTION_ORDER = ["主要コンテンツ", "会社情報", "ドキュメント", "ブログ・お知らせ", "Optional"] as const;

export type LlmsSection = (typeof SECTION_ORDER)[number];

export interface LlmsPage {
  /** 画面の並べ替え・削除に使う一意な ID */
  id: string;
  url: string;
  title: string;
  /** 1 行の説明 */
  description: string;
  section: LlmsSection;
  /** 出力に含めるか */
  enabled: boolean;
}

export interface LlmsAuthor {
  id: string;
  name: string;
  url: string;
  description: string;
}

export interface LlmsTxtState {
  /** 現在のステップ */
  step: StepId;
  /** ① AI クローラのクロールを許可するか */
  allowCrawl: boolean;
  siteUrl: string;
  siteName: string;
  /** 1〜2 文のサイト概要（llms.txt の > 行） */
  summary: string;
  /** 補足段落（任意） */
  details: string;
  languages: string[];

  /** ② クロール設定 */
  includePaths: string;
  excludePaths: string;
  limit: number;

  /** ③ 会社情報 */
  companyName: string;
  companySummary: string;
  companyAddress: string;
  companyContact: string;
  companyUrl: string;

  /** ④ コンテンツページ */
  pages: LlmsPage[];

  /** ⑤ 執筆者・RSS */
  authors: LlmsAuthor[];
  rssUrl: string;
  sitemapUrl: string;
}

/** クロールで見つけたページの候補（/api/llms-txt/scan の戻り値） */
export interface ScanCandidate {
  url: string;
  title: string;
  description: string;
  /** パスの階層。浅い順に並べて出す */
  depth: number;
}

export interface ScanResult {
  origin: string;
  siteName: string;
  siteSummary: string;
  candidates: ScanCandidate[];
  /** robots.txt から見つかったサイトマップ */
  sitemaps: string[];
  /** 既に llms.txt があるか */
  existingLlmsTxt: boolean;
  crawledAt: string;
  notes: string[];
}

/* ───────────── 既存 llms.txt の検証 ───────────── */

export type CheckLevel = "pass" | "warn" | "fail";

export interface ValidationCheck {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
}

export interface LlmsLink {
  title: string;
  url: string;
  description: string;
  section: string;
  /** 検証したときの HTTP ステータス。未検証は null */
  status: number | null;
}

export interface ValidationResult {
  url: string;
  present: boolean;
  status: number;
  /** 文字数 */
  length: number;
  /** バイト数 */
  bytes: number;
  checks: ValidationCheck[];
  links: LlmsLink[];
  /** 見つかった ## セクション名 */
  sections: string[];
  title: string | null;
  summary: string | null;
  /** リンク切れの件数（未検証なら null） */
  deadLinks: number | null;
  raw: string;
}
