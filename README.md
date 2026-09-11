# SEO Checker — 無料 SEO・MEO・AIO 診断 + SEO/LLMO ツール

URL を入れるだけで検索エンジンと AI 検索（AIO）に読まれる土台を採点する**無料診断（サイト）**、店名を入れるだけで Google マップの店舗情報を採点する**無料診断（MEO）**、そして SEO / AIO / MEO の運用に使う**ツール群**をひとつにまとめた Next.js アプリです。

左のサイドバーで両者を明確に分けています。無料診断はログインも API キーも不要で、そのまま報告書として PDF に出せます。ツール群は用途に応じて外部 API を設定して使います。

```bash
npm install
cp .env.example .env.local   # 使いたい機能に応じてキーを設定（無料診断は不要）
npm run dev                  # http://localhost:3000
```

---

## 無料 SEO・MEO・AIO 診断（`/` と `/meo`）

`/` はサイト（URL）の診断、`/meo` は Google マップの店舗（店名）の診断です。どちらもログイン不要（このほか、口コミ支援の来店客向けアンケート `/r/<slug>` もログイン不要）。`/meo` は Google Places に実費が出るため、IP ごとの回数制限と 1 日の全体上限（`FREE_MEO_DAILY_LIMIT`）で守っています（`src/lib/free/ratelimit.ts`）。有料の MEO（`/tools/maps`）との違いは、保存・競合比較・毎週の更新・AI 総評が無いことです。

### サイトの診断（`/`）

見込み顧客にそのまま渡せる報告書を出すことを目的にした、**API 費用ゼロ**の診断です。判定はすべてルールベースで、生成 AI は使っていません（想定 FAQ の生成のみ任意で AI を使います）。

### 2 つの診断範囲

| 範囲 | 対象 |
|---|---|
| このページ | 入力した URL 1 ページ |
| サイト全体（全ページ） | sitemap（索引の再帰展開）と内部リンクの幅優先探索で**サイトの全ページ**を収集して診断 |

サイト全体モードは進捗を配信しながらクロールし、取得数 / 発見数・現在の URL・経過時間を表示します。途中で中止できます。上限は `SITE_MAX_PAGES`（既定 300、最大 1000）と時間予算で制御します。

### レポートの構成

表紙（サイト名・対象 URL・診断範囲・日時・所要時間・診断ページ数・グレード印）に続いて

1. **総合評価** — ドーナツ、A〜E のグレード、3 行の講評、優先改善 TOP3（見込み効果つき）、判定数の内訳
2. **カテゴリ別スコア** — 横棒グラフ（50 / 80 の目盛）と配点・最低〜最高の表
3. **判定の内訳とページ別スコア分布** — ドーナツとヒストグラム
4. **ページ × カテゴリ 一覧** — スコアで色分けしたヒートテーブル（低い順）※サイト全体モードのみ
5. **改善提案** — 全ページ共通の問題 / ページによって差がある項目
6. **想定 FAQ** — 本文から AI が下書きし、承認したものを FAQPage の JSON-LD と HTML に変換 ※ページモードのみ
7. **付録** — 診断ページ一覧、配点と判定基準、クロール統計

講評と優先度は `src/lib/report/summary.ts` の純関数で導出しています（生成 AI 不使用）。

### 採点

| カテゴリ | 重み | 見るもの |
|---|---|---|
| AI クローラ可否 | 20 | robots.txt での**検索用**クローラ（OAI-SearchBot / PerplexityBot / Claude-SearchBot など）の可否、noindex |
| 構造化データ | 25 | JSON-LD の有無と文法、Organization / BreadcrumbList / sameAs、WebSite（トップのみ）、FAQPage（FAQ のあるページのみ） |
| メタ情報 | 20 | title、meta description（長さ）、OGP、canonical、lang |
| 見出し | 15 | h1 がちょうど 1 つか、h2 / h3 の階層が飛んでいないか |
| コンテンツ | 20 | 具体的な情報（数値・日付・組織名・連絡先）の含有、見出しに本文が伴うか、画像の alt、JS 描画依存（SPA）の疑い |

