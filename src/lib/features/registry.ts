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

/**
 * サイドバーの並び = お客様の仕事の順番（利用者の決定 2026-09-19）。
 * 診断（いまの状態を知る）→ やること（直す・作る）→ 成果（効果を見る）。
 * 旧: foundation / research / generate は、この 3 つに割り振って廃止した。
 */
export type FeatureGroupId = "free" | "diagnosis" | "improve" | "measure" | "settings";

/**
 * サイドバーの分類。
 * group（基礎 / 診断 / 計測 / …）は「何をするか」、category は「何のための施策か」。
 * 設定・料金など共通のものは category を持たない（どこを開いていても出す）。
 *
 * 位置づけ（利用者の指示 2026-09-17）: このサービスは **AIO 対策の可視化ツール**で、SEO に競合より少し力を入れている。
 * AIO 対策 = SEO 対策 + MEO 対策 + 海外を含む基本情報サイトへの NAP 登録（サイテーション）の総称。
 * だからサイドバーは「AIO 対策」を親のくくりにし、**その中に** SEO / MEO / サイテーションの 3 本の柱を並べる
 * （利用者の指示 2026-09-17「独立しているのではなく、AI の中に SEO・MEO・サイテーションがあると分かる構成に」）。
 * AI 検索モニタリングは柱ではなく、AIO 対策全体の成果をはかるものとして親の直下に置く。
 *
 *   aio      … 親のくくり（AIO 対策）の直下。AI 検索モニタリング
 *   seo      … 柱 1: お客様が持っているホームページの最適化
 *   meo      … 柱 2: Google マップ・口コミ
 *   citation … 柱 3: 基礎情報の掲載（サイテーション・NAP 登録・llms.txt）
 */
export type FeatureCategoryId = "aio" | "seo" | "meo" | "citation";
/** AIO 対策の中の柱（サイドバーで開閉する区切り） */
export type FeaturePillarId = Exclude<FeatureCategoryId, "aio">;

export interface FeatureCategory {
  id: FeatureCategoryId;
  label: string;
  /** 補足（1 行。サイドバーの見出しの下に出す） */
  description: string;
}

/** 親のくくり。サイドバーの見出しになる */
export const AIO_CATEGORY: FeatureCategory = {
  id: "aio",
  label: "AIO 対策",
  description: "AI 検索対策の全体。SEO・MEO・サイテーションの 3 本を土台に、AI に引用・言及される状態をつくる",
};

/** AIO 対策の中の柱。並びは売りの順番（検索 → 地図 → 基礎情報）に合わせる（利用者の指定 2026-09-13） */
export const FEATURE_CATEGORIES: readonly (FeatureCategory & { id: FeaturePillarId })[] = [
  { id: "seo", label: "SEO", description: "お持ちのホームページの最適化。診断・改修案・順位・キーワード・原稿" },
  { id: "meo", label: "MEO", description: "Google マップ・ビジネス プロフィールの改善、口コミ、競合比較" },
  { id: "citation", label: "サイテーション", description: "基礎情報（店名・住所・電話）をウェブに揃えて載せる。掲載チェック・NAP の一括登録" },
];

/** 最初に開いたときに開いている柱（先頭） */
export const DEFAULT_FEATURE_CATEGORY: FeaturePillarId = FEATURE_CATEGORIES[0]!.id;

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
  | "settings"
  | "map"
  | "qr"
  | "reply"
  | "broadcast"
  | "megaphone"
  | "quote";

export interface Feature {
  /** URL セグメント（例: "site-audit"）。クイック診断は "free"、設定は "settings" */
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
  /** サイドバーのタブ。共通のもの（設定・料金）は undefined */
  category?: FeatureCategoryId;
  /**
   * サイドバーに出さない（ページと API は残す）。
   * 別の機能に統合した旧機能に付ける。お客様側の作業が要る機能はそもそも置かない（利用者の決定 2026-09-17）。プランのゲートは残るので、API が素通りにならない。
   */
  hidden?: boolean;
  /**
   * この機能を使うのに必要な料金プラン（src/lib/plans/catalog.ts）。
   * 読む・測る系は light（ライト）、AI が成果物を作る系は standard（スタンダード）。
   * この線が料金表の「ライトとスタンダードの差」そのものなので、動かすときは catalog.ts の文言も直す。
   */
  plan: PlanId;
}

export interface FeatureGroup {
  id: FeatureGroupId;
  label: string;
  features: readonly Feature[];
}

/**
 * クイック診断のまとめ名（画面の見出し・ページタイトル）。
 *
 * 「無料診断」とは呼ばない（利用者の決定 2026-09-13）。値段を名前にすると比べる軸が
 * 「タダか有料か」になり、品質が高いほど「無料で十分」に倒れてしまう。浅い / 深いで
 * 呼び分け、クイック診断（公開情報をその場で採点）⇔ 精密診断（実データ・時系列・競合）
 * とする。「無料」は名前ではなく値札としてバッジで出す。内部の ID（free / free-meo）は変えない。
 */
