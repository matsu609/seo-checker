# デザイン仕様（最終版）— 無料診断レポートとアプリシェル

対象: `/`（無料 AIO 診断）のレポート画面・PDF・印刷、および全ページ共通のアプリシェル（サイドバー / トップバー）。
`/tools/*` は同じトークン・部品を使う。規約の上位文書は [ARCHITECTURE.md](./ARCHITECTURE.md)、技術制約は [ui-notes.md](./ui-notes.md)。

## 0. 3 案の審査と採用方針

| 基準 | consulting（紺の報告書） | clinical（健康診断の結果票） | editorial（雑誌の特集記事） |
|---|---|---|---|
| 信頼感（コンサルの報告書に見えるか） | **5** | 4 | 3（暖色・余白多めで「読み物」寄り） |
| 端的さ（1 画面サマリー） | 4 | **5**（グレード印を先頭に、30 秒で説明できる構成） | 3（64px 余白で密度が下がる） |
| 差別化（紫の元ツール・競合） | 3（紺はミエルカの青と同系に見えうる） | 4 | **5** |
| 実装容易性（Tailwind v4 + inline SVG） | **5**（寸法・クラスまで具体的） | 4 | 3（下線入力・段組など独自要素） |
| 印刷 / PDF 適性 | 4（紺の帯はインクを食う） | **5**（枠線 + 文字色で成立） | 4 |
| アクセシビリティ（文字 4.5:1） | 4（warn #a2670f は soft 地で 4.3） | **5**（*-ink を分離） | 3（アクセントと fail/warn が近い） |

**採用: consulting を土台にする。** 色相だけ紺から「藍（ペトロール寄りの深い青緑）」に寄せて、紫の元ツールとミエルカの青の両方から離す（差別化 3→4）。
clinical から「表紙のグレード印」「判定基準の 1 行」「50 / 80 の目盛」「枠線付きピル（背景オフの印刷でも読める）」「閾値の単一定義 `grade.ts`」「soft 地でも 4.5:1 を満たす判定色」「ヒート表の 40 行分割」を移植。
editorial から「見出しはウェイト差ではなくサイズ差で階層を作る（Windows の Yu Gothic 対策）」「advice は箱ではなく左罫の引用ブロック」「付録の 2 段組」「全項目合格などの端ケースの文言」を移植。
不採用: 暖色パレット（判定色と衝突）、下線入力、10 区分ヒストグラム（ページ数が少ないと空柱だらけになる）、紺の上に amber / red のバッジ。

## 1. トークン

`src/app/globals.css` の `@theme` を次の値に差し替える（既存トークン名は維持し値だけ変える）。すべて hex リテラル。

| トークン | hex | 用途 | 検証した対比 |
|---|---|---|---|
| surface | `#eef1f4` | 画面の地 | — |
| panel | `#ffffff` | 報告書シート・カード | — |
| ink | `#142230` | 本文 | 白地 16.1 |
| muted | `#56657a` | 補助文字 | 白地 5.9 / surface 5.2 |
| line | `#d3dbe2` | 罫線・枠 | — |
| brand | `#0b3547` | サイドバー・表紙帯 | 白文字 13.0 |
| on-brand | `#ffffff` | brand 上の文字 | — |
| on-brand-muted | `#b5c6d0` | brand 上の補助文字 | brand 上 7.4 |
| accent | `#14607a` | ボタン・リンク・番号・棒 | 白地 7.0 / 白文字 7.0 |
| accent-strong | `#0f4a5f` | hover | 白文字 9.7 |
| accent-soft | `#e2eef3` | 選択状態・チップ地 | accent 文字 6.0 |
| secondary | `#5b7080` | 目標線・目盛・凡例 | 白地 5.2 |
| pass / pass-soft | `#1a7549` / `#e6f3eb` | 合格（文字・塗り / 地） | 白地 5.7、soft 地 5.0 |
| warn / warn-soft | `#8f5a06` / `#f8eedc` | 改善余地 | 白地 5.8、soft 地 5.0 |
| fail / fail-soft | `#b3261e` / `#f8e3e1` | 未対応 | 白地 6.5、soft 地 5.3 |
| info / info-soft | `#3a6f9e` / `#e6eef5` | 参考（採点外） | 白地 5.3、soft 地 4.5 |
| chart-1 〜 chart-6 | `#14607a` `#2b3f6b` `#4f8fa8` `#8c6d3f` `#6f7f92` `#a06f8c` | 系列色（ツール用。無料診断は chart-1 のみ） | 塗り専用（文字に使わない） |
| chart-track / chart-grid | `#e6ebef` / `#d3dbe2` | 棒のトラック・グリッド線 | — |
| grade-a / b / c / d / e | `#176b45` `#2f7f47` `#8f5a06` `#b5541c` `#b3261e` | グレード印・ゲージ | 白地 6.5 / 4.9 / 5.8 / 4.9 / 6.5 |

