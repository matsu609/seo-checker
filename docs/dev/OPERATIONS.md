# 運用メモ・引き継ぎ（OPERATIONS）

**このファイルだけを読めば、誰でも（次の Claude Code セッションでも、別の開発者でも）作業を引き継げる**ことを目的にした記録です。コードではなく「いまどういう状態で、何が決まっていて、何が残っているか」を書きます。

## このファイルの使い方（更新ルール）

- **利用者とのやり取りのたびに、作業の最後に必ず更新して main に push する**（利用者の指示。2026-09-10）。
- 更新はドキュメントだけなので、作業ブランチ・4 つの検証・`add-release.mjs` は不要。**main に直接コミット**してよい（メッセージは `運用メモを更新（YYYY-MM-DD）`）。コードを触った場合は従来どおりブランチ → 検証 → マージ → `add-release.mjs`。
- **秘密の値（`sk_`、`GOCSPX-`、API キー、パスワード）は絶対に書かない。**変数名と「設定済み / 未設定」だけを書く。
- 利用者への作業依頼は、手順ごとに**サービス名・画面名・URL**を必ず書く（利用者の指示。表: # / サービス・画面 / URL / やること）。よく使う URL は下記「よく使う画面の URL」。
- 「現在の状態」「残タスク」「入力待ち」は常に最新に書き換える。「判断の経緯」「作業ログ」は追記する。
- 全体像の説明は [services.md](./services.md)、開発規約は [ARCHITECTURE.md](./ARCHITECTURE.md)、機能説明は [README](../../README.md)。ここには重複させず、状態と判断だけを書く。

## よく使う画面の URL

| サービス・画面 | URL |
|---|---|
| Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables |
| Vercel → Deployments（Redeploy） | https://vercel.com/matsumatsu452-6233/seo-checker/deployments |
| Vercel → Cron Jobs | https://vercel.com/matsumatsu452-6233/seo-checker/settings/cron-jobs |
| Supabase → 組織（Projects） | https://supabase.com/dashboard/org/hrjabajiqwgrttfglwul |
| Supabase → SQL Editor | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/sql/new |
| Supabase → API Keys | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/settings/api-keys |
| Supabase → Table Editor | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/editor |
| Supabase → Database → Tables（RLS 確認） | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/database/tables |
| Supabase → Database → Indexes | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/database/indexes |
| Google Cloud → 認証情報 | https://console.cloud.google.com/apis/credentials?project=seo-checker-508104 |
| Google Cloud → Maps Platform キー | https://console.cloud.google.com/google/maps-apis/credentials?project=seo-checker-508104 |
| Google Cloud → 予算とアラート | https://console.cloud.google.com/billing/budgets?project=seo-checker-508104 |
| Google Cloud → OAuth → ブランディング | https://console.cloud.google.com/auth/branding?project=seo-checker-508104 |
| Google Cloud → OAuth（Google Auth Platform） | https://console.cloud.google.com/auth/overview?project=seo-checker-508104 |
| Cloudflare → Email Routing | https://dash.cloudflare.com/ → seo-checker.tokyo → Email → Email Routing |
| Cloudflare → 紹介サイトの Worker（ビルド設定） | https://dash.cloudflare.com/ → Compute（Workers） → `seo-checker-hp` → Settings → Build |
| Google Cloud → OAuth → 対象（テストユーザー） | https://console.cloud.google.com/auth/audience?project=seo-checker-508104 |
| Claude Console → クレジット | https://platform.claude.com/settings/billing |
| Claude Console → API キー | https://platform.claude.com/settings/keys |
| Clerk ダッシュボード | https://dashboard.clerk.com/ |
| Cloudflare DNS | https://dash.cloudflare.com/ → seo-checker.tokyo → DNS → レコード |
| Google Search Console | https://search.google.com/search-console |
| 本番 → 設定（外部連携） | https://app.seo-checker.tokyo/settings |
| 本番 → Google マップ・店舗情報 | https://app.seo-checker.tokyo/tools/maps |
| 本番 → マスター画面 | https://app.seo-checker.tokyo/admin |

## 運営者情報（利用者の決定）

| 項目 | 値 | 備考 |
|---|---|---|
| 連絡先メール（デベロッパー連絡先・規約・ポリシー共通） | **contact@seo-checker.tokyo** | 09-10 利用者の指示。`src/lib/legal/operator.ts`（r23）。転送設定済み（利用者報告） |
| 事業者名 | **SEO 研究所（代表: 松下）** | 個人事業。09-10 利用者の指示（r24） |
| 所在地 | **「請求があれば遅滞なく開示します」** | 個人事業のため請求時開示（r24） |
| 紹介サイトの文面 | `marketing/public/index.html`（正本）。素案は `docs/marketing/site-copy.md` | 運営者名・連絡先は operator.ts と揃える |
| 管轄裁判所 | 東京地方裁判所 | |

## 再開の手順（次のセッションで最初にやること）

1. このファイルを読む（特に「残タスク」「入力待ち」「セキュリティ」）。
2. `git log --oneline -10` で main の先頭と、`src/lib/release/releases.json` の件数（= バージョン `rNN`）を確認する。
3. 本番の稼働確認: `https://app.seo-checker.tokyo/api/plan` をログイン状態で開き `"admin":true` が返ること。マスター画面 `/admin` の「動いているコミット」が main の先頭と一致すること。
4. 利用者に「前回の続き」を確認し、残タスクの優先順に進める。
5. **やり取りのたびにこのファイルを更新して push する。**

---

## 現在の状態（2026-09-10 時点）

### サービスの構成と稼働状況

| サービス | 状態 | 備考 |
|---|---|---|
| GitHub `matsu609/seo-checker` | main = r24 | main に push すると Vercel が自動デプロイ。紹介サイトのソース `marketing/` も同居（09-10 に統合） |
| Vercel `matsumatsu452-6233/seo-checker` | 本番 `app.seo-checker.tokyo` 稼働中 | Hobby プラン |
| Cloudflare | `seo-checker.tokyo` ゾーンを管理。Worker `seo-checker-hp` が紹介サイト（apex）を配信 | `app.` は Vercel へ CNAME（DNS のみ）。**Workers Builds の接続先を旧 `matsu609/seo-checker-HP` からこのリポジトリ（Root directory `marketing`）へ切り替えるのが #29** |
| GitHub `matsu609/seo-checker-HP`（旧・紹介サイト） | 中身は `marketing/` に移設済み。#29 が終わったら役目を終える | 切り替え前にここを消すと紹介サイトが更新できなくなるので、#29 の完了までは残す |
| Clerk（**Production インスタンス**） | 稼働中。`clerk.seo-checker.tokyo` / `accounts.seo-checker.tokyo` | 2026-09-09 に Development から移行完了。DNS 5/5 Verified、SSL 発行済み |
| Clerk（Development インスタンス） | 残存。本番では未使用 | Preview 用に流用する予定（現在 Preview には Clerk のキーが無い） |
| Google Cloud `seo-checker-508104` | OAuth 構成済み（テスト状態） | 下記「Google Cloud の設定」 |
| Google 連携（GSC / GA4） | **技術的に完成・動作確認済み** | `matsumatsu452@gmail.com` で接続、両スコープ許可済み。一覧が空なのは Google 側にデータの権限が無いだけ |
| Places API（Google マップ） | **コードは完成、キー未設定** | 請求先アカウントの紐づけとキー作成が利用者側で未了 |
| PageSpeed Insights | キー作成済み（利用者報告） | Vercel への反映・Redeploy は要確認 |
| Anthropic（Claude） | **本番で「未設定」と表示される** | Vercel には `ANTHROPIC_API_KEY` が登録されているのに `process.env` で空。値の貼り直し → Redeploy が必要 |
| Supabase | **プロジェクト・テーブル・Vercel の環境変数まで完了**（`matsu609の組織` / `matsu609のプロジェクト`、Free プラン、ref `qcdkatzxvdgplgibevlc`） | Vercel への環境変数登録と Redeploy は利用者側で作業中。コード（r19）は完成 |
| Business Profile API | **未申請** | フェーズ 3 に必要。Google の審査制 |
| Stripe / Clerk Billing | 未使用 | `NEXT_PUBLIC_CLERK_BILLING_ENABLED` 未設定。プランは `DEFAULT_PLAN=pro` |

