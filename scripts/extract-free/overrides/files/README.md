# 無料 SEO・MEO・AIO 診断（切り出し版）

SEO Checker（`app.seo-checker.tokyo`）から、**無料診断の機能だけ**を取り出して単体で動くようにした Next.js アプリです。

- **サイトの診断（`/`）** — URL を入れるだけ。検索エンジンと AI 検索（AIO）に読まれる土台をルールベースで採点し、報告書として PDF に出せます。**API キー不要**。
- **店舗の診断（`/meo`）** — 店名を入れるだけ。Google マップの店舗情報（ビジネス プロフィール）を 4 カテゴリ・21 項目で採点します。**Google Places のキーが必要**。

ログインはありません（この版は認証を持たない）。どちらの診断もそのまま公開して使えます。

```bash
npm install
cp .env.example .env.local   # サイトの診断だけなら設定不要
npm run dev                  # http://localhost:3000
```

---

## 画面と API

| パス | 内容 |
|---|---|
| `/` | 無料 SEO・AIO 診断（サイト） |
| `/meo` | 無料 MEO 診断（Google マップの店舗） |
| `/api/analyze` | 1 ページの診断 |
| `/api/site` | サイト全体の診断（進捗を配信しながらクロール） |
| `/api/faq` | 想定 FAQ の生成（`ANTHROPIC_API_KEY` があるときだけ） |
| `/api/meo/search` | 店名・地域で店舗を検索 |
| `/api/meo/report` | 選んだ店舗の採点 |
| `/plans`・`/sign-up` | 本体サービスへの案内（`NEXT_PUBLIC_MAIN_APP_URL` へ転送するだけ） |

---

## サイトの診断（`/`）

判定はすべてルールベースで、生成 AI は使っていません（想定 FAQ の生成のみ任意で AI を使います）。

### 2 つの診断範囲

| 範囲 | 対象 |
|---|---|
| このページ | 入力した URL 1 ページ |
| サイト全体（全ページ） | sitemap（索引の再帰展開）と内部リンクの幅優先探索でサイトの全ページを収集して診断 |

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

スコアはこのツール独自の技術チェック表の達成率です。検索順位・流入・AI の回答への引用を測るものではなく、それらを予測するものでもありません。

### 出力

- **PDF でダウンロード** — 画面をブラウザ内で A4 の PDF にします（画像なので文字は選択できません）
- **印刷** — 印刷ダイアログから「PDF に保存」を選ぶと、文字を選択・検索できる PDF になります

---

## 店舗の診断（`/meo`）

店名・地域で検索して 1 店舗を選ぶと、公開情報だけで基本情報 / 投稿 / 写真 / レビューの 4 カテゴリ・21 項目を採点し、総合評価 A〜E・改善ヒント・総評（ルール生成）・口コミ情報（平均評価・件数・直近の口コミ・星の分布）を報告書にします。PDF 出力に対応。

`GOOGLE_PLACES_API_KEY` が未設定なら、画面は「準備中」を出して実行できません（環境変数名は画面に出しません）。

**Google Places には呼び出しごとに実費が出ます。** 公開して使う場合は上限の設定を確認してください。

| 守り | 既定 | 変え方 |
|---|---|---|
| IP ごと（検索） | 30 回 / 時 | `src/lib/free/ratelimit.ts` |
| IP ごと（報告書） | 10 回 / 時 | `src/lib/free/ratelimit.ts` |
| 全体（検索） | 1,500 回 / 日 | `FREE_MEO_DAILY_SEARCH_LIMIT` |
| 全体（報告書） | 500 回 / 日 | `FREE_MEO_DAILY_LIMIT` |

`FREE_MEO_DAILY_LIMIT=0` にすると無料 MEO 診断を止められます。回数の記録はプロセス内のメモリなので、サーバーレスではインスタンスごとに独立します（上限は「おおよその歯止め」です）。

---

## 環境変数

`.env.example` を `.env.local` にコピーして設定します。キーはすべてサーバー側でのみ読み、ブラウザには渡しません（`NEXT_PUBLIC_` の付いたものを除く）。

