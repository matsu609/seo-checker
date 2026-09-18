# 開発ガイド（アーキテクチャと規約）

関連: 数字の出し方（配点・閾値・計算式）は [scoring-reference.md](./scoring-reference.md)、ツールと API キーの関係は [tool-map.md](./tool-map.md)、運用状態は [OPERATIONS.md](./OPERATIONS.md)。

このリポジトリは 2 つの顔を持つ。

1. **クイック診断**（`/`）: 元々の SEO Checker。URL を入れると AIO（AI 検索最適化）の状況をルールベースで採点し、FAQ を生成する。**見込み顧客向けのリード獲得ツール**なので、レポートとしての見栄えと信頼感を最優先する。
2. **追加機能**（`/tools/*`）: [docs/reference/03_feature-catalog.md](../reference/03_feature-catalog.md) の機能 ID（A1〜E8）を実装したもの。左サイドバーのタブで切り替える。クイック診断とは明確に別機能として扱う。

## ルーティングとサイドバー

サイドバーの定義は `src/lib/features/registry.ts` に一元化する（ラベル・パス・アイコン・グループ・機能 ID・状態）。ページ側はこの定義を参照して見出しを出す。サイドバーは **「AIO 対策」を親のくくりにし、その中に SEO / MEO / サイテーションの 3 本の柱**（`category`。`sidebarTree()`）を開閉式で並べる（利用者の指示 2026-09-17「AI の中に SEO・MEO・サイテーションがあると分かる構成に」。r95）。AI 検索モニタリング（`category: "aio"`）は柱ではなく親の直下、設定・料金は `category` を持たず常に出る。開いている柱は 1 本で、**押した柱を最優先**し（画面の分類が常に勝って切り替わらない不具合を r94 で修正）、別の画面へ移動したらその画面の柱、柱に属さない画面では最後に押した柱（localStorage `sidebarTab`）。位置づけ: このサービスは **AIO 対策の可視化ツール**（AIO 対策 = SEO + MEO + NAP 登録・サイテーションの総称）で、SEO に少し力を入れている。SEO = お客様のホームページの最適化、MEO = Google マップ・口コミ、サイテーション = 基礎情報の掲載（掲載チェック・基本情報掲載・llms.txt）。サイドバーから外した機能は `hidden: true`（ページは転送、定義とプランのゲートは残す）。