各項目は pass（満点）/ warn（半分）/ fail（0 点）で採点し、info は採点対象外です。配点は `src/lib/analyzer/types.ts` の `CATEGORY_WEIGHTS` と各 `check({ weight })` で変えられます。

**採点しないもの**（状態は参考として表示します）:

- **本文の文字数** — Google は推奨文字数を持たないと明言しています。長さではなく具体的な事実が書かれているかで判定します
- **llms.txt / llms-full.txt** — 提案段階の仕様で、読み取りを表明した主要な AI クローラはまだありません
- **学習用 AI クローラ**（GPTBot / ClaudeBot / Google-Extended / CCBot など）の拒否 — 各社が認めている正式な運用で、AI 検索での引用は減りません
- **SearchAction** — Google がサイトリンク検索ボックスの提供を終了しています
- そのページに当てはまらない項目 — FAQ の無いページの FAQPage、下層ページの WebSite

スコアはこのツール独自の技術チェック表の達成率です。検索順位・流入・AI の回答への引用を測るものではなく、それらを予測するものでもありません。

**配点はページ間で必ず揃えます。** 該当しないページでは項目を省かず `pass` として出します（`image-alt` / `js-rendering` / `jsonld-parse-error` / `jsonld-website` / `jsonld-faq`）。省くとカテゴリの分母がページごとに変わり、レポートの「改善するとこうなる」の見込み加点が実際の伸びとずれるためです。

### サービス資料

無料診断の画面に「サービス資料をダウンロード」ボタンを置いています（フォームの下と、レポート末尾の「次のステップ」）。

**資料の中身は機能レジストリと料金プランから組み立てます**（`src/components/free/ServiceGuide.tsx`）。手書きの PDF を置くと、機能や価格を変えたときに資料だけ古いまま残るためです。ボタンを押すとレポートと同じ仕組み（html2canvas + jsPDF）でその場で PDF になります。

デザイン済みの資料をお持ちの場合は、`public/` に置いて `NEXT_PUBLIC_SERVICE_GUIDE_URL=/service-guide.pdf` を設定すると、そちらへのリンクに切り替わります。

### 出力

- **PDF でダウンロード** — 画面をブラウザ内で A4 の PDF にします（画像なので文字は選択できません）
- **印刷** — 印刷ダイアログから「PDF に保存」を選ぶと、文字を選択・検索できる PDF になります

---

## ツール（`/tools/*`）

競合ツールの機能調査（`docs/reference/`）をもとに実装した 12 種です。各ツールの見出しには機能カタログの ID（A1 / B4 など）を表示しています。

### 診断

| ツール | ID | 内容 | 必要なキー |
|---|---|---|---|
| [サイト診断（テクニカル SEO）](src/lib/audit) | A1 | 全ページをクロールし、約 45 のルールで課題を検出。10 カテゴリの件数、前回との差分、CSV 出力 | 不要（要約のみ任意で AI） |
| [ページ最適化レポート](src/lib/page-report) | A2 / A3 | 1 URL の AI フレンドリー度を 0〜100 で採点。項目ごとの測定値・理由・改善提案。AI クローラの robots.txt 判定。表示速度と Core Web Vitals | 不要（PSI は任意） |
| [HP 改修提案（AI 最適化）](src/lib/improvement) | A2 / D2 | URL を入れてボタン一つで、診断結果をもとに**そのまま貼って使える改修案**を before → after で生成。タイトル・説明文・見出し・本文・構造化データ・alt が対象。提案ごとに理由・期待できること・優先度・手間を表示 | Anthropic |
| [ページ診断](src/lib/page-diagnosis) | A4 | 対策キーワードの上位 10 件と自社ページを比較し、検索意図・不足要素・title / description 案を提案。診断結果を踏まえたチャット | SerpApi または Anthropic |
| [AIO 頻出トピック](src/lib/aio-topics) | A5 | AI Overviews の本文からトピックを抽出し、出現割合・傾向・優先度と自社の不足トピックを表示 | SerpApi + Anthropic |

