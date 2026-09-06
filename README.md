# SEO Checker — AIO診断・FAQ生成ツール

URL を入れると、AI検索（AIO）対策の状況を **ルールベースで診断** し、  
本文から **想定FAQを AI が提案** → 承認したものだけを **FAQPage 構造化データ + HTML** に変換するツールです。

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
| 下書き保存 | ブラウザの localStorage に URL 単位で保存 | 0 |
| PDF で保存 | ブラウザ印刷（入力欄・ボタンは非表示） | 0 |

判定基準はすべて `src/lib/analyzer/` に明文化されており、画面には判定根拠（evidence）と改善方法（advice）を併記します。

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
    api/analyze/route.ts     # POST { url } → 診断結果（10 分キャッシュ）
    api/faq/route.ts         # GET → 有効可否 / POST { url, mainText, ... } → FAQ 配列（1 時間キャッシュ）
  components/                # Checker / ScoreCard / CheckList / FaqSection / FaqOutput
  lib/
    analyzer/
      index.ts               # analyze(url): 取得 → 解析 → 採点
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

## 既知の制限と今後

- **JavaScript で描画されるページ（SPA）** は fetch した HTML に本文がないため低スコアになります。ヘッドレスブラウザによるフォールバックは未実装で、代わりに「JS描画依存の可能性」として警告を出します。
- **キャッシュはプロセス内**です。Vercel 等のサーバーレスではインスタンスごとに独立します。永続化したい場合は Supabase 等に置き換えてください。
- **認証・クレジット管理は未実装**です。公開運用する場合は、FAQ 生成 API（`/api/faq`）の前に認証と回数制限を入れてください。
- 対象サイトには `SEOChecker/0.1` の User-Agent でアクセスします。
