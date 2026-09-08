# UI 実装ノート（Tailwind v4 / PDF / 印刷 / 和文タイポグラフィ）

他の作業者向けの短い技術メモ。数値・挙動は `node_modules` の実物（tailwindcss 4.3.3、html2canvas-pro 2.4.1、jspdf 4.2.1）を読んで確認したもの。規約そのものは [ARCHITECTURE.md](./ARCHITECTURE.md) の「UI 規約」が正。

## 1. Tailwind v4 の構成

- `postcss.config.mjs` は `@tailwindcss/postcss` だけ。`tailwind.config.js` は無く、クラス検出は自動（ソース内に**完全な文字列**で書く。`"bg-" + name` のような連結は拾われない）。
- `src/app/globals.css` が唯一の入口: `@import "tailwindcss";` → `@theme { … }` → 印刷・PDF 用の素の CSS。
- `@theme` の変数は名前空間ごとにユーティリティへ展開される（`node_modules/tailwindcss/theme.css` に既定値と名前空間の一覧がある）。このリポジトリで使うもの:

| `@theme` 変数 | 生成されるユーティリティ（実際にコンパイルして確認） |
|---|---|
| `--color-accent: #5b4de0` | `bg-accent` `text-accent` `border-accent` `ring-accent` `outline-accent` `fill-accent` `stroke-accent` `divide-accent` `from-accent` `shadow-accent` `decoration-accent` … |
| `--color-accent-soft` | `bg-accent-soft` のように複数語もそのまま |
| `--font-sans` | `font-sans`。preflight が `--default-font-family: var(--font-sans)` として body にも当てる |
| `--breakpoint-sm: 40rem`（既定） | `sm:` → `@media (width >= 40rem)` |
| `--container-3xl: 48rem`（既定） | `max-w-3xl`（= 768px。PDF の `RENDER_WIDTH` と同じ）と `@3xl:` |
| `--spacing: 0.25rem` `--text-*` `--radius-*` `--shadow-*` | `p-4` `text-sm` `rounded-2xl` `shadow-sm` |

- 生成物は `:root, :host { --color-accent: #5b4de0; … }` の**本物の CSS 変数**なので、素の CSS からも `var(--color-accent)` で参照できる（globals.css の印刷ルールがそうしている）。
- **トークンの追加**: `@theme` に `--color-foo: #rrggbb;` を 1 行足すだけで `bg-foo` / `text-foo/50` などが使えるようになる。値は **hex リテラル**で書く（`oklch()` にしない）。理由は後述の `palette.ts` との同期と、不透明度修飾子のフォールバック。
- **不透明度修飾子** `bg-accent/5` は次のように展開される（確認済み）:
  ```css
  .bg-accent\/5 {
    background-color: color-mix(in srgb, #5b4de0 5%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-accent) 5%, transparent);
    }
  }
  ```
  ブラウザの computed style は `oklab(…)` / `color(srgb …)` に解決され、html2canvas-pro はそれを読める（§2）。**無印の `html2canvas` は `oklab` で例外を投げる**ので、依存を戻さないこと。
- 任意値: `bg-[#123456]` は動くが規約で禁止。変数参照の v4 構文は `bg-(--color-accent)`（v3 の `bg-[--x]` ではない）。
- ダークモードは使わない。`dark:` を書かない（`@custom-variant dark` も定義していない）。
- `print:` バリアントは標準で使える（`print:hidden` → `@media print { display:none }`）。ただし §3 のとおり **PDF ダウンロードには効かない**ので、両方で消したいものは `no-print` を使う。
- コンテナクエリは v4 標準: `@container`（`container-type: inline-size`）、`@container/card`（名前付き）、`@sm:grid-cols-2` → `@container (width >= 24rem)`、`@lg/card:flex`。サイズは `--container-*` を参照する。**レポート内部のレスポンシブはコンテナクエリを推奨**: PDF 化時はビューポート 1024px・内容幅 768px という組み合わせなので、`md:`（768px）は画面上より広い判定になるが、`@md:` はレポート要素の実幅で判定されて画面と一致する。印刷時（A4 の内容幅 ≒ 186mm ≒ 700px）もコンテナクエリは効く。
- `@utility` / `@custom-variant` は使えるが、globals.css は基盤担当のみ編集する（ARCHITECTURE 参照）。
- globals.css に書いた素のクラス（`.no-print` `.print-card` …）は `@layer` 外なので、詳細度に関係なく Tailwind のユーティリティ（`@layer utilities`）より常に勝つ。
- あるクラスが何に展開されるか確かめたいときは `tailwindcss/dist/lib.mjs` の `compile(css, { loadStylesheet })` → `build(["bg-accent/5"])` を Node で呼ぶ（`next dev` を立てる必要はない）。