| グループ | パス | ラベル | 機能 ID | 外部依存 |
|---|---|---|---|---|
| クイック診断 | `/` | クイック診断（サイト・SEO / AIO。無料。**アカウント登録のあと、メールアドレスごとに 2 回まで**（2026-09-18。入口は `src/lib/free/gate.ts`、回数は `src/lib/free/quota.ts`）。サイト全体は代表 10 ページ） | （元ツール） | なし（FAQ 生成のみ Anthropic） |
| クイック診断 | `/meo` | クイック診断（店舗・MEO。店舗 1 件、登録が要る（サイトと合計 2 回）、回数制限つき） | — | Places API (New) |
| 診断 | `/tools/seo-analysis` | 精密診断（事実シート + AI の現状分析と改善案。ドメインパワーを含む） | — | Supabase + Anthropic（PSI / SerpApi / OpenAI / CrUX / Ahrefs DR / Open PageRank は任意） |
| 診断 | `/tools/site-audit` | （精密診断に統合。転送のみ。`hidden: true`） | A1 | — |
| 診断 | `/tools/page-report` | （サイドバーから外した 2026-09-17。HP 改修提案へ転送のみ。`hidden: true`。API と `src/lib/page-report/` は HP 改修提案・PSI・llms.txt が使う） | A2, A3 | — |
| 診断 | `/tools/page-diagnosis` | ページ診断（キーワード × ページ） | A4 | SERP or Anthropic web 検索 |
| 診断 | `/tools/aio-topics` | （サイドバーから外した 2026-09-17。AI 検索モニタリングへ転送のみ。`hidden: true`。API は残る） | A5 | — |
| 計測 | `/tools/rank` | 順位計測・AI Overviews 引用 | B1, B2, B3 | SERP |
| 計測 | `/tools/geo` | AI 検索モニタリング（引用・参照の定点観測） | — | DataForSEO + Supabase（Anthropic は任意） |
| 計測 | `/tools/llmo` | （提供終了 2026-09-17。AI 検索モニタリングへ転送のみ。API は 410） | B4, B8 | — |
| 計測 | `/tools/prompt-expansion` | プロンプト拡張（サイドバーには出さない `hidden: true`。AI 検索モニタリングの設定画面からリンクで開く） | B7 | Anthropic |
| 計測 | `/tools/search-estimate` | 検索パフォーマンス（推定。Search Console の連携なしで数字を出す） | — | DataForSEO |
| 計測 | `/tools/analytics` | （取り下げ 2026-09-17。自前の計測タグはお客様側の作業が要るので提供しない。推定へ転送のみ。API と `/t.js` は 410） | — | — |
| 計測 | `/tools/search-performance` | （提供終了 2026-09-17。検索パフォーマンス（推定）へ転送のみ。API は 410） | — | — |
| 計測 | `/tools/ai-traffic` | （提供終了 2026-09-17。アクセス解析へ転送のみ。API は 410） | B6 | — |
| 計測 | `/tools/site-report` | （提供終了 2026-09-17。アクセス解析へ転送のみ。API は 410） | E8 | — |
| 計測 | `/tools/maps` | Google マップ・店舗情報（MEO）。「Google での見られ方」カード（表示回数・電話・ルート・流入キーワード）は Business Profile Performance API（オーナー権限、`business.manage`）で、接続した店舗だけ | — | Places API (New)。インサイトは Google 連携（任意） |
| 計測 | `/tools/reviews` | 口コミ支援（アンケート QR） | — | Supabase（AI 下書きは Anthropic 任意） |
| 生成 | `/tools/replies` | 口コミへの返信（AI 返信案） | — | Google 連携（Business Profile API、`business.manage`）。返信案は Anthropic 任意 |
| 調査 | `/tools/keywords` | キーワード調査 | C1 | なし（意図分類は Anthropic 任意） |
| 生成 | `/tools/writing` | AI ライティング・エディター | D1, D2, D3, D4 | Anthropic |
| 基礎対策 | `/tools/citations` | サイテーション（店名・電話・住所で Google を検索し、ウェブ上の掲載・言及と NAP の食い違いを一覧に。サイテーションの柱） | — | DataForSEO |
| 基礎対策 | `/tools/listings` | 基本情報掲載（NAP 一括登録。サイテーションの柱） | — | Supabase（`listing_profiles`）。説明文は Anthropic 任意 |
| 基礎対策 | `/tools/llms-txt` | llms.txt 生成（サイテーションの柱） | D6 | なし |
| 設定 | `/settings` | **ホームページ（自社サイト）の URL**・競合・データの書き出し / 読み込み（Google 連携のカードは 2026-09-17 に廃止。API キーの設定状況は `/admin`） | E1, E2 | なし |
| 運用 | `/admin` | マスター画面（全登録者の契約状況・機能の個別開放・代理店の追加と担当の割り当て）。`ADMIN_EMAILS` の人だけ。ほかは 404 | — | Clerk |
| 運用 | `/agency` | 代理店画面（担当として割り当てられた登録者だけを表示のみ）。`publicMetadata.role = "agency"` の人だけ。ほかは 404 | — | Clerk |
| 共通 | `/legal/tokushoho` | 特定商取引法に基づく表記（ログイン不要） | — | なし |
| 共通 | `/sign-up` | アカウント登録（自前の 6 項目フォーム + Clerk の `useSignUp`。追加項目は `unsafeMetadata.lead`）。`/sign-up/profile` は登録情報の補完（Google でログインした人向け。`/api/account/lead`） | — | Clerk |
| 共通 | `/start` | ログイン直後の振り分け（代理店は `/agency`、未契約は `/plans`、契約済みはツールへ。画面は出さない） | — | なし |