- `text-pass` / `text-warn` / `text-fail` / `text-info` は文字にそのまま使える（全て白地 ≥ 4.5:1）。soft 地の上に載せる文字も同色で可。
- grade-c = warn、grade-e = fail は意図的な同色（「C = 改善域、E = 未対応域」を色でも一致させる）。
- 紫（元ツール #5b4de0）系は一切定義しない。

`src/lib/ui/palette.ts`（@theme の写し。チャートの `fill` / `stroke` はここから取る）:

```ts
export const palette = {
  surface: "#eef1f4", panel: "#ffffff", ink: "#142230", muted: "#56657a", line: "#d3dbe2",
  brand: "#0b3547", onBrand: "#ffffff", onBrandMuted: "#b5c6d0",
  accent: "#14607a", accentStrong: "#0f4a5f", accentSoft: "#e2eef3", secondary: "#5b7080",
  pass: "#1a7549", passSoft: "#e6f3eb", warn: "#8f5a06", warnSoft: "#f8eedc",
  fail: "#b3261e", failSoft: "#f8e3e1", info: "#3a6f9e", infoSoft: "#e6eef5",
  chart: ["#14607a", "#2b3f6b", "#4f8fa8", "#8c6d3f", "#6f7f92", "#a06f8c"] as const,
  chartTrack: "#e6ebef", chartGrid: "#d3dbe2",
  grade: { A: "#176b45", B: "#2f7f47", C: "#8f5a06", D: "#b5541c", E: "#b3261e" } as const,
} as const;
export type StatusTone = "pass" | "warn" | "fail" | "info";
```

`src/lib/ui/__tests__/palette.test.ts` で globals.css を読み、`--color-<kebab>` と `palette.<camel>` の hex が一致することを検証する（`chart[i]` ↔ `--color-chart-${i+1}`、`grade.A` ↔ `--color-grade-a`）。

### グレードと判定の閾値（`src/lib/ui/grade.ts` に一元化）

| グレード | 範囲 | 帯ラベル | 色 |
|---|---|---|---|
| A | 90–100 | 優良 | grade-a |
| B | 80–89 | 良好 | grade-b |
| C | 65–79 | 改善余地あり | grade-c |
| D | 50–64 | 要改善 | grade-d |
| E | 0–49 | 要対策 | grade-e |

`gradeOf(score)`, `gradeLabel(grade)`, `toneOf(score)`（≥80 pass / 50–79 warn / <50 fail。既存 `tone()` はこれを呼ぶ形に置き換える）を export する。ヒート表のセル色・カテゴリ数値の色・ヒストグラムの区分はすべてこの関数から引く。

## 2. タイポグラフィ・間隔・カード・バッジ

- フォントは既存 `--font-sans` のまま（Web フォント無し）。ウェイトは **400 と 700 の 2 段だけ**（500 / 600 は OS で太さが揃わない）。階層はサイズ差で作る。
- 和文に `tracking-*` を付けない。`font-feature-settings` を部品側で上書きしない。数値は常に `tabular-nums` + `text-right`。URL / パスは `break-all`。
- 印刷時は `html` が 14px になるので、文字サイズは `text-*` / rem で書き、px を直接書くのは SVG の `width` / `height` 属性だけ。

| 要素 | サイズ / ウェイト / 色 |
|---|---|
| 表紙 キッカー（英字のみ tracking 可） | 11px / 700 / on-brand-muted `tracking-[0.12em]`「AIO DIAGNOSTIC REPORT」 |
| 表紙 タイトル「AI検索最適化（AIO）診断報告書」 | 22px / 700（@md: 26px）/ on-brand |
| 表紙 サイト名（ホスト名） | 18px / 700 / on-brand、`break-all` |
| 表紙 メタ dt / dd | 11px / 400 / on-brand-muted ・ 14px / 700 / on-brand（URL は 13px / 400） |
| h2 セクション見出し | 18px / 700 / ink。先頭に通し番号（「1.」tabular）、左に 4px×20px の brand バー、下に 1px line。`mt-8 mb-4` |
| h3 | 14px / 700 / ink、`mt-6 mb-2` |
| 本文 | 14px / 400 / ink / `leading-relaxed`（1.7）。講評 3 行は 15px |
| 表 | 本文 13px、thead 12px / 700 / muted、行罫 1px line、行高 32–36px |
| 総合スコア（ドーナツ中央） | 40px / 700 / ink tabular + 「/100」12px muted |
| グレード印 | 56×56、2px 枠（グレード色）、`rounded-sm`、文字 32px / 700 / グレード色、下に帯ラベル 11px / 700 同色 |
| カテゴリ数値 | 20px / 700 / `toneOf` の色 |
| KPI ストリップ数値 | 22px / 700 / ink + ラベル 11px muted |
| 根拠（evidence）・注記 | 12px / 400 / muted。脚注は 11px |