### 計測

| ツール | ID | 内容 | 必要なキー |
|---|---|---|---|
| [順位計測・AI Overviews 引用](src/lib/rank) | B1-B3 | 登録キーワードの順位・変化・ランディング URL、その場で測るリアルタイム計測、AI Overviews の引用を 5 区分（自社のみ / 競合のみ / 両方 / なし / AIO 表示なし）で集計 | SerpApi |
| [LLMO モニタリング・LLM リサーチ](src/lib/llmo) | B4 / B8 | 登録プロンプトを複数の LLM に投げ、ブランド言及率・ドメイン引用率・回答原文・引用元を記録。LLM が内部で発行した検索クエリ（ファンアウト）も保存 | Anthropic（OpenAI / Gemini / Perplexity は任意） |
| [プロンプト拡張](src/lib/llmo) | B7 | 参考プロンプトと対象サイトから、関連プロンプトをカテゴリ付きで 50 本程度生成 | Anthropic |
| [検索パフォーマンス](src/lib/google/search-console) | — | 連携した Search Console から、クリック数・表示回数・CTR・平均掲載順位を期間比較つきで取得。日別の推移と、クリックの多いクエリ・ページの一覧。推定ではなく Google の実測値 | Google 連携（利用者ごと） |
| [Google マップ・店舗情報（MEO）](src/lib/maps) | — | 店名・地域で検索して自社 1 件と競合を最大 5 件選ぶ。自社のビジネス プロフィールを基本情報 / 投稿 / 写真 / レビューの 4 カテゴリ・21 項目で採点した診断報告書（総合評価 A〜E、総評、口コミ情報、PDF 出力）を作成。総評は `ANTHROPIC_API_KEY` があれば AI が執筆。オーナー権限が要る項目は「未取得」として採点から外し、Business Profile 連携後に埋まる。自社の店舗と競合を登録すると、登録直後に 1 回、その後は毎週月曜 5:00 に一斉更新して履歴に保存（手動の取り直しは不可）。最新診断結果と前回との差分、競合との比較表 | Places API (New) + Supabase（総評は Anthropic 任意。一斉更新は `CRON_SECRET`） |
| [口コミ支援（アンケート QR）](src/lib/reviews) | — | 店内の QR コード（店舗別・テーブル別・スタッフ別に複数発行）から来店客がログイン不要のアンケート（`/r/<slug>`）に答える。回答をもとに AI が口コミの下書きを作り（トーンと含めたい語は店舗が設定）、来店客が自由に編集して「Google マップに投稿する」から自分の意思で投稿する。投稿ボタンは評価に関係なく全員に同じ。低評価のときは「お店に直接伝える」を並べて出す（隠さない）。回答・下書き・投稿時の本文は店舗がすべて閲覧でき、低評価と直接連絡は先頭に並ぶ。対応状態とメモ、経路別・週別の集計、投稿ボタンの押下率（Google 側の実投稿数は取れないため近似）、CSV | Supabase（下書きは Anthropic 任意。無ければ回答をそのまま並べる） |
| [生成 AI 流入分析](src/lib/ai-traffic) | B6 | GA4 の参照元から生成 AI の流入を切り出し、AI 検索率（対総セッション / 対自然検索）、サービス別内訳、ページ × 流入元 × キーイベント | GA4（利用者ごとの Google 連携でも可） |
| [サイトレポート](src/lib/site-report) | E8 | GA4 の KPI の前期比、チャネル別流入と登録キーワードの平均順位・ファインダビリティスコア、自社・競合の最新順位表 | GA4（利用者ごとの Google 連携でも可）+ SerpApi |

### 調査・生成

