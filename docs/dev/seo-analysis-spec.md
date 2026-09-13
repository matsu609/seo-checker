# SEO 分析ツール 要件と実装計画（2026-09-13）

利用者から 2026-09-13 に受け取った「SEO 分析ツール 機能要件」を、このリポジトリの現状に当てはめて整理したもの。
前半（§1〜§13）は要件書そのもの（文言は要点を保ったまま短くした）、後半（§14〜§17）は既存コードとの対応・足りないもの・実装の段階・利用者に決めてもらうこと。
運用状態は [OPERATIONS.md](./OPERATIONS.md)、開発規約は [ARCHITECTURE.md](./ARCHITECTURE.md)、ツールとキーの関係は [tool-map.md](./tool-map.md)。

---

## 1. 目的

Google が提供する API と自前クローラーを中心に、**API コストを可能な限り発生させず**、自社サイトの SEO 状況を一元分析できるツールを構築する。

分析領域: 検索順位・検索流入 / アクセス・コンバージョン / インデックス状況 / Core Web Vitals / ページ速度・パフォーマンス改善 / テクニカル SEO / サイト内部構造 / キーワード分析。

## 2. 利用するデータソース

### 2.1 Google Search Console API（Search Analytics）

- 取得項目: Query / Page / Clicks / Impressions / CTR / Average Position / Country / Device / Date。
- 用途: 検索順位分析、キーワード分析、CTR 分析、ページ別 SEO 分析、順位推移、表示回数推移、改善対象ページの抽出。
- 改善候補の抽出条件（例）: 表示回数が多い / 平均順位 4〜15 位 / CTR が低い / 順位が低下している / 表示回数は増えているがクリックが増えていない。

### 2.2 Search Console URL Inspection API

- 確認項目: インデックス登録状態、Google が認識している canonical、ユーザー指定 canonical、クロール状況、最終クロール日時、robots によるクロール可否、インデックス関連情報。
- 用途: インデックス未登録ページ、canonical 問題、クロール問題、技術エラーの検出。

### 2.3 Search Console Sitemaps API

- 用途: GSC に登録されているサイトマップの一覧・状態の確認、サイトマップ URL の管理、クローラー結果との比較。

### 2.4 Google Analytics 4 Data API

- 取得候補: Users / Sessions / Organic Sessions / Landing Pages / Engagement / Engagement Rate / Conversions（Key Events）/ Revenue / Date。
- 用途: GSC の検索データと組み合わせ、「順位が高いページ」ではなく「**SEO 経由で事業成果につながっているページ**」を判断する。

### 2.5 CrUX API（Chrome UX Report）

- 位置づけ: 速度テストを実行する API ではなく、Google が Chrome の実ユーザーから収集・集計した **Field Data** を取得する API。
- 指標: LCP / INP / CLS を中心に、FCP / TTFB など利用可能なもの。
- 判定: Core Web Vitals は原則 **75 パーセンタイル**の値で評価する。
- 用途: URL または Origin 単位で、CWV の合格 / 不合格、LCP・INP・CLS の問題、実ユーザー環境での悪化を検出する。
- 注意: 実ユーザーデータが十分に無い URL は URL 単位のデータが取れない。その場合は Origin 単位のデータを使うか、「データ不足」と表示する。

### 2.6 CrUX History API

- 用途: CWV の時系列変化（例: LCP 3.1 秒 → 2.8 → 2.4 → 2.1 秒）の可視化。
- UI: LCP 推移 / INP 推移 / CLS 推移 / CWV 合格状況の推移をグラフで表示する。

### 2.7 PageSpeed Insights API

- 位置づけ: ページを実際にテストし、パフォーマンス問題の**原因**を分析する。CrUX とは役割を分ける。
- 取得・表示候補: Lighthouse の Performance / Accessibility / Best Practices / SEO、Lighthouse Metrics、Opportunities、Diagnostics、改善提案。
- 運用: 全 URL に高頻度で実行しない。基本フローは **CrUX → CWV 問題検出 → 問題 URL を特定 → PSI 実行 → 原因・改善方法**。新規 URL の登録時とユーザーが詳細分析を要求したときにも実行できる。

## 3. CrUX と PageSpeed の役割分担

