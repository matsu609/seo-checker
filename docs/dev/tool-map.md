# ツールと API キーの関係図

**どのツール（画面）が、どの外部 API に、どのキーでつながっているか**を 1 か所にまとめた図。
「このキーを入れると何が動くか」「このキーが切れると何が止まるか」をここで引く。

- サービス全体の構成（GitHub / Vercel / Cloudflare / Clerk / Supabase / Google Cloud）→ [services.md](./services.md)
- ルーティングと機能の一覧 → [ARCHITECTURE.md](./ARCHITECTURE.md)
- いま何が設定済みかという**現在の状態** → [OPERATIONS.md](./OPERATIONS.md)

定義の正本はコード側にある。この図とずれたらコードが正しい。

| 内容 | ファイル |
|---|---|
| 連携の一覧・環境変数名・説明 | `src/lib/features/integrations.ts` |
| キーが設定済みかの判定（値は返さない） | `src/lib/integrations.ts` → `GET /api/integrations` |
| ツールごとの必須 / 任意の依存 | `src/lib/features/registry.ts`（`requires` / `requiresAny` / `optional`） |

---

## 1. つながりは 3 種類ある

同じ「連携」でも、鍵の持ち主と実費の出どころが違う。混ぜて考えると障害の切り分けを間違える。

```
① サーバーのキー（全ユーザー共通）
   Vercel の環境変数 ──→ 外部 API
   運営者が契約し、実費も運営者が払う。ブラウザには渡らない。
   Anthropic / OpenAI / Gemini / Perplexity / SerpApi / PageSpeed / Places / GA4(サービスアカウント) / Supabase

② 利用者ごとの許可（OAuth。鍵は Clerk が預かる）
   お客様が「接続」を押す ──→ Clerk が短命トークンを保管 ──→ アプリが借りて読む
   見えるのは「そのお客様のデータ」。アプリはトークンを保存しない。
   Search Console / GA4(利用者の選択) / Google ビジネス プロフィール

③ ブラウザの中のデータ（キー不要）
   localStorage（seo-checker:v1:*）──→ 別のツールがそのまま読む
   プロジェクト・キーワード・プロンプト・計測履歴。端末の外には出ない。
```

---

## 2. キー → 外部 API（①のつながり）

環境変数 9 系統が、そのまま 9 つの「連携」になっている（`INTEGRATION_KEYS`）。GA4 と Supabase だけは**2 つ揃って初めて有効**。

```mermaid
flowchart LR
  ANTHROPIC["ANTHROPIC_API_KEY"] --> A["Anthropic (Claude)<br/>本文生成・要約・Web 検索"]
  OPENAI["OPENAI_API_KEY"] --> O["OpenAI (ChatGPT)<br/>api.openai.com/v1/responses"]
  GEMINI["GEMINI_API_KEY"] --> G["Google Gemini<br/>generativelanguage.googleapis.com"]
  PPLX["PERPLEXITY_API_KEY"] --> P["Perplexity<br/>api.perplexity.ai"]
  SERP["SERPAPI_KEY"] --> S["SerpApi<br/>serpapi.com/search.json"]
  PSI["PAGESPEED_API_KEY"] --> PS["PageSpeed Insights<br/>googleapis.com/pagespeedonline/v5"]
  PLACES["GOOGLE_PLACES_API_KEY"] --> PL["Places API (New)<br/>places.googleapis.com/v1"]
  GA4ID["GA4_PROPERTY_ID"] --> GA["GA4 Data API<br/>analyticsdata.googleapis.com"]
  SA["GOOGLE_SERVICE_ACCOUNT_JSON"] --> GA
  SUPAURL["SUPABASE_URL"] --> DB["Supabase (PostgreSQL)<br/>REST /rest/v1"]
  SUPAKEY["SUPABASE_SERVICE_ROLE_KEY"] --> DB
```

- **キーは 1 本も画面に出さない。**`GET /api/integrations` は `true` / `false` だけを返す（`src/lib/integrations.ts` の冒頭コメント）。
- `NEXT_PUBLIC_` が付く変数だけがブラウザに届く。ここに秘密は入れない。
- モデル名は差し替えられる（キーとは別）: `LLM_MODEL` / `LLM_FAST_MODEL` / `FAQ_MODEL` / `REVIEW_DRAFT_MODEL` / `REVIEW_REPLY_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL` / `PERPLEXITY_MODEL`。

---

## 3. ツール × キーの対応表

**●** 無いと実行できない ／ **◍** どちらか 1 つあればよい ／ **○** あると機能が増える ／ **−** 不要