| ツール | ID | 内容 | 必要なキー |
|---|---|---|---|
| [キーワード調査](src/lib/keywords) | C1 | Google サジェスト・関連キーワードの展開と検索意図の分類 | 不要（意図分類のみ任意で AI） |
| [AI ライティング・エディター](src/lib/writing) | D1-D4 | 構成案 → 本文のストリーミング生成、企画書モード（PDF 添付可）、範囲選択リライトと差分、ファクト / コピペ / 薬機法チェック | Anthropic（薬機法チェックは辞書のみで動作） |
| [llms.txt 生成](src/lib/llms-txt) | D6 | 6 ステップのウィザードで llms.txt を生成。既存 llms.txt の検証 | 不要 |

### 設定（`/settings`）

プロジェクト（ドメイン）と競合の登録、外部連携の設定状況、データの JSON エクスポート / インポート。

**キーが未設定のツールは、必要な環境変数を明示したうえで実行操作だけを無効化します。** 画面の説明や登録済みデータの閲覧はそのまま使えます。存在しないデータを補って表示することはしません。

---

## 料金プラン

| プラン | 月額 | 内容 |
|---|---:|---|
| **無料診断** | 0 円 | 無料 SEO・AIO 診断（`/`）と無料 MEO 診断（`/meo`、店舗 1 件）。ログイン不要 |
| **オールインワン** | 9,800 円 | SEO・AIO・MEO のすべてのツールと、**AI が成果物を作る**ツール（HP 改修提案・AI ライティング・llms.txt 生成）。使わない機能があれば機能ごとに 3,000 円引きで個別対応 |

売るのは「オールインワン」1 つです（2026-09-11 決定）。内部では機能ごとに `standard`（測る・調べる）/ `pro`（AI が作る）の 2 段階を持ったままで、オールインワン = `pro` が両方を含みます。`standard` は販売せず、割引の個別対応（運用者が Clerk の `publicMetadata.plan` に割り当てる）に残しています。定義は `src/lib/plans/catalog.ts` と、機能ごとの `plan` フィールド（`src/lib/features/registry.ts`）の 2 か所だけにあり、`src/lib/plans/__tests__/plans.test.ts` が対応表を固定しています。

### プランの決まり方

上から順に見て、最初に決まったものを使います。

1. **ログインが未設定** … すべて `pro` 扱い（開発・E2E で全機能を開けたままにするため）
2. **Clerk Billing の契約プラン** … 決済を有効にすると `has({ plan })` が効きます
3. **Clerk の `publicMetadata.plan`** … 決済を入れる前に、運用者がダッシュボードで `"free"` / `"standard"` / `"pro"` を割り当てます
4. **`DEFAULT_PLAN` 環境変数** … 全員へ一律で開放したいとき
5. どれも無ければ `free`

### 決済（Clerk Billing / Stripe）

カード決済は **Clerk Billing** で行います。決済の実体は Stripe ですが、契約状態は Clerk が持つため、**ここでもデータベースは要りません**。

準備は 1 回だけです。

1. Clerk ダッシュボード → **「請求する」(Billing)** を開き、**Stripe アカウントを接続**する（無ければその場で作れます）
2. プランを 2 つ作る。**スラッグ（slug）は必ず `standard` と `pro`** にする
   - `pro` … 月額 9,800 円（オールインワン。Clerk で作るのはこれだけ）
   - `standard` … 販売しない（割引の個別対応は `publicMetadata.plan` で）
3. `NEXT_PUBLIC_CLERK_BILLING_ENABLED=1` を設定して再起動（Vercel なら環境変数に足して Redeploy）

スラッグは `src/lib/plans/catalog.ts` の `clerkPlan`（`user:standard` / `user:pro`）と一致している必要があります。ずれると**決済は通ったのに機能が開かない**ので、`plans.test.ts` で `user:<プラン id>` の形を固定しています。

`NEXT_PUBLIC_CLERK_BILLING_ENABLED=1` のときだけ、`/plans` に Clerk の料金表（購入・変更・解約）が出ます（`src/components/plans/BillingTable.tsx`）。未設定なら料金表は出ず、案内文が「プラン変更は運用者までご連絡ください」に変わり、上の 3（`publicMetadata.plan`）を手で割り当てる運用になります。

