# SEO Checker — 無料 SEO・MEO・AIO 診断 + SEO/LLMO ツール

URL を入れるだけで検索エンジンと AI 検索（AIO）に読まれる土台を採点する**クイック診断（サイト・無料）**、店名を入れるだけで Google マップの店舗情報を採点する**クイック診断（店舗・MEO・無料）**、そして SEO / AIO / MEO の運用に使う**ツール群**をひとつにまとめた Next.js アプリです。

左のサイドバーで両者を明確に分けています。クイック診断はログインも API キーも不要で、そのまま報告書として PDF に出せます。ツール群は用途に応じて外部 API を設定して使います。

```bash
npm install
cp .env.example .env.local   # 使いたい機能に応じてキーを設定（クイック診断は不要）
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
7. **付録** — 診断ページ一覧、採点対象外のページ、配点と判定基準、クロール統計

講評と優先度は `src/lib/report/summary.ts` の純関数で導出しています（生成 AI 不使用）。

### 採点

| カテゴリ | 重み | 見るもの |
|---|---|---|
| AI クローラ可否 | 20 | robots.txt での**検索用**クローラ（OAI-SearchBot / PerplexityBot / Claude-SearchBot など）の可否、noindex（どちらも、もともと検索に載せないページを除く） |
| 構造化データ | 25 | JSON-LD の有無と文法、Organization / sameAs、BreadcrumbList（下層ページのみ）、WebSite（トップのみ）、FAQPage（FAQ のあるページのみ） |
| メタ情報 | 20 | title、meta description（長さ）、OGP、canonical、lang |
| 見出し | 15 | h1 がちょうど 1 つか、h2 / h3 の階層が飛んでいないか |
| コンテンツ | 20 | 具体的な情報（数値・日付・組織名・連絡先）を含む文の割合（ページの言語に合わせて文を数えます）、見出しに本文が伴うか、画像の alt、JS 描画依存（SPA）の疑い |

各項目は pass（満点）/ warn（半分）/ fail（0 点）で採点し、info は採点対象外です。配点は `src/lib/analyzer/types.ts` の `CATEGORY_WEIGHTS` と各 `check({ weight })` で変えられます。

**「具体的な情報」の数え方**（`src/lib/analyzer/sentences.ts` / `language.ts`）:

1. ページを段落・リスト項目・表のセル・見出しなどのブロックに分ける。
2. **ブロックごとに言語を判定する**（`<html lang>` と要素の `lang` 属性 → 無ければ、かな・漢字の割合で推定）。1 ページに日本語と英語が混在していても、ブロック単位で切り替わります。
3. 言語に合わせて文に割る。日本語は句点（`。！？`）、英語などはピリオド（`. ! ?`）＋空白／行末。英語では**略語（Inc. / Ltd. / U.S. / e.g. / No. / Mr.）・小数と桁区切り（1.5 / 33,000）・URL・メールアドレス・頭字語（A.I.）では切りません**。リスト項目・表のセル・見出しは、句読点が無くてもそれぞれ 1 文として数えます（箇条書き主体のページが「全 1 文」にならないように）。
4. 文ごとに事実の手がかりを探す。半角・全角の数値、通貨（円 / ¥ / yen / JPY / $）、和暦と英語表記の日付（2024 年 11 月 6 日 / November 6, 2024 / 2026-04-18）、法人格（株式会社 / Inc. / Co., Ltd.）、電話・メール・URL・郵便番号・時刻、割合（%）、単位（名 / 店舗 / 件 / stores / people など）、6 桁以上の識別番号（法人番号など）。
5. **文が 5 文未満のページは割合で判定しません。**「1 文中 1 文 = 100%」のように比率が跳ねるだけで改善の指標にならないためです。この場合は事実を含む文が 2 文以上あるかだけで判定します。どちらの基準で判定したか・判定に使った言語・数えた文の総数・事実と判定した文の実例は、レポートの根拠欄に出します。

**採点しないもの**（状態は参考として表示します）:

- **本文の文字数** — Google は推奨文字数を持たないと明言しています。長さではなく具体的な事実が書かれているかで判定します
- **llms.txt / llms-full.txt** — 提案段階の仕様で、読み取りを表明した主要な AI クローラはまだありません
- **学習用 AI クローラ**（GPTBot / ClaudeBot / Google-Extended / CCBot など）の拒否 — 各社が認めている正式な運用で、AI 検索での引用は減りません
- **SearchAction** — Google がサイトリンク検索ボックスの提供を終了しています
- そのページに当てはまらない項目 — FAQ の無いページの FAQPage、下層ページの WebSite、トップページのパンくず（階層の最上位なので「ホーム」1 件だけの BreadcrumbList は位置を何も伝えません）
- **もともと検索に載せないページを止めている設定** — サイト内検索の結果・買い物かご・ログイン後の画面・送信完了・印刷用ページ。ここでの noindex と robots.txt の Disallow はどちらも正しい設定で、外させると中身の薄いページが大量に登録されます（判定は `src/lib/analyzer/page-kind.ts`）。ただし**サイト全体が拒否されている（`Disallow: /`）ときは減点します** — トップページも拒否されているかどうかで見分けます
- **検索に載せないページそのもの**（サイト全体モード） — 上のページが実際に noindex か robots.txt で検索から外されている場合、そのページは診断はしますが**採点対象外（参考）**にし、平均点・項目の集計・ページ一覧に含めません（付録 A に URL・用途・外し方を載せます）。`/search` に説明文が無いのは当然で、それを未対応と数えるとサイトの平均点が意味なく下がるためです。単体で診断したときは「採点は参考」と注記します

スコアはこのツール独自の技術チェック表の達成率です。検索順位・流入・AI の回答への引用を測るものではなく、それらを予測するものでもありません。

**配点はページ間で必ず揃えます。** 該当しないページでは項目を省かず `pass` として出します（`image-alt` / `js-rendering` / `jsonld-parse-error` / `jsonld-website` / `jsonld-breadcrumb` / `jsonld-faq` / `noindex` / `ai-crawlers-allowed`）。省くとカテゴリの分母がページごとに変わり、レポートの「改善するとこうなる」の見込み加点が実際の伸びとずれるためです。

### サービス資料

クイック診断の画面に「サービス資料をダウンロード」ボタンを置いています（フォームの下と、レポート末尾の「次のステップ」）。

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
| [精密診断](src/lib/seo-analysis) | — | URL だけで、サイト全体のクロール（48 ルール・構成・信頼）・トップの採点・主要 6 ページの PageSpeed と CrUX（実ユーザーの速度と 40 週の推移）・対策キーワードの順位と `site:` 件数・**ドメインパワー（推定）**・**llms.txt の有無と中身**・Search Console / GA4（連携済みなら）を 1 枚の**事実シート**（1 行 1 事実、ID つき）にまとめ、AI（Claude）がその数字だけを根拠に、結論・現状分析・強みと弱み・優先順位つきの改善案（何をどう変える / なぜ / 期待できること / 手間 / 書き換え案）・「普通のコンサルが言うこと」と「本当に言うべきこと」を書く。主張には事実 ID が付き、シートに無い数値は注意として出る。ChatGPT のセカンドオピニオン（食い違う点だけ）、PDF、履歴。月 10 回（`SEO_ANALYSIS_MONTHLY_LIMIT`）。サイト診断など各画面にも「AI に分析させる」ボタンがあり、その画面の数字だけで短い分析を出す | Supabase + Anthropic（PageSpeed / SerpApi / OpenAI / Ahrefs DR / Open PageRank は任意） |
| ~~サイト診断（テクニカル SEO）~~ → **精密診断に統合（r58）**。[src/lib/audit](src/lib/audit) はその中で動き、報告書の「詳細」に出る。`/tools/site-audit` は精密診断へ転送 | A1 | 全ページをクロールし、48 のルールで課題を検出。10 カテゴリの件数、前回との差分、CSV 出力。**サイトの構成**（内部リンクの向きで見た重要度、本文中のリンクとナビの区別、クリック階層、行き止まり・到達不可、汎用アンカーの割合、ページ種別、パンくず・OG・hreflang の網羅、更新日、同じ題名のページ）と**信頼の手がかり**（会社情報・問い合わせ・規約・特商法のページ、Organization の構造化データ、電話・住所・メール、構造化データと本文の電話番号の一致、記事の著者）を同じ画面に表示（[src/lib/seo-analysis](src/lib/seo-analysis)） | 不要（要約のみ任意で AI） |
| [ページ最適化レポート](src/lib/page-report) | A2 / A3 | 1 URL の AI フレンドリー度を 0〜100 で採点。項目ごとの測定値・理由・改善提案。AI クローラの robots.txt 判定。表示速度と Core Web Vitals | 不要（PSI は任意） |
| [HP 改修提案（AI 最適化）](src/lib/improvement) | A2 / D2 | URL を入れてボタン一つで、診断結果をもとに**そのまま貼って使える改修案**を before → after で生成。タイトル・説明文・見出し・本文・構造化データ・alt が対象。提案ごとに理由・期待できること・優先度・手間を表示 | Anthropic |
| [ページ診断](src/lib/page-diagnosis) | A4 | 対策キーワードの上位 10 件と自社ページを比較し、検索意図・不足要素・title / description 案を提案。診断結果を踏まえたチャット | SerpApi または Anthropic |
| [AIO 頻出トピック](src/lib/aio-topics) | A5 | AI Overviews の本文からトピックを抽出し、出現割合・傾向・優先度と自社の不足トピックを表示 | SerpApi + Anthropic |

### 計測

| ツール | ID | 内容 | 必要なキー |
|---|---|---|---|
| [順位計測・AI Overviews 引用](src/lib/rank) | B1-B3 | 登録キーワードの順位・変化・ランディング URL、その場で測るリアルタイム計測、AI Overviews の引用を 5 区分（自社のみ / 競合のみ / 両方 / なし / AIO 表示なし）で集計 | SerpApi |
| [AI 検索モニタリング](src/lib/geo) | — | ChatGPT / Gemini / Google AI Overviews で、自社ブランドが**引用**（ソース欄に自社ドメイン）・**参照**（本文に名前）される割合を毎週はかり、競合と並べる。反復は週内の別の日に分散（通常 週 3 回 / 高精度 週 10 回）し、見出しは 4 週ローリング + 95% 信頼区間のバンドで出す（1 週間の上下では判断しない）。指名検索は自社引用率・引用元構成比・競合同時言及率を主指標にする。同じプロンプトの結果は 24 時間すべての利用者で共有して原価を下げる。クレジット制（月 2,000。使い切っても定期計測は止まらない）。仕様は [geo-monitoring-spec.md](docs/dev/geo-monitoring-spec.md) | DataForSEO + Supabase（Anthropic は任意） |
| [LLMO モニタリング・LLM リサーチ](src/lib/llmo) | B4 / B8 | 登録プロンプトを複数の LLM に投げ、ブランド言及率・ドメイン引用率・回答原文・引用元を記録。LLM が内部で発行した検索クエリ（ファンアウト）も保存 | Anthropic（OpenAI / Gemini / Perplexity は任意） |
| [プロンプト拡張](src/lib/llmo) | B7 | 参考プロンプトと対象サイトから、関連プロンプトをカテゴリ付きで 50 本程度生成 | Anthropic |
| [検索パフォーマンス](src/lib/google/search-console) | — | 連携した Search Console から、クリック数・表示回数・CTR・平均掲載順位を期間比較つきで取得。日別の推移と、クリックの多いクエリ・ページの一覧。推定ではなく Google の実測値 | Google 連携（利用者ごと） |
| [Google マップ・店舗情報（MEO）](src/lib/maps) | — | 店名・地域で検索して自社 1 件と競合を最大 5 件選ぶ。自社のビジネス プロフィールを基本情報 / 投稿 / 写真 / レビューの 4 カテゴリ・21 項目で採点した診断報告書（総合評価 A〜E、総評、口コミ情報、PDF 出力）を作成。総評は `ANTHROPIC_API_KEY` があれば AI が執筆。オーナー権限が要る項目は「未取得」として採点から外し、Business Profile 連携後に埋まる。自社の店舗と競合を登録すると、登録直後に 1 回、その後は毎週月曜 5:00 に一斉更新して履歴に保存（手動の取り直しは不可）。最新診断結果と前回との差分、競合との比較表 | Places API (New) + Supabase（総評は Anthropic 任意。一斉更新は `CRON_SECRET`） |
| [口コミ支援（アンケート QR）](src/lib/reviews) | — | 店内の QR コード（1 つのアンケートを複数店舗で共有し、店舗ごと・テーブル別・スタッフ別に発行。店舗を紐づけた QR は来店客の画面と Google の投稿先がその店舗になる。MEO の登録店舗にまとめて発行も可）から来店客がログイン不要のアンケート（`/r/<slug>`）に答える。回答をもとに AI が口コミの下書きを作り（トーンと含めたい語は店舗が設定）、来店客が自由に編集して「Google マップに投稿する」から自分の意思で投稿する。投稿ボタンは評価に関係なく全員に同じ。低評価のときは「お店に直接伝える」を並べて出す（隠さない）。回答・下書き・投稿時の本文は店舗がすべて閲覧でき、低評価と直接連絡は先頭に並ぶ。対応状態とメモ、経路別・週別の集計、投稿ボタンの押下率（Google 側の実投稿数は取れないため近似）、CSV。来店客の画面は端末の言語（日本語・英語・中国語 簡体 / 繁体・韓国語）に合わせて自動で切り替わり、右上で変更もできる（テンプレートの質問は用意した訳、店舗が書き換えた質問は AI が訳して保存。AI 下書きもその言語。回答の言語は店舗側に表示） | Supabase（下書きと質問の訳は Anthropic 任意。無ければ回答をそのまま並べ、訳は日本語のまま） |
| [口コミへの返信（AI 返信案）](src/lib/google/business-profile.ts) | — | Google ビジネス プロフィールを接続（`business.manage`）すると、口コミの全件取得と返信の投稿・更新・削除が画面で完結。AI が返信案を作る（トーン・店舗からの補足・署名。低評価はお詫び → 改善 → 個別連絡の型）。接続前は MEO の保存済み報告書の口コミ（最新 5 件）で返信案を作り、コピーして Google の管理画面へ | Google 連携（利用者ごと。Business Profile API の利用申請と API 有効化が必要）。返信案は Anthropic |
| [生成 AI 流入分析](src/lib/ai-traffic) | B6 | GA4 の参照元から生成 AI の流入を切り出し、AI 検索率（対総セッション / 対自然検索）、サービス別内訳、ページ × 流入元 × キーイベント | GA4（利用者ごとの Google 連携でも可） |
| [サイトレポート](src/lib/site-report) | E8 | GA4 の KPI の前期比、チャネル別流入と登録キーワードの平均順位・ファインダビリティスコア、自社・競合の最新順位表 | GA4（利用者ごとの Google 連携でも可）+ SerpApi |

### 調査・生成

| ツール | ID | 内容 | 必要なキー |
|---|---|---|---|
| [キーワード調査](src/lib/keywords) | C1 | Google サジェスト・関連キーワードの展開と検索意図の分類 | 不要（意図分類のみ任意で AI） |
| [AI ライティング・エディター](src/lib/writing) | D1-D4 | 構成案 → 本文のストリーミング生成、企画書モード（PDF 添付可）、範囲選択リライトと差分、ファクト / コピペ / 薬機法チェック | Anthropic（薬機法チェックは辞書のみで動作） |
| [基本情報掲載（NAP 一括登録）](src/lib/listings) | — | 店名・住所・電話・営業時間・説明文を 1 か所で決め（Google マップの公開情報から取り込み、表記ゆれを検出）、Google / Apple / Bing / Yahoo!プレイス / Foursquare / HERE / TomTom / Waze / OpenStreetMap など 30 媒体に同じ内容で載せる。無料で自分で登録できる媒体は登録画面へ直接、自動で流れる媒体（Siri・カーナビ各社・Uber）と配信代行（有料）でしか載らない媒体は区別。媒体ごとの掲載状況・URL・メモ、AI の説明文（150 / 750 文字）、サイトに貼る構造化データ（LocalBusiness） | Supabase（説明文は Anthropic 任意） |
| [llms.txt 生成](src/lib/llms-txt) | D6 | 6 ステップのウィザードで llms.txt を生成。既存 llms.txt の検証 | 不要 |

### 設定（`/settings`）

プロジェクト（ドメイン）と競合の登録、Google アカウントの連携、データの JSON エクスポート / インポート。外部連携（API キー）の設定状況は運用者だけが見るマスター画面（`/admin`）に出します（お客様には見せません）。

**キーが未設定のツールは、必要な環境変数を明示したうえで実行操作だけを無効化します。** 画面の説明や登録済みデータの閲覧はそのまま使えます。存在しないデータを補って表示することはしません。

---

## 料金プラン

| プラン | 月額（税別） | 内容 |
|---|---:|---|
| **クイック診断** | 0 円 | サイトのクイック診断（`/`、1 ページまたは代表 10 ページ）と店舗のクイック診断（`/meo`、店舗 1 件）。ログイン不要。プランではない（`free` = 未契約） |
| **ライト**（`light`） | 38,000 円 | SEO・AIO・MEO の**診断と計測**のツールすべて。AI が成果物を作るツール（7 つ）は含まない。**初月無料** |
| **スタンダード**（`standard`・本命） | 50,000 円（定価） | ライトのすべて + **AI が成果物を作る**ツール（精密診断・HP 改修提案・AI ライティング・llms.txt 生成・口コミ支援・AI 返信案・NAP 一括掲載）。**初月無料**（`STRIPE_TRIAL_DAYS`、既定 30 日）。割引は Stripe のクーポン → プロモーションコードで（申し込み画面で入力） |
| **プレミアム（伴走）**（`premium`） | 150,000 円〜（お見積り） | スタンダードのすべて + 人の作業（月 1 回の報告ミーティング・レポート代行・優先サポート）。**月 3 社まで**。**金額は下限だけを出し、実額はご依頼の範囲に応じて個別にお見積り**（`priceFrom: true`）。料金画面に「申し込む」を出さず、お見積りの依頼から受ける（受注後に Stripe の支払いリンク・請求書で契約を立て、その価格を `STRIPE_PRICE_PREMIUM` に入れる） |

申し込みの入口は `https://app.seo-checker.tokyo/sign-up` です（新規登録 → `/start` → 未契約なので `/plans` → 申し込み）。紹介サイトの「初月無料ではじめる」もここへ送ります。登録済みの人は `/plans` から申し込み・カードの変更・解約ができます。