### Vercel の環境変数（Production）

| 変数 | 状態 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 設定済み（`pk_live_`、Production のみ） | 復号すると `clerk.seo-checker.tokyo` |
| `CLERK_SECRET_KEY` | 設定済み（`sk_live_`、Production のみ） | **要ローテーション**（会話に貼られた） |
| `ADMIN_EMAILS` | `matsumatsu452@gmail.com` | マスター画面の管理者 |
| `DEFAULT_PLAN` | `pro` | Production and Preview |
| `SITE_MAX_PAGES` | `100` | Production and Preview（一度誤って Preview のみにしたが復旧済み） |
| `ANTHROPIC_API_KEY` | **設定済み**（09-10 17:30 設定画面で「設定済み」を確認） | Claude Console のクレジット購入済み |
| `PAGESPEED_API_KEY` | **登録済み**（利用者報告 09-10 17:4x「AB 完了」）。設定画面での確認は未 | |
| `GOOGLE_PLACES_API_KEY` | **設定済み**（09-10 17:30 設定画面で「設定済み」を確認） | seo-checker の Places API (New) 制限つきキー |
| `CRON_SECRET` | **登録済みの見込み**（利用者「できました」09-10 17:30。Cron Jobs 画面での確認は未） | 長いランダム文字列（例: `openssl rand -hex 32` か、パスワード生成器で 40 文字以上）。Vercel に Secret で登録 → Redeploy。Vercel が Cron の呼び出しに自動で付ける |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **登録済み**（利用者報告 09-10 14:4x。本番での動作確認は Places キー登録後） | URL は `https://qcdkatzxvdgplgibevlc.supabase.co`（`/rest/v1/` 付きでも r20 で可）。キーは Project Settings → API Keys の service_role（JWT）か Secret key（`sb_secret_`）のどちらでも可（r20）。URL は Config、キーは Secret。Production + Preview |
| Preview 環境の Clerk キー | **無し** | Preview はログイン無効で動く状態。必要になったら Development の `pk_test_` / `sk_test_` を Preview 用に登録 |

### Clerk（Production）の設定

- ドメイン: Primary application として `seo-checker.tokyo` を登録（アプリは `app.seo-checker.tokyo`、Clerk API は `clerk.seo-checker.tokyo`、確認メールは `@seo-checker.tokyo`）。
- Google SSO: **独自のクレデンシャル設定済み**（Client ID / Secret を投入、Redirect URI `https://clerk.seo-checker.tokyo/v1/oauth_callback`）。Scopes 欄は既定のまま（追加スコープはアプリが `additionalScopes` で要求する）。
- ユーザー: `matsumatsu452@gmail.com`（メール確認済み、Google 連携済み）。Development にいたユーザーは引き継がれていない。
- **未対応**: アプリ名が `My Application` のまま（ログイン画面・確認メールに出る）。登録制限が無い（誰でも登録できる。README 235 行目の推奨に反する）。Legal の URL（利用規約 `/terms`・プライバシー `/privacy`）未登録。

### Cloudflare Workers（紹介サイト `seo-checker-hp`）

apex `https://seo-checker.tokyo/` を配信する Worker。2026-09-10 に、ビルド元を旧 `matsu609/seo-checker-HP` から
**このリポジトリの `marketing/`** に切り替えた（利用者が設定・保存済み）。画面は Compute（Workers） → `seo-checker-hp` → 設定 → ビルド。

| 項目 | 値 | 備考 |
|---|---|---|
| Git リポジトリ | `matsu609/seo-checker` | |
| ルート ディレクトリ | **`marketing`** | ここが `/` だと `Could not detect a directory containing static files` で失敗する |
| ビルド コマンド | **なし（空）** | `marketing/` に `package.json` は無い。静的 HTML なのでビルド不要 |
| デプロイ コマンド | `npx wrangler deploy` | 既定のまま |
| バージョン コマンド | `npx wrangler versions upload` | 非本番ブランチ用。未使用 |
| プロダクション ブランチ | `main` | |
| 非本番ブランチのビルド | オフ | 作業ブランチが main と同じ内容で二重にビルドされるため |
| 監視パス（含む / 除外） | `*` / **空** | 除外に `*` を入れると全パスが除外され、ビルドが二度と走らない。含むを `marketing/*` に絞るのは、この欄がルートディレクトリからの相対かどうか確証が無いので避けた |
| API トークン | `seo-checker-hp build token` | 変更していない |

**2026-09-11 0:04、このリポジトリからの初回デプロイが成功**（バージョン `9ef76797` = コミット `c60fe42`）。
以後、main への push のたびにここも再ビルドされる（監視パスが `*` のため。同じ内容が配信し直されるだけで害はない）。

成功したビルドのログには `Read 4 files from the assets directory`（HTML + アイコン 3 つ）と出る。
失敗したビルドの Retry は同じコミットで走るので、設定を直したあとは新しいコミットでビルドし直す。

### Cloudflare の DNS（`seo-checker.tokyo` ゾーン）

Clerk の 5 件は Domain Connect で自動登録済み。すべて **DNS のみ（プロキシ無効）**。

| 名前 | 種別 | 向き先 |
|---|---|---|
| `app` | CNAME | Vercel（`*.vercel-dns-017.com`） |
| `clerk` | CNAME | `frontend-api.clerk.services` |
| `accounts` | CNAME | `accounts.clerk.services` |
| `clkmail` | CNAME | `mail.2edeiljlhiju.clerk.services` |
| `clk._domainkey` / `clk2._domainkey` | CNAME | `dkim1` / `dkim2.2edeiljlhiju.clerk.services` |

### Google Cloud（プロジェクト `seo-checker-508104`）

- 有効化済み API: Google Search Console API、Google Analytics Admin API、Google Analytics Data API、PageSpeed Insights API。
- OAuth（Google Auth Platform）: 外部、アプリ名 `SEO Checker`、サポート・連絡先 `matsumatsu452@gmail.com`。**テスト状態**（テストユーザー: `matsumatsu452@gmail.com`）。
- データアクセス（スコープ）: `webmasters.readonly`（非機密）、`analytics.readonly`（機密 → 本番公開時に審査対象）。
- クライアント: ウェブアプリケーション 1 件（Clerk 用。Redirect URI 上記）。**シークレットは要ローテーション**（スクリーンショットに写った）。
- **未対応**: Places API (New) の有効化、請求先アカウント、予算アラート、Places 用 API キー。ブランディングの利用規約 / プライバシーの URL。本番公開（審査）は GA4/GSC をお客様に開放する前に必要（テスト状態のままだとトークンが 7 日で失効）。

### Google 側のデータの持ち主

- Google ビジネス プロフィールのオーナーは `wolf@wolf-info.org`（`matsumatsu452@gmail.com` は管理者として追加済み。ただしこれは **Search Console / GA4 には関係ない**）。
- Search Console / GA4 のプロパティが `wolf@wolf-info.org` 側に存在するかは**未確認**。存在するなら、そのアカウントで `matsumatsu452@gmail.com` に閲覧権限を付ける（GSC: 設定 → ユーザーと権限、制限付き／GA4: 管理 → プロパティのアクセス管理、閲覧者）。存在しないなら新規登録。

---

## 残タスク（優先順）

担当: **利用者** = ダッシュボード操作など私（Claude）が代行できないもの。**Claude** = コード。