## 2. html2canvas-pro（`src/lib/pdf/download.ts`）が描けるもの・描けないもの

`downloadPdf({ element })` は要素を画面外 iframe（幅 1024px）に複製し、幅 768px の `.pdf-capture` に入れて html2canvas-pro で **scale 2** のラスタ画像にし、jsPDF で A4 に分割貼付する。文字は画像になる（選択不可）。以下は 2.4.1 の `dist/lib/` を読んだ結果。

| 機能 | 状態 |
|---|---|
| 色関数 | `rgb/hsl/lab/lch/oklab/oklch/color()` をパース（`css/types/color.js` の `SUPPORTED_COLOR_FUNCTIONS`）。`color-mix()` 自体のパーサは無く、ブラウザの computed style が解決済みの値を返すことに依存 |
| グラデーション | `linear-gradient` `radial-gradient` `repeating-linear-gradient` `-webkit-gradient` のみ。**`conic-gradient` は非対応** → ドーナツを `conic-gradient` で作らない |
| `box-shadow` | inset 含め描画される（`canvas-renderer.js`）。`shadow-sm` 程度は問題ない |
| `border-radius` / `border-style` / `opacity` / `transform`(2D) / `text-shadow` / `-webkit-line-clamp` / `object-fit` / `clip-path`（基本図形） | 対応 |
| `filter` | canvas の `ctx.filter` に転送。Safari は `ctx.filter` 非対応なので**使わない** |
| `mask` / `mask-image` / `backdrop-filter` | 記述子が存在せず**無視される**（マスク無し・ぼかし無しで描かれる） |
| Web フォント | HTML の文字は `ctx.fillText` で描くので、複製ドキュメントが読み込めたフォントは使える（`document.fonts.ready` を待つ）。ただし canvas の font 文字列は style/small-caps/weight/size/family だけで、`font-feature-settings`（palt）や `font-variant-numeric` は**反映されない**（§4） |
| 外部画像 | 別オリジンの `<img>` は CORS ヘッダが無いと描けない。レポートには外部画像を置かない（アイコンはインライン SVG、どうしても必要なら data: URI） |
| `foreignObject` 描画 | `foreignObjectRendering` オプションは既定 `false` で、このリポジトリでも使わない |

### インライン SVG の扱い（ソースで確認）

- `dom/document-cloner.js`: 複製時、`isSVGElementNode`（`typeof className === "object"`＝**`<svg>` とその子孫すべて**）には `getComputedStyle` の全プロパティを `style` 属性としてインライン化する（`copyCSSStyles`）。`--*` のカスタムプロパティだけは除外（Chrome 138 対応の注記あり）。
- `dom/replaced-elements/svg-element-container.js`: その複製 `<svg>` に `width`/`height` 属性をレイアウト実寸（px）で上書きし、`XMLSerializer` → `data:image/svg+xml` にして `<img>` として描く。
- 帰結:
  - `fill="var(--color-accent)"` や `className="fill-accent"` は、複製時に解決済みの `rgb(…)` が inline style に入るので **2.4.1 では見た目どおり描かれる**。`currentColor` も `color` が一緒にインライン化されるので解決する。
  - ただし SVG は**独立した画像ドキュメント**として描かれる。外側のスタイルシート、`@font-face` の Web フォント、`<defs>` 外の `url(#id)` 参照は届かない。`<text>` は OS のシステムフォントでしか描けない。
  - `width`/`height` が実寸で上書きされるため、レイアウト上の高さが 0 の SVG（`width="100%"` だけで `viewBox` も高さも無い等）は消える。

### チャート部品への指示（ハードルール）