**なぜ 3 段階か**（2026-09-15 決定）。1 つだけ並べると、お客様が比べる軸が「買うか買わないか」になります。3 つ並べると軸が「どれを買うか」に変わり、両端を避けて真ん中が選ばれやすくなります（極端回避性・松竹梅）。上に高い段を置くと、それが基準になって真ん中が手ごろに見えます（アンカリング）。本命は真ん中のスタンダードで、料金表では高い順（プレミアム → スタンダード → ライト）に並べ、真ん中に「いちばん選ばれています」を出します。いちばん上を「150,000 円〜」の見積り制にしているのは、定額に見せると重い案件をその額で受けざるを得なくなるためです（下限だけでもアンカーとしては同じに働きます）。

線の引き方は `registry.ts` の `plan` フィールドと一致させています（読む・測る = `light` / AI が作る = `standard`）。恣意的な値付けにしないためで、「なぜここで切れているのか」をそのままお客様に説明できます。値引きの要望にはクーポンではなくライトを案内します（同じ商品を値引きすると定価が崩れるため）。定義は `src/lib/plans/catalog.ts` と `src/lib/features/registry.ts` の 2 か所だけにあり、`src/lib/plans/__tests__/plans.test.ts` が対応表を固定しています。

旧プラン ID の `pro`（2026-09-15 までの「オールインワン」＝ 全機能）は、`toPlanId()` が今の `standard` に読み替えます。`DEFAULT_PLAN=pro` や Clerk の `publicMetadata.plan` に残っていてもそのまま動きます。

