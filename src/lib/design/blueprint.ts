/**
 * 設計書（マスター画面 /admin/design）の中身。純粋なデータと純関数だけ。
 *
 * 「この SEO Checker を作る上で必要だったサービス・連携したサービスを、どの機能実装に使ったか」を
 * 1 か所で読めるようにする（利用者の指示 2026-09-21）。連携そのものの定義（環境変数・料金・上限）は
 * src/lib/features/integrations.ts、機能ごとの依存は src/lib/features/registry.ts の requires / optional に
 * あるので、ここは**その 2 つをつなぐ説明**（役割・どの機能で使ったか・費用の出方・設定の場所）と、
 * registry に載らない使い方（ログインそのもの・決済・定期処理・ご意見）を持つ。
 *
 * 正本はコード側。この説明と registry の依存がずれたら registry が正しい（テストで全連携に説明があることを固定）。
 */
import { INTEGRATION_KEYS, INTEGRATIONS, type IntegrationKey } from "@/lib/features/integrations";
import { FREE_FEATURE, FREE_MEO_FEATURE, TOOL_FEATURES, type Feature } from "@/lib/features/registry";

/** 費用の出方。fixed = 月額 / variable = 使った分 / fee = 売上に比例 / free = 0 円 */
export type CostKind = "fixed" | "variable" | "fee" | "free";

export const COST_KIND_LABELS: Record<CostKind, string> = {
  fixed: "月額（固定）",
  variable: "使った分（変動）",
  fee: "売上の一定割合",
  free: "無料",
};

export interface ServiceBlueprint {
  key: IntegrationKey;
  /** このサービスの中での役割（1〜2 文） */
  role: string;
  /** どの機能実装に使ったか（registry に載らないものも含めて、画面の言葉で） */
  usedFor: readonly string[];
  /** 費用の出方 */
  costKind: CostKind;
  /** 誰の契約か */
  payer: "運用者" | "お客様" | "無料";
  /** どこで設定するか（画面の名前。URL は integrations.ts の links に） */
  configuredAt: string;
  /** 経緯・注意（任意） */
  note?: string;
}