1. `src/components/charts/` は依存なしの `<svg>`。**色は `src/lib/ui/palette.ts` の TypeScript 定数（`@theme` と同じ hex）を `fill`/`stroke` 属性に直接書く。** CSS 変数・`fill-*` クラスに頼らない（html2canvas-pro の inline 化に依存しない／印刷・別ライブラリでも同じ結果／`fill-accent/50` のような `color-mix` 経由を避ける）。`palette.ts` は `@theme` の写しであり、両方を同時に更新する（globals.css を読んで一致を検証する vitest を `src/lib/ui/__tests__/` に置くとよい）。
2. `width`/`height` 属性は数値で必須、`viewBox` も付ける。可変幅にしたい場合も属性は残し `className="h-auto max-w-full"` で縮める。
3. `mask` / `filter` / `backdrop-filter` / `conic-gradient` / 外部画像 / `<foreignObject>` を使わない。グラデーションが要るなら `<linearGradient>` を同じ `<svg>` 内の `<defs>` に置き、`id` は `useId()` で一意にする（同じチャートを 2 つ置いたときの衝突防止）。
4. 凡例・数値ラベルはできるだけ SVG の外の HTML に置く（フォント・折返し・`tabular-nums` が効く）。SVG 内 `<text>` は目盛り程度にとどめる。
5. アニメーション（`transition`, `animate-*`）は複製時点の状態が写る。初回描画でアニメーションさせるなら、完了後の値が既定になるようにする。

## 3. 印刷 CSS（`@media print`）と PDF 複製（`.pdf-capture`）の両立

2 つの経路がある。**どちらも壊さないこと。**

| | PDF でダウンロード | `window.print()`（PDF に保存） |
|---|---|---|
| 対象 | `downloadPdf` に渡した**要素の複製だけ**（`Checker` は自分の `<main ref={reportRef}>` を渡している） | **文書全体** |
| 当たる CSS | `.pdf-capture …` の素のルール（画面の見た目を保つ。カード背景・枠は残る） | `@media print`（紙用に組み直す。カード枠・影を消し、`html/body` の flex/height を解除、`main` の幅・余白を 0、`@page` A4） |
| 効くクラス | `no-print`（消える）・`print-only`（出る）・`overflow-x-auto`/`pre`/`line-clamp-2` の解除 | `no-print`・`print-only`・`print-card`・`print:*` ユーティリティ |

新しいサイドバー／アプリシェル（`src/components/shell/`）を入れるときの要件:

- **サイドバー（`<aside>`）とトップバーには `no-print`** を付ける。`print:hidden` だけだと印刷では消えるが `.pdf-capture` には効かない（複製対象に含めなければ実害は無いが、規約として `no-print` に統一する）。`position: fixed` の要素は Chrome の印刷で全ページに繰り返し出るので、必ず消す。
- **シェルのラッパーは印刷時に通常フローへ戻す**。`md:grid-cols-[16rem_1fr]` や `md:pl-64`、`h-screen overflow-y-auto` のような画面用レイアウトは、そのまま印刷すると 1 ページ目で切れる。ラッパーに `print:block print:h-auto print:overflow-visible`、`<main>` に `print:max-w-none print:p-0 print:m-0`（既存の `@media print main { … !important }` も残っている）。スクロールコンテナを `<main>` ではなく `body` に持たせるのが最も安全。
- **`<main>` は 1 つ**。シェルが `<main>` を持つなら、各ページのレポートルートは `<div ref={reportRef}>` になる。その場合 `.pdf-capture main` の余白解除が効かなくなるので、レポートルート自身には外側の `mx-auto max-w-* px-* py-*` を持たせず（余白は `<main>` 側）、必要なら基盤担当が `.pdf-capture > *` 向けのルールを globals.css に足す。
- **レポートルートは自己完結**させる。PDF の複製は `<body class>` と `<style>/<link>` だけを引き継ぐ。祖先の `@container`、祖先に付けたテーマクラス、React の context に依存した見た目は写らない。タイトル・URL・日時のヘッダはトップバーではなくレポート内に `print-only` で持つ（`FaqSection` / `Checker` の既存パターン）。
- **カードは `<section class="print-card …">`** にする。`download.ts` の `BREAK_SELECTOR`（`section, section > *, li, tr, h1-h4, p, pre, table, dl > div`）の下端でページを切るので、チャートはセクションの直下の子（または `<figure>` 直下）に置き、1 つの要素が A4 1 ページ（`pageHeightPx` = 768 × 277 / 190 ≒ 1120px）を超えないようにする。
- **チャートは `width`/`height` 属性必須**（§2）。印刷幅は 768px より狭いので、幅 700px を超えるチャートは `max-w-full h-auto` で縮む前提で `viewBox` を付ける。
- 横スクロール表は `overflow-x-auto` というクラス名のまま使う（両経路で解除ルールがある）。`line-clamp-2` / `pre` の `max-height` も同様。
- 長さの上限: canvas は 1 辺 32,000px・面積 2.5 億 px。scale 2 では約 16,000 CSS px（A4 で 14 ページ強）を超えると `fitScale` が自動で解像度を落とす。300 行の表をそのまま載せるレポートは要注意（PDF 用に折りたたむか、行数を絞る）。