| ツール | パス | プラン | ログイン | Anthropic | SerpApi | PSI | GA4 | Places | Supabase | 他社 LLM | 利用者の Google |
|---|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 無料 SEO・AIO 診断 | `/` | 無料 | 不要 | ○ | − | − | − | − | − | − | − |
| 無料 MEO 診断 | `/meo` | 無料 | 不要 | − | − | − | − | ● | − | − | − |
| サイト診断 | `/tools/site-audit` | standard | 必須 | ○ | − | − | − | − | − | − | − |
| ページ最適化レポート | `/tools/page-report` | standard | 必須 | − | − | ○ | − | − | − | − | − |
| ページ診断 | `/tools/page-diagnosis` | standard | 必須 | ◍ | ◍ | − | − | − | − | − | − |
| AIO 頻出トピック | `/tools/aio-topics` | standard | 必須 | ● | ● | − | − | − | − | − | − |
| HP 改修提案 | `/tools/improvement` | pro | 必須 | ● | − | − | − | − | − | − | − |
| 順位計測・AIO 引用 | `/tools/rank` | standard | 必須 | − | ● | − | − | − | − | − | − |
| 検索パフォーマンス | `/tools/search-performance` | standard | 必須 | − | − | − | − | − | − | − | ● GSC |
| Google マップ（MEO） | `/tools/maps` | standard | 必須 | ○ ※1 | − | − | − | ● | ● | − | − |
| 口コミ支援（QR） | `/tools/reviews` | pro | 必須 ※2 | ○ | − | − | − | ○ | ● | − | − |
| LLMO モニタリング | `/tools/llmo` | standard | 必須 | ● | − | − | − | − | − | ○ | − |
| プロンプト拡張 | `/tools/prompt-expansion` | standard | 必須 | ● | − | − | − | − | − | − | − |
| 生成 AI 流入分析 | `/tools/ai-traffic` | standard | 必須 | − | − | − | ● ※3 | − | − | − | ○ GA4 |
| サイトレポート | `/tools/site-report` | standard | 必須 | − | ● ※4 | − | ● ※3 | − | − | − | ○ GA4 |
| キーワード調査 | `/tools/keywords` | standard | 必須 | ○ | − | − | − | − | − | − | − |
| AI ライティング | `/tools/writing` | pro | 必須 | ● | ○ ※4 | − | − | − | − | − | − |
| 口コミへの返信 | `/tools/replies` | pro | 必須 | ○ | − | − | − | ○ | ○ | − | ◍ BP ※5 |
| 基本情報掲載（NAP） | `/tools/listings` | pro | 必須 | ○ | − | − | − | ○ | ● | − | − |
| llms.txt 生成 | `/tools/llms-txt` | pro | 必須 | − | − | − | − | − | − | − | − |
| 料金プラン・設定 | `/plans` `/settings` | 無料 | 必須 | − | − | − | − | − | − | − | − |

- ※1 総評は `ANTHROPIC_API_KEY` があれば AI が執筆し、無ければルール生成の文章になる。ただし registry の `optional` には未記載なので、画面の SetupNotice には「任意」として出ない（実装の挙動は任意）。
- ※2 店舗側の管理画面はログイン必須。来店客が QR から開くアンケート `/r/<slug>` と `POST /api/r/<slug>/*` だけは公開（IP ごとの回数制限つき）。
- ※3 GA4 は**利用者が設定画面で選んだプロパティ（②のトークン）が優先**され、無ければ環境変数のサービスアカウント（①）に落ちる（`src/lib/google/ga4.ts`）。どちらも無ければ使えない。
- ※4 サイトレポートの順位はブラウザの `rankSnapshots`（順位計測ツールが作る）から読む。この画面の API 自体は SerpApi を叩かないので、**SerpApi が必要なのは「順位計測で履歴を作るため」**という間接的な依存。AI ライティングは SerpApi があれば上位 10 件を分析して構成案に反映し、無ければキーワードだけから作る（Claude の Web 検索には切り替わらない）。
- ※5 Google ビジネス プロフィール（`business.manage`）を接続すると口コミの全件取得と投稿がこの画面で完結する。未接続でも Places の公開口コミ（最新 5 件）から返信案を作れる。
- ページ診断は SerpApi が無いとき **Claude の Web 検索で上位ページを推定**する（実測の順位ではない旨が画面に出る。`src/lib/page-diagnosis/run.ts`）。

キーが未設定のツールは、**必要な環境変数名を出して実行操作だけを無効化する**。ダミーデータで動いているように見せない（`SetupNotice`）。

---

## 4. 利用者ごとの Google 連携（②のつながり）

Anthropic や SerpApi は「運営者のキー 1 本」で済むが、Search Console / GA4 / ビジネス プロフィールは**お客様のデータ**なので本人の許可が要る。鍵はアプリではなく Clerk が預かる。

