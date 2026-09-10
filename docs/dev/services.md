# 外部サービスの構成と役割

このアプリは 5 つの外部サービスの上で動いている。**どこに何が置かれ、誰が何を担当しているか**をここにまとめる。障害の切り分けと、設定変更の影響範囲の判断に使う。

前提として、**このアプリは自前のデータベースを持たない**。利用者の情報も連携先の設定も、すべて Clerk に預けている。ここが構成を理解する上での中心になる。

---

## 全体像

```
                     ┌─────────────┐
   コードを push  →  │   GitHub    │  matsu609/seo-checker
                     └──────┬──────┘
                            │ main へマージすると自動デプロイ
                            ↓
                     ┌─────────────┐
                     │   Vercel    │  アプリの実行環境（Next.js）
                     └──────┬──────┘
                            │ app.seo-checker.tokyo で公開
                            ↓
   ┌────────────────────────────────────────────────┐
   │              ブラウザ（利用者）                  │
   └───┬────────────────────────────────┬───────────┘
       │ ログイン                        │ 診断・計測
       ↓                                ↓
 ┌───────────┐                   ┌──────────────────┐
 │   Clerk   │ ← 鍵を預かる →     │  外部 API 各種     │
 │           │                   │  Anthropic       │
 │ ユーザー   │ ─── OAuth ───→    │  SerpApi         │
 │ トークン   │    ┌──────────┐   │  PageSpeed       │
 │ 設定       │    │  Google  │   │  GSC / GA4       │
 └───────────┘    │  Cloud   │   └──────────────────┘
                  └──────────┘
                    権限の発行元

  ドメインと DNS はすべて Cloudflare が管理
  （seo-checker.tokyo ゾーン）
```

---

## それぞれの役割

| サービス | 担当 | 持っているもの |
|---|---|---|
| **GitHub** | ソースコードの保管と履歴 | リポジトリ `matsu609/seo-checker` |
| **Vercel** | アプリの実行・公開・環境変数 | ビルド成果物、API キー類 |
| **Cloudflare** | ドメインの名前解決（DNS）と**紹介サイトの配信**（Workers） | `seo-checker.tokyo` のレコード、Worker `seo-checker-hp` |
| **Clerk** | ログイン、**利用者データの保管** | ユーザー、トークン、プラン、連携設定 |
| **Google Cloud** | Google API を使う権限の発行 | OAuth クライアント ID、スコープ、API キー（PageSpeed Insights / Places） |
| **Supabase** | MEO の登録店舗と診断報告書の置き場（PostgreSQL） | `meo_stores`・`meo_reports` テーブル。アプリはサーバーから service_role キーで読み書き（ブラウザからは触らない）。毎週月曜 5:00 JST に Vercel Cron が全店舗を取り直す |
| **Stripe** | 決済（※現在は未使用） | — |

**アプリ自身はデータを持たない。** Vercel 上のアプリは処理をするだけで、利用者ごとの情報はすべて Clerk から取り寄せる。

---

## ドメインの割り当て

`seo-checker.tokyo` は 1 つのゾーンだが、**サブドメインごとに向き先が違う**。

| ホスト名 | 向き先 | 用途 |
|---|---|---|
| `seo-checker.tokyo` | Cloudflare Workers | **紹介サイト**（このアプリとは別物。ソースはこのリポジトリの `marketing/`） |
| `app.seo-checker.tokyo` | Vercel | **このアプリ本体** |
| `clerk.seo-checker.tokyo` | Clerk | 認証 API（ログイン処理の実体） |
| `accounts.seo-checker.tokyo` | Clerk | ログイン・登録画面、パスワード再設定 |
| `clkmail.seo-checker.tokyo` | Clerk | 確認メールの送信元 |
| `clk._domainkey` / `clk2._domainkey` | Clerk | メールの電子署名（DKIM） |

> `seo-checker.tokyo`（紹介サイト）と `app.seo-checker.tokyo`（アプリ）は別物。混同しないこと。
> ソースは同じリポジトリに同居しているが、**配信は別系統**。`marketing/` は Cloudflare Workers が、
> それ以外は Vercel がビルドする（[marketing/README.md](../../marketing/README.md)）。

**Cloudflare のプロキシは、Clerk の 5 件すべてで「DNS のみ」にする。** プロキシを有効にすると Cloudflare が通信を横取りして TLS を終端するため、Clerk の検証が通らず、DKIM も機能しなくなる。

---

## デプロイの流れ

```
作業ブランチで実装
    ↓  npm run lint / npx tsc --noEmit / npm test / npm run build
main へマージ
    ↓  Vercel が自動でビルド
app.seo-checker.tokyo に反映
    ↓
node scripts/add-release.mjs "説明"   ← リリース履歴に 1 件追加
```