- **PDF に出す折りたたみには `print:block` を使わない。** PDF は `@media print` ではなく DOM の複製（`.pdf-capture`）を画像化して作るので、Tailwind の `print:` 系は PDF にまったく効かない。画面で開かずに PDF を作ると中身が丸ごと抜ける。折りたたみは `hidden print-expand`、画面専用の操作は `no-print` を使う（`globals.css` に定義。`src/app/__tests__/pdf-capture-css.test.ts` で固定）。
- 外部依存が未設定のときは、ページ内で `SetupNotice`（何を `.env.local` に設定すればよいか）を表示し、設定済みの部分だけ動かす。**ダミーデータで動いているように見せない。**
- クイック診断（`/` と `/meo`）は本サービスから切り離した集客の入口。専用の公開シェル（`FreeShell`: ロゴ・申し込み・規約だけ）で出し、有料ツールのサイドバーは見せない。結果の下に `UpgradeCta`（無料の限界 → 精密診断で分かること → `/sign-up`）を必ず置く。管理画面のサイドバーでは最下部に「お客様に渡すクイック診断」として置き、見込み客に渡す公開リンクという位置づけにする（利用者の決定 2026-09-13）。`robots.ts` / `sitemap.ts` もクイック診断と規約類だけを開ける。

## ディレクトリ

```
src/
  app/
    layout.tsx                # AppShell（サイドバー + ヘッダー）を全ページに適用
    page.tsx                  # クイック診断
    tools/<feature>/page.tsx  # 追加機能。見出し・説明は registry から
    settings/page.tsx
    api/<feature>/route.ts    # 機能ごとの Route Handler（nodejs runtime）
  components/
    shell/                    # Sidebar, AppShell, TopBar
    ui/                       # Card, PageHeader, Button, Badge, Tabs, DataTable, EmptyState, SetupNotice, Field
    charts/                   # Donut, Gauge, HBar, StackedBar, Sparkline（SVG、依存なし）
    free/                     # クイック診断の画面（Checker, ScoreCard, CheckList, SiteReport, FaqSection …）
    <feature>/                # 追加機能の画面
  lib/
    analyzer/                 # クイック診断のルール（既存。文の数え方は sentences.ts / language.ts）
    crawl/                    # サイト全体クロール（sitemap 展開 + 内部リンク BFS）。クイック診断と A1 で共有
    audit/                    # A1 テクニカル SEO ルール（extras.ts = 構成・信頼の分析に使う追加項目の抽出）
    seo-analysis/             # サイトの構成・信頼（structure / trust / kinds。A1 に同梱）+ 精密診断
                              #   llms.ts = llms.txt / llms-full.txt の有無と中身（判定は lib/llms-txt/validate.ts を再利用）
                              #   sheet/（事実シートの型と組み立て。純関数）、ai/（Claude の分析・数値の照合）、
                              #   collect.ts（クロール → PSI / CrUX / SerpApi / Google 連携）、runs.ts（Supabase analysis_runs）、quota.ts
    geo/                      # AI 検索モニタリング（docs/dev/geo-monitoring-spec.md）。pricing / credits / schedule /
                              #   stats / normalize / extract / aggregate は純関数、dataforseo・store・service・run が I/O
    crux/                     # CrUX API / CrUX History API（実ユーザーの速度。所有権不要）
    domain-power/             # ドメインパワー（無料の 8 指標からの推定。ahrefs.ts = DR 0〜100（無料の公開エンドポイント。
                              #   他社の測定サイトと同じ数値）、openpagerank.ts = OPR 0〜10、rdap.ts = 登録日、
                              #   残りは検索・CrUX・クロールの数値を使い回す。採点は score.ts の純関数）
    page-report/              # A2/A3（画面は引退。HP 改修提案・PSI・llms.txt が使う）
    citations/                # サイテーション（sources = 既知の媒体、analyze = 純関数、dataforseo = 検索）
    serp/                     # SERP プロバイダ抽象（SerpApi 実装、未設定時は null）
    llm/                      # Anthropic クライアント、モデル定数、構造化出力ヘルパ
    llmo/（プロンプト拡張だけ）rank/ keywords/ writing/ llms-txt/ geo/ search-estimate/ ...
    store/                    # ブラウザ側の永続化（localStorage + zod）。プロジェクト・キーワード・履歴
    integrations.ts           # 環境変数の有無を boolean で返す（キーの値は絶対に返さない）
    features/registry.ts      # サイドバー定義
```

## 状態の保存

