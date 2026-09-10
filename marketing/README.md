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

## Next.js 側との関係

このディレクトリは Next.js のビルド対象に入りません（アプリは `src/` だけを見ます）。
Vercel は `marketing/` を無視し、Cloudflare は `marketing/` の外を見ません。

アプリ本体にある `public/service-guide.html` は別物です（無料診断画面から配る
「サービス資料」の静的版で、この紹介ページより古い版）。片方を直しても他方は変わりません。

## 残っている直し

- `public/index.html` の「ご相談窓口」にプレースホルダが残っています
  （`<!-- ▼ 配布前に… ▼ -->` で囲んだ範囲）。運営者名・連絡先は
  `src/lib/legal/operator.ts`（`/terms` と `/privacy` に出るもの）と揃えてください。
- 文面の素案は `docs/marketing/site-copy.md` にあります。
