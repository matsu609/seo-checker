# ツールと API キーの関係図

**どのツール（画面）が、どの外部 API に、どのキーでつながっているか**を 1 か所にまとめた図。
「このキーを入れると何が動くか」「このキーが切れると何が止まるか」をここで引く。

最終更新: 2026-09-16（精密診断の統合、ドメインパワー、数字の診断、料金 3 段階を反映）。

- サービス全体の構成（GitHub / Vercel / Cloudflare / Clerk / Supabase / Google Cloud）→ [services.md](./services.md)
- ルーティングと機能の一覧 → [ARCHITECTURE.md](./ARCHITECTURE.md)
- **数字の出し方（配点・閾値・計算式）** → [scoring-reference.md](./scoring-reference.md)
- いま何が設定済みかという**現在の状態** → [OPERATIONS.md](./OPERATIONS.md)
- **画面で読む版**: マスター画面の「設計書」（`/admin/design`。サービスごとの役割・どの機能実装に使ったか・機能 × 連携の表を、連携の定義と registry の依存から自動で組む）と「外部連携」（設定の有無。基盤・ログイン・決済も含めて 18 件）、「月額費用の試算」（店舗数を横軸にした固定費 / 変動費。`src/lib/cost/model.ts`）。2026-09-21

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
   Anthropic / SerpApi / PageSpeed / Places / DataForSEO / Supabase（OpenAI / Gemini / Perplexity は 2026-09-17 に廃止）

② 利用者ごとの許可（OAuth。鍵は Clerk が預かる）
   お客様が「接続」を押す ──→ Clerk が短命トークンを保管 ──→ アプリが借りて読む
   見えるのは「そのお客様のデータ」。アプリはトークンを保存しない。
   Google ビジネス プロフィールだけ（Search Console / GA4 は 2026-09-17 に廃止。利用者の決定）

③ ブラウザの中のデータ（キー不要）
   localStorage（seo-checker:v1:*）──→ 別のツールがそのまま読む
   プロジェクト・キーワード・プロンプト・計測履歴。端末の外には出ない。
```

---

## 2. キー → 外部 API（①のつながり）

環境変数がそのまま「連携」になっている（`INTEGRATION_KEYS`）。GA4 と Supabase だけは**2 つ揃って初めて有効**。
RDAP（ドメインの登録日）だけはキーが要らない。

```mermaid
flowchart LR
  ANTHROPIC["ANTHROPIC_API_KEY"] --> A["Anthropic (Claude)<br/>本文生成・要約・Web 検索"]
  SERP["SERPAPI_KEY"] --> S["SerpApi<br/>serpapi.com/search.json"]
  AHREFS["AHREFS_API_KEY"] --> AH["Ahrefs<br/>ドメインの Domain Rating"]
  OPR["OPENPAGERANK_API_KEY"] --> OP["Open PageRank<br/>openpagerank.com（無料・1 日 1,000 回）"]
  NOKEY["（キー不要）"] --> RDAP["RDAP<br/>rdap.org（ドメインの登録日）"]
  PSI["PAGESPEED_API_KEY"] --> PS["PageSpeed Insights<br/>googleapis.com/pagespeedonline/v5"]
  PSI --> CRUX["Chrome UX Report<br/>実ユーザーの速度。CRUX_API_KEY でも可"]
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