バージョンは **main へマージした回数**で、`src/lib/release/releases.json` の件数がそのまま版数になる（`r11` など）。マスター画面（`/admin`）の一番上に、記録されたコミットと実際に動いているコミットが並べて出るので、「マージしたのに本番に出ていない」をここで見分けられる。

### 環境は 3 つある

| 環境 | URL | いつ動くか |
|---|---|---|
| Production | `app.seo-checker.tokyo` | `main` にマージしたとき。**本番** |
| Preview | `seo-checker-git-xxx.vercel.app` | 別ブランチ・PR のとき。マージ前の確認用 |
| Development | `localhost:3000` | 手元での開発 |

環境変数は環境ごとに別の値を持てる。**Clerk のキーは環境で分ける必要がある**（後述）。

---

## ログインの流れ（Clerk）

```
利用者が「ログイン」
    ↓
accounts.seo-checker.tokyo（Clerk の画面）
    ↓  メール + パスワード、または Google
clerk.seo-checker.tokyo が認証
    ↓  セッションの Cookie を発行
app.seo-checker.tokyo に戻る
    ↓
アプリは auth() でユーザー ID を取得
```

アプリ側の判定はすべてサーバーで行う。

| 判定 | 実装 | 内容 |
|---|---|---|
| ログイン必須か | `src/lib/auth/guard.ts` | 未ログインなら API を止める |
| 管理者か | `src/lib/admin/guard.ts` | **確認済みメール**が `ADMIN_EMAILS` に含まれるか |
| プラン | `src/lib/plans/current.ts` | Clerk Billing → `publicMetadata.plan` → `DEFAULT_PLAN` の順 |

**管理者判定は「確認済み（verified）」のメールしか見ない。** 未確認を許すと、管理者のアドレスで登録するだけで入れてしまうため。だから DKIM を設定して確認メールが確実に届くようにしてある。

管理者でないとき `/admin` は 403 ではなく **404** を返す。画面の存在自体を伏せるため。

### Clerk のインスタンスは 2 つある

Clerk は Development と Production で**設定もユーザーデータも完全に別**。

| インスタンス | キー | 使う環境 | 認証ドメイン |
|---|---|---|---|
| Production | `pk_live_` / `sk_live_` | Vercel の Production | `clerk.seo-checker.tokyo` |
| Development | `pk_test_` / `sk_test_` | Preview / ローカル | `〜.accounts.dev` |

Production インスタンスは `app.seo-checker.tokyo` 専用。Preview は URL が毎回変わるので本番キーでは動かない。**両者でユーザーは共有されない**ので、片方で登録しても、もう片方にはアカウントが無い。

---

## Google 連携の流れ（Search Console / GA4）

Anthropic や SerpApi は API キーを 1 本置けば済む。**Google だけは仕組みが違う。**

| | Anthropic / SerpApi | Search Console / GA4 |
|---|---|---|
| 誰のデータか | 提供元のもの | **利用者ひとりひとりのもの** |
| 必要なもの | API キー | 利用者本人の**許可** |
| 設定 | 環境変数に置く | Google への**アプリ登録**が必要 |

Google はお客様本人の同意なしにデータを渡さない。その同意画面を出す資格を得るのが Google Cloud での登録作業になる。

### 3 者の関係

```
Google Cloud  ──── 権限の発行元
    │  クライアント ID / シークレット
    ↓
  Clerk       ──── 鍵の保管と受け渡し
    │  短命のアクセストークン
    ↓
  アプリ       ──── 借りて読むだけ
```

Google Cloud と Clerk は**お互いの ID を交換する**。

1. Google が発行したクライアント ID / シークレットを Clerk に登録する
2. Clerk が表示するリダイレクト URI を Google に登録する

②が必要なのは、利用者が Google の同意画面から戻る先が**アプリではなく Clerk のドメイン**だから。Google から見た相手はアプリではなく Clerk になる。

### 接続してからデータが出るまで

```
設定 → Google 連携 →「接続」
    ↓
Clerk が Google へ転送（独自のクライアント ID を使う）
    ↓
Google が同意画面を表示
    ↓  利用者が「許可」
Google が Clerk のリダイレクト URI に鍵を返す
    ↓
Clerk が鍵を保管・自動更新
    ↓
アプリが Clerk から借りて GSC / GA4 を読む
```

- 鍵は**利用者ごとに別**。A 社のログインでは A 社のデータが出る
- アプリはトークンを保存しない。必要なたび Clerk から取る（`src/lib/google/token.ts`）
- 要求するのは読み取り専用スコープ 2 つだけ（`src/lib/google/scopes.ts`）

| スコープ | 用途 | Google の分類 |
|---|---|---|
| `webmasters.readonly` | Search Console | 非機密 |
| `analytics.readonly` | GA4 | **機密**（審査対象） |