| | 問い | 何を見る |
|---|---|---|
| CrUX | 本当に遅いのか？ | 実ユーザーのパフォーマンス監視 |
| PageSpeed / Lighthouse | なぜ遅いのか？ | ページの技術的診断 |

基本フロー: CrUX → 問題ページ発見 → PageSpeed → 原因分析 → 改善提案。これで不要な PSI 実行を減らす。

## 4. 自前 SEO クローラー

外部の有料 SEO API に依存せず、自社サーバーから対象サイトをクロールしてテクニカル SEO 情報を取得する。

- URL ごとの取得候補: URL / HTTP Status / Redirect / Redirect Chain / Title / Meta Description / H1 / H2 / H3 / Canonical / Meta Robots / hreflang / Structured Data（Schema.org）/ Open Graph / Internal Links / External Links / nofollow / Image / Image alt / HTML Size / Word Count。
- サイト全体で検出する問題: Title 未設定・重複・長すぎ / 短すぎ、Description 未設定・重複、H1 未設定・複数、Canonical 異常、noindex、Broken Link、3xx / 4xx / 5xx、Redirect Chain、alt 未設定、内部リンク不足、構造化データ問題、Sitemap との不一致。

## 5. robots.txt / sitemap.xml

HTTP 経由で取得・解析する。robots.txt は存在 / Disallow / Sitemap 行 / クロール対象 URL がブロックされていないか。sitemap.xml は URL 一覧をクローラー結果と比較する。

## 6. URL 集合の比較

| 集合演算 | 検出するもの |
|---|---|
| Sitemap URL − Crawl URL | サイトマップにはあるが、内部リンクから到達できない可能性がある URL |
| Crawl URL − Sitemap URL | クロールできるがサイトマップに無い URL |
| Crawl URL − GSC URL | サイト内には存在するが、Google 検索でほぼ露出していないページ候補 |
| Sitemap URL × URL Inspection | サイトマップにあるが Google にインデックスされていない URL |

## 7. Google Ads API / Keyword Planning

利用可能な場合は Google Ads API を接続し、Keyword Ideas / Historical Metrics / Search Volume / Competition / Related Keywords（Location / Language 指定）を取得する。URL ベースで関連キーワード候補を取り、GSC と統合して「**検索需要あり + GSC の表示回数が少ない + 順位が低い**」＝コンテンツ追加・改善候補として提示する。アカウント・developer token・利用条件・クォータを考慮する。

## 8. URL 単位の統合 SEO データ

URL を中心に、Crawl Data（Title / Description / H1 / Canonical / Internal Links / Technical SEO）、GSC（Queries / Clicks / Impressions / CTR / Position）、GA4（Sessions / Engagement / Conversions / Revenue）、CrUX（LCP / INP / CLS / CWV Status）、PageSpeed（Performance / Lighthouse / Opportunities / Diagnostics）、URL Inspection（Indexed / Google Canonical / Last Crawl）を統合する。

## 9. SEO 改善候補の自動抽出

| 候補 | 条件 | 提示する改善 |
|---|---|---|
| CTR 改善 | Impressions が一定以上 / Position が比較的高い / CTR が期待値より低い | Title・Description の改善、検索意図との一致確認 |
| 順位改善 | Position 4〜15 / Impressions が多い / 過去より順位低下 | 「あと少しで上位表示できるページ」として優先表示 |
| Core Web Vitals 改善 | CrUX で LCP / INP / CLS のいずれかが不良 | PSI を実行して原因を取得 |
| インデックス問題 | Sitemap にあるが URL Inspection で未インデックス | インデックス問題として表示 |
| コンテンツ改善 | 表示回数は多いが順位が低い / コンテンツ量が少ない / 関連 Query に対応する見出しが無い | 見出し・本文の追加候補 |

## 10. SEO ダッシュボード

サイト全体について、Search Performance（Clicks / Impressions / CTR / Average Position / 前期間比較）、Organic Traffic（Organic Sessions / Users / Engagement / Conversions / Revenue）、Core Web Vitals（Good / Needs Improvement / Poor の URL 数、LCP / INP / CLS、前期間比較）、Technical SEO（Error 数 / Warning 数 / Broken Links / Missing Title / Duplicate Title / Missing Description / Canonical 問題 / Index 問題）、SEO Opportunities（改善インパクトが高い URL を優先順位つきで）を表示する。