- 間隔は 4px 基準。セクション間 32px、見出し→内容 16px、KPI セル `py-3`。報告書らしい密度にし、ダッシュボードのような余白を取らない。
- カード: レポートは「1 枚の白いシート」= `bg-panel border border-line rounded-sm`（影なし）。カードの入れ子禁止。サブブロックは `border border-line rounded-sm` か `bg-surface` の帯だけ。角丸は `rounded-sm`(2px) / `rounded-md`(4px) のみ、ピルだけ `rounded-full`。`shadow-*` は使わない。
- セクション区切り: 画面では番号付き h2 + 1px 罫線 + `border-t border-line pt-6`、紙では print-card の背景・余白が消えて見出しと罫線だけが残る。

バッジ（`ui/Badge`）: 11px / 700、`rounded-full px-2 py-0.5`、**必ず 1px の枠線**を付ける（背景のグラフィック off でも判定が読める）。

| 種類 | 文字 / 枠 | 地 | 文言 |
|---|---|---|---|
| pass | pass | pass-soft | 合格 |
| warn | warn | warn-soft | 改善余地 |
| fail | fail | fail-soft | 未対応 |
| info | info | info-soft | 参考 |
| grade A–E | grade-* | panel | A〜E（帯ラベルは別要素） |
| 無料 | accent | accent-soft | 無料 |
| 機能 ID | muted、`font-mono` 10px | panel、枠 line、`rounded-sm` | A1 など |
| β / 準備中 / 要設定 | muted | surface | β / 準備中 / 要設定 |

ピルには 12px のインライン SVG アイコン（既存 `Icons.tsx` の StatusIcon）を文字の左に添え、色だけに頼らない。

## 3. レポート構造

レポートルートは `<div ref={reportRef} className="@container">`、外側余白は `<main>` 側（`mx-auto max-w-3xl px-4 py-6 md:px-8`）。シート = `bg-panel border border-line rounded-sm`。レスポンシブは `@md:`（コンテナ幅 28rem 以上）で判定する。
**サイト名の扱い**: `<title>` からの切り出しはノイズが出るため使わない。大見出しはホスト名（`www.` を除く）、その下に `<title>` を 13px on-brand-muted で全文表示。

### 3.1 共通: 表紙ヘッダー（`free/ReportCover`、print-card を付けない）

`<header className="bg-brand text-on-brand px-6 py-6 @md:px-8">`。左: キッカー → タイトル → ホスト名 → title。右上: グレード印（総合。site は平均）と「総合評価」11px。下段 dl（`@md:grid-cols-4`）: 「対象 URL」= page: finalUrl / site: entryUrl／「診断日」= YYYY年M月D日 HH:mm／「診断ページ数」= page:「1 ページ」/ site:「128 ページ（sitemap.xml から収集・取得失敗 3 件）」（既存 DISCOVERY_LABEL を再利用）／「診断方式」=「ルールベース（無料診断）」。最下行 11px on-brand-muted「公開 HTML・robots.txt・llms.txt・sitemap.xml を対象とした自動診断です。採点基準は付録 B をご覧ください。」
「直近の診断結果を表示しています」（cached）は帯の外に no-print で出す。

### 3.2 PAGE モード

| # | 見出し | 内容 | チャート |
|---|---|---|---|
| 1 | 総合評価 | 左列（`@md:grid-cols-[11rem_1fr] gap-6`）: DonutGauge + 下に「判定基準: A 90〜 / B 80〜 / C 65〜 / D 50〜 / E 〜49」11px。右列: h3「講評」3 行 + 「※ルールに基づく自動生成」11px、h3「優先改善 TOP3」表（# / 改善項目 / カテゴリ / 見込み効果）。最下段 StatStrip 4 セル: 診断項目 / 合格 / 改善余地 / 未対応（info は「参考 N 件（採点対象外）」を脚注に）。ブロック全体の高さ ≤ 520px | DonutGauge, StatStrip |
| 2 | カテゴリ別スコア | 導入 1 行「総合スコアは 5 カテゴリを配点で加重平均した値です。」→ HBar 5 行（CATEGORY_ORDER）→ 表: カテゴリ / 配点（20・25・20・15・20）/ スコア / 判定（ピル: toneOf） | HBar |
| 3 | 判定の内訳 | `@md:grid-cols-2 gap-8`。左: Donut（合格 / 改善余地 / 未対応）+ 凡例表（■ / 区分 / 件数 / 割合）。右: h3「未対応の項目」fail の label を最大 5 件の箇条書き（無ければ「未対応の項目はありません。」） | Donut |
| 4 | 改善提案（詳細） | カテゴリごとに h3「カテゴリ名 — 72 点」→ `<ul>`。各 `<li>` = `grid grid-cols-[5.5rem_1fr] gap-3 border-b border-line py-3`: 左 = 判定ピル、右 = 項目 label 14px ink → evidence 12px muted → advice 13px を `border-l-2 border-accent pl-3 mt-2` の引用ブロック。並びは 未対応 → 改善余地 → 参考 → 合格。合格は label のみの 1 行 | — |
| 5 | 想定 FAQ（AI 生成） | 既存 FaqSection。見出し脇にピル「任意・AI 生成」。編集 UI は no-print。API 未設定時は 1 行注記のみ（ダミーを出さない） | — |
| 付録 A | 診断対象ページの情報 | dl（`@md:grid-cols-2`）: URL / HTTP ステータス / title / description / lang / 本文文字数 / JSON-LD の @type / h1 数。`result.notes` の ※ はここに移す | — |
| 付録 B | 診断方法と採点基準 | 表 1: カテゴリ / 配点 / 主な確認内容（robots.txt の AI クローラ許可・llms.txt／JSON-LD の種類と文法／title・description・canonical・OGP・lang／h1 の数と階層／本文量と可読性）。表 2: 判定と得点（合格 100% / 改善余地 50% / 未対応 0% / 参考 対象外）。表 3: グレード閾値。注意書き「表示速度・被リンク・検索順位は含みません。」＋診断日時（秒まで）・ツール名・バージョン | 任意: StackedBar（配点構成） |
| — | 次のステップ | 「本レポートは無料診断版です。全ページの詳細診断や改善実装のご相談は下記まで。」+ 連絡先。`NEXT_PUBLIC_CONTACT_NAME` / `NEXT_PUBLIC_CONTACT_URL` が無ければブロックごと非表示 | — |

