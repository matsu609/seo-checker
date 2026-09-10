# 紹介サイト（`seo-checker.tokyo`）

apex ドメイン `https://seo-checker.tokyo/` で配信している**サービス紹介ページの実体**です。
静的 HTML 1 枚で、外部依存は Google Fonts だけです。

もとは別リポジトリ `matsu609/seo-checker-HP` にありましたが、リポジトリを 2 つに分けておくと
運営者情報や料金を直すときに片方だけ古くなるため、2026-09-10 にこのリポジトリへ移しました。
**配信しているのは今も Cloudflare Workers**で、Vercel（アプリ本体）とは別系統です。

| パス | 役割 |
| --- | --- |
| `public/index.html` | 配信されるページそのもの |
| `public/favicon.ico` / `public/icon.svg` / `public/apple-icon.png` | タブのアイコン。アプリ本体と同じ `src/app/icon.svg` から生成 |
| `public/sitemap.xml` / `public/robots.txt` / `public/llms.txt` | 検索・AI クローラ向けの補助ファイル（1 ページなのでどれも短い） |
| `wrangler.jsonc` | Cloudflare Workers の設定。Worker 名 `seo-checker-hp`、`assets.directory` は `./public` |

アイコンは**手でコピーしない**でください。形を変えたら `node scripts/generate-icons.mjs` を
リポジトリのルートで実行すると、アプリ側（`src/app/` と `public/`）とここへ同時に書き出されます。
紹介サイトはビルドが別系統で Next.js の `/icon.svg` を参照できないため、実体をここにも置いています。

## デプロイ

Cloudflare Workers Builds がこのリポジトリの `main` を見て `npx wrangler deploy` を実行します。

- **Cloudflare 側の Build settings で Root directory を `marketing` にすること。**
  リポジトリのルートで走らせると `wrangler.jsonc` が見つからず、Wrangler が静的ファイルの
  置き場所を自力で探しに行って `Could not detect a directory containing static files` で失敗します。
- Build watch paths を設定できる場合は `marketing/*` に絞ると、アプリ側だけの変更で
  紹介サイトのビルドが走らなくなります（設定しなくても、同じ内容が配信し直されるだけです）。
- 失敗したビルドを Retry すると同じコミットで再実行されます。直したら**新しいコミット**で
  ビルドし直してください。

手元での確認（このディレクトリで実行する）:

```sh
cd marketing
npx wrangler@4 deploy --dry-run   # アセットを認識できるかだけ見る
npx wrangler@4 dev                # ローカルで表示を確認する
```

## Next.js 側との関係（なぜ 1 つのリポジトリでも混ざらないのか）

分かれ目は 3 つあります。

**1. ビルドの入口が違う**

| | Vercel（アプリ） | Cloudflare（紹介サイト） |
|---|---|---|
| 起点 | リポジトリのルート | `marketing/` |
| 実行 | `next build` | `npx wrangler deploy` |
| 配信されるもの | `src/app/**` から作った成果物 + ルートの `public/` | `marketing/wrangler.jsonc` の `assets.directory`（= `marketing/public/`） |

`marketing/` はどこからも `import` されておらず `src/app/` の下でもないので、Next.js の成果物に入りません。
逆に Cloudflare はルートディレクトリより上を見ないので、`src/` も `package.json` も存在しないのと同じです。

**2. URL の置き場所が違う**

`marketing/public/` の中身は `https://seo-checker.tokyo/` の直下に、ルートの `public/` の中身は
`https://app.seo-checker.tokyo/` の直下に置かれます。どちらにも `favicon.ico` がありますが、
別のドメインの別のファイルなので衝突しません。

**3. `index.html` が自己完結している**

CSS は `<style>` に内蔵、JavaScript は無し。外を参照しているのは Google Fonts と、
同じ `marketing/public/` にあるアイコン 3 つ（`/favicon.ico` `/icon.svg` `/apple-icon.png`）だけです。
**ここに `../src/...` のような、このディレクトリの外を指すパスを書かないでください。**
Cloudflare は `marketing/` より上をアップロードしないので、必ず 404 になります。

なお `marketing/` に `.ts` / `.tsx` ファイルを置くと、ルートの `tsconfig.json` の `include` が
`**/*.ts` なので型検査の対象に入ります。静的 HTML のまま運用する限り関係ありません。

**壊れたときの戻し方**: ビルドが失敗しても、**直前に成功したバージョンが配信され続けます**
（紹介サイトが白紙になることはありません）。Cloudflare の「デプロイ」タブのバージョン履歴から、
過去のバージョンにロールバックもできます。

アプリ本体にある `public/service-guide.html` は別物です（無料診断画面から配る
「サービス資料」の静的版で、この紹介ページより古い版）。片方を直しても他方は変わりません。

## 文面の元

文面の素案と Google 審査向けのチェックリストは `docs/marketing/site-copy.md`。
運営者名・連絡先は `src/lib/legal/operator.ts`（`/terms` と `/privacy` に出るもの）と揃える。
2026-09-10 に「ご相談窓口」のプレースホルダを運営者情報に差し替え、SEO / AIO / MEO の説明、
Google 連携の説明、フッターの利用規約・プライバシーポリシー・アプリへのリンクを入れた。
CTA はすべて `https://app.seo-checker.tokyo/`（無料診断）、`/sign-in`、`/plans` を指す。

## 無料 AIO 診断での自己採点

`https://app.seo-checker.tokyo/` の無料診断でこのページを採点し、指摘を潰す運用にしている。
2026-09-11 の診断（82 点・B、構造化データ 42）を受けて、`<head>` に JSON-LD
（Organization / WebSite / WebPage / BreadcrumbList / SoftwareApplication / FAQPage）と
「サービス概要」の表、`sitemap.xml` / `robots.txt` / `llms.txt` を追加し、オフライン採点で 100 点を確認した。
**FAQPage の JSON-LD は本文の `<details>` から機械的に作ったもの**なので、FAQ の文面を変えたら JSON-LD も同じ文面に直すこと。