## 11. API コスト最適化

- 基本方針: 無料 API + 自前処理を優先する。
- 高頻度取得可能（定期取得して DB に保存）: GSC / GA4 / CrUX。
- 低頻度・オンデマンド: PageSpeed Insights / URL Inspection / 自前クローラー。前回取得日時・コンテンツ更新日時で不要な再取得を避ける。
- PSI は「全ページを毎日測定」ではなく「CrUX で問題検出 → PSI で詳細分析」を基本設計とする。

## 12. 有料データなしでは難しい機能（初期バージョンでは必須にしない）

Google 検索結果 1〜100 位の継続的な SERP 取得 / 競合サイトの全ランキングキーワード / 競合サイトの被リンク DB / Ahrefs DR 相当の独自指標 / 世界規模の SERP 履歴 / 大規模バックリンクインデックス。必要になった段階で外部 SEO API（Ahrefs / Semrush / DataForSEO / SerpApi）を検討する。

## 13. 基本思想

「データを表示するだけの SEO ツール」ではなく「**どの URL を、なぜ、何から改善すべきか分かる SEO ツール**」を目指す。

GSC + GA4 + CrUX + PageSpeed + URL Inspection + 自前クローラー + Sitemap / robots.txt → URL 単位でデータ統合 → SEO 問題検出 → 改善機会の抽出 → 重要度・改善インパクトの算出 → 優先順位つきで提示。

---

## 14. 現状との対応（ギャップ分析）

このリポジトリには SEO タブのツールが既にあり、要件の約半分は既存の部品で満たせる。**新規に作るのは CrUX / URL Inspection / Sitemaps API の 3 つの取得と、URL 単位の統合・改善候補・ダッシュボードの 3 つの画面**。