export const SERVICE_BLUEPRINTS: Record<IntegrationKey, ServiceBlueprint> = {
  github: {
    key: "github",
    role: "ソースコードの保管と履歴。main へのマージがそのまま本番リリース（rNN）。",
    usedFor: ["アプリ本体（Next.js）と紹介サイト（marketing/）のソース", "版の記録（src/lib/release/releases.json の件数 = バージョン）", "Vercel・Cloudflare Workers Builds の接続元"],
    costKind: "free",
    payer: "運用者",
    configuredAt: "GitHub → リポジトリ matsu609/seo-checker",
  },
  vercel: {
    key: "vercel",
    role: "アプリ本体の実行環境。ビルド・配信・環境変数（API キー）・Cron をすべてここで持つ。",
    usedFor: ["app.seo-checker.tokyo の配信（Production）と PR ごとの Preview", "API キーの保管（Environment Variables）", "定期処理の呼び出し（Cron 2 本）", "「動いているコミット」の表示（VERCEL_GIT_COMMIT_SHA）"],
    costKind: "fixed",
    payer: "運用者",
    configuredAt: "Vercel → プロジェクト seo-checker → Settings",
    note: "いまは Hobby。Hobby は個人・非商用に限られるので、お客様に売る段階で Pro（$20 / 月）に上げる。",
  },
  cloudflare: {
    key: "cloudflare",
    role: "ドメイン seo-checker.tokyo の DNS と、紹介サイト（apex）の配信。",
    usedFor: ["DNS（app. → Vercel、clerk. / accounts. / clkmail. → Clerk。Clerk の 5 件はプロキシを切る）", "紹介サイトの配信（Worker seo-checker-hp。ソースは marketing/）"],
    costKind: "free",
    payer: "運用者",
    configuredAt: "Cloudflare → seo-checker.tokyo → DNS / Workers & Pages",
  },
  onamae: {
    key: "onamae",
    role: "ドメインの登録元。ネームサーバーを Cloudflare に向けている。",
    usedFor: ["seo-checker.tokyo の登録と年 1 回の更新"],
    costKind: "fixed",
    payer: "運用者",
    configuredAt: "お名前.com Navi → ドメイン",
    note: "更新を忘れると、アプリ・ログイン・紹介サイト・確認メールが全部止まる。自動更新と支払い方法の期限を確かめる。",
  },
  clerk: {
    key: "clerk",
    role: "ログインとアカウントの正本。このアプリは自前のユーザー DB を持たず、プラン・役割・契約状態・Google のトークンまで Clerk に預ける。",
    usedFor: [
      "ログイン（メール + パスワード / Google）とアカウント登録の 6 項目（/sign-up）",
      "運用者（ADMIN_EMAILS）・管理アカウント（publicMetadata.role）の判定",
      "プランの判定（Stripe の契約状態 → publicMetadata.plan → DEFAULT_PLAN）と機能の個別開放・割引",
      "クイック診断の回数（privateMetadata.freeRuns）",
      "Google OAuth（SSO Connections。ビジネス プロフィールの business.manage スコープ）のトークン保管",
      "代理ログイン（運用者がお客様の画面を見る）",
    ],
    costKind: "fixed",
    payer: "運用者",
    configuredAt: "Clerk ダッシュボード → Production インスタンス",
    note: "Production と Development はユーザーも設定も別。本番は clerk.seo-checker.tokyo（pk_live_ / sk_live_）。",
  },
  stripe: {
    key: "stripe",
    role: "決済。申し込み（Checkout）・支払い方法の変更と解約（ポータル）・契約状態の反映（Webhook → Clerk）。",
    usedFor: ["料金プランの申し込み（/plans → Checkout。ライト 38,000 円 / スタンダード 50,000 円）", "カスタマーポータル（請求書・カード変更・解約）", "Webhook で契約状態を Clerk の publicMetadata.stripe に書く", "割引（クーポンを自動作成。マスター画面・顧客管理で顧客ごとに設定）"],
    costKind: "fee",
    payer: "運用者",
    configuredAt: "Stripe ダッシュボード → 商品・価格 / Webhook / API キー",
    note: "Clerk Billing はドルのみのため使わない（Stripe 直結）。プレミアム（伴走）は画面から買えず、受注時に支払いリンクで契約を立てる。",
  },
  supabase: {
    key: "supabase",
    role: "サーバー側に残す必要があるデータの保存先（PostgreSQL）。お客様の設定はブラウザの localStorage、アカウントは Clerk なので、ここには**時系列と共有が要るもの**だけ。",
    usedFor: [
      "MEO: 登録店舗・診断報告書の履歴・オーナー入力（meo_stores / meo_reports / meo_owner_inputs）",
      "口コミ支援: アンケート・QR・回答（review_forms / review_channels / review_responses）",
      "基本情報掲載の正本（listing_profiles）",
      "精密診断の実行記録（analysis_runs。月の回数もこの行数）",
      "AI 検索モニタリングの計測結果とクレジット",
      "定期処理の記録・順位の履歴・お知らせ・サイト監視・投稿・月次レポート（cron_runs / rank_snapshots / notifications / site_monitor_snapshots / gbp_posts / monthly_reports）",
      "ご意見・不具合の報告（feedback）",
    ],
    costKind: "fixed",
    payer: "運用者",
    configuredAt: "Supabase → プロジェクト → SQL Editor（テーブル）/ Project Settings → API Keys",
    note: "無料プロジェクトは 1 週間アクセスが無いと一時停止する（週次 Cron が動いていれば止まらない）。",
  },
  anthropic: {
    key: "anthropic",
    role: "文章を書く・判定する AI はすべて Claude。他社の LLM（OpenAI / Gemini / Perplexity）は 2026-09-17 に廃止し、Claude に一本化。",
    usedFor: [
      "クイック診断の FAQ 生成（Haiku）",
      "精密診断の「専門家のアドバイス」（Opus。事実シートだけを根拠に書く）",
      "ページ改善（before → after）・FAQ 提案・口コミの返信案・投稿の下書き",
      "MEO の総評（無ければルール生成）、キーワードの意図分類、プロンプト拡張",
      "AI 検索モニタリングの言及抽出",
    ],
    costKind: "variable",
    payer: "運用者",
    configuredAt: "Claude Console → API キー / Billing（前払いクレジット）",
    note: "モデルは環境変数で差し替え（LLM_MODEL / LLM_FAST_MODEL / FAQ_MODEL など）。",
  },
  serpapi: {
    key: "serpapi",
    role: "Google 検索結果の取得（実測の順位）。",
    usedFor: ["順位計測（手動と毎週火曜の自動）と AI Overviews の引用チェック", "精密診断の検索順位・site: 件数・ブランド検索", "ページ診断の上位 10 件（無ければ Claude の Web 検索で推定）"],
    costKind: "fixed",
    payer: "運用者",
    configuredAt: "SerpApi → ダッシュボード / API キー",
    note: "月額プラン制なので、店舗数に応じて段階的に上がる（月額費用の試算を参照）。",
  },
  dataforseo: {
    key: "dataforseo",
    role: "Google 連携なしで「検索の状況」を出すための土台と、AI 検索（ChatGPT / Gemini / Claude / Perplexity / AI Overviews / AI モード）の計測。",
    usedFor: ["検索パフォーマンス（推定）（Labs ranked_keywords。Search Console の代替）", "AI 検索モニタリング（毎日の定期計測・業界の地図）", "サイテーション・NAP チェックの掲載ページ発見（Google 検索 2〜3 回）"],
    costKind: "variable",
    payer: "運用者",
    configuredAt: "DataForSEO → API ダッシュボード（前払い）",
    note: "GA4 は使わない（利用者の決定 2026-09-17）。Search Console は 2026-09-23 に任意の連携として再開したが、連携していないお客様にはこの推定で数字を出す。",
  },
  pagespeed: {
    key: "pagespeed",
    role: "表示速度・Core Web Vitals（Lighthouse の診断値）。",
    usedFor: ["精密診断の主要 6 ページの速度", "HP 改修提案・ページ最適化レポートの速度の節"],
    costKind: "free",
    payer: "運用者",
    configuredAt: "Google Cloud → 認証情報（API キー）/ PageSpeed Insights API の割り当て",
  },
  crux: {
    key: "crux",
    role: "実ユーザーの表示速度（Chrome UX Report）。所有権が要らないので、お客様の作業なしで実測が出る。",
    usedFor: ["精密診断の「実ユーザーの速度」（Origin と主要 URL、25 週の推移）", "ドメインパワーの「実ユーザーの規模」"],
    costKind: "free",
    payer: "運用者",
    configuredAt: "Google Cloud → Chrome UX Report API を有効化（PAGESPEED_API_KEY で動く）",
  },
  ahrefs: {
    key: "ahrefs",
    role: "ドメインパワーの DR（0〜100）。他社の無料ドメインパワー測定サイトと同じ数値。",
    usedFor: ["精密診断のドメインパワー（外部からのリンクの評価。自社 + 競合 2 件）"],
    costKind: "free",
    payer: "運用者",
    configuredAt: "Ahrefs → アカウント → API keys（無料アカウント可。キーは 1 年で失効）",
    note: "表示に「Domain Rating by Ahrefs」の帰属表示が必須。",
  },
  openpagerank: {
    key: "openpagerank",
    role: "ドメインパワーの代替（Open PageRank 0〜10）。DR が無いときだけ。",
    usedFor: ["精密診断のドメインパワー（Ahrefs の DR が取れないドメイン）"],
    costKind: "free",
    payer: "運用者",
    configuredAt: "Open PageRank → API キー",
    note: "旧 API が 2026-09-30 に終了予定なので、新規の設定は保留（#80）。",
  },
  places: {
    key: "places",
    role: "Google マップの公開情報（Places API (New)）。お客様の Google 権限なしで店舗を診断できるのはこれのおかげ。",
    usedFor: ["クイック診断（店舗）", "Google マップ・店舗情報（MEO）: 自社と競合 5 店舗の比較・充実度の採点・毎週月曜の一斉更新", "NAP チェックの Google マップの値、口コミ返信の公開口コミ（最新 5 件）"],
    costKind: "variable",
    payer: "運用者",
    configuredAt: "Google Cloud → Maps Platform → 認証情報（Places API (New) 制限つきキー）/ 予算アラート",
    note: "SKU ごとの月間無料枠を使い切ると自動で課金に移るので、予算アラートを必ず設定。",
  },
  "google-business": {
    key: "google-business",
    role: "お客様自身の Google ビジネス プロフィール（オーナー権限が要るデータ）。鍵は無く、Clerk の Google SSO で business.manage の許可を受ける。",
    usedFor: ["口コミへの返信（口コミの取得・返信の投稿。Google My Business API v4。承認待ち）", "Google での見られ方（Business Profile Performance API。表示回数・電話・経路・検索語）", "投稿の予約送信（gbp_posts）"],
    costKind: "free",
    payer: "お客様",
    configuredAt: "Google Cloud → OAuth（Google Auth Platform）/ Clerk → SSO Connections → Google（独自のクレデンシャル）",
    note: "Business Profile API は Google の審査制（2026-09-11 申請。google-oauth-verification.md）。承認の合否は割り当て画面の 0 / 300 で見る。",
  },
  resend: {
    key: "resend",
    role: "メール送信。月次レポートと変化の知らせ。無くても画面の「お知らせ」には残る。",
    usedFor: ["月次レポート（毎月 1 日）", "順位の急落・サイトの事故・掲載の消失・低評価の回答・投稿の失敗の知らせ"],
    costKind: "fixed",
    payer: "運用者",
    configuredAt: "Resend → API キー / 送信ドメイン（SPF / DKIM）",
  },
  cron: {
    key: "cron",
    role: "毎日 5:00 JST に 2 本の API を叩く。重い処理（実費の出るもの）は曜日で分散する。",
    usedFor: ["毎日: 投稿の送信・精密診断の自動再診断・AI 検索モニタリング", "月: マップ診断の一斉更新 / 火: 順位計測 / 水: サイトの事故監視", "毎月 1 日: 月次レポート / 2 日: 掲載の再チェック"],
    costKind: "free",
    payer: "運用者",
    configuredAt: "vercel.json（2 本）と Vercel の環境変数 CRON_SECRET",
  },
};