| # | 内容 | 担当 | 状態 |
|---|---|---|---|
| 1 | `ANTHROPIC_API_KEY`: ~~Claude Console でクレジット購入 → API キー作成 → Vercel で貼り替え~~ → Redeploy → 設定画面「外部連携」で Anthropic が設定済みになるか確認 | 利用者 | ほぼ完了（残り: Redeploy と確認） |
| 2 | Places API: **請求先アカウント（作成済み）を `seo-checker` に紐づけ** → seo-checker で Places API (New) を有効化 → 予算アラート（月 1,000 円目安）→ API キー（Places API (New) に制限、アプリ制限なし）→ Vercel `GOOGLE_PLACES_API_KEY`（Secret）→ Redeploy → `/tools/maps` で報告書を確認 | 利用者 | 未 |
| 3 | Supabase: ~~プロジェクト作成~~ → ~~`meo_reports`~~ → ~~Vercel に環境変数 2 つ~~ → ~~`meo_stores`~~（09-10 17:03 作成、Table Editor で 2 テーブル確認）→ 設定画面「外部連携」で Supabase が設定済みになるか確認 | 利用者 | 残り: 動作確認のみ |
| 19 | **`CRON_SECRET`** を Vercel に登録（Secret、Production）→ Redeploy。登録後、Vercel の Settings → Cron Jobs に `/api/cron/maps-refresh`（`0 20 * * 0`）が出ることを確認 | 利用者 | 未 |
| 4 | フェーズ 2 のコード: 診断結果の保存・履歴・「最新診断結果」カード | Claude | **完了（r19、r21 で「保存」ボタンは廃止し自動保存に）** |
| 5 | Business Profile API の利用申請（`https://developers.google.com/my-business/content/prereqs` → Request access。プロジェクト ID、用途、確認済みビジネス） | 利用者 | 未 |
| 6 | 運営者情報（連絡先・事業者名・所在地）→ `src/lib/legal/operator.ts` | 利用者 → Claude | **完了（r23, r24）** |
| 29 | **紹介サイトのビルド元をこのリポジトリに切り替える**: Cloudflare → Compute（Workers） → `seo-checker-hp` → Settings → Build → Git repository を `matsu609/seo-checker`（ブランチ `main`）に、**Root directory を `marketing`** に変更 → Save → 新しいコミットでビルド → `https://seo-checker.tokyo/` の表示を確認 | 利用者 | **切り替え完了（09-11 0:04、バージョン `9ef76797` = コミット `c60fe42` がアクティブ）**。残りは `https://seo-checker.tokyo/` の表示確認と、旧リポジトリのアーカイブだけ |
| 30 | 紹介サイトの文面反映（運営者情報、SEO/AIO/MEO の説明、Google 連携の説明、フッターのリンク、CTA をアプリへ） | Claude | **完了。09-11 1:00 に本番 https://seo-checker.tokyo/ の表示を利用者の画面で確認** |
| 28 | 紹介サイトの文面 | Claude | 完了（#30 に統合） |
| 26 | contact@seo-checker.tokyo の受信（Cloudflare Email Routing） | 利用者 | 完了（利用者報告「転送設定は済んでいます」） |
| 27 | Google Auth Platform → ブランディング（アプリ名 SEO Checker、サポートメール matsumatsu452@gmail.com、ホームページ https://seo-checker.tokyo/、プライバシー /privacy、承認済みドメイン seo-checker.tokyo、デベロッパー連絡先 2 件） | 利用者 | **完了（09-11 1:01 画面で保存済みを確認）**。ロゴは審査通過後に |
| 7 | Clerk: Legal に `/terms` `/privacy` の URL、サインアップ時の同意 ON。アプリ名を `SEO Checker` に。Restrictions で許可リスト／招待制 | 利用者 | 未 |
| 8 | Google Auth Platform → ブランディングに利用規約 / プライバシーの URL | 利用者 | 未 |
| 9 | 鍵のローテーション: Clerk Production `sk_live_`（Instance → API keys → Regenerate → Vercel 更新 → Redeploy）、Clerk Development `sk_test_`、Google OAuth クライアントシークレット（シークレットを追加 → Clerk に貼り替え → 古い方を無効化） | 利用者 | 未 |
| 10 | GSC / GA4 の権限付与（上記「Google 側のデータの持ち主」）→ 設定画面「一覧を取り直す」→ 検索パフォーマンス・生成 AI 流入分析で数値確認 | 利用者 | 未 |
| 11 | フェーズ 3（承認後）: Business Profile API で未取得 9 項目を埋め、インサイト（8 指標・期間比較・CSV・詳細グラフ）を追加 | Claude | 承認待ち |
| 12 | 規約・ポリシーの専門家レビュー | 利用者 | 推奨 |
| 13 | Google OAuth の本番公開申請（GA4 の `analytics.readonly` が機密スコープ。2〜6 週間）。準備: #6 運営者情報 → 紹介サイト seo-checker.tokyo に説明 + /privacy /terms リンク → Search Console で seo-checker.tokyo の所有確認 → #8 ブランディング URL → 用途説明文（Claude が文案）→ デモ動画 2〜3 分（Claude が台本）→ Google Auth Platform で「公開」→ 審査申請。**テスト中はトークンが 7 日で失効**。それまではテストユーザー（100 人まで） | 利用者 + Claude | 未 |
| 15 | Places API の **利用者ごとの月間上限**（例: レポート 50 回 / 月）を Supabase で数えて 429 を返す。お客様に開放する前に入れる。費用は運営者のプロジェクト 1 本に集中するため | Claude | 提案中（利用者の判断待ち） |
| 16 | Places の費用削減: 競合比較の詳細取得は口コミ・紹介文を外した安い区分のフィールドマスクにする（`src/lib/maps/client.ts` のマスクを 2 種類に） | Claude | 候補（利用が増えたら） |
| 17 | 競合分析の強化（提案中）: 競合の履歴保存と推移グラフ、口コミ内容の AI 要約比較（自社 vs 競合の褒め・不満）、口コミ増加ペースの推定。地点別の擬似順位は要望が出てから | Claude | 利用者の判断待ち |
| 18 | **週次一斉更新**: 店舗登録を Supabase `meo_stores` へ、Vercel Cron（`0 20 * * 0` UTC = 月曜 5:00 JST）→ `/api/cron/maps-refresh`。登録直後だけ即時取得。競合も毎週（利用者了承。費用は超過分を許容） | Claude | **完了（r21）**。本番の動作確認は #2 #3 #19 のあと |
| 20 | AI 総評の検証（候補）: 生成文中の数値が入力（スコア・件数・評価）に存在するか照合し、無ければ再生成。`src/lib/maps/commentary.ts` の後段に純粋関数で | Claude | 実物を見てから判断 |
| 21 | AI 総評のパーソナライズ（候補）: 前回の報告書の要約（スコア・件数の差分）を入力に加えて推移を書かせる。店舗ごとの「メモ」欄（`meo_stores` に列追加）を入力に加える | Claude | 利用者の優先度次第 |
| 22 | AI 総評の自動生成（候補）: 一斉更新（`refresh.ts`）の保存後に `generateMeoCommentary` を呼んで `aiCommentary` に入れる。頻度は「毎週 / 第 1 月曜のみ / 手動のまま」から利用者が選ぶ。失敗しても更新自体は止めない | Claude | 利用者の判断待ち |
| 23 | ~~「AI に相談する用のテキストをコピー」ボタン~~ | — | 不要（API 運用に決定） |
| 24 | `PAGESPEED_API_KEY` を Vercel に登録 → Redeploy | 利用者 | 完了（報告ベース） |
| 25 | 設定画面の Supabase の説明文を r21 の内容に更新 | Claude | 完了（r22） |
| 31 | Search Console で `seo-checker.tokyo` の所有確認 | 利用者 | **完了（09-11 0:38、Cloudflare 連携で自動。TXT は消さない）**。matsumatsu452@gmail.com が所有者 → ツールの検索パフォーマンスで seo-checker.tokyo を選べる |
| 32 | 紹介サイトの JSON-LD `sameAs` に公式 SNS（X / Instagram / YouTube / note など）や GitHub の URL を追加（利用者から URL をもらう）。FAQ の文面を変えたら FAQPage の JSON-LD も同文に直す | 利用者 → Claude | URL 待ち |
| 14 | Preview 環境用の Clerk キー（Development の `pk_test_` / `sk_test_`）の登録（Preview を使うなら） | 利用者 | 任意 |