### プランの決まり方

上から順に見て、最初に決まったものを使います。

1. **ログインが未設定** … すべて `premium` 扱い（開発・E2E で全機能を開けたままにするため）
2. **Stripe の契約状態**（`publicMetadata.stripe`。Webhook が書く。無料期間中の `trialing` も契約中として扱う）… 有効・トライアル・支払い遅延なら、契約状態に保存した `plan`（Webhook が Price ID から引く）。保存が無い古い契約はスタンダード扱い。Clerk Billing の `has({ plan })` も残っていますが使っていません
3. **Clerk の `publicMetadata.plan`** … 決済を入れる前に、運用者がダッシュボードで `"free"` / `"light"` / `"standard"` / `"premium"` を割り当てます
4. **`DEFAULT_PLAN` 環境変数** … 全員へ一律で開放したいとき
5. どれも無ければ `free`

### 決済（Stripe 直結）

カード決済は **Stripe** を直接使います（Checkout で申し込み → サブスクリプション。カードの変更・請求書・解約は Stripe のカスタマーポータル）。契約状態は Stripe の Webhook が Clerk のユーザーの `publicMetadata.stripe` に書くので、**ここでもデータベースは要りません**。Clerk Billing はドルにしか対応していないため（2026-09 時点）、円建ての料金は Stripe 直結にしています。