| ツール | パス | プラン | ログイン | Anthropic | SerpApi | PSI / CrUX | GA4 | Places | Supabase | 他社 LLM | 利用者の Google |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| クイック診断（サイト） | `/` | 無料（登録が要る。メールごとに 2 回） | 必須 ※9 | ○ | − | − | − | − | − | − | − |
| クイック診断（店舗） | `/meo` | 無料（登録が要る。サイトと合計 2 回） | 必須 ※9 | − | − | − | − | ● | − | − | − |
| **精密診断** | `/tools/seo-analysis` | standard | 必須 | ● | ○ | ○ | − | − | ● | ○ ※6 | − ※7 |
| サイト診断 | `/tools/site-audit` | light | 必須 | − | − | − | − | − | − | − | − |
| ~~ページ最適化レポート~~（サイドバーから外した r94。HP 改修提案へ転送） | `/tools/page-report` | light | 必須 | − | − | ○ | − | − | − | − | − |
| ページ診断（競合比較） | `/tools/page-diagnosis` | light | 必須 | ◍ | ◍ | − | − | − | − | − | − |
| ~~AIO 頻出トピック~~（サイドバーから外した r94。AI 検索モニタリングへ転送） | `/tools/aio-topics` | light | 必須 | ● | ● | − | − | − | − | − | − |
| HP 改修提案（SEO タブ） | `/tools/improvement` | standard | 必須 | ● | − | − | − | − | − | − | − |
| 順位計測・AIO 引用 | `/tools/rank` | light | 必須 | − | ● | − | − | − | − | − | − |
| 検索パフォーマンス（推定） | `/tools/search-estimate` | light | 必須 | − | − | − | − | − | − | − ※8 | − |
| Google マップ（MEO） | `/tools/maps` | light | 必須 | ○ ※1 | − | − | − | ● | ● | − | ○ BP ※5（Google での見られ方 = Performance API。接続した店舗だけ） |
| 口コミ支援（QR） | `/tools/reviews` | standard | 必須 ※2 | ○ | − | − | − | ○ | ● | − | − |
| プロンプト拡張（サイドバーには出さず、AI 検索モニタリングの設定からリンク） | `/tools/prompt-expansion` | light | 必須 | ● | − | − | − | − | − | − | − |
| キーワード調査 | `/tools/keywords` | light | 必須 | ○ | − | − | − | − | − | − | − |
| AI ライティング | `/tools/writing` | standard | 必須 | ● | ○ ※4 | − | − | − | − | − | − |
| 口コミへの返信 | `/tools/replies` | standard | 必須 | ○ | − | − | − | ○ | ○ | − | ◍ BP ※5 |
| NAP チェック（表記ゆれの検出） | `/tools/nap` | light | 必須 | − | − | − | − | ○ | ○ | − | − |
| サイテーション（DataForSEO ※8） | `/tools/citations` | light | 必須 | − | − | − | − | − | − | − | − |
| 基本情報掲載（NAP） | `/tools/listings` | standard | 必須 | ○ | − | − | − | ○ | ● | − | − |
| llms.txt 生成 | `/tools/llms-txt` | standard | 必須 | − | − | − | − | − | − | − | − |
| 料金プラン・設定 | `/plans` `/settings` | 無料 | 必須 | − | − | − | − | − | − | − | − |

プランは下位互換です（`light` のツールは `standard` / `premium` でも使えます。`PLAN_RANK`: free 0 → light 1 → standard 2 → premium 3）。

- ※1 総評は `ANTHROPIC_API_KEY` があれば AI が執筆し、無ければルール生成の文章になる。registry の `optional` には未記載（[OPERATIONS.md](./OPERATIONS.md) の残タスク #60）。
- ※2 店舗側の管理画面はログイン必須。来店客が QR から開くアンケート `/r/<slug>` と `POST /api/r/<slug>/*` だけは公開（IP ごとの回数制限つき）。
- ※3 （廃止 2026-09-17）GA4 の列は空。GA4 を読む実装は削除済み。
- ※4 サイトレポートの順位はブラウザの `rankSnapshots`（順位計測ツールが作る）から読む。この画面の API 自体は SerpApi を叩かないので、**SerpApi が必要なのは「順位計測で履歴を作るため」**という間接的な依存。AI ライティングは SerpApi があれば上位 10 件を分析して構成案に反映する。
- ※5 Google ビジネス プロフィール（`business.manage`）を接続すると口コミの全件取得と投稿がこの画面で完結する。未接続でも Places の公開口コミ（最新 5 件）から返信案を作れる。
- ※6 （廃止 2026-09-17）セカンドオピニオン（`OPENAI_API_KEY`）は提供終了。Claude だけで報告書は完成する。
- ※8 検索パフォーマンス（推定）は DataForSEO Labs（`DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`。表に列が無いので注記）。
- ※7 **Google 連携は使わない（2026-09-17）。報告書は URL だけで完成する**（URL だけで動くのがこのツールの前提）。連携すると「数字の診断」が 134 ルールまで増える → [scoring-reference.md](./scoring-reference.md) §7。
- ページ診断は SerpApi が無いとき **Claude の Web 検索で上位ページを推定**する（実測の順位ではない旨が画面に出る）。
- サイト診断（`/tools/site-audit`）は**精密診断に統合済み**で、サイドバーには出ない（registry の `hidden: true`）。URL は `/tools/seo-analysis` へ転送する。

### 精密診断が 1 回で触る外部 API

1 つの画面が最も多くの API を使うので、内訳を出しておく。