- **対象サイトの URL は `/settings` の「ホームページ」カードだけで登録する**（利用者の指示 2026-09-16）。各ツールは `useRegisteredSite()`（`src/components/site/RegisteredSite.tsx`）で受け取り、画面の先頭に `SiteTargetNotice` を置く。ページ単位のツールは `PageTargetField` でパスだけを聞き、空欄ならトップページ。**新しいツールに自社サイトの URL 入力欄を足さない。**URL 入力欄を置いてよいのは競合とクイック診断（`/`・`/meo`）だけ。正規化と解決は `src/lib/site/target.ts` の純関数（`toSiteUrl` / `resolvePageUrl`）。
- サーバーに DB は無い。ユーザーの登録情報（プロジェクト、競合、キーワード、プロンプト、計測履歴、診断履歴）は **ブラウザの localStorage** に保存する。`src/lib/store/` の `createStore(name, schema)` を通し、キーは `seo-checker:v1:<name>` で統一、zod で検証し、壊れていれば初期値に戻す。
- 設定画面から JSON でエクスポート / インポートできるようにする。
- Route Handler はステートレス。入力を受け取って結果を返すだけ（キャッシュは既存の `globalCache`）。
- **アカウントの属性は Clerk の `publicMetadata`**（`plan` / `featureOverrides` / `stripe` / `role` / `agencyId`）。ここでも DB は持たない。`publicMetadata` は Backend API からしか書けないので、お客様が自分で書き換えることはできない（クライアントから書ける `unsafeMetadata` は使わない）。更新は**丸ごと置き換え**になるので、必ず既存の値を読んで残すこと（`src/lib/admin/roles.ts` の純関数を通す）。

## 誰が何を見られるか（マスター / 代理店 / 登録者）

| 役割 | 決まり方 | 見えるもの | できること |
|---|---|---|---|
| マスター（運用者） | 環境変数 `ADMIN_EMAILS` に書いた**確認済み**のメール | `/admin` で**登録しているすべてのお客様**。**代理ログイン**でお客様の画面そのものも | 代理店の追加・解除、担当の割り当て、機能の個別開放 |
| 代理店 | `publicMetadata.role === "agency"` | `/agency` で**自分に割り当てられた登録者だけ** | 表示のみ（プラン変更も機能開放もできない） |
| 登録者 | 上のどちらでもない | 自分のツール画面だけ | — |

- **マスターだけ環境変数**にしてある。運用者の権限を Clerk の値に置くと、Clerk に入れた誰かが自分を運用者にできてしまう。Vercel の設定を触れる人だけが変えられる場所に置く。
- 代理店の「担当」は登録者側の `publicMetadata.agencyId`（代理店の Clerk ユーザー ID）。**割り当てはマスターだけ**が行う（`/admin` の顧客一覧）。
- 代理店画面が引く ID は、必ずログイン中のセッションから取る（`currentAgencyId()`）。リクエストで受け取った ID を信用すると他の代理店の担当が見えてしまう。
- Clerk の Backend API には publicMetadata で絞る条件が無いので、代理店の一覧と担当分は**読んでから絞る**（`src/lib/admin/clients.ts` の `MAX_SCAN` = 500 人で打ち切り）。数千人規模になったら、担当の関係だけ Supabase に移して絞り込みを DB 側で行う。

### 代理ログイン（運用者がお客様の画面を見る）

トラブル対応と表示の確認のために、運用者がお客様としてログインできる（`src/lib/admin/impersonate.ts`）。仕組みは Clerk の **Actor Token**。運用者を `actor`、お客様を本人とする短命のチケットを作り、その URL へ遷移させる。

- **見るための機能で、代わりに操作するための機能ではない。**代理中（`auth().actor` が入っている）は決済 API（`/api/billing/checkout` / `/api/billing/portal`）を 403 で塞ぐ。お金に関わる事故は取り返しがつかないため。新しく「取り返しのつかない操作」を足すときは、ここに倣って `isImpersonating()` を見ること。
- 運用者どうしの代理ログインはできない（`canImpersonate()`。操作の責任が追えなくなる）。自分自身も不可。
- チケット 5 分・セッション 30 分で切れる。開始時に「誰が・誰に対して」をサーバーログへ出す。
- 代理中は `isAdmin()` がお客様のアカウントで判定されるため、サイドバーの「マスター画面」は消える。**戻る入口は画面下の帯（`ImpersonationBanner`）だけ**なので、どのシェル（通常・クイック診断・アンケート）でも必ず描画する。

