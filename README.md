# SEO Checker — 無料 AIO 診断 + SEO/LLMO ツール

URL を入れるだけで AI 検索（AIO）への対応状況を採点する**無料診断**と、SEO / LLMO の運用に使う**12 種のツール**をひとつにまとめた Next.js アプリです。

左のサイドバーで両者を明確に分けています。無料診断はログインも API キーも不要で、そのまま報告書として PDF に出せます。ツール群は用途に応じて外部 API を設定して使います。

```bash
npm install
cp .env.example .env.local   # 使いたい機能に応じてキーを設定（無料診断は不要）
npm run dev                  # http://localhost:3000
```

---

## 無料 AIO 診断（`/`）

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
| AI クローラ可否 | 20 | robots.txt での GPTBot / ClaudeBot / PerplexityBot などの可否、noindex、llms.txt |
| 構造化データ | 25 | Organization / WebSite / SearchAction / BreadcrumbList / FAQPage / sameAs / Article / Product |
| メタ情報 | 20 | title、meta description（長さ）、OGP、canonical、lang |
| 見出し | 15 | h1 がちょうど 1 つか、h2 / h3 の階層が飛んでいないか |
| コンテンツ | 20 | 本文の文字数、画像の alt、JS 描画依存（SPA）の疑い |

各項目は pass（満点）/ warn（半分）/ fail（0 点）で採点し、info は採点対象外です。配点は `src/lib/analyzer/types.ts` の `CATEGORY_WEIGHTS` と各 `check({ weight })` で変えられます。

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
| [ページ診断](src/lib/page-diagnosis) | A4 | 対策キーワードの上位 10 件と自社ページを比較し、検索意図・不足要素・title / description 案を提案。診断結果を踏まえたチャット | SerpApi または Anthropic |
| [AIO 頻出トピック](src/lib/aio-topics) | A5 | AI Overviews の本文からトピックを抽出し、出現割合・傾向・優先度と自社の不足トピックを表示 | SerpApi + Anthropic |

### 計測

| ツール | ID | 内容 | 必要なキー |
|---|---|---|---|
| [順位計測・AI Overviews 引用](src/lib/rank) | B1-B3 | 登録キーワードの順位・変化・ランディング URL、その場で測るリアルタイム計測、AI Overviews の引用を 5 区分（自社のみ / 競合のみ / 両方 / なし / AIO 表示なし）で集計 | SerpApi |
| [LLMO モニタリング・LLM リサーチ](src/lib/llmo) | B4 / B8 | 登録プロンプトを複数の LLM に投げ、ブランド言及率・ドメイン引用率・回答原文・引用元を記録。LLM が内部で発行した検索クエリ（ファンアウト）も保存 | Anthropic（OpenAI / Gemini / Perplexity は任意） |
| [プロンプト拡張](src/lib/llmo) | B7 | 参考プロンプトと対象サイトから、関連プロンプトをカテゴリ付きで 50 本程度生成 | Anthropic |
| [生成 AI 流入分析](src/lib/ai-traffic) | B6 | GA4 の参照元から生成 AI の流入を切り出し、AI 検索率（対総セッション / 対自然検索）、サービス別内訳、ページ × 流入元 × キーイベント | GA4 |
| [サイトレポート](src/lib/site-report) | E8 | GA4 の KPI の前期比、チャネル別流入と登録キーワードの平均順位・ファインダビリティスコア、自社・競合の最新順位表 | GA4 + SerpApi |

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

## 環境変数

無料診断はどれも不要です。

| 変数 | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | FAQ 生成、各種サマリー、LLMO（Claude）、プロンプト拡張、AI ライティング |
| `LLM_MODEL` | 分析・生成のモデル（既定 `claude-opus-5`） |
| `LLM_FAST_MODEL` | 分類など大量処理のモデル（既定 `claude-haiku-4-5`） |
| `FAQ_MODEL` | FAQ 生成のモデル（既定 `claude-haiku-4-5`） |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY` | LLMO モニタリングの対象を増やす |
| `SERPAPI_KEY` | 順位計測、AI Overviews の引用チェック、ページ診断の上位 10 件 |
| `PAGESPEED_API_KEY` | PageSpeed Insights（未設定でも低頻度なら動作） |
| `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` | 生成 AI 流入分析、サイトレポート |
| `SITE_MAX_PAGES` | クロール上限（既定 300、最大 1000） |
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
docs/
  reference/                  # 競合ツールの機能調査と実装ガイド
  dev/                        # 設計仕様・Next.js / UI の開発メモ
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