### 入力待ち（利用者からの回答が要るもの）

- 運営者名・連絡先メール・所在地（#6）
- Supabase の SQL 実行と Vercel の環境変数登録が済んだという連絡（#3。URL もキーも会話に貼らなくてよい）
- Business Profile API の承認結果（#5）
- `wolf@wolf-info.org` 側に GSC / GA4 が存在するか（#10）

### フェーズ 2 で使うテーブル（Supabase SQL Editor で実行）

```sql
create table if not exists meo_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  place_id text not null,
  place_name text not null,
  generated_at timestamptz not null,
  score int,
  grade text,
  category_scores jsonb not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists meo_reports_user_place_idx
  on meo_reports (user_id, place_id, generated_at desc);
alter table meo_reports enable row level security;
```

2 つ目（r21、登録店舗。**09-10 17:03 実行済み**）:

```sql
create table if not exists meo_stores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  place_id text not null,
  place_name text not null,
  own_place_id text not null default '',
  created_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  unique (user_id, place_id, own_place_id)
);
create index if not exists meo_stores_user_idx on meo_stores (user_id, own_place_id);
create index if not exists meo_stores_refresh_idx on meo_stores (last_refreshed_at);
alter table meo_stores enable row level security;
```

`own_place_id` が空なら自社、入っていればその自社店舗の競合。

**テーブルの形を変えるときは、`alter table` の SQL をここに追記し、コード（`src/lib/maps/history.ts` / `stores.ts`）も同時に直す。**利用者には SQL を渡して実行してもらう。

RLS は有効のまま。アプリはサーバーの service_role だけで読み書きする（ブラウザからは触らない）。`user_id` は Clerk のユーザー ID（Clerk 無効の開発環境では `"local"`）。

実装（r19）: `src/lib/db/supabase.ts`（PostgREST を fetch で。SDK 無し）、`src/lib/maps/history.ts`（保存・一覧・取得・削除。必ず `user_id=eq.` で絞る）、`/api/maps/history`（GET 一覧 `?placeId=` / POST 保存 `{placeId, aiCommentary?}`。保存する報告書はサーバーが同じキャッシュから組み立て直す。ブラウザの JSON は入れない）、`/api/maps/history/[id]`（GET 本文 / DELETE）。画面は `src/components/maps/MeoHistoryCard.tsx`。GET が `enabled:false` を返したら画面は保存ボタンも履歴カードも出さない。

---

## セキュリティ上の注意（必読）

- 2026-09-09〜10 の会話（Claude Code セッション）に、次の秘密の値が**貼られた／写った**。いずれも**ローテーション（再発行）が必要**。値はここに書かない。
  - Clerk Development の `sk_test_`（影響は小。Preview 用に使う前に再発行）
  - Clerk Production の `sk_live_`（本番の鍵。**最優先**でローテーション）
  - Google Maps Platform の初期 API キー（`AIza...`、09-10 15 時ごろの画面に写った。**「My First Project」側に存在**）。**削除**するよう案内済み（seo-checker 側で新しく作る）
  - Google OAuth クライアントシークレット（`GOCSPX-`）。Redirect URI が Clerk に固定されているため即時の悪用は難しいが、再発行する
- 今後、利用者に秘密の値を見せてもらう必要は無い。「設定できました」で足りる。`pk_live_` などの**公開鍵は共有されても問題ない**。
- `NEXT_PUBLIC_` が付く変数はブラウザに配信される。秘密の値を入れない。

---

## 判断の経緯（なぜそうしたか）

| 日付 | 判断 | 理由 |
|---|---|---|
| 09-09 | マスター画面に入れない問題は**コードではなく表示位置**と結論 | `/api/plan` が `admin:true`。リンクと判定は同じコミット `e6a0366` で追加されており、本番に載っている。サイドバー最下部にあるだけ |
| 09-09 | `r11-version-card.patch` は**適用しない** | `src/lib/release/` はすでに main にあり、releases.json も 11 件入っていた（別リポジトリの作業が `e6a0366` に含まれていた） |
| 09-09 | SEO 診断と AIO 診断は**統合しない** | 利用者が「やっぱり分ける」と決定 |
| 09-09 | GA4 / GSC 連携は**実装済み**で、足りないのは Google Cloud と Clerk の設定と判断 | `src/lib/google/*`、`GoogleLinkPanel` が一式揃っていた |
| 09-09 | **Clerk を Development → Production に移行してから** Google 連携を設定 | 本番が `pk_test_`（開発用インスタンス）で動いていた。Google 連携はインスタンスに紐づく（Redirect URI）ので、先に移さないと二度手間と再審査になる。ユーザー 1 名の今が移行コスト最小 |
| 09-09 | Clerk のドメインは **Primary application** | 確認メールの送信元が `@seo-checker.tokyo` になり、`@app.seo-checker.tokyo` より迷惑メール判定されにくい |
| 09-09 | Cloudflare の DNS は **Domain Connect で自動登録** | 手作業の失敗（名前の二重付与、プロキシ有効のまま）を避けるため |
| 09-09 | 「接続し直す」が失敗するのは**コードのバグ**と判断し修正（r13） | Google ログイン済みだと `createExternalAccount` が二重接続で失敗。`reauthorize` で権限だけ追加するように変更 |
| 09-09 | 設定画面に**利用者向け手順書**を追加（r14） | 実際は「別の Google アカウントで運用中」が多く、登録ではなく権限付与で済むのに、その案内が無かった |
| 09-09 | Google マップは **Places API（B）から着手し、Business Profile API（A）は並行申請** | A は Google の審査制で数日〜数週間。B はキーだけで動く |
| 09-10 | Supabase は **SDK を入れず PostgREST を fetch で叩く** | 依存を増やさない方針（他社 LLM と同じ）。必要な操作は 4 つだけ。service_role を使うので、`user_id` の絞り込みをコードで必ず付ける（`history.test.ts` で固定） |
| 09-10 | 保存する報告書は **ブラウザから受け取らずサーバーで組み立て直す** | 任意の JSON を DB に入れさせない。同じ 6 時間キャッシュから作るので画面の内容と一致する。AI 総評だけ段落を受け取り、5 段落 × 2,000 字で縛る |
| 09-10 | サイドバーは **SEO / AIO / MEO の 3 タブ**、中は従来のグループ | 利用者の指示。group（何をするか）と category（何のための施策か）を別軸にして、料金表やマスター画面のグループ表示は変えない |
| 09-10 | AI 総評は **API（従量制）で運用** | Pro 定額はサーバーから使えず規約上も不可。SaaS 型で利用者が自分で使う前提。まず Opus 5 で品質確認、費用が気になれば `LLM_MODEL=claude-sonnet-5` |
| 09-10 | 診断履歴の保存先は **Supabase** | DB を持たない設計からの拡張。ARCHITECTURE.md / cache.ts が想定していた選択肢。無料枠で開始できる |
| 09-10 | MEO 報告書は競合（口コミ365）の PDF と同じ 4 カテゴリ・21 項目構成。**未取得は採点の分母から外す** | 「測れなかった」を 0 点にしない方針（無料診断と同じ）。承認後にデータを差し込むだけで完成する |
| 09-10 | 利用規約・プライバシーポリシーは**ログイン不要の公開ページ** | 登録前に読める必要がある。Google OAuth 審査と Clerk 設定で URL が必須 |
| 09-10 | プライバシーポリシー第 5 条に **Limited Use** 準拠の文言 | Google OAuth 審査の必須要件。変更不可 |
| 09-10 | 紹介サイトのリポジトリは **1 つに寄せる**（利用者が案 A を選択） | 運営者名・連絡先・料金・アイコンが両方に出るため、分けたままだと片方だけ古くなる。実際に `public/service-guide.html` と HP の内容がずれ、HP には配布前のプレースホルダとアイコン未設定が残っていた。分けたまま旧リポジトリに直接 push する案 B も示したうえでの決定 |
| 09-10 | 紹介サイトのソースを `marketing/` に取り込み、**配信は Cloudflare Workers のまま**にした | リポジトリが 2 つあると運営者名・料金を直したときに片方だけ古くなる。一方で apex を Vercel に向け直すと DNS とドメイン移設が要り、審査中の Google OAuth の入口を止めるリスクがある。利用者の選択は「Cloudflare のまま・ソースだけ移す」 |