## 外部連携（環境変数）

デプロイ・ドメイン・ログイン・Google 連携の各サービスがどう噛み合っているかは [services.md](./services.md) にまとめてある。ここでは環境変数だけを扱う。

| 変数 | 用途 | 必須 |
|---|---|---|
| `ANTHROPIC_API_KEY` | FAQ 生成、LLM サマリー、プロンプト拡張、ライティング、精密診断 | 任意 |
| `LLM_MODEL` | 分析・生成に使うモデル（既定 `claude-opus-5`） | 任意 |
| `LLM_FAST_MODEL` | 分類・判定など大量処理（既定 `claude-haiku-4-5`） | 任意 |
| `FAQ_MODEL` | 既存。FAQ 生成（既定 `claude-haiku-4-5`） | 任意 |
| ~~`OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY`~~ | 使わない（2026-09-17 に廃止。AI の計測は DataForSEO 経由） | — |
| `SERPAPI_KEY` | 順位計測・AI Overviews・ページ診断の Top10（SerpApi） | 任意 |
| `PAGESPEED_API_KEY` | PageSpeed Insights（無くても低頻度なら動く） | 任意 |
| `CRUX_API_KEY` | CrUX API / CrUX History API（実ユーザーの速度。`src/lib/crux/`）。無ければ `PAGESPEED_API_KEY` を使う | 任意 |
| `AHREFS_API_KEY` | ドメインパワーの DR（Ahrefs の無料公開エンドポイント `/v3/public/domain-rating-free`。API ユニットは消費しない）。**表示に「Domain Rating by Ahrefs」の帰属表示が要る**（`AHREFS_ATTRIBUTION`） | 任意 |
| `AHREFS_API_KEY_ISSUED_AT` | 上のキーを作った日（`YYYY-MM-DD`）。APIv3 キーは 1 年で失効するので、入れるとマスター画面の外部連携に**残り日数**が出る（`src/lib/features/key-expiry.ts` の純関数。日付は秘密ではないので `GET /api/integrations` で画面に返す。キーの値は返さない） | 任意 |
| `OPENPAGERANK_API_KEY` | ドメインパワーの「外部からのリンクの評価」の代替（Open PageRank 0〜10）。DR が取れていればそちらを優先する。どちらも無ければその 25 点分を分母から外して採点する。**旧 API は 2026-09-30 に終了**するので新規に設定しない（#86） | 任意 |
| `SEO_ANALYSIS_MONTHLY_LIMIT` | 精密診断の利用者ごとの月の回数（既定 10。`ADMIN_EMAILS` は無制限） | 任意 |
| `GOOGLE_PLACES_API_KEY` | Google マップ・店舗情報（Places API (New)） | 任意 |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | MEO の登録店舗（`meo_stores`）と診断報告書の履歴（`meo_reports`）、口コミ支援（`review_forms` / `review_channels` / `review_responses`）、基本情報掲載（`listing_profiles`）。`src/lib/db/supabase.ts` が PostgREST を fetch で叩く。service_role は RLS を素通りするので行は必ず user_id で絞る | MEO に必須 |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PRO` / `STRIPE_WEBHOOK_SECRET` | 決済（Stripe 直結）。`src/lib/billing/`。Checkout → Webhook → Clerk の `publicMetadata.stripe`。3 つそろうと `/plans` に申し込みとお支払いの管理が出る | 有料販売に必須 |
| `PROMO_CODES` | 割引コードの一覧（`src/lib/billing/promo.ts`。`CODE=pattern`。スタンダード専用・10 パターン。クーポンは `coupons.ts` が Stripe に自動で作る） | 任意 |
| `STRIPE_TRIAL_DAYS` | 全員に付ける無料期間の日数（`src/lib/billing/trial.ts`。既定 0 = なし。無料期間は割引コードで相手ごとに） | 任意 |
| `REVIEW_DRAFT_MODEL` | 口コミ支援の AI 下書きと質問文の訳のモデル（既定 `LLM_FAST_MODEL`） | 任意 |
| `REVIEW_REPLY_MODEL` | 口コミ返信案のモデル（既定 `LLM_FAST_MODEL`） | 任意 |
| `REVIEW_FORM_DAILY_LIMIT` / `REVIEW_AI_DAILY_LIMIT` | 口コミ支援の回数制限（アンケートごとの 1 日の回答数 500 / AI 下書きの 1 日の全体上限 2,000） | 任意 |
| `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | AI 検索モニタリング（`src/lib/geo/`）。ChatGPT / Gemini / AI Overviews の定期計測 | この機能に必須 |
| `GEO_USD_JPY` / `GEO_PRICE_*` / `GEO_LOCALE` / `GEO_CHARGE_ON_CACHE_HIT` | 同上の為替・単価・ロケール・キャッシュ時の課金。**単価はコードに直書きせず、ここだけで変える** | 任意 |
| `CRON_SECRET` | Vercel Cron（`vercel.json`）が `/api/cron/maps-refresh` を叩くときの Bearer。`src/lib/auth/cron.ts` で検証。未設定なら Cron は何もしない | MEO の一斉更新に必須 |
| `SITE_MAX_PAGES` | サイト診断（精密診断）のクロール上限（既定 300、上限 1000） | 任意 |
| `FREE_SITE_MAX_PAGES` | クイック診断のサイト全体のページ数（既定 10、上限 50） | 任意 |
| `ALLOW_PRIVATE_HOSTS` | 開発時のみ | 任意 |