準備は 1 回だけです（画面つきの手順は `docs/dev/OPERATIONS.md` の「Stripe を有効にする手順」）。

1. Stripe ダッシュボードで商品「スタンダード」（月額 50,000 円・JPY・継続）と「ライト」（月額 38,000 円・JPY・継続）を作り、それぞれの **Price ID（`price_…`）** を控える。割引はクーポン → プロモーションコードで作る。プレミアム（伴走）は Stripe に作らない（お問い合わせから受ける）
2. 開発者 → Webhook で `https://app.seo-checker.tokyo/api/billing/webhook` を登録し、イベント `checkout.session.completed` / `customer.subscription.created` / `customer.subscription.updated` / `customer.subscription.deleted` を選ぶ → **署名シークレット（`whsec_…`）** を控える
3. 設定 → カスタマーポータルを有効にする（お支払い方法の更新・請求書・解約を許可）
4. Vercel の環境変数に `STRIPE_SECRET_KEY` / `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_LIGHT` / `STRIPE_WEBHOOK_SECRET` を入れて Redeploy（`STRIPE_PRICE_PRO` は `STRIPE_PRICE_STANDARD` の旧名として今も読みます）。プレミアムを受注して支払いリンク・請求書で契約を立てるときは、その価格を `STRIPE_PRICE_PREMIUM` にも入れます（入れないと、その契約がスタンダードとして記録されます）

