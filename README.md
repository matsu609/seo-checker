# SEO Checker — AIO診断・FAQ生成ツール

URL を入れると、AI検索（AIO）対策の状況を **ルールベースで診断** し、  
本文から **想定FAQを AI が提案** → 承認したものだけを **FAQPage 構造化データ + HTML** に変換するツールです。

診断は **「このページ」** と **「サイト全体」** の 2 モードがあります。

診断部分は AI を使わないため API 費用ゼロで動きます。AI を使うのは FAQ 生成だけです。

## できること

| 機能 | 仕組み | 費用 |
|---|---|---|
| AIクローラ可否 | `/robots.txt` を `robots-parser` で解析し、GPTBot / ClaudeBot / PerplexityBot 等 8 種の可否を判定。noindex、`/llms.txt`、`/llms-full.txt` の有無 | 0 |
| 構造化データ | `<script type="application/ld+json">` を再帰走査（`@graph`・入れ子・配列 `@type` 対応）し Organization / WebSite / SearchAction / BreadcrumbList / FAQPage / sameAs / Article / Product を判定 | 0 |
| メタ情報 | title / meta description（長さも判定）/ OGP / canonical / lang | 0 |
| 見出し | h1 がちょうど 1 つか、h2/h3 があり階層が飛んでいないか | 0 |
| コンテンツ | `@mozilla/readability` で本文抽出 → 文字数、画像 alt、JS 描画依存（SPA）の疑い | 0 |
| 総合スコア | 各項目に配点（pass=満点 / warn=半分 / fail=0、info は対象外）→ カテゴリ点 → 重み付き平均 | 0 |
| FAQ 生成 | 本文（先頭 1 万文字）を Claude に渡し、構造化出力で質問・回答を JSON 取得 | 従量（既定は Haiku） |
| FAQ 出力 | 承認・編集した FAQ から FAQPage JSON-LD と `details/summary` の HTML を生成、コピー可 | 0 |
| サイト全体診断 | robots.txt の Sitemap → sitemap.xml → トップの内部リンク の順にページを集め、主要ページ（既定 5、最大 10）をまとめて診断。カテゴリごとの平均・最小・最大と、項目ごとのページ間のばらつきを出す | 0 |
| 下書き保存 | ブラウザの localStorage に URL 単位で保存 | 0 |
| PDF で保存 | ブラウザの印刷ダイアログ（送信先に「PDFに保存」を選ぶ）。A4 用の印刷スタイルで、入力欄やボタンは非表示、表やコードは切らずに全部出す | 0 |

判定基準はすべて `src/lib/analyzer/` に明文化されており、画面には判定根拠（evidence）と改善方法（advice）を併記します。

### ページ単位とサイト単位

`analyze(url)` が見るのは **その URL 1 ページの HTML だけ** です。robots.txt と llms.txt はオリジン共通ですが、構造化データ・メタ情報・見出し・コンテンツはページごとの中身で決まります。したがって **同じサイトでもトップと下層ページでスコアは変わります**。たとえば下層ページには `BreadcrumbList` があるがトップには無い、トップには `WebSite` があるが下層には無い、といった差がそのまま点差になります（配点 1 の項目が 1 つ pass↔warn すると総合が 1.25 点、配点 2 なら 2.5 点動きます）。

「サイトとしてどうか」「どのページが足を引っ張っているか」を見るには **サイト全体モード**（`analyzeSite(url)` / `POST /api/site`）を使ってください。項目ごとに

- **uniform**（全ページ同じ判定）… 共通テンプレートやサイト設定の問題。1 箇所直せば全ページ直る
- **mixed**（ページで判定が分かれる）… そのページだけの問題。**ページ間でスコアが変わる原因はここに出ます**

を出し分けます。

## セットアップ

```bash
npm install
cp .env.example .env.local   # FAQ 生成を使う場合のみ ANTHROPIC_API_KEY を設定
npm run dev
```