```mermaid
sequenceDiagram
  participant U as お客様のブラウザ
  participant C as Clerk
  participant G as Google
  participant A as アプリ（Vercel）
  U->>C: /settings で「接続」（additionalScopes で追加スコープを要求）
  C->>G: Google Cloud のクライアント ID で認可へ
  G-->>U: 同意画面
  U-->>G: 許可
  G->>C: リダイレクト URI（clerk.seo-checker.tokyo）へトークンを返す
  C->>C: アクセストークン / リフレッシュトークンを保管・更新
  A->>C: 必要なたびに借りる（src/lib/google/token.ts）
  A->>G: GSC / GA4 / Business Profile を読む
```

| スコープ | 使うツール | いつ要求するか |
|---|---|---|
| `webmasters.readonly` | 検索パフォーマンス | 設定画面の接続で必ず（`REQUIRED_SCOPES`） |
| `analytics.readonly` | 生成 AI 流入分析・サイトレポート | 設定画面の接続で必ず（`REQUIRED_SCOPES`） |
| `business.manage` | 口コミへの返信（取得・投稿） | 返信画面で「権限を追加」を押したときだけ |

- 対象サイト / プロパティの選択は Clerk の `privateMetadata.googleLink`（`src/lib/google/settings.ts`）。
- 前提として Clerk の Google 連携が**独自のクレデンシャル**になっていること。既定の共有クライアント ID では上の 3 スコープを要求できない。

---

## 5. ツール間のデータの受け渡し（③のつながり）

キーは関係なく、**先に使うツールが後のツールの入力を作る**という依存がある。診断や計測の結果はサーバーに保存しない。

```mermaid
flowchart LR
  subgraph browser["ブラウザの localStorage（端末ごと）"]
    PRJ["プロジェクト・競合<br/>projects"]
    KW["rankKeywords / rankSnapshots"]
    PR["llmoPrompts / llmoRuns"]
    TP["aioTopicDays / aioTopicCoverage"]
  end
  KWT["キーワード調査"] -->|"addKeywords()"| KW
  KW --> RANK["順位計測"]
  RANK -->|"順位の履歴"| SR["サイトレポート"]
  PEX["プロンプト拡張"] -->|"addPrompts()"| PR
  PR --> LLMO["LLMO モニタリング"]
  AIO["AIO 頻出トピック"] --> TP
  TP -->|"不足トピックをコピー"| PD["ページ診断"]
  TP -->|"不足トピックをコピー"| WR["AI ライティング"]
  PRJ --> RANK
  PRJ --> LLMO
  PRJ --> SR
  PRJ --> AIO
  FREEMEO["無料 MEO 診断 /meo"] -.->|"有料版へ案内"| MAPS["Google マップ（MEO）"]
```

Supabase を使う MEO 系だけは、**サーバー側のテーブルで**つながっている（端末をまたいでも残る）。

```mermaid
flowchart LR
  MAPS["Google マップ（MEO）<br/>/tools/maps"] --> ST["meo_stores<br/>自社・競合の登録店舗"]
  MAPS --> RP["meo_reports<br/>診断報告書の履歴"]
  MAPS --> OI["meo_owner_inputs<br/>オーナーしか分からない入力"]
  ST --> REV["口コミ支援（QR）<br/>/tools/reviews"]
  ST --> LST["基本情報掲載（NAP）<br/>/tools/listings"]
  ST --> REP["口コミへの返信<br/>/tools/replies"]
  REV --> RF["review_forms / review_channels"]
  RF --> QR["来店客のアンケート /r/&lt;slug&gt;"]
  QR --> RR["review_responses"]
  RR --> REV
  LST --> LP["listing_profiles"]
  CRON["Vercel Cron<br/>毎週月曜 5:00 JST"] -->|"取り直す店舗を読む"| ST
  CRON -->|"取り直した結果を保存"| RP
```

| テーブル | 作る / 読むツール |
|---|---|
| `meo_stores` | maps が登録。reviews / listings / replies が店舗一覧として読む |
| `meo_reports` | maps と Cron が書く。最新と前回の差分を maps が読む |
| `meo_owner_inputs` | maps（オーナー権限が要る項目の手入力） |
| `review_forms` / `review_channels` | reviews（アンケートと店舗別・経路別の QR） |
| `review_responses` | 来店客の `/r/<slug>` が書き、reviews が読む |
| `listing_profiles` | listings（NAP の正本） |

ブラウザ側のデータは設定画面から JSON でエクスポート / インポートできる（`exportAll` / `importAll`）。端末を変えると引き継げないのはこの③だけ。