| 要件 | 既にあるもの | 足りないもの |
|---|---|---|
| 2.1 GSC Search Analytics | `src/lib/google/search-console/`（`sites.list` と `searchAnalytics.query`。次元は query / page / date / country / device に対応）。画面 `/tools/search-performance`（期間 7〜365 日、前期間比、日別、クエリ / ページ上位 100） | **query × page の掛け合わせ**（ページごとのクエリ一覧）、**日次の保存**（いまは 10 分キャッシュだけ。順位低下・表示増クリック横ばいの判定には履歴が要る）、country / device の画面、改善候補の抽出ロジック（§9） |
| 2.2 URL Inspection API | Google 連携（Clerk の OAuth、`webmasters.readonly`）。同じトークンで呼べる | **クライアントが無い**（`searchconsole.googleapis.com/v1/urlInspection/index:inspect`）。1 日 2,000 件 / プロパティの割り当てがあるので、対象 URL の選び方と保存が要る |
| 2.3 Sitemaps API | クローラーが `sitemap.xml` を HTTP で直接読む（`src/lib/crawl/discover.ts`） | **GSC 側の登録状況**（`sites/{siteUrl}/sitemaps`）の取得。HTTP のサイトマップと GSC 登録の突き合わせ |
| 2.4 GA4 Data API | `src/lib/ga4/`（`runReport`）。`/tools/ai-traffic`（生成 AI 流入）、`/tools/site-report`（KPI 前期比・チャネル別）。利用者ごとの Google 連携とサービスアカウントの両対応 | **Organic Search × ランディングページ**の集計（sessions / engagementRate / keyEvents / totalRevenue）を URL 単位に持つこと |
| 2.5 CrUX API | PSI の応答に含まれる CrUX 値（`PsiResult.crux`、LCP / INP / CLS の 75 パーセンタイルと区分）を `/tools/page-report` で表示 | **CrUX API を直接叩くクライアント**（`chromeuxreport.googleapis.com/v1/records:queryRecord`。URL 単位 → 無ければ Origin 単位 → 無ければ「データ不足」）。PSI 経由だと 1 URL ごとに Lighthouse が走るので、監視用途には使えない |
| 2.6 CrUX History API | 無し | **クライアント**（`records:queryHistoryRecord`。直近 40 期分の週次時系列）、推移グラフ（`src/components/charts/Sparkline` などの SVG 部品は流用可） |
| 2.7 PageSpeed Insights | `src/lib/psi/`（取得・パース。カテゴリスコア、CrUX 値、ラボ値、Opportunities 上位 5）。`PAGESPEED_API_KEY` は本番に設定済み | Best Practices スコア・Diagnostics の取り込み、**CrUX の問題 URL からだけ PSI を起動する導線**、結果の保存 |
| 4 自前クローラー | `src/lib/crawl/`（サイトマップ展開 + 内部リンク BFS、`SITE_MAX_PAGES`）と `src/lib/audit/`（**48 ルール・10 カテゴリ**。title / description / H1 / canonical / noindex / リンク切れ / 3xx / 4xx / 5xx / リダイレクトチェーン / alt / 孤立ページ / 構造化データ / サイトマップ有無 など §4 の検出項目はほぼ網羅）。`/tools/site-audit` で前回比と CSV | ページごとの **hreflang / Open Graph（`og:url` 以外）/ nofollow の抽出**、H2・H3 の一覧を結果に持つこと（内部では `headings` を持っているが結果 JSON には出していない）、**クロール結果の保存**（いまは localStorage の履歴と 1 MB 弱のサーバーキャッシュ）|
| 5 robots.txt / sitemap.xml | `src/lib/analyzer/robots.ts`（`robots-parser`、Sitemap 行、Googlebot の許可判定）、サイトマップの展開、`ROBOTS_MISSING` / `ROBOTS_BLOCKED` / `SITEMAP_MISSING` ルール | 無し（そのまま使える） |
| 6 URL 集合の比較 | Sitemap − Crawl は `ORPHAN_PAGE`（内部リンクが無いページ）で実質検出済み。`sitemapCount` / `linkCount` の集計あり | **Crawl − Sitemap**、**Crawl − GSC**、**Sitemap × URL Inspection** の 3 つ。GSC / Inspection の結果と付き合わせるため、URL の正規化（`src/lib/crawl/url.ts`）を共通で使う |
| 7 Google Ads API | `/tools/keywords`（Google サジェスト + 意図分類。検索ボリュームは無し） | **Ads API 接続そのもの**（developer token、MCC アカウント、OAuth の `adwords` スコープ、`KeywordPlanIdeaService`）。利用者側の準備が大きいので後段に置く |
| 8 URL 単位の統合 | 各ツールが別々に持つ（GSC は API 応答、GA4 は API 応答、クロールは localStorage / キャッシュ、PSI はキャッシュ） | **URL をキーに束ねる保存先と型**（`SeoUrlRecord`）。Supabase に置く（MEO と同じ構成、RLS + service_role、必ず user_id で絞る） |
| 9 改善候補の自動抽出 | MEO の「改善点上位」やページ最適化レポートの提案（ページ単体）。GSC × クロールの横断は無し | **5 種類の抽出ロジック**（純関数 + テスト）、インパクトの算出（表示回数 × 期待 CTR との差など） |
| 10 ダッシュボード | `/tools/site-report`（GA4 KPI + 順位）と `/tools/search-performance` が近い | **4 領域 + Opportunities を 1 画面に**。前期間比の共通部品は `StatStrip` 系を流用 |
| 11 コスト最適化 | `globalCache`（プロセス内）、PSI は任意実行、Vercel Cron（`/api/cron/maps-refresh`、`CRON_SECRET`） | **定期取得の Cron**（GSC 日次 / CrUX 週次）、前回取得日時による間引き。Vercel Hobby は Cron が 1 日 1 回までの制約があるので、1 本の Cron で複数の仕事を回す設計にする |

補足:

- **Google 側の準備は小さい**。CrUX API と CrUX History API は同じ Google Cloud プロジェクト（`seo-checker-508104`）で「Chrome UX Report API」を有効にし、既存の PageSpeed 用 API キーの制限に追加するだけで使える（OAuth 不要）。URL Inspection と Sitemaps は既に許可済みの `webmasters.readonly` で呼べる。Google Ads だけは別（§17）。
- **費用はゼロで組める**。GSC / GA4 / CrUX / PSI / URL Inspection はいずれも無料（割り当てのみ）。実費が出るのは AI の文章生成（任意）だけ。
- **保存先は Supabase**。ARCHITECTURE.md の「サーバーに DB は無い」は無料診断と初期ツールの方針で、MEO 以降は Supabase を使っている。GSC の日次・CrUX の週次・Inspection の結果は履歴が本体なので localStorage では持てない。