> **費用の注意**: Clerk Billing を使うと、Stripe の決済手数料に加えて **Clerk 側の手数料**がかかります。料率と、利用に必要な Clerk のプランは変わることがあるので、Clerk ダッシュボードの「請求する」画面か Clerk の料金ページで最新を確認してください。手数料を抑えたい場合は Clerk Billing を使わず、Stripe を直接組み込む形にもできます（その場合はこの変数を未設定のままにします）。

### バージョン（マージ回数）

`main` へマージした回数がそのままバージョンです（`r10` のように表示）。マスター画面の一番上で確認できます。

**カウンタは持たず、`src/lib/release/releases.json` の件数がバージョンになります。** 数値と履歴を別々に持つと、片方の更新を忘れたときに静かにずれるためです。番号もファイルには書かず、並び順から振ります。

マージのあとに 1 件足します:

```bash
node scripts/add-release.mjs "入れた内容の 1 行説明"
```

`HEAD` のコミットと日付をそのまま記録するので、`main` を早送りしたあとに実行してください。同じコミットを二度記録しようとしても増えません。

マスター画面には「リリース時点のコミット」と「いま動いているコミット」を並べて出します（後者は Vercel の `VERCEL_GIT_COMMIT_SHA`）。**マージしたのに本番へ出ていない**、という状態をここで見分けられます。記録用のコミット 1 つ分は常にずれるので、一致・不一致の判定はしていません。

### マスター画面（`/admin`）

運用者だけが開ける画面です。顧客ごとに次を確認・操作できます。

| 見えるもの | 出どころ |
|---|---|
| 契約状況（契約中 / 無料トライアル / 支払い遅延 / 解約手続き済み / 契約なし） | Clerk Billing |
| 月額（割引後）と割引前の額 | Clerk Billing の次回請求 |
| クーポン（名称・コード・割引率または割引額・残り回数） | Clerk Billing の割引 |
| 次回請求日・登録日・最終利用日 | Clerk |
| **機能の個別開放（チェックボックス）** | Clerk の `publicMetadata.featureOverrides` |

**入れるのは `ADMIN_EMAILS` に書いたメールアドレスの人だけです。** 未設定なら誰も入れません。判定に使うのは Clerk 側で確認済みのアドレスだけで、未確認のアドレスは通しません（管理者のアドレスで登録するだけで入れてしまうため）。管理者でないときは 403 ではなく **404** を返します（画面の存在自体を教えないため）。

**機能の個別開放**は、プランで使えるものに**足す**だけで、塞ぐことはできません。「スタンダード契約のお客様に HP 改修提案だけ試してもらう」といった使い方を想定しています。逆向き（払っているのに使えない）を作れると事故のほうが高くつくため、実装として持ちません。開放した機能はサイドバーの鍵が外れ、API のプラン判定（402）も通るようになります。

レジストリ（`src/lib/features/registry.ts`）に機能を足すと、マスター画面のチェックボックスも自動で増えます。

> Clerk の Billing API は公開ベータで、返る形が変わることがあります。壊れた値で画面が落ちないよう、金額と契約状況のパーサは「例外を投げず、読めない値は空にする」方針で書いてあります（`src/lib/admin/billing.ts`）。

### 二重に守っています

- **API**: 各ルートの `requireAuth({ feature: "..." })` が、ログイン確認のあとに機能のプランを確認し、足りなければ **402 Payment Required** を返します。プラン名をルート側に書き写さず機能 ID から引くので、レジストリとずれません
- **画面**: 各ツールページを `<PlanGate featureId="...">` で包み、足りなければ案内に差し替えます
- **サイドバー**: 使えないツールには必要プラン名のバッジが付きます

---

## HP 改修提案の使われ方

想定している流れです。**このツールはお客様のサイトを書き換えません。**

1. 運用者が対象ページの URL を入れて「改修案を作る」を押す
2. AI が診断結果とページの内容を読み、そのまま貼って使える改修案を before → after で出す
3. 運用者はその内容を読み上げて、お客様に説明する
4. お客様は画面（または PDF）で内容を確認する。反映したい場合は運用者に連絡し、**反映は運用者が行う**