/** 機能がその連携をどう使うか */
export type DependencyLevel = "required" | "any" | "optional";

export const DEPENDENCY_MARKS: Record<DependencyLevel, { mark: string; label: string }> = {
  required: { mark: "●", label: "無いと動かない" },
  any: { mark: "◍", label: "どれか 1 つあればよい" },
  optional: { mark: "○", label: "あると機能が増える" },
};

/** 設計書に載せる機能（クイック診断 2 本 + サイドバーに出ているツール。引退した hidden は出さない） */
export function blueprintFeatures(): readonly Feature[] {
  return [FREE_FEATURE, FREE_MEO_FEATURE, ...TOOL_FEATURES.filter((f) => !f.hidden)];
}

export function dependencyLevel(feature: Feature, key: IntegrationKey): DependencyLevel | null {
  if (feature.requires.includes(key)) return "required";
  if (feature.requiresAny?.includes(key)) return "any";
  if (feature.optional?.includes(key)) return "optional";
  return null;
}

/** その連携を使う機能（registry の requires / requiresAny / optional から） */
export function featuresUsing(key: IntegrationKey): readonly { feature: Feature; level: DependencyLevel }[] {
  return blueprintFeatures()
    .map((feature) => ({ feature, level: dependencyLevel(feature, key) }))
    .filter((x): x is { feature: Feature; level: DependencyLevel } => x.level !== null);
}