export const FREE_SUITE_LABEL = "クイック診断（SEO・MEO・AIO）";
/**
 * 有料側の呼び名。画面の文言で「詳細診断」と書かない。
 * 2026-09-16 の利用者の指示で、有料側の総称と `/tools/seo-analysis` の
 * ツール名を「精密診断」に統一した（旧称「パワーアップ分析」→「精密分析」→ これ）。
 * 名前を変えるときはこの定数だけを直す。
 */
export const PAID_DIAGNOSIS_LABEL = "精密診断";

export const FREE_FEATURE: Feature = {
  id: "free",
  path: "/",
  label: "クイック診断（サイト・SEO / AIO）",
  shortLabel: "サイトを診断（SEO・AIO）",
  description:
    "URL を入れるだけで、検索エンジンと AI 検索（AIO）に読まれる土台をルールベースで採点し、報告書として PDF 出力できます。アカウント登録（無料）のあと、メールアドレスごとに 2 回まで。実データを使った精密診断は有料プランで。",
  details: [
    "1 ページ、またはサイト全体の代表 10 ページ（sitemap と内部リンクから収集）を採点",
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

/**
 * クイック診断（店舗）。店名で探して 1 店舗の公開情報を採点する（ログイン不要）。
 * 有料の /tools/maps との違い: 保存しない・競合なし・毎週の更新なし・AI 総評なし。
 * 実費（Places）が出るので API 側で回数制限をかける（src/lib/free/ratelimit.ts）。
 */
export const FREE_MEO_FEATURE: Feature = {
  id: "free-meo",
  path: "/meo",
  label: "クイック診断（店舗・MEO）",
  shortLabel: "店舗を診断（MEO）",
  description:
    "店名を入れるだけで、Google マップ上の店舗情報（ビジネス プロフィール）を基本情報・投稿・写真・レビューの 4 カテゴリで採点し、報告書として PDF 出力できます。アカウント登録（無料）のあと、メールアドレスごとに 2 回まで（サイト診断と合計）。",
  details: [
    "店名・地域で検索して店舗を 1 件選ぶ",
    "総合評価 A〜E と 4 カテゴリ・21 項目の判定、改善ヒント、総評（ルール生成）",
    "口コミ情報（平均評価・件数・直近の口コミ・星の分布）",
    "PDF ダウンロード。競合との比較・毎週の更新・AI 総評は精密診断（有料）で",
  ],
  featureIds: [],
  icon: "map",
  status: "beta",
  plan: "free",
  requires: ["places"],
  group: "free",
};

const DIAGNOSIS: readonly Feature[] = [
  {
    id: "seo-analysis",
    path: "/tools/seo-analysis",
    label: `${PAID_DIAGNOSIS_LABEL}（サイト全体の診断 + 専門家のアドバイス）`,
    shortLabel: PAID_DIAGNOSIS_LABEL,
    description:
      "設定に登録したホームページをまるごと診断します。サイト全体をクロールして 48 ルールで課題を検出し、主要ページの速度（実ユーザー / 診断）・検索順位・ドメインの情報と合わせて 1 枚にまとめ、その数字だけを根拠に「専門家のアドバイス」（現状と優先順位つきの改善案）を作ります。",
    details: [
      "クロール（48 ルール・サイトの構成・信頼。課題一覧・カテゴリ別件数・ページ一覧・CSV は報告書の「詳細」に）+ トップの採点 + 主要 6 ページの PageSpeed / CrUX + 対策キーワードの順位 + 外部からの評価（被リンク・インデックス数）+ llms.txt の有無と中身",
      "専門家のアドバイス: 事実 ID を引用しながら、現状・強みと弱み・改善案 5〜6 件（優先度 / 手間 / 期待できること / 書き換え案）・「この数字を見たからこそ言えること」（文章は AI が診断結果だけを根拠に書きます）",
      "事実シートの付録、PDF、履歴。月 10 回まで",
    ],
    featureIds: [],
    icon: "dashboard",
    status: "beta",
    requires: ["supabase", "anthropic"],
    optional: ["pagespeed", "serpapi"],
    group: "diagnosis",
    category: "seo",
    plan: "standard",
  },
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
    category: "seo",
    plan: "light",
    // 2026-09-15 精密診断に統合（同じクロールと 48 ルールをその中で実行し、詳細も出す）。
    // /tools/site-audit は精密診断へ転送。API と履歴の部品は残す
    hidden: true,
  },
  {
    id: "page-report",
    path: "/tools/page-report",
    label: "ページ最適化レポート（AIO/LLM）",
    shortLabel: "ページ最適化レポート",
    description:
      "設定に登録したホームページの 1 ページを AI フレンドリー度 0〜100 点で評価し、項目ごとの測定値・理由・改善提案を表にまとめます。表示速度と Core Web Vitals も併記。",
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
    category: "aio",
    plan: "light",
    // 2026-09-17 サイドバーから外した（利用者の指示「本当に必要な機能に絞る」）。
    // 1 ページの AI フレンドリー度の採点はクイック診断（/）が無料で出し、直し方は HP 改修提案が
    // 同じ診断（A2）を走らせたうえで改修案まで作る。/tools/page-report は HP 改修提案へ転送。
    // API と src/lib/page-report/ は HP 改修提案・PSI・llms.txt が使うので残す
    hidden: true,
  },
  {
    id: "page-diagnosis",
    path: "/tools/page-diagnosis",
    label: "ページ診断（キーワード × 競合の上位 10 件と比較）",
    shortLabel: "ページ診断（競合比較）",
    description:
      "1 つの対策キーワードについて、Google の上位 10 件と自社の 1 ページを比べ、検索意図・不足している要素・title / description 案を提案します。サイト全体を見る精密診断とは違い、「この語で勝つには何が足りないか」を 1 ページ単位で深掘りします。",
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
    category: "seo",
    // 2026-09-19: 「ページ改善」に統合。プランのゲートと API はこの ID のまま使う
    hidden: true,
    plan: "light",
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
    category: "aio",
    plan: "light",
    // 2026-09-17 サイドバーから外した（利用者の指示「本当に必要な機能に絞る」）。
    // SerpApi と Anthropic の両方が要るうえ、「AI が何を語っているか」は AI 検索モニタリングが
    // 引用・参照として毎週はかる。/tools/aio-topics は AI 検索モニタリングへ転送。API は残す
    hidden: true,
  },
  {
    id: "improvement",
    path: "/tools/improvement",
    label: "HP 改修提案（そのまま貼れる改修案を AI が作成）",
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
    group: "improve",
    // お客様のホームページそのものを直す機能なので SEO タブ（利用者の指示 2026-09-17。AIO から移動）
    category: "seo",
    // 2026-09-19: 「ページ改善」に統合。プランのゲートと API はこの ID のまま使う
    hidden: true,
    plan: "standard",
  },
  {
    id: "page-improve",
    path: "/tools/page-improve",
    label: "ページ改善（競合と比べて、貼れる改修案まで）",
    shortLabel: "ページ改善",
    description:
      "1 ページをよくするための画面です。対策キーワードを入れると Google の上位 10 件と比べて「何が足りないか」を出し、そのままボタン 1 つで、貼って使える改修案（タイトル・説明文・見出し・本文）を AI が作ります。",
    details: [
      "競合と比べる: 上位 10 件の傾向・検索意図・不足している要素・title / description 案（旧「ページ診断」）",
      "改修案を作る: before → after の書き換え案を、なぜ直すか・期待できること・優先度つきで（旧「HP 改修提案」）",
      "対象ページは設定のホームページから選ぶ。空欄ならトップページ",
    ],
    featureIds: ["A4", "A2", "D2"],
    icon: "pen",
    status: "beta",
    requires: [],
    requiresAny: ["serpapi", "anthropic"],
    group: "improve",
    category: "seo",
    // 2026-09-19 にページ診断（ライト）と HP 改修提案（スタンダード）を 1 画面 2 タブに統合した。
    // 入口はライトで開け、タブごとに旧 ID（page-diagnosis / improvement）でプランを確かめる
    plan: "light",
  },
];

/**
 * 基礎対策（AIO タブの土台）。海外を含む基本情報サイトに NAP（店名・住所・電話）を揃えて載せ、
 * ウェブ上でどう言及されているか（サイテーション）を確かめ、AI クローラ向けの llms.txt を置く。
 * 生成 AI は複数の媒体で一致した基本情報を「実在する事業者」と認識して回答に含める。
 */
const FOUNDATION: readonly Feature[] = [
  {
    id: "nap",
    path: "/tools/nap",
    label: "NAP チェック（表記ゆれの検出）",
    shortLabel: "NAP チェック",
    description:
      "店名・住所・電話番号・サイト URL の 4 つを「正」として入れると、自社サイト（構造化データ・フッター・会社概要・お問い合わせ）、Google マップ、掲載ページに書かれている値を取りに行き、項目ごとに一致か不一致かで答えます。出てくるのは「直すべき箇所」の一覧です。",
    details: [
      "自社サイト: トップから会社概要・お問い合わせ・アクセスなどを最大 4 ページ辿り、構造化データ（JSON-LD）とフッター・本文の店名・住所・電話番号を突き合わせる",
      "Google マップ: MEO の保存済み報告書か Places API で同じ店舗を見つけ、店名・住所・電話・サイトを突き合わせる",
      "掲載ページ: 「掲載」タブで控えた URL と、検索で見つかった媒体のページ（最大 6 件）を開いて突き合わせる",
      "全角 / 半角・空白・ハイフン・法人格の略記の違いは一致とみなし、それ以外は不一致。建物名だけの違いは要確認",
      "直すべき箇所を「不一致 → 要確認」の順に、直し方と URL つきで一覧に（CSV）。構造化データが無い・ずれているサイトには貼る JSON-LD を出す",
    ],
    featureIds: [],
    icon: "target",
    status: "beta",
    // 自社サイトの確認だけならキー不要。Google マップは Places、掲載ページの発見は DataForSEO、控えた URL は Supabase があれば増える
    requires: [],
    optional: ["places", "dataforseo", "supabase"],
    group: "diagnosis",
    category: "citation",
    // 読む・測る系なのでライト。利用者の決定 2026-09-20「登録されている内容がずれていないかを主機能にする」
    plan: "light",
  },
  {
    id: "citations",
    path: "/tools/citations",
    label: "掲載（ウェブ上の掲載チェックと NAP 登録）",
    shortLabel: "掲載",
    description:
      "「どこに載っているか調べる」と「載っていない先に登録する」を 1 画面にまとめました。店名・電話・住所で検索して掲載状況と食い違いを一覧にし、そのまま日本で効く 7 媒体へ同じ内容で登録していけます。多くの媒体は nofollow なので被リンク（ドメインパワー）への効果は限定的で、効くのは指名検索の受け皿・NAP の一貫性・AI が拾う事実の裏づけです。",
    details: [
      "調べる: 店名・電話・住所で検索し、地図・ディレクトリ・口コミ・SNS・メディアの掲載状況と、電話番号や住所の食い違いを一覧に",
      "登録する: 店名・住所・電話・営業時間・説明文を 1 か所で決め、日本で効く 7 媒体（Google / Yahoo!プレイス / Bing / Apple / i タウンページ / エキテン / Facebook・Instagram）に同じ内容で登録。海外ディレクトリ・カーナビは「上級」に畳んである",
      "未掲載の媒体はそのまま登録画面へ進める",
    ],
    featureIds: [],
    icon: "quote",
    status: "beta",
    requires: ["dataforseo"],
    group: "diagnosis",
    category: "citation",
    // 読む・測る系なのでライト。1 回 = DataForSEO の検索 3 回（数円）
    plan: "light",
  },
  {
    id: "listings",
    path: "/tools/listings",
    label: "基本情報掲載（NAP 一括登録）",
    shortLabel: "基本情報掲載",
    description:
      "店名・住所・電話・営業時間・説明文を 1 か所で決め、日本で効く 7 媒体（Google / Yahoo!プレイス / Bing / Apple / i タウンページ / エキテン / Facebook・Instagram）に同じ内容で載せます。登録画面へ直接進め、掲載状況を店舗ごとに管理します。海外ディレクトリ・カーナビなどの 25 媒体は「上級」に畳んであります。",
    details: [
      "MEO の自社店舗ごとに基本情報（NAP）を決め、Google マップの公開情報から取り込み・表記ゆれを確認",
      "日本で効く 7 媒体の登録画面と手順、コピー用の基本情報（海外ディレクトリ・カーナビは「上級」に畳む）",
      "自動で流れる媒体（Siri・カーナビ各社・Navmii・Uber）と、配信代行（有料）でしか載らない媒体の区別",
      "AI が説明文（短い 150 文字 / 長い 750 文字）を作成、サイトに貼る構造化データ（LocalBusiness）を生成",
      "AIO への効果: ChatGPT（Bing）・Gemini（Google）・Copilot / Perplexity は複数の媒体で一致した基本情報を「実在する店」と認識して回答に含める。インバウンドは Apple マップ・Siri・Yelp・カーナビにも届く",
    ],
    featureIds: [],
    icon: "broadcast",
    status: "beta",
    requires: ["supabase"],
    optional: ["anthropic", "places"],
    // NAP 登録は AIO の土台（サイテーションの隣）
    group: "improve",
    category: "citation",
    // 2026-09-19: 「掲載」（サイテーション）に統合。プランのゲートと API はこの ID のまま使う
    hidden: true,
    plan: "standard",
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
    // AI クローラに読ませる土台なので基礎対策（生成 → 移動。2026-09-17）
    group: "improve",
    category: "citation",
    // 2026-09-19 サイドバーから外した（利用者の決定「llms.txt は顧客にやらせるべきではない」）。
    // 生成したファイルをサーバーの / に置く作業がお客様側に発生し、専門的すぎる。
    // 精密診断が llms.txt の有無と中身を見て、必要なら運用者が用意する。ページと API は残す
    hidden: true,
    plan: "standard",
  },
];

const MEASURE: readonly Feature[] = [
  {
    id: "rank",
    path: "/tools/rank",
    label: "順位計測（順位・AI Overviews・検索の推定・キーワード調査）",
    shortLabel: "順位計測",
    description:
      "「どの語で何位か」をまとめて見る画面です。登録キーワードの順位と AI Overviews の引用に加えて、まだ登録していない語の洗い出し（検索の推定）と、これから狙う語探し（キーワード調査）を同じ画面のタブで行います。",
    details: [
      "キーワードごとの順位・変化・ランディング URL・圏外（デバイス / 地域を指定）",
      "その場で順位を取得するリアルタイム計測",
      "AI Overviews の有無と引用サイト一覧、自社のみ / 競合のみ / 両方 / なし の 5 区分",
      "検索の推定: そのドメインがすでに順位を持っている語と、推定の表示回数・クリック数（旧「検索パフォーマンス（推定）」）",
      "キーワード調査: サジェスト・関連キーワードの展開と検索意図の分類（旧「キーワード調査」）",
    ],
    featureIds: ["B1", "B2", "B3", "C1"],
    icon: "rank",
    status: "beta",
    requires: ["serpapi"],
    optional: ["dataforseo"],
    group: "measure",
    category: "seo",
    plan: "light",
  },
  {
    id: "search-estimate",
    path: "/tools/search-estimate",
    label: "検索パフォーマンス（推定）",
    shortLabel: "検索の推定",
    description:
      "Search Console を連携していなくても、ドメインを入れるだけで「どのキーワードで何位にいて、どれくらい見られているか」を推定します。実測値ではありません。",
    details: [
      "そのドメインが順位を持っているキーワードを自動で集めます（登録作業は不要）",
      "順位ごとのクリック率から、推定の表示回数・クリック数・CTR・平均順位を出します",
      "実際に検索された語そのものは Search Console にしかありません。本サービスは Search Console を使わないため、ここに出るのはすべて推定値です",
    ],
    featureIds: [],
    icon: "traffic",
    status: "beta",
    // ドメインを渡すだけで動く。お客様側の設定は要らない（ここが Search Console との違い）
    requires: ["dataforseo"],
    group: "measure",
    category: "seo",
    // 2026-09-19: 「順位計測」のタブに統合。プランのゲートと API はこの ID のまま使う
    hidden: true,
    plan: "light",
  },
  {
    id: "maps",
    path: "/tools/maps",
    label: "Google マップ・店舗情報（MEO）",
    shortLabel: "Google マップ",
    description:
      "Google マップ上の自社ビジネス プロフィールを、基本情報・投稿・写真・レビューの 4 カテゴリで採点した診断報告書（総評つき、PDF 出力）を作り、競合と並べて比較します。数字は毎週月曜 5:00 に一斉更新され、履歴として残ります。",
    details: [
      "店名・地域で検索して、自社の店舗と、その競合を最大 5 件ずつ登録する（複数店舗の管理に対応）",
      "総合評価 A〜E と 4 カテゴリ（基本情報 / 投稿 / 写真 / レビュー）の採点、項目ごとの判定と改善ヒント",
      "総評（ルール生成。ANTHROPIC_API_KEY があれば AI が執筆）と口コミ情報、PDF ダウンロード",
      "毎週月曜 5:00 の一斉更新で数字を取り直し、履歴として保存。最新診断結果と前回との差分",
      "評価・口コミ件数・写真・営業時間・電話・サイトの競合比較表",
      "オーナー権限が要る項目（投稿・返信率など）は「未取得」として表示し、Business Profile 連携後に評価に含める",
    ],
    featureIds: [],
    icon: "map",
    status: "beta",
    requires: ["places", "supabase"],
    group: "diagnosis",
    category: "meo",
    plan: "light",
  },
  {
    id: "reviews",
    path: "/tools/reviews",
    label: "口コミ支援（アンケート QR）",
    shortLabel: "口コミ支援（アンケート）",
    description:
      "口コミを集める・返すをまとめた画面です。店内の QR からアンケートに答えてもらい、AI が作った下書きを来店客が編集して Google マップに投稿できます。届いた口コミへの返信案もこの画面で作れます。低評価は先に店舗だけに知らされるので、口コミにならなかった不満も改善に活かせます。",
    details: [
      "集める: アンケートの作成、店舗ごとの QR 発行、回答の集計、AI が作る口コミの下書き（来店客が編集して投稿）",
      "返す: Google マップの口コミへの返信案を AI が作成。ビジネス プロフィールを接続すると取得と投稿までこの画面で完結（旧「口コミへの返信」）",
      "低評価は先に店舗だけに通知。口コミにならなかった不満も残す",
    ],
    featureIds: [],
    icon: "qr",
    status: "beta",
    requires: ["supabase"],
    optional: ["anthropic", "places"],
    group: "improve",
    category: "meo",
    plan: "standard",
  },
  {
    id: "posts",
    path: "/tools/posts",
    label: "ビジネス プロフィールへの投稿",
    shortLabel: "投稿（最新情報）",
    description:
      "Google ビジネス プロフィールの「最新情報」を、AI が作った下書きを編集してそのまま投稿します。投稿の有無と頻度は MEO の診断（投稿カテゴリ）で採点している項目で、ここがその打ち手です。",
    details: [
      "掲載タブで決めた基本情報（店名・業種・説明文）を材料に、AI が投稿の下書きを作る",
      "編集して Google に投稿（ボタン: 詳細 / 予約 / オンライン注文 / 購入 / 登録 / 今すぐ電話）",
      "これまでの投稿の一覧と状態（掲載中 / 処理中 / 非承認）、Google 上の投稿へのリンク、削除",
      "口コミ返信と同じ権限（business.manage）で送るので、追加の連携は要らない",
    ],
    featureIds: [],
    icon: "megaphone",
    status: "beta",
    requires: [],
    optional: ["anthropic", "supabase"],
    group: "improve",
    category: "meo",
    plan: "standard",
  },
  {
    id: "geo",
    path: "/tools/geo",
    label: "AI 検索モニタリング（引用・参照の定点観測）",
    shortLabel: "AI 検索モニタリング",
    description:
      "ChatGPT / Gemini / AI Overviews で、自社が「引用」「参照」される割合を毎週はかり、競合と並べます。1 回の結果で語らず、4 週ローリングと信頼区間で「言えることだけ」を出します。",
    details: [
      "プロンプト × モデルを日をまたいで反復計測（通常 週 3 回 / 高精度 週 10 回）。連続実行は言葉のゆらぎしか見ないので日次に分散する",
      "引用（ソース欄に自社ドメイン）と参照（本文にブランド名）を 1 回の計測から両方取る。追加費用なし",
      "ブランドシェアスコアを 4 週ローリング + 信頼区間のバンドで表示。モデル更新日を自動でグラフに引く",
      "指名検索は自社引用率・引用元構成比・競合同時言及率を主指標にする（参照率は天井に張り付くため）",
      "クレジット制（月 2,000）。上限に達しても定期計測は止めず、今すぐ実行だけを止める",
    ],
    featureIds: [],
    icon: "broadcast",
    status: "beta",
    requires: ["dataforseo", "supabase"],
    optional: ["anthropic"],
    group: "measure",
    // 柱ではなく AIO 対策全体の成果をはかるので、親（AIO 対策）の直下に出す
    category: "aio",
    // 「測る」系だが、1 アカウント月 ¥2,000 前後の変動費（DataForSEO）が出るためスタンダード（plans.test.ts）。
    // 2026-09-17 に LLMO モニタリング（ライト）を引退させ、AI の計測をここに一本化した。ライトには AI の計測が無い
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
      "AI 検索モニタリングへの一括登録",
    ],
    featureIds: ["B7"],
    icon: "prompt",
    status: "beta",
    requires: ["anthropic"],
    group: "measure",
    category: "aio",
    plan: "light",
    // 2026-09-17 サイドバーから外した（利用者の指示「本当に必要な機能に絞る」）。
    // AI 検索モニタリングのプロンプトを増やすための下ごしらえなので、単独の項目にせず、
    // AI 検索モニタリングの設定画面からリンクで開く。ページと API はそのまま
    hidden: true,
  },
  {
    id: "monitor",
    path: "/tools/monitor",
    label: "サイトの事故監視",
    shortLabel: "サイト監視",
    description:
      "ホームページの主要ページを毎週確認し、放っておくと検索からの流入が止まる事故（noindex の混入・robots.txt の全拒否・エラー・別サイトへの転送・SSL 証明書の期限・リンク切れ・構造化データの崩れ）が起きたときに知らせます。",
    details: [
      "毎週水曜 5:00 に自動で確認（トップ + 精密診断で重要度の高いページ + トップからの内部リンク）",
      "前回は無かった事故だけを「お知らせ」とメールで知らせる（同じ事故を毎週知らせない）",
      "SSL 証明書の残り日数、サイトマップと robots.txt の状態、ページごとの HTTP 状態と取得時間",
    ],
    featureIds: [],
    icon: "dashboard",
    status: "beta",
    requires: ["supabase"],
    group: "measure",
    category: "seo",
    plan: "light",
  },
  {
    id: "reports",
    path: "/tools/reports",
    label: "月次レポートとお知らせ",
    shortLabel: "月次レポート",
    description:
      "毎月 1 日に、前月の数字（検索順位・Google マップ・AI 検索・精密診断・掲載・口コミ）と、その月に起きたこと、来月やることを 1 枚にまとめます。順位の急落・サイトの事故・掲載の消失などの「お知らせ」もここに残ります。",
    details: [
      "前月との比較（上がった語・下がった語、MEO のスコアと口コミ、AI 検索の引用率、掲載の状況）",
      "来月やること（数字の変化から自動で組み立てた優先順位）",
      "メールでも受け取れる（設定で ON / OFF）。PDF でダウンロード",
    ],
    featureIds: [],
    icon: "file-report",
    status: "beta",
    requires: ["supabase"],
    optional: ["resend"],
    group: "measure",
    category: "aio",
    plan: "light",
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
    group: "improve",
    category: "seo",
    // 2026-09-19: 「順位計測」のタブに統合。プランのゲートと API はこの ID のまま使う
    hidden: true,
    plan: "light",
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
    group: "improve",
    category: "seo",
    plan: "standard",
  },
  {
    id: "replies",
    path: "/tools/replies",
    label: "口コミへの返信（AI 返信案）",
    shortLabel: "口コミへの返信",
    description:
      "Google マップの口コミに、AI が作った返信案を編集してそのまま投稿します。Google ビジネス プロフィールを接続すると全件の取得と投稿がこの画面で完結し、接続前でも公開情報の口コミから返信案を作ってコピーできます。",
    details: [
      "未返信の口コミを先頭に、評価・本文・既存の返信を一覧で確認",
      "AI が返信案を作成（トーン、店舗からの補足、署名を設定）。低評価はお詫び → 事実確認 → 改善 → 個別連絡の型",
      "編集してそのまま Google に投稿・返信の修正・削除（Google ビジネス プロフィール接続時）",
      "接続前は Google マップの公開情報の口コミ（最新 5 件）で返信案を作り、コピーして Google の管理画面で返信",
    ],
    featureIds: [],
    icon: "reply",
    status: "beta",
    requires: [],
    optional: ["anthropic", "supabase", "places"],
    group: "improve",
    category: "meo",
    // 2026-09-19: 「口コミ」に統合。プランのゲートと API はこの ID のまま使う
    hidden: true,
    plan: "standard",
  },
  {
    id: "posts",
    path: "/tools/posts",
    label: "Google ビジネス プロフィールの投稿（AI 下書き・予約投稿）",
    shortLabel: "投稿",
    description:
      "Google マップに出る「最新情報・イベント・クーポン」の投稿を、店舗の情報と対策キーワードから AI が下書きし、承認した分を予約日時に自動で投稿します。週 1 回の投稿を続けることが MEO の理想状態です。",
    details: [
      "4 週分の下書きを一度に作る（季節・対策キーワード・店舗のカテゴリを踏まえる）",
      "本文を直して「承認して予約」。毎日 5:00 の定期処理が予定時刻を過ぎた分を投稿",
      "投稿の履歴と失敗の理由（Business Profile API の承認前は失敗として残る）",
    ],
    featureIds: [],
    icon: "broadcast",
    status: "beta",
    requires: ["supabase", "google-business"],
    optional: ["anthropic"],
    group: "improve",
    category: "meo",
    plan: "standard",
  },
];