`src/lib/integrations.ts` の `getIntegrationStatus()` が各連携の有無を返し、`GET /api/integrations` で画面に渡す。連携ごとの**料金・上限・このツールでの消費量・公式サイトのリンク**は `src/lib/features/integrations.ts`（`IntegrationMeta.pricing / limits / usage / links`、確認日は `PRICING_CHECKED_AT`）に持ち、マスター画面 `/admin` の外部連携で行を開くと出る。単価が変わったらここを直して `PRICING_CHECKED_AT` を更新する。

## LLM の方針

- Anthropic は既存の `@anthropic-ai/sdk` を使う。`src/lib/llm/anthropic.ts` にクライアント生成・モデル定数・共通エラー変換を置き、各機能はそこから呼ぶ。
- 構造化出力は既存 FAQ と同じ `client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })`。
- Web 検索が必要な処理（ファクトチェック、ページ診断の代替 Top10）はサーバーツール `{ type: "web_search_20260209", name: "web_search" }` を `tools` に渡す。回答中の `server_tool_use` ブロック（`input.query`）がファンアウトクエリ、`web_search_tool_result` と `citations` が引用元。
- 長文生成（記事）はストリーミング（`client.messages.stream`）で受け、Route Handler から `text/event-stream` または NDJSON で流す。
- モデル ID は `claude-opus-5` / `claude-haiku-4-5` のように日付サフィックス無しで書く。
- 他社 LLM（OpenAI / Gemini / Perplexity）を直接呼ぶ機能は 2026-09-17 に廃止した。AI の回答は DataForSEO の LLM Responses 経由（`src/lib/geo/`）で取る。`src/lib/llmo/providers/` は削除待ち（#105）。

## セキュリティ

