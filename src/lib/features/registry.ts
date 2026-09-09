/**
 * サイドバー / 機能の定義（唯一の定義。docs/dev/ARCHITECTURE.md のルーティング表）。
 *
 * Sidebar・TopBar・各ページの PageHeader はここを参照するだけで、
 * ラベル・パス・説明・機能 ID・外部依存をそれぞれの場所に書かない。
 * アイコンは文字列キーにして、実体は src/components/shell/icons.tsx が持つ
 * （このファイルをサーバー側でもそのまま import できるようにするため）。
 */
import type { PlanId } from "@/lib/plans/catalog";
import type { IntegrationKey } from "./integrations";

export type FeatureGroupId = "free" | "diagnosis" | "measure" | "research" | "generate" | "settings";

export type FeatureStatus = "ready" | "beta";

export type FeatureIcon =
  | "search"
  | "stethoscope"
  | "file-report"
  | "target"
  | "topics"
  | "rank"
  | "robot"
  | "prompt"
  | "traffic"
  | "dashboard"
  | "keywords"
  | "pen"
  | "file-text"
  | "settings";

export interface Feature {
  /** URL セグメント（例: "site-audit"）。無料診断は "free"、設定は "settings" */
  id: string;
  path: string;
  label: string;
  /** サイドバー用の短いラベル */
  shortLabel: string;
  /** 1〜2 文の説明（PageHeader に出す） */
  description: string;
  /** この機能でできること（準備中ページの箇条書き） */
  details: readonly string[];
  /** 機能カタログ（docs/reference/03_feature-catalog.md）の ID */
  featureIds: readonly string[];
  icon: FeatureIcon;
  status: FeatureStatus;
  /** 無いと動かない外部連携（全部必要） */
  requires: readonly IntegrationKey[];
  /** いずれか 1 つあれば動く外部連携 */
  requiresAny?: readonly IntegrationKey[];
  /** あれば機能が増える外部連携 */
  optional?: readonly IntegrationKey[];
  group: FeatureGroupId;
  /**
   * この機能を使うのに必要な料金プラン（src/lib/plans/catalog.ts）。
   * 読む・測る系は standard、AI が成果物を作る系は pro。
   */
  plan: PlanId;
}

export interface FeatureGroup {
  id: FeatureGroupId;
  label: string;
  features: readonly Feature[];
}

export const FREE_FEATURE: Feature = {
  id: "free",
  path: "/",
  label: "無料 AIO 診断",
  shortLabel: "無料 AIO 診断",
  description:
    "URL を入れるだけで、AI 検索（AIO）への対応状況をルールベースで採点し、報告書として PDF 出力できます。ログイン・API キー不要。",
  details: [
    "1 ページ、またはサイト全体（sitemap と内部リンクから収集）を対象に採点",
    "総合スコア・グレード・カテゴリ別スコア・改善提案を報告書形式で表示",
    "PDF ダウンロードと印刷",
    "想定 FAQ の生成（ANTHROPIC_API_KEY があるときのみ）",
  ],
  featureIds: [],
  icon: "search",
  status: "ready",
  plan: "free",
  requires: [],
  optional: ["anthropic"],
  group: "free",
};