検索に載せないページ（サイト内検索の結果・買い物かごなどが noindex / robots.txt で実際に検索から外されているもの。`AnalysisResult.excluded`、判定は `src/lib/analyzer/page-kind.ts`）を単体で診断したときは、シートの先頭に Callout（info）「このページは検索に載せないページです（採点は参考）」を置く。採点自体は変えない。

### 3.3 SITE モード

| # | 見出し | 内容 | チャート |
|---|---|---|---|
| 1 | 総合評価 | 3.2 と同じ構成。ドーナツ中央の脇に「128 ページ平均」11px、判定基準の下に「最高 92 点 / 最低 41 点（/blog/old-post）」。TOP3 表に列「該当ページ」（「37 / 128」）。StatStrip の先頭ラベルは「判定数」（ページ × 項目） | DonutGauge, StatStrip |
| 2 | カテゴリ別スコア | HBar は平均の棒 + 最低〜最高のレンジ帯。表に「最低〜最高」「最低点のページ」（path、break-all）列を追加 | HBar(range) |
| 3 | 判定の内訳とページ別スコア分布 | 左: Donut（Σ counts、ページ × 項目）+ 凡例 + 1 行「全ページ共通で未対応の項目 N 件」。右: h3「ページ別スコア分布」ColumnChart（A〜E の 5 区分）+ 1 行「最も多い区分は C（改善余地あり）: 61 ページ。平均 68 点 / 中央値 70 点」 | Donut, ColumnChart |
| 4 | ページ × カテゴリ 一覧 | 導入文「同じサイトでもテンプレートと個別コンテンツの違いでページごとに点数が変わります。」→ HeatTable。行 = 総合の低い順（入力 URL は先頭固定）。脚注「セルの色: 80 以上 = 合格域 / 50〜79 = 改善域 / 50 未満 = 未対応域」。採点対象外のページがあれば脚注に「検索に載せないページ N 件は採点対象外のため、この一覧と平均に含めていません（付録 A 参照）」 | HeatTable |
| 5 | 改善提案（詳細） | 既存の 2 群を維持: h3「全ページ共通の問題（テンプレート・サイト設定を 1 箇所直せば全ページ改善）」→ h3「ページによって差がある項目」。行の右側に「37 / 128 ページ」tabular + 該当ページは最大 8 件を 12px で列挙し「…他 29 ページ（付録 A 参照）」。空のときは `bg-surface` の 1 行帯「該当する項目はありません。」 | — |
| 付録 A | 診断ページ一覧 | `@md:grid-cols-2` の `dl > div`（BREAK_SELECTOR 対象）: # / パス / 総合 / グレード。12px、行高 26px（300 ページで約 3,900px）。続いて小表「採点対象外のページ」（URL / ページの用途 / 外し方。検索に載せないページが noindex / robots.txt で外されているもの = `SiteAnalysisResult.excluded`。平均点・一覧・項目の集計に含めず、表紙の診断ページ数に「採点対象外 N 件」を添える）、小表「診断できなかったページ」（URL / 理由）と「ページ収集方法: sitemap.xml（542 件中 128 件を診断、上限 SITE_MAX_PAGES）」 | — |
| 付録 B / 次のステップ | 3.2 と同じ | — |

### 3.4 講評 3 行と優先改善 TOP3 の導出（LLM 不使用、`src/lib/report/summary.ts`）