## 15. 実装の段階（提案）

各段階は単体で価値が出るように切る。目安は 1 段階 = 1〜2 リリース（`rNN`）。

| 段階 | 内容 | 新規のもの | 目安 |
|---|---|---|---|
| **A** | **CrUX 監視** | `src/lib/crux/`（`queryRecord` / `queryHistoryRecord` のクライアント + パース + テスト）、`crux_records` テーブル（user_id / site / url or origin / 週 / LCP / INP / CLS / FCP / TTFB の p75 と区分）、画面 `/tools/cwv`（Good / NI / Poor の URL 数、指標ごとの推移グラフ、Origin へのフォールバックと「データ不足」表示）、**「この URL を PSI で詳しく見る」ボタン**（既存 `fetchPsi` を呼ぶ。Diagnostics と Best Practices をパーサに追加） | 2〜3 日 |
| **B** | **GSC の日次保存と改善候補** | `gsc_daily` テーブル（date × page × query の上位 N 行 + 合計）、Cron で毎日取得（3 日遅れ）、`src/lib/seo-analysis/opportunities.ts`（CTR 改善 / 順位改善 / 表示増クリック横ばいの純関数 + テスト）、`/tools/search-performance` に「ページ → クエリ」の掘り下げと国・デバイスの内訳を追加 | 3〜4 日 |
| **C** | **インデックス状況** | `src/lib/google/search-console/inspection.ts`（URL Inspection）と `sitemaps.ts`（Sitemaps API）、`url_inspections` テーブル、対象 URL の選び方（サイトマップの URL から、前回検査が古い順に 1 日の上限内で）、Sitemap × Inspection の未インデックス一覧、GSC 登録サイトマップと HTTP のサイトマップの突き合わせ | 2〜3 日 |
| **D** | **クロール結果の保存と URL 集合の比較** | サイト診断の結果（`AuditPageRow` + hreflang / OG / nofollow / H2・H3 を追加）を `crawl_pages` に保存、Crawl − Sitemap / Crawl − GSC の一覧、ページ単位のテクニカル課題を URL レコードに紐づけ | 2〜3 日 |
| **E** | **URL 統合ビューとダッシュボード** | `SeoUrlRecord`（§8 の形）を組み立てる `src/lib/seo-analysis/merge.ts`、URL 詳細画面（Crawl / GSC / GA4 / CrUX / PSI / Inspection を 1 枚に）、`/tools/seo-dashboard`（§10 の 4 領域 + Opportunities）。GA4 は Organic × ランディングページを追加 | 3〜4 日 |
| **F** | **コンテンツ改善候補** | GSC の関連クエリとクロールした見出しの照合（「この Query に対応する見出しが無い」）、本文量との組み合わせ。提案文は Anthropic 任意 | 2 日 |
| **G** | **Google Ads（任意）** | developer token・MCC・`adwords` スコープが揃ってから。`KeywordPlanIdeaService` のクライアント、GSC との突き合わせ（需要あり × 露出なし） | 利用者の準備次第 |

順番の理由: A は Google 側の準備が最小で、既存の PSI と組んで「本当に遅いのか → なぜ遅いのか」の流れがすぐ形になる。B は既に動いている GSC 連携の延長で、改善候補の抽出という本ツールの核心に一番早く届く。C〜E は保存先が揃ってから。

## 16. 設計上の決めごと（提案。ARCHITECTURE.md の規約に従う）