| 変数 | 要否 | 用途 |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | `/meo` に必須 | Google Places API (New) |
| `FREE_MEO_DAILY_LIMIT` / `FREE_MEO_DAILY_SEARCH_LIMIT` | 任意 | 無料 MEO 診断の 1 日の上限 |
| `ANTHROPIC_API_KEY` | 任意 | 想定 FAQ の生成。無ければその欄を出さない |
| `SITE_MAX_PAGES` | 任意 | サイト全体モードのページ数上限（既定 300、最大 1000） |
| `NEXT_PUBLIC_APP_VERSION` | 任意 | サイドバー下のバージョン表記 |
| `NEXT_PUBLIC_CONTACT_NAME` / `NEXT_PUBLIC_CONTACT_URL` | 任意 | レポート末尾「次のステップ」の連絡先 |
| `NEXT_PUBLIC_SERVICE_GUIDE_URL` | 任意 | 配布するサービス資料のファイル。未設定ならその場で PDF を組み立てる |
| `NEXT_PUBLIC_MAIN_APP_URL` | 任意 | 有料プラン・登録の案内リンクの送り先（既定 `https://app.seo-checker.tokyo`） |
| `ALLOW_PRIVATE_HOSTS` | 開発用 | localhost や LAN 内のサイトを診断したいときだけ `1`。**本番では絶対に設定しない** |

---

## コマンド

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド
npm run start      # 本番サーバー
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # vitest（判定ロジックの単体テスト）
```

---

## 構成

```
src/
  app/
    page.tsx            # 無料 SEO・AIO 診断
    meo/page.tsx        # 無料 MEO 診断
    api/                # analyze / site / faq / meo（Route Handler、nodejs runtime）
  components/
    free/               # 無料診断の画面とレポート
    maps/report/        # MEO 報告書の表示
    ui/ charts/ shell/  # 共通部品・依存なしの SVG グラフ・シェル
  lib/
    analyzer/           # 判定ルール（fetch.ts の assertPublicHost + fetchText が唯一の取得経路）
    crawl/              # 全ページクロール（sitemap 展開 + 内部リンク BFS）
    report/             # レポートの導出（グレード・講評・優先改善）
    maps/               # Google Places の取得と MEO の採点
    faq/                # 想定 FAQ の生成
    free/ratelimit.ts   # 無料 MEO 診断の回数制限
    ui/                 # 色トークンの単一定義（palette.ts / grade.ts）
```

### 設計上の約束（本体から引き継いでいます）

- **ユーザーが入れた URL をサーバーで取得するときは、必ず `assertPublicHost` → `fetchText`（`src/lib/analyzer/fetch.ts`）を通す。** リダイレクトは自分で追い、初回のホップを含めて毎回ホストを検査します（SSRF 対策）。
- **色は `src/lib/ui/palette.ts` と `globals.css` の `@theme` トークンだけ**から取ります。JSX に生の hex は書きません。
- **データを捏造しない。** 測れなかった項目は「未取得」として扱い、0 や「なし」と混同しません。
- 判定ロジックは純関数として `src/lib/**` に置き、`__tests__` でテストします。

---

## 本体（SEO Checker）との違い

入っていないもの:

- ログイン（Clerk）・課金（Stripe）・Supabase への保存
- `/tools/*` のツール群、`/settings`、`/admin`、口コミ支援のアンケート（`/r/<slug>`）
- 利用規約・プライバシーポリシー・特商法表記のページ（**公開して使う場合はご自身で用意してください**）

本体と中身が違うファイルは 4 つだけです（ほかはすべて本体と同じ中身をそのままコピーしています）。

| ファイル | 変更点 |
|---|---|
| `src/app/layout.tsx` | `ClerkProvider` を外した |
| `src/components/shell/AppShell.tsx` | ログインの有無を渡す引数を外した |
| `src/components/shell/TopBar.tsx` | 右端のログイン表示を外した |
| `src/components/shell/Sidebar.tsx` | 無料診断 2 本だけにした（ツール一覧・プランの鍵・要設定バッジ・マスター画面を削除） |

この版だけにある追加ファイル: `src/lib/main-app.ts`、`src/app/plans/page.tsx`、`src/app/sign-up/page.tsx`（いずれも本体サービスへの案内用）。

機能の定義（`src/lib/features/registry.ts`）と料金プラン（`src/lib/plans/catalog.ts`）は、サービス資料の PDF を組み立てるために本体と同じものをそのまま持っています。

---

## 既知の制限

- **JavaScript で描画されるページ（SPA）** は取得した HTML に本文が無いため低スコアになります。代わりに「JS 描画依存の可能性」として警告を出します。
- **キャッシュと回数制限はプロセス内**です。サーバーレスではインスタンスごとに独立します。
- 対象サイトには `SEOChecker/0.1` の User-Agent でアクセスします。

---

この zip は本体リポジトリの `node scripts/extract-free.mjs` で作っています（本体の更新に追従して作り直せます）。