**見込み加点**: 項目 c（カテゴリ k、配点 weight、獲得 earned）を合格にしたときの総合の増分 =
`gain = (weight − earned) / Σweight(k) × CATEGORY_WEIGHTS[k]`。site では `(weight × counts.fail + 0.5 × weight × counts.warn) / N / Σweight(k) × CATEGORY_WEIGHTS[k]`。
**順位**: gain 降順 → 同点は fail 優先 → site では spread = uniform 優先 → CATEGORY_ORDER。上位 3 件。表示は四捨五入した整数「+N 点」、0 になる場合は「+1 点未満」。
**講評テンプレート**（{ } は差し込み。3 行目以外は page / site で主語が変わる）:

1. 現状: 「総合 {overall} 点・{grade}（{帯ラベル}）です。5 カテゴリで最も評価が高いのは{bestCat}（{bestScore} 点）です。」site:「{N} ページの平均で総合 {overall} 点・{grade}（{帯ラベル}）です。…」
2. 課題: 「最も低いのは{worstCat}（{worstScore} 点）で、未対応 {fail} 項目・改善余地 {warn} 項目があります。」site で uniform の fail があれば優先:「全 {N} ページ共通の未対応が {n} 項目あり、テンプレートの修正で全ページに効果があります。」
3. 方針: 「優先改善 TOP3 に対応すると、総合 {overall + Σgain} 点（{grade'}）まで改善が見込めます。」
- 端ケース: fail も warn も 0 →「主要項目はすべて満たしています。参考項目（{info} 件）の対応でさらに AI 検索への適合度を高められます。」を 2〜3 行目に。カテゴリが同点なら CATEGORY_ORDER の先頭を採用。数値は `tabular-nums` の `<span>` で囲む。
- 「危険」「致命的」などの断定語は使わない。E でも「要対策」まで。

## 4. チャート仕様（`src/components/charts/`、依存なし SVG）

共通: 数値の `width` / `height` 属性 + `viewBox`、色は `palette` の hex を `fill` / `stroke` に直書き、`role="img"` + `aria-label`、凡例・数値は SVG 外の HTML、アニメーション無し、`conic-gradient` / `mask` / `filter` / `foreignObject` 禁止。空状態はチャートを描かず 13px muted の 1 行「表示できるデータがありません。」

| 部品 | 寸法 | 描き方 | 色 |
|---|---|---|---|
| DonutGauge（総合） | `160×160`, `viewBox 0 0 160 160`, r=64, strokeWidth=14, 円周 402.1 | トラック circle + 値 circle `strokeDasharray="{s/100×402.1} 402.1"`, `transform="rotate(-90 80 80)"`, `strokeLinecap="butt"`。中央は HTML absolute オーバーレイ（親を `relative h-40 w-40` に固定）。`max-w-full h-auto` で 128px まで縮む | トラック chart-track、値 = grade 色 |
| HBar（カテゴリ） | 行 = HTML `grid grid-cols-[8rem_1fr_3.5rem] items-center gap-3`。SVG `400×16`, `preserveAspectRatio="none"`, `class="w-full h-4"` | トラック rect → 値 rect `width={score×4}` → 目盛 `x=200, 320` に `stroke=secondary strokeWidth=1 strokeDasharray="3 3"`（50 / 80）。site: レンジ `rect x={min×4} width={(max−min)×4} fill=chart-3 opacity なし` の上に平均 `rect y=4 height=8`。数値は右の HTML 20px / 700 / toneOf 色。凡例 HTML 11px「■ スコア（site: 平均）／▭ 最低〜最高／┆ 目標 80」 | 値 chart-1、レンジ chart-3 |
| Donut（判定内訳） | `140×140`, r=52, strokeWidth=18, 円周 326.7 | 区分ごとに circle を `strokeDasharray="{len−2} {326.7−len+2}"`, `strokeDashoffset=−累積`, rotate(-90 70 70)。1 区分のみなら全周。中央 HTML: 件数 22px / 700 + 「判定」11px。凡例 = HTML 表（■ 12px 角 / 区分 / 件数 / % tabular）、0 件も行を残す | pass / warn / fail |
| ColumnChart（site 分布） | `320×140`, 5 柱、幅 40、x = 16 + i×64、下余白 0 | y スケール = max 件数を 4 グリッド線（chart-grid）に丸め。柱上に `<text fontSize=11 fill=ink textAnchor=middle>` で件数（数字のみ SVG text 可）。平均点の位置に縦線 `stroke=secondary strokeDasharray="4 3"`。x ラベルは SVG 外 HTML `grid-cols-5`（「E」700 + 「0–49」11px muted） | 柱 = grade 色 |
| HeatTable（site） | HTML `<table class="w-full text-[13px]">`、ラッパー `overflow-x-auto`、`min-w-[34rem]` | 列: パス（12px break-all、「/（トップ）」）/ 総合（700）/ グレード（文字 = grade 色 700）/ 5 カテゴリ。セル背景 = toneOf → pass-soft / warn-soft / fail-soft、文字 ink tabular right、数値列幅 3.25rem。thead `sticky top-0 bg-panel`（画面のみ）。**40 行ごとに `<section>` を分割**、画面は最初の 40 行 + no-print ボタン「次の 40 ページ」、PDF / 印刷は 120 行まで + 注記「残り N ページは付録 A 参照」（DOM に 120 行入れて画面側だけ `hidden` + no-print で制御） | — |
| StatStrip（KPI） | HTML `grid-cols-4 divide-x divide-line border-y border-line py-3` | 数値 22px / 700 tabular + ラベル 11px muted。総合評価とツール側で共用 | — |
| Sparkline（ツール予約） | `120×28`, `viewBox 0 0 120 28` | `polyline` `fill=none strokeWidth=1.5`、末尾に r=2 の circle。無料診断では使わない | chart-1 |
| StackedBar（任意） | `400×12` | 5 区分 20/25/20/15/20 を chart-1〜5 で並べ、ラベルは HTML | chart-1〜5 |

## 5. アプリシェル（`src/components/shell/`）

定義は `src/lib/features/registry.ts` のみ（label / path / icon / group / featureIds / status / description）。Sidebar はそれを描画するだけ。

- ラッパー: `md:grid md:grid-cols-[15rem_1fr] min-h-screen print:block print:h-auto print:overflow-visible`。スクロールは body。`<main>` はシェルが 1 つだけ持ち `px-4 py-6 md:px-8 print:max-w-none print:p-0 print:m-0`。無料診断は `mx-auto max-w-3xl`、ツールは `max-w-6xl`。
- **サイドバー** `<aside className="no-print bg-brand text-on-brand w-60 md:sticky md:top-0 md:h-screen overflow-y-auto flex flex-col">`（幅 15rem = 240px）。角丸は `rounded-md` まで、影なし。
  1. ブランド行（h-12 px-4、下 1px `border-on-brand/15`）: 24px インライン SVG マーク（角形の中にチェック付き文書、白線）+ ワードマーク「SEO Checker」15px / 700。
  2. **「無料診断」ブロック**（`mt-4 mx-3 border border-on-brand/25 rounded-md p-1`）: 見出し 11px on-brand-muted「無料診断」、項目「無料 AIO 診断」13px / 700（左 16px 検索アイコン）+ 右端ピル「無料」（bg on-brand / text brand、10px / 700）、下に 11px on-brand-muted「URL だけで診断・PDF 出力。ログイン・API 不要」。active（pathname === "/"）: 項目を bg on-brand / text brand、ピルは bg brand / text on-brand に反転。hover: `bg-on-brand/10`。
  3. 区切り: `mt-6 px-4` に見出し「ツール」11px / 700 on-brand-muted + ピル「β」。
  4. グループ 診断 / 計測 / 調査 / 生成 / 設定（registry の順）: グループ名 11px on-brand-muted `mt-4 mb-1 px-4`。項目 = `<Link>` 13px / 400 `text-on-brand/90 h-9 px-3 mx-2 rounded-md flex items-center gap-2.5`、左 16px 線アイコン（stroke currentColor、Icons.tsx の流儀）、ラベル、右端に機能 ID チップ（`font-mono` 10px、`border border-on-brand/30 text-on-brand-muted rounded-sm px-1`、複数は先頭 1 つ + 「+2」）。状態バッジ「準備中」「要設定」= `border border-on-brand-muted text-on-brand-muted` 10px（紺の上に amber / red を載せない）。hover `bg-on-brand/8`。active（pathname が path で始まる）= `bg-on-brand/12 text-on-brand font-bold` + 左端 3px on-brand バー（`before:`）+ `aria-current="page"`。
  5. フッター（`mt-auto px-4 py-3`、上 1px `border-on-brand/15`）: 11px on-brand-muted「v0.1.0 · ルールベース診断」（package.json の version を `NEXT_PUBLIC_APP_VERSION` 経由で表示、無ければ固定文字列）。
- **トップバー** `<div className="no-print sticky top-0 z-10 h-12 bg-panel border-b border-line flex items-center gap-3 px-4 md:px-8">`。左 = ハンバーガー（`md:hidden`、44px タップ領域、`aria-label="メニュー"`）+ 現在ページのラベル 14px / 700 ink（registry）+ `/` ならピル「無料」、ツールなら機能 ID チップ。右は空（PDF / 印刷ボタンはレポート内。将来プロジェクト切替）。`position: fixed` は使わない。
- **モバイルドロワー**（< md）: aside は非表示。ハンバーガーで `fixed inset-y-0 left-0 w-72 z-40` の同じ紺パネル（`role="dialog" aria-modal`、閉じるボタン右上）、オーバーレイ `fixed inset-0 bg-ink/50 z-30`。Escape・オーバーレイ・`usePathname` の変化で閉じる。開いている間 body `overflow-hidden`、フォーカスはドロワー内。ドロワー・オーバーレイとも no-print。
- ツールページ先頭は `PageHeader`: h1 20px / 700 + 説明 13px muted + 機能 ID チップ。外部依存未設定は `SetupNotice`（`border border-line bg-surface rounded-sm p-4`、13px、accent のリンク）。

## 6. フォーム・ボタン・進捗

| 部品 | 仕様 |
|---|---|
| 入力（`ui/Field`） | `h-11 rounded-md border border-line bg-panel px-3 text-base`、`focus:border-accent focus:ring-2 focus:ring-accent/25 outline-none`、エラー時 `border-fail` + 12px fail の説明。ラベル 13px / 700 ink |
| primary ボタン | `h-10 rounded-md bg-accent px-4 text-sm font-bold text-on-brand hover:bg-accent-strong disabled:opacity-60 disabled:cursor-wait`。フォーカスリング accent/40 |
| secondary | `h-10 rounded-md border border-line bg-panel px-4 text-sm text-ink hover:bg-surface` |
| danger | `h-10 rounded-md border border-fail bg-panel text-fail hover:bg-fail-soft`（削除・リセットのみ） |
| 診断フォーム（no-print、シートの上に独立ブロック `bg-panel border border-line rounded-sm p-5 mb-6`） | h1「無料 AIO 診断」20px / 700 + 1 行説明。URL 入力は h-11。範囲切替 = segmented 2 ボタン `role="radio"`: 「このページ — 入力した URL 1 ページ」「サイト全体 — sitemap と内部リンクから全ページ（最大 300）」。選択 = `bg-accent-soft border-accent text-accent`、非選択 = `bg-panel border-line`。送信 = primary の `h-11 w-full`「診断する」 |
| ローディング / 進捗（`ui/ProgressBar`、no-print） | フォーム下の帯 `border border-line rounded-sm p-4`。4px バー（トラック line、値 accent、`rounded-full`）。site は「ページを収集・取得しています — **N / M ページ**」（M 未確定の間は不定バー: 幅 30% の accent が `translate-x` で往復、`prefers-reduced-motion` で静止）。page は「ページ・robots.txt・llms.txt を取得して解析しています…」。N / M の値は `/api/site` の NDJSON 進捗行（`{ phase: "fetch", done, total }`）から取る（API 側の対応が前提。無ければ不定バー） |
| 操作行（no-print） | シート直上に右寄せ「PDF でダウンロード」primary h-9 + 「印刷」secondary h-9。失敗時は 12px fail の 1 行 |
| エラー | `border border-fail bg-fail-soft text-fail rounded-sm p-4 text-sm` |

## 7. PDF / 印刷ルール（両経路を壊さない）

1. トークンは globals.css の `@theme` と `palette.ts` の両方に置き、vitest で一致を検証。チャートの色は `palette` の hex を属性に直書き（`fill-*` クラス・`var()` に頼らない）。
2. SVG は数値の `width` / `height` + `viewBox`。可変幅は `max-w-full h-auto` か HBar の `preserveAspectRatio="none"`。`conic-gradient` / `mask` / `filter` / `backdrop-filter` / `foreignObject` / 外部画像 / アイコンフォント禁止。グラデーション不要（フラット塗り）。
3. SVG 内 `<text>` はヒストグラムの件数だけ。ラベル・凡例・中央の数値は HTML。ドーナツ中央は absolute オーバーレイ（穴の直径 ≥ 96px、親の実寸を SVG と一致させる）。数字は棒の外に置き `text-right`（サブピクセルのずれに依存しない）。
4. 各セクションは `<section className="print-card …">`、チャートはセクション直下か `<figure>` 直下、行は `<tr>` / `<li>` / `dl > div`（BREAK_SELECTOR）。1 要素の高さ < 1,100px: 総合評価 ≤ 520px、ヒート表 40 行 / section、該当ページ列挙 8 件。ヒート表ラッパーに `max-h` を付けない。
5. 表紙帯は print-card にしない（`.print-card { background: transparent }` で消えるため）。`print-color-adjust: exact` は設定済み。ピル・グレード印・ヒート表は枠線 + 文字色 + 数値でも成立させる（背景オフの環境向け）。
6. サイドバー・トップバー・ドロワー・オーバーレイ・フォーム・操作行・進捗・「次の 40 ページ」は `no-print`（`print:hidden` だけでは `.pdf-capture` に効かない）。`position: fixed` を印刷に残さない。
7. レポート内のレスポンシブは `@container` + `@md:`（PDF は 768px、印刷は約 700px で同じ段組になる）。レポートルートは自己完結（祖先のクラス・context に依存しない）。
8. `<main>` は 1 つ（シェル側）。レポートルートは `<div ref>` で外側余白を持たない。基盤担当は `.pdf-capture > *` の余白解除を globals.css に足す。
9. 和文: ウェイト 400 / 700 のみ、`tracking-*` 無し、`tabular-nums` + `text-right`、`break-all`。印刷時 html 14px 前提で rem 指定。`thead` は `table-header-group` で繰り返される。
10. ファイル名は既存 `reportFileName`（ASCII、`aio-report[-site]_host_YYYYMMDD`）を維持。300 ページ時の総高さを 16,000 CSS px 未満に保つ（付録 A 2 段組・ヒート表 120 行上限・改善提案の列挙 8 件）。
11. アニメーション無し（複製時点の状態が写る）。進捗バーの動きは no-print 領域だけ。

## 8. 差別化の要点

- **元ツール（紫 #5b4de0）**: 紫を全廃し、藍（brand / accent の 2 段）+ 罫線グレー + 判定色のみ。`rounded-2xl` + `shadow-sm` のカード積みを「1 枚の白いシート + 番号付き見出し + 1px 罫線」に置き換え（角丸 2〜4px、影なし）。剥き出しの 6xl 数字 → ドーナツ + グレード印 + 講評 3 行 + TOP3。2 列タイル → 目盛付き横棒 + 配点表。アイコン付き縦リスト → 判定ピル / 項目 / 根拠 / 左罫 advice の整列リスト。スパークルアイコンのヘッダー → サイト名・URL・診断日・診断ページ数・グレード印を載せた表紙帯。
- **ミエルカ GEO（06）**: 明るい青の多系列時系列ダッシュボード（積み上げ棒 + 折れ線、KPI カードの前期比）に対し、本方向は時系列を持たない静的な報告書。データ色は chart-1 単色 + 判定 3 色に絞り、棒は 1 系列 + 目盛、ドーナツは 3 区分。
- **yoriaiSEO（02）**: 「ダッシュボード / 課題」タブ、赤字の課題数、+19 の赤バッジ、文章主体の印刷レポート 8 枚に対し、点数・グレード・見込み加点で示し、A4 数枚の図中心の報告書にする。件数を赤字で煽らず、判定は枠付きピル。
- **User Insight（01）**: スコア + 良好バッジ + プログレスバー + 4 列表という業界標準は踏襲しつつ、配点の開示・A〜E・横棒・内訳ドーナツ・サイト全体の分布とヒート表を加え、講評がルール生成であることを明示する（再現性 = 信頼）。
- **サイドバー**: 3 社とも白地の左ナビに全機能を同列に並べる。本方向は藍のサイドバー最上段に枠で囲った「無料診断」（「無料」ピル）を単独で置き、「ツール β」群と物理的に分ける。

## 9. リスクと対処

1. **全ページ診断の負荷**: 現行 `site.ts` は最大 10 ページ・同時 2。300 ページでは数分かかるため、並列度の見直し・NDJSON 進捗（`{ phase, done, total }`）・`SiteAnalysisResult` から `mainText` を落とす（FAQ は page モードのみ）が必要。UI は「N / M ページ」の進捗表示を前提に設計し、無ければ不定バーで代替。
2. **講評の定型感**: LLM と誤解されないよう「※ルールに基づく自動生成」を明記。カテゴリ名・項目名・見込み加点を必ず差し込み、端ケース文を用意。
3. **閾値の二重化**: A〜E（90/80/65/50）と tone()（80/50）は `grade.ts` の 1 箇所に置き、既存 `tone()` を置換。付録 B に必ず載せ、テストで固定。
4. **色だけに頼らない**: ピルは文字 + アイコン + 枠線、ヒート表は数値併記、グレード印は文字。grade-c = warn、grade-e = fail は意図的な同色。
5. **紺の上のバッジ**: on-brand 系の白 / 薄水色だけ（amber / red を載せない）。`text-on-brand/90` などの color-mix は no-print 領域なので問題なし。
6. **共有ファイル**: globals.css / palette.ts / grade.ts / components/ui / charts / shell / registry は基盤担当のみ編集。トークン差し替えは FaqSection・ツール側にも波及する（全体を藍に移行する前提）。
7. **PDF の長さ**: ヒート表「次の 40 ページ」を展開したまま PDF 化しても DOM は 120 行止まり。300 ページ時の総高さを playwright（`/opt/pw-browsers/chromium`、768px）で実測する。
8. **フォント差**: Hiragino / Noto / Yu Gothic で数値の幅・太さが変わる。数値列は `text-right`、見出しはサイズ差で階層を作る。
9. **html2canvas-pro のオーバーレイ**: absolute 配置は描けるがサブピクセルでずれる。ドーナツの穴を広く取り、ピクセル整合に依存しない。
10. **連絡先**: 「次のステップ」は環境変数が無ければ非表示。ダミーを出さない。