const DIAGNOSIS: readonly Feature[] = [
  {
    id: "site-audit",
    path: "/tools/site-audit",
    label: "サイト診断（テクニカル SEO）",
    shortLabel: "サイト診断",
    description:
      "ドメイン配下を最大 N ページクロールし、テクニカル SEO の問題を検出してカテゴリごとに件数化します。前回との差分と CSV 出力に対応。",
    details: [
      "開始 URL から sitemap と内部リンクをたどって最大 N ページを取得",
      "重複 title・canonical・リダイレクト・リンク切れなど 10 カテゴリの課題一覧",
      "前回診断との差分（増減）と課題一覧の CSV 出力",
      "課題のサマリー文（ANTHROPIC_API_KEY があるときのみ AI 生成）",
    ],
    featureIds: ["A1"],
    icon: "stethoscope",
    status: "beta",
    requires: [],
    optional: ["anthropic"],
    group: "diagnosis",
    plan: "standard",
  },
  {
    id: "page-report",
    path: "/tools/page-report",
    label: "ページ最適化レポート（AIO/LLM）",
    shortLabel: "ページ最適化レポート",
    description:
      "1 URL の AI フレンドリー度を 0〜100 点で評価し、項目ごとの測定値・理由・改善提案を表にまとめます。表示速度と Core Web Vitals も併記。",
    details: [
      "本文抽出・内部リンク・robots.txt / llms.txt・構造化データ・head・見出し・alt を項目別に評価",
      "スコア・総評・項目別（ステータス / 測定値・理由 / 改善提案）",
      "PageSpeed Insights による LCP / INP / CLS とパフォーマンス・アクセシビリティスコア（PAGESPEED_API_KEY で上限緩和）",
    ],
    featureIds: ["A2", "A3"],
    icon: "file-report",
    status: "beta",
    requires: [],
    optional: ["pagespeed"],
    group: "diagnosis",
    plan: "standard",
  },
  {
    id: "page-diagnosis",
    path: "/tools/page-diagnosis",
    label: "ページ診断（キーワード × ページ）",
    shortLabel: "ページ診断",
    description:
      "対策キーワードの検索上位 10 件と自社ページを比較し、検索意図・不足要素・title / description 案を提案します。",
    details: [
      "キーワードの検索結果上位 10 件を取得（SerpApi、または Claude の Web 検索で代替）",
      "SERP の傾向・検索意図・SERP フィーチャーの整理",
      "自社ページとの差分から title / description 案と追加すべき見出し・内容を提案",
    ],
    featureIds: ["A4"],
    icon: "target",
    status: "beta",
    requires: [],
    requiresAny: ["serpapi", "anthropic"],
    group: "diagnosis",
    plan: "standard",
  },
  {
    id: "aio-topics",
    path: "/tools/aio-topics",
    label: "AIO 頻出トピック",
    shortLabel: "AIO 頻出トピック",
    description:
      "AI Overviews の本文からトピックを抽出・正規化し、出現割合と自社ページに不足しているトピックを表示します。",
    details: [
      "登録キーワードの AI Overviews 本文を取得してトピックを抽出",
      "トピックの出現割合・傾向・優先度の表",
      "自社ページに不足しているトピックの抽出（ページ診断・AI ライティングへ引き継ぎ）",
    ],
    featureIds: ["A5"],
    icon: "topics",
    status: "beta",
    requires: ["serpapi", "anthropic"],
    group: "diagnosis",
    plan: "standard",
  },
  {
    id: "improvement",
    path: "/tools/improvement",
    label: "HP 改修提案（AI 最適化）",
    shortLabel: "HP 改修提案",
    description:
      "URL を入れてボタンを押すだけで、ページを診断し、そのまま貼って使える改修案を AI が作ります。お客様は内容を確認するだけで、反映は運用者が行います。",
    details: [
      "タイトル・説明文・見出し・本文・構造化データ・alt の改修案を before → after で提示",
      "提案ごとに「なぜ直すか」「期待できること」「優先度」「手間」を表示",
      "変更箇所の色分け表示、コピー、PDF での持ち出し",
    ],
    featureIds: ["A2", "D2"],
    icon: "pen",
    status: "beta",
    requires: ["anthropic"],
    group: "diagnosis",
    plan: "pro",
  },
];