そのため after には必ず完成した文字列が入ります（「〜を検討してください」で終わらせません）。一方で AI にページに無い事実を作らせないよう、数値や固有名詞を入れたい箇所は `〇〇件` のような伏せ字にして、確認を促す形にしています。

1 回につき 1 ページを対象にします。サイト全体を一括で回すと Anthropic の実費と実行時間が読めなくなるためです。同じ URL は 30 分キャッシュし、「作り直す」を押したときだけ再生成します。

---

## ログイン（Clerk）

| 範囲 | ログイン | 中身 |
|---|---|---|
| `/`、`POST /api/analyze`、`POST /api/site`、`POST /api/faq` | **不要** | 無料 AIO 診断。見込み顧客に試してもらう入口なので公開のまま |
| `/terms`、`/privacy` | **不要** | 利用規約・プライバシーポリシー。登録前に読めるよう公開。運営者名・連絡先は `src/lib/legal/operator.ts`。プライバシーポリシーの内容は `docs/dev/services.md` の「データの置き場所」と一致させること |
| `/tools/*`、`/settings`、上記以外の API すべて | **必要** | 外部 API の実費が出るため |

公開範囲の定義は `src/lib/auth/routes.ts` の 1 か所だけにあり、`src/lib/auth/__tests__/routes.test.ts` が固定しています。

**二重に守っています。** 入口は `src/proxy.ts`（Next.js 16 で `middleware.ts` から改名された Proxy）で、各 API ルートの先頭でも `requireAuth()` を呼びます。Next.js のドキュメントが「マッチャの変更やルートの移動で Proxy のカバーが静かに外れることがあるため、認証はハンドラ内でも検証すること」と明記しているためです。

**キーが未設定なら認証は無効**になり、すべてが今までどおり開きます。開発と E2E ではキーを置かないのでこれが正常な状態ですが、本番で未設定のまま起動すると警告をログに出します。

セットアップ:

1. Clerk でアプリケーションを作り、API Keys から `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` と `CLERK_SECRET_KEY` を `.env.local` に入れる
2. **Clerk の Restrictions で招待制か許可リストにする。** 既定では誰でも登録でき、登録した人はそのまま実費の出るツールを使えます
3. サーバーを再起動する

---

## Google 連携（Search Console / GA4）

**利用者ごと**に Google アカウントを接続し、見る対象を選びます。管理者が全員分をまとめて設定するのではなく、ログインした人が自分の設定画面から接続します。

> Google Cloud・Clerk・アプリの 3 者がどう分担しているかは [docs/dev/services.md](docs/dev/services.md) に図でまとめています。

利用者向けの手順（別の Google アカウントで運用中のサイト・プロパティに閲覧権限を付ける方法、未登録のときの登録手順）は、設定画面の Google 連携カード内の「**設定手順書**」に載せています（`src/components/google/GoogleSetupManual.tsx`）。実際には制作会社や会社の共有アカウントで運用しているケースが多く、その場合は登録ではなく権限付与だけで済みます。

| 使うもの | どこで選ぶ | 何に使うか |
|---|---|---|
| Search Console のサイト | 設定 → Google 連携 | 検索パフォーマンス画面 |
| GA4 のプロパティ | 設定 → Google 連携 | 生成 AI 流入分析、サイトレポート |

**データベースは要りません。** アクセストークンは Clerk が保持・更新し（`getUserOauthAccessToken`）、選んだサイト / プロパティは Clerk の `privateMetadata` に入ります（`src/lib/google/settings.ts`）。要求するのは読み取り専用スコープ（`webmasters.readonly` / `analytics.readonly`）だけで、接続時にアプリ側から要求するので Clerk のダッシュボードでスコープを足す必要はありません。

GA4 は**ユーザーの選択が優先**され、選ばれていなければ従来どおり環境変数のサービスアカウント（全体共通）に落ちます（`src/lib/google/ga4.ts`）。Google 連携を使わない運用のままでも壊れません。