| 呼ぶ先 | キー | 回数の目安 | 実費 |
|---|---|---|---|
| 自前クローラー | − | `SITE_MAX_PAGES` まで | 0 |
| PageSpeed Insights | `PAGESPEED_API_KEY` | 6（トップ + 主要 5 ページ） | 0 |
| CrUX / CrUX History | `PAGESPEED_API_KEY` か `CRUX_API_KEY` | 8 前後 | 0 |
| SerpApi | `SERPAPI_KEY` | 7 前後（キーワード 5 + `site:` + ブランド） | 1 回数円 |
| RDAP | 不要 | 1〜3 | 0 |
| Ahrefs / Open PageRank | `AHREFS_API_KEY` / `OPENPAGERANK_API_KEY` | 1〜3 | 0 |
| Search Console | 利用者の連携 | 12（当期・前期 × 6 次元） | 0 |
| GA4 Data API | 利用者の連携 | 10 | 0 |
| Anthropic | `ANTHROPIC_API_KEY` | 1〜4（やり直し含む） | 数十〜数百円 |
| OpenAI | `OPENAI_API_KEY` | 0〜1（任意） | 数十円 |

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
  PEX["プロンプト拡張"] -->|"PUT /api/geo/setup"| GEO["AI 検索モニタリング"]
  AIO["AIO 頻出トピック"] --> TP
  TP -->|"不足トピックをコピー"| PD["ページ診断"]
  TP -->|"不足トピックをコピー"| WR["AI ライティング"]
  PRJ --> RANK
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
| `analysis_runs` | 精密診断（入力・事実シート・サイト診断の全結果・AI の出力・セカンドオピニオン。月の回数もこの行数で数える） |

ブラウザ側のデータは設定画面から JSON でエクスポート / インポートできる（`exportAll` / `importAll`）。端末を変えると引き継げないのはこの③だけ。

---

## 6. 自動更新（Cron）と決済

```
Vercel Cron（vercel.json: "0 20 * * *" = 毎日 5:00 JST。Hobby プランは 2 本まで）
    │  Authorization: Bearer <CRON_SECRET> を Vercel が自動で付ける
    ↓
GET /api/cron/daily             ← ログインは無い。CRON_SECRET が未設定なら 503 で何もしない
    │  src/lib/jobs/schedule.ts が曜日・日付で振り分け、順に動かす（記録は cron_runs）
    ├─ 毎日      投稿の送信（gbp_posts の予約済み → Business Profile API。利用者の Google 権限）
    ├─ 月曜      マップ診断の一斉更新（Places で全店舗を取り直す。実費）→ meo_reports
    ├─ 火曜      順位計測（SerpApi。プランの上限まで）→ rank_snapshots。急落は notifyUser()
    ├─ 水曜      サイトの事故監視（自社サイトへのアクセスだけ）→ site_monitor_snapshots
    ├─ 毎月 1 日 月次レポート（保存済みの数字だけ。外部 API なし）→ monthly_reports + メール
    ├─ 毎月 2 日 掲載の再チェック（掲載ページを開いて店名・電話・住所を確認）→ listing_profiles.states
    └─ 毎日      精密診断の自動再診断（前回から 30 日たったサイトを 1 日 1 件。クロール + PSI + SerpApi）→ analysis_runs
GET /api/cron/geo-run           ← AI 検索モニタリングの日次（従来どおり別の 1 本）
GET /api/cron/maps-refresh      ← 旧パス。手動用に残す（vercel.json からは外した）

知らせ: notifyUser() → notifications テーブル（画面の「お知らせ」）→ 設定でメール ON かつ RESEND_API_KEY / MAIL_FROM があれば Resend で送る
```

```
お客様が /plans で購入
    ↓  POST /api/billing/checkout（STRIPE_SECRET_KEY / STRIPE_PRICE_LIGHT / _STANDARD / _PREMIUM）
Stripe の決済画面
    ↓  Webhook（STRIPE_WEBHOOK_SECRET で署名検証）
POST /api/billing/webhook → Clerk の publicMetadata.stripe を更新
    ↓
プラン判定（src/lib/plans/current.ts）: Stripe の契約状態 → publicMetadata.plan → DEFAULT_PLAN
```

決済の実体は Stripe だが、**契約状態は Clerk が持つ**のでアプリ側の DB は要らない。

プランは 3 段階（ライト / スタンダード / プレミアム）。プレミアムは料金画面から買えず、受注時に支払いリンクなどで契約を立てる運用なので、
`STRIPE_PRICE_PREMIUM` は「**買えるか**」ではなく「**読めるか**」のために登録する（`purchasablePlanIds()` と `planForPriceId()` の役割が違う）。

---

## 7. キーが切れたら何が止まるか