鍵・スタンダードの Price・Webhook がそろうと `/plans` の料金表に各プランの「申し込む」（契約前）が出て、契約後は「お支払い方法の変更・請求書・解約」が出ます（`src/components/plans/PlanCheckoutButton.tsx` と `src/components/plans/StripeBillingCard.tsx`）。`STRIPE_PRICE_LIGHT` が未設定ならライトの「申し込む」だけが出ません。テストキー（`sk_test_`）のときは画面に「テストモード」と出ます。未設定なら案内文が「プラン変更は運用者までご連絡ください」に変わり、上の 3（`publicMetadata.plan`）を手で割り当てる運用になります。申し込み画面では Stripe のプロモーションコード（クーポン）を入力できます。

`NEXT_PUBLIC_CLERK_BILLING_ENABLED=1` の Clerk Billing の料金表（`BillingTable.tsx`）は残してありますが、Stripe が設定されているときは出しません。

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

運用者だけが開ける画面です。**登録しているすべてのお客様**が新しい順に並び、1 人ごとに次を確認・操作できます。

| 見えるもの | 出どころ |
|---|---|
| 契約状況（契約中 / 無料トライアル / 支払い遅延 / 解約手続き済み / 契約なし） | Clerk Billing |
| 月額（割引後）と割引前の額 | Clerk Billing の次回請求 |
| クーポン（名称・コード・割引率または割引額・残り回数） | Clerk Billing の割引 |
| 次回請求日・登録日・最終利用日 | Clerk |
| **機能の個別開放（チェックボックス）** | Clerk の `publicMetadata.featureOverrides` |
| **担当代理店（選択）** | Clerk の `publicMetadata.agencyId` |

