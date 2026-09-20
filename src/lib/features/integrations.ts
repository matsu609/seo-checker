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
  "crux",
  "ahrefs",
  "places",
  "google-business",
  "houjin",
  "stripe",
  "supabase",
  "resend",
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
  /**
   * 鍵ではなく OAuth（Clerk の Google 連携）で動く連携。設定の有無は環境変数では分からないので、
   * /api/integrations がログイン中の運用者自身の Google 接続の状態を返す
   */
  auth?: "oauth";
  /** 状態の横に出す補足（OAuth の連携で「誰の接続か」を示す） */
  statusNote?: string;
}

/** 料金・上限を確認した日（マスター画面に出す。単価は変わるので、古くなったら見直す） */
export const PRICING_CHECKED_AT = "2026-09-16";

export const INTEGRATIONS: Record<IntegrationKey, IntegrationMeta> = {
  anthropic: {
    key: "anthropic",
    label: "Anthropic（Claude）",
    envVars: ["ANTHROPIC_API_KEY"],
    description: "FAQ 生成・LLM サマリー・LLMO（Claude）・プロンプト拡張・AI ライティング・精密診断の専門家アドバイス",
    pricing: "従量制（Console で前払いクレジットを買う。Claude Pro / Max の定額プランでは使えない）。100 万トークンあたり Claude Opus 5 = 入力 $5 / 出力 $25、Claude Haiku 4.5 = 入力 $1 / 出力 $5。プロンプトキャッシュの読み取りは入力の約 1/10",
    limits: "組織の利用階層（Tier）ごとに 1 分あたりのリクエスト数・トークン数の上限があり、超えると 429。クレジット残高が 0 になると全機能の AI が止まる（Console の Billing で自動チャージを設定できる）",
    usage: "精密診断の専門家アドバイス 1 回 = Opus 5 で数万トークン（事実シートの量で変わる。数十〜数百円）。MEO の AI 総評 1 回 ≈ 5 円。FAQ 生成・判定・分類は Haiku 4.5（`LLM_FAST_MODEL`）",
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
  crux: {
    key: "crux",
    label: "CrUX（Chrome UX Report。実ユーザーの表示速度）",
    envVars: ["CRUX_API_KEY"],
    description: "精密診断の「実ユーザーの速度」（Origin と主要 URL の Core Web Vitals の実測値と 25 週の推移）。PAGESPEED_API_KEY があればそれを使うので、この変数は省略できる（Google Cloud で Chrome UX Report API を有効にしておくこと）",
    pricing: "無料（Google Cloud のキーがあれば請求は発生しない）",
    limits: "1 日の割り当てあり（Google Cloud の割り当て画面で確認）。超えると「取得できず」になり報告書は続く。トラフィックの少ないサイトはデータが無い（CrUX 側の仕様）",
    usage: "精密診断 1 回 = 8 回（URL 6 + Origin + 推移）",
    links: [
      { label: "CrUX API（公式）", url: "https://developer.chrome.com/docs/crux/api" },
      { label: "割り当て（Google Cloud）", url: "https://console.cloud.google.com/apis/api/chromeuxreport.googleapis.com/quotas" },
      { label: "API を有効にする", url: "https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com" },
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
  "google-business": {
    key: "google-business",
    label: "Google ビジネス プロフィール（OAuth。口コミ返信・Google での見られ方）",
    envVars: [],
    auth: "oauth",
    statusNote: "ログイン中のあなたの Google アカウントの接続状態です（お客様ごとに別。設定画面の「Google 連携」で接続し、business.manage の権限を許可すると接続済みになります）",
    description: "お客様の Google アカウント（オーナー権限）で動く 4 つの API: ① My Business Account Management API v1（アカウント・店舗の一覧）② My Business Business Information API v1（店舗情報）③ Business Profile Performance API v1（Google での見られ方: 検索・マップの表示回数、電話・経路・サイトのクリック、検索語）④ Google My Business API v4（口コミの取得と返信。Google の承認が要る。2026-09-11 に申請）。鍵は無く、Clerk の Google SSO（独自のクレデンシャル + スコープ business.manage）で許可を受ける",
    pricing: "無料（Google Cloud の請求は発生しない。Places API とは別）",
    limits: "① ② ③ は Google Cloud で有効化済み（2026-09-18）。④ は Business Profile API の利用申請が承認されるまで API ライブラリに出ず、口コミの取得・返信が動かない（口コミの「返す」タブが「承認待ち」の案内を出す）。承認後に API を有効化する。割り当ては 1 分あたりの回数で、通常の利用では当たらない",
    usage: "MEO の「Google での見られ方」1 回 = Performance API 2 回（日次指標 + 検索語。6 時間キャッシュ）。口コミ返信 = 口コミ一覧 1 回 + 返信 1 回",
    links: [
      { label: "OAuth（Google Auth Platform）", url: "https://console.cloud.google.com/auth/overview?project=seo-checker-508104" },
      { label: "Account Management API", url: "https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=seo-checker-508104" },
      { label: "Business Information API", url: "https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com?project=seo-checker-508104" },
      { label: "Performance API", url: "https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com?project=seo-checker-508104" },
      { label: "My Business API v4（承認後）", url: "https://console.cloud.google.com/apis/library/mybusiness.googleapis.com?project=seo-checker-508104" },
      { label: "Business Profile API の利用申請", url: "https://developers.google.com/my-business/content/prereqs" },
      { label: "Clerk → SSO Connections → Google", url: "https://dashboard.clerk.com/" },
    ],
  },
  houjin: {
    key: "houjin",
    label: "法人番号システム Web-API（国税庁）",
    envVars: ["HOUJIN_BANGOU_APP_ID"],
    description:
      "掲載の基本情報（NAP）を**登記上の商号・本店所在地**と突き合わせます。国の一次情報なので、表記ゆれを推測でなく登記で確定できます。法人番号が分かると、構造化データの sameAs に法人番号公表サイトと gBizINFO の URL が入ります。**法人だけ**（個人事業主には法人番号がありません）",
    pricing: "無料。利用届出でアプリケーション ID が発行されます（申請方法と発行までの日数は公式サイトで確認してください）",
    limits: "1 日あたりの呼び出し回数に上限があります（公式の仕様書で確認）。当サービス側では結果を 24 時間キャッシュし、同じ会社名を何度も引かないようにしています",
    usage: "掲載タブの「会社名で法人番号を探す」1 回 = 1 回。保存済みの法人番号を使うときは呼びません",
    links: [
      { label: "法人番号システム Web-API（利用届出・仕様書）", url: "https://www.houjin-bangou.nta.go.jp/webapi/" },
      { label: "法人番号公表サイト", url: "https://www.houjin-bangou.nta.go.jp/" },
      { label: "gBizINFO", url: "https://info.gbiz.go.jp/" },
    ],
  },
  stripe: {
    key: "stripe",
    label: "Stripe（決済）",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_PRICE_STANDARD", "STRIPE_PRICE_LIGHT", "STRIPE_WEBHOOK_SECRET"],
    description: "料金プランの申し込み（Checkout）、お支払い方法の変更・請求書・解約（カスタマーポータル）、契約状態の反映（Webhook → Clerk）。割引はマスター画面・管理アカウント画面で顧客ごとに設定（クーポンは自動作成）。鍵が sk_test_ なら料金画面に「テストモード」と出る",
    pricing: "決済手数料のみ（国内カード 3.6%。Stripe の料金表で確認）。月額は無し",
    limits: "本人確認（アカウントの有効化）とセキュリティチェックリストが済んでいないと支払いが止まる（Stripe → 設定 → アカウントのステータス）。Webhook の署名シークレットが本番のものでないと、決済後に「契約中」にならない",
    usage: "申し込み 1 回 = Checkout 1 セッション + Webhook 数件。料金画面の表示は Clerk の値を読むだけで Stripe を呼ばない",
    links: [
      { label: "料金", url: "https://stripe.com/jp/pricing" },
      { label: "ダッシュボード（本番）", url: "https://dashboard.stripe.com/" },
      { label: "Webhook", url: "https://dashboard.stripe.com/workbench/webhooks" },
      { label: "アカウントのステータス", url: "https://dashboard.stripe.com/settings/account" },
      { label: "API キー", url: "https://dashboard.stripe.com/apikeys" },
    ],
  },
  resend: {
    key: "resend",
    label: "Resend（メール送信。月次レポート・変化の知らせ）",
    envVars: ["RESEND_API_KEY", "MAIL_FROM"],
    description: "月次レポートと、順位の急落・サイトの事故・掲載の消失・低評価の回答・投稿の失敗の知らせをメールで送る。未設定でも画面の「お知らせ」には残る",
    pricing: "Free = $0（月 3,000 通・1 日 100 通まで。送信ドメイン 1 つ）。Pro = $20 / 月（月 50,000 通〜）",
    limits: "無料枠を超えると送信が失敗する（画面のお知らせは残る）。MAIL_FROM のドメインは Resend で DNS 認証（SPF / DKIM）が必要。認証していないと送れない",
    usage: "利用者 1 人につき月次レポート 1 通 + 変化の知らせ（週に数通まで）",
    links: [
      { label: "料金", url: "https://resend.com/pricing" },
      { label: "API キー", url: "https://resend.com/api-keys" },
      { label: "送信ドメインの追加（DNS 認証）", url: "https://resend.com/domains" },
      { label: "送信ログ", url: "https://resend.com/emails" },
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