## 4. 和文タイポグラフィ

- フォントは `@theme --font-sans`: Hiragino Sans（macOS/iOS）→ Hiragino Kaku Gothic ProN → Noto Sans JP → Yu Gothic（Windows）→ Meiryo → system-ui…。**Web フォントは読み込んでいない**（`next/font` 不使用）ので OS ごとに見た目が変わるのは仕様。`<html lang="ja">` は必須（漢字の字形選択に効く。`download.ts` は iframe にも `lang` を写している）。`html` に `antialiased`。
- `body { font-feature-settings: "palt" }` で全角文字を詰める（プロポーショナル）。**部品側で `font-feature-settings` を上書きしない**（低レベルプロパティなので `"tnum"` と書いた瞬間に palt が外れる）。唯一の例外は globals.css の `.pdf-capture` の打ち消し（下記）。数字の等幅は `tabular-nums` ユーティリティ（`font-variant-numeric`）を使う。palt と tnum は別機能なので共存する。
- `tabular-nums` の注意:
  - 効くのはフォントに `tnum` があるときだけ。フォールバック先（Hiragino / Noto Sans JP / Yu Gothic / Meiryo）で数字の既定幅も `tnum` の有無も違うので、**数値列は `text-right` で右揃えにし、スペースで桁を揃えない**（既存 `ScoreCard` / `SiteReport` はこの形）。
  - **PDF 化（html2canvas-pro）では `.pdf-capture` の中だけ `font-feature-settings` / `font-variant-numeric` を `normal !important` に戻している**（globals.css）。canvas 2D の `font` 文字列に渡せるのは style / variant(normal・small-caps) / weight / size / family だけで、`font-feature-settings` と `font-variant-numeric` は渡らない（`html2canvas-pro/dist/lib/render/canvas/text-renderer.js` の `createFontStyle`）。一方で描画位置は DOM の実測値（`lib/css/layout/text.js` の `parseTextBounds` → `getClientRects`）を使う。打ち消さないと **DOM は palt で詰めた狭い幅で位置を決め、canvas は詰めていない広い字形を描く**という食い違いになり、`（` `）` `・` `。` などの約物が隣の文字に重なる。palt を実装したフォント（Hiragino Sans など）でだけ起きるので、環境によって出たり出なかったりする。打ち消しが当たるのは複製だけで、画面表示は palt のまま。ルールの存在は `src/app/__tests__/pdf-capture-css.test.ts` が守る。
  - 打ち消した後も、canvas は単語ごとに DOM の実測位置へ描くのでサブピクセルのずれは残る。ピクセル単位で揃う前提の UI（数字とバーの厳密な位置合わせ等）は作らない。数字はバーの外に置く。
  - `.pdf-capture` で **`font-kerning` は触らない**。canvas の既定はカーニング有効なので、DOM 側だけ `none` にすると逆向きの食い違いを新しく作ることになる。
- 日本語はどこでも折り返せるが、URL や JSON はそうではない。長い英数字列には `break-all`（または `break-words`）、`<pre>` は印刷・PDF で `pre-wrap` になる前提で書く。
- 本文は `text-sm` + `leading-relaxed` 程度が読みやすい。`tracking-tight` は和文には使わない（palt と二重に詰まる）。
