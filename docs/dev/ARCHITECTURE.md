# 開発ガイド（アーキテクチャと規約）

このリポジトリは 2 つの顔を持つ。

1. **無料診断**（`/`）: 元々の SEO Checker。URL を入れると AIO（AI 検索最適化）の状況をルールベースで採点し、FAQ を生成する。**見込み顧客向けのリード獲得ツール**なので、レポートとしての見栄えと信頼感を最優先する。
2. **追加機能**（`/tools/*`）: [docs/reference/03_feature-catalog.md](../reference/03_feature-catalog.md) の機能 ID（A1〜E8）を実装したもの。左サイドバーのタブで切り替える。無料診断とは明確に別機能として扱う。

## ルーティングとサイドバー

サイドバーの定義は `src/lib/features/registry.ts` に一元化する（ラベル・パス・アイコン・グループ・機能 ID・状態）。ページ側はこの定義を参照して見出しを出す。サイドバーは **SEO / AIO / MEO のタブ**（`category`）で切り替え、タブの中を従来のグループ（診断 / 計測 / 調査 / 生成）で並べる。設定・料金は `category` を持たず全タブに出る。開いている画面のタブを優先し、共通画面では最後に選んだタブ（localStorage `sidebarTab`）。

| グループ | パス | ラベル | 機能 ID | 外部依存 |
|---|---|---|---|---|
| 無料診断 | `/` | 無料 SEO・AIO 診断（サイト） | （元ツール） | なし（FAQ 生成のみ Anthropic） |
| 無料診断 | `/meo` | 無料 MEO 診断（店舗 1 件、ログイン不要、回数制限つき） | — | Places API (New) |
| 診断 | `/tools/site-audit` | サイト診断（テクニカル SEO） | A1 | なし（サマリーは Anthropic 任意） |
| 診断 | `/tools/page-report` | ページ最適化レポート（AIO/LLM） | A2, A3 | PSI 任意 |
| 診断 | `/tools/page-diagnosis` | ページ診断（キーワード × ページ） | A4 | SERP or Anthropic web 検索 |
| 診断 | `/tools/aio-topics` | AIO 頻出トピック | A5 | SERP + Anthropic |
| 計測 | `/tools/rank` | 順位計測・AI Overviews 引用 | B1, B2, B3 | SERP |
| 計測 | `/tools/llmo` | LLMO モニタリング・LLM リサーチ | B4, B8 | Anthropic（他社は任意） |
| 計測 | `/tools/prompt-expansion` | プロンプト拡張 | B7 | Anthropic |
| 計測 | `/tools/ai-traffic` | 生成 AI 流入分析 | B6 | GA4 |
| 計測 | `/tools/site-report` | サイトレポート | E8 | GA4 + SERP |
| 計測 | `/tools/maps` | Google マップ・店舗情報（MEO） | — | Places API (New) |
| 計測 | `/tools/reviews` | 口コミ支援（アンケート QR） | — | Supabase（AI 下書きは Anthropic 任意） |
| 生成 | `/tools/replies` | 口コミへの返信（AI 返信案） | — | Google 連携（Business Profile API、`business.manage`）。返信案は Anthropic 任意 |
| 調査 | `/tools/keywords` | キーワード調査 | C1 | なし（意図分類は Anthropic 任意） |
| 生成 | `/tools/writing` | AI ライティング・エディター | D1, D2, D3, D4 | Anthropic |
| 生成 | `/tools/listings` | 基本情報掲載（NAP 一括登録） | — | Supabase（`listing_profiles`）。説明文は Anthropic 任意 |
| 生成 | `/tools/llms-txt` | llms.txt 生成 | D6 | なし |
| 設定 | `/settings` | プロジェクト・競合・外部連携 | E1, E2 | なし |
| 共通 | `/legal/tokushoho` | 特定商取引法に基づく表記（ログイン不要） | — | なし |

- 外部依存が未設定のときは、ページ内で `SetupNotice`（何を `.env.local` に設定すればよいか）を表示し、設定済みの部分だけ動かす。**ダミーデータで動いているように見せない。**
- 無料診断は `/` のまま。サイドバー最上部に「無料診断」セクションとして単独で置き、その下に「ツール（β）」として追加機能を並べる。

## ディレクトリ