### Clerk の「独自のクレデンシャル」が必須

Clerk の Google ログインは既定でも使えるが、それは Clerk 共有のクライアント ID で、取得できるのは名前とメールだけ。**Search Console や GA4 のスコープは要求できない。**

アプリは接続のたびに追加スコープを要求する（`src/components/google/GoogleLinkPanel.tsx` の `additionalScopes`）ため、自前のクライアント ID を Clerk に持ち込む必要がある。

> Production インスタンスでは共有クレデンシャルが使えない。未設定のまま Google ログインを押すと `Missing required parameter: client_id`（400 invalid_request）になる。

### Google Cloud 側で必要な設定

| 項目 | 内容 |
|---|---|
| 有効化する API | Search Console API / Analytics Admin API / Analytics Data API |
| OAuth 同意画面 | 外部（External）。アプリ名は利用者に見える |
| データアクセス | 上記のスコープ 2 つ |
| クライアント ID | ウェブアプリケーション。Clerk のリダイレクト URI を登録 |

Google Cloud の**利用自体は無料**。この 3 つの API はクレジットカード登録なしで有効化できる。

> 同意画面が「テスト」のままだと、リフレッシュトークンが **7 日で失効**して毎週つなぎ直しになる。本番運用するなら「本番環境に公開」して審査を通す必要がある。

---

## データの置き場所

**このアプリはデータベースを持たない。** どこに何があるかは次のとおり。

| データ | 保管場所 | 備考 |
|---|---|---|
| ユーザー（メール、パスワード） | **Clerk** | アプリは触らない |
| Google のアクセストークン | **Clerk** | 更新も Clerk がやる。ブラウザには渡さない |
| 見る対象の GSC サイト / GA4 プロパティ | **Clerk** の `privateMetadata.googleLink` | `src/lib/google/settings.ts` |
| プラン | **Clerk** の `publicMetadata.plan`（または Billing） | |
| 機能の個別開放 | **Clerk** の `publicMetadata.featureOverrides` | マスター画面で操作 |
| API キー類 | **Vercel** の環境変数 | コードには含めない |
| リリース履歴 | **GitHub**（`releases.json`） | バージョン表示の元 |
| 診断結果 | **保存しない** | 実行のたびに取得。一部はメモリ上に 10 分だけキャッシュ |

診断結果を保存していないので、**画面を閉じると結果は消える**。持ち出しは PDF / CSV で行う。

---

## 決済（Stripe）

**現在は使っていない。** `NEXT_PUBLIC_CLERK_BILLING_ENABLED` が未設定のため、`/plans` に料金表は出ず、プランは運用者が Clerk の `publicMetadata.plan` に手で割り当てる運用になっている。

有効にした場合の関係はこうなる。

```
Clerk Billing  ←→  Stripe
     │
     ↓
アプリは has({ plan }) で契約状況を見るだけ
```

決済の実体は Stripe だが、**契約状態は Clerk が持つ**ので、この場合もデータベースは要らない。ただし Stripe の決済手数料に加えて Clerk 側の手数料もかかる。

---

## 秘密情報の扱い

| 種類 | 例 | 扱い |
|---|---|---|
| 公開してよい | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`（`pk_`） | ブラウザに配信される前提 |
| **絶対に出さない** | `CLERK_SECRET_KEY`（`sk_`）、各種 API キー | Vercel では Secret 型にする |

- `NEXT_PUBLIC_` が付く変数は**ブラウザに送られる**。秘密の値を入れてはいけない
- Vercel の Secret 型は保存後に閲覧できなくなる。それが正しい状態
- 秘密鍵が画面やログに出てしまったら、**発行元でローテーション**する（Clerk なら API keys → Regenerate）

---

## 障害の切り分け

| 症状 | 見る場所 |
|---|---|
| サイトが開かない | Vercel の Deployments、Cloudflare の DNS |
| ログインできない | Clerk のインスタンス、Vercel のキーが `pk_live_` か |
| `Missing required parameter: client_id` | Clerk の Google 連携が独自クレデンシャルになっているか |
| 確認メールが届かない | Cloudflare の DKIM レコード、Clerk の Email が Verified か |
| マスター画面が出ない | `/api/plan` の `admin`、`ADMIN_EMAILS`、メールが確認済みか |
| GSC / GA4 のデータが出ない | 設定画面の連携状態、スコープ、対象の選択、Google 側の権限 |
| デプロイしたのに変わらない | マスター画面の「動いているコミット」 |

環境変数を変えたときは、**Vercel で再デプロイしないと反映されない**。

---

## 関連ドキュメント

- [ARCHITECTURE.md](./ARCHITECTURE.md) — ルーティング、ディレクトリ、コーディング規約
- [README.md](../../README.md) — 機能の説明、環境変数の一覧、セットアップ手順