/** 機能 × 連携の表の列（どこかの機能が依存している連携だけ。並びは INTEGRATION_KEYS） */
export function matrixColumns(): readonly IntegrationKey[] {
  const feats = blueprintFeatures();
  return INTEGRATION_KEYS.filter((key) => feats.some((f) => dependencyLevel(f, key) !== null));
}

/** 提供をやめたもの（設計の経緯。なぜ無いのかを聞かれたときの答え） */
export interface RetiredItem {
  label: string;
  when: string;
  why: string;
  replacedBy: string;
}

export const RETIRED: readonly RetiredItem[] = [
  { label: "Google アナリティクス（GA4）の連携（Search Console は 2026-09-23 に「Google サーチコンソール連携」として再開）", when: "2026-09-17（r89）", why: "お客様側の作業（所有確認・タグ設置）が要り、ツールで完結しない", replacedBy: "検索パフォーマンス（推定）（DataForSEO）。行動・CV は外部から取れないので出さない" },
  { label: "自前の計測タグ（アクセス解析）", when: "2026-09-17（r90）", why: "お客様のサイトに手を入れる必要があり面倒", replacedBy: "なし（推定へ転送）" },
  { label: "LLMO モニタリング・セカンドオピニオン（OpenAI / Gemini / Perplexity の直接連携）", when: "2026-09-17（r92）", why: "AI 検索モニタリングに一本化。Google の AI 検索には API が無く、各社直結だと計測が揃わない", replacedBy: "AI 検索モニタリング（DataForSEO 経由で 6 モデル）" },
  { label: "Clerk Billing", when: "2026-09-13", why: "ドル建てのみ", replacedBy: "Stripe 直結（Checkout + Webhook → Clerk の publicMetadata）" },
  { label: "ページ最適化レポート・AIO 頻出トピック（サイドバーから外した）", when: "2026-09-17（r94）", why: "精密診断・HP 改修提案・AI 検索モニタリングと役割が重なる", replacedBy: "転送のみ。定義・API・プランのゲートは残す（hidden）" },
];