```
src/
  app/
    layout.tsx                # AppShell（サイドバー + ヘッダー）を全ページに適用
    page.tsx                  # 無料診断
    tools/<feature>/page.tsx  # 追加機能。見出し・説明は registry から
    settings/page.tsx
    api/<feature>/route.ts    # 機能ごとの Route Handler（nodejs runtime）
  components/
    shell/                    # Sidebar, AppShell, TopBar
    ui/                       # Card, PageHeader, Button, Badge, Tabs, DataTable, EmptyState, SetupNotice, Field
    charts/                   # Donut, Gauge, HBar, StackedBar, Sparkline（SVG、依存なし）
    free/                     # 無料診断の画面（Checker, ScoreCard, CheckList, SiteReport, FaqSection …）
    <feature>/                # 追加機能の画面
  lib/
    analyzer/                 # 無料診断のルール（既存）
    crawl/                    # サイト全体クロール（sitemap 展開 + 内部リンク BFS）。無料診断と A1 で共有
    audit/                    # A1 テクニカル SEO ルール
    page-report/              # A2/A3
    serp/                     # SERP プロバイダ抽象（SerpApi 実装、未設定時は null）
    llm/                      # Anthropic クライアント、モデル定数、構造化出力ヘルパ、他社 LLM の薄いクライアント
    llmo/ rank/ keywords/ writing/ llms-txt/ ga4/ ...
    store/                    # ブラウザ側の永続化（localStorage + zod）。プロジェクト・キーワード・履歴
    integrations.ts           # 環境変数の有無を boolean で返す（キーの値は絶対に返さない）
    features/registry.ts      # サイドバー定義
```

## 状態の保存

- サーバーに DB は無い。ユーザーの登録情報（プロジェクト、競合、キーワード、プロンプト、計測履歴、診断履歴）は **ブラウザの localStorage** に保存する。`src/lib/store/` の `createStore(name, schema)` を通し、キーは `seo-checker:v1:<name>` で統一、zod で検証し、壊れていれば初期値に戻す。
- 設定画面から JSON でエクスポート / インポートできるようにする。
- Route Handler はステートレス。入力を受け取って結果を返すだけ（キャッシュは既存の `globalCache`）。

## 外部連携（環境変数）

デプロイ・ドメイン・ログイン・Google 連携の各サービスがどう噛み合っているかは [services.md](./services.md) にまとめてある。ここでは環境変数だけを扱う。

| 変数 | 用途 | 必須 |
|---|---|---|
| `ANTHROPIC_API_KEY` | FAQ 生成、LLM サマリー、LLMO（Claude）、プロンプト拡張、ライティング | 任意 |
| `LLM_MODEL` | 分析・生成に使うモデル（既定 `claude-opus-5`） | 任意 |
| `LLM_FAST_MODEL` | 分類・判定など大量処理（既定 `claude-haiku-4-5`） | 任意 |
| `FAQ_MODEL` | 既存。FAQ 生成（既定 `claude-haiku-4-5`） | 任意 |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY` | LLMO で ChatGPT / Gemini / Perplexity を対象にする | 任意 |
| `SERPAPI_KEY` | 順位計測・AI Overviews・ページ診断の Top10（SerpApi） | 任意 |
| `PAGESPEED_API_KEY` | PageSpeed Insights（無くても低頻度なら動く） | 任意 |
| `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` | GA4 Data API（サービスアカウント JSON をそのまま、または base64） | 任意 |
| `GOOGLE_PLACES_API_KEY` | Google マップ・店舗情報（Places API (New)） | 任意 |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | MEO の登録店舗（`meo_stores`）と診断報告書の履歴（`meo_reports`）、口コミ支援（`review_forms` / `review_channels` / `review_responses`）、基本情報掲載（`listing_profiles`）。`src/lib/db/supabase.ts` が PostgREST を fetch で叩く。service_role は RLS を素通りするので行は必ず user_id で絞る | MEO に必須 |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PRO` / `STRIPE_WEBHOOK_SECRET` | 決済（Stripe 直結）。`src/lib/billing/`。Checkout → Webhook → Clerk の `publicMetadata.stripe`。3 つそろうと `/plans` に申し込みとお支払いの管理が出る | 有料販売に必須 |
| `REVIEW_DRAFT_MODEL` | 口コミ支援の AI 下書きと質問文の訳のモデル（既定 `LLM_FAST_MODEL`） | 任意 |
| `REVIEW_REPLY_MODEL` | 口コミ返信案のモデル（既定 `LLM_FAST_MODEL`） | 任意 |
| `REVIEW_FORM_DAILY_LIMIT` / `REVIEW_AI_DAILY_LIMIT` | 口コミ支援の回数制限（アンケートごとの 1 日の回答数 500 / AI 下書きの 1 日の全体上限 2,000） | 任意 |
| `CRON_SECRET` | Vercel Cron（`vercel.json`）が `/api/cron/maps-refresh` を叩くときの Bearer。`src/lib/auth/cron.ts` で検証。未設定なら Cron は何もしない | MEO の一斉更新に必須 |
| `SITE_MAX_PAGES` | 無料診断・サイト診断のクロール上限（既定 300、上限 1000） | 任意 |
| `ALLOW_PRIVATE_HOSTS` | 開発時のみ | 任意 |

`src/lib/integrations.ts` の `getIntegrationStatus()` が各連携の有無を返し、`GET /api/integrations` で画面に渡す。

## LLM の方針