**入れるのは `ADMIN_EMAILS` に書いたメールアドレスの人だけです。** 未設定なら誰も入れません。判定に使うのは Clerk 側で確認済みのアドレスだけで、未確認のアドレスは通しません（管理者のアドレスで登録するだけで入れてしまうため）。管理者でないときは 403 ではなく **404** を返します（画面の存在自体を教えないため）。

**機能の個別開放**は、プランで使えるものに**足す**だけで、塞ぐことはできません。「スタンダード契約のお客様に HP 改修提案だけ試してもらう」といった使い方を想定しています。逆向き（払っているのに使えない）を作れると事故のほうが高くつくため、実装として持ちません。開放した機能はサイドバーの鍵が外れ、API のプラン判定（402）も通るようになります。

レジストリ（`src/lib/features/registry.ts`）に機能を足すと、マスター画面のチェックボックスも自動で増えます。

> Clerk の Billing API は公開ベータで、返る形が変わることがあります。壊れた値で画面が落ちないよう、金額と契約状況のパーサは「例外を投げず、読めない値は空にする」方針で書いてあります（`src/lib/admin/billing.ts`）。

### 代理店画面（`/agency`）

販売を手伝ってくださる代理店に、**担当としてお預かりしているお客様だけ**をお見せする画面です。運用者（マスター）が代理店を追加し、どのお客様を見せるかを割り当てます。