| キー | 止まるもの | 動き続けるもの |
|---|---|---|
| `ANTHROPIC_API_KEY` | AIO 頻出トピック・HP 改修提案・プロンプト拡張・AI ライティング・精密診断（Claude が必須） | 無料診断（FAQ だけ消える）・サイト診断（サマリーだけ消える）・キーワード調査（意図分類だけ消える）・maps（総評がルール生成に戻る） |
| `SERPAPI_KEY` | 順位計測・AIO 頻出トピック（→ 履歴が止まるのでサイトレポートの順位も伸びない） | ページ診断は Claude の Web 検索による推定に切り替わる。AI ライティングは上位分析なしで構成案を作る |
| `GOOGLE_PLACES_API_KEY` | 無料 MEO 診断・Google マップ（MEO）・毎週の一斉更新 | listings / replies は登録済みデータの閲覧のみ |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Google マップ（MEO）・口コミ支援・基本情報掲載・一斉更新 | それ以外すべて |
| `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` | 生成 AI 流入分析・サイトレポート（利用者が GA4 を連携していない場合） | 利用者が連携していれば②で動く |
| `PAGESPEED_API_KEY` | 実ユーザーの速度（CrUX）と、ドメインパワーの「実ユーザーの規模」（配点 10）。PSI 自体は未設定でも低頻度なら取れる | ページ最適化レポート（速度以外の項目はそのまま）・精密診断（速度の節が空になるだけ） |
| `AHREFS_API_KEY` | ドメインパワーの「外部からのリンクの評価」が Open PageRank に落ちる | それ以外すべて |
| `OPENPAGERANK_API_KEY` | 上記も無ければ配点 25 点分が分母から外れる（合計点は残り 75 点分で出る） | それ以外すべて |
| ~~`OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY`~~ | 使わない（2026-09-17 廃止） | — |
| `CRON_SECRET` | 毎週の一斉更新（503 で自分から止まる） | 手動の登録・診断 |
| `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ログインと、ログインが要る全ツール | 無料診断 2 本・規約・アンケート `/r/<slug>` |
| `STRIPE_*` | 購入と契約状態の同期 | `publicMetadata.plan` と `DEFAULT_PLAN` による手割り当て |
| （キーではない）利用者の Google 連携が未接続 | 検索パフォーマンス、口コミ返信の全件取得・投稿、**数字の診断の 126 ルール**（D05 だけが「必須データ不足」として出る） | 生成 AI 流入・サイトレポートは①のサービスアカウントに落ちて動く。精密診断の報告書も従来どおり完成する |

実費が出るキーには、キーとは別にガードがある。

| 実費 | ガード |
|---|---|
| Places（詳細取得 1 回 ≒ 4 円） | 無料 MEO 診断は IP ごとの回数制限 + 1 日の全体上限（`FREE_MEO_DAILY_LIMIT` 既定 500 / `FREE_MEO_DAILY_SEARCH_LIMIT` 既定 1,500。`0` で停止）。有料側はログイン必須 |
| SerpApi・各 LLM | ログイン必須 + プラン判定。公開しているのは無料診断の FAQ だけ（同じ URL と本文なら 1 時間キャッシュ） |
| クロール | `SITE_MAX_PAGES`（コードの既定 300・最大 1,000。本番は 100 に設定）。クイック診断だけ `FREE_SITE_MAX_PAGES`（代表 10 ページ）。社内ホストへのアクセスは `ALLOW_PRIVATE_HOSTS=1` のときだけ許す |
| 精密診断（AI + SerpApi） | 利用者ごとに月 `SEO_ANALYSIS_MONTHLY_LIMIT` 回（既定 10。**2026-09-21 から毎月の自動再診断も含めて数える**。運営者は無制限）。1 回の収集につき AI のやり直しは 3 回まで |
| **お客様カルテ（2026-09-21、r147）** | 上限は無い（外部 API を呼ばない。Supabase に 1 行書くだけ）。ただし**書かれた内容は AI のプロンプトに入る**ので、要約の長さに天井（1,800 字）を置き、運営者だけが読む 2 問（要望・過去の不満）は渡さない |
| **それ以外の有料機能（2026-09-21、r146）** | **月の回数上限**（`src/lib/usage/limits.ts`。記録は Supabase `usage_events`、判定は `takeUsage()`）。スタンダード: AI ライティング 30 回 / ページ診断 20 / HP 改修提案 20 / プロンプト拡張 10 / 手動の順位計測 300 検索 / サイテーション 10 / 検索パフォーマンス（推定）10 / NAP チェック 10 / 店舗の検索 100。プレミアムは 3 倍、運用者は無制限。**キャッシュに当たって外部 API を呼ばなかった分は数えない**。上限で 429（`code: "usage_limit"`）。残りは設定画面「今月の利用回数」。テーブルが無い・DB が落ちているときは**通す**（fail open。警告を 1 回ログに出す） |
| Cron | `CRON_SECRET`。未設定なら一斉更新そのものを無効化 |

### 切り分けの順番

1. `/settings` の「外部連携」で設定済み / 未設定を見る（= `GET /api/integrations`）。
2. 「設定済みなのに動かない」なら Vercel の環境変数を保存し直して **Redeploy**（環境変数は再デプロイまで反映されない）。
3. Google の①②が絡む画面（生成 AI 流入・サイトレポート）は、**どちらの認証で読んだか**（`source: "user" | "env"`）で切り分ける。
4. MEO 系が全滅なら Supabase、口コミ返信だけなら `business.manage` の権限追加を見る。

---

# お客様側にどれだけ作業が要るか（2026-09-17 追記）

上の表は「**運営者が**どのキーを入れると動くか」。こちらは「**お客様が**何をしないと使えないか」。
営業でどこまで即日出せるか、契約後の立ち上げに何日かかるかがここで決まる。

※9 2026-09-18 から、クイック診断はアカウント登録（担当者名・メール・会社名・電話・店舗の種類・パスワード）のあとに使う。回数は Clerk の `privateMetadata.freeRuns`（`src/lib/free/quota.ts`）。契約済みの人は入口でツールへ戻される。

## A. お客様の作業ゼロ（URL か店名を入れるだけ）

自前クローラ・公開情報・運営者の API キーだけで動く。**契約したその日に価値が出る。**

| ツール | 何で動くか |
|---|---|
| サイト診断（テクニカル SEO） | 自前クローラ |
| ページ診断（競合比較） | 自前クローラ + SerpApi + Claude |
| NAP チェック | 自前クローラ（自社サイト・掲載ページ）。Google マップは Places、掲載ページの発見は DataForSEO（Google 検索 2 回）。どちらも無くても自社サイトの確認は動く |
| サイテーション | DataForSEO（Google 検索 3 回） |
| HP 改修提案 | Claude |
| 順位計測・AI Overviews 引用 | SerpApi |
| プロンプト拡張 | Claude |
| キーワード調査 | 公開のサジェスト |
| AI ライティング | Claude |
| llms.txt 生成 | 自前クローラ |
| AI 検索モニタリング（GEO） | DataForSEO + Supabase |
| **Google マップ・店舗情報（MEO）** | Places API。**店名を入れるだけ**。お客様の Google 権限は不要（公開情報） |
| 口コミ支援（アンケート QR） | Supabase |
| 口コミへの返信（段階 1・返信案のコピー） | 公開の口コミ |
| 基本情報掲載（NAP） | Supabase |

## B. Google 連携を 1 回押すだけ（サイトには触らない）

| ツール | 前提 |
|---|---|
| **検索パフォーマンス（Search Console）** | **お客様が Search Console にそのドメインを登録し、所有確認を済ませていること。**済んでいれば連携を押すだけ。未登録なら DNS に TXT を 1 行（数分）。**GA4 より軽い** |
| 精密診断の GSC / GA4 の部分 | 連携があると厚くなる。無くても診断自体は出る |

## C. お客様のサイトに手を入れる必要がある（いちばん重い）

| ツール | 必要なこと |
|---|---|
| **生成 AI 流入分析** | **GA4 の計測タグをサイトに設置**し、データが貯まるのを待つ |
| **サイトレポート** | 同上。**さらに #96 の経路の問題があり、いまはお客様ごとの GA4 を読めない** |

**GA4 タグの設置はこのツールからはできない**（お客様のサイトの HTML に書くもので、こちらに書き込み権限が無い）。
できるのは「入っているかの判定」と「設置手順の提示」まで（#97 で提案中、未実装）。

## まとめ

- **ツール内で完結するのは A の 16 機能。**これがサービスの本体で、**Google 連携が 1 つも無くても売り物になる**。
- **GSC は「連携のみ」**。サイトには触らないので、お客様の負担は小さい。所有確認が済んでいれば数クリック。
- **GA4 だけが本当に重い。**サイトにタグを入れて、データが貯まるまで待つ必要がある。
- 立ち上げの案内は「**まず A を全部回す → GSC をつなぐ → GA4 は入っていれば繋ぐ、無ければ別途ご相談**」の順にすると、初日から価値が出る。