---

## 進行中の開発の設計メモ

### MEO（Google マップ・店舗情報）— 3 フェーズ

- **フェーズ 1（r15〜r16、完了）**: `/tools/maps`。検索 → 自社 / 競合の選択（localStorage）→ `/api/maps/report` で 4 カテゴリ採点の報告書 → `/api/maps/commentary` で AI 総評（任意）→ PDF。競合比較は `/api/maps/compare`。詳細は `src/lib/maps/fetch.ts` で 6 時間キャッシュ（Places の詳細は最も高い料金区分）。
- **フェーズ 2（r19 → r21 で週次更新に再設計）**: 数字は利用者が取り直せない。店舗を登録（`/api/maps/stores` POST）した直後に 1 回取得して `meo_reports` に保存、以後は毎週月曜 5:00 JST の Cron（`/api/cron/maps-refresh`、`src/lib/maps/refresh.ts`）が全店舗を取り直して保存。競合比較（`/api/maps/compare` GET）は保存済みの最新報告書から。画面: 店舗の登録・切り替え、最新の報告書＋次回更新日、履歴（開く・削除）、比較表（取得日時つき）。AI 総評は生成後に `PATCH /api/maps/history/[id]` で報告書に書き足す。機能は `requires: ["places", "supabase"]`。残り: アカウント削除時の行削除（Clerk の Webhook。現状は手動）、Cron 1 回の上限は 2,000 行 / 240 秒（超えた分は次回。店舗が数百を超えたら分割か複数 Cron に）。
- **フェーズ 3（承認後）**: Business Profile API（Business Information / v4 reviews・localPosts・media / Performance API）で `score.ts` の `unavailable` 9 項目を埋める。インサイト 8 指標（表示回数 モバイル/PC、電話、ルート、サイト、メニュー、平均クリック率）を期間比較・CSV・詳細グラフつきで。スコープ `business.manage` を追加 → 同意画面のスコープ追加と再審査に注意。

### 既知の課題・メモ

- `releases.json` の先頭 11 件のコミットハッシュはこのリポジトリに存在しない（別リポジトリ由来）。動作に支障なし。
- `/tools/maps` は他のツールページと同じく静的プリレンダ（`PlanGate` はリクエスト時に評価）。
- Places API の仕様は developers.google.com を参照できない環境で実装した。応答の全項目を optional として読む。フィールド名が違っていた場合は `src/lib/maps/parse.ts` の `RawPlaceSchema` を直す。

---

## 作業ログ

### 2026-09-09（セッション 1 日目）

- 状況確認: `src/app/admin/page.tsx`、`src/lib/admin/config.ts`、`src/lib/release/` すべて存在。パッチ不要。
- マスター画面問題の切り分け → 表示位置の問題。`/admin` 直接アクセスで解決。
- Google Cloud プロジェクト作成、API 3 つ有効化、OAuth 同意画面、スコープ 2 つ。
- Clerk Production インスタンス作成、Cloudflare DNS 自動登録、SSL 発行、Vercel キー差し替え、アカウント再登録、`admin:true` 確認。
- Google 独自クレデンシャル設定、テストユーザー登録、設定画面から接続 → 両スコープ許可。
- r12: `docs/dev/services.md`（外部サービスの構成）。
- r13: `reauthorize` によるバグ修正。
- r14: 設定画面の Google 設定手順書。
- PSI の API キー作成（利用者）。
- r15: `/tools/maps`（Places API、比較 + 充実度採点）。

### 2026-09-10（セッション 1 日目の続き）

