# Claude in Chrome に渡す作業プロンプト集

ブラウザ操作エージェント（Claude in Chrome）に、ダッシュボード上の設定作業をやらせるためのプロンプト。
**そのままコピーして貼る**ことを前提に書いてある。決済・秘密の値を扱うので、各プロンプトの冒頭に「絶対に守ること」を必ず入れる。

関連: 決済まわりの手順の正本は [OPERATIONS.md](./OPERATIONS.md) の「Stripe を有効にする手順（#58）」。
Stripe のセキュリティチェックリスト（#84）用のプロンプトは [stripe-checklist-prompt.md](./stripe-checklist-prompt.md)。

## 渡す前の準備（共通）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Stripe | https://dashboard.stripe.com/ | ログイン済みにして、**左上が「本番」**（テスト環境 / サンドボックスではない）ことを確認しておく |
| 2 | Vercel | https://vercel.com/matsumatsu452-6233/seo-checker | ログイン済みにしておく |
| 3 | Search Console | https://search.google.com/search-console | ログイン済みにしておく |
| 4 | Clerk | https://dashboard.clerk.com/ | ログイン済みにして、**Production インスタンス**に切り替えておく（C だけで使う） |

エージェントにパスワードと 2 段階認証は触らせない（先に人がログインしておく）。

## 秘密の値の扱い

`sk_live_…`（Stripe のシークレットキー）と `whsec_…`（Webhook 署名シークレット）は**他人に渡ってはいけない値**。
プロンプトには必ず「**値そのものをチャットに書かない。コピー＆ペーストで運び、報告は末尾 4 文字だけ**」と入れてある。
気になる場合は B の 4〜6 だけ人が手でやってもよい（それ以外はエージェントに任せられる）。

---

## A. Search Console にサイトマップを送り直す

r84（robots.txt の修正）が本番に出たあとに実行する。出る前にやっても同じ失敗になる。

```
あなたはブラウザ操作アシスタントです。Google Search Console でサイトマップを送り直してください。私はすでにログインしています。

## 絶対に守ること
- プロパティは「seo-checker.tokyo」（ドメイン プロパティ）だけを触る。ほかのプロパティ・ほかの設定は一切変更しない。
- 削除するのは下で指定した 1 行だけ。「https://seo-checker.tokyo/sitemap.xml」の行は絶対に削除しない（こちらは成功済み）。
- 迷ったら操作を止めて、何が分からないか私に聞く。

## 背景
このサイトのアプリ側（app.seo-checker.tokyo）は robots.txt の不備でサイトマップを読み取れず、「取得できませんでした」で止まっていた。robots.txt は修正して公開済みなので、Google に読み直させたい。

## 手順
1. https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Aseo-checker.tokyo を開く。
2. 「送信されたサイトマップ」の一覧で「https://app.seo-checker.tokyo/sitemap.xml」の行を探す。
3. その行の右端のメニュー（3 点）から「サイトマップを削除」を選ぶ。**この 1 行だけ**。
4. 「新しいサイトマップの追加」の入力欄に、次の URL をそのまま貼って「送信」を押す。
   https://app.seo-checker.tokyo/sitemap.xml
5. 送信後の一覧で、この行のステータスを読む。

## 報告してほしいこと
- 一覧の 2 行それぞれについて「URL / ステータス / 検出されたページ数」を書き出す。
- app 側がまだ「取得できませんでした」の場合、その行をクリックして出る詳細（エラーの説明文）をそのまま引用する。推測で理由を補わない。

補足: 送信直後は「取得できませんでした」「保留」と出ることがあり、それは異常ではない（Google がまだ読みに来ていないだけ）。その場合は「まだ読まれていないだけの可能性がある」と添えて報告する。
```

期待する結果: **成功しました / 検出されたページ数 3**（`/terms`・`/privacy`・`/legal/tokushoho`）。

---

## B. Stripe 本番の設定をして、Vercel に登録する

Stripe で 4 つの値を集めて、そのまま Vercel に入れて Redeploy するところまでを 1 回で通す。
**値を人が中継しなくて済むように、Stripe と Vercel を 1 つのプロンプトにまとめてある。**