- **置き場所**: 取得は `src/lib/crux/`、`src/lib/google/search-console/{inspection,sitemaps}.ts`。統合と抽出は `src/lib/seo-analysis/`。画面は `src/components/seo-analysis/`、`src/app/tools/{cwv,seo-dashboard}/`。registry の `category: "seo"`、`plan: "standard"`（読む・測る系）。
- **保存**: Supabase。テーブルはすべて `user_id` + サイト（GSC の `siteUrl`）で絞る。SQL は OPERATIONS.md の「フェーズ 2 で使うテーブル」の節に追記して利用者に実行してもらう。
- **定期取得**: Vercel Cron は Hobby で 1 日 1 回まで。既存の `/api/cron/maps-refresh` と同じ守り（`CRON_SECRET`、公開 API に完全一致で登録）で `/api/cron/seo-refresh` を 1 本追加し、その中で GSC 日次 → CrUX（週 1 回だけ）→ URL Inspection（1 日の上限内）→ の順に回す。失敗しても他を止めない（`refresh.ts` と同じ）。利用者ごとのトークンは Clerk から取る（Cron はログインが無いので、Google 連携済みの利用者を Supabase の設定行から列挙する）。
- **URL の正規化**: GSC の page、クロールの finalUrl、サイトマップ、Inspection の入力をすべて `src/lib/crawl/url.ts` の正規化で揃えてからキーにする（末尾スラッシュ・フラグメント・大文字小文字の差で別 URL に割れないように）。
- **CrUX のフォールバック**: URL → Origin → データ不足の 3 段。画面には「URL 単位 / Origin 単位 / データ不足」のどれかを必ず明記する（Origin の値を URL の値のように見せない）。
- **PSI の起動条件**: CrUX で Poor / Needs Improvement の URL、新規に登録した URL、利用者が押したとき。結果は URL ごとに保存し、前回から 7 日以内で内容の更新が無ければ再実行しない。
- **改善インパクト**: CTR 改善は「表示回数 × （順位帯の期待 CTR − 実 CTR）」= 見込みクリック増、順位改善は「表示回数 × 順位 4〜15 の重み」、CWV は Poor の URL のクリック数、インデックス問題はサイトマップ内の URL 数に対する割合、で並べる。数式は `src/lib/seo-analysis/impact.ts` に純関数で置き、レポートに根拠の数字を出す。
- **やらないこと**（§12）: SERP の継続取得、競合の全キーワード、被リンク。既存の順位計測（SerpApi）は別ツールとしてそのまま。

## 17. 利用者に決めてもらうこと

| # | 決めること | 選択肢と推奨 |
|---|---|---|
| 1 | 着手の順番 | **推奨: §15 の A → B → C → D → E**。「ダッシュボードを先に見たい」なら E を B の直後に前倒し（CWV と Index の枠は空欄で出す） |
| 2 | 新しい画面の置き方 | **推奨: SEO タブに「CWV 監視」「SEO ダッシュボード」「URL 詳細」を追加**し、検索パフォーマンスは既存の画面を拡張。別案: 既存の「サイトレポート」に統合 |
| 3 | 保存する GSC の量 | **推奨: 日次で page 上位 1,000 行 + query 上位 1,000 行 + page × query 上位 5,000 行、保持 16 か月**（GSC 自身の保持期間と同じ）。Supabase Free（500 MB）で数サイトなら収まる |
| 4 | Google Ads API を使うか | developer token（Google Ads の管理アカウント MCC が要る。申請から承認まで数日〜数週間）と、OAuth スコープ `https://www.googleapis.com/auth/adwords` の追加（本番公開の審査対象）が必要。**推奨: G は後回しにし、検索ボリュームは当面「GSC の表示回数」を需要の代わりに使う** |
| 5 | 料金プランの位置づけ | **推奨: standard（読む・測る系）**。AI の改善提案文だけ pro |
| 6 | 対象サイトの単位 | GSC のプロパティ（設定画面で選んでいるもの）を 1 サイトとする。複数サイトを扱うなら「プロジェクト」の切り替えが要る（既存の設定画面のプロジェクトと紐づけ） |

利用者側の作業（決まったら OPERATIONS.md の残タスクに手順つきで載せる）:

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google Cloud → API ライブラリ | https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com?project=seo-checker-508104 | 「Chrome UX Report API」を有効にする（段階 A の前） |
| 2 | Google Cloud → 認証情報 | https://console.cloud.google.com/apis/credentials?project=seo-checker-508104 | PageSpeed 用の API キー（`PAGESPEED_API_KEY`）の「API の制限」に Chrome UX Report API を追加する（別キーにするなら Vercel に `CRUX_API_KEY` を追加） |
| 3 | Supabase → SQL Editor | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/sql/new | 各段階のテーブル作成 SQL を実行（Claude が段階ごとに OPERATIONS.md に書く） |
| 4 | Vercel → 環境変数 / Cron Jobs | https://vercel.com/matsumatsu452-6233/seo-checker/settings/cron-jobs | 段階 B で `/api/cron/seo-refresh` が一覧に出ることを確認（`CRON_SECRET` は登録済み） |