- 競合ツールの PDF を読み、MEO 機能の棚卸し。Supabase・フェーズ分けを決定。
- r16: MEO 診断報告書（4 カテゴリ・21 項目・総評・PDF）。
- r17: 利用規約 `/terms`。
- r18: プライバシーポリシー `/privacy`。
- 利用者の指示: **やり取りのたびに引き継ぎメモ（このファイル）を更新して push する**。`CLAUDE.md` にルールを追加。
- 利用者が Supabase プロジェクトを作成（SQL エディタの画面を共有）。SQL を案内。
- r19: MEO 診断報告書の保存・履歴（Supabase）。lint / tsc / test（86 ファイル・1250 件）/ build すべて通過。
- 利用者が Supabase で SQL を実行（成功。行は返されませんでした）。次は Vercel の環境変数 2 つと Redeploy。
- 利用者が Vercel で環境変数の登録場所を探している（Observability 画面から「Environment Variables」へ案内。登録 → Redeploy の手順を伝えた）。
- 利用者が Vercel に `SUPABASE_URL`（Config、`/rest/v1/` 付き）を登録中。Environments は Production + Preview、次に `SUPABASE_SERVICE_ROLE_KEY`（Secret）→ Redeploy と案内。
- Vercel の Environments ピッカーに Preview が出ないとの報告 → Production のみで可と案内（Preview は Clerk キーも無く未使用）。Supabase の変数は **Production のみ**になる見込み。
- Environments ピッカーは「＜ Search environments」の下に Production / Preview / Development が出ることを確認。`SUPABASE_URL` は Production + Preview で登録済み（画面より）。`SUPABASE_SERVICE_ROLE_KEY` は Secret に切り替えて登録するよう案内。
- Supabase のキーの場所を案内: 左下の歯車 → Project Settings → API Keys（`/settings/api-keys`）。Secret keys（`sb_secret_`）か Legacy の `service_role`。
- 利用者「出来ました」= Vercel に Supabase の変数 2 つを登録。確認手順（設定画面の外部連携 → Supabase 設定済み）を案内。`/tools/maps` の動作確認には Places キー（#2）が必要。
- 利用者の質問「請求先はマスター？ユーザー毎？」→ 運営者のプロジェクト 1 本に集中と回答。無料枠は 2025-03 以降の「SKU ごとの月間無料回数」（Text Search Pro 5,000 / Place Details Enterprise 1,000）で、「月 200 ドル」は旧制度と訂正。利用者ごとの月間上限（#15）を提案。
- 利用者が Places API の設定に着手（認証情報画面。既存: API キー「PageSpeed Insights (seo-checker)」、OAuth クライアント「Clerk (production)」、請求先アカウント未作成＝$300 トライアルのバナー表示）。手順を案内: ライブラリで Places API (New) 有効化 → 無料トライアルでカード登録 → 予算 1,000 円 → API キー（Places API (New) のみに制限、アプリ制限なし、名前 `Places (seo-checker)`）→ Vercel `GOOGLE_PLACES_API_KEY`。**注意: トライアル終了（90 日 / $300）で API が止まるので、その時は請求画面で「アップグレード」**。
- 利用者の質問「100 店舗 × 月 4 回なら何回まで？」→ 自社のみなら 400 回/月で無料枠（詳細 1,000 回/月）内。競合 5 社込みだと 2,400 回で超過 ≈ 月 5,000 円前後。節約案: 競合の詳細は口コミ・紹介文を外して安い区分に（#16 候補）。Google Maps Platform のトライアル画面（ステップ 2/2 お支払い情報）まで進行中。
- 利用者の質問「競合の情報をログイン無しで取れるのはすごい。何ができない？」→ Places は公開情報のみ（口コミ最大 5 件、写真最大 10 枚）。取れないのはインサイト・返信率・投稿・オーナー説明文・開業日・メニュー・写真の日付など（= score.ts の unavailable 9 項目）。Business Profile API 承認後も**自社のみ**埋まり、競合は永久に公開情報の範囲、と説明。
- 利用者の質問「競合分析はどこまで？需要は？」→ できる: 数字の横並び・充実度比較・口コミ内容の AI 要約比較（未実装）・履歴による推移（未実装、Supabase に競合分も保存）・口コミ増加ペース推定。できない: 実績値・投稿/返信・順位そのもの（地点指定の擬似順位なら可、費用増）。需要は「初回診断と月次報告の 1 ページ」として確実にあるが日常利用は薄い、と回答。提案順: (1) 自社の報告書と履歴を確実に、(2) 競合の履歴保存と推移グラフ、(3) 口コミ AI 要約比較、(4) 地点別順位は要望が出てから。
- 利用者の要望「基本データは毎週決まった曜日に一斉更新。ユーザーは自由に更新できないように」→ **月曜 5:00 JST** を推奨（週末の口コミ反映・週初の計画・早朝処理）。競合は月 1 回（第 1 月曜）か安い区分で。設計案を提示（#18）。
- 利用者「競合も毎週更新で、超過はそれでいい」→ 週次一斉更新を実装。**r21**: 店舗の登録制（`meo_stores`）、Cron（`vercel.json` `0 20 * * 0`）、`CRON_SECRET`、手動取り直しの廃止、比較は保存済みから、`/api/maps/report` 削除。lint / tsc / test（89 ファイル・1279 件）/ build 通過。利用者側に残る作業: `meo_stores` の SQL、`CRON_SECRET` の登録、Places キー。
- 利用者が Google Maps Platform の開始画面まで進行（請求先の作成は完了した模様）。初期キーの値が画面に写ったため、Places API (New) に制限 → 「キーを再生成」→ Vercel `GOOGLE_PLACES_API_KEY` の手順を案内。
- 利用者の指示「やることには毎回どのサービスのどの画面かまで書いて」→ CLAUDE.md とこのメモにルール追加、URL 一覧を追加。残作業 A〜E を表で再提示（Places キー制限・再生成、予算、`meo_stores` SQL、`CRON_SECRET`、Redeploy と確認）。
- **発見**: Google Maps Platform の開始フローは `seo-checker` ではなく **「My First Project」（`project-ef5f12d6-a1c7-4ccc-bb9…`）** で進んでいた（全 Maps API 有効化 + 無制限キー）。請求先アカウントは作成済み（トライアル ¥47,813、90 日）。対応: 請求先を `seo-checker` に紐づけ → seo-checker 側で Places API (New) 有効化 → 制限つきキー作成 → My First Project の露出キーは削除、と案内。
- `seo-checker` で Places API (New) 有効化を確認（15:51）。次は制限つき API キー作成 → Vercel `GOOGLE_PLACES_API_KEY`。請求先の紐づけ（手順 1）の完了は未確認。
- 利用者が seo-checker の認証情報画面（PSI キーと Clerk OAuth のみ）に到達。API キー作成 → 名前・API 制限 → Vercel の手順を再掲。
- Google Cloud の API キー作成は新フロー（作成前に名前と API の制限を入力するダイアログ）。名前 `Places (seo-checker)`、制限は Places API (New) のみ、サービスアカウントのバインドは不要と案内。
- Vercel に `GOOGLE_PLACES_API_KEY`（Secret、Production）登録を画面で確認（15:58）。一覧に `ANTHROPIC_API_KEY` が見えない（スクロール外の可能性）→ 確認を依頼。残り: `CRON_SECRET`、`meo_stores` の SQL、Redeploy、動作確認。
- 利用者の質問「ANTHROPIC_API_KEY は定額制（Pro/Max）でもいい？」→ 不可。Console の従量制（前払いクレジット）。AI 総評 1 回 ≈ 5 円（Opus 5）。Console 登録 → Billing → API keys → Vercel の手順を案内。
- 利用者の質問「API を渡すだけでいい？考えさせる工程は要らない？」→ 採点・判定はコード、AI は文章化のみ（固定システムプロンプト、JSON スキーマで 3〜5 段落を強制、口コミは untrusted 枠、Opus 5 は思考が標準で有効、総評は 1 報告書 1 回生成して保存）。追加候補: 出力中の数字が入力にあるかの照合（#20）、AI 判断を増やすときは評価セット。まず 10 店舗で実物を見てから、と回答。
- 利用者の質問「チャット画面に添付して聞くのと精度は変わる？パーソナライズは無くなる？」→ 同じモデルで精度は落ちない。API は入力が構造化済み・指示が固定で安定、チャットは追加質問と検索が強み。パーソナライズは履歴（前回比）と店舗メモを渡す形で実装可能（#21）と回答。
- 利用者の質問「Opus 5 の料金、1 店舗あたり」→ 入力 $5 / 出力 $25（100 万トークン）。AI 総評 1 回 ≈ 入力 4,000 + 出力 2,000〜3,000（思考込み）≈ 10〜15 円。週 1 なら 1 店舗 40〜60 円/月、100 店舗 4,000〜6,000 円/月。総評はボタン押下時のみ生成（自動化も可）。Haiku 4.5 なら約 1/5。
- 利用者の質問「ChatGPT の方が安い？」→ 単価は OpenAI（GPT-5 $1.25/$10、記憶ベース・未検証）の方が安いが、この規模では月数千円の差で、切り替えの実装コストの方が大きい。コード変更なしで `LLM_MODEL=claude-sonnet-5`（$2/$10）にすれば同程度の単価になると案内。まず Opus 5 で品質確認 → Sonnet 5 と比較を推奨。
- 利用者の提案「マスターで週 1 自動実行なら Pro プラン 1 つで済む？」→ 課金が運営者 1 アカウントに集まるのは正しいが、Pro（定額）はサーバーから使えず規約上も不可。API は従量制。Sonnet 5 で全店舗週 1 自動生成なら 100 店舗で月 1,600〜2,400 円と説明。選択肢: 毎週自動 / 手動（現状） / 第 1 月曜のみ自動（#22）。利用者の判断待ち。
- 利用者の質問「コンサル目的で提供者が説明する用途なら Pro でいい？」→ 人が手で使うなら Pro で可（成果物の商用利用も可）。自動呼び出し・利用者の操作の裏で動かすのは不可。コンサル型（少数店舗）なら Pro のチャット、SaaS 型なら API。折衷: 「AI に相談する用のテキストをコピー」ボタン（#23、API 不要）を提案。
- **決定**: AI 総評は API で運用（Pro のチャット運用ではない）。当面 Opus 5・ボタン押下時のみ生成。10 店舗ほど品質確認後に「自動生成の頻度（#22）」「Sonnet 5 への切り替え」を判断。#23（コピー用ボタン）は不要に。
- 利用者が Claude Console（platform.claude.com、ワークスペース Default、クレジット $0）に登録済み。資金追加 → API キー作成 → Vercel の手順を案内。
- Claude Console の請求画面（クレジット $0、「$5 からクレジットを購入」）まで到達。20 ドル購入 → API キー → Vercel を案内。クレジットは購入から 1 年で失効。
- 利用者「出来ました」= Claude Console のクレジット購入・API キー作成・Vercel `ANTHROPIC_API_KEY` 貼り替え。残り: `meo_stores` SQL、`CRON_SECRET`、Redeploy、動作確認（設定画面の外部連携 3 つ、/tools/maps で登録 → レポート → AI 総評 → PDF、Cron Jobs 一覧）。
- Supabase の組織 `matsu609's Org`（Free、org id `hrjabajiqwgrttfglwul`）、プロジェクトは **AWS ap-northeast-1（東京）・NANO** と確認。SQL Editor への行き方と `meo_stores` の SQL を再掲。
- `meo_stores` 作成完了（Success）。Table Editor に `meo_reports` `meo_stores` を確認。利用者の質問「2 つは何？」→ stores = 登録台帳（利用者 × 店舗、own_place_id 空 = 自社）、reports = 日付つきの報告書履歴（追記のみ）と説明。残り: `CRON_SECRET`、Redeploy、動作確認。
- 利用者の質問「書いた SQL はどこで確認？」→ SQL Editor の PRIVATE（自動保存の Untitled query）、テーブル定義は Table Editor の Edit table / Database → Tables（RLS Enabled を確認）/ Indexes と案内。
- 利用者が Supabase の組織メニュー（Projects / Team / Billing…）で迷う → Database → Tables はプロジェクト内（パンくずに Project / main が出る階層）と案内。直接 URL を提示。
- 利用者の質問「SQL はどこで見る？もう編集できない？」→ SQL Editor の PRIVATE と OPERATIONS.md（正本）。既存テーブルの変更は `alter table` か Table Editor の Edit table。**テーブルの形はコード前提なので、変更は Claude が SQL とコードを揃えて出す**（利用者が直接いじらない）と案内。
- Supabase の SQL Editor に文面は残っていない（未保存で閉じた）。テーブルは存在。SQL の正本はこのメモ、と案内。
- 利用者の確認「SQL は GitHub、データは Supabase」→ 正しい。設計図 = GitHub、データ = Supabase、秘密の値 = Vercel 環境変数、の 3 分類で説明。
- 利用者の確認「SQL の書き換えのみ Supabase から慎重に」→ 運用ルールとして合意: Supabase は普段は見るだけ、形の変更は Claude が用意した `alter table` を SQL Editor で実行（SQL 先 → デプロイ後）。Free プランは自動バックアップ無し。
- 利用者の質問「CRON_SECRET と Redeploy はどこ？」→ Vercel の Environment Variables（Secret、Production）と Deployments の「…」→ Redeploy、確認は Settings → Cron Jobs と案内。
- **設定画面で Anthropic / Places / Supabase の 3 つが「設定済み」を確認（17:30）**。PageSpeed は未設定（#24）。`CRON_SECRET` と Redeploy は利用者報告で完了。動作確認の手順（検索 → 自社登録 → レポート → AI 総評 → PDF → 競合 → 履歴 → Cron Jobs）を案内。
- 利用者「AB 完了」= `PAGESPEED_API_KEY` を Vercel に登録。次は /tools/maps の動作確認。
- 利用者が `wolf@wolf-info.org`（シークレットウィンドウ）で Google ログイン → **403 access_denied「審査プロセスを完了していません」**（OAuth がテスト中でテストユーザー外）。Google Auth Platform → 対象 → テストユーザーに `wolf@wolf-info.org` を追加するよう案内。別アカウント = ツール上は別利用者、管理者は ADMIN_EMAILS のみ、と補足。
- 利用者の質問「店舗向け機能はどこに集約？」→ `/tools/maps`（計測 → Google マップ）の 1 画面。他はサイト向け。フェーズ 3 でカードを足し、長くなればグループ化して分割、と回答。
- 利用者の要望「AIO / SEO / MEO でタブを分けて」→ **r22**: registry に `category`、サイドバー上部に 3 タブ（SEO: サイト診断・ページ診断・順位計測・検索パフォーマンス・サイトレポート・キーワード調査・AI ライティング / AIO: ページ最適化・AIO 頻出トピック・HP 改修提案・LLMO・プロンプト拡張・生成 AI 流入分析・llms.txt / MEO: Google マップ）。設定・料金は全タブ共通。lint / tsc / test（90 ファイル・1285 件）/ build 通過。
- 利用者「お願い致します」（r22 了承）。次の待ち: /tools/maps の動作確認結果、テストユーザー追加。次の作業候補は #22（第 1 月曜だけ自動生成を推奨）か #17。
- 利用者の質問「GSC / GA4 の審査はどれくらい？」→ 2〜6 週間目安（ブランド確認 3〜5 営業日 + GA4 の機密スコープ審査 1〜4 週）。GSC の webmasters.readonly は非機密で審査不要。**テスト中はリフレッシュトークンが 7 日で失効**（利用者が週 1 で再接続）ため、お客様に出す前に公開申請が現実的。準備物: 運営者情報（#6）、紹介サイトの説明とリンク、ドメイン所有確認（Search Console）、ブランディング URL（#8）、用途説明文、デモ動画（#13 に統合）。
- 利用者の指示「デベロッパーの連絡先は contact@seo-checker.tokyo。HP と GitHub のメモにも」→ **r23**: `operator.ts` の email を設定（/terms と /privacy に表示）。メモに運営者情報の節を追加。Cloudflare Email Routing での受信設定（#26）と Google ブランディングへの登録（#27）を残タスクに。
- 利用者「転送設定は済んでいる」→ #26 完了。質問「運営者名は屋号でいい？」→ 個人なら屋号 + 代表者名（例: SEO 研究所（代表: 氏名））、法人なら法人名。所在地は個人なら請求時開示で省略可。「上のリンク」= /privacy と /terms の URL。紹介サイトのフッターに説明 + 2 リンク + アプリへのリンクを置くよう案内。
- 利用者の指示「運営者名は SEO 研究所（代表: 松下）、所在地は請求時開示」→ **r24**: operator.ts に反映（/terms /privacy に表示）。紹介サイトの文面を `docs/marketing/site-copy.md` に作成（ヒーロー、3 列の説明、Google 連携の説明、料金、フッター、審査向けチェックリスト）。貼り付けは利用者（#28）。
- 利用者「HP をこのリポジトリに入れたので内容の反映を」→ `marketing/public/index.html` に反映（#30）: title/OG、ヘッダー nav（3 つの領域・Google 連携・ログイン）、ヒーロー、`#areas`（SEO/AIO/MEO）、ツール一覧に店舗（MEO）グループ、`#google`（読み取り専用の説明 + /privacy /terms）、ご相談窓口（SEO 研究所（代表: 松下）/ contact@）、フッター（アプリ / 規約 / ポリシー / © SEO 研究所）、CTA 全部をアプリ URL に（`#contact` 残り 0）。Playwright でデスクトップ・モバイルの描画確認、`wrangler deploy --dry-run` OK、lint / tsc / test / build 通過。add-release は実行せず（アプリの動きは不変、前回の方針どおり）。**配信の確認は利用者のブラウザで**（このセッションから seo-checker.tokyo は 403）。
- 利用者の指示「フッターの運営者名・アプリ・規約・ポリシーのリンクは別ページ（別タブ）で」→ フッターと Google 連携節の app.seo-checker.tokyo 向けリンクに `target="_blank" rel="noopener"`（5 か所）。CTA ボタンは同じタブのまま。wrangler dry-run / lint / tsc OK。テスト・ビルドは HTML のみの変更のため省略せず前回結果を維持（アプリのコードに変更なし）。
- 09-11 0:30 利用者が Google Auth Platform → ブランディングで承認済みドメイン `seo-checker.tokyo`、デベロッパー連絡先 2 件（matsumatsu452@gmail.com / contact@seo-checker.tokyo）を入力（保存前の画面）。上部の URL 欄（ホームページ / privacy / terms）の確認と保存を案内。審査提出時は Search Console でのドメイン所有確認が必要（TXT レコード）。
- 09-11 0:33 利用者が Search Console のプロパティ追加画面 → 「ドメイン」で `seo-checker.tokyo` → TXT を Cloudflare DNS（名前 `@`）に追加 → 確認、の手順を案内（#31）。
- 09-11 0:35 Search Console が Cloudflare を自動検出（「確認を開始」で Google が TXT を自動追加する方式）。手動 TXT は不要と案内。失敗時は手順プルダウン「その他」で手動に切り替え。
- **09-11 0:38 Search Console の所有確認完了**（ドメイン名プロバイダ方式、Cloudflare が TXT を自動追加）。審査の前提: ポリシー・規約・紹介サイト・ドメイン確認まで済み。残り: ブランディングの保存確認、動作確認、デモ動画（台本は Claude）、用途説明文（Claude）、公開申請。
- 利用者の質問「Claude Code 側でチェックできる？」→ 本番 2 ドメインは egress 403、Google Cloud はログイン要で不可。リポジトリ内のソースは確認済み。許可ドメインを環境設定（Network policy）に足せば今後は可能と案内（任意）。
- **09-11 1:01 利用者の画面で 3 点確認**: /privacy 末尾の運営者情報、seo-checker.tokyo のヘッダー・フッター（配信切り替え後の内容）、ブランディングの保存済み値。Google 審査の書類側はそろった。残り: 動作確認 → デモ動画（台本 Claude）→ 用途説明文（Claude）→ 公開・申請。ロゴは審査後。
- 利用者が無料 AIO 診断で seo-checker.tokyo を採点した PDF（82 点・B、構造化データ 42、未対応: JSON-LD 無し・sameAs 無し、改善余地: 具体情報・FAQPage・Organization・BreadcrumbList・WebSite）を共有し「HP を改善して」→ `marketing/public/index.html` に JSON-LD 6 種と「サービス概要」表、`sitemap.xml` / `robots.txt` / `llms.txt` を追加。`analyzeFetched` でオフライン採点し **100 点（全 5 カテゴリ 100）** を確認（一時テストは削除済み）。sameAs は公式 SNS が無いため app.seo-checker.tokyo を暫定登録。**利用者に公式 SNS / GitHub 等の URL があれば sameAs に追加する（#32）**。
- r20: Data API 画面の URL が `/rest/v1/` 付きなので、そのまま貼っても動くように正規化。新形式の Secret key（`sb_secret_`）にも対応（apikey ヘッダのみ。JWT なら Bearer も）。
- 利用者の質問「HP の内容をこのリポジトリに deploy できますか？」→ 3 案（Vercel に一本化 / Cloudflare のままソースだけ移す / アプリ内のページとして追加）を提示し、利用者は **「Cloudflare のまま・ソースだけ移す」** を選択。
  旧 `matsu609/seo-checker-HP` の `public/index.html`（45KB）と `wrangler.jsonc` をそのまま `marketing/` にコピー（内容は 1 バイトも変えていない）。`marketing/README.md` に配信の手順、README の「構成」と `services.md` に位置づけを追記。
  `npx wrangler@4 deploy --dry-run` を `marketing/` で実行し、アセットを認識できることを確認。lint / tsc / test（90 ファイル・1285 件）/ build 通過。
  **アプリの動きは変わらないので `add-release.mjs` は実行していない**（リリース履歴はアプリの変更を記録するもの。必要なら追加する）。
  残り: 利用者が Cloudflare の接続先を切り替える（#29）。そのあと旧リポジトリはアーカイブしてよい。紹介サイトの連絡先プレースホルダは #30。
  利用者の了承を得て main にマージ済み（`8e6186b`）。**Cloudflare の Build 設定を切り替えるまで、紹介サイトは旧リポジトリのままの内容が配信され続ける**（表示は変わらない）。