| 役割 | 決まり方 | 見えるお客様 | できること |
|---|---|---|---|
| マスター（運用者） | 環境変数 `ADMIN_EMAILS` の**確認済み**メール | 登録しているすべてのお客様 | 代理店の追加・解除、担当の割り当て、機能の個別開放 |
| 代理店 | Clerk の `publicMetadata.role` が `agency` | 自分に割り当てられたお客様だけ | **表示のみ** |
| 登録者（お客様） | 上のどちらでもない | 自分のツール画面だけ | — |

**代理店を追加する**（マスター画面の「代理店アカウント」）: メールアドレスを入れて「代理店として追加」を押します。

- すでに登録済みの方 … その場で代理店になります
- まだ登録していない方 … Clerk から招待メールが飛び、相手が登録を済ませた時点で代理店になります

**担当を割り当てる**（マスター画面の顧客一覧）: お客様ごとの「担当代理店」で代理店を選ぶと、その代理店の画面に出るようになります。「担当なし」に戻せば見えなくなります。

代理店にできるのは**見ること**だけです。プランの変更も機能の個別開放も持たせていません（金額に関わる操作は運用者だけに残す、という線引きです）。代理店を「解除」すると、その場で代理店画面が開けなくなります（404）。担当の割り当て自体は消さないので、代理店に戻せば担当もそのまま戻ります。

**マスターだけ環境変数**にしてあります。運用者の権限を Clerk 側の値に置くと、Clerk を触れる人が自分を運用者にできてしまうためです。代理店と担当は Clerk の `publicMetadata` に持ちますが、ここは Backend API からしか書けないので、お客様がご自分で代理店に化けたり担当を付け替えたりはできません。

> Clerk の Backend API には「publicMetadata で絞る」条件が無いため、代理店の一覧と担当分は読んでから絞っています。読む人数は 500 人で打ち切ります（`src/lib/admin/clients.ts` の `MAX_SCAN`）。これを超える規模になったら、担当の関係だけ Supabase に持たせて絞り込みをデータベース側に移してください。

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