準備（1 回だけ、`.env.example` にも同じ手順があります）:

1. Google Cloud で OAuth 2.0 クライアント ID（ウェブ）を作る
2. Search Console API・Google Analytics Admin API・Google Analytics Data API を有効にする
3. Clerk の SSO Connections → Google を独自クレデンシャルに切り替え、1 の値を入れる
4. Google 側の「承認済みのリダイレクト URI」に Clerk が示す URI を追加する

---

## 環境変数

無料診断はどれも不要です。

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | ログイン（両方そろったときだけ有効。未設定なら認証しない） |
| `ANTHROPIC_API_KEY` | FAQ 生成、各種サマリー、LLMO（Claude）、プロンプト拡張、AI ライティング |
| `LLM_MODEL` | 分析・生成のモデル（既定 `claude-opus-5`） |
| `LLM_FAST_MODEL` | 分類など大量処理のモデル（既定 `claude-haiku-4-5`） |
| `FAQ_MODEL` | FAQ 生成のモデル（既定 `claude-haiku-4-5`） |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY` | LLMO モニタリングの対象を増やす |
| `SERPAPI_KEY` | 順位計測、AI Overviews の引用チェック、ページ診断の上位 10 件 |
| `PAGESPEED_API_KEY` | PageSpeed Insights（未設定でも低頻度なら動作） |
| `GOOGLE_PLACES_API_KEY` | Google マップ・店舗情報（MEO）。Places API (New) 専用に制限したキー。請求先アカウントが必要（無料枠あり） |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | MEO の登録店舗と診断報告書の履歴（Supabase）。テーブルは `docs/dev/OPERATIONS.md` の SQL |
| `REVIEW_DRAFT_MODEL` | 口コミ支援の AI 下書きのモデル（既定は `LLM_FAST_MODEL` = `claude-haiku-4-5`） |
| `REVIEW_FORM_DAILY_LIMIT` / `REVIEW_AI_DAILY_LIMIT` | 口コミ支援: アンケート 1 つあたりの 1 日の回答数（既定 500）と、AI 下書きの 1 日の全体上限（既定 2,000。超えたら回答は受け付け、下書きは回答をそのまま並べる） |
| `CRON_SECRET` | 毎週月曜 5:00 の一斉更新（`vercel.json` の Cron → `/api/cron/maps-refresh`）。未設定なら一斉更新は動かない |
| `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` | 生成 AI 流入分析、サイトレポート（利用者が GA4 を連携していないときのフォールバック） |
| `DEFAULT_PLAN` | 既定の料金プラン（`free` / `standard` / `pro`）。未設定なら `free` |
| `NEXT_PUBLIC_CLERK_BILLING_ENABLED` | `1` のとき `/plans` に Clerk Billing（Stripe）の料金表を出す |
| `ADMIN_EMAILS` | マスター画面（`/admin`）を開けるメールアドレス。未設定なら誰も入れない |
| `SITE_MAX_PAGES` | クロール上限（既定 300、最大 1000） |
| `NEXT_PUBLIC_SERVICE_GUIDE_URL` | サービス資料の配布ファイル。未設定ならアプリが資料を組み立てて PDF にする |
| `ALLOW_PRIVATE_HOSTS` | 開発時のみ。localhost / LAN 内を診断可能にする。**本番では設定しない** |

キーはすべてサーバー側でのみ読み、ブラウザには渡しません。画面が知るのは「設定されているか」の真偽値だけです（`GET /api/integrations`）。

---

## コマンド

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド
npm run start      # 本番サーバー
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # vitest
```

E2E スモーク（ダミーサイトを立てて無料診断を実行し、スクリーンショットと PDF を出力）:

```bash
node scripts/e2e/dummy-site.mjs --print-expected   # 診断されるはずのページ一覧
node scripts/e2e/free-smoke.mjs                    # ダミーサイト + dev サーバーを起動して検証
```