const SETTINGS: readonly Feature[] = [
  {
    id: "plans",
    path: "/plans",
    label: "料金プラン",
    shortLabel: "料金プラン",
    description:
      "未契約・スタンダード・プロの 3 つの状態と、それぞれで使えるツールの一覧です。現在のプランもここで確認できます。",
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
    label: "基本情報・ホームページ・競合・キーワード",
    shortLabel: "設定",
    description:
      "全ツール共通の基本設定をここに集約しています。会社・店舗の基本情報（アカウント登録時のデータ）、ホームページ（自社サイト）の URL、競合、対策キーワード、Google マップの店舗。ここで 1 回登録すれば各ツールが自動で使うので、同じ内容を何度も入力する必要はありません（各ツールでは細かい変更だけ）。",
    details: [
      "会社・店舗の基本情報（会社名・担当者名・電話・店舗の種類・所在地・地域）の確認と書き換え",
      "ホームページの URL（サイト名・ブランド表記も任意で）の登録・変更・削除",
      "競合（名前・URL・ブランド表記）の登録。順位計測・精密診断・AI 検索モニタリングが使う",
      "対策キーワードの登録。順位計測・精密診断・AI 検索モニタリングが使う",
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

/**
 * サイドバーに出す順で並べたグループ。
 *
 * 並び = お客様の仕事の順番（利用者の決定 2026-09-19）:
 * 診断（いまの状態を知る）→ やること（直す・作る）→ 成果（効果を見る）。
 * 各機能の `group` から組み立てるので、機能を足すときは `group` を決めるだけでよい。
 */
const ALL_TOOLS: readonly Feature[] = [...DIAGNOSIS, ...FOUNDATION, ...MEASURE, ...RESEARCH, ...GENERATE, ...SETTINGS];
const inGroup = (id: FeatureGroupId) => ALL_TOOLS.filter((f) => f.group === id);

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  { id: "free", label: FREE_SUITE_LABEL, features: [FREE_FEATURE, FREE_MEO_FEATURE] },
  { id: "diagnosis", label: "診断（いまの状態を知る）", features: inGroup("diagnosis") },
  { id: "improve", label: "やること（直す・作る）", features: inGroup("improve") },
  { id: "measure", label: "成果（効果を見る）", features: inGroup("measure") },
  { id: "settings", label: "設定", features: inGroup("settings") },
];

/** 全機能のフラットな一覧（サイドバー順） */
export const features: readonly Feature[] = FEATURE_GROUPS.flatMap((g) => g.features);

/** /tools/* と /settings の機能（クイック診断を除く） */
export const TOOL_FEATURES: readonly Feature[] = features.filter((f) => f.group !== "free");

/**
 * 料金表・マスター画面・サービス資料に出すツールのグループ。
 * クイック診断と設定を除き、サイドバーから外した機能（hidden）も出さない。
 * サイドバー以外の一覧がここを使わないと、引退した機能が料金表にだけ残る。
 */
export function toolGroupsForDisplay(): readonly FeatureGroup[] {
  return FEATURE_GROUPS.filter((g) => g.id !== "free" && g.id !== "settings")
    .map((g) => ({ ...g, features: g.features.filter((f) => !f.hidden) }))
    .filter((g) => g.features.length > 0);
}

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
 * サイドバー描画用: クイック診断（単独ブロック）と、その下に並べるツールのグループ。
 * category を渡すと、その分類の機能と共通（category 無し）の機能だけに絞る。空のグループは落とす。
 */
export function groupsForSidebar(category?: FeatureCategoryId): { free: readonly Feature[]; tools: readonly FeatureGroup[] } {
  const free = FEATURE_GROUPS.find((g) => g.id === "free")?.features ?? [FREE_FEATURE];
  const groups = FEATURE_GROUPS.filter((g) => g.id !== "free").map((g) => ({ ...g, features: g.features.filter((f) => !f.hidden) }));
  if (!category) return { free, tools: groups.filter((g) => g.features.length > 0) };
  const tools = groups
    .map((g) => ({ ...g, features: g.features.filter((f) => !f.category || f.category === category) }))
    .filter((g) => g.features.length > 0);
  return { free, tools };
}

export interface SidebarPillar {
  category: FeatureCategory & { id: FeaturePillarId };
  features: readonly Feature[];
}

export interface SidebarTree {
  /** 親（AIO 対策）の直下に出す機能（AI 検索モニタリング） */
  umbrella: readonly Feature[];
  /** AIO 対策の中の柱（SEO / MEO / サイテーション）と、その中の機能（サイドバー順） */
  pillars: readonly SidebarPillar[];
  /** どこを開いていても出す共通の機能（料金・設定） */
  common: readonly Feature[];
}

/** サイドバーの木。「AIO 対策の中に SEO・MEO・サイテーションがある」がそのまま構造になっている */
export function sidebarTree(): SidebarTree {
  const visible = TOOL_FEATURES.filter((f) => !f.hidden);
  return {
    umbrella: visible.filter((f) => f.category === "aio"),
    pillars: FEATURE_CATEGORIES.map((category) => ({ category, features: visible.filter((f) => f.category === category.id) })),
    common: visible.filter((f) => !f.category),
  };
}

/** パスが属する分類（共通の機能やクイック診断なら null） */
export function categoryForPath(pathname: string): FeatureCategoryId | null {
  return findFeatureByPath(pathname)?.category ?? null;
}

export function isPillar(id: FeatureCategoryId | null | undefined): id is FeaturePillarId {
  return id !== null && id !== undefined && id !== "aio";
}

export function findCategory(id: FeatureCategoryId): FeatureCategory {
  if (id === "aio") return AIO_CATEGORY;
  const c = FEATURE_CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`registry に無い分類です: ${id}`);
  return c;
}

/** 現在のパスがその機能の配下か（aria-current 判定） */
export function isFeatureActive(feature: Feature, pathname: string): boolean {
  const p = normalizePath(pathname);
  if (feature.path === "/") return p === "/";
  return p === feature.path || p.startsWith(`${feature.path}/`);
}