http://localhost:3000 を開いて URL を入力してください。

### 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | FAQ 生成時のみ | 未設定でも診断は動作し、FAQ ボタンが無効になります |
| `FAQ_MODEL` | 任意 | 既定 `claude-haiku-4-5`。精度重視なら `claude-sonnet-5` 等 |
| `ALLOW_PRIVATE_HOSTS` | 開発時のみ | `1` にすると localhost / LAN 内の URL も診断可能。**本番では設定しない**（SSRF 対策が外れます） |

## コマンド

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド
npm run start      # 本番サーバー
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # vitest（診断ロジックのユニットテスト）
```

## 構成

```
src/
  app/
    page.tsx                 # 画面
    api/analyze/route.ts     # POST { url } → 1 ページの診断結果（10 分キャッシュ）
    api/site/route.ts        # POST { url, maxPages? } → サイト全体の診断結果（10 分キャッシュ）
    api/faq/route.ts         # GET → 有効可否 / POST { url, mainText, ... } → FAQ 配列（1 時間キャッシュ）
  components/                # Checker / ScoreCard / CheckList / SiteReport / FaqSection / FaqOutput
  lib/
    analyzer/
      index.ts               # analyze(url): 取得 → 解析 → 採点（1 ページ）
      site.ts                # analyzeSite(url): URL 収集 → 複数ページ診断 → 集計
      fetch.ts               # タイムアウト・サイズ上限・SSRF ガード・文字コード判定
      robots.ts  jsonld.ts  meta.ts  headings.ts  content.ts   # 各カテゴリの判定
      scoring.ts             # カテゴリ点・総合点
      types.ts               # 結果の型と配点
    faq/
      generate.ts            # Claude API 呼び出し（構造化出力）
      render.ts              # FAQPage JSON-LD / HTML の生成（純関数）
      schema.ts              # zod スキーマ
    cache.ts                 # プロセス内 TTL キャッシュ
```

## 配点の変え方

`src/lib/analyzer/types.ts` の `CATEGORY_WEIGHTS` がカテゴリ間の重み、各 `check({ weight })` が項目ごとの配点です。  
`optionalCheck` で作った項目（SearchAction / Article / Product / llms-full.txt）は「あれば表示が変わるがスコアに影響しない」任意項目です。

**採点対象の項目は、どのページでも同じ顔ぶれで出してください。** ページの状態によって項目を出したり出さなかったりすると、カテゴリの配点合計（＝分母）がページごとに変わり、中身が同じでもスコアがずれます。たとえば画像 alt の判定は画像が 0 枚のページでも `pass` として必ず出しています。例外は `js-rendering` と `jsonld-parse-error` で、これらは「壊れているときだけ出る減点項目」です。

## 既知の制限と今後

- **JavaScript で描画されるページ（SPA）** は fetch した HTML に本文がないため低スコアになります。ヘッドレスブラウザによるフォールバックは未実装で、代わりに「JS描画依存の可能性」として警告を出します。
- **サイト全体モードで診断するのは最大 10 ページ**です。sitemap から階層の浅い順に選ぶため、深い記事ページは対象外になります。全ページを網羅したい場合はクロール設計から作り直しが必要です。
- **キャッシュはプロセス内**です。Vercel 等のサーバーレスではインスタンスごとに独立します。永続化したい場合は Supabase 等に置き換えてください。
- **認証・クレジット管理は未実装**です。公開運用する場合は、FAQ 生成 API（`/api/faq`）の前に認証と回数制限を入れてください。
- **PDF はブラウザの印刷機能で出力**します（サーバー側での PDF 生成はしません）。印刷ダイアログで送信先を「PDFに保存」にしてください。用紙サイズと余白は `@page`（A4 / 上下 14mm・左右 12mm）で指定していますが、最終的にはダイアログの設定が優先されます。
- 対象サイトには `SEOChecker/0.1` の User-Agent でアクセスします。
