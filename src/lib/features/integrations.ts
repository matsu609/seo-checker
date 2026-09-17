/**
 * 外部連携の定義（クライアントでも読める。キーの値は一切含まない）。
 * 実際に設定されているかどうかは src/lib/integrations.ts（サーバー）が判定し、
 * GET /api/integrations で boolean だけを返す。
 */
export const INTEGRATION_KEYS = [
  "anthropic",
  "serpapi",
  "dataforseo",
  "pagespeed",
  "ahrefs",
  "openpagerank",
  "places",
  "supabase",
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

import type { KeyLifetime } from "./key-expiry";

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
  /** キーに寿命がある連携だけ。マスター画面に残り日数を出す */
  keyLifetime?: KeyLifetime;
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
  dataforseo: {
    key: "dataforseo",
    label: "DataForSEO（検索パフォーマンス（推定）・AI 検索モニタリング・サイテーション）",
    envVars: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
    description: "Google の通常検索（SEO）の推定: ドメインが順位を持っているキーワード・順位・月間検索数を取り、表示回数とクリック数を推定する（検索パフォーマンス（推定））。AI 検索モニタリング（ChatGPT / Gemini / AI Overviews の定期計測）と、サイテーション（店名・電話・住所での Google 検索）も同じ鍵で動く",
    pricing: "従量（前払い）。検索順位 $0.002 / KW、AI Overviews $0.0026 / KW、LLM 計測は標準キュー $0.0012 / 回・Live $0.004 / 回。単価は GEO_PRICE_* で上書きでき、為替は GEO_USD_JPY（既定 160 円）",
    limits: "残高が尽きると計測が止まる（DataForSEO のダッシュボードで残高を見る）。このツール側でも 1 アカウント月 2,000 クレジットのソフトキャップがあり、上限に達してもオンデマンド実行だけを止めて定期実行は続ける",
    usage: "標準構成 1 アカウント月あたり: 順位 800 + AIO 200 + LLM 1,500 回 ≒ $3.9（約 ¥630）。同じキーワード・プロンプトは 24 時間、全アカウントで結果を使い回すので、顧客が増えるほど 1 社あたりは下がる。サイテーション 1 回 = 検索 3 回（$0.006 前後。同じ入力は 24 時間キャッシュ）",
    links: [
      { label: "料金", url: "https://dataforseo.com/pricing" },
      { label: "ダッシュボード（残高）", url: "https://app.dataforseo.com/api-dashboard" },
      { label: "API ドキュメント", url: "https://docs.dataforseo.com/v3/" },
      { label: "AI Optimization API", url: "https://docs.dataforseo.com/v3/ai_optimization/overview/" },
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
    limits: "Ahrefs API 全体の既定で 1 分 60 回。超えると 429（そのドメインは「未取得」で報告書を続け、次の分析で取り直す）。日次・月次の上限は公式で明記なし。API キーの有効期限は 1 年で、切れると DR が「未取得」になるので作り直す。DR の表示には「Domain Rating by Ahrefs」のリンクが必須（隠す・消すのは規約違反）",
    usage: "精密診断 1 回 = 自社 + 競合 2 件で最大 3 回。同じドメインは 24 時間キャッシュ",
    links: [
      { label: "無料アカウント登録", url: "https://ahrefs.com/signup?plan=awt" },
      { label: "API キー", url: "https://app.ahrefs.com/account/api-keys" },
      { label: "公式ドキュメント（無料 DR）", url: "https://docs.ahrefs.com/en/api/reference/public/get-domain-rating-free" },
      { label: "レート制限", url: "https://docs.ahrefs.com/en/api/docs/limits-consumption" },
      { label: "DR の利用条件", url: "https://ahrefs.com/legal/domain-rating-license" },
    ],
    keyLifetime: {
      days: 365,
      issuedAtEnv: "AHREFS_API_KEY_ISSUED_AT",
      note: "Ahrefs の APIv3 キーは作成から 1 年で失効します。作り直しは無料（同じ画面で新しいキーを作って差し替えるだけ）。キーを作った日を AHREFS_API_KEY_ISSUED_AT に YYYY-MM-DD で入れると、ここに残り日数が出ます。",
    },
  },
  openpagerank: {
    key: "openpagerank",
    label: "Open PageRank（ドメインの外部リンク評価）",
    envVars: ["OPENPAGERANK_API_KEY"],
    description: "精密診断のドメインパワー。外部からの被リンクを見た 0〜10 の評価（無料。Ahrefs の DR が取れていればそちらを優先し、無ければこれで採点）。旧 API が 2026-09-30 に終了するため、いまは新規に設定しないこと",
    pricing: "無料。2026-09-30 に旧 API が終了し、Keywords Everywhere の新 API（無料枠 月 30,000 ドメイン）に移行する。このツールはまだ旧 API を呼んでいるので、使うなら先に移行の実装が要る（#86）",
    limits: "旧 API: 1 日 1,000 リクエスト、1 リクエストに 100 ドメインまで。2026-09-30 で停止。新 API は基盤（openpagerank.keywordseverywhere.com）も認証（Bearer）も変わる",
    usage: "精密診断 1 回 = 1 リクエスト（自社 + 競合をまとめて）。24 時間キャッシュ",
    links: [
      { label: "公式サイト", url: "https://www.domcop.com/openpagerank/" },
      { label: "API ドキュメント", url: "https://www.domcop.com/openpagerank/documentation" },
      { label: "ログイン（旧・API キー）", url: "https://www.domcop.com/openpagerank/auth/login" },
      { label: "移行のお知らせ（2026-09-30 終了）", url: "https://www.domcop.com/openpagerank/keywords-everywhere-acquisition" },
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