const MEASURE: readonly Feature[] = [
  {
    id: "rank",
    path: "/tools/rank",
    label: "順位計測・AI Overviews 引用",
    shortLabel: "順位計測",
    description:
      "登録キーワードの Google 順位とランディング URL を取得し、AI Overviews に自社・競合が引用されているかを確認します。",
    details: [
      "キーワードごとの順位・変化・ランディング URL・圏外（デバイス / 地域を指定）",
      "その場で順位を取得するリアルタイム計測",
      "AI Overviews の有無と引用サイト一覧、自社のみ / 競合のみ / 両方 / なし の 5 区分",
    ],
    featureIds: ["B1", "B2", "B3"],
    icon: "rank",
    status: "beta",
    requires: ["serpapi"],
    group: "measure",
    plan: "standard",
  },
  {
    id: "search-performance",
    path: "/tools/search-performance",
    label: "検索パフォーマンス（Search Console）",
    shortLabel: "検索パフォーマンス",
    description:
      "連携した Search Console から、クリック数・表示回数・CTR・平均掲載順位を取得します。推定ではなく Google の実測値です。",
    details: [
      "期間の合計と前期間との比較（クリック・表示回数・CTR・平均掲載順位）",
      "日別の推移と、クリックの多いクエリ・ページの一覧",
      "対象サイトは設定画面で Google アカウントを接続して選びます（ユーザーごと）",
    ],
    featureIds: [],
    icon: "target",
    status: "beta",
    // 環境変数ではなく、利用者ごとの Google 連携が必要。
    // 未連携のときは画面側で接続を案内する
    requires: [],
    group: "measure",
    plan: "standard",
  },
  {
    id: "llmo",
    path: "/tools/llmo",
    label: "LLMO モニタリング・LLM リサーチ",
    shortLabel: "LLMO モニタリング",
    description:
      "登録プロンプトを複数の LLM に投げ、ブランド言及率・ドメイン引用率と回答原文を記録します。単発の LLM リサーチにも対応。",
    details: [
      "プロンプト × モデル（Claude / ChatGPT / Gemini / Perplexity）の言及・引用の ○× 行列",
      "回答原文・引用元 URL・LLM が内部で発行した検索クエリ（ファンアウト）",
      "ブランド言及率・引用率の履歴と CSV 出力",
    ],
    featureIds: ["B4", "B8"],
    icon: "robot",
    status: "beta",
    requires: ["anthropic"],
    optional: ["openai", "gemini", "perplexity"],
    group: "measure",
    plan: "standard",
  },
  {
    id: "prompt-expansion",
    path: "/tools/prompt-expansion",
    label: "プロンプト拡張",
    shortLabel: "プロンプト拡張",
    description:
      "参考プロンプトと対象サイトから、ユーザーが AI に聞きそうな関連プロンプトをカテゴリ付きで生成します。",
    details: [
      "課題解決 / 比較・選定 / 手順 などのカテゴリ別に 50 本程度を生成",
      "文字数付きの一覧とコピー",
      "LLMO モニタリングへの一括登録",
    ],
    featureIds: ["B7"],
    icon: "prompt",
    status: "beta",
    requires: ["anthropic"],
    group: "measure",
    plan: "standard",
  },
  {
    id: "ai-traffic",
    path: "/tools/ai-traffic",
    label: "生成 AI 流入分析",
    shortLabel: "生成 AI 流入",
    description:
      "GA4 の参照元から生成 AI チャネル（ChatGPT / Gemini / Perplexity など）を切り出し、セッション・流入ページ・キーイベントを集計します。",
    details: [
      "サービス別のセッション・ユーザー・PV の積み上げ",
      "AI 検索率（対総セッション / 対自然検索）",
      "ページ × 流入元 × キーイベントの表（参照元辞書は追加可能）",
    ],
    featureIds: ["B6"],
    icon: "traffic",
    status: "beta",
    requires: ["ga4"],
    group: "measure",
    plan: "standard",
  },
  {
    id: "site-report",
    path: "/tools/site-report",
    label: "サイトレポート",
    shortLabel: "サイトレポート",
    description:
      "GA4 の KPI（ユーザー数・エンゲージメント・自然検索セッション・CV）の前期比と、登録キーワードの平均順位をひとつのレポートにまとめます。",
    details: [
      "KPI カード（前期比）とチャネル別流入",
      "登録キーワードの平均順位・ファインダビリティスコアの複合グラフ",
      "自社・競合の最新順位表",
    ],
    featureIds: ["E8"],
    icon: "dashboard",
    status: "beta",
    requires: ["ga4", "serpapi"],
    group: "measure",
    plan: "standard",
  },
];

const RESEARCH: readonly Feature[] = [
  {
    id: "keywords",
    path: "/tools/keywords",
    label: "キーワード調査",
    shortLabel: "キーワード調査",
    description:
      "種キーワードから Google サジェスト・関連キーワードを展開し、検索意図を分類して一覧にします。",
    details: [
      "サジェスト・関連キーワードの展開（無料）",
      "検索意図の分類（ANTHROPIC_API_KEY があるときのみ AI 分類）",
      "CSV 出力と順位計測への登録",
    ],
    featureIds: ["C1"],
    icon: "keywords",
    status: "beta",
    requires: [],
    optional: ["anthropic"],
    group: "research",
    plan: "standard",
  },
];