- 利用者の指示「このサイトのタブの画像をサービスのページの画像と同じに」（紹介サイトのタブが地球儀のまま）→ 紹介サイトの `<head>` にアイコンの指定が 1 つも無く、ブラウザの既定が出ていた。`scripts/generate-icons.mjs` を拡張し、`src/app/icon.svg`（アプリと同じ元データ）から `marketing/public/` にも `favicon.ico` / `icon.svg` / `apple-icon.png` を書き出すように。`marketing/public/index.html` に `<link rel="icon">` など 3 行を追加。手でコピーすると片方だけ古くなるため、生成の一本化にした。アプリ側の生成物はバイト単位で同一（差分なし）。wrangler の dry-run で 4 ファイル認識、lint / tsc / test（90 ファイル・1285 件）/ build 通過。**タブに反映されるのは #29（Cloudflare の接続先切り替え）のあと**。いまはまだ旧リポジトリの内容が配信されている。
- 利用者の質問「Claude Code は別のリポジトリの情報を別のリポジトリにプッシュできないの？」→ **できるが、そのリポジトリが push 権限つきでセッションに接続されている必要がある**。今回 `seo-checker-hp` は読み取り専用（公開リポジトリなので clone だけは無条件）でつないだため、書き戻しは不可。読み取り → こちらに取り込む向きは可、と説明。
- 利用者「リポジトリを分けたけど意味なかった？」→ 分ける利点（配信系統の切り分け、依存が要らない、権限を分けられる）と、分けると必ず起きる問題（同じ事実が両方に出る）を提示。判断軸は**同じ事実が両方に書かれるか**。今回は運営者名・連絡先・料金・アイコンが該当し、実際にずれていた。A（統合）/ B（分けたまま旧リポジトリに push、`marketing/` は削除）/ C（折衷）を提示。
- **利用者は A（統合）を選択。**本番はまだ切り替わっていないので、残りは #29（Cloudflare の Build 設定）だけ。切り替え後に旧リポジトリ `matsu609/seo-checker-HP` をアーカイブする。
- 利用者が Cloudflare の Build 設定を切り替え（#29）。Git リポジトリ `matsu609/seo-checker`、ルートディレクトリ `marketing`、ビルドコマンドは空、非本番ブランチのビルドはオフ。**監視パスの「除外」に `*` を入れかけていたのを保存前に止めた**（全パス除外になり、以後ビルドが一切走らなくなるため）。設定値は上の節に記録。
- このコミットは**ビルドのきっかけを作るための push** でもある（Workers Builds は push で走る。保存だけでは走らないことがある）。
- **紹介サイトの切り替え完了（#29）。**`c60fe42` の push で Workers Builds が走り、バージョン `9ef76797` がアクティブに（0:04）。配信内容の確認は利用者のブラウザで行う — **このセッションのネットワークポリシーが `seo-checker.tokyo` への接続を 403 で拒否するため、Claude 側からは取得できない**（`curl` は `CONNECT tunnel failed, response 403`）。
- Cloudflare の画面に「エージェント Lee のアクセスを有効化」（API トークンを作る勧誘）が出ていた。**Claude が要求したものではない**ので、心当たりが無ければ許可しないよう伝えた。
- 利用者の質問「HP が壊れたりしない？ アプリと HP が同じリポジトリで、ファイルの参照はどう分けている？」→ 分かれ目は ①ビルドの入口（Vercel はルートで `next build`、Cloudflare は `marketing/` で `wrangler deploy`）②URL の置き場所（`marketing/public/` は apex 直下、ルートの `public/` は `app.` 直下。同名の `favicon.ico` があっても別ドメインなので衝突しない）③`index.html` が自己完結（CSS 内蔵・JS 無し・外部は Google Fonts のみ）。`src/` や `next.config.ts` から `marketing` への参照が無いこと、`marketing/` に `.ts` が無いことを grep で確認済み。**ビルドが失敗しても直前の成功バージョンが配信され続ける**（白紙にはならない。バージョン履歴からロールバック可）。説明は `marketing/README.md` に追記した。
- 利用者の質問「`next build` と `npx wrangler deploy` の違いは？」→ 前者は**変換**（TypeScript / React をブラウザが読める形にして `.next/` に出す。配置は Vercel が別途行う）、後者は**配置**（変換せずファイルを Cloudflare にアップロードして公開）。紹介サイトは最初からブラウザが読める HTML なので変換が要らず、Cloudflare のビルドコマンドを空にしたのはこのため（`npm run build` が入っていると `marketing/` に `package.json` が無くて失敗する）。