```
あなたはブラウザ操作アシスタントです。Stripe（本番モード）の決済設定を終わらせて、その値を Vercel の環境変数に登録してください。私は Stripe と Vercel の両方にログイン済みです。

## 絶対に守ること
- **秘密の値をチャットに書かない。**「sk_live_」で始まるキーと「whsec_」で始まる署名シークレットは、コピー＆ペーストで運ぶだけにして、報告では「sk_live_…（末尾 4 文字: xxxx）」の形で書く。
- **Stripe の商品と価格を新しく作らない・編集しない・削除しない。**「スタンダード ¥50,000 / 月」と「ライト ¥38,000 / 月」はすでに正しく作られている。金額・税設定・商品名を変えない。
- **テストモードに切り替えない。**すべて本番モードで行う。URL に /test/ が含まれていたら本番に切り替えてからやり直す。
- **Vercel では、下で指定した 4 つの環境変数以外に触らない。**既存の変数を消さない・書き換えない。
- 決済に関わる本番設定なので、**保存・作成のボタンを押す直前に、何をどこに入れたかを 1 行で報告してから押す。**
- 途中で分からなくなったら操作を止めて私に聞く。勝手に判断して進めない。

## ゴール
本番の決済が動く状態にする。アプリは「Stripe のシークレットキー」「スタンダードの価格 ID」「Webhook の署名シークレット」の 3 つがそろって初めて申し込みボタンを出す。

## 手順

### 1. スタンダードの価格 ID を取る
https://dashboard.stripe.com/products を開く。「スタンダード」（¥50,000 JPY 月当たり）をクリック。「料金」セクションにある「price_」で始まる ID をコピーする。これを【STANDARD_PRICE】と呼ぶ。
※ 一覧画面には価格 ID は出ない。商品を開く必要がある。

### 2. ライトの価格 ID を取る
同じ画面に戻り、「ライト」（¥38,000 JPY 月当たり）をクリック。「price_」で始まる ID をコピーする。これを【LIGHT_PRICE】と呼ぶ。

### 3. カスタマーポータルを有効にする
https://dashboard.stripe.com/settings/billing/portal を開き、次を ON にして保存する。
- お支払い方法の更新
- 請求書の履歴
- サブスクリプションのキャンセル（タイミングは「請求期間の終了時」）
- プランの変更 … 変更先の商品として「スタンダード」と「ライト」の両方を選べるようにする

### 4. Webhook を作る
https://dashboard.stripe.com/workbench/webhooks を開く（「ワークベンチ」→「Webhook」）。「エンドポイントを追加」。
- エンドポイント URL: https://app.seo-checker.tokyo/api/billing/webhook
- 送信するイベント: 次の 4 つだけを選ぶ
  checkout.session.completed
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
追加したあと、「署名シークレット」（whsec_ で始まる）を表示してコピーする。これを【WEBHOOK_SECRET】と呼ぶ。

### 5. シークレットキーを取る
https://dashboard.stripe.com/apikeys を開く。「シークレットキー」（sk_live_ で始まる）を表示してコピーする。これを【SECRET_KEY】と呼ぶ。公開可能キー（pk_ で始まる）は使わない。
あわせて、このアカウントが**有効化（本人確認）済み**かどうかを確認する。画面上部に「アカウントを有効化してください」「追加情報が必要です」といった案内が出ていたら、その文言をそのまま報告する（クリックはしない）。

### 6. Vercel に 4 つ登録する
https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables を開く。
次の 4 つを **Production** 環境に追加する。同じ名前の変数がすでにある場合は、削除せず「編集」で値を上書きする。

| 変数名 | 入れる値 | Sensitive |
|---|---|---|
| STRIPE_SECRET_KEY | 【SECRET_KEY】 | する |
| STRIPE_WEBHOOK_SECRET | 【WEBHOOK_SECRET】 | する |
| STRIPE_PRICE_STANDARD | 【STANDARD_PRICE】 | しない |
| STRIPE_PRICE_LIGHT | 【LIGHT_PRICE】 | しない |

注意: STRIPE_PRICE_PRO という古い名前の変数が残っていても、削除も編集もしない（そのままで問題ない）。

### 7. 再デプロイする
https://vercel.com/matsumatsu452-6233/seo-checker/deployments を開く。いちばん上（最新・Production）のデプロイのメニューから「Redeploy」。「Use existing Build Cache」はオフにして実行。完了（Ready）まで待つ。

### 8. 確認する
https://app.seo-checker.tokyo/plans を開く。次を確認する。
- 「テストモードです。実際の請求は発生しません」という文言が**消えている**こと
- プレミアム → スタンダード → ライトの 3 枚が並び、スタンダードとライトに「申し込む」ボタンが出ていること

## 報告してほしいこと
1. 手順 1〜5 でやったことを 1 行ずつ。価格 ID はそのまま書いてよい（秘密ではない）。sk_live_ と whsec_ は末尾 4 文字だけ。
2. 手順 5 で見たアカウント有効化の案内の有無（あればその文言そのまま）。
3. 手順 6 で、4 つそれぞれを「新規追加した」のか「既存を上書きした」のか。
4. 手順 8 の画面がどう見えたか。「テストモード」の文言がまだ残っていたら、その旨をはっきり書く。
5. 押さなかった・できなかった操作があれば、隠さずに書く。
```