---

## 6. 自動更新（Cron）と決済

```
Vercel Cron（vercel.json: "0 20 * * 0" = 毎週月曜 5:00 JST）
    │  Authorization: Bearer <CRON_SECRET> を Vercel が自動で付ける
    ↓
GET /api/cron/maps-refresh      ← ログインは無い。CRON_SECRET が未設定なら 503 で何もしない
    ↓  Places で全店舗を取り直す（実費が出る）
Supabase（meo_stores → meo_reports）に保存
```

```
お客様が /plans で購入
    ↓  POST /api/billing/checkout（STRIPE_SECRET_KEY / STRIPE_PRICE_PRO）
Stripe の決済画面
    ↓  Webhook（STRIPE_WEBHOOK_SECRET で署名検証）
POST /api/billing/webhook → Clerk の publicMetadata.stripe を更新
    ↓
プラン判定（src/lib/plans/current.ts）: Stripe の契約状態 → publicMetadata.plan → DEFAULT_PLAN
```

決済の実体は Stripe だが、**契約状態は Clerk が持つ**のでアプリ側の DB は要らない。

---

## 7. キーが切れたら何が止まるか

| キー | 止まるもの | 動き続けるもの |
|---|---|---|
| `ANTHROPIC_API_KEY` | AIO 頻出トピック・HP 改修提案・プロンプト拡張・AI ライティング・LLMO（Claude が必須） | 無料診断（FAQ だけ消える）・サイト診断（サマリーだけ消える）・キーワード調査（意図分類だけ消える）・maps（総評がルール生成に戻る） |
| `SERPAPI_KEY` | 順位計測・AIO 頻出トピック（→ 履歴が止まるのでサイトレポートの順位も伸びない） | ページ診断は Claude の Web 検索による推定に切り替わる。AI ライティングは上位分析なしで構成案を作る |
| `GOOGLE_PLACES_API_KEY` | 無料 MEO 診断・Google マップ（MEO）・毎週の一斉更新 | listings / replies は登録済みデータの閲覧のみ |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Google マップ（MEO）・口コミ支援・基本情報掲載・一斉更新 | それ以外すべて |
| `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` | 生成 AI 流入分析・サイトレポート（利用者が GA4 を連携していない場合） | 利用者が連携していれば②で動く |
| `PAGESPEED_API_KEY` | 止まらない。未設定でも低頻度なら取得できる（混雑すると Google 側の制限で失敗しやすい） | ページ最適化レポート（速度以外の項目はそのまま） |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY` | LLMO の対象モデルが Claude だけになる | LLMO 本体 |
| `CRON_SECRET` | 毎週の一斉更新（503 で自分から止まる） | 手動の登録・診断 |
| `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ログインと、ログインが要る全ツール | 無料診断 2 本・規約・アンケート `/r/<slug>` |
| `STRIPE_*` | 購入と契約状態の同期 | `publicMetadata.plan` と `DEFAULT_PLAN` による手割り当て |
| （キーではない）利用者の Google 連携が未接続 | 検索パフォーマンス、口コミ返信の全件取得・投稿 | 生成 AI 流入・サイトレポートは①のサービスアカウントに落ちて動く |

実費が出るキーには、キーとは別にガードがある。

| 実費 | ガード |
|---|---|
| Places（詳細取得 1 回 ≒ 4 円） | 無料 MEO 診断は IP ごとの回数制限 + 1 日の全体上限（`FREE_MEO_DAILY_LIMIT` 既定 500 / `FREE_MEO_DAILY_SEARCH_LIMIT` 既定 1,500。`0` で停止）。有料側はログイン必須 |
| SerpApi・各 LLM | ログイン必須 + プラン判定。公開しているのは無料診断の FAQ だけ（同じ URL と本文なら 1 時間キャッシュ） |
| クロール | `SITE_MAX_PAGES`（既定 300、最大 1,000）。社内ホストへのアクセスは `ALLOW_PRIVATE_HOSTS=1` のときだけ許す |
| Cron | `CRON_SECRET`。未設定なら一斉更新そのものを無効化 |

### 切り分けの順番

1. `/settings` の「外部連携」で設定済み / 未設定を見る（= `GET /api/integrations`）。
2. 「設定済みなのに動かない」なら Vercel の環境変数を保存し直して **Redeploy**（環境変数は再デプロイまで反映されない）。
3. Google の①②が絡む画面（生成 AI 流入・サイトレポート）は、**どちらの認証で読んだか**（`source: "user" | "env"`）で切り分ける。
4. MEO 系が全滅なら Supabase、口コミ返信だけなら `business.manage` の権限追加を見る。
