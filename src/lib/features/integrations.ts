/**
 * 外部連携の定義（クライアントでも読める。キーの値は一切含まない）。
 * 実際に設定されているかどうかは src/lib/integrations.ts（サーバー）が判定し、
 * GET /api/integrations で boolean だけを返す。
 */
export const INTEGRATION_KEYS = [
  "anthropic",
  "openai",
  "gemini",
  "perplexity",
  "serpapi",
  "pagespeed",
  "ahrefs",
  "openpagerank",
  "ga4",
  "places",
  "supabase",
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

/** 公式サイトへのリンク（マスター画面からタップで開く） */
export interface IntegrationLink {
  label: string;
  url: string;
}

export interface IntegrationMeta {
  key: IntegrationKey;
  label: string;
  /** .env.local に設定する変数名（複数のときは全部必要） */
  envVars: readonly string[];
  /** 何に使うか（設定画面・SetupNotice に出す） */
  description: string;
  /** 料金（PRICING_CHECKED_AT 時点。単価は公式ページで必ず確認） */
  pricing: string;
  /** 回数・容量の上限と、超えたときに何が起きるか */
  limits: string;
  /** このツールが 1 回の操作で何回呼ぶか（費用の見積もりに使う） */
  usage: string;
  /** 公式サイト。先頭が「公式・料金」の入口 */
  links: readonly IntegrationLink[];
}

/** 料金・上限を確認した日（マスター画面に出す。単価は変わるので、古くなったら見直す） */
export const PRICING_CHECKED_AT = "2026-09-16";

export const INTEGRATIONS: Record<IntegrationKey, IntegrationMeta> = {
  anthropic: {
    key: "anthropic",
    label: "Anthropic（Claude）",
    envVars: ["ANTHROPIC_API_KEY"],
    description: "FAQ 生成・LLM サマリー・LLMO（Claude）・プロンプト拡張・AI ライティング・精密診断の AI 分析",
    pricing: "従量制（Console で前払いクレジットを買う。Claude Pro / Max の定額プランでは使えない）。100 万トークンあたり Claude Opus 5 = 入力 $5 / 出力 $25、Claude Haiku 4.5 = 入力 $1 / 出力 $5。プロンプトキャッシュの読み取りは入力の約 1/10",
    limits: "組織の利用階層（Tier）ごとに 1 分あたりのリクエスト数・トークン数の上限があり、超えると 429。クレジット残高が 0 になると全機能の AI が止まる（Console の Billing で自動チャージを設定できる）",
    usage: "精密診断の AI 分析 1 回 = Opus 5 で数万トークン（事実シートの量で変わる。数十〜数百円）。MEO の AI 総評 1 回 ≈ 5 円。FAQ 生成・判定・分類は Haiku 4.5（`LLM_FAST_MODEL`）",
    links: [
      { label: "料金", url: "https://docs.claude.com/en/docs/about-claude/pricing" },
      { label: "レート制限", url: "https://docs.claude.com/en/api/rate-limits" },
      { label: "Console → 使用量・請求", url: "https://platform.claude.com/settings/billing" },
      { label: "Console → API キー", url: "https://platform.claude.com/settings/keys" },
    ],
  },
  openai: {
    key: "openai",
    label: "OpenAI（ChatGPT）",
    envVars: ["OPENAI_API_KEY"],
    description: "LLMO モニタリングで ChatGPT を対象にする。精密診断のセカンドオピニオン",
    pricing: "従量制（プリペイド）。既定モデルは gpt-5（`OPENAI_MODEL` で変更）。トークン単価に加えて、Web 検索ツール（web_search）の呼び出し料金が別建て。単価は改定が早いので公式ページで確認",
    limits: "利用階層（Tier。累計の支払額で上がる）ごとに 1 分あたりのリクエスト数・トークン数の上限。超えると 429",
    usage: "LLMO の ChatGPT 列 = 1 質問 1 回（Web 検索つき）。精密診断のセカンドオピニオン 1 回 = 1 回（事実シート + Claude の分析を渡すので入力が多い）",
    links: [
      { label: "料金", url: "https://openai.com/api/pricing/" },
      { label: "レート制限", url: "https://platform.openai.com/docs/guides/rate-limits" },
      { label: "使用量", url: "https://platform.openai.com/usage" },
      { label: "API キー", url: "https://platform.openai.com/api-keys" },
    ],
  },
  gemini: {
    key: "gemini",
    label: "Google Gemini",
    envVars: ["GEMINI_API_KEY"],
    description: "LLMO モニタリングで Gemini を対象にする",
    pricing: "既定モデル gemini-2.5-flash（`GEMINI_MODEL` で変更）は無料枠つき。有料は 100 万トークンあたり入力 $0.30 / 出力 $2.50。2.5 Flash は 2026-10-16 に提供終了予定なので、それまでに `GEMINI_MODEL` を新しい Flash に切り替える",
    limits: "無料枠は 1 分 15 回・1 日 1,500 回程度（モデルにより異なる。Pro 系は無料枠から外れた）。超えると 429。有料化すると Tier で上限が上がる",
    usage: "LLMO の Gemini 列 = 1 質問 1 回（Google 検索グラウンディングつき）",
    links: [
      { label: "料金", url: "https://ai.google.dev/gemini-api/docs/pricing" },
      { label: "レート制限", url: "https://ai.google.dev/gemini-api/docs/rate-limits" },
      { label: "AI Studio → API キー", url: "https://aistudio.google.com/apikey" },
    ],
  },
  perplexity: {
    key: "perplexity",
    label: "Perplexity",
    envVars: ["PERPLEXITY_API_KEY"],
    description: "LLMO モニタリングで Perplexity を対象にする",
    pricing: "従量制（プリペイド）。既定モデル sonar（`PERPLEXITY_MODEL` で変更）は 100 万トークンあたり入力 $1 / 出力 $1 に加えて、1 リクエストごとの検索料金（取り込む Web の量で $5〜12 / 1,000 リクエスト）",
    limits: "利用階層（Tier）ごとに 1 分あたりのリクエスト数の上限。超えると 429",
    usage: "LLMO の Perplexity 列 = 1 質問 1 回",
    links: [
      { label: "料金", url: "https://docs.perplexity.ai/getting-started/pricing" },
      { label: "利用階層と上限", url: "https://docs.perplexity.ai/guides/usage-tiers" },
      { label: "API 設定", url: "https://www.perplexity.ai/settings/api" },
    ],
  },
  serpapi: {
    key: "serpapi",
    label: "SerpApi（Google 検索結果）",
    envVars: ["SERPAPI_KEY"],
    description: "順位計測・AI Overviews の引用チェック・ページ診断の上位 10 件取得・AIO 頻出トピック・精密診断の検索順位と site: 件数",
    pricing: "月額プラン。無料 = 月 100 回（プラン改定で 250 回の表記もある）。Starter $25 = 1,000 回、Developer $75 = 5,000 回、Production $150 = 15,000 回",
    limits: "月の検索回数 = プランの上限で、使い切ると検索がエラーになる（順位・site: 件数が「取得できず」になる。他の機能は動く）。同時実行数もプランごと。残り回数はダッシュボードで見る",
    usage: "精密診断 1 回 = 最大 7 検索（対策キーワード 5 + site: + ブランド名）。順位計測 = キーワード数 × 実行回数。ページ診断・AIO 頻出トピック 1 回 = 1 検索",
    links: [
      { label: "料金", url: "https://serpapi.com/pricing" },
      { label: "ダッシュボード（残り回数）", url: "https://serpapi.com/dashboard" },
      { label: "API キー", url: "https://serpapi.com/manage-api-key" },
    ],
  },
  pagespeed: {
    key: "pagespeed",
    label: "PageSpeed Insights",
    envVars: ["PAGESPEED_API_KEY"],
    description: "表示速度・Core Web Vitals の取得（未設定でも低頻度なら動作）。同じキーで CrUX（実ユーザーの速度）も取る",
    pricing: "無料（Google Cloud のキーがあれば請求は発生しない）",
    limits: "キーあり = 1 日 25,000 回・100 秒あたり 400 回（Google Cloud の割り当て画面で確認。買い足しは不可）。キー無し = もっと厳しく、匿名利用者と共有。CrUX（Chrome UX Report API）は別の割り当てで 1 日の上限あり",
    usage: "精密診断 1 回 = PageSpeed 6 回（トップ + 主要 5 ページ、モバイル）+ CrUX 8 回（URL 6 + Origin + 推移）。ページ最適化レポート 1 回 = 1 回",
    links: [
      { label: "PageSpeed Insights API（公式）", url: "https://developers.google.com/speed/docs/insights/v5/get-started" },
      { label: "割り当て（Google Cloud）", url: "https://console.cloud.google.com/apis/api/pagespeedonline.googleapis.com/quotas" },
      { label: "CrUX API の割り当て", url: "https://console.cloud.google.com/apis/api/chromeuxreport.googleapis.com/quotas" },
      { label: "認証情報（API キー）", url: "https://console.cloud.google.com/apis/credentials" },
    ],
  },
  ahrefs: {
    key: "ahrefs",
    label: "Ahrefs（Domain Rating）",
    envVars: ["AHREFS_API_KEY"],
    description: "ドメインパワーの DR（0〜100）。無料のドメインパワー測定サイトと同じ数値。無料の公開エンドポイントなので API ユニットは消費しない（表示に「Domain Rating by Ahrefs」の帰属表示が要る）",
    pricing: "無料（`domain-rating-free` は API ユニットを消費しない。無料アカウントのキーで動き、有料プランは不要）",
    limits: "Ahrefs API 全体の既定で 1 分 60 回。超えると 429（そのドメインは「未取得」で報告書を続け、次の分析で取り直す）。日次・月次の上限は公式で明記なし。DR の表示には「Domain Rating by Ahrefs」のリンクが必須",
    usage: "精密診断 1 回 = 自社 + 競合 2 件で最大 3 回。同じドメインは 24 時間キャッシュ",
    links: [
      { label: "公式ドキュメント（無料 DR）", url: "https://docs.ahrefs.com/en/api/reference/public/get-domain-rating-free" },
      { label: "レート制限", url: "https://docs.ahrefs.com/en/api/docs/limits-consumption" },
      { label: "API キー", url: "https://app.ahrefs.com/account/api/keys" },
      { label: "DR の利用条件", url: "https://ahrefs.com/legal/domain-rating-license" },
    ],
  },
  openpagerank: {
    key: "openpagerank",
    label: "Open PageRank（ドメインの外部リンク評価）",
    envVars: ["OPENPAGERANK_API_KEY"],
    description: "精密診断のドメインパワー。外部からの被リンクを見た 0〜10 の評価（無料。Ahrefs の DR が取れていればそちらを優先し、無ければこれで採点）",
    pricing: "無料",
    limits: "1 日 1,000 リクエスト、1 リクエストに 100 ドメインまで（無料枠）。超えると 429",
    usage: "精密診断 1 回 = 1 リクエスト（自社 + 競合をまとめて）。24 時間キャッシュ",
    links: [
      { label: "公式サイト", url: "https://www.domcop.com/openpagerank/" },
      { label: "API ドキュメント", url: "https://www.domcop.com/openpagerank/documentation" },
      { label: "ログイン（API キー）", url: "https://www.domcop.com/openpagerank/auth/signin" },
    ],
  },
  ga4: {
    key: "ga4",
    label: "Google Analytics 4",
    envVars: ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"],
    description: "生成 AI 流入分析・サイトレポート（GA4 Data API）",
    pricing: "無料（GA4 Data API。GA 360 の契約は不要）",
    limits: "プロパティごとの「コアトークン」で数える。標準プロパティは 1 日 200,000・1 時間 40,000・同時 10 リクエスト。超えると 429（翌日・翌時間に戻る）",
    usage: "生成 AI 流入分析・サイトレポートを 1 回開く = 数リクエスト。精密診断（連携済みなら）= 2〜3 リクエスト",
    links: [
      { label: "割り当て（公式）", url: "https://developers.google.com/analytics/devguides/reporting/data/v1/quotas" },
      { label: "割り当て（Google Cloud）", url: "https://console.cloud.google.com/apis/api/analyticsdata.googleapis.com/quotas" },
      { label: "Google アナリティクス", url: "https://analytics.google.com/" },
    ],
  },
  places: {
    key: "places",
    label: "Google マップ（Places API）",
    envVars: ["GOOGLE_PLACES_API_KEY"],
    description: "Google マップ・店舗情報（MEO）。自社と競合のビジネス プロフィールの比較と充実度の採点、クイック診断（店舗）",
    pricing: "SKU（機能区分）ごとの無料枠（2025-03 から）: Essentials 10,000 回 / 月、Pro 5,000 回 / 月、Enterprise 1,000 回 / 月。超過分は SKU ごとの従量課金（料金表で確認）。請求先アカウントが必要",
    limits: "無料枠は SKU ごとに独立して数え、月初にリセット（繰り越し無し）。使い切ると自動で課金に移るので、Google Cloud の予算アラート（月 1,000 円目安）を必ず設定。クイック診断（店舗）は `FREE_MEO_DAILY_LIMIT` で日次の上限あり",
    usage: "週次の一斉更新 = 自社店舗ごとに Place Details（Enterprise）1 回 + Nearby Search（Enterprise）1 回 + Text Search（Pro）× 対策キーワード数、競合も Details。クイック診断（店舗）1 回 = 検索 1 + 詳細 1",
    links: [
      { label: "料金", url: "https://mapsplatform.google.com/pricing/" },
      { label: "使用量と請求（公式）", url: "https://developers.google.com/maps/documentation/places/web-service/usage-and-billing" },
      { label: "予算とアラート（Google Cloud）", url: "https://console.cloud.google.com/billing/budgets" },
      { label: "Maps Platform のキー", url: "https://console.cloud.google.com/google/maps-apis/credentials" },
    ],
  },
  supabase: {
    key: "supabase",
    label: "Supabase（データベース）",
    envVars: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    description: "Google マップ・店舗情報（MEO）の登録店舗と診断報告書の履歴、口コミ支援、基本情報掲載、精密診断の実行記録（`analysis_runs`）",
    pricing: "Free プラン = $0（DB 500 MB、ファイル 1 GB、API リクエスト無制限、プロジェクト 2 つまで）。Pro = $25 / 月 / プロジェクト（DB 8 GB など。超過は従量）",
    limits: "無料プロジェクトは 1 週間アクセスが無いと一時停止（ダッシュボードで再開。週次 Cron が動いていれば止まらない）。DB 500 MB を超えると書き込みが止まる。精密診断の `audit` 列は 1 行で 1 MB 近くなるので、履歴が数百件になったら Pro か古い行の削除を検討",
    usage: "分析・診断 1 回 = 数行の書き込み。読み取りは画面表示のたび。容量はダッシュボードの Usage で見る",
    links: [
      { label: "料金", url: "https://supabase.com/pricing" },
      { label: "ダッシュボード（Usage）", url: "https://supabase.com/dashboard" },
      { label: "無料プロジェクトの一時停止について", url: "https://supabase.com/docs/guides/platform/upgrading" },
    ],
  },
};

/** 連携ごとの設定有無。GET /api/integrations のレスポンス */
export type IntegrationStatus = Record<IntegrationKey, boolean>;

export function integrationMeta(key: IntegrationKey): IntegrationMeta {
  return INTEGRATIONS[key];
}