**やらせないこと**: テストカードでの申し込みテスト（本番モードなので実際に課金される）。動作確認は 8 の画面表示までにする。

---

## C. 自分のアカウントにプランを割り当ててから、DEFAULT_PLAN を free にする

**順番を逆にすると自分が全機能を使えなくなる。**
いまは `DEFAULT_PLAN=pro`（= スタンダード扱い）で全員に開いている状態。これを `free` にすると、
契約していない人は無料機能だけになる。**運営者アカウントは管理者でもプランの判定を素通りできない**
（`src/lib/plans/current.ts` の判定順。管理者かどうかは `/admin` を開ける権限であって、プランとは別）ので、
先に Clerk で自分に `plan` を割り当てておく必要がある。

```
あなたはブラウザ操作アシスタントです。Clerk と Vercel で、契約者以外に有料機能が開いてしまっている設定を閉じます。私は両方にログイン済みです。

## 絶対に守ること
- **手順 1 を終えてから手順 2 に進む。順番を逆にすると、私自身が有料機能を使えなくなる。**
- Clerk では、下で指定するユーザー 1 人の publicMetadata 以外に触らない。ユーザーの削除・招待・認証設定の変更はしない。
- Vercel では DEFAULT_PLAN 以外の環境変数に触らない。
- 保存ボタンを押す直前に、何をどう変えるかを 1 行で報告してから押す。
- 迷ったら操作を止めて私に聞く。

## 手順

### 1. Clerk で自分にプランを割り当てる
1. https://dashboard.clerk.com/ を開く。アプリケーション「SEO Checker」の **Production** インスタンスに切り替える（Development ではない）。
2. 左メニューの「Users」で matsumatsu452@gmail.com のユーザーを開く。
3. 「Metadata」→「Public metadata」を編集し、次の JSON になるようにする。すでに他のキーがある場合は、それを消さずに "plan" だけを足す。
   {"plan": "premium"}
4. 保存する。

### 2. Vercel で DEFAULT_PLAN を free にする
1. https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables を開く。
2. DEFAULT_PLAN を探す（いまの値は pro のはず。実際の値を報告すること）。
3. 値を free に変更して保存する。環境は Production（と Preview があればそちらも同じ値に）。
4. https://vercel.com/matsumatsu452-6233/seo-checker/deployments で最新の Production デプロイを Redeploy し、Ready まで待つ。

### 3. 確認する
1. https://app.seo-checker.tokyo/settings を開き、自分が有料機能を使える状態のままであることを確認する（左サイドバーのツールに「要設定」以外の鍵マークが付いていないこと）。
2. https://app.seo-checker.tokyo/plans を開き、自分のプラン表示を読む。

## 報告してほしいこと
- 手順 1 で、編集前の public metadata の中身と、編集後の中身。
- 手順 2 で、DEFAULT_PLAN の変更前の値と変更後の値、どの環境に入っていたか。
- 手順 3 で、サイドバーに鍵マークが付いたツールがあればその名前を全部。プラン表示に何と書いてあるか。
- 鍵が付いてしまった場合は、そこで止めて報告する（私が戻し方を判断する）。
```

万一 C で自分が締め出されたときの戻し方: Vercel の `DEFAULT_PLAN` を `pro` に戻して Redeploy すれば元に戻る。