const GENERATE: readonly Feature[] = [
  {
    id: "writing",
    path: "/tools/writing",
    label: "AI ライティング・エディター",
    shortLabel: "AI ライティング",
    description:
      "キーワードから構成・見出し・本文を生成し、エディターでリライト・校正・ファクトチェックまで行います。",
    details: [
      "キーワード → 上位分析 → 構成案 → 本文の一発生成（ストリーミング）",
      "企画書モード（資料から企画書 → 記事）",
      "範囲選択リライト・文体変換・差分表示",
      "ファクトチェック・重複・薬機法 NG 表現のチェック",
    ],
    featureIds: ["D1", "D2", "D3", "D4"],
    icon: "pen",
    status: "beta",
    requires: ["anthropic"],
    group: "generate",
    plan: "pro",
  },
  {
    id: "llms-txt",
    path: "/tools/llms-txt",
    label: "llms.txt 生成",
    shortLabel: "llms.txt 生成",
    description: "サイト情報を入力するウィザードで、AI クローラ向けの llms.txt を生成します。",
    details: [
      "サイト名・概要・主要ページ・連絡先を入力して llms.txt を生成",
      "sitemap から主要ページの候補を自動取得",
      "生成結果のコピー・ダウンロード",
    ],
    featureIds: ["D6"],
    icon: "file-text",
    status: "beta",
    requires: [],
    group: "generate",
    plan: "pro",
  },
];

const SETTINGS: readonly Feature[] = [
  {
    id: "plans",
    path: "/plans",
    label: "料金プラン",
    shortLabel: "料金プラン",
    description:
      "無料診断・スタンダード・プロの 3 つのプランと、それぞれで使えるツールの一覧です。現在のプランもここで確認できます。",
    details: [
      "プランごとに含まれるツールの比較",
      "現在のプランと、その決まり方の表示",
      "プラン変更のご案内",
    ],
    featureIds: [],
    icon: "dashboard",
    status: "ready",
    requires: [],
    group: "settings",
    plan: "free",
  },
  {
    id: "settings",
    path: "/settings",
    label: "プロジェクト・競合・外部連携",
    shortLabel: "設定",
    description:
      "プロジェクト（ドメイン）と競合の登録、外部連携の設定状況、データのエクスポート / インポート。",
    details: [
      "プロジェクト（名前・ドメイン・開始 URL・ブランド表記）の追加・編集・削除",
      "競合（名前・ドメイン・ブランド表記）の登録",
      "外部連携（API キー）の設定状況の確認",
      "ブラウザに保存したデータの JSON エクスポート / インポート",
    ],
    featureIds: ["E1", "E2"],
    icon: "settings",
    status: "ready",
    requires: [],
    group: "settings",
    plan: "free",
  },
];

/** サイドバーに出す順で並べたグループ */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  { id: "free", label: "無料診断", features: [FREE_FEATURE] },
  { id: "diagnosis", label: "診断", features: DIAGNOSIS },
  { id: "measure", label: "計測", features: MEASURE },
  { id: "research", label: "調査", features: RESEARCH },
  { id: "generate", label: "生成", features: GENERATE },
  { id: "settings", label: "設定", features: SETTINGS },
];

/** 全機能のフラットな一覧（サイドバー順） */
export const features: readonly Feature[] = FEATURE_GROUPS.flatMap((g) => g.features);

/** /tools/* と /settings の機能（無料診断を除く） */
export const TOOL_FEATURES: readonly Feature[] = features.filter((f) => f.group !== "free");

function normalizePath(pathname: string): string {
  const p = pathname.split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/**
 * パスから機能を引く。"/" は完全一致、それ以外は前方一致
 * （例: /tools/rank/history → rank）。見つからなければ null。
 */
export function findFeatureByPath(pathname: string): Feature | null {
  const p = normalizePath(pathname);
  if (p === "/") return FREE_FEATURE;
  let best: Feature | null = null;
  for (const f of features) {
    if (f.path === "/") continue;
    if (p === f.path || p.startsWith(`${f.path}/`)) {
      if (!best || f.path.length > best.path.length) best = f;
    }
  }
  return best;
}

/** 機能 ID（"site-audit" など）から引く */
export function findFeatureById(id: string): Feature | null {
  return features.find((f) => f.id === id) ?? null;
}

/** page.tsx 用。登録されていない id はビルド時に気付けるよう例外にする */
export function requireFeature(id: string): Feature {
  const f = findFeatureById(id);
  if (!f) throw new Error(`registry に無い機能です: ${id}`);
  return f;
}

/**
 * サイドバー描画用: 無料診断（単独ブロック）と、その下に並べるツールのグループ。
 */
export function groupsForSidebar(): { free: Feature; tools: readonly FeatureGroup[] } {
  return { free: FREE_FEATURE, tools: FEATURE_GROUPS.filter((g) => g.id !== "free") };
}

/** 現在のパスがその機能の配下か（aria-current 判定） */
export function isFeatureActive(feature: Feature, pathname: string): boolean {
  const p = normalizePath(pathname);
  if (feature.path === "/") return p === "/";
  return p === feature.path || p.startsWith(`${feature.path}/`);
}