/** リポジトリの設計資料（GitHub で開く） */
export interface DesignDoc {
  file: string;
  title: string;
  what: string;
}

export const REPO_URL = "https://github.com/matsu609/seo-checker";

export const DESIGN_DOCS: readonly DesignDoc[] = [
  { file: "docs/dev/OPERATIONS.md", title: "運用メモ・引き継ぎ", what: "いまの状態・残タスク・入力待ち・判断の経緯・作業ログ。まずここ" },
  { file: "docs/dev/services.md", title: "外部サービスの構成と役割", what: "GitHub / Vercel / Cloudflare / Clerk / Supabase / Google Cloud の全体像と DNS" },
  { file: "docs/dev/tool-map.md", title: "ツールと API キーの関係図", what: "どのツールがどのキーでつながり、キーが切れると何が止まるか" },
  { file: "docs/dev/ARCHITECTURE.md", title: "開発ガイド（アーキテクチャと規約）", what: "ルーティング・ディレクトリ・状態の保存・誰が何を見られるか" },
  { file: "docs/dev/scoring-reference.md", title: "数字の出し方", what: "配点・閾値・計算式・してはいけない解釈" },
  { file: "docs/dev/diagnosis-rules-spec.md", title: "自動診断（134 ルール）の仕様", what: "クイック診断・精密診断のルール" },
  { file: "docs/dev/seo-analysis-spec.md", title: "精密診断の仕様", what: "事実シート・AI の分析・数値の照合" },
  { file: "docs/dev/geo-monitoring-spec.md", title: "AI 検索モニタリングの仕様", what: "計測設計・単価・クレジット・統計" },
  { file: "docs/dev/review-support-design.md", title: "口コミ支援の設計", what: "アンケート QR・経路・多言語" },
  { file: "docs/dev/gsc-ga4-substitute-design.md", title: "GSC / GA4 を連携なしで代替する設計", what: "推定の考え方と限界" },
  { file: "docs/dev/google-oauth-verification.md", title: "Google の審査対応", what: "OAuth 本番公開審査・Business Profile API の申請手順" },
  { file: "docs/dev/stripe-checklist-prompt.md", title: "Stripe のセキュリティチェックリスト", what: "回答に使うサービスの実態" },
  { file: "docs/dev/design-spec.md", title: "画面の設計", what: "デザインの決まり" },
  { file: "docs/dev/ui-notes.md", title: "UI のメモ", what: "画面ごとの注意点" },
  { file: "docs/reference/03_feature-catalog.md", title: "機能カタログ", what: "機能 ID（A1〜E8）の一覧" },
];

export function docUrl(doc: DesignDoc): string {
  return `${REPO_URL}/blob/main/${doc.file}`;
}

/** 全体像（services.md と同じ図。等幅で出す） */
export const OVERVIEW_DIAGRAM = `  コードを push ──→ GitHub（matsu609/seo-checker）
                        │ main へマージすると自動デプロイ
                        ↓
                     Vercel（Next.js。環境変数 = API キー、Cron 2 本）
                        │ app.seo-checker.tokyo
                        ↓
   ┌──────────────── ブラウザ（お客様・運用者）────────────────┐
   │ 設定・キーワード・履歴は localStorage（端末の外に出ない）   │
   └──────┬──────────────────────┬──────────────────┬──────────┘
          │ ログイン              │ 診断・計測          │ 申し込み
          ↓                      ↓                    ↓
       Clerk                  外部 API              Stripe
   ユーザー・プラン・役割   Anthropic / SerpApi      Checkout・ポータル
   Google のトークン        DataForSEO / Ahrefs          │ Webhook
          │ OAuth             Google Cloud（Places・      ↓
          ↓                   PageSpeed・CrUX・GBP）   契約状態 → Clerk
   Google ビジネス
   プロフィール（お客様の権限）
                                  ↓ 時系列・共有が要るものだけ
                              Supabase（MEO・口コミ・掲載・診断の記録・計測・お知らせ・ご意見）
                                  ↑ 毎日 5:00 JST
                              Vercel Cron → 定期処理（曜日で分散）→ Resend（メール）

  ドメイン: お名前.com（登録）→ Cloudflare（DNS。apex は紹介サイトの Worker、app. は Vercel、clerk. は Clerk）`;

/** 説明が全連携ぶんあるか（テストと画面の両方で使う） */
export function blueprintKeys(): readonly IntegrationKey[] {
  return INTEGRATION_KEYS.filter((k) => k in SERVICE_BLUEPRINTS && k in INTEGRATIONS);
}