- ユーザーが入力した URL をサーバーで取得するときは必ず `assertPublicHost` → `fetchText`（`src/lib/analyzer/fetch.ts`）を通す。新しい fetch 経路を作らない。
- `fetchText` はリダイレクトを `redirect: "manual"` で自分で追い、ホップごとに `assertPublicHost` を通す（最大 5 回）。転送先が内部アドレスなら `blocked_host` の `FetchError` になる。クロール（`src/lib/crawl/crawler.ts`）は `blocked_host` を「読み飛ばし」として扱い、URL ごとの理由をレポートに出さない（出すと内部ネットワークの到達性を調べる材料になる）。
- API キーはサーバーのみ。クライアントに返すのは boolean の連携状態だけ。
- Route Handler は入力を zod で検証し、エラーは `{ error: string }` と適切な HTTP ステータスで返す（既存の analyze/site と同じ形）。
- クロールを伴う API（`/api/site`）は同時実行を制限する。1 回の呼び出しが対象サイトへ最大 60（サイトマップ）+ ページ数上限（クイック診断は `FREE_SITE_MAX_PAGES`＝既定 10）回のリクエストを出すため、無制限に受け付けると他所のサイトを叩く踏み台になる。現状はプロセス内で「同時 2 本まで・同一クライアント（`x-forwarded-for` の先頭 IP）1 本まで」、超過は `429` と `{ code: "busy" }`（`src/app/api/site/route.ts`）。複数インスタンスで動かすときは共有ストアの制限に置き換える。
- Cron の入口（`/api/cron/*`）はログインが無いので `src/lib/auth/routes.ts` の公開 API に 1 本ずつ完全一致で入れ、ハンドラは `CRON_SECRET` で守る。MEO の数字は利用者が取り直せない（Google に問い合わせるのは店舗の登録直後と週 1 回の一斉更新だけ。`src/lib/maps/refresh.ts`）。
- 来店客向けアンケート（`/r/<slug>`、`/api/r/<slug>/*`）はログインが無い。`src/lib/auth/routes.ts` の公開接頭辞（`/r/`、`/api/r/`。接頭辞そのものは公開しない）で通し、ハンドラは IP ごとの回数制限とアンケートごとの 1 日の上限で守る（`src/lib/free/ratelimit.ts`）。来店客側の更新（投稿ボタンの押下、お店に直接伝える）は回答時に発行した `edit_token` を持つ人だけ。店舗側の管理 API（`/api/reviews/*`）は `review_responses` に user_id が無いので、必ず `review_forms` の所有（user_id）を確かめてから form_id で触る（`src/lib/reviews/api.ts` の `ownedForm`）。来店客に返すのは `PublicReviewForm`（質問と店名だけ。トーン・キーワード・投稿 URL・所有者は返さない）。来店客の画面は `Accept-Language` / `?lang=` で 5 言語に切り替わる（`src/lib/reviews/i18n.ts`、質問文の訳は `translate.ts`。選択肢は表示だけ訳し、送る値は日本語の原文）。
- サイト診断の結果はキャッシュ 1 件で 1 MB 近い。`globalCache` の `maxEntries` を小さく（10 件）し、`SiteCheckSummary.affected` はサーバー側で 50 件までに間引く（件数は `counts` が持つ）。

## UI 規約

- Tailwind v4。色・フォントは `src/app/globals.css` の `@theme` トークンだけを使う（任意の hex を JSX に書かない）。
- 共通部品は `src/components/ui/`、グラフは `src/components/charts/`（SVG。`html2canvas-pro` で PDF 化できるよう、CSS の `mask` / `backdrop-filter` / 外部画像に依存しない）。
- クイック診断の PDF / 印刷は既存の `print-card` / `no-print` / `print-only` クラスと `src/lib/pdf/download.ts` を使う。
- 文言は日本語。専門用語には一言の説明を添える。
- ページの先頭は `PageHeader`（registry のラベル・説明・機能 ID バッジ）。

## 品質ゲート

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

- ロジックは `src/lib/**/__tests__/*.test.ts` に vitest でテストを置く（ネットワークに出ない。必要なら `node:http` でローカルサーバーを立てる。既存の `site.test.ts` 参照）。
- `next build` は最終確認でのみ実行する（並行作業中は `tsc --noEmit` と `vitest run <file>` を使う）。

## 並行開発のルール（複数の作業者が同時に触るとき）

- 各作業パッケージは自分の `src/lib/<feature>/`、`src/components/<feature>/`、`src/app/tools/<feature>/`、`src/app/api/<feature>/` だけを編集する。
- 共有ファイル（`registry.ts`、`globals.css`、`components/ui/*`、`components/charts/*`、`package.json`、`layout.tsx`）は基盤担当だけが編集する。追加が必要なら自分のディレクトリ内に置く。
- 型エラーの確認は `npx tsc --noEmit 2>&1 | grep "src/<自分のディレクトリ>"` のように自分の範囲に絞る（他の作業者の途中状態が混ざるため）。