アイコン（favicon・ホーム画面・PWA）を作り直す。元は `src/app/icon.svg` の 1 枚だけで、
形を変えたときにこれを実行します（生成物はリポジトリに入れてあります）:

```bash
node scripts/generate-icons.mjs
```

`main` へマージしたあと、リリース履歴に 1 件足す（バージョンが 1 つ上がります）:

```bash
node scripts/add-release.mjs "入れた内容の 1 行説明"
```

---

## 構成

```
src/
  app/
    page.tsx                  # 無料診断
    tools/<id>/page.tsx       # 各ツール（Server Component。PageHeader + クライアント画面）
    settings/                 # プロジェクト・競合・外部連携
    api/                      # Route Handler（nodejs runtime）
  components/
    shell/                    # AppShell / Sidebar / TopBar
    ui/                       # Card / PageHeader / Button / DataTable / SetupNotice など
    charts/                   # 依存なしの SVG（Donut / HBar / Pie / Histogram / StackedBar / Sparkline / HeatCell）
    free/                     # 無料診断のレポート
    <tool>/                   # 各ツールの画面
  lib/
    analyzer/                 # 無料診断の判定ルール（fetch.ts の assertPublicHost + fetchText が唯一の取得経路）
    crawl/                    # 全ページクロール（sitemap 展開 + 内部リンク BFS）
    report/                   # レポートの導出（グレード・講評・優先改善）
    audit/ page-report/ rank/ llmo/ keywords/ writing/ ga4/ ...   # 各ツールのロジック
    ui/                       # 色トークンの単一定義（palette.ts / grade.ts）
    features/registry.ts      # サイドバーと機能の定義
    store/                    # localStorage への保存（zod で検証）
    llm/ serp/ export/ tools/ # 共通の外部連携・CSV・API 実行フック
marketing/                    # 紹介サイト seo-checker.tokyo（静的 HTML 1 枚。Cloudflare Workers が配信）
  public/index.html           # ページの実体
  wrangler.jsonc              # Worker 名 seo-checker-hp。Cloudflare の Root directory は marketing
docs/
  reference/                  # 競合ツールの機能調査と実装ガイド
  dev/                        # 設計仕様・Next.js / UI の開発メモ
    services.md               # 外部サービス（Vercel / Clerk / Cloudflare / Google）の関係とデータの置き場所
scripts/e2e/                  # ダミーサイトとスモークテスト
```

---

## 設計上の約束

- **ユーザーが入れた URL をサーバーで取得するときは、必ず `assertPublicHost` → `fetchText`（`src/lib/analyzer/fetch.ts`）を通す。** リダイレクトは自分で追い、初回のホップを含めて毎回ホストを検査します（SSRF 対策）。
- **色は `src/lib/ui/palette.ts` と `globals.css` の `@theme` トークンだけ**から取ります。JSX に生の hex は書きません。
- **データを捏造しない。** 測れなかった項目は「未取得」として扱い、0 や「なし」と混同しません。推定値は推定と明示します。
- **第三者のページ本文やアップロードされた PDF をプロンプトに入れるときは、区切ってデータとして扱うよう明示します**（プロンプトインジェクション対策）。
- 判定ロジックは純関数として `src/lib/**` に置き、`__tests__` でテストします。

## 既知の制限

- **JavaScript で描画されるページ（SPA）** は取得した HTML に本文が無いため低スコアになります。ヘッドレスブラウザによる取得は未実装で、代わりに「JS 描画依存の可能性」として警告を出します。
- **キャッシュはプロセス内**です。サーバーレスではインスタンスごとに独立します。
- **登録データはブラウザの localStorage** に保存します。サーバー側の DB はありません。設定画面から JSON で書き出せます。
- **認証・利用回数の制限は未実装**です。公開運用するときは AI を使う API の手前に認証と制限を入れてください。
- **薬機法チェックは目安**であり、法令上の適合性を保証するものではありません。
- 対象サイトには `SEOChecker/0.1` の User-Agent でアクセスします。