クイック診断はどれも不要です。

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
| `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | AI 検索モニタリング（ChatGPT / Gemini / AI Overviews の定期計測） |
| `AHREFS_API_KEY` | ドメインパワーの DR（0〜100。無料のドメインパワー測定サイトと同じ数値。Ahrefs の無料公開エンドポイント） |
| `OPENPAGERANK_API_KEY` | 同上の代替（Open PageRank 0〜10。無料。どちらも未設定なら他の指標だけで採点） |
| `CRUX_API_KEY` | CrUX（実ユーザーの速度）。無ければ `PAGESPEED_API_KEY` を使う（Google Cloud で Chrome UX Report API を有効にする） |
| `SEO_ANALYSIS_MONTHLY_LIMIT` | 精密診断の月の回数（既定 10。運営者は無制限） |
| `GOOGLE_PLACES_API_KEY` | Google マップ・店舗情報（MEO）。Places API (New) 専用に制限したキー。請求先アカウントが必要（無料枠あり） |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | MEO の登録店舗と診断報告書の履歴、精密診断の実行記録（`analysis_runs`）など（Supabase）。テーブルは `docs/dev/OPERATIONS.md` の SQL |
| `REVIEW_DRAFT_MODEL` | 口コミ支援の AI 下書きと、店舗が書き換えた質問文の訳のモデル（既定は `LLM_FAST_MODEL` = `claude-haiku-4-5`） |
| `REVIEW_REPLY_MODEL` | 口コミ返信案のモデル（既定は `LLM_FAST_MODEL`） |
| `REVIEW_FORM_DAILY_LIMIT` / `REVIEW_AI_DAILY_LIMIT` | 口コミ支援: アンケート 1 つあたりの 1 日の回答数（既定 500）と、AI 下書きの 1 日の全体上限（既定 2,000。超えたら回答は受け付け、下書きは回答をそのまま並べる） |
| `CRON_SECRET` | 毎週月曜 5:00 の一斉更新（`vercel.json` の Cron → `/api/cron/maps-refresh`）。未設定なら一斉更新は動かない |
| `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` | 生成 AI 流入分析、サイトレポート（利用者が GA4 を連携していないときのフォールバック） |
| `DEFAULT_PLAN` | 既定の料金プラン（`free` / `standard` / `pro`）。未設定なら `free` |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_LIGHT` / `STRIPE_WEBHOOK_SECRET` | 決済（Stripe 直結）。秘密鍵・スタンダードとライトの Price ID・Webhook の署名シークレット。鍵・スタンダードの Price・Webhook がそろうと `/plans` に申し込みとお支払いの管理が出る（`STRIPE_PRICE_PRO` は `STRIPE_PRICE_STANDARD` の旧名） |
| `STRIPE_PRICE_PREMIUM` | 任意。プレミアム（伴走）の Price ID。料金画面には出ないが、支払いリンク・請求書で立てた契約をプレミアムとして記録するために使う |
| `STRIPE_TRIAL_DAYS` | 無料期間の日数（既定 30 = 初月無料）。`0` でトライアルなし。特商法ページと料金画面の文面もこの値に従う |
| `NEXT_PUBLIC_CLERK_BILLING_ENABLED` | `1` のとき `/plans` に Clerk Billing（ドルのみ）の料金表を出す。Stripe が設定されていれば出さない |
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

E2E スモーク（ダミーサイトを立ててクイック診断を実行し、スクリーンショットと PDF を出力）:

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
    page.tsx                  # クイック診断
    tools/<id>/page.tsx       # 各ツール（Server Component。PageHeader + クライアント画面）
    settings/                 # プロジェクト・競合・Google 連携
    api/                      # Route Handler（nodejs runtime）
  components/
    shell/                    # AppShell / Sidebar / TopBar
    ui/                       # Card / PageHeader / Button / DataTable / SetupNotice など
    charts/                   # 依存なしの SVG（Donut / HBar / Pie / Histogram / StackedBar / Sparkline / HeatCell）
    free/                     # クイック診断のレポート
    <tool>/                   # 各ツールの画面
  lib/
    analyzer/                 # クイック診断の判定ルール（fetch.ts の assertPublicHost + fetchText が唯一の取得経路）
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