- Anthropic は既存の `@anthropic-ai/sdk` を使う。`src/lib/llm/anthropic.ts` にクライアント生成・モデル定数・共通エラー変換を置き、各機能はそこから呼ぶ。
- 構造化出力は既存 FAQ と同じ `client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })`。
- Web 検索が必要な処理（LLMO の Claude 回答、ファクトチェック、ページ診断の代替 Top10）はサーバーツール `{ type: "web_search_20260209", name: "web_search" }` を `tools` に渡す。回答中の `server_tool_use` ブロック（`input.query`）がファンアウトクエリ、`web_search_tool_result` と `citations` が引用元。
- 長文生成（記事）はストリーミング（`client.messages.stream`）で受け、Route Handler から `text/event-stream` または NDJSON で流す。
- モデル ID は `claude-opus-5` / `claude-haiku-4-5` のように日付サフィックス無しで書く。
- 他社 LLM（OpenAI Responses API + web_search、Gemini + Google 検索グラウンディング、Perplexity Sonar）は SDK を追加せず `fetch` で薄く実装する。キーが無ければその列は「未設定」。

## セキュリティ

- ユーザーが入力した URL をサーバーで取得するときは必ず `assertPublicHost` → `fetchText`（`src/lib/analyzer/fetch.ts`）を通す。新しい fetch 経路を作らない。
- `fetchText` はリダイレクトを `redirect: "manual"` で自分で追い、ホップごとに `assertPublicHost` を通す（最大 5 回）。転送先が内部アドレスなら `blocked_host` の `FetchError` になる。クロール（`src/lib/crawl/crawler.ts`）は `blocked_host` を「読み飛ばし」として扱い、URL ごとの理由をレポートに出さない（出すと内部ネットワークの到達性を調べる材料になる）。
- API キーはサーバーのみ。クライアントに返すのは boolean の連携状態だけ。
- Route Handler は入力を zod で検証し、エラーは `{ error: string }` と適切な HTTP ステータスで返す（既存の analyze/site と同じ形）。
- クロールを伴う API（`/api/site`）は同時実行を制限する。1 回の呼び出しが対象サイトへ最大 60（サイトマップ）+ `SITE_MAX_PAGES`（既定 300）回のリクエストを出すため、無制限に受け付けると他所のサイトを叩く踏み台になる。現状はプロセス内で「同時 2 本まで・同一クライアント（`x-forwarded-for` の先頭 IP）1 本まで」、超過は `429` と `{ code: "busy" }`（`src/app/api/site/route.ts`）。複数インスタンスで動かすときは共有ストアの制限に置き換える。
- Cron の入口（`/api/cron/*`）はログインが無いので `src/lib/auth/routes.ts` の公開 API に 1 本ずつ完全一致で入れ、ハンドラは `CRON_SECRET` で守る。MEO の数字は利用者が取り直せない（Google に問い合わせるのは店舗の登録直後と週 1 回の一斉更新だけ。`src/lib/maps/refresh.ts`）。
- 来店客向けアンケート（`/r/<slug>`、`/api/r/<slug>/*`）はログインが無い。`src/lib/auth/routes.ts` の公開接頭辞（`/r/`、`/api/r/`。接頭辞そのものは公開しない）で通し、ハンドラは IP ごとの回数制限とアンケートごとの 1 日の上限で守る（`src/lib/free/ratelimit.ts`）。来店客側の更新（投稿ボタンの押下、お店に直接伝える）は回答時に発行した `edit_token` を持つ人だけ。店舗側の管理 API（`/api/reviews/*`）は `review_responses` に user_id が無いので、必ず `review_forms` の所有（user_id）を確かめてから form_id で触る（`src/lib/reviews/api.ts` の `ownedForm`）。来店客に返すのは `PublicReviewForm`（質問と店名だけ。トーン・キーワード・投稿 URL・所有者は返さない）。来店客の画面は `Accept-Language` / `?lang=` で 5 言語に切り替わる（`src/lib/reviews/i18n.ts`、質問文の訳は `translate.ts`。選択肢は表示だけ訳し、送る値は日本語の原文）。
- サイト診断の結果はキャッシュ 1 件で 1 MB 近い。`globalCache` の `maxEntries` を小さく（10 件）し、`SiteCheckSummary.affected` はサーバー側で 50 件までに間引く（件数は `counts` が持つ）。

## UI 規約

- Tailwind v4。色・フォントは `src/app/globals.css` の `@theme` トークンだけを使う（任意の hex を JSX に書かない）。
- 共通部品は `src/components/ui/`、グラフは `src/components/charts/`（SVG。`html2canvas-pro` で PDF 化できるよう、CSS の `mask` / `backdrop-filter` / 外部画像に依存しない）。
- 無料診断の PDF / 印刷は既存の `print-card` / `no-print` / `print-only` クラスと `src/lib/pdf/download.ts` を使う。
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
