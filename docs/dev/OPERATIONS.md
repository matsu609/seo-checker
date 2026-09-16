# 運用メモ・引き継ぎ（OPERATIONS）

**このファイルだけを読めば、誰でも（次の Claude Code セッションでも、別の開発者でも）作業を引き継げる**ことを目的にした記録です。コードではなく「いまどういう状態で、何が決まっていて、何が残っているか」を書きます。

## このファイルの使い方（更新ルール）

- **利用者とのやり取りのたびに、作業の最後に必ず更新して main に push する**（利用者の指示。2026-09-10）。
- 更新はドキュメントだけなので、作業ブランチ・4 つの検証・`add-release.mjs` は不要。**main に直接コミット**してよい（メッセージは `運用メモを更新（YYYY-MM-DD）`）。コードを触った場合は従来どおりブランチ → 検証 → マージ → `add-release.mjs`。
- **秘密の値（`sk_`、`GOCSPX-`、API キー、パスワード）は絶対に書かない。**変数名と「設定済み / 未設定」だけを書く。
- 利用者への作業依頼は、手順ごとに**サービス名・画面名・URL**を必ず書く（利用者の指示。表: # / サービス・画面 / URL / やること）。よく使う URL は下記「よく使う画面の URL」。
- 「現在の状態」「残タスク」「入力待ち」は常に最新に書き換える。「判断の経緯」「作業ログ」は追記する。
- 全体像の説明は [services.md](./services.md)、**ツールと API キーの関係は [tool-map.md](./tool-map.md)**、SEO 分析ツールの要件と実装計画は [seo-analysis-spec.md](./seo-analysis-spec.md)、**GSC / GA4 / CRM の自動診断（約 120 ルール）の仕様は [diagnosis-rules-spec.md](./diagnosis-rules-spec.md)**、開発規約は [ARCHITECTURE.md](./ARCHITECTURE.md)、機能説明は [README](../../README.md)。ここには重複させず、状態と判断だけを書く。

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
| Open PageRank（ドメインの外部リンク評価） | https://www.domcop.com/openpagerank/ |
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

## 現在の状態（2026-09-11 時点）

### サービスの構成と稼働状況

| サービス | 状態 | 備考 |
|---|---|---|
| GitHub `matsu609/seo-checker` | main = r60 | main に push すると Vercel が自動デプロイ。紹介サイトのソース `marketing/` も同居（09-10 に統合） |
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
| Stripe（直結） | **コードは完成（r41）、Stripe 側の設定と Vercel の環境変数が未了** | 利用者は Stripe アカウント作成済み。#58 の手順（商品・価格 → Webhook → ポータル → 環境変数）。Clerk Billing はドルのみのため使わない。プランは `DEFAULT_PLAN=pro` のまま |

### Vercel の環境変数（Production）

| 変数 | 状態 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 設定済み（`pk_live_`、Production のみ） | 復号すると `clerk.seo-checker.tokyo` |
| `CLERK_SECRET_KEY` | 設定済み（`sk_live_`、Production のみ） | **要ローテーション**（会話に貼られた） |
| `ADMIN_EMAILS` | `matsumatsu452@gmail.com` | マスター画面の管理者 |
| `DEFAULT_PLAN` | `pro` | Production and Preview |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PRO` / `STRIPE_WEBHOOK_SECRET` | 未設定 | 決済（r41）。#58。まずテストキー（`sk_test_`）で確認 → 本番キーに差し替え |
| `SITE_MAX_PAGES` | `100` | Production and Preview（一度誤って Preview のみにしたが復旧済み） |
| `ANTHROPIC_API_KEY` | **設定済み**（09-10 17:30 設定画面で「設定済み」を確認） | Claude Console のクレジット購入済み |
| `PAGESPEED_API_KEY` | **登録済み**（利用者報告 09-10 17:4x「AB 完了」）。設定画面での確認は未 | |
| `OPENPAGERANK_API_KEY` | **未設定** | ドメインパワーの「外部からのリンクの評価」（Open PageRank）。無料。#80。未設定でも残り 7 指標でドメインパワーは出る（配点 25 点分を分母から外す） |
| `GOOGLE_PLACES_API_KEY` | **設定済み**（09-10 17:30 設定画面で「設定済み」を確認） | seo-checker の Places API (New) 制限つきキー |
| `FREE_MEO_DAILY_LIMIT` / `FREE_MEO_DAILY_SEARCH_LIMIT` | 未設定（既定 500 / 1,500 で動く。0 で無料 MEO 診断を停止） | r25 |
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
| 45 | r27 の SQL を Supabase で実行（`meo_owner_inputs`） | 利用者 | **完了（09-11 17:21、画面で Success を確認）**。残りは本番 `/tools/maps` の「オーナー情報の入力」で保存できるかの確認 |
| 19 | **`CRON_SECRET`** を Vercel に登録（Secret、Production）→ Redeploy。登録後、Vercel の Settings → Cron Jobs に `/api/cron/maps-refresh`（`0 20 * * 0`）が出ることを確認 | 利用者 | 未 |
| 4 | フェーズ 2 のコード: 診断結果の保存・履歴・「最新診断結果」カード | Claude | **完了（r19、r21 で「保存」ボタンは廃止し自動保存に）** |
| 5 | Business Profile API の利用申請 | 利用者 | **申請済み（09-11 20:52、ケース ID `0-4126000041187`、審査 7〜10 営業日）**。承認メール待ち → #54 ②〜④へ |
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
| 11 | フェーズ 3（承認後）: Business Profile API で 9 項目（r27 ではオーナー申告で埋めている）を API の値に置き換え、インサイト（8 指標・期間比較・CSV・詳細グラフ）を追加 | Claude | 承認待ち |
| 12 | 規約・ポリシーの専門家レビュー | 利用者 | 推奨 |
| 13 | Google OAuth の本番公開申請（GA4 の `analytics.readonly` が機密スコープ。2〜6 週間）。準備: #6 運営者情報 → 紹介サイト seo-checker.tokyo に説明 + /privacy /terms リンク → Search Console で seo-checker.tokyo の所有確認 → #8 ブランディング URL → 用途説明文（Claude が文案）→ デモ動画 2〜3 分（Claude が台本）→ Google Auth Platform で「公開」→ 審査申請。**テスト中はトークンが 7 日で失効**。それまではテストユーザー（100 人まで） | 利用者 + Claude | 未 |
| 15 | Places API の **利用者ごとの月間上限**（例: レポート 50 回 / 月）を Supabase で数えて 429 を返す。お客様に開放する前に入れる。費用は運営者のプロジェクト 1 本に集中するため | Claude | 提案中（利用者の判断待ち） |
| 16 | Places の費用削減: 競合比較の詳細取得は口コミ・紹介文を外した安い区分のフィールドマスクにする（`src/lib/maps/client.ts` のマスクを 2 種類に） | Claude | 候補（利用が増えたら） |
| 17 | 競合分析の強化（提案中）: 競合の履歴保存と推移グラフ、口コミ内容の AI 要約比較（自社 vs 競合の褒め・不満）、口コミ増加ペースの推定。地点別の擬似順位は要望が出てから | Claude | 利用者の判断待ち |
| 46 | 検索順位の計測 | Claude | **完了（r29）**。対策キーワード（オーナー情報の入力）= 順位計測のキーワード。費用は Text Search Pro 区分（月 5,000 回まで無料。1 店舗 5 KW × 月 4 回 = 20 回） |
| 47 | 周辺の同業との相対位置 | Claude | **完了（r29）**。費用は Nearby Search **Enterprise 区分（評価・件数が要るため。月 1,000 回まで無料。週 1 回 × 自社店舗数 → 250 店舗まで無料枠内）** |
| 48 | Google Cloud の予算アラート・割り当ての確認（r28〜r29 で Places の呼び出しが 1 店舗あたり週 1 回 → 週 1 + KW 数 + 1 回に増えた）: 予算アラート https://console.cloud.google.com/billing/budgets?project=seo-checker-508104 、API の割り当て https://console.cloud.google.com/apis/api/places.googleapis.com/quotas?project=seo-checker-508104 | 利用者 | 推奨（店舗が 100 を超える前に） |
| 18 | **週次一斉更新**: 店舗登録を Supabase `meo_stores` へ、Vercel Cron（`0 20 * * 0` UTC = 月曜 5:00 JST）→ `/api/cron/maps-refresh`。登録直後だけ即時取得。競合も毎週（利用者了承。費用は超過分を許容） | Claude | **完了（r21）**。本番の動作確認は #2 #3 #19 のあと |
| 20 | AI 総評の検証（候補）: 生成文中の数値が入力（スコア・件数・評価）に存在するか照合し、無ければ再生成。`src/lib/maps/commentary.ts` の後段に純粋関数で | Claude | 実物を見てから判断 |
| 21 | AI 総評のパーソナライズ（候補）: 前回の報告書の要約（スコア・件数の差分）を入力に加えて推移を書かせる。店舗ごとの「メモ」欄（`meo_stores` に列追加）を入力に加える | Claude | 利用者の優先度次第 |
| 22 | AI 総評の自動生成（候補）: 一斉更新（`refresh.ts`）の保存後に `generateMeoCommentary` を呼んで `aiCommentary` に入れる。頻度は「毎週 / 第 1 月曜のみ / 手動のまま」から利用者が選ぶ。失敗しても更新自体は止めない | Claude | 利用者の判断待ち |
| 23 | ~~「AI に相談する用のテキストをコピー」ボタン~~ | — | 不要（API 運用に決定） |
| 24 | `PAGESPEED_API_KEY` を Vercel に登録 → Redeploy | 利用者 | 完了（報告ベース） |
| 25 | 設定画面の Supabase の説明文を r21 の内容に更新 | Claude | 完了（r22） |
| 31 | Search Console で `seo-checker.tokyo` の所有確認 | 利用者 | **完了（09-11 0:38、Cloudflare 連携で自動。TXT は消さない）**。matsumatsu452@gmail.com が所有者 → ツールの検索パフォーマンスで seo-checker.tokyo を選べる |
| 32 | 紹介サイトの JSON-LD `sameAs` に公式 SNS（X / Instagram / YouTube / note など）や GitHub の URL を追加（利用者から URL をもらう）。FAQ の文面を変えたら FAQPage の JSON-LD も同文に直す | 利用者 → Claude | URL 待ち |
| 33 | MEO「サイト・Google 情報の調査」カード（提案中）: 登録店舗の公式サイト URL（Places の websiteUri）に無料 AIO 診断エンジン（`analyzeFetched`）を走らせ、JSON-LD / 本文から店名・住所・電話を抜いて Places の値と NAP 整合を判定。競合 5 件にも同じ診断をして並べる。API 費用ほぼゼロ、半日 | Claude | 利用者の GO 待ち |
| 34 | MEO「AI 検索での見つかり方」カード（提案中）: 地域 + 業種から質問 5 本を自動生成（prompt-expansion 流用）→ LLMO の仕組みで Claude（Web 検索つき）に投げ、自社名 + 競合名の言及を判定 → 質問 × AI の表と店名の出現集計。まず Claude のみ（1 店舗 1 回 15〜30 円）、月 1 回の自動実行 + 推移。他社 LLM は各 API キーが要る。競合未登録なら Places 検索で同地域・同業種の上位 5 件を自動投入も可 | Claude | 利用者の GO 待ち |
| 37 | **クイック診断（店舗・MEO）** ※旧「無料 MEO 診断」 | Claude | **完了（r25、案 A = ログイン不要 `/meo`）**。旧メモ:: A = ログイン不要の公開ページ `/meo` + 公開 API（`PUBLIC_PAGES` / `PUBLIC_APIS` に追加）、IP ごとの回数制限（/api/site の仕組み流用）、日次の全体上限（環境変数、超過時は「本日の無料枠は終了」）、6h キャッシュ、報告書末尾に有料導線。B = free プランで自社 1 店舗のみ登録。料金表（catalog / PlanTable）と紹介サイト・README を更新 | 利用者 → Claude | A/B 判断待ち |
| 35 | 無料プランの線引き | — | r25 で確定（r50 でサイト全体は代表 10 ページに変更）: ログイン不要 = サイト診断 + MEO 診断（1 店舗、保存・競合・更新・AI 総評なし）。#33 / #34 を無料に入れるかは別途。旧メモ:: free プランに MEO 自社 1 店舗 1 回（店舗登録 1 件・履歴 1 件・一斉更新対象外・競合なし・AI 総評なし）と #33、#34（Claude のみ 3 質問 1 回）を入れる案。決まったら料金表（PlanTable / plans catalog / 紹介サイト）と登録制限を実装 | 利用者 → Claude | 判断待ち |
| 36 | MEO の自己申告入力: **9 項目分は r27 の「オーナー情報の入力」で実装済み**。残りは「Places に無い店舗」向けに店名・住所・電話・営業時間・写真枚数まで手入力する簡易版（要望が出てから） | Claude | 一部完了（r27） |
| 38 | 無料 MEO 診断の回数制限を Supabase に移す（候補）: いまはプロセス内メモリで、Vercel の複数インスタンスでは上限の数倍まで通る。利用が増えたら `free_usage` テーブルで日次カウント | Claude | 利用が増えたら |
| 39 | **公開前に必須**: Vercel `DEFAULT_PLAN` を `free` に（自分は ADMIN_EMAILS なのでマスター画面で pro を個別開放）→ Redeploy。Clerk Production → Configure → Restrictions で招待制 / 許可リスト（決済がつながるまで） | 利用者 | 未 |
| 40 | クイック診断（店舗）を「要点のみ」に絞る案 B（#69 と同じ論点）: 総合評価・4 カテゴリ・改善点上位 3・口コミの数字だけ表示し、21 項目の一覧・口コミ本文・PDF は「無料登録で開放」。登録後は free プランで /tools/maps に自社 1 店舗（履歴 1 件・一斉更新対象外・競合なし・AI 総評なし） | Claude | 利用者の判断待ち（推奨 B） |
| 41 | 料金: ~~オールインワン 9,800 円（r26）~~ → **定価 50,000 円 + 割引はクーポンコードが基本に変更（r46、利用者の決定 2026-09-13）**。「機能ごとに 3,000 円引き」の文言は全部消した。旧: オールインワン 9,800 円の 1 本に決定（r26）。割引は「使わない機能ごとに 3,000 円引き」の個別対応 → 運用者が Clerk の `publicMetadata.plan` に `standard`（6,800 円相当）を割り当て、決済は Stripe の支払いリンク等で手動。旧案:: ライト 2,980（1 領域）/ スタンダード 5,980 / プロ 9,800 / 追加店舗 +300。実装: `PlanId` に `light` 追加、選択領域（seo/aio/meo）を publicMetadata、`category` でゲート、店舗数・KW 数の上限（`meo_stores` 件数・順位計測の登録数）、PlanTable・紹介サイト・Clerk Billing のプラン | 利用者 → Claude | 数字の判断待ち |
| 42 | **商用化前に Vercel を Pro プランへ**（Hobby は非商用限定。月 20 ドル）。Settings → General → Plan | 利用者 | 未 |
| 43 | 「特定商取引法に基づく表記」ページ `/legal/tokushoho` | Claude | **完了（r41）**。内容（解約は期間末まで利用可・日割り返金なし・運営責任者「松下」）は Claude の仮置き。利用者が確認して直す点があれば伝える |
| 44 | ~~決済の開始（Clerk Billing）~~ → **Clerk Billing はドルのみのため取りやめ。Stripe 直結（r41、#58）に置き換え** | — | 取りやめ |
| 58 | **決済を有効にする（Stripe 側と Vercel の作業）**（テスト環境は 1〜7 完了。09-13 にテストカードで申し込み → 「契約中 / ¥50,000 / 次回更新 2026-10-13」を確認。残るは ⑧ 本番モード）: ① 商品と価格（月 9,800 円 JPY）→ ② Webhook → ③ カスタマーポータル → ④ 公開事業者情報に特商法ページの URL → ⑤ Vercel の環境変数 3 つ → Redeploy → ⑥ テストカードで申し込み → カード変更 → 解約を確認 → ⑦ 本番キーに差し替え（下の「Stripe を有効にする手順」） | 利用者 | 未 |
| 49 | **口コミ支援（アンケート QR）** | 利用者 → Claude | **完了（r34）**。利用者の決定（09-11）「Google は AI で調整した口コミを正式には禁止と明言していない」→ たたき台どおり AI 下書き・トーン・キーワード設定を含めて実装。設計時の照合結果は [review-support-design.md](./review-support-design.md) §2 に残してある |
| 51 | r34〜r35 の SQL を Supabase で実行（`review_forms` / `review_channels` / `review_responses`） | 利用者 | **完了（09-11 17:17、完全版を実行。画面で Success を確認）**。残りは本番 `/tools/reviews` での動作確認 |
| 50 | 口コミポリシーの原文確認（この環境からは support.google.com / caa.go.jp が開けない）: review-support-design.md §10 の URL 1〜3 | 利用者 | 利用者が確認済みとして判断（09-11）。任意 |
| 52 | 口コミへの返信（段階 1）: 公開情報の口コミ（最新 5 件）→ AI 返信案 → コピーして GBP へ | Claude | **完了（r37、`/tools/replies` の「接続前の代替」）** |
| 53 | 口コミへの返信（段階 2）: Business Profile API で全件取得・ツール内から投稿・更新・削除 | Claude | **コードは完了（r37）**。動くのは #54 の 4 手順が終わってから |
| 56 | r39 の SQL を Supabase で実行（`listing_profiles` テーブル） | 利用者 | **完了（09-11 22:24、画面で Success を確認）**。残りは本番 `/tools/listings` での保存確認 |
| 57 | 基本情報掲載の「一括同期」を本当に自動化するなら、配信代行（Uberall / Yext）の契約と API 連携が要る（有料、店舗ごと月額）。契約するかは利用者の判断（下の「入力待ち」） | 利用者 → Claude | 判断待ち |
| 55 | r38 の SQL を Supabase で実行（`review_forms.translations` と `review_responses.lang`） | 利用者 | **完了（09-11 22:24、r39 の SQL と同時に実行。画面で Success を確認）** |
| 54 | **口コミ返信を有効にする（Google 側の作業）**: ① Business Profile API の利用申請 → ② 承認後、Google Cloud で API 3 つを有効化 → ③ OAuth の同意画面に `business.manage` スコープを追加 → ④ 本番 `/tools/replies` で「Google に口コミ返信の権限を追加する」→ Google の確認画面で許可（下の「口コミ返信を有効にする手順」） | 利用者 | **①申請済み（09-11、ケース ID `0-4126000041187`、7〜10 営業日）**。②は Account Management / Business Information の 2 つが有効化済み（09-11 確認）。残りの「Google My Business API」（v4）と③④は承認メール後 |
| 59 | クイック診断の切り出し（zip）を作るスクリプト `scripts/extract-free.mjs` | Claude | **完了（r42、09-12 に利用者の判断で main へマージ）** |
| 14 | Preview 環境用の Clerk キー（Development の `pk_test_` / `sk_test_`）の登録（Preview を使うなら） | 利用者 | 任意 |
| 60 | registry の食い違いを直す: `/tools/maps` の `optional` に `anthropic` を足す、`/tools/site-report` の `serpapi` を間接依存として書き直す（[tool-map.md](./tool-map.md) の ※1・※4） | Claude | 未（次にコードを触るときで可） |
| 61 | 採点ツールの誤検出を直す: 意図した noindex（サイト内検索の結果ページなど）とトップページのパンくずを減点しない | Claude | **完了（r43、09-12 に利用者の指示で main へマージ）** |
| 62 | 採点ツールの誤検出（続き）: もともと検索に載せないページの **robots.txt での拒否**（`ai-crawlers-allowed`・配点 3）も減点しない。サイト全体の拒否（`Disallow: /`）は従来どおり減点 | Claude | **完了（r44、09-12 に利用者の指示で main へマージ）** |
| 63 | サイト診断: **検索に載せないページを採点対象外（参考）にする**。noindex か robots.txt で実際に検索から外されているサイト内検索の結果などは、診断はするが平均点・項目の集計・ページ一覧に入れず、付録 A に理由つきで載せる | Claude | **完了（r44）** |
| 64 | 採点ツール: **本文の具体性の判定を多言語対応にする**（英語ページが本文を 2 倍にしても「1 / 全 1 文・改善余地」から動かない件）。言語判定・文の区切り・事実の手がかりを多言語化し、文が少ないページは比率で判定しない。判定根拠（総文数・言語・基準・実例 3 件）をレポートに出す | Claude | **完了（r45、09-13 に利用者の指示で main へマージ）**。マージ後の main でも lint / tsc / test（110 ファイル・1,490 件）/ build を通してから push した |
| 65 | 依頼の任意項目「意図的な仕様の申告」: noindex の検索結果ページやトップのパンくずのように、意図して外している項目を申告して指摘から外す仕組み。r43 / r44 で自動判定できるものは既に外してあるので、残るのは「自動では区別できないもの」の手動申告 | 利用者 → Claude | 判断待ち（下の「入力待ち」） |
| 66 | **パワーアップ分析（連携不要の SEO 分析。有料・回数制限つき）**: 設計は [seo-analysis-spec.md](./seo-analysis-spec.md) §0。利用者の決定（09-13、6 点すべて推奨案）。**A′（r55）に続き B′〜E′ を r56 で main にマージ**（09-14、利用者の指示「一気に実装してメインにマージ」）: `/tools/seo-analysis`（事実シート → Claude の分析 → ChatGPT のセカンドオピニオン → 報告書 PDF → 履歴）、CrUX、SerpApi、GSC / GA4 の任意層、各画面の「AI に分析させる」（まずサイト診断）。**利用者側の作業**: ① Supabase で `analysis_runs` の SQL を実行（下の「パワーアップ分析の実行記録」）② Google Cloud で Chrome UX Report API を有効化し PageSpeed 用キーの制限に追加（下の #78）③ 本番で 1 回動かして AI の出力とトークン量を確認。残り: URL Inspection（E′ の一部）、実際の出力を見てのプロンプト調整 | 利用者 → Claude | **B′〜E′ 完了（r56）。利用者の作業 ①② 待ち** |
| 78 | **パワーアップ分析を動かすための設定**（下の表「パワーアップ分析を有効にする手順」）: ~~Supabase の SQL~~ → Chrome UX Report API の有効化とキーの制限追加 → 本番で試す → `SEO_ANALYSIS_MONTHLY_LIMIT` は既定 10 のままでよいか | 利用者 | **1・2 完了（09-15。`analysis_runs` を作成、Chrome UX Report API を有効化）**。**1b・3 完了（09-15。`audit` 列を追加、キーの API の制限に Chrome UX Report API を追加）**。残り 4（本番で 1 回実行） |
| 79 | **SerpApi を有効にする**: ~~アカウント → API キー → Vercel `SERPAPI_KEY` → Redeploy → `/admin` で確認~~ → パワーアップ分析を再実行して「対策キーワードの順位」が出ること | 利用者 | **設定完了（09-15、`/admin` で「設定済み」を確認）**。残りは本番で 1 回の再実行 |
| 67 | **クイック診断を本サービスから切り離す**: 専用の公開シェル（サイドバー無し）・結果の下の導線・`robots.txt` / `sitemap.xml`・契約後の「はじめかた」3 ステップ・設定画面の Google 連携の補足 | Claude | **完了（r49、09-13）**。lint / tsc / test（1,504 件）/ build 通過、本番ビルドで表示確認 |
| 68 | **呼び名を「クイック診断 / 精密診断」に統一し、無料の深さを絞る**: 画面・PDF・紹介サイト・llms.txt・README・設計ドキュメントの文言を変更。サイト全体の診断を最大 300 ページ → 代表 10 ページ（`FREE_SITE_MAX_PAGES`）にし、残りページ数を出して精密診断へつなぐ | Claude | **完了（r50、09-13）**。lint / tsc / test（1,509 件）/ build / E2E スモーク（18 ページのダミーサイトが 10 ページで打ち切り）通過 |
| 69 | クイック診断（店舗・MEO）の扱い | 利用者 → Claude | **方針決定・完了（r51）**。利用者の判断「隠すのではなく、評価を厳しくできるなら改善点が増えるのでそちらが良い」→ 項目を隠さず**採点基準を厳しくした（v2）**。#40 の案 B（要点だけ見せて残りは登録で開放）は採らない |
| 80 | **Open PageRank を有効にする**（ドメインパワーの「外部からのリンクの評価」。無料）: domcop で登録 → API キー → Vercel `OPENPAGERANK_API_KEY`（Secret、Production）→ Redeploy → `/admin` の外部連携で「設定済み」を確認 → パワーアップ分析を再実行してドメインパワーの内訳に「外部からのリンクの評価」が出ること。下の「Open PageRank を有効にする手順」 | 利用者 | 未 |
| 81 | ドメインパワーの本番確認: 日本の `.jp` / `.co.jp` のサイトで **RDAP（ドメインの登録日）が取れるか**を 1 回見る。取れなければ内訳の「ドメインの年数」が「未取得」になり、配点 15 点分が分母から外れるだけで報告書は出る（対応が要るなら別の取得先を検討） | Claude + 利用者 | 未 |
| 70 | **MEO の採点基準を厳しくする（v2）**: 営業時間の欠け → 要改善、自社サイト以外の URL → 注意、平均評価 4.5 / 4.2、口コミ件数 50 件、口コミの新しさ 30 / 90 日、オーナー写真 5 枚、低解像度が半数で要改善、口コミ本文 3 割未満で要改善、属性は「はい」だけ数える | Claude | **完了（r51、09-13）**。lint / tsc / test（1,510 件）/ build 通過。本番の登録店舗は次回の一斉更新（月曜 5:00 JST）で新基準に切り替わる |
| 71 | 採点基準 v2 への切り替えを既存のお客様に伝える（スコアが全体に下がるため）。報告書の末尾には「採点基準 v2（2026-09-13 改定）」と履歴が直接つながらない旨を明記済み | 利用者 | 未（お客様に渡す前に） |
| 72 | **MEO 報告書に「優先改善リスト」と「採点基準の付録」を足す（B・C）**: 配点 × 現状で「直すと +N 点」を出す / 21・28 項目の配点と判定条件を開示。クイック診断と精密診断の両方に出す。未取得 9 項目は「オーナーにしか分からない項目」としてまとめ、精密診断への導線にする | Claude | **完了（r52、09-13）** |
| 73 | **口コミの傾向分析（D。精密診断のみ）**: 履歴に貯まった口コミを重複排除して集計し、頻出語・良い点 / 不満の兆候・星別の傾向を出す。生成 AI 不使用・API 費用ゼロ | Claude | **完了（r53、09-13）** |
| 74 | **NAP 整合チェック（E。精密診断のみ）**: 登録サイトを自前クローラで読み、JSON-LD と本文から店名・住所・電話を抜いて Google の値と突き合わせる（`src/lib/listings/profile.ts` の `compareNap` / `normalizeForCompare` を再利用）。追加の API 費用はゼロ | Claude | **完了（r53、09-13）** |
| 75 | クイック診断（店舗）に「その場で答える 9 項目」を置くか（案 A） | — | **見送り（利用者の判断 2026-09-13）**。9 項目はオーナーにしか分からない情報なので、精密診断の「オーナー情報の入力」に残す |
| 76 | **クイック診断の入口を塞ぐ**（サイドバーから削除・ログイン済みは `/start` へ・紹介サイトと robots から除外）とタブ順を SEO → MEO → AIO に | Claude | **完了（r54、09-13）** |
| 77 | 紹介サイトの「クイック診断 0 円」の料金カードを消したので、**無料の診断を営業でどう使うか**（誰に、どの場面で URL を渡すか）を決める。渡す URL は `https://app.seo-checker.tokyo/` と `/meo` | 利用者 | 未 |
| 82 | **GSC / GA4 / CRM の自動診断 + コンサル回答生成**: 仕様は [diagnosis-rules-spec.md](./diagnosis-rules-spec.md)。利用者の決定（09-15）= **入口は既存の Google 連携（OAuth）のみ・CSV は作らない／パワーアップ分析と同義（別ツールにしない）**。**G1・G2・G3・G6 完了（r61）= GSC 79 ルール**。**G4 完了（r62）= GA4 47 ルール + イベント名の共通化。合計 126 ルール**。残り: G5（GSC × GA4 の 20 件、1〜2 日）→ G7（人間による承認）→ G8（CRM） | Claude | **G1〜G4・G6 完了（r62）。次は G5** |

### 口コミ返信を有効にする手順（#54。すべて利用者の作業）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google → Business Profile API のアクセス申請 | https://developers.google.com/my-business/content/prereqs | 前提 1〜3 は済み。4（組織アカウント）は個人アカウントのプロジェクトなので不要。5 のリンクから英語のフォームへ。**`matsumatsu452@gmail.com` でログインした状態で送る**（審査対象はログイン中のアカウント）。Application for Basic API Access / 連絡先 contact@seo-checker.tokyo / SEO 研究所 / https://seo-checker.tokyo/ / Project ID `seo-checker-508104` と Project number（Cloud のダッシュボードの数字）/ 確認済み 60 日以上のプロフィール / 用途の英文は 09-11 の会話に記載（口コミの取得・返信の投稿更新削除・基本情報の取得、OAuth business.manage、サービスアカウント不使用）。**審査は数日〜数週間**。承認メールが来たら次へ |
| 2 | Google Cloud → API ライブラリ（3 つを有効化） | https://console.cloud.google.com/apis/library?project=seo-checker-508104 | 「My Business Account Management API」「My Business Business Information API」「Google My Business API」（v4）をそれぞれ検索して「有効にする」。**前 2 つは 09-11 に有効化済み**（「有効な API とサービス」に表示を確認）。残りは v4（https://console.cloud.google.com/apis/library/mybusiness.googleapis.com?project=seo-checker-508104 ）。承認前は一覧に出ないか、有効化しても 403 になる |
| 3 | Google Cloud → OAuth → データアクセス（スコープ） | https://console.cloud.google.com/auth/scopes?project=seo-checker-508104 | 「スコープを追加または削除」で `https://www.googleapis.com/auth/business.manage` を追加して保存。テスト状態のままでよい（テストユーザーは使える。本番公開の審査時にこのスコープの説明とデモが要る） |
| 4 | 本番 → 口コミへの返信 | https://app.seo-checker.tokyo/tools/replies | 「1. 接続」の「Google に口コミ返信の権限を追加する」→ Google の確認画面で**ビジネスのオーナー / 管理者のアカウント**（`wolf@wolf-info.org` 側にオーナー権限がある。`matsumatsu452@gmail.com` は管理者として追加済み）で「ビジネス プロフィールの管理」を許可 → 戻ったらビジネスの一覧が出る |

①が終わる前に④を押しても害は無い（権限は付くが、口コミ一覧が「利用申請が承認され…」のエラーになる）。承認後に画面を開き直せばそのまま動く。

### パワーアップ分析を有効にする手順（#78。利用者の作業）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Supabase → SQL Editor | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/sql/new | 下の「パワーアップ分析の実行記録（r56）」の SQL を貼って Run → Success を確認。Table Editor に `analysis_runs` が出れば完了 |
| 1b | Supabase → SQL Editor | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/sql/new | **r58 で列が 1 つ増えた**: `alter table analysis_runs add column if not exists audit jsonb;` を貼って Run → Success。これが無いと報告書の「詳細: サイト診断」が空になる（他は動く） |
| 2 | Google Cloud → API ライブラリ（Chrome UX Report API） | https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com?project=seo-checker-508104 | 「有効にする」。無料・請求先不要 |
| 3 | Google Cloud → 認証情報 | https://console.cloud.google.com/apis/credentials?project=seo-checker-508104 | API キー「PageSpeed Insights (seo-checker)」を開く → 「API の制限」で **Chrome UX Report API** を追加して保存（別キーにするなら Vercel に `CRUX_API_KEY` を追加 → Redeploy）。制限が「制限なし」なら何もしなくてよい |
| 4 | 本番 → パワーアップ分析 | https://app.seo-checker.tokyo/tools/seo-analysis | `seo-checker.tokyo` などで 1 回実行（収集 1〜5 分 → AI 1〜3 分）。報告書の「結論」「改善案」「セカンドオピニオン」「速度」「付録」が出ること、右上の「今月 n / 10 回」が増えることを確認。運営者（ADMIN_EMAILS）は無制限 |
| 5 | Vercel → 環境変数（任意） | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | 月の回数を変えるなら `SEO_ANALYSIS_MONTHLY_LIMIT`（既定 10）。ChatGPT のセカンドオピニオンは `OPENAI_API_KEY`（LLMO と共用。未設定なら Claude だけで完成） |

### SerpApi を有効にする手順（#79。利用者の作業）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | SerpApi → 登録 | https://serpapi.com/users/sign_up | メールで登録（Google ログイン可）。無料プランは月の検索回数に上限がある（回数と料金は https://serpapi.com/pricing で確認。パワーアップ分析 1 回 = 最大 7 回、順位計測 = キーワード数 × 実行回数） |
| 2 | SerpApi → API キー | https://serpapi.com/manage-api-key | 「Your Private API Key」をコピー（会話には貼らない） |
| 3 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | 「Add」→ Key `SERPAPI_KEY`、Value にキー、Environment は Production（Preview も使うなら両方）、Sensitive にチェック → Save |
| 4 | Vercel → Deployments | https://vercel.com/matsumatsu452-6233/seo-checker/deployments | 最新のデプロイの「…」→ Redeploy（環境変数はデプロイ時に読まれるため） |
| 5 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | 「外部連携」の SerpApi が「設定済み」になり、サイドバーの順位計測の「要設定」が消えることを確認 |
| 6 | 本番 → パワーアップ分析 | https://app.seo-checker.tokyo/tools/seo-analysis | 対策キーワードを入れて「分析する」。KPI の「対策キーワードの順位」に「n / m 語が 100 位以内」と出れば完了（このときも今月の回数を 1 つ使う） |

SerpApi の実費が出るのはパワーアップ分析（1 回 ≤ 7 検索）・順位計測・AI Overviews 引用・ページ診断の上位 10 件・AIO 頻出トピック。無料枠を超えないよう、SerpApi のダッシュボード（https://serpapi.com/dashboard ）で残り回数を見る。

### Open PageRank を有効にする手順（#80。利用者の作業。無料）

ドメインパワーの 8 指標のうち、**外部からの被リンクを見ているのはここだけ**（配点 25 点）。未設定でも残り 7 指標で採点するが、その分は分母から外れるので「外部リンクが弱い / 強い」は言えない。

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Open PageRank → 登録 | https://www.domcop.com/openpagerank/ | 「Get your free API key」からメールで登録（無料。クレジットカード不要） |
| 2 | Open PageRank → ダッシュボード | https://www.domcop.com/openpagerank/auth/signin | ログインして API キーをコピー（会話には貼らない）。無料枠は 1 日 1,000 リクエスト・1 回 100 ドメインまで。このツールは 1 回の分析で 1 リクエスト（自社 + 競合 2 件）しか使わない |
| 3 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | 「Add」→ Key `OPENPAGERANK_API_KEY`、Value にキー、Environment は Production、Sensitive にチェック → Save |
| 4 | Vercel → Deployments | https://vercel.com/matsumatsu452-6233/seo-checker/deployments | 最新のデプロイの「…」→ Redeploy |
| 5 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | 「外部連携」の Open PageRank が「設定済み」になることを確認 |
| 6 | 本番 → パワーアップ分析 | https://app.seo-checker.tokyo/tools/seo-analysis | 分析を 1 回実行（今月の回数を 1 つ使う）。「ドメインパワー（推定）」のカードで、内訳の「外部からのリンクの評価」が「未取得」でなく 0〜10 の数値になれば完了。競合 URL を入れると「競合との比較」の表にも出る |

### Stripe を有効にする手順（#58。すべて利用者の作業。まずテストモードで通し、最後に本番キーへ）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Stripe → 商品カタログ | https://dashboard.stripe.com/test/products | **完了（09-13、サンドボックス）**: 商品「オールインワン」`prod_VFcHhP9RrDhK9E`、価格 **¥50,000 / 月** `price_1UF73IBQZc3g0qHVJGb0aumu`（= テスト環境の `STRIPE_PRICE_PRO`）。本番モードでは作り直しが要る（8） |
| 1c | **割引コードを作る（初月無料は自動、割引はコード入力）** | https://dashboard.stripe.com/test/coupons | 「新規」→ 名前「導入割引 2 万円引き」→ **金額割引 ¥20,000（JPY）**→ 期間「**永続**」→ 保存 →「プロモーションコードを追加」→ 顧客に渡すコード（例 `START30`）→ 保存。申し込み画面の「プロモーションコードを追加」で入力すると、無料期間の翌月から 30,000 円になる。コードを持たない人は定価 50,000 円のまま（この形なので定価表示が二重価格表示にならない） |
| 1b | Stripe → 商品カタログ → クーポン | https://dashboard.stripe.com/test/coupons | 割引の作り方: 「新規」→ 名前（例 `導入割引 40%`）→ 種類（% 割引 / 定額）→ 期間（**永続** = 契約中ずっと / 回数 = 最初の n か月 / 1 回）→ 保存 → クーポンの画面で「プロモーションコードを追加」→ 顧客に渡すコード（例 `WOLF40`）と利用回数の上限・有効期限 → 保存。申し込み画面（Checkout）でこのコードを入れると割引後の金額で決済される。契約中の顧客に後から付けるなら 顧客 → サブスクリプション → 「割引を追加」 |
| 2 | Stripe → 開発者 → Webhook（新しい画面では「ワークベンチ」→ Webhook タブ） | https://dashboard.stripe.com/test/workbench/webhooks | 「エンドポイントを追加」→ URL `https://app.seo-checker.tokyo/api/billing/webhook` → イベントを 4 つ選ぶ: `checkout.session.completed`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted` → 追加 → **署名シークレット（`whsec_…`）** をコピー |
| 3 | Stripe → 設定 → 請求 → カスタマーポータル | https://dashboard.stripe.com/test/settings/billing/portal | 有効にして保存。「お支払い方法の更新」「請求書の履歴」「サブスクリプションのキャンセル」を ON（キャンセルは「期間末」）。プランの変更は OFF（プランは 1 つ） |
| 4 | Stripe → 設定 → 公開事業者情報 | https://dashboard.stripe.com/settings/public | 事業者名 `SEO 研究所`、サポートメール `contact@seo-checker.tokyo`、サイト `https://app.seo-checker.tokyo/legal/tokushoho`（特商法の表記。本番アカウントの審査で見られる） |
| 5 | Stripe → 開発者 → API キー | https://dashboard.stripe.com/test/apikeys | **シークレットキー（`sk_test_…`）** をコピー（公開可能キー `pk_` は使わない） |
| 6 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | `STRIPE_SECRET_KEY`（5 の値）、`STRIPE_PRICE_PRO`（1 の値）、`STRIPE_WEBHOOK_SECRET`（2 の値）を Production に追加 → Deployments で Redeploy |
| 7 | 本番 → 料金プラン | https://app.seo-checker.tokyo/plans | 「テストモード」の表示と「申し込む」ボタンを確認 → 申し込む → テストカード `4242 4242 4242 4242`（有効期限は未来、CVC 任意）→ 戻ったら「契約中」→「お支払い方法の変更・請求書・解約」でカードを変えてみる → 解約 → 「期間末で解約予定」になる |
| 8 | Stripe → 本番モードに切替 | https://dashboard.stripe.com/products | 1〜3・5 を**本番モード**でもう一度（商品・Webhook・ポータル・`sk_live_`）→ 6 の 3 つを本番の値に差し替え → Redeploy。あわせて `DEFAULT_PLAN` を `free` に（#39）、自分は管理画面で個別開放 |

自分（運用者）のプランは Stripe に関係なく、Clerk の `publicMetadata.plan` か管理画面の個別開放で開く。Webhook が届かないときは Stripe → Webhook → 該当エンドポイント → 「イベントの試行」で応答（200 / 400 / 500）を見る。400 は署名不一致（`STRIPE_WEBHOOK_SECRET` の貼り間違い）、500 は Clerk の更新失敗（Vercel のログ）。

### 申し込みの入口（営業で渡す URL）

| 渡す相手 | URL | 着地する場所 |
|---|---|---|
| 新規の見込み客 | https://app.seo-checker.tokyo/sign-up | 新規登録 → `/start` → 未契約なので `/plans` → 申し込み（初月無料） |
| 登録済みの人 | https://app.seo-checker.tokyo/plans | 申し込み・カードの変更・請求書・解約 |
| 説明から読ませたい相手 | https://seo-checker.tokyo/ | 紹介サイト。CTA「初月無料ではじめる」5 か所が `/sign-up` へ |
| 中身を試させたい相手 | https://app.seo-checker.tokyo/ | クイック診断・サイト（無料・ログイン不要。本サービスとは切り離した公開ページ） |
| 店舗の相手に渡す | https://app.seo-checker.tokyo/meo | クイック診断・店舗（無料・ログイン不要） |

クイック診断の 2 本は、専用のヘッダー（ロゴ・ログイン・「初月無料ではじめる」・規約）だけの画面で開く。診断の結果の下に「クイック診断で分かるのは『今の状態』まで」→「精密診断で分かること」→「初月無料で精密診断をはじめる」（`/sign-up`）が必ず出る。

**r54 から、クイック診断はこちらが URL を渡した相手だけが使うものにした**（利用者の決定 2026-09-13）。入口はすべて塞いである:
- 管理画面のサイドバーから削除（料金を払っている画面に無料の診断を置かない）
- **ログイン済みで開くと `/start` へ戻る**（運用者が中身を見たいときはログアウトするか、シークレットウィンドウで開く）
- 紹介サイト seo-checker.tokyo の CTA・料金カード・JSON-LD・llms.txt からも削除
- `robots.txt` はアプリ全体を塞ぎ、規約類だけを開ける（検索からも見つからない）

### 本番公開までに残っていること（決済まわり）

| # | 内容 | 担当 |
|---|---|---|
| 1 | #58 の 8（本番モードで商品・Webhook・ポータル・`sk_live_` を作り直し → Vercel の 3 つを差し替え → Redeploy） | 利用者 |
| 2 | #39 `DEFAULT_PLAN` を `free` に（これを変えるまで全員が pro のまま。**決済を本番にする前に必須**） | 利用者 |
| 3 | #7 Clerk → Legal に `/terms` `/privacy` の URL と登録時の同意チェック。アプリ名を `SEO Checker` に | 利用者 |
| 4 | Stripe の「Multiple capabilities paused」（本人確認・事業情報）の完了。終わらないと入金が保留される | 利用者 |
| 5 | 割引コードの発行（#58 の 1c）。初月無料は自動なので設定不要 | 利用者 |
| 6 | Vercel の 2 段階認証 | 利用者 |

### 入力待ち（利用者からの回答が要るもの）

- 運営者名・連絡先メール・所在地（#6）
- Supabase の SQL 実行と Vercel の環境変数登録が済んだという連絡（#3。URL もキーも会話に貼らなくてよい）
- Business Profile API の承認結果（#5 / #54 ①。09-11 申請、ケース ID `0-4126000041187`、7〜10 営業日）。承認されたら #54 の②〜④へ
- `wolf@wolf-info.org` 側に GSC / GA4 が存在するか（#10）
- 口コミ支援の課金（オールインワンに含めたまま = 現状。店舗数課金にするなら 2 店舗目以降の単価）と、低評価のメール通知を足すか（送信サービスが要る）
- 意図的な仕様の申告（#65）をどの形にするか。案 A: 画面で URL とパターン（例: `/search` 配下の「説明文が無い」）を選んで「意図どおり」に印を付け、ブラウザの localStorage に保存してレポートから外す（ログイン不要のまま。端末が変わると消える）。案 B: ページ側に `<meta name="seo-checker-skip" content="content-specificity">` のような宣言を書いてもらい、ツールがそれを読んで外す（サイトに残るので端末に依存しない。ただし独自仕様をサイトに書いてもらうことになる）。案 C: 作らない（自動判定できるものだけ外す。現状）。**スコアに反映するかどうか**（申告した項目を満点にするか、採点対象外にするか）も決める必要がある
- 自動診断（#82）で残っている判断: ① G5（GSC × GA4 の突き合わせ 20 件。両方連携している人だけ。1〜2 日）に進むか ② G7（人間による承認の工程 = AI の文章を編集して確定させ、承認者を記録する）を入れるか（松下さん一人で運用し、渡す前に自分で目を通すなら当面不要。担当者を増やす／お客様に PDF を直接渡すなら必要） ③ G8（CRM。問い合わせ・有効リード・商談・受注の 4 つを月 1 回**手入力**するだけで B01〜B10 の多くが動く。2 日）に進むか
- 基本情報掲載（#57）: 配信代行（Uberall / Yext など）を契約して「ワンクリック一括同期」を実装するか。料金の目安（09-11 に検索。日本の正式価格は代理店の見積もり）: Yext は米国の自社向けプランで店舗あたり月額 $16〜$76、代理店経由の小規模契約は店舗あたり年 $1,000〜$3,000 の例もある。Uberall は非公開（日本代理店に問い合わせ）。AI の説明文は 1 回 1 円程度（Haiku 4.5）。無料の一括登録 API は存在しないため、r39 は「1 か所で決めて各媒体に貼る + 掲載状況の管理」まで。契約するなら API キーを Vercel に置き、`src/lib/listings/` に同期の実装を足す


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

3 つ目（r27、オーナー情報の入力。**09-11 17:21 実行済み**）:

```sql
create table if not exists meo_owner_inputs (
  user_id text not null,
  place_id text not null,
  input jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table meo_owner_inputs enable row level security;
```

`input` は `src/lib/maps/owner-input.ts` の `MeoOwnerInputSchema` の形（キーワード最大 5、説明文 750 文字、投稿数、最新投稿の本文、写真の日付、ロゴ・カバー、返信済み件数、返信文。null = 未回答）。利用者 × 自社店舗で 1 行。競合には無い。

4 つ目（r34 + r35、口コミ支援。**09-11 17:17 実行済み（完全版）**）:

```sql
create table if not exists review_forms (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  slug text not null unique,
  title text not null,
  store_name text not null,
  place_id text,
  write_review_url text,
  questions jsonb not null,
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists review_forms_user_idx on review_forms (user_id, created_at);

create table if not exists review_channels (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references review_forms (id) on delete cascade,
  code text not null,
  label text not null,
  store_name text,          -- r35: QR に紐づく店舗（無ければアンケート本体の店舗）
  place_id text,
  write_review_url text,
  created_at timestamptz not null default now(),
  unique (form_id, code)
);

create table if not exists review_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references review_forms (id) on delete cascade,
  channel_id uuid references review_channels (id) on delete set null,
  rating int,
  answers jsonb not null,
  is_low boolean not null default false,
  draft text,
  draft_source text,
  draft_final text,
  edit_token text not null,
  direct_message text,
  direct_contact text,
  clicked_review_at timestamptz,
  clicked_direct_at timestamptz,
  status text not null default 'open',
  note text,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists review_responses_form_idx on review_responses (form_id, created_at desc);
create index if not exists review_responses_low_idx on review_responses (form_id, is_low, status);

alter table review_forms enable row level security;
alter table review_channels enable row level security;
alter table review_responses enable row level security;

-- r38: アンケートの多言語（訳の保存と、回答した画面の言語）
alter table review_forms add column if not exists translations jsonb not null default '{}'::jsonb;
alter table review_responses add column if not exists lang text;
```

**r38 で足した列（#55。r34〜r36 の SQL を実行済みなら、この 2 行だけを実行する）**:

```sql
alter table review_forms add column if not exists translations jsonb not null default '{}'::jsonb;
alter table review_responses add column if not exists lang text;
```

**基本情報掲載のテーブル（r39、#56）**:

```sql
create table if not exists listing_profiles (
  user_id text not null,
  place_id text not null,
  profile jsonb not null default '{}'::jsonb,
  states jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table listing_profiles enable row level security;
```

**パワーアップ分析の実行記録（r56、#66）**:

```sql
create table if not exists analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  url text not null,
  origin text not null,
  status text not null default 'collected',
  input jsonb not null,
  sheet jsonb not null,
  analysis jsonb,
  second_opinion jsonb,
  analysis_count int not null default 0,
  headline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists analysis_runs_user_idx on analysis_runs (user_id, created_at desc);
alter table analysis_runs enable row level security;
```

**r58 で足した列（サイト診断の統合。09-15 の SQL を実行済みなら、この 1 行だけを実行する）**:

```sql
alter table analysis_runs add column if not exists audit jsonb;
```

`audit` はサイト診断の全結果（`AuditResult`: 課題一覧・ページ一覧・構成・信頼。1 行で最大 1 MB 前後）。列が無い環境では保存を諦めて事実シートだけで動く（`runs.ts` が 400 を受けて落とす）ので、報告書の「詳細」が空になるだけで止まりはしない。

`status` は collected（収集のみ）/ analyzed（AI 分析済み）/ failed。`sheet` は事実シート（`src/lib/seo-analysis/sheet/types.ts` の `SeoFactSheet`）、`analysis` は Claude の分析（`ai/schema.ts` の `AnalysisRecord`）、`second_opinion` は ChatGPT（`SecondOpinionRecord`）。月の回数は `user_id` × 今月（JST）× `status <> 'failed'` の行数で数える（`runs.ts`）。1 行は数百 KB になりうる（PSI の結果を含む）。

`profile` は `src/lib/listings/profile.ts` の `ListingProfileSchema`（店名・ふりがな・業種・郵便番号・住所・電話・サイト・メール・営業時間・短い説明 150・説明文 750）、`states` は媒体 ID → `{ status, url, note, updatedAt }`（`ListingStatesSchema`。status は todo / submitted / live / skip）。利用者 × 自社店舗（MEO の `meo_stores` の own）で 1 行。

`translations` は `{ "en": { "日本語の原文": "訳" }, "ko": { … } }`（店舗が書き換えた質問文・選択肢の AI 訳。テンプレートの文言は `src/lib/reviews/i18n.ts` の静的な訳を使うので保存しない）。`lang` は来店客が回答した画面の言語（`ja` / `en` / `zh-Hans` / `zh-Hant` / `ko`。列が無い間はコードが自動で列なしにやり直す = 動くが記録されない）。

r34 の SQL を先に実行していた場合は、代わりに次を実行する（r35 で列を 3 つ足した）:

```sql
alter table review_channels
  add column if not exists store_name text,
  add column if not exists place_id text,
  add column if not exists write_review_url text;
```

`review_forms.questions` は `src/lib/reviews/questions.ts` の `QuestionsSchema`（最大 8 問、評価は 1 問）、`settings` は `ReviewFormSettingsSchema`（業種・トーン・キーワード最大 5・低評価の閾値）。`review_responses` には user_id が無いので、店舗側は必ず `review_forms`（user_id）経由で触る。`edit_token` は来店客が押下の記録・「お店に直接伝える」を送るための鍵（回答時に発行、画面にだけ返す）。

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
| 09-13 | **クイック診断を利用者の目に触れないようにした**（r54）。サイドバーから削除・ログイン済みは `/start` へ・紹介サイトと検索エンジンからも外す | 利用者の指摘「課金してるのがばかばかしくなってしまいます」。無料の診断が有料の画面や紹介サイトの前面にあると、払っている人の体験としておかしく、申し込み前の人にも「無料で十分」と思わせてしまう。クイック診断は残すが、**こちらが URL を渡した見込み客だけが使う営業道具**に位置づけを振り切った |
| 09-13 | サイドバーのタブを **SEO → MEO → AIO** の順に（r54） | 利用者の指定。売りの順番（検索 → 地図 → AI）に合わせる |
| 09-13 | クイック診断（店舗）の薄さは **Places の限界ではなく設計の穴** と判断。B（優先改善リスト）・C（採点基準の付録）を無料・有料の両方に、D（口コミの傾向）・E（NAP 整合）を精密診断だけに入れる（利用者の決定） | 無料の店舗診断は 21 項目中 12 項目（100 点中 62 点分）しか測れておらず、画面の 4 割が灰色の「未取得」で、しかも「何から直すか」が無かった。サイト版にある優先改善リストと採点基準の付録を移植すれば、追加の API 費用ゼロで同じ厚みになる。取れない 9 項目はオーナーにしか分からないので、その場入力（案 A）は置かず、精密診断の「オーナー情報の入力」への導線にする |
| 09-13 | クイック診断（店舗）は**項目を隠さず、採点基準を厳しくした**（r51。採点基準 v2） | 利用者の判断「評価を厳しくできるのであれば改善点が増えるのでおすすめ」。無料で見せる範囲を削ると診断の価値そのものが落ちるが、基準を実態に合わせれば「できていない所」が正しく出て、直す動機（= 精密診断の必要性）が増える。厳しくしたのは Google の公開情報から確かめられる項目だけで、測れないものを減点には変えていない |
| 09-13 | **呼び名を「クイック診断 ⇔ 精密診断」に変えた**（r50。「無料診断」「詳細診断」は使わない） | 値段を名前にすると比べる軸が「タダか有料か」になり、無料側の品質が高いほど「無料で十分」に倒れる。浅い / 深い（健康診断 → 精密検査）で呼び分ければ、クイック診断が優秀であることがそのまま精密診断の説得力になる。「無料」は名前ではなくバッジ・値札として残す |
| 09-13 | 無料のサイト全体診断を **最大 300 ページ → 代表 10 ページ** に絞った（r50） | 300 ページを無料で採点していては精密診断に進む理由が無く、こちらのクロール費・時間も出ていく。回数制限より深さの制限のほうが自然に伝わる。打ち切ったときは「見つかった N ページのうち代表の 10 ページを診断」と残り件数を出して、次の一歩を数字で示す。1 ページ診断は入口なので絞らない |
| 09-13 | **無料診断（`/` と `/meo`）を本サービスから切り離した**（r49） | 無料で完結させると詳細診断（有料）に進まない。無料は集客の入口と割り切り、URL をそのまま渡せる独立した画面にしたうえで、結果の直後に詳細診断への導線を必ず出す。有料ツールの一覧を見せないので、渡した相手が「使えない機能」を見て混乱することもない |
| 09-13 | 無料診断から先は **`/sign-up`（カード登録）→ Google 連携** の順に固定 | 無料期間中も全機能が開くので、先に契約を済ませたほうが Google を繋いだ直後に数値が見える。逆順だと有料ツールが鍵のままで、許可を出した意味が無い |
| 09-13 | 管理画面のサイドバーでは無料診断を **最下部の「お客様に渡す無料診断」** に移した | 契約者にとって無料診断は自社で使う機能ではなく、見込み客に渡す営業の道具。最上段に「無料」を置くとサービスの見え方が安く、詳細診断の価値も薄まる |
| 09-12 | 無料診断の切り出しは **手作業のコピーではなくスクリプト**（`scripts/extract-free.mjs`）にした | 手でコピーすると本体を直すたびに中身がずれる。入口から import をたどって集めれば、本体の更新後に作り直せる。本体と中身が違うのは 4 ファイルだけに抑え、差分を追えるようにした |
| 09-12 | 切り出し版から **認証・課金・ツール群・利用規約などの画面を外した** | 無料診断は元からログイン不要で、これらを参照していない。無い画面へのリンクを残すとリンク切れになるので、サイドバーを無料診断 2 本だけにし、無料 MEO 診断が指している `/plans`・`/sign-up` は本体サービス（`NEXT_PUBLIC_MAIN_APP_URL`）へ送るページに置き換えた |
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
| 09-11 | 口コミ支援サービスは **AI が口コミの下書きを作らない**設計にする（回答者の自由記述をそのまま見せてコピーできるだけ） | Google は 2025 年から AI 生成の口コミ本文を削除対象にし、2026-04-17 の改定で「特定の内容・キーワード・従業員名を含める依頼」「従業員のノルマ」を名指しで禁止。景表法でも店舗の設定を反映した文案は「事業者が表示内容の決定に関与」= 事業者の表示になり得る。たたき台の定義（AI が書くのではなく、書きやすくする）とも一致する。詳細は [review-support-design.md](./review-support-design.md) §2 |
| 09-11 | 口コミ支援は **AI 下書きを含めて実装**（利用者の決定） | Claude は Google の 2025〜2026 年の方針（AI 生成の口コミ本文の削除、キーワード・従業員名の依頼の禁止）を理由に外す案を出したが、利用者は「Google は AI で調整した文章の口コミを正式に禁止とは明言していない」と判断し、たたき台どおりの実装を指示。下書きは来店客が必ず編集できる状態で提示し、投稿ボタンは評価に関係なく全員同じ、特典機能は作らない、という線引きは維持。照合結果は review-support-design.md §2 に残す |

---

- **基本情報掲載は「配信代行の代替」ではなく「自分で登録する手間を最小にする」ツール（2026-09-11）**: 利用者は配信代行の画面（26 媒体を一括同期）を見て「無料で一斉登録」を求めたが、地図・検索・ディレクトリに無料で一括登録できる API は無い（Apple / Bing / Yahoo! / HERE / TomTom はそれぞれ無料のオーナー登録画面があるだけ。Acompio / Opendi / Uber などは配信代行の契約先からしか載らない）。嘘の「一括同期」ボタンは作らず、できること（無料登録の窓口・手順・コピー・状況管理・AI 説明文・構造化データ）とできないこと（有料の配信代行のみ）を画面で明記した。配信代行を契約するなら #57。

- **初月無料 + 割引はコード入力（2026-09-13、利用者の決定）**: 「初月無料、次の月から 2 万円引きの 3 万円」という希望に対し、Stripe のトライアル（`trial_period_days = 30`、全員に自動）と、クーポン 2 万円引き・期間「永続」＋プロモーションコード（コードを入力した人だけ）の組み合わせにした。**全員に自動適用しなかった理由**: ①Stripe は「クーポンの自動適用」と「コード入力欄」を同時に指定できない、②全員がずっと 3 万円なら定価 5 万円の表示が景品表示法の二重価格表示にあたるおそれがある。コード入力制にすると、定価 5 万円は「コードを持たない人が実際に払う価格」になるので表示上の問題が消える。トライアルは特商法の表示（無料期間・自動課金の開始・無料期間中の解約は無料）を特商法ページと料金画面の両方に出す。
- **ログイン直後は未契約なら料金プランへ（2026-09-13）**: 無料診断（`/` と `/meo`）がログイン不要で公開されているので、ログイン後に無料で触れる範囲をもう一度用意する必要がない。`/start` でプランを見て、未契約は `/plans`（カード登録）、契約済みはツールへ送る。決済完了の画面には「ツールを使いはじめる」ボタンを出す。
- **決済は Clerk Billing ではなく Stripe 直結（2026-09-11）**: 利用者が「登録済みのカード変更機能」と Stripe 連携を求めた時点で調べ直したところ、Clerk Billing は請求通貨がドルのみ（円建て 9,800 円が作れない）。Clerk 側の手数料 0.7% も乗る。Stripe を直接使えば円建て・プロモーションコード（クーポン。利用者が以前求めていた）・カスタマーポータル（カード変更・請求書・解約を Stripe の画面で完結、カード番号をアプリが扱わない）が揃う。契約状態は Webhook が Clerk の `publicMetadata.stripe` に書く（データベースは増やさない）。Clerk Billing のコードは残すが出さない。

- **定価 50,000 円 + クーポン割引（2026-09-13）**: 利用者が Stripe で価格を作る際に「50,000 を定価にして、割引を基本にする」と決定。アプリの料金表・特商法ページ・紹介サイト（JSON-LD の offers、FAQ、llms.txt）・README を 50,000 円に揃え、「機能ごとに 3,000 円引き」の文言は全部消した。割引は Stripe のクーポン → プロモーションコード（Checkout で入力。`allow_promotion_codes` は r41 で有効）。内部の `standard` 段階は価格を持たない意味で 50,000 に合わせた（販売しない・料金はクーポンで調整）。

- **SEO 分析ツールは Google 連携を前提にせず、URL だけで動く「パワーアップ分析」にする（2026-09-13）**: 利用者の指示。顧客は WordPress を外注していて GSC / GA4 を把握していないことが多い。連携で止まるより、無料・安価な API の指標を集めて AI に語らせる方が「中身の無いコンサル」を置き換えられる。連携は任意の層として残す（[seo-analysis-spec.md](./seo-analysis-spec.md) §0）。

- **パワーアップ分析の 6 点は推奨案どおり（2026-09-13）**: 月 10 回・ChatGPT はセカンドオピニオン・URL だけで動く・300 ページ + PSI 6 本・A′ → E′ の順・`/tools/seo-analysis` を 1 つ追加。加えて「最終的には**個々の分析結果ごとに AI の分析を見られるようにしたい**」→ B′ の事実シート → AI 分析は画面ごとの部分シートでも動く形に分ける（報告書 = 各画面の分析の合成）。
- **A′ は新しいルールを足さず、別の層として同梱した（2026-09-14）**: 構成・信頼の指標は「課題（Issue）」ではなく「事実」として扱う。ルールにすると課題件数が跳ね上がって前回比が壊れるうえ、B′ で AI に読ませるのは判定済みの課題より生の数字の方がよい。48 ルールと 10 カテゴリの集計はそのまま。
- **重要度は PageRank 風の計算にした（2026-09-14）**: 被リンク数だけだとナビに載っているページが全部同点になる。リンクの向きを 30 回反復して、トップから近くリンクを多く受けるページが高くなるようにし、サイト内の最大を 100 に正規化して画面に出す。本文のリンクとナビのリンクは別に数える（`main / article / [role=main]` の中で、`nav / header / footer / aside` の外を本文とみなす）。

- **外部連携（API キーの設定状況）はお客様に見せない（2026-09-15）**: 利用者の指示「ユーザーに見える必要はない。マスターアカウントだけが把握していればいい」。設定画面から外し、マスター画面 `/admin` に移した（r57）。お客様の設定画面は「プロジェクト・競合・Google 連携・データ」だけ。各ツールの `SetupNotice`（未設定のキー名を出す案内）はまだお客様にも見えるので、隠すなら別途。

- **サイト診断はパワーアップ分析に統合、ページ診断は別のまま（2026-09-15）**: 利用者の質問「3 つの違いは？同じなら統合して」。サイト診断（A1）はパワーアップ分析の中で同じクロール + 48 ルールを実行している部分集合なので、二重に持たず統合（r58）。課題一覧・カテゴリ別・ページ一覧・CSV は報告書の「詳細」に残した。ページ診断（A4）は「1 キーワード × Google 上位 10 件 × 自社 1 ページ」の競合比較で軸が違うため別のまま（名前を「ページ診断（競合比較）」に）。前回比（差分）はブラウザ履歴に依存していたので今回は落とした。要望があれば Supabase の前回の run と比べる形で復活できる。

## 進行中の開発の設計メモ

### MEO（Google マップ・店舗情報）— 3 フェーズ

- **フェーズ 1（r15〜r16、完了）**: `/tools/maps`。検索 → 自社 / 競合の選択（localStorage）→ `/api/maps/report` で 4 カテゴリ採点の報告書 → `/api/maps/commentary` で AI 総評（任意）→ PDF。競合比較は `/api/maps/compare`。詳細は `src/lib/maps/fetch.ts` で 6 時間キャッシュ（Places の詳細は最も高い料金区分）。
- **フェーズ 2（r19 → r21 で週次更新に再設計）**: 数字は利用者が取り直せない。店舗を登録（`/api/maps/stores` POST）した直後に 1 回取得して `meo_reports` に保存、以後は毎週月曜 5:00 JST の Cron（`/api/cron/maps-refresh`、`src/lib/maps/refresh.ts`）が全店舗を取り直して保存。競合比較（`/api/maps/compare` GET）は保存済みの最新報告書から。画面: 店舗の登録・切り替え、最新の報告書＋次回更新日、履歴（開く・削除）、比較表（取得日時つき）。AI 総評は生成後に `PATCH /api/maps/history/[id]` で報告書に書き足す。機能は `requires: ["places", "supabase"]`。残り: アカウント削除時の行削除（Clerk の Webhook。現状は手動）、Cron 1 回の上限は 2,000 行 / 240 秒（超えた分は次回。店舗が数百を超えたら分割か複数 Cron に）。
- **フェーズ 2.5（r27、オーナー情報の入力）**: 公開情報で取れない 9 項目を自社店舗のオーナーが `/tools/maps` のカード 2 で答える → `PUT /api/maps/stores/[id]/owner` が `meo_owner_inputs` に保存し、**最新の報告書を保存済みの Google 情報のまま採点し直す**（`rescoreLatestReport`。Google に問い合わせないので費用ゼロ。診断日時は据え置き、AI 総評は外す）。以後の一斉更新（`refresh.ts` の `getOwnerInput`）と登録直後の取得にも自動で入る。競合として登録している利用者には入らない。判定（`score.ts` の `judge*`）: 説明文 = 空 fail / 200 文字未満・URL 入り・対策キーワード無し warn / それ以外 pass、開業日・メニュー = はい/いいえ、投稿 = 直近 4 週で 4 件以上 pass・1〜3 warn・0 fail（0 ならキーワードも fail）、最新投稿のキーワード = 本文に対策キーワードがあるか（キーワード未設定なら warn）、写真 = オーナーの最新写真 31 日以内 pass・90 日 warn・それ以上 fail、ロゴ&カバー = 両方 pass・片方 warn・無し fail、返信率 = 返信済み ÷ Places の口コミ件数で 90% pass・50% warn・未満 fail、返信文 = 店名か対策キーワードを含めば pass。報告書の項目に「オーナー入力」の印、表紙の「データ」に「+ オーナー入力」。無料 `/meo` には入れていない（有料の差別化）。
- **フェーズ 2.6（r28、Google から取れる項目の拡張）**: `client.ts` の `DETAIL_FIELDS` を拡張（`primaryType` / `addressComponents` / `location` / `priceLevel` / `priceRange` / `googleMapsLinks` / `generativeSummary` / `reviewSummary` / `pureServiceAreaBusiness` / `consumerAlert` / 属性 26 種）。**料金は変わらない**（1 回の呼び出しは要求した中で最も高い区分 = 既に reviews で Enterprise + Atmosphere）。フィールド名は `@googlemaps/places` 3.0.0 の `place.proto` で確認（ドキュメントサイトはこの環境から読めない）。Google が項目名を拒否（400）したら基本項目だけで 1 回取り直す（ログ `[maps] 拡張フィールドマスクが拒否…`）。`PlaceDetail` の新しい項目は optional（古い保存分は undefined → 採点は「次回の一斉更新から取得」の unavailable）。採点は `scoreProfile(place, now, owner, { extended })`: **有料 = 28 項目（`WEIGHTS.extended`）、無料 `/meo` = 21 項目（`WEIGHTS.base`）、どちらも合計 100**。有料で足した 7 項目: 追加カテゴリ（汎用 type を除く）、属性 5 個以上、オーナー投稿の写真（Google が返す最大 10 枚のうち投稿者名 = 店名が 3 枚以上）、写真の解像度（長辺 1,024px 未満があれば注意）、口コミ内のキーワード（カテゴリ名 + 対策キーワード）、口コミ本文（20 文字以上が 60%）、Google の警告（`consumerAlert`、不審な口コミ活動・ポリシー違反）。住所は premise / subpremise の有無を detail に表示（点数は変えない）。報告書に「4. Google マップの付加情報」（有料のみ）: 追加カテゴリ・価格帯・住所の詳しさ・座標・属性チップ・**口コミ依頼リンク（`writeAReviewUri`）**・AI 要約（日本ではほぼ無い）・警告。比較表に属性の数。**Places から取れない項目で残るもの**: 投稿・返信・説明文・ロゴ/カバー・開業日（`openingDate` は開店予定のときだけ）・インサイト（表示回数・電話・経路）→ オーナー入力（r27）か Business Profile API（#11）。
- **フェーズ 2.7（r29、検索順位と周辺の同業）**: 有料の自社店舗にだけ付く（無料 `/meo`・競合の報告書には無い。`MeoReport.rank` / `.area`、r29 より前の保存分は undefined）。**検索順位** `src/lib/maps/rank.ts`: 対策キーワード（`meo_owner_inputs.input.keywords`、最大 5）ごとに Text Search（`locationBias` = 店舗の座標、半径 3 km、`pageSize` 20、フィールドは `places.id,places.displayName` だけ = **Pro 区分**）を 1 回叩き、自社と登録済み競合の順位・上位 3 件・前回の順位（`previous`）を記録。Google の「ローカル検索順位」そのものではなく Places API の並び（画面に明記）。**周辺の同業** `src/lib/maps/area.ts`: Nearby Search（`locationRestriction` 半径 1.5 km、`includedPrimaryTypes` = 自社の `primaryType`、`rankPreference: POPULARITY`、20 件、`rating` / `userRatingCount` が要るので **Enterprise 区分**）から、自社を除いた中での評価・件数の順位（同点は同順位）、平均評価、件数の中央値、件数順の上位 5 件。**いつ叩くか** `src/lib/maps/enrich.ts`: 店舗の登録直後（順位 + 周辺）、毎週の一斉更新（順位は全キーワード取り直し + 前回値、周辺も取り直し。`refresh.ts` の `deps.enrich`、失敗しても保存は止めない）、オーナー情報の保存（増えたキーワードだけ検索、周辺は取り直さない）。位置（`location`）が無い店舗は計測しない。順位・周辺とも 6 時間キャッシュ（`fetch.ts`）。画面: 報告書の「5. 検索順位」（キーワード × 自社・競合の表、前回比、上位 3 件）「6. 周辺の同業との比較」（StatStrip + 上位 5 件の表）。**推移グラフは未実装**（各週の報告書に順位が入っているので、履歴から線グラフにできる。要望が出たら）。
- **コンサル解説（r30）**: `src/lib/maps/guide.ts` に 28 項目ぶんの `CHECK_GUIDE`（why / goal / keep）、`MEO_CONCLUSION`、`IDEAL_STATE`（評価 4.3〜4.7、口コミ数は競合上位 3 社超・最低 50、口コミの質、返信率 100% / 24〜48h、写真 100 枚以上・毎週追加、投稿週 1、基本情報 NAP 一致・サブカテゴリ最大 9、Q&A 5〜10 問（未計測）、星の分布）。有料の報告書に「3. 目指すべき状態」の節と、各項目の下に 3 行の解説（`ChecklistSection` の `guide` prop）。無料 `/meo` には出さない（`guide` を true にすれば出る）。文章を変えるときは guide.ts だけ。`guide.test.ts` が採点の項目 ID と過不足なく一致することを確認する（項目を足したら解説も足す）。
- **初月無料と申し込み導線（r47）**: `src/lib/billing/trial.ts`（`STRIPE_TRIAL_DAYS`、既定 30、0 でなし、上限 730。Stripe SDK を読み込まない小さなモジュールにして特商法ページからも使う）→ `createCheckoutSession` が `subscription_data.trial_period_days` を付ける。`allow_promotion_codes: true` は維持（割引はコード入力制）。画面: `/plans` の申し込み前に「最初の 30 日間は無料です」、契約状態が `trialing` のときは日付の見出しを「無料期間の終了（初回の請求日）」、決済完了時は「ツールを使いはじめる」ボタン。`/start`（新設、画面なし）がログイン直後の振り分け（未契約 → `/plans`、契約済み → `/tools/site-audit`）で、サインイン・サインアップの着地先をここに変更。特商法ページの「お支払い時期」「サービスの提供時期」はトライアルの有無で文面が変わる。料金表・紹介サイト・llms.txt・README も初月無料を明記。
- **決済（r41、Stripe 直結）**: `src/lib/billing/state.ts`（契約状態の形 `publicMetadata.stripe`: subscriptionId / status / priceId / amount / currency / currentPeriodEnd / cancelAtPeriodEnd / eventCreated。`planFromStripeState`: active・trialing・past_due → pro。`shouldApplyEvent`: 古いイベントで上書きしない）、`stripe.ts`（`isStripeConfigured` = 3 変数、Checkout: mode subscription・`client_reference_id` と `subscription_data.metadata.userId` にユーザー ID・`allow_promotion_codes`・locale ja・戻り先 `/plans?checkout=success|cancel`、カスタマーポータル、Webhook の署名検証）、`sync.ts`（Clerk の `publicMetadata.stripe` と `privateMetadata.stripeCustomerId` を更新。他のキーは残す）。API `/api/billing/checkout`・`portal`（ログイン必須）・`webhook`（公開。署名で守る。`checkout.session.completed` と `customer.subscription.*` だけ処理。保存失敗は 500 で Stripe に再送させる）。`current.ts` の順番: 認証無効 → Clerk Billing の has（使っていない）→ **Stripe の状態** → publicMetadata.plan → DEFAULT_PLAN → free。マスター画面（`clients.ts`）も Stripe の状態を優先（`summarizeStripeState`）。画面 `StripeBillingCard`（`/plans`）: 契約前「申し込む」、契約後「お支払い方法の変更・請求書・解約」、テストキーなら「テストモード」表示、`?checkout=` の案内。特商法ページ `/legal/tokushoho`（`src/components/legal/Tokushoho.tsx`。事業者名・連絡先は operator.ts、価格は catalog.ts から。所在地・電話は請求時開示）。**未検証**: 実際の Stripe に対しては利用者の設定後に本番（テストモード）で確認。
- **基本情報掲載（r39、`/tools/listings`。利用者の指示「配信先メディア一括連携のような機能を AIO に。無料ですぐ一斉に登録できるように」）**: AIO タブ「生成」グループ、pro、`requires: ["supabase"]`。**無料で全媒体に一斉登録できる API は存在しない**（利用者が見た画面は Uberall 系の配信代行 = 有料。Acompio / Opendi / Uber / Where To? などはその経由でしか載らない）ので、r39 は「1 か所で決めた基本情報（NAP）を各媒体にそのまま貼る手間を最小にし、掲載状況を管理する」ツールにした。画面上部の Callout に「できること・できないこと」を明記。`src/lib/listings/media.ts`: 30 媒体（配信代行の画面の 26 + Yahoo!プレイス・Facebook・Yelp・OpenStreetMap）を 3 種類に分ける（`self` = 無料で自分で登録: Google / Apple Business Connect / Bing Places / Yahoo!プレイス / Foursquare / HERE / TomTom / Waze / OSM / Facebook / Yelp / Petal / Hotfrog / Showmelocal / Tupalo / iGlobal、`fed` = 元の媒体から自動で流れる: Siri ← Apple、カーナビ各社 ← HERE / TomTom、Navmii ← OSM、Uber / Where To?、`aggregator` = 配信代行のみ: Acompio / Opendi）。登録画面の URL と手順、重要度（必須 = Google / Apple / Bing / Yahoo!）。`profile.ts`: `ListingProfileSchema`、Google の公開情報からの取り込み（空欄だけ）、表記ゆれの比較 `compareNap`（NFKC・空白・ハイフン・末尾スラッシュを無視、住所は包含）、貼り付け用の文、営業時間の行 → schema.org、`toJsonLd` / `jsonLdScript`（LocalBusiness。`</script>` をエスケープ）。`describe.ts`: AI の説明文（短い 150 / 長い 750。事実だけ、最上級・約束・URL・電話を禁止。口コミは untrusted ブロック。モデル `REVIEW_DRAFT_MODEL`）。`store.ts`: `listing_profiles` の upsert（user_id で絞る）。API `/api/listings/stores`（MEO の自社店舗 + 保存済み報告書の Google 情報 + 記録）、`profile`（PUT。自社店舗以外は 404、知らない媒体 ID は捨てる、サイトは https のみ）、`describe`。画面 `ListingsTool`: 店舗と集計 → 基本情報（取り込み・ずれの警告・AI 説明文・保存・まとめてコピー）→ 媒体一覧（種類ごと。登録画面を開く / 状況 / URL・メモ。項目ごとのコピー）→ 構造化データ。
- **口コミへの返信（r37、`/tools/replies`）**: MEO タブ「生成」グループ、pro。`src/lib/google/business-profile.ts`（Account Management v1 → accounts、Business Information v1 → locations（Place ID 付き）、My Business v4 → reviews / reply の PUT・DELETE。応答は落ちない `parse*`。403 は「利用申請・API 有効化」を案内）。スコープ `business.manage` は `scopes.ts` の `GoogleService: "business-profile"`（REQUIRED_SCOPES には入れない = 設定画面の通常接続では要求しない。`ConnectBusinessButton` が読み取り 2 つと一緒に reauthorize で要求）。AI 返信案は `src/lib/replies/draft.ts`（評価 3 以下は謝罪 → 受け止め → 改善 → 個別連絡の型、4 以上は感謝の型。氏名・来店日時・特典の約束を禁止。口コミは untrusted ブロック。モデル `REVIEW_REPLY_MODEL`、既定は高速モデル）。API: `/api/replies/status`（接続・権限・ビジネス一覧・MEO の自社店舗・AI の有無）、`reviews`（50 件ずつ、`pageToken`）、`reply`（PUT / DELETE）、`draft`、`places`（接続前の代替 = 保存済み報告書の最新 5 件、費用ゼロ）。画面 `RepliesTool`: 未返信 → 低評価 → 新しい順、返信の投稿・更新・削除は `window.confirm`。設定（トーン・補足・署名・最後のビジネス）は localStorage `repliesSettings`。口コミと返信は保存しない（Google が正）。**Google 側の作業 4 つ（#54）が終わるまで投稿は動かない。接続前は公開情報の口コミで返信案 → コピー → GBP。**
- **フェーズ 3（承認後）**: Business Profile API（Business Information / v4 reviews・localPosts・media / Performance API）で `score.ts` の `unavailable` 9 項目を埋める。インサイト 8 指標（表示回数 モバイル/PC、電話、ルート、サイト、メニュー、平均クリック率）を期間比較・CSV・詳細グラフつきで。スコープ `business.manage` を追加 → 同意画面のスコープ追加と再審査に注意。

### 口コミ支援（アンケート QR）— r34〜r36、r38（多言語）

- **何をするか**: 店舗が `/tools/reviews`（MEO タブ、pro、`requires: ["supabase"]`、`optional: ["anthropic", "places"]`）でアンケートを作る（業種テンプレート: 飲食 / サロン / クリニック / 汎用。質問は評価 1〜5・単一選択・複数選択・自由記述、最大 8 問）→ QR を発行（店舗別・テーブル別・スタッフ別など最大 30、SVG / PNG はサーバーが `qrcode` で描く）→ 来店客が `/r/<slug>?c=<code>`（ログイン不要、サイドバー無し = `AppShell` の `isBare`、`robots: noindex`）で回答 → **AI が口コミの下書き**（`src/lib/reviews/draft.ts`。トーン 3 種と「含めたい語」最大 5 は店舗の設定。モデルは `REVIEW_DRAFT_MODEL`、既定は `LLM_FAST_MODEL`。回答は untrusted ブロック。キー無し / 上限超え / 失敗時は自由記述をそのまま並べる `fallback`）→ 完了画面「店舗にフィードバックを送信しました」+ 編集できる下書き + **「Google マップに投稿する」（評価に関係なく全員同じ。押すと下書きをクリップボードにコピーし、押下を `/api/r/[slug]/events` に記録してから Google の投稿画面 `writeAReviewUri` を新しいタブで開く）** + 低評価（既定 2 以下、店舗が 1〜4 で変更）のときは **「お店に直接伝える」を並列で追加**（本文 + 任意の連絡先 → `/api/r/[slug]/direct`）。
- **店舗ごとの QR（r35）**: 1 つのアンケート（質問・AI 設定）を複数店舗で共有できる。QR（`review_channels`）に店舗（`store_name` / `place_id` / `write_review_url`）を紐づけると、その QR から開いた来店客の画面はその店舗名、AI 下書きの店名と投稿ボタンの飛び先もその店舗（`resolveStore`。紐づけが無い QR は本体の店舗）。発行は「店舗ごと（MEO の登録店舗から選ぶ / 店名と Place ID を手入力）」と「置き場所ごと（本体の店舗のまま）」、MEO に登録済みの自社店舗にまとめて発行（`{ bulk: "stores" }`。紐づけ済みの Place ID は飛ばす）。集計・絞り込み・CSV は「店名（ラベル）」で店舗ごとに分かれる（CSV に「店舗」列）。投稿先の解決は `src/lib/reviews/links.ts`（指定 → 保存済み報告書の `writeReview` → Place ID から組み立て）。
- **QR のダウンロードと削除の警告（r36）**: QR カードの「SVG を保存」「PNG を保存」は `?download=1` で添付（`Content-Disposition: attachment`、ファイル名は `QR_<店名（ラベル）>.svg` を RFC 5987 の `filename*` で。ASCII の代替名つき。`src/lib/reviews/url.ts` の `contentDisposition`）。プレビューの `<img>` は従来どおりインライン。削除は必ず 1 回警告を挟む（QR = `window.confirm`、質問の × = `window.confirm`、アンケート本体と回答 = インラインの「本当に削除する」。利用者の指示「基本削除ボタンは一回警告」）。
- **来店客の言語に合わせた自動切替（r38、利用者の指示「スマホの言語設定に合わせて切り替える」）**: 対応は日本語・英語・中国語（簡体 / 繁体）・韓国語の 5 つ（`src/lib/reviews/i18n.ts`）。判定は `?lang=` → ブラウザの `Accept-Language`（スマホは OS の言語をそのまま送る。`zh-TW` / `zh-HK` / `zh-Hant*` は繁体、他の中国語は簡体）→ 日本語。画面右上の 🌐 プルダウンで切替（`?lang=` を付けて出し直す。入力中の回答は残る）。**画面の固定文言**は辞書。**質問文・選択肢・アンケート名**は `src/lib/reviews/translate.ts`: 業種テンプレートの文言は静的な訳（AI 不要。テストで全テンプレートに訳があることを固定）、店舗が書き換えた文言は AI（`REVIEW_DRAFT_MODEL`、既定は高速モデル。区切りブロック。1 日上限は AI 下書きと同じ `review-ai` の枠）で訳して `review_forms.translations` に保存し使い回す（列が無い / AI 無し / 失敗 / 12 秒超は日本語のまま出す。画面は止めない）。**選択肢は「表示は訳、送る値は日本語の原文」**（`PublicQuestion.options[].{value,label}`）なので、回答の検証・保存・店舗側の一覧・集計・CSV は日本語のまま。自由記述は来店客の言語のまま届く。**AI 下書きは画面の言語で書く**（`DraftInput.locale` → 「書く言語」。Google マップに投稿する本文もその言語）。「お店に直接伝える」の本文も来店客の言語のまま。回答の `lang` を保存し、店舗側の一覧にバッジ（「英語」など）、行を開くと「英語の画面で回答」、CSV に「言語」列。`<main lang>` とタブのタイトルも言語に合わせる。**未対応**: 店舗側で自由記述を日本語に翻訳して見る機能（候補。要望があれば AI で 1 件ずつ訳す）。
- **店舗側**: 回答一覧（既定の並びは「低評価・直接連絡・未対応を先に」。新しい順 / 評価が低い順、対応状態・経路・期間・低評価だけで絞り込み）、行を開くと回答全文・AI 下書き・投稿時の本文・直接連絡・対応状態（未対応 / 対応中 / 対応済み）・対応メモ。集計（回答数・平均評価・分布・低評価・**投稿ボタン押下率（実投稿数は取れないと明記）**・経路別・週別 8 週）。CSV（式インジェクション対策済み）。未対応の低評価があればカード 1 に件数の注意。メール通知は無し（送信サービスが無い）。
- **守り**: 公開パスは `routes.ts` の接頭辞 `/r/` と `/api/r/`（接頭辞そのものは公開しない。`routes.test.ts` で固定）。回数制限は IP ごと（取得 120 / 回答 30 / イベント 60 / 時。店内 Wi-Fi で IP が共有されるため緩め）+ アンケートごとの 1 日 500 件（`REVIEW_FORM_DAILY_LIMIT`）+ AI 下書きの 1 日全体 2,000 件（`REVIEW_AI_DAILY_LIMIT`。超えたら fallback）。来店客側の更新は `edit_token`。管理 API は `ownedForm`（user_id）で所有確認 → form_id。来店客に返すのは `PublicReviewForm`（質問・店名・低評価の閾値・投稿 URL の有無だけ）。
- **投稿 URL**: 作成時に Place ID を指定すると、保存済みの MEO 報告書の `links.writeReview`（r28）→ 無ければ `https://search.google.com/local/writereview?placeid=` を組み立て。MEO 未登録なら Place ID か URL を手入力。無ければ投稿ボタンは出ない。
- **プライバシーポリシー**: 第 12 条「店舗のアンケートに回答する方の情報」を追加（第 8 条にも一言）。改定は第 13 条に繰り下げ。
- **設計時の照合**（[review-support-design.md](./review-support-design.md) §2）: Google の 2025〜2026 年の方針では AI 生成本文・キーワード指定・スタッフ別ノルマが禁止側。利用者の判断で AI 下書きを含めて実装した。店舗向けの注意（全員同じボタン・特典を付けない・語は参考だけ）は画面上部の Callout に明記。
- **未実装 / 候補**: 低評価のメール通知（Resend 等）、連絡先の自動削除（Cron）、回答 1,000 件超の集計（いまは新しい順 1,000 件の範囲）、QR の印刷用 PDF、課金（店舗数課金にするなら `review_forms` の件数で判定）。
- **検証**: lint / tsc / test（98 ファイル・1,369 件）/ build 通過。PostgREST のモック + `next start` + Playwright で「作成 → 保存 → QR（SVG / PNG）→ スマホ幅で回答（評価 2）→ 下書き → 投稿ボタン（新タブ + 押下記録）→ お店に直接伝える → 管理画面に低評価 1 件・直接連絡・押下時の本文・メモ保存 → CSV → 偽トークンは 404」を確認。r38 は test 103 ファイル・1,401 件。多言語のスモーク（端末 = 英語で開く → 英語の画面と質問 → 繁体字に切替 → 英語で回答 → `lang=en` と日本語の選択肢の値が保存 → 管理画面にバッジ「英語」→ CSV の「言語」列。API は `Accept-Language: zh-TW` → 繁体、`fr` → 日本語、`?lang=ko` が優先）も通過。**AI 訳は実 API で未検証**（キー無しの環境。本番で店舗が書き換えた質問を英語の端末で開いて確認する）。

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
- 利用者の質問「無料 AIO 診断は内部リンク数も評価対象？」→ 対象外（内部リンクはサイト全体診断でページを集めるためだけに使用）。採点は 5 カテゴリ（クローラ可否 / 構造化データ / メタ / 見出し / コンテンツ）。内部リンクの構造はサイト診断（テクニカル SEO）の担当、と回答。
- 利用者が競合ツール（aisuishin.kazet.ai）の診断結果 URL を共有 → egress 403 で読めず。スクリーンショットか PDF、または Network policy に追加を依頼。
- 利用者が競合ツール（kazet.ai）の 2 機能「サイト・Google 情報の調査」「AI 検索での見つかり方」の画面を共有し「安くすぐ実装できる？」→ 可能。前者は無料 AIO 診断エンジン + Places の NAP 整合で費用ゼロ・半日（#33）、後者は LLMO + プロンプト拡張の流用で Claude のみ 1 店舗 15〜30 円・1 日（#34）。1 → 2 の順、月 1 回自動 + 推移を推奨。
- 利用者「どこまで無料にするか迷う」→ 軸は「実費ゼロ + 続きが欲しくなるところまで」。提案: ログイン不要 = 無料 AIO 診断のみ／登録あり無料 = MEO 自社 1 店舗 1 回（競合・履歴・AI 総評なし）+ #33 の整合チェック + #34 を Claude のみ 3 質問 1 回／スタンダード = 週次更新・履歴・競合・GSC/GA4・順位・#34 月次／プロ = AI 生成物。実費が出る機能はログイン無しで出さない。判断待ち: MEO 1 回無料と #34 1 回無料を入れるか（推奨は両方入れる）。実装は free プランで店舗登録 1 件・履歴 1 件・一斉更新対象外の制限（半日）。
- 利用者の情報「競合ツールの AIO スコアは LLM への単発質問、MEO スコアは Places API か自己申告データ」→ うちの部品（LLMO + プロンプト拡張、MEO 診断、無料 AIO 診断エンジン）で同等以上を同じ費用感（1 件 10〜20 円）で出せると整理。自己申告入力（Places に無い店向け）は要望が出てから（#36 候補）。#33 + #34 + #35 をまとめて着手する提案、GO 待ち。
- 利用者「MEO 診断だけ無料に追加したい。無料で何が出せる？」→ 公開情報 1 回分（検索 + 詳細）で今の報告書の全部（採点・21 項目・ルール総評・口コミ・PDF）+ #33 が無料で出せる（1 店舗 ≤ 4 円、6h キャッシュ）。無料に入れない: 競合比較・週次更新と履歴・AI 総評・#34。出し方 A（ログイン不要 `/meo`、IP 制限 + 日次上限 + キャッシュ）か B（登録あり、自社 1 店舗）。推奨 A + 報告書末尾に有料導線。実装 1 日。判断待ち（#37）。
- 利用者の指示「無料 SEO・MEO・AIO 診断に改称して無料診断をアップグレード」→ **r25**: `FREE_SUITE_LABEL`、`/meo`（`FREE_MEO_FEATURE`、requires places、force-dynamic）、公開 API `/api/meo/search` `/api/meo/report`、`src/lib/free/ratelimit.ts`（IP ごと 検索 30 / 報告書 10 回/時、全体 1 日 検索 1,500 / 報告書 500、`FREE_MEO_DAILY_LIMIT` `FREE_MEO_DAILY_SEARCH_LIMIT`、0 で停止。キャッシュ命中は消費しない）、`peekPlaceCached`、`FreeTargetSwitch`、サイドバー無料ブロックに 2 本、AppShell の `isFree` を group=free 判定に。タイトル・manifest・料金表・README・ARCHITECTURE・紹介サイト（料金カード・概要表・ヒーロー・llms.txt）更新。ローカルで next start + Playwright で / と /meo の描画確認。lint / tsc / test（91 ファイル・1291 件）/ build 通過。**回数制限はプロセス内メモリ（Vercel の複数インスタンスでは上限の数倍まで許容）。厳密にするなら Supabase に移す（#38）。**
- 利用者「無料でやりすぎ？」→ **先に直すべきは `DEFAULT_PLAN=pro`（誰でも登録すれば pro が無料）と Clerk の登録制限なし**（#39、公開前に必須）。無料 MEO 診断は A（今のまま）/ B（要点のみ: 総合・4 カテゴリ・改善点上位 3・口コミの数字。全項目と PDF は無料登録後）/ C（点数のみ）を提示、B を推奨（#40、2 時間）。
- 利用者「競合より価格を下げたい。ベストな提案を」→ 原価は 1 契約あたり数百円（順位計測の SerpApi だけ高い）。提案: 無料 0 / ライト 2,980（1 領域、MEO 3 店舗、順位 10 KW）/ スタンダード 5,980（3 領域、MEO 10 店舗、順位 30 KW）/ プロ 9,800（+AI 生成物、MEO 30 店舗、順位 100 KW）/ 追加店舗 +300 円。**商用化前に Vercel Hobby → Pro（月 20 ドル）が必要**。実装: light プラン（選択領域を Clerk メタデータ）、プランごとの店舗数・KW 上限、料金表と Clerk Billing の整合（#41）。判断待ち。
- 利用者の提案「Stripe を連携して無料クーポンコードを発行」→ 決済は Clerk Billing（Stripe 裏側、コード対応済み、`NEXT_PUBLIC_CLERK_BILLING_ENABLED`）。Clerk Billing にはクーポンコードが無い（把握の範囲）ため、無料枠は**マスター画面の個別開放**で代替（メール指定、拡散しない）。`DEFAULT_PLAN=free` に戻せる。手順: Stripe 登録 → Clerk Billing 有効化・Stripe 接続 → プラン `standard` / `pro` → Vercel 環境変数 → 管理画面で自分に開放 → テストカードで購入確認。**特商法ページが必要**（#43、Claude が作成）。コード配布が必須なら Stripe 直結（1〜2 日）。
- 利用者「テスト中の間は」（続き未入力）→ テスト中の推奨: Clerk の登録制限（Restricted / Allowlist）を先に入れれば `DEFAULT_PLAN=pro` のままで可、Stripe はテストモード、モニターは許可リストに追加。公開時に `DEFAULT_PLAN=free` + 個別開放へ、と回答。
- 利用者の決定「面倒なので全部込みで 9,800 円。要望があれば機能ごとに 3,000 円ずつ割引」→ **r26**: catalog を pro = オールインワン 9,800 円、standard は `purchasable: false`（個別割引用、6,800 円）。`upgradeTarget` が購入可能プランを返すので、standard 機能の案内もオールインワンに。サイドバーの鍵は「有料」。PlanTable / ServiceGuide は SELLABLE_PLANS。README・紹介サイト（料金 2 枚、FAQ「使わない機能があれば安くなりますか」、概要表、JSON-LD offers/FAQPage、llms.txt）更新。lint / tsc / test（91 ファイル・1294 件）/ build / wrangler dry-run 通過。**Clerk Billing で作るプランは `pro`（9,800 円）だけ**。割引客は Stripe 支払いリンク + `publicMetadata.plan=standard` か、pro を Clerk 側で割引価格の別プランにするか（要検討）。
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
- 利用者の依頼「MEO のガチの診断機能を追加して」+ 19 項目のチェックリスト（基本情報 10 / 投稿 2 / 写真 3 / レビュー 4）→ 項目は既存の `score.ts` の 21 項目（19 + 営業ステータス + 口コミの新しさ）と一致していたが、9 項目が Places で取れず「未取得」だった。**r27**: 「オーナー情報の入力」で 9 項目を申告してもらい、その場で採点し直す仕組みを実装（上の「フェーズ 2.5」）。新規: `owner-input.ts` / `owner-store.ts` / `/api/maps/stores/[id]/owner` / `OwnerInputCard.tsx`。変更: `score.ts`（`scoreProfile(place, now, owner)`、`CheckSource` に `owner`）、`report.ts`（`ownerInputAt`）、`history.ts`（`rescoreLatestReport`）、`refresh.ts` / cron / 店舗登録、報告書の表示、ルール総評の文言。テスト: `owner-input.test.ts` 新規、採点 7 件・一斉更新 2 件・公開範囲 1 件追加（92 ファイル・1,311 件）。lint / tsc / build 通過。ローカルで PostgREST のモックを立てて next start + Playwright で「入力 → 保存 → 21/21 項目で採点し直し（83 点 B）→ 履歴に反映」を確認。**利用者側の作業は SQL の実行 1 つ（#45）。**Business Profile API が承認されたら同じ `MeoOwnerData` の形に API の値を入れれば置き換わる（#11）。
- 利用者「他に取得できそうなパラメーターはある？ 有料のガチ診断に組み込んで」→ Places API (New) の Place リソースを `@googlemaps/places` 3.0.0 の proto で洗い直し。**r28**: 追加費用ゼロで取れる 10 系統（追加カテゴリ・住所要素・座標・価格帯・Google マップ内リンク・AI 要約・出張型・**Google の警告**・属性 26 種・写真の大きさと投稿者）を取得し、7 項目を採点に追加（有料 28 項目、無料は 21 項目のまま）。報告書に付加情報の節（口コミ依頼リンク入り）。テスト 92 ファイル・1,324 件、lint / tsc / build 通過、モック DB + Playwright で描画確認。**追加費用がかかる候補として #46 検索順位の計測（Text Search）、#47 周辺の同業との相対位置（Nearby Search）を提案、GO 待ち**（どちらも月 5,000 回の無料枠内に収まる規模）。開業日は Places では取れない（`openingDate` は開店予定のみ）。
- 利用者「46、47 の実装をお願いします」→ **r29**: 検索順位の計測と周辺の同業との比較（上の「フェーズ 2.7」）。Places の request のフィールド名（`locationBias` / `locationRestriction` / `includedPrimaryTypes` / `maxResultCount` / `rankPreference`）は `places_service.proto` で確認。**費用の訂正**: 前回「どちらも月 5,000 回の無料枠」と書いたが、周辺の同業は評価・件数が要るため Nearby Search **Enterprise 区分（月 1,000 回まで無料）**。順位は Pro 区分（月 5,000 回）で正しい。1 自社店舗あたり週 1 回: 詳細 1 + 順位 KW 数（≤5） + 周辺 1。テスト 93 ファイル・1,334 件、lint / tsc / build 通過、モック DB + Playwright で順位表（前回比つき）と周辺比較の描画確認。利用者側の作業は無し（#45 の SQL は引き続き）。#48 として予算アラートと割り当ての確認を推奨。
- 利用者「目指すべき状態と、ツールを使い続ける理由となるコンサル文章を評価項目ごとにすべて添えて」+ 理想値の表（評価 4.3〜4.7、口コミ数、口コミの質、返信率、写真、投稿、基本情報、Q&A、星の分布）→ **r30**: 28 項目すべてに「なぜ大事か / 目指す状態 / 毎週見る理由」を添え、報告書に「目指すべき状態」の節（結論 + 表。Q&A は未計測と明記、写真は Google が返す最大 10 枚のため 10+ 表示と明記）。写真の効果は Google 公表値（ルート検索 +42%、サイトクリック +35%）に置き換えた。平均評価 4.8 以上は合格のまま注記。テスト 94 ファイル・1,336 件、lint / tsc / build 通過、モック DB + Playwright で描画確認（28 項目ぶんの解説を確認）。
- 利用者「Q&A とはどこで見るの？」→ Google ビジネス プロフィールの「質問と回答」機能（Google 検索のナレッジパネル / マップの店舗ページに出る。表示が縮小傾向で、店舗や端末によっては出ない。オーナーは管理画面の「Q&A」から自分で質問を登録して回答できる）。公開 API で取れず Business Profile の Q&A API も終了しているため、ツールでは未計測のまま。コード変更なし。
- 利用者「どこにコンサル文章を入れたの」（無料 `/meo` のサイドバーの画面を共有）→ 入れたのは有料側 `/tools/maps`（サイドバー「ツール → MEO → Google マップ」）の「3. 診断レポート（自社）」の報告書の中（「3. 目指すべき状態」の節と、各項目の下の 3 行）。無料 `/meo` には出していない。報告書が出るには自社店舗の登録（Places キー + Supabase）が必要、と案内。コード変更なし。
- 利用者「/tools/maps に無くない？」→ 原因: r28 より前に保存した報告書には `score.extended` が無く、r30 の解説・目指すべき状態が `score.extended` 判定で隠れていた（本番の報告書は r27 以前の保存分の可能性が高い）。**r31**: `MeoReportView` に `variant: "paid" | "free"` を追加し、有料ツールは報告書の新旧に関係なく「3. 目指すべき状態 / 5. 付加情報 / 6. 順位 / 7. 周辺 / 各項目の解説」を出す（数字が無い節は「次回の一斉更新から」の案内、古い形式には「オーナー情報の保存か次回の一斉更新で 28 項目になる」の案内）。無料 `/meo` は従来どおり。Vercel の反映（数分）後に再確認を依頼。
- 利用者「Q&A の機能は廃止に向かってるの？」→ Web 検索で確認: **Google ビジネス プロフィールの「質問と回答」は廃止済み**（2025-09 に Q&A API 終了告知、2025-11-03 に機能終了、2025-12-03 から表示の段階的削除、新規質問は不可。後継は Gemini ベースの「Ask Maps」で、日本は旧 Q&A が消えて Ask Maps が未提供の空白期間）。前回の回答（「5〜10 問先回りして登録」）は古い情報だったので訂正。**r32**: `guide.ts` の IDEAL_STATE の Q&A 行を「廃止」+ 代替策（説明文・属性・メニュー・投稿・自社サイトの FAQ に先回りして書く）に更新。
- 利用者「じゃツールからその機能消さなきゃ」→ **r33**: 「目指すべき状態」の表から Q&A の行を削除（表は 8 行）。代替策は「基本情報」行の補足に一言だけ残した。Q&A はもともと採点項目ではなく表の 1 行だけだったので、それ以外に消すものは無い。

### 2026-09-11（別セッション: 口コミ支援サービスの設計）

- 利用者が「店舗向け口コミ支援サービス 設計メモ（たたき台）」を提示（QR → アンケート → AI が口コミの下書き → 編集 → Google マップへ投稿ボタン。低評価には「お店に直接伝える」を並列。店舗側は質問・トーン・キーワード・QR 複数発行・回答一覧・低評価通知・押下率。特典なし、出し分けなし）。
- Web 検索で Google のマップ投稿ポリシーと消費者庁のステマ規制を照合（**support.google.com / caa.go.jp / 解説記事の多くはこの環境のネットワークポリシーで開けず、検索の要約に基づく。原文確認は #50**）。判明: ① Google は 2025 年から AI 生成の口コミ本文を削除対象（体験が本物でも）。② 2026-04-17 の改定で「特定の内容・キーワード・従業員名を含める依頼」「従業員の口コミノルマ」を明示的に禁止。③ 2026 年からマップ利用者に「この店は口コミの見返りに特典を出しているか」を尋ね、過去分ごと削除。④ 消費者庁 Q&A: 内容指示なし・割引程度の謝礼なら事業者の表示に当たらないが、「星 5」等を条件にすると当たる。
- 結果を [review-support-design.md](./review-support-design.md) に整理: たたき台の骨格は使える。**外すもの = AI 下書き・トーン設定・含めたいキーワード**（代替: 回答者の自由記述をそのまま完了画面に出してコピーできるようにする）。条件つき = スタッフ別 QR（ノルマに近づくので発行単位は店舗 / テーブル / レジ）、アンケート謝礼（v1 は提供しない推奨）、クリニック（医療広告ガイドラインの確認後）。「お店に直接伝える」は低評価だけでなく全員に出す方が安全。
- 既存アプリへの載せ方も同ドキュメントに: `/tools/reviews`（MEO タブ、pro、Supabase 必須）、公開ページ `/r/[slug]`（`routes.ts` に前方一致の `PUBLIC_PAGE_PREFIXES` を追加する必要あり）、公開 API 4 本（`ratelimit.ts` 流用 + フォームごとの日次上限）、テーブル 3 つ、QR は `qrcode` を 1 つ足すか URL だけ返す、Places の追加費用なし・Anthropic 不要、口コミ件数の推移は週次の `meo_reports` から流用。業種別の質問テンプレート案（飲食・サロン）。v1 の目安 2〜3 日。
- 課金モデルは **店舗数課金を推奨**（オールインワンに自社 1 店舗を含め、2 店舗目から +N 円。回答数課金は成功するほど高くなる）。N は利用者の判断。
- **コードは触っていない**（ドキュメントのみ。`add-release.mjs` 不要）。作業ブランチ `claude/review-support-service-design-n8k2x3` に同じ内容を push し、ドキュメントのみなので main にも直接反映。
- 次: 利用者が #50（原文確認）と #49（§9 の 9 項目）に回答 → v1 実装に着手。
- 利用者「問題ありません。Google は AI によって調整された文章の口コミを正式に禁止と明言はしていません。先ほど送った用件でアンケート機能を実装してください」→ **利用者の決定として、たたき台どおり（AI 下書き・トーン・キーワード設定を含む）実装。r34**。新規: `src/lib/reviews/`（questions / forms / responses / draft / metrics / csv / url / api）、`src/app/api/reviews/*`（forms・channels・qr・responses）、`src/app/api/r/[slug]/*`（取得・answers・events・direct）、`src/app/tools/reviews`、`src/app/r/[slug]`、`src/components/reviews/*`（ReviewsTool / FormEditor / ChannelsCard / MetricsCard / ResponsesCard / SurveyPage）。変更: `routes.ts`（公開接頭辞）、`registry.ts`（機能 `reviews`、アイコン `qr`）、`AppShell`（`/r/` は素の画面）、`ratelimit.ts`、`catalog.ts`（pro のハイライト）、`PrivacyPolicy`（第 12 条）、README / ARCHITECTURE。依存を 1 つ追加（`qrcode`、devDependencies に `@types/qrcode`）。テスト 4 ファイル追加 + routes / plans の期待値更新。詳細は上の「口コミ支援（アンケート QR）— r34」。**利用者側の作業は SQL の実行 1 つ（#51）。**
- 利用者「お店ごとにアンケートにひもついた QR コードを発行できるようにしたい」→ **r35**: 1 つのアンケートを複数店舗で共有し、QR ごとに店舗を紐づける形にした（上の「店舗ごとの QR（r35）」）。`review_channels` に `store_name` / `place_id` / `write_review_url` を追加（SQL は #51 に含めた。r34 を実行済みなら `alter table`）。`ChannelsCard` を「店舗ごと（登録店舗から選ぶ / 手入力）」「置き場所ごと」の 2 モードに、「登録済みの自社店舗にまとめて発行」ボタン。来店客の画面（`/r/[slug]?c=`）と公開 API は QR の店舗名で返し、回答時の下書きの店名・投稿先もその店舗（`resolveStore`）。集計・絞り込み・CSV は「店名（ラベル）」。テスト 4 件追加。lint / tsc / test / build 通過、モック + Playwright で「2 店舗にまとめて発行 + 手入力 1 店舗 → 駅前店の QR で回答 → 見出しと投稿先が駅前店 → 集計と CSV に店舗」を確認。
- 利用者「貼り付ける SQL をもう一度表示して」→ #51 の SQL（完全版と、r34 実行済み向けの `alter table`）を会話に再掲。実行の連絡待ち。#45（`meo_owner_inputs`）も未実行のままであることを伝えた。
- 利用者が Supabase の SQL Editor で口コミ支援の SQL（完全版 54 行）を実行し「Success. No rows returned」のスクリーンショットを共有 → **#51 完了**。次は本番 `/tools/reviews` でアンケートを作り、店舗ごとの QR を発行して、スマホで開いて確認してもらう。#45（`meo_owner_inputs`）は引き続き未実行。
- 利用者「MEO のオーナー情報入力用も入れたい。55 行目以降にコピペすればいいの？」→ 可（1〜54 行は `if not exists` なので再実行しても無害。選択範囲だけの Run でも可）と案内し、#45 の SQL（`meo_owner_inputs`）を再掲。実行の連絡待ち。
- 利用者が `meo_owner_inputs` の SQL を実行（55〜63 行目に追記して Run）し「Success」を共有 → **#45 完了**。Supabase のテーブルは `meo_reports` / `meo_stores` / `meo_owner_inputs` / `review_forms` / `review_channels` / `review_responses` の 6 つが揃った。残りは本番での動作確認（`/tools/reviews` と `/tools/maps` のオーナー情報の入力）。
- 利用者が本番 `/tools/reviews` で店舗（シーシャカフェ＆バー翠煙 新宿歌舞伎町店）の QR を発行できたことをスクリーンショットで確認（DB 接続 OK）。あわせて「QR コードはダウンロードできるように」「削除ボタンは基本 1 回警告を挟んで」→ **r36**: QR の「SVG を保存」「PNG を保存」を `download=1` の添付に（日本語ファイル名）、QR と質問の削除に `window.confirm` を追加（アンケート本体と回答は既にインライン確認あり）。アプリ内の他の削除（MEO の店舗・報告書、設定のプロジェクト、オーナー情報）は以前から `window.confirm` 済み。テスト 3 件追加（`url.test.ts`）。
- 利用者「口コミに対する返信もこのツール内で完結させたい。AI が返信を提案するところまでできる？」→ 回答: **返信案の生成は今すぐ可、ツール内からの投稿は Business Profile API の承認（#5、未申請）が要る**。段階 1（今できる、1 日）: `/tools/maps` に「口コミへの返信」カード。Places で取れる最新 5 件の口コミに「AI で返信案」（店名・トーン・評価と本文。低評価は謝罪 → 事実確認 → 改善 → 個別連絡、高評価は感謝 → 具体的な言及 → 再来店）→ 編集 → コピーして GBP を開く。返信済みは手動の印。口コミ支援の「お店に直接伝える」への返事案も同じ仕組みで可。費用は 1 件数円。段階 2（承認後）: 全件取得・ツール内から投稿・返信済み管理・新着の自動下書き・返信率の自動計測。スコープ `business.manage` の追加と同意画面の再審査が要る。ポリシー面は問題なし（GBP 自身が AI 返信案を出している。公開されるので個人情報を書かない注意書き）。**段階 1 の着手は利用者の GO 待ち。#5 の申請を並行して出すよう案内。**
- 利用者「段階 2 をさっさと終えたい」→ **r37**: Google の承認を待たずに済むところ（コード）をすべて先に作った。`/tools/replies`（上の「口コミへの返信（r37）」）。Business Profile API の承認・API 有効化・スコープ追加・権限の許可は Google 側と利用者側の作業なので **#54 に 4 手順を URL つきで整理**。承認前でも同じ画面で「公開情報の口コミ → AI 返信案 → コピーして GBP」が使える。テスト: `business-profile.test.ts`（解析・URL・PUT/DELETE・403 の案内）、`replies/draft.test.ts`、routes / plans の期待値。lint / tsc / test / build 通過、モック + Playwright で返信画面（接続不可の案内、店舗の選択、設定の保存、API の検証）を確認。**Google の実 API に対しては未検証**（承認後に利用者の画面で確認。エラーが出たら文言ごと共有してもらう）。
- 利用者が Business Profile API の前提条件ページ（prereqs）を開いた画面を共有 → 1〜3 は済み、4 は不要、5 のフォームの記入内容（ログインするアカウント、申請種別、連絡先、会社名、サイト、Project ID / number、確認済みプロフィール、用途の英文）を案内。承認メール待ち（#54 ①）。
- 利用者が Google Cloud「リソースの管理」（`seo-checker-508104` は No organization、別に `matsumatsu452-org` あり）を共有 → **この画面は API 申請に無関係。プロジェクトを組織に移さない**よう案内。前提条件の「組織アカウント」はビジネス プロフィール側の代行会社向けの仕組みで、今は不要。5 のフォーム送信へ。
- 利用者が GBP API サポート画面（`support.google.com/business/contact/api_default`、プルダウン「基本の API アクセスの申請」）まで到達。青いボタンから申請フォームへ進むよう案内。**画面上部に「matsumatsu452@gmail.com のオーナー確認が必要」の帯**が出ていた → 承認条件（確認済み 60 日以上のプロフィール）に響く可能性があるので、申請と並行してオーナー確認を進めるよう案内（所有者は `wolf@wolf-info.org` 側。business.google.com で確認手続きを確認）。
- 申請フォーム 1 画面目「お客様のビジネスを選択」に `株式会社Wolf`（非店舗型・確認済み）だけが出た。利用者「法人登記してない。Wolf は関係ない」→ 法人は不要で、この欄は「管理している確認済み 60 日以上のプロフィール」を示すだけ（クライアントのでも可）。`matsumatsu452@gmail.com` が Wolf の管理者なので **Wolf を選んで進む**よう案内。代替（翠煙の管理者に追加してもらう / プロフィール無しで申請）は時間がかかる。
- 申請フォーム 2 画面目「プロジェクトおよび会社情報」: プロジェクト番号（数字。Cloud ダッシュボードの「プロジェクト情報」。ID `seo-checker-508104` ではない）、サイト `https://seo-checker.tokyo/`、知った経緯（デベロッパー向けドキュメント）、主な理由（日本語 / 英語の文案を会話に記載）を案内。
- 申請フォーム 3 画面目「オーナー確認が 60 日以上前に完了しているか」: 選んだ Wolf のプロフィールについての質問。60 日以上前に確認済みなら「はい」、最近なら「いいえ」（条件未達で保留になる）。事実どおりに答えるよう案内。
- 利用者「3 日前くらいにオーナー追加した。いいえ」→ 質問はアカウントの追加日ではなく **Wolf のプロフィール自体の確認完了日**。以前から「確認済み」で運用しているなら「はい」。分からなければ `wolf@wolf-info.org` に確認日を聞く。プロフィール自体が最近の確認なら「いいえ」で 60 日待ち（その間は接続前の代替で運用）。
- 利用者の依頼で `wolf@wolf-info.org` の受信箱（Gmail 連携）を検索: Wolf のプロフィールの通知は **2026-07-13 の「オーナー / 管理者になりました」が最初**（今日で 60 日目）。「オーナー確認が完了」メールはこの受信箱に無く、確認手続きをした別アカウント（松下昇太郎さん側）に届いているはず。7 月分のパフォーマンス レポート（8/9）はあり。→ 確認完了日が 7/13 以前なら「はい」、以後なら「いいえ」（数日〜数週間で 60 日を超えるので再申請）と案内。
- 利用者「松下のアカウントがメインの管理者ではない」→ 確認完了メールはメインのオーナー宛。business.google.com →「ユーザーとアクセス権」でメインのオーナーを確認し、その人のメールで日付を見てもらう。分からなければ **10/1 以降に申請**（7 月中の確認なら確実に 60 日超）。それまでは接続前の代替で運用。
- 利用者が `wolf@` の Gmail で businessprofile-noreply を検索した画面を共有（5 件中最古が 7/14 JST の「オーナーになりました」。確認完了メール無し）→ Wolf のプロフィールは 60 日条件を満たすか確認できない（今日で 59 日目）。**推奨: 翠煙のオーナーに `matsumatsu452@gmail.com` を管理者として追加してもらい、翠煙のプロフィールで申請**（確認済み 60 日以上を確実に満たす）。代替は Wolf のまま 10/1 以降。
- 利用者の決定: **Wolf のプロフィールで申請を進める**（wolf@ がそれ以前から作っているはず、との判断で「はい」）。却下されたら 10/1 以降に再申請（ペナルティ無し）。
- 申請フォームの最後の質問「許可リスト登録済みのプロジェクト ID を持っているか」→ 初回なので「いいえ」。**送信完了（09-11 20:52）。サポートケース ID `0-4126000041187`、審査 7〜10 営業日**。結果は `matsumatsu452@gmail.com` にメール。承認後は #54 ②〜④。
- 利用者が Google Cloud「有効な API とサービス」の一覧を共有（Places API (New) 11 リクエスト、My Business Account Management API と My Business Business Information API がリクエスト「—」で表示。Google My Business API v4 は無し）→ Places の 11 件は MEO 診断が本番で動いている証拠。**#54 ②のうち 2 つは有効化済み**（この画面は有効化済みの API だけが並ぶ）。v4 は承認前はライブラリに出ない / 有効化できないことがあるので承認メール後に有効化するよう案内。承認前の呼び出しは 403 のまま。
- 利用者「アンケート機能について、ユーザーのスマホの言語設定に合わせてアンケートの言語を切り替えるようにして」→ **r38**: 日本語・英語・中国語（簡体 / 繁体）・韓国語の 5 言語。`Accept-Language` で自動判定、右上の 🌐 で切替、テンプレートの質問は静的な訳、書き換えた質問は AI 訳を `review_forms.translations` に保存、AI 下書きも来店客の言語、回答に `lang` を記録して店舗側にバッジと CSV 列（上の「口コミ支援 … r38（多言語）」）。**利用者の作業: #55 の SQL 2 行**（実行前でも動く）。lint / tsc / test（1,401 件）/ build と、モック + Playwright の多言語スモーク・従来のスモークを通過。AI 訳は実 API で未検証。
- 利用者が配信代行の「配信先メディア一括連携」画面（Acompio / Apple Maps / Audi / BMW / Bing / … / iGlobal の 26 媒体、状態 SYNCED / SUBMITTED / UPDATING）を共有し「他にもこれを追加して。無料ですぐ一斉に登録できるように。AIO のところに基本情報掲載を機能として追加して」→ **r39**: `/tools/listings`（上の「基本情報掲載（r39）」）。**無料の一括登録 API は無い**ことを伝え、無料で自分で登録できる媒体（登録画面へ直接 + コピー用の基本情報）/ 自動で流れる媒体 / 配信代行のみの媒体を区別する形にした。テスト 4 ファイル（媒体の一覧に 26 媒体が全部あること、表記ゆれ、営業時間 → schema.org、保存の user_id、AI の入力）。lint / tsc / test（1,416 件）/ build と、モック + Playwright のスモーク（保存 → 再読み込み → 媒体の状況 → 構造化データ → AIO のサイドバー）通過。**利用者の作業: #56 の SQL**（`listing_profiles`）。#57（配信代行の契約）は判断待ち。
- 利用者「このサイテーション機能によって AIO でどのような効果があるのか、インバウンドや LLM（ChatGPT など）での上位表示につながるという説明を添えて。API 料金はいくら？」→ **r40**: `/tools/listings` の先頭に「なぜ AIO・インバウンドに効くのか」カード（生成 AI は複数媒体で一致した事実を信じる / Bing Places = ChatGPT 対策 / インバウンドは Apple マップ・Siri・Yelp・カーナビ / 説明文は「何の店か」を教える唯一の文章 / 構造化データと llms.txt。「AI に順位は無く、回答に含まれるかが勝負」と表現し、保証はしない）。registry の details にも 1 行。料金は会話で回答: AI の説明文は 1 回 1 円程度（Haiku 4.5、入力 $1 / 出力 $5 per 100 万トークン）、配信代行は Yext 月額 $16〜$76/店舗（米国自社向け）〜年 $1,000〜$3,000/店舗（代理店の小規模契約）、Uberall は非公開。#57 の判断待ちのまま。
- 利用者が Supabase の SQL Editor で r38（2 列の追加）と r39（`listing_profiles`）の SQL 12 行を実行し「Success. No rows returned」を共有 → **#55・#56 完了**。Supabase のテーブルは 7 つ（`meo_reports` / `meo_stores` / `meo_owner_inputs` / `review_forms` / `review_channels` / `review_responses` / `listing_profiles`）。残りは本番での確認: `/tools/listings` で基本情報を保存できるか、英語端末でアンケートを開いて回答の一覧に「英語」バッジが出るか。
- 利用者「登録済みのカード変更機能をつけたい。Stripe の連携を進めたい。アカウントは作ってある」→ 調べ直したところ **Clerk Billing はドルのみ**（円建て 9,800 円が作れない）と判明 → **r41: Stripe 直結**に切り替え（上の「決済（r41）」）。カードの変更・請求書・解約は Stripe のカスタマーポータル。特商法ページ `/legal/tokushoho`（#43）も作成。テスト（契約状態・古いイベントの無視・要約・公開パス）、lint / tsc / test / build 通過。**利用者の作業: #58 の 8 手順**（テストモードで商品・Webhook・ポータル・環境変数 → 動作確認 → 本番キー）。実 Stripe に対しては未検証。

### 2026-09-12（無料診断の切り出し）

- 利用者「この SEO 無料診断の機能の部分だけ別ファイルとしてコピーしたい。zip ファイルとして出力してほしい」→ **`scripts/extract-free.mjs` を追加し、zip を会話に添付して渡した**（`dist/seo-free-checker.zip`、約 0.36 MB、212 エントリ）。本体の画面・API・ロジックは一切変えていない。
- 作り方: 入口（`/`・`/meo` の page、`layout`、`manifest`、API は `analyze` / `site` / `faq` / `meo/search` / `meo/report`）から import をたどって必要なファイルだけを集め、コピーしてから `scripts/extract-free/overrides/` の 4 ファイルで上書きする。上書きで使われなくなったファイル（Clerk 関連の `AuthMenu` / `lib/auth/config` / `store/usePlan` など）と、切り出さない機能のテストは自動で落とす。未解決の import が 1 つでも残れば zip を作らずに失敗する。
- 切り出し版の中身: 163 ファイル。無料診断 2 画面 + API 5 本 + `lib/analyzer` `lib/crawl` `lib/report` `lib/maps` `lib/faq` `lib/free/ratelimit` と UI 一式、テスト 25 ファイル（320 件）。**入っていないもの**: ログイン（Clerk）・課金（Stripe）・Supabase・`/tools/*`・`/settings`・`/admin`・口コミ支援・利用規約 / プライバシー / 特商法のページ。
- 本体と中身が違うのは 4 ファイルだけ: `layout.tsx`（ClerkProvider を外す）、`AppShell.tsx` / `TopBar.tsx`（ログイン表示の引数を外す）、`Sidebar.tsx`（無料診断 2 本だけにする）。追加は `src/lib/main-app.ts` と `/plans`・`/sign-up`（本体サービスへ転送するだけの小さなページ）。機能レジストリと料金プランは、サービス資料の PDF を組み立てるので本体と同じものをそのまま持たせた。
- 本体側の変更は 3 つだけ: `.gitignore` に `/dist`、`tsconfig.json` と `eslint.config.mjs` の除外に上書き用テンプレート（`scripts/extract-free/overrides`）と `dist`。テンプレートは本体の一部ではないので検査対象から外す（切り出し版の設定にはこの除外を入れない）。
- 確認: 本体は lint / tsc / test（1,420 件）/ build すべて通過。切り出し版もリポジトリ外に展開して `npm install` → lint / tsc / test（320 件）/ build を通し、実際に `next start` で起動して ① ダミーサイト（`scripts/e2e/dummy-site.mjs`）の 1 ページ診断と「サイト全体」のクロール進捗、② `/meo` が「準備中」を出すこと（Places キー未設定）、③ `/api/faq` が `enabled:false` を返すこと、④ `/plans`・`/sign-up` が `https://app.seo-checker.tokyo/...` へ 307、⑤ トップに `/` と `/meo` 以外の内部リンクが無いことを確認。画面のスクリーンショットも取得。
- **注意（切り出し版を公開して使う場合）**: 利用規約・プライバシーポリシー・特商法表記のページは入っていないので別途用意が必要。`/meo` は Google Places に実費が出るため、`FREE_MEO_DAILY_LIMIT` / `FREE_MEO_DAILY_SEARCH_LIMIT` を確認する（上限の記録はプロセス内のメモリなので、サーバーレスではインスタンスごとに独立する目安の歯止め）。
- 作業ブランチ `claude/happy-mendel-xul1eh` に push したあと、利用者の判断で **main へマージ（`e88b915`）し、`add-release.mjs` で r42 を追加**。本体の画面・API は変わらないが、main への push なので Vercel の再デプロイは走る。

### 2026-09-12（ツールと API キーの関係図）

- 利用者「このサービスのツールの関係性や API キーでのつながりを図式化して」→ **`docs/dev/tool-map.md` を追加**。作業ブランチ `claude/tool-relationships-api-diagram-jdyj3h` に push 済み（コードは 1 行も触っていないので 4 つの検証と `add-release.mjs` は不要）。
- 中身: ①つながりの 3 種類（サーバーの API キー / 利用者ごとの Google 連携＝鍵は Clerk が預かる / ブラウザの localStorage）、②キー → 外部 API の図（環境変数 9 系統 = `INTEGRATION_KEYS`。GA4 と Supabase だけは 2 つ揃って有効）、③**ツール × キーの対応表 21 行**（● 必須 / ◍ いずれか 1 つ / ○ 任意。プランとログインの要否つき）、④ OAuth の流れと 3 スコープ（`webmasters.readonly` / `analytics.readonly` / `business.manage`）、⑤ツール間のデータの受け渡し（キーワード調査 → 順位計測 → サイトレポート、プロンプト拡張 → LLMO、AIO トピック → ページ診断・AI ライティング、`meo_stores` → 口コミ支援 / 基本情報掲載 / 口コミ返信）、⑥ Cron と決済の流れ、⑦**キーが切れたら何が止まるか**と実費のガード（Places の 1 日上限、SerpApi・LLM はログイン必須、`SITE_MAX_PAGES`、`CRON_SECRET`）、⑧切り分けの順番。
- 図はコードから起こした（`src/lib/features/registry.ts` の `requires` / `requiresAny` / `optional`、`src/lib/features/integrations.ts`、`src/lib/integrations.ts`、各 `route.ts` の import）。**秘密の値は書いていない**（変数名だけ）。`services.md` と `ARCHITECTURE.md` からも参照を追加。
- 書きながら見つかった食い違い 2 つ（実害は小さいので直さず #60 に残した）:
  - `/tools/maps` の総評は `ANTHROPIC_API_KEY` があれば AI が書くのに、registry の `optional` に `anthropic` が入っていないため、設定の案内に「任意」として出ない。
  - `/tools/site-report` は `requires: ["ga4","serpapi"]` だが、この API 自体は SerpApi を叩かない（順位はブラウザに溜まった順位計測の履歴から読む）。SerpApi が要るのは「順位計測で履歴を作るため」という間接的な依存。
- **利用者の判断待ち**: このブランチを main へマージするか（ドキュメントだけなので本番の挙動は変わらない。main への push なので Vercel の再デプロイは走る）。
- 続けて利用者「つながりは 3 種類あるのでそれらを反映した図を PDF 形式でまとめて出力してください」→ **A4 全 6 ページの PDF を作って会話に添付した**（`seo-checker-tool-map-2026-09-12.pdf`、約 1.2 MB）。構成: ① 3 種類の全体図と比較表 → ②サーバーの API キー（環境変数 10 系統 × 動くツール × 未設定のとき。「ブラウザにキーを渡さない」経路図つき）→ ③利用者ごとの Google 連携（接続の 5 手順とスコープ 3 つ、注意 4 点）→ ④ツール同士のつながり（ブラウザの中と Supabase の中を別の図に）→ ⑤ツール × キーの対応表 21 行 → ⑥実費のガード・症状から見る場所・切り分けの順番。
- 作り方: `docs/dev/tool-map.md` の内容を印刷用 HTML（インライン SVG の図）に組み、コンテナの Chromium で `--headless --print-to-pdf` した（日本語フォントは IPAPGothic を埋め込み）。**この HTML はリポジトリに入れていない**（セッションの作業領域だけ）。正本は `tool-map.md` なので、PDF を作り直すときは同じ手順でまた組む。HTML をリポジトリに置いて再生成できるようにするかは利用者の判断待ち。
- PDF に秘密の値は入っていない（環境変数名だけ）。フッターに運営者名「SEO 研究所（代表: 松下）」と出典・日付を入れた。
### 2026-09-12（採点ツール: 意図した noindex とトップのパンくず）

- 利用者の指摘 2 件 →**どちらも採点ツール側の誤検出**として直した。作業ブランチ `claude/search-noindex-breadcrumb-bb0b70` に push 済み（`7f8a65b`）。
  - 「noindex（未対応・配点 2）/search」… 検索結果ページを検索エンジンに登録させない意図的な設定。外させると低品質ページの量産になる。
  - 「パンくずが無い（改善余地・配点 1）/（トップ）」… 最上位で階層が存在せず、「ホーム」1 件だけの BreadcrumbList は位置を何も伝えない。
- 追加した `src/lib/analyzer/page-kind.ts` に、ページの用途の判定を 1 か所へ集約した。`isHomePage`（`jsonld.ts` から移動）と、**noindex が正しい設定であるページ**（サイト内検索の結果 / 買い物かご・購入手続き / ログイン・会員 / 送信完了・確認 / 印刷・プレビュー）の判定。見るのは URL のパスの区切りとクエリ名だけ（`/search`、`/products/search`、`/?s=`、`?q=`、`/cart`、`/login`、`/mypage`、`/contact/thanks`、`?print=1` など）。迷う語（members・tag・category）は入れていない。**この判定を使うのは noindex が実際に設定されているときだけ**なので、外した場合でも「サイト側が意図して付けたものを咎めるかどうか」の差にしかならない。
- 無料診断（`src/lib/analyzer`）: noindex（配点 2）は該当ページで合格にし、ラベルを「サイト内検索の結果ページのため noindex は適切」に。パンくず（配点 1）はトップページで合格にし、「パンくず(BreadcrumbList)はトップページには不要」に。**配点（カテゴリの分母）は据え置きのまま判定だけ変える**（`jsonld-website` と同じ扱い。分母が動くと「改善するとこうなる」の見込み加点が実際の伸びとずれる）。
- ページ最適化レポート（A2）: 同じ noindex を「要改善」にしない。サイト診断（A1）: 同じ noindex は警告ではなく情報として残す（事実は見せるが、直す対象にはしない）。
- 文言: 付録 B「診断方法と採点基準」（`src/lib/report/weights.ts` の `CATEGORY_CRITERIA`）と README の採点表・「採点しないもの」に、採点しない範囲を明記した。
- 検証: lint / tsc / test（109 ファイル・1,436 件）/ build すべて通過。テストは `page-kind.test.ts`（URL の判定）、`analyzer.test.ts`（noindex の合格・未対応、パンくずのトップ / 下層）、`site.test.ts`（ローカルに立てた `/search` を実際に取得して減点されないこと、`/blog/article` をパンくず無しにして「下層ページだけが下がる」こと）、ページ最適化レポートとサイト診断にも 1 件ずつ追加。
- 利用者の指示で **main へマージ（`9f928bd`）し、`add-release.mjs` で r43 を追加**（`a150258`）。マージ後の main でも lint / tsc / test / build を通してから push した。Vercel の再デプロイが走るので、本番の診断結果に反映される（確認するなら `https://app.seo-checker.tokyo/admin` の「動いているコミット」が `a150258` になってから、`/search` を持つサイトで無料診断を実行する）。

### 2026-09-12（採点ツール: robots.txt での拒否も同じ扱いに）

- r43 の直後に気づいた点として利用者へ報告 → 「同じ考え方で除外するか」の問いに **除外する（ただし歯止めつき）** を提案し、実装した。作業ブランチ `claude/search-noindex-breadcrumb-bb0b70`（`8bd055c`）に push → 次の #63 と合わせて **main へマージ（r44）**。
- 直した誤検知: 同じ `/search` が robots.txt でも `Disallow` されていると、`ai-crawlers-allowed`（**配点 3**、カテゴリ内で最大）が「AI 検索用クローラがすべてブロックされている」で未対応になっていた。検索結果ページを robots.txt で止めるのは Google も勧める定石で、noindex と同じ性質の誤検知。
- **歯止め（重要）**: サイト全体が拒否されている（`Disallow: /`）場合は、それ自体が最も重大な設定ミス。**トップページが許可されているときだけ**「意図した拒否」とみなす。この条件が無いと、`Disallow: /` のサイトで `/search` を診断したときに「適切」と言ってしまい、致命的な問題を隠す。
- `page-kind.ts` の名前を実態に合わせた: `intentionalNoindex` → **`notForSearch`**（もともと検索に載せないページ）。理由の文は結論抜きにして、呼び出し側が「noindex のままにしておくのが正しい設定です」「robots.txt で拒否したままで問題ありません」を足す形にした。URL の判定そのもの（5 種類の語）は r43 から変えていない。
- 反映先: 無料診断の `ai-crawlers-allowed`（配点は据え置きで判定だけ pass）、ページ最適化レポートの「検索用 AI クローラの許可」、サイト診断（A1）の `ROBOTS_BLOCKED`（重大 → 情報）。A1 の判定に使う `rootRobotsAllowed` を `AuditContext` に追加した（`run.ts` で `robots.isAllowed(${origin}/, "Googlebot")`）。
- 検証: lint / tsc / test（109 ファイル・**1,444 件**）/ build すべて通過。テストは「検索ページの拒否は減点しない」「`Disallow: /` なら検索ページでも未対応のまま」「ふつうのページの判定は変わらない」「一部のクローラだけの拒否も減点しない」を無料診断・ページ最適化レポート・A1 の 3 か所に追加。`site.test.ts` のダミーサイトの robots.txt に `Disallow: /search` を足して、実際に取得する経路でも確認している。
- **やっていないこと（今後の候補）**: 「もともと検索に載せないページ」はタイトル・説明文・見出しなども採点対象のままで、サイト全体の平均点を下げる。ページごと参考扱い（採点対象外）にするかは別の判断が要るため触っていない。

### 2026-09-12（サイト診断: 検索に載せないページを採点対象外に）

- 前の項目の「もう 1 つの気づき」（/search に説明文が無いのは当然なのに「未対応」と出て平均点を下げる）を利用者が「修正お願いします。終わったらメインにマージして」→ 実装し、#62 と合わせて **main へマージ（`cd540e8`）、`add-release.mjs` で r44（`7c9fcdd`）**。マージ後の main でも lint / tsc / test（109 ファイル・**1,453 件**）/ build を通してから push した。Vercel の再デプロイが走る。
- **判定（`src/lib/analyzer/robots.ts` の `searchExclusion`）**: URL の用途（page-kind.ts の 5 種類）**かつ**、実際に noindex か robots.txt（トップページは許可 = 意図した拒否）で検索から外されているときだけ該当。URL だけでは決めない（検索に載る状態の /search は title や説明文をふつうに問うべき）。ふつうのページの noindex はうっかりの可能性があるので採点対象のまま（未対応として目立たせる）。`Disallow: /` は理由にしない。
- **データの形**: `AnalysisResult.excluded: PageExclusion | null`（label / noindex / robots）。サイト診断では該当ページを `pages` から外し `SiteAnalysisResult.excluded`（URL つき）に分ける。`overall`・`categories`・`checks` は採点ページだけで集計。`crawl.analyzed` = 採点したページ数、`crawl.excluded` を追加。進捗の `analyzed` は採点対象外も「診断済み」に数える（画面の進捗はそのまま）。採点できるページが 1 つも無ければ「トップページの URL で診断してください」のエラー（400）。
- **レポート**: 表紙の診断ページ数に「採点対象外 N 件」、付録 A に「採点対象外のページ」の小表（URL / ページの用途 / 外し方 = noindex・robots.txt）と「採点したページ / 採点対象外のページ」の統計、ヒート表の脚注、注記（notes）。入力 URL 自体が採点対象外なら「入力 URL」の印はどのページにも付けない。単体診断（このページ）では採点はそのままで、シートの先頭に Callout「このページは検索に載せないページです（採点は参考）」。付録 B に採点対象外ページの説明を 1 段落。
- **テスト**: `searchExclusion` の判定（noindex のみ / robots.txt のみ / 両方 / 検索に載る状態の /search は null / ふつうのページの noindex は null / `Disallow: /` は理由にしない）、`site.test.ts` のダミーサイトで `/search` を `/blog/article` からリンクして実際にクロール → `excluded` に入り `pages` と項目集計から外れること、`summary.test.ts` で付録用の行と「入力 URL が採点対象外」の扱い。
- **注意（引き継ぎ）**: サイト診断の結果の形が変わった（`excluded` が必須）。`/api/site` のキャッシュはプロセス内なので再デプロイで消える。ブラウザに保存した過去の結果は無い（無料診断は保存しない）。切り出し版（`scripts/extract-free.mjs`）は import を辿るので追加ファイル不要。

### 2026-09-13（採点ツール: 本文の具体性の判定を多言語対応に）

- 利用者の依頼: 全 61 ページのサイトを診断したところ、英語ページ `https://wolf-g.jp/en` だけが、本文を 3,093 字 → 6,715 字に増やしても毎回まったく同じ「数値・日付・組織名・連絡先を含む文 **1 / 全 1 文**・改善余地」になる。自前で数えると事実を含む文は 18 / 28 文 →35 / 53 文。作業ブランチ `claude/aio-diagnosis-multilingual-jh9apk`（`ce4b38f` = 本体、`73ee1e6` = 長大な塊に対する堅牢化）→ 利用者の指示「メインにマージして」で **main へ早送りマージ（`f98e5a8`）、`add-release.mjs` で r45（`cfbf715`）**。マージ後の main でも lint / tsc / test（110 ファイル・1,490 件）/ build を通してから push した。Vercel の再デプロイが走る。
- **原因は 2 つ**。① 文の区切りが句点（`。！？!?`）固定で、しかも本文を 1 本の文字列にしてから割っていた。句点を持たない言語のページは本文全体が常に 1 文。箇条書きだけのページも同じ理由で 1 文になっていた。② 分母が 1 でも比率で判定していた。旧条件は「事実 2 文以上 **かつ** 比率 10% 以上」なので、1/1 = 100% でも 2 文に足りず warn。比率は満たすのに減点される、という矛盾がそのまま出ていた。
- **直し方（新規 3 ファイル）**:
  - `src/lib/analyzer/language.ts` — 言語判定。`<html lang>` と要素の `lang` 属性を最優先、無ければ かな・漢字とラテン文字の割合で推定する。判定は**ブロック単位**（日本語ページの中の英語ブロックは英語として扱う）。文字種の推定がページの宣言と一致するときは宣言を採用し、レポートには「英語」（不一致なら「英語（推定）」）と書く。
  - `src/lib/analyzer/sentences.ts` — HTML をブロック（段落・リスト項目・表のセル・見出し・`<br>` の行）に分けてから、言語に合わせて文に割る。日本語は `。！？`、英語などは `. ! ?` ＋空白／行末。英語では**略語（Inc. / Ltd. / Co. / U.S. / e.g. / i.e. / No. / Mr. / 月名）・小数と桁区切り（1.5 / 33,000）・URL・メールアドレス・頭字語（A.I.）・先頭の箇条書き番号（1.）では切らない**。URL とメールは同じ長さの伏せ字に置き換えてから区切り位置を探している。**リスト項目・表のセル・見出しは句読点が無くてもそれぞれ 1 文**。事実の手がかりも多言語化した（NFKC で全角を半角に揃えてから判定: 全角数字、通貨 円 / ¥ / $ / yen / JPY、和暦と英語表記の日付 November 6, 2024 / 2026-04-18、法人格 株式会社 /（株）/ Inc. / Co., Ltd. / GmbH、電話・メール・URL・郵便番号・時刻、割合、単位 名 / 店舗 / 件 / stores / people / km、6 桁以上の識別番号 = 法人番号など）。
  - `src/lib/analyzer/text.ts` — `normalizeText` / `countChars` を content.ts から移しただけ（循環 import を避けるため。content.ts から再 export しているので既存の import はそのまま動く）。
- **判定の基準（`SPECIFICITY_RULE`。レポートにもこの数字を出す）**: 文が **5 文以上**なら比率で判定（10% 以上かつ 2 文以上）。**5 文未満は比率で判定しない**（1/1 = 100% のように跳ねるだけで改善の指標にならない）。事実を含む文が **2 文以上、または全文が事実**なら合格、それ以外は「本文が短く、具体性を判定できない（参考）」= warn（配点の半分）。
  - **閾値を 3 文ではなく 2 文にした理由**: 依頼の例示は「3 文以上」だったが、3 にすると「4 文中 2 文が事実」のような**いまは合格しているページが新たに減点**される。誤検知を減らす依頼で新しい誤検知を作らないよう、現行と同じ 2 文にした。
  - **5 文未満で事実 0 のページは fail → warn に緩めた**（旧: 3 文以上で事実 0 なら fail）。分母が小さいときは「具体性が無い」と断定できないため。長い本文で事実が無いページ（5 文以上・事実 0）は従来どおり fail。
- **判定根拠をレポートに出す**（依頼 5）: 根拠欄を「数値・日付・組織名・連絡先を含む文 21 / 全 41 文（51%） ｜ 判定言語 英語 ｜ 基準 比率（10% 以上かつ 2 文以上）」の形にし、`CheckResult.details`（新規・任意）に**事実と判定した文の実例を最大 3 件**出す。事実が 1 件も無いページでは代わりに「何を 1 文として数えたか」の実例を出す（何を直せば数字が動くかが分かるように）。サイト診断の集計には details を持ち込まない（ページ数だけ並んで読めなくなるため）。
- **ついでに直した所**: ページ最適化レポート（`/tools/page-report`）の「文の読みやすさ」も同じ分割を使うようにした。従来の正規表現は句読点の直後で必ず切るため、`Inc.` や `1.5` でも切れて平均文長が実際より短く出ていた。
- **検証**: lint / tsc / test（**110 ファイル・1,489 件**。うち新規 36 件が依頼の受け入れ条件そのもの）/ build 通過。E2E スモーク（`node scripts/e2e/free-smoke.mjs`）も通過（診断 18 ページ、console エラー 0、PDF 出力あり）。E2E のダミーサイトに**英語ページ `/en`**（句点ゼロ・箇条書きと表つき）を追加し、同じページで**旧実装 = 「1 / 全 1 文」→ 新実装 = 「21 / 全 41 文」合格**を確認した（報告された症状がそのまま再現し、直ることを確認できるようにした）。実サイト `wolf-g.jp/en` はこの環境から取得できない（プロキシが 403）ため、同じ性質のダミーで確認している。
- **数え方が変わる影響（日本語ページ）**: 段落主体のページは従来と同じ文数になる。変わるのは箇条書き・表が多いページで、これまで「リスト全体で 1 文」だったものが項目ごとに 1 文になる（意図した修正）。既存のテストはすべてそのまま通っている。
- **やっていないこと**: 依頼の任意項目「意図的な仕様の申告」（#65）。自動で区別できる分（検索結果ページの noindex・トップのパンくず）は r43 / r44 で既に減点しない。残りは手動申告の仕組みで、保存先（端末の localStorage か、サイト側の宣言か）と**スコアに反映するかどうか**を決める必要があるため、案を「入力待ち」に書いて判断を待つ。

### 2026-09-13（Stripe の設定）

- 利用者が Stripe のサンドボックス（テスト環境 `seo-checker`）で「商品を追加」の画面を共有（継続・**¥30,000**・毎月）。「Price ID はどこで見る？」→ この画面には出ない。「商品を追加」を押したあとの商品詳細 → 料金の行を開く → 右上（または「…」→「価格 ID をコピー」）に `price_…` が出る、と案内。**金額が 30,000 円になっている**（アプリの料金表・特商法ページは 9,800 円）ので、9,800 に直すか、30,000 に値上げするなら伝えてもらう（catalog.ts と特商法ページを合わせて直す）。画面上部の「Multiple capabilities paused（2 required tasks past due）」は Stripe のアカウント確認（本人確認・事業情報）が未完了の表示。サンドボックスのテストには影響しないが、本番モードで売る前に「View tasks」から完了が必要。
- 利用者が商品「オールインワン」（¥30,000 / 月、`prod_VFcHhP9RrDhK9E`）を作った画面を共有。Price ID は「料金」の行（¥30,000 毎月）をクリック → 価格の詳細の右側「価格 ID」、または行の右端「…」→「価格 ID をコピー」と案内。商品 ID（`prod_`）とは別物。金額は依然 30,000 円（アプリ側は 9,800 円）。どちらにするかの回答待ち。
- 利用者が価格の詳細画面（`price_1UF73IBQZc3g0qHVJGb0aumu`、¥50,000 / 月）を共有し「50,000 を定価で割引を基本にしようと思う」→ **r46**: 料金を定価 50,000 円に統一（catalog / 特商法 / 紹介サイト / README / llms.txt）、「機能ごとに 3,000 円引き」を削除、割引はクーポンコードと明記。#58 の 1 は完了（テスト環境の Price ID を記録）。クーポンの作り方を #58 の 1b に追記。残りは 2（Webhook）〜7（テスト購入）→ 8（本番）。
- 利用者「次の手順を教えて」→ #58 の 2（Webhook）〜 7（テスト購入の確認）を、画面・URL つきで会話に再掲。値（`whsec_` / `sk_test_`）は会話に貼らず Vercel に直接入れるよう案内。設定完了の連絡待ち。
- 利用者「エンドポイント追加はどこ」（ワークベンチの Webhook タブの画面）→ 新しい Stripe の画面では **「+ 送信先を追加」** が旧「エンドポイントを追加」。押したあと イベントを選ぶ（4 つ）→ 送信先の種類は「Webhook エンドポイント」→ URL `https://app.seo-checker.tokyo/api/billing/webhook` → 作成 → 署名シークレット（`whsec_`）を表示してコピー、の順と案内。
- Webhook の送信先を作成（テスト環境）: 名前「seo-checker 本番アプリ」、URL `https://app.seo-checker.tokyo/api/billing/webhook`、イベント 4 件、API バージョン `2026-08-26.dahlia`、状態「アクティブ」、支払先 ID `we_1UF8u2BQZc3g0qHV06nnP8Jy`。署名シークレットは目のアイコンで表示 → Vercel の `STRIPE_WEBHOOK_SECRET` へ（会話には貼らない）。**#58 の 2 完了**。次は 3（カスタマーポータル）→ 4（公開事業者情報）→ 5（API キー）→ 6（Vercel の環境変数 3 つ）→ 7（Redeploy）→ 8（テストカードで確認）。

### 2026-09-13（SEO 分析ツールの要件書）

- 利用者から「SEO 分析ツール 機能要件」（目的 / データソース GSC・URL Inspection・Sitemaps・GA4・CrUX・CrUX History・PSI / CrUX と PSI の役割分担 / 自前クローラー / robots・sitemap / URL 集合の比較 / Google Ads / URL 単位の統合 / 改善候補の自動抽出 / ダッシュボード / コスト最適化 / 有料データ無しでは難しい機能 / 基本思想）を受け取った。ブランチ `claude/seo-analysis-tool-spec-b6gq4x`。
- **コードは書いていない**。要件を [seo-analysis-spec.md](./seo-analysis-spec.md) に整理し、既存コードとの対応表（§14）、実装の段階 A〜G（§15）、設計上の決めごと（§16）、利用者に決めてもらうこと（§17）を書いた。
- 棚卸しの結果: 要件の約半分は既存で満たせる。GSC は `src/lib/google/search-console/`（query / page / date / country / device）と `/tools/search-performance`、GA4 は `src/lib/ga4/`、PSI は `src/lib/psi/`（CrUX の p75 も PSI 経由で取っている）、クローラーは `src/lib/crawl/` + `src/lib/audit/`（48 ルール・10 カテゴリ。§4 の検出項目はほぼ網羅、hreflang / OG / nofollow の抽出だけ無い）、robots / sitemap は `src/lib/analyzer/robots.ts` と `discover.ts`。**無いのは CrUX API・CrUX History API・URL Inspection API・Sitemaps API のクライアント、URL 単位の保存と統合（Supabase）、改善候補の抽出ロジック、ダッシュボード、Google Ads**。
- 判断（提案として記載、確定は利用者）: 保存先は Supabase（履歴が本体なので localStorage では持てない）。定期取得は既存の Cron と同じ守りで `/api/cron/seo-refresh` 1 本（Vercel Hobby は 1 日 1 回まで）。CrUX は URL → Origin → データ不足の 3 段で、どの単位の値かを画面に必ず出す。PSI は CrUX の問題 URL・新規 URL・手動のときだけ。Google Ads は準備（developer token・MCC・`adwords` スコープ）が重いので最後。
- Google 側の準備は Chrome UX Report API の有効化と既存 API キーの制限追加だけ（URL Inspection / Sitemaps は許可済みの `webmasters.readonly` で呼べる）。費用はゼロで組める。
- 次: §17 の回答をもらったら段階 A（`src/lib/crux/` + `/tools/cwv` + PSI 連動）から着手する。

- 利用者「Claude in Chrome にやらせるのでプロンプトを書いて」→ #58 の 3〜8（カスタマーポータル → 公開事業者情報 → API キー → Vercel の環境変数 3 つ → Redeploy → テストカードで確認）を、そのまま貼れる 1 本のプロンプトにして会話に提示。**秘密の値（`sk_test_` / `whsec_`）はブラウザ内でコピー＆ペーストし、チャットには書かない**ことをプロンプト内に明記。Price ID `price_1UF73IBQZc3g0qHVJGb0aumu` は秘密ではないのでプロンプトに直書き。結果の報告形式（各手順の成否・エラー文言・Webhook の応答コード）も指示に含めた。
- 利用者「Claude in Chrome にやらせるのでプロンプトを書いて」→ #58 の 3〜8（カスタマーポータル → 公開事業者情報 → API キーと署名シークレットの取得 → Vercel の環境変数 3 つ → Redeploy → テストカードで申し込み・カード変更・解約の確認）をブラウザ操作エージェント向けの手順書にして会話に提示。秘密の値はチャットに書かせず Vercel の入力欄にだけ貼る、本番モードには切り替えない、ログイン要求で止まる、を明記。
- Vercel の環境変数画面に入る前に「Secure Your Account with 2FA」（2 段階認証の設定の勧め）が出た → 必須ではない。**いったん「Skip securing my account」で進め、Stripe の設定が終わったあとに利用者本人が設定する**（スマホの認証アプリとリカバリーコードの保管が要るので、ブラウザ操作エージェントには任せない）と案内。**残タスク: Vercel の 2 段階認証を有効にする**（本番サイトと Stripe の秘密鍵を持つアカウントのため）。
- Vercel の「Add Environment Variable」画面（Secret / Config の選択が付いた新 UI）→ `STRIPE_SECRET_KEY` と `STRIPE_WEBHOOK_SECRET` は **Secret**（保存後は Vercel 側で再表示できないが、Stripe から取り直せる）、`STRIPE_PRICE_PRO` は Config でも可。**環境の選択に Production が含まれているか**をダイアログ内をスクロールして確認するよう案内。値の前後に空白・改行を入れない。
- Stripe の API キー画面（テスト環境）を共有。**シークレットキーの全体がスクリーンショットに写っていた**ため、テストキーなので実害は限定的だが、気になるなら「…」→ ローテーションして新しい値を Vercel に入れるよう案内。**本番の `sk_live_` は画面共有もチャット共有もしない**ことを再確認。公開可能キー（`pk_test_`）はこのアプリでは使わない。値はメモにも会話にも記載しない（プロジェクト規約）。
- Vercel に入れようとした値が **`mk_` で始まる別物**（Stripe 内部の ID を拾った）だったため差し戻し。**`STRIPE_SECRET_KEY` は `sk_test_` で始まる 100 文字超、`STRIPE_WEBHOOK_SECRET` は `whsec_` で始まる 40 文字前後**。取り違えると `/plans` のボタンは出るが押下時に 502（「申し込み画面を開けませんでした」）になる。ブラウザ操作に任せるときは「先頭が sk_test_ / whsec_ になっているか貼付後に確認する」旨を指示に足す。
- Vercel の環境変数一覧に Stripe の 3 つが Production で並んだ（`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` は Secret、`STRIPE_PRICE_PRO` は Config）。**#58 の 6 完了**。次は Redeploy → `/plans` で確認。切り分け: ボタンが出ない = 変数名の誤りか未反映、押下で 502 = `STRIPE_SECRET_KEY` が誤り、支払い後に「契約中」にならない = `STRIPE_WEBHOOK_SECRET` が誤り。Secret は再表示できないので、誤りなら行を削除して再登録。
- Vercel の Deployments を確認: 最新の Production は `45878a1`（運用メモの push で自動デプロイ、環境変数の保存後）。**手動の Redeploy は不要**と判断し、`/plans` での確認へ進むよう案内。運用メモを main に push するたびに本番が自動デプロイされるので、環境変数を保存したあとにメモを push すれば再デプロイを兼ねられる。
- 本番 `/plans` →「申し込む」→ **Stripe Checkout（サンドボックス）が開いた**。「オールインワン を定期購入 ¥50,000 / 月」「プロモーションコードを追加」「メールアドレスは Clerk のアカウントから自動入力」まで確認。→ **`STRIPE_SECRET_KEY` と `STRIPE_PRICE_PRO` は正しい**（#58 の 7 まで到達）。残るは支払い後に「契約中」になるか（= `STRIPE_WEBHOOK_SECRET` の確認）。
- **テストカードで申し込み完了 → `/plans` が「契約中 / 月額 ¥50,000 / 次回の更新 2026-10-13 23:26」になった**（09-13 23:27）。Checkout → Webhook → Clerk の `publicMetadata.stripe` への書き込み → プラン判定まで一通り動作。**3 つの環境変数はすべて正しい。#58 の 1〜7（テスト環境）完了**。残り: ①カスタマーポータルでカード変更と解約を確認 → ②本番モードで商品・Webhook・ポータル・API キーを作り直し、Vercel の 3 つを差し替え、`DEFAULT_PLAN` を `free` に（#39）。
- **カスタマーポータルが開いた**（テスト環境）: 現在のサブスク（オールインワン ¥50,000 / 次の請求日 2026-10-13 / Visa ••••4242）、決済手段の追加と変更、請求先情報、請求履歴（2026-09-13 ¥50,000 支払い済み）、サブスクをキャンセル、が揃っている。**利用者の当初の依頼「登録済みのカード変更機能」はこの画面で実現**。残りはカード変更と解約の実操作の確認 → 本番モードへの切り替え。
- **カード変更と解約の実操作を確認**（テスト環境）: 決済手段を Visa ••••4242 → Mastercard ••••4444（デフォルト）に変更でき、「サブスクをキャンセル」で「10/13 に終了します / サービスは 2026年10月13日 に終了します」になり「サブスクを続ける」で再開もできる。**テスト環境の検証は完了（#58 の 1〜7）**。残りは #58 の 8（本番モードで商品・Webhook・ポータル・API キーを作り直し → Vercel の 3 つを差し替え → `DEFAULT_PLAN=free`（#39）→ Redeploy）と、Stripe の「Multiple capabilities paused」（本人確認・事業情報）の完了。切り替えのタイミングは利用者の判断。
- 利用者「Claude in Chrome に指示します」→ 2 つのプロンプトを提示。①テスト環境の最終確認（`/plans` が「契約中（期間末で解約予定）」「ご利用期限 2026-10-13」「テストモードです」になっているか）、②**本番モードへの切り替え**（Stripe を本番に切替 → 商品と ¥50,000 の価格 → Webhook → カスタマーポータル → `sk_live_` → Vercel の 3 つを差し替え + `DEFAULT_PLAN=free` → Redeploy →「テストモードです」が消えたことの確認まで。決済はさせない）。②の前に Stripe の「Multiple capabilities paused」（本人確認・事業情報）を完了させること、`sk_live_` はチャットに出さないことを明記。
- 利用者「サービスとして本番で使えるようにしたい。カード登録は先にすべきですよね？それから管理画面に遷移させるべきですよね？」→ 方向は正しいと回答し、`/start` での振り分けを提案。続けて「初月無料で、次の月から二万円引きの三万円はできる?」→ **できる**と回答し、二重価格表示の懸念とクーポン自動適用の制約を説明したうえで選択肢を提示。利用者の決定は「初月無料 + ずっと 2 万円引き」「割引はクーポンコードを入力してもらう」。→ **r47** を実装（上の「初月無料と申し込み導線（r47）」）。lint / tsc / test（1,494 件）/ build 通過。本番ビルドで特商法ページの文面・`/start` の振り分け・料金画面の初月無料の表示を確認。**利用者の作業: 上の「本番公開までに残っていること」の 6 つ**。
- 利用者「申し込み登録用の URL はないの？」→ **`https://app.seo-checker.tokyo/sign-up`**（登録 → `/start` → 未契約なので `/plans` → 申し込み）。用途別: 新規は `/sign-up`、登録済みは `/plans`、説明は紹介サイト `https://seo-checker.tokyo/`、お試しは `https://app.seo-checker.tokyo/`（無料診断・ログイン不要）。**紹介サイトの CTA が「ツールにログイン」と「申し込む（/plans）」だけで新規登録への導線が無い**ことを指摘。ボタンを「初月無料ではじめる」→ `/sign-up` に変えるか確認中。
- 利用者「お願いします」→ **r48**: 紹介サイトの CTA を「初月無料ではじめる」→ `https://app.seo-checker.tokyo/sign-up` に（ヘッダー・ヒーロー・料金カード・最後の CTA・追従 CTA の 5 か所）。ヒーローの補足に「すべての機能は初月無料でお試しいただけます」と「アカウントをお持ちの方はログイン」を追加。llms.txt に「お申し込み（新規登録）」と特商法ページの URL を追加。README に申し込み導線を明記。lint / tsc / test（1,494 件）/ wrangler の dry-run 通過。**紹介サイトは Cloudflare Workers Builds が main の push で自動デプロイ**（反映に数分）。
- 利用者「カード登録から Google アカウントの登録までどういった流れになるのが正常なの？」→ **正しい順序はカードが先**（無料期間中も全機能が開くので、カード未登録で Google を繋いでも鍵のままで無駄足になる）。正常な流れ: 紹介サイト →`/sign-up`→ 登録 →`/start`→`/plans`→ Stripe でカード登録（初月無料・請求 0 円）→「ツールを使いはじめる」→ **設定の Google 連携で Search Console と GA4 の読み取りを許可し、対象サイトと GA4 プロパティを選んで保存** → MEO の店舗登録 → 口コミ返信の権限追加（Google の審査後）。**いまの穴 3 つ**: ①決済後の着地が `/tools/site-audit`（Google 連携が不要な画面）なので次に何をすべきか分からない、②サインアップの「Google で続ける」はログイン用でデータを読む権限は含まないのに、その説明が無い、③口コミ返信の `business.manage` は審査待ち。→ **提案: 決済完了後に「はじめかた」の 3 ステップを出し、設定画面に「ログインに使った Google アカウントでも読み取りの許可は別に必要」と明記する。実装するかは利用者の回答待ち。**
- 利用者「無料の簡易診断は自由にリンクからできるようにしたい。本サービスからは切り離してほしい。本サービスの詳細診断をなるべく推進したい。無料で済ませるとそれで終わってしまう。どういう流れでカード登録・Google アカウント登録をしていくべきか」→ **r49** を実装。
  - **切り離し**: `/` と `/meo` を専用の公開シェル（`src/components/free/FreeShell.tsx`）で表示。出すのはロゴ・ログイン・「初月無料ではじめる」・規約リンクだけで、有料ツールのサイドバーもトップバーも出さない。ログイン済みの人には「管理画面へ」を出す。
  - **推進**: 結果の直後に `UpgradeCta`（`src/components/free/UpgradeCta.tsx`）。「無料診断で分かるのは『今の状態』まで」→ サイト版 / 店舗版それぞれの「詳細診断で分かること」4 点 → 「初月無料で詳細診断をはじめる」（`/sign-up`）+ サービス資料。文言は `src/lib/free/upsell.ts` に集約（無料 2 本で言うことをずらさないため）。印刷・PDF には出さない。
  - **サイドバー**: 無料診断を最下部の「お客様に渡す無料診断」（バッジ「公開」）へ移動。ツールが最上段に来る。
  - **検索エンジン**: `src/app/robots.ts` と `src/app/sitemap.ts` を追加。無料診断 2 本と規約類だけを開け、`/tools/` `/settings` `/admin` `/plans` `/api/` `/r/` は塞ぐ。公開範囲が `src/lib/auth/routes.ts` とずれないことをテストで固定。
  - **はじめかた**（前回の提案を利用者が承認）: 契約済みの `/plans` に 3 ステップ（① Google 連携 ② 店舗登録〈任意〉③ サイト診断）を表示（`src/lib/onboarding/steps.ts` + `src/components/onboarding/GettingStarted.tsx`）。設定画面の Google 連携に「ログインに『Google で続ける』を使った場合もこの接続は別に必要」と明記。
  - **正常な流れ（確定）**: 無料診断（リンクを渡す・ログイン不要）→ 結果の下の導線 →`/sign-up`→`/start`→`/plans`で カード登録（初月無料・請求 0 円）→「はじめかた」→ 設定で Google 連携（Search Console / GA4 の読み取り）→ 店舗登録（MEO）→ 口コミ返信の権限追加（Google の審査後）。
  - lint / tsc / test（1,504 件）/ build 通過。本番ビルドで `/`・`/meo` にサイドバーが出ないこと、`/tools/site-audit` に「お客様に渡す無料診断」が出ること、`robots.txt` の内容を確認。
- 利用者「無料診断はあくまで簡易的なもの。クオリティは高いが、お金を払うと非常に高い精度の有料の詳細な診断ができる、というところを強みにしたい。無料診断という名前は回数制限をつけるか、どういった名前がいいか」→ **r50**。
  - **名前**: 「無料診断」→ **クイック診断**、「詳細診断」→ **精密診断**（利用者が選択）。値段ではなく浅い / 深いで呼び分ける。「無料」はバッジ・値札としてだけ残す（`FREE_SUITE_LABEL` = クイック診断（SEO・MEO・AIO）、`PAID_DIAGNOSIS_LABEL` = 精密診断）。内部の ID（`free` / `free-meo`）と URL は変えていない。
  - 変更範囲: 画面（クイック診断 2 本・サイドバー・料金表・利用規約・特商法）、レポートと PDF（表紙・付録・サービス資料）、`layout.tsx` / `manifest.ts` のタイトル、紹介サイト `marketing/public/index.html`（CTA・FAQ・料金・JSON-LD）と `llms.txt`、README と設計ドキュメント。
  - **深さの制限**（回数制限より効くと判断し、利用者が選択）: クイック診断の「サイト全体」を **代表 10 ページ** で打ち切る（`src/lib/free/limits.ts` の `FREE_SITE_MAX_PAGES`、環境変数 `FREE_SITE_MAX_PAGES` で 50 まで）。以前は有料と同じ最大 300 ページを無料で採点していた。`/api/site` はログイン不要で叩けるので、画面が送る `maxPages` を信用せずサーバー側で必ず制限し直す。
  - 打ち切ったときは表紙が「10 ページ（見つかった 16 ページ中の代表）」になり、結果の下の導線に「**見つかった 16 ページのうち、代表の 10 ページを診断しました。残り 6 ページは精密診断で 1 ページずつ採点できます**」を出す。時間切れで止まったときはこの文言を出さない（誤解を与えるため）。1 ページ診断は入口なので無制限のまま。
  - lint / tsc / test（1,509 件）/ build 通過。**E2E スモーク（`node scripts/e2e/free-smoke.mjs`）で、18 ページのダミーサイトが 10 ページで打ち切られ、残り件数の案内が出ることを確認**（期待値も上限に合わせて更新）。
- 利用者「店舗（MEO）側も、評価を厳しくできるのであれば改善点が増えるのでおすすめ」→ **r51**（採点基準 v2）。項目を隠す案（#40 の案 B）は採らず、**しきい値を「目指す状態」（`guide.ts`）に合わせて引き上げた**。v1 は「登録さえしてあれば合格」に寄っていて、手が入っていない店舗でも A が出やすかった。
  - 営業時間: 7 曜日に満たなければ **要改善**（欠けた曜日は検索結果で「営業時間不明」になる）。7 曜日そろって全日定休日は注意のまま。
  - ウェブサイト: Instagram・Facebook・食べログ・ホットペッパー・予約代行など **自社サイト以外だけの登録は注意**（`looksNotOwnedSite`。ホスト名の完全一致・サブドメイン一致で判定し、`mystore-instagram.jp` のような自社ドメインは誤検出しない）。
  - 平均評価: 合格 4.4 → **4.5**、要改善の線 4.0 → **4.2**。口コミ件数: 要改善の線 30 → **50 件**（合格は 100 件のまま）。
  - 口コミの新しさ: 合格 90 日 → **30 日以内**、要改善 365 日 → **90 日超**。
  - オーナー投稿の写真（有料）: 3 枚 → **5 枚以上**（Google が表示する 10 枚の半数）。写真の解像度: **半数以上が低解像度なら要改善**。口コミ本文: **本文つきが 3 割未満なら要改善**。属性: **「はい」の属性だけ**を数える（「いいえ」は絞り込みに使われないため）。
  - 写真の枚数は据え置き（Places が返すのは最大 10 枚なので、10 枚 = 上限。20 枚などにすると誰も合格できない）。
  - 報告書の末尾に「**採点基準 v2（2026-09-13 改定）**」と、過去に保存した報告書とはスコアが直接つながらない旨を明記（履歴の推移に段差が出るため）。テストのフィクスチャ（理想の店舗）も新基準で 100 点になるよう属性とオーナー写真を追加。
  - lint / tsc / test（1,510 件）/ build 通過。**本番の店舗は次回の一斉更新（月曜 5:00 JST）で新基準に切り替わる**。スコアは全体に下がるので、既存のお客様には「基準を上げた」と先に伝えること。
- 利用者「（店舗診断は）SEO 診断に比べてちゃっちくないか。これがクイック診断の限界か」→ **限界ではなく設計の穴**と回答。数字で確認したところ、クイック診断（店舗）は **21 項目中 12 項目・100 点中 62 点分しか測れていない**（未取得 9 項目 = 説明文 4 / 開業日 1 / メニュー 3 / 投稿頻度 6 / 投稿のキーワード 4 / 写真の投稿頻度 4 / ロゴとカバー 4 / 口コミへの返信 6 / 返信率 6）。さらにサイト版にある**優先改善リスト**と**採点基準の付録**が MEO 版には無い。
- 提案 A〜E のうち、利用者の指示は「**B・C・D・E をお願いします。D / E は精密診断の方でやる**」。→ B（優先改善リスト）と C（採点基準の付録）はクイック診断・精密診断の両方、D（口コミの傾向分析）と E（NAP 整合チェック）は精密診断だけ。A（その場で答える 9 項目）は見送り。残タスク #72〜#75 に記録した。
- **r52（B・C）**: MEO 報告書に 2 つ足した。
  - **優先改善リスト**（3 節、クイック診断・精密診断の両方）: 「配点 × 現状」で戻ってくる点数の大きい順に並べ、いまの状態とやること、`+6 点` の見込みを出す。先頭に「上の 3 つを直すと 43 点 → 81 点」。純粋関数 `src/lib/maps/improvements.ts`。
  - 未取得の 9 項目は点数が動かないのでリストに出さず、「**オーナーにしか分からない 9 項目（配点 38 点分）**」としてまとめる。クイック診断ではそのまま精密診断（初月無料）への導線になる。
  - **付録「採点方法と基準」**（両方）: 全項目の配点と合格・注意の条件を開示。しきい値は `score.ts` / `owner-input.ts` の定数から組み立て、付録だけ古くならないようテストで固定（`criteria.test.ts`）。
  - ついでに「口コミの新しさ」の助言が v1 の「1 年以上」のままだったのを、しきい値（90 日）から作るよう直した。
- **r53（D・E。精密診断のみ）**: どちらも Google への追加の呼び出しは無し（API 費用ゼロ）。新しい API は `GET /api/maps/insights?placeId=…`（ログイン + maps 機能が要る）。
  - **口コミの傾向**: Places は 1 回に最新 5 件しか返さないので、**保存済みの報告書（毎週）から口コミを集めて重複を除く**。よく出る語（その語を含む口コミの件数と平均評価）、褒められている点、不満のサイン、低評価の実例、集めた期間を出す。形態素解析も生成 AI も使わない（漢字 2 文字以上・カタカナ 3 文字以上・英字 3 文字以上を語として数え、一般語は除く）。
  - **サイトとの表記ゆれ（NAP）**: 登録サイトを自分のクローラで 1 ページ読み、JSON-LD（LocalBusiness ほか）→ 本文の順に店名・住所・電話を読み取って Google の登録内容と突き合わせる。正規化は基本情報掲載と共通（全角・ハイフン・「日本、〒」の違いは一致とみなす）。6 時間キャッシュ。取得できないときは理由を出して診断自体は止めない。
  - lint / tsc / test（1,532 件）/ build 通過。本番ビルドの画面で、優先改善リスト・付録・口コミの傾向・表記ゆれの表示を確認した。
  - **効き始めるのは次回の一斉更新から**（口コミの傾向は保存が貯まるほど厚くなる）。表記ゆれは登録サイトがある店舗だけ出る。
- 利用者「タブの並びを SEO → MEO → AIO にしてほしい。お客様に渡すクイック診断はログイン画面からアクセスできないように（消してください）。課金してるのがばかばかしくなってしまいます。HP からも無料診断はできないように。基本、無料診断はユーザーからは触れないように」→ **r54**。
  - サイドバーのタブ順を `FEATURE_CATEGORIES` で SEO → MEO → AIO に変更（テストで固定）。
  - サイドバーの「お客様に渡すクイック診断」ブロックを削除。
  - **ログイン済みでクイック診断（`/` `/meo`）を開くと `/start` へ戻る**（`FreeHeaderActions`）。未ログインの相手には今までどおり開くので、渡した URL は使える。
  - 紹介サイト: ヒーロー・配点セクション・最後の CTA・追従 CTA・フッターの「アプリを開く」・料金の無料カード・JSON-LD の無料 Offer・ナビの「クイック診断」表記を、すべて申し込み（`/sign-up`）と料金（`#price`）に置き換え。FAQ「登録は必要ですか」は「申し込みに必要なものは何ですか」に書き換え。料金カードが 1 枚になったのでレイアウトも中央 1 列に。
  - `llms.txt` からクイック診断の URL を削除（AI にも案内させない）。
  - `robots.txt` は `Disallow: /` + 規約類だけ `Allow`、`sitemap.xml` も規約類だけに。アプリ側は検索から見つからない。
  - 料金プランの「クイック診断（無料）」は **「未契約」** に変更（ツールが使えない状態であることを明記）。
  - lint / tsc / test（1,533 件）/ build 通過。本番ビルドでサイドバーの並びとブロックの消滅、紹介サイトの CTA とリンク切れが無いことを確認。

### 2026-09-13（SEO 分析ツールの方針見直し）

- 利用者の指示: 「連携（GSC / GA4）を前提にしない。顧客は WordPress を外注していて把握していない。無料・安い API の指標を見やすくまとめ、そこから言えること・コンサルが言いそうなこと・改善案・現状分析を AI（Claude 主、ChatGPT 最新モデル）に書かせる。無料診断の範囲は含めつつ、内部リンク数などサイト構成の指標を足して差別化し、回数制限つきの『パワーアップ分析』にする。しょうもないコンサルを廃絶したい」。
- [seo-analysis-spec.md](./seo-analysis-spec.md) に **§0（方針の見直し）** を追加: §0.1 連携なしで取れる指標の表（テクニカル 48 ルール / **サイトの構成** = 被内部リンク数・クリック深度・PageRank 風の重要度・本文内リンクとナビの区別・アンカーテキスト・行き止まり・カニバリ・鮮度 / **信頼** = 会社情報・特商法・著者・NAP 一致 / CrUX は**所有権不要**の公開データ / PSI / SerpApi / サジェスト / HTTP ヘッダ）、§0.2 パワーアップ分析の流れ（収集 → 事実シート JSON → AI の 6 工程 → 報告書 PDF + 履歴 + 差分。**AI は事実シートしか見ない**、主張は指標 ID を引用、数値の照合）、§0.3 決めてもらうこと 6 点。§14 / §17 は任意の層向けに格下げ。
- 既存の材料: `AuditPage.internalLinks`（発リンク）はあるので被リンク数と深度の集計を足せばよい。ChatGPT は LLMO の `src/lib/llmo/providers/openai.ts`（Responses API）を流用。回数制限は Supabase に `analysis_runs`。
- コードは書いていない。§0.3 の回答待ち。

### 2026-09-14（パワーアップ分析 A′: サイトの構成・信頼の手がかり）

- 利用者が §0.3 の 6 点をすべて推奨案で決定し、「最終的には個々の分析結果をもとに AI の分析を見られるようにしたい」と追加。spec §0.2b に設計原則として記録。
- **A′ を実装**（ブランチ `claude/seo-analysis-tool-spec-b6gq4x` の先頭コミット）:
  - `src/lib/audit/extras.ts`（新規）: リンクごとの本文 / ナビ判定・nofollow・アンカーテキスト（画像は alt）、hreflang、OG 3 項目、パンくず（BreadcrumbList かクラス・aria-label）、公開日・更新日（meta → JSON-LD → time、和暦なしの日本語表記も可）、著者、電話（0 始まり 3 区切りか +81。日付・郵便番号は混ざらない）、住所（〒か都道府県 + 市区町村）、メール、Organization 系 JSON-LD（type・電話・住所・sameAs）。`AuditPage` に同名の項目を追加（ルールは参照しない）。
  - `src/lib/seo-analysis/`（新規）: `structure.ts`（被リンク / 本文からの被リンク / 発リンク / nofollow、PageRank 風の重要度 0〜100、クリック階層の分布、行き止まり・到達不可、被リンクの集中、汎用アンカー「こちら」「続きを読む」等の割合と実例、種別ごとの数、パンくず・OG・hreflang の網羅、鮮度、同じ title / h1 のページ、集客に効くのにリンクが弱いページ）、`trust.ts`（会社・問い合わせ・プライバシー・特商法・Organization・電話・住所・NAP 一致・著者の 9 判定。pass / warn / fail / info と根拠の 1 行）、`kinds.ts`（URL の区切り → title / h1 の語 → JSON-LD → 公開日の順でページ種別）。
  - サイト診断の結果 `AuditResult.structure` / `.trust`（任意項目。古い履歴は壊れない）、ページ一覧の行に `importance` / `inContentInlinks`。画面は `src/components/seo-analysis/StructureCard.tsx` / `TrustCard.tsx` をカテゴリ表の下に追加。
  - テスト 4 ファイル追加（抽出 14 件・種別 4 件・構成 9 件・信頼 4 件）+ E2E に 2 件。**lint / tsc / test（123 ファイル・1,565 件）/ build 通過**。E2E のダミーサイトではトップの重要度が 97（全ページのナビから /contact 等にもリンクがあるため）。
- **利用者側の作業は無し**。マージの指示待ち（「入力待ち」）。次は B′。
- 利用者「メインにmergeして」→ origin/main を取り直し、早送りでマージ → `add-release.mjs` で **r55** → main で lint / tsc / test（1,565 件）/ build を通してから push。Vercel が自動デプロイする。本番の `/tools/site-audit` で「サイトの構成」「信頼の手がかり」のカードが出れば反映済み。次は B′。

### 2026-09-14（パワーアップ分析 B′〜E′ を一気に実装、r56）

- 利用者「一気に実装してメインにマージしてください。確認事項がなければ」→ 確認事項なしで B′ → C′ → D′ → E′ を実装し、lint / tsc / test（**129 ファイル・1,590 件**）/ build を通して main に早送り（**r56**）。
- **B′ 事実シート + AI 分析 + 報告書 + 回数制限**:
  - `src/lib/seo-analysis/sheet/`: `SeoFactSheet`（入力 / サイト = クロール統計・重要度別・カテゴリ別・上位ルール 15 と実例・構成・信頼・クイック診断 / 速度 = PSI 6 ページ + CrUX / 検索 / Google 連携 / coverage）と `facts`（1 行 1 事実、`I-01` `C-01` `S-01` `T-01` `P-01` `R-01` `G-01` の連番。最大 400 行）。`factsFromAudit` はサイト診断だけから facts を作る（画面ごとの AI 分析用）。
  - `src/lib/seo-analysis/ai/`: `analyze.ts` = Claude（`LLM_MODEL`、max_tokens 8192、構造化出力 `AnalysisSchema` = 結論 / 現状分析 2〜6 段落 / 強み・弱み（事実 ID つき）/ 改善案 5〜15（優先度 1〜3・何をどう変える・なぜ・期待・手間・書き換え案 before/after）/ コンサルの視点（typical / real）/ 断定できない点）。**AI は facts だけを読む**。`verify.ts` = 本文の数値（4 以上か小数。年は除く）が facts に無ければ、無い数値と ID を挙げて 1 回だけ作り直し、それでも残れば `unverifiedNumbers` として画面に注意。存在しない事実 ID は落とし、引用の無い強み・弱みは捨てる。`second-opinion.ts` = ChatGPT（OpenAI Responses API、`OPENAI_MODEL` 既定 gpt-5、json_schema strict）に同じ facts と Claude の改善案を渡し、同意 / 食い違い / 追加だけを返させる。
  - `runs.ts`（Supabase `analysis_runs`。user_id で絞る）、`quota.ts`（今月 JST の行数。既定 10、`SEO_ANALYSIS_MONTHLY_LIMIT`、`ADMIN_EMAILS` は無制限）、`limits.ts`（1 収集につき AI 分析 3 回まで）、`gate.ts`（クロールの同時実行をサイト診断と合算で 2 本）。
  - API: `POST /api/seo-analysis/collect`（NDJSON。クロール → クイック診断 → PSI / CrUX / SerpApi / Google を並行 → 事実シート → 保存。回数はここで消費）、`POST …/analyze`（Claude）、`POST …/second-opinion`（ChatGPT）、`GET /api/seo-analysis`（履歴 + 残り回数）、`GET/DELETE …/[id]`、`POST …/comment`（画面ごとの短い分析。facts を受け取る。回数の対象外）。収集と AI を分けたのは Vercel の 300 秒に収めるためと、同じシートで AI だけやり直せるようにするため。
  - 画面 `src/components/seo-analysis/`: `SeoAnalysisView`（URL 必須、キーワード 5・業種・目的・地域・ブランド名・競合 2 は任意、上限 50〜300 ページ、残り回数、進捗、履歴）、`ReportView`（KPI 4 枚 → 結論と現状分析 → 改善案（優先順）→ 強み・弱み → コンサルの視点 → セカンドオピニオン → 速度カード（Origin の LCP / INP / CLS + 40 週の Sparkline + 6 ページの表）→ 付録の事実シート。すべての主張に事実 ID のチップ、PDF）、`AiCommentCard`（サイト診断の下に「AI に分析させる」。この画面の facts だけで要約・ポイント・次にやること）。registry に `seo-analysis`（診断グループ・SEO タブ・**pro**・requires supabase + anthropic）。
- **C′ CrUX**: `src/lib/crux/`（`records:queryRecord` / `records:queryHistoryRecord`。キーは `CRUX_API_KEY` → `PAGESPEED_API_KEY`。URL → Origin → データ不足の 3 段、6 時間キャッシュ、区分の境界は Google のとおり）。
- **D′ SerpApi**: `search.ts`（キーワードごとに `num=100` モバイル 1 回、`site:host` 1 回、ブランド名 1 回。ブランド名は入力 → トップの title のサイト名。競合の順位も同じ結果から）。
- **E′ Google 連携**: `google.ts`（連携先の Search Console が分析対象と同じドメインのときだけ 28 日の合計・前期間・上位クエリ / ページ 10 件。GA4 はチャネル別の合計から Organic Search を抜き、ランディングページ 10 件）。URL Inspection は未実装。
- **判断**: 回数は「収集」で消費（クロールと SerpApi の実費が出るため）。AI 分析のやり直しは 1 収集 3 回まで無料。PSI は API キー無しでも呼ぶ（既存ツールと同じ。回数制限で落ちたら注記）。CrUX は所有権不要なので誰のサイトでも引ける。
- **利用者側の作業**: #78 の表（Supabase の SQL、Chrome UX Report API の有効化とキーの制限、本番で 1 回実行）。**本番でまだ 1 度も動かしていない**（この環境には API キーが無い）。最初の 1 回で AI の出力の質とトークン量（Opus で入力 1〜2 万・出力 5 千前後の見込み）を見て、プロンプトと `MAX_FACT_LINES` を調整する。

### 2026-09-15（パワーアップ分析の設定）

- 利用者が Supabase の SQL Editor の画面を共有。実行されていたのは **09-11 の SQL**（`review_forms.translations` / `review_responses.lang` / `listing_profiles`。`if not exists` なので再実行は無害）で、`analysis_runs` は未作成。エディタを空にして r56 の SQL（「パワーアップ分析の実行記録」）を貼って Run するよう案内（#78 の 1）。完了の連絡待ち → 次は Chrome UX Report API の有効化とキーの制限（#78 の 2・3）→ 本番で 1 回実行（#78 の 4）。
- 09-15 11:36 利用者が `analysis_runs` の SQL を実行（Success. No rows returned）。**#78 の 1 完了**。次は 2（Chrome UX Report API の有効化）→ 3（キーの制限追加）→ 4（本番で 1 回実行）。
- 09-15 11:39 利用者が API キー「PageSpeed Insights (seo-checker)」の編集画面を共有（API の制限 = 1 個: PageSpeed Insights API、アプリケーションの制限 = なし）。ドロップダウンには有効な API しか出ないので先に手順 2 を、と案内。「アプリケーションの制限: なし」は Vercel の IP が固定されないためそのままでよい。
- 09-15 利用者「終わりました」= **Chrome UX Report API が有効（#78 の 2 完了）**。残りは 3（キーの「API の制限」に Chrome UX Report API を追加して保存）と 4（本番で 1 回実行）。

### 2026-09-15（外部連携をマスター画面へ）

- 利用者「設定にある外部連携はユーザーに見える必要はない。マスターアカウントだけが把握していればいい」→ **r57**: `IntegrationsCard` を `src/app/settings/SettingsView.tsx` から `src/components/admin/IntegrationsCard.tsx` に移し、`/admin` の「動いているコミット」の下に表示。registry の設定の見出しを「プロジェクト・競合・Google 連携」に、README / ARCHITECTURE も更新。lint / tsc / test（1,590 件）/ build 通過、main に早送り。
- 残っている「お客様に見える環境変数名」: 各ツールの `SetupNotice`（キー未設定のときに変数名を出す案内）と、サイドバーの「要設定」バッジ。運営者がキーを揃えていれば出ないので、いまは据え置き。隠すなら「この機能は準備中です」の文言に差し替える（半日）。

### 2026-09-15（サイト診断をパワーアップ分析に統合、r58）

- 利用者「パワーアップ分析・サイト診断・ページ診断の違いは？同じなら統合して」→ 違いを説明したうえで **サイト診断を統合（r58）**:
  - registry の `Feature` に `hidden` を追加。`site-audit` は `hidden: true`（サイドバーに出ないが、プランのゲートと `/api/site-audit` は残る）。`groupsForSidebar` が hidden を落とす。`/tools/site-audit` は `/tools/seo-analysis` へ `redirect`。`/start` の最初のツールとオンボーディングの案内もパワーアップ分析に。
  - 収集の戻り値に `AuditResult` を足し、`analysis_runs.audit` 列に保存（**SQL 1 行を利用者が実行**: #78 の 1b）。列が無ければ `runs.ts` が 400 を受けて `audit` 無しで保存し直す（止めない）。
  - 報告書に「詳細: サイト診断（クロールの全結果）」カード。折りたたみで、カテゴリ表・サイトの構成・信頼の手がかり・課題一覧（CSV）・ページ一覧を既存の `site-audit` の部品で表示。印刷時は展開。
  - ページ診断は「ページ診断（競合比較）」に改名し、説明で「サイト全体を見るパワーアップ分析とは違い、1 語で勝つために足りないものを 1 ページ単位で深掘り」と明記。
  - lint / tsc / test（1,590 件）/ build 通過、main に早送り。
- **利用者側の作業**: #78 の 1b（`alter table analysis_runs add column if not exists audit jsonb;`）→ 3 → 4。
- 09-15 利用者が `alter table analysis_runs add column if not exists audit jsonb;` を実行（Success）。**#78 の 1b 完了**。「他にやることは？」→ 残りは 3（キーの制限に Chrome UX Report API を追加）と 4（本番で 1 回実行）。それ以外の必須作業は無し。任意: `OPENAI_API_KEY`（LLMO で登録済みならそのまま使われる）、`SEO_ANALYSIS_MONTHLY_LIMIT`。
- 09-15 利用者が API キーの「API の制限」で Chrome UX Report API にチェックした画面を共有（「もうできてます」）。OK → 選択中の API が 2 つ → 「保存」まで押すよう念押し。**#78 の 3 完了扱い**。残りは 4（本番で 1 回実行）。

### 2026-09-15（本番で初回実行 → AI 分析の不具合を修正、r59）

- 利用者が本番 `/tools/seo-analysis` で `https://wolf-g.jp/company`（キーワード LLMO、目的 = 問い合わせ）を実行し画面を共有。**収集は成功**（63 ページ、課題 78 件 = 重大 1 / 警告 65 / 情報 12、CrUX サイト全体 LCP 1.1 秒 良好・CLS 0.00 良好・INP データなし → CWV 判定不能、URL 単位は全部データ不足、PSI Performance 57〜65、事実シート 67 行、今月 0 回 = 運営者無制限）。**AI 分析は「AI の処理中にエラーが発生しました」で失敗**。検索順位は未取得（Vercel に `SERPAPI_KEY` が無い。サイドバーの順位計測も「要設定」）。
- 原因: `@anthropic-ai/sdk` の `zodOutputFormat` は zod の `max` / `min`（文字数・件数・数値範囲）を API に送らず説明文のヒントにするだけ（`lib/transform-json-schema.js`）。AI が 1 件でも超えると `helpers/zod.js` の `safeParse` が落ちて `AnthropicError`（APIError ではない）になり、`toApiError` の既定文言（500）になっていた。手元では `zodOutputFormat(AnalysisSchema)` 自体は通る（テストで確認）ので、本番の出力が上限を超えたと判断。
- **r59**: `ai/schema.ts` から上限を外し、`tidyAnalysis` / `tidyComment` / `tidySecondOpinion` で受け取り後に切り詰める（`LIMITS`）。`priority` は 1〜3 に丸める。`toApiError` に `AnthropicError` の分岐を追加（502「AI の出力が想定の形と違いました。もう一度お試しください」+ 検証内容を `console.error`）。テスト 4 件追加（上限超えの出力が parse を通り、切り詰めで収まること）。
- 画面のサイドバーに「サイト診断」が残っていたのは、その時点で r58 が未反映（デプロイ待ち）だったため。リロードで消える。
- **次**: 利用者が同じ画面で「AI 分析をやり直す（0 / 3）」を押す（再収集は不要）。結果を見てプロンプト調整。任意: Vercel に `SERPAPI_KEY` を入れると順位・site: 件数・ブランド検索が事実シートに加わる（LLMO の順位計測と共用）。
- 利用者「SERPAPI_KEY、これやります」→ #79 として手順表（登録 → キー → Vercel → Redeploy → /admin で確認 → 再実行）を案内。
- 09-15 利用者が Vercel に `SERPAPI_KEY`（Production、Sensitive）を登録 → Redeploy → `/admin` の外部連携で SerpApi「設定済み」を確認。**#79 の設定完了**。順位計測・AI Overviews 引用・ページ診断の上位 10 件・AIO 頻出トピック・パワーアップ分析の検索順位が使える。残りは本番でパワーアップ分析を再実行（r59 の AI 分析の確認を兼ねる）。


### 2026-09-15（ドメインパワーの計測を追加、r60）

- 利用者の依頼「domain パワーについても計測できるようにしてください」。
- **方針**: Ahrefs の DR・Moz の DA は有料の被リンク API が要る（月 1 万円〜）ので使わない。このツールの方針（無料・安い API を束ねて AI に語らせる）どおり、**無料で取れる 8 指標を配点して 0〜100 の推定値**にした。数字の一人歩きを防ぐため、合計点だけでなく**指標ごとの得点・実測値・判定根拠・出どころ**を報告書に必ず開示し、「Ahrefs の DR や Moz の DA とは別物」と画面にも AI のプロンプトにも書いている。
- **配点**（`src/lib/domain-power/types.ts`）: 外部からのリンクの評価 25（Open PageRank）／ドメインの年数 15（RDAP）／インデックス数 15（`site:`）／対策キーワードの順位 15／ブランド名検索の順位 10／実ユーザーの規模 10（CrUX にデータがあるか）／サイトの規模 5／信頼の手がかり 5。
- **取れない指標は分母から外す**（キー未設定のサイトが不当に低く出ないように）。ただし採点に使える配点が 30 点未満なら合計点は出さず「指標が足りません」と表示する（2〜3 指標で「90 点」と出すのは嘘になるため）。
- **新しい外部 API は 2 つ**。どちらも無料で、無くても報告書は完成する。
  - **RDAP**（`rdap.org` 経由。キー不要）: ドメインの登録日 → 年数。RDAP に対応していない TLD は 404 が返るので「未取得」にして続行する（#81 で本番の `.jp` を確認）。
  - **Open PageRank**（`OPENPAGERANK_API_KEY`。無料枠 1 日 1,000 リクエスト）: Common Crawl のリンクグラフから出た 0〜10 の評価。**このツールで唯一、外部からの被リンクを見ている指標**なので配点が一番大きい。手順は「Open PageRank を有効にする手順」（#80）。
- 残りの 6 指標は**すでに集めている数字の使い回し**なので、API の実費は増えない（SerpApi の検索回数も増えていない）。
- 競合 URL を入れると「競合との比較」に自社 + 競合 2 件の **Open PageRank と登録年数**だけを並べる（競合はクロールしないので、この 2 つしか同じ条件で比べられない）。
- 画面: パワーアップ分析の報告書に KPI「ドメインパワー（推定）」と「ドメインパワー（推定）」カード（ゲージ + 指標ごとの横棒 + 内訳の表 + 競合比較）。事実シートに領域 `domain`（ID は `D-01`〜）が増え、AI はこれを引用して分析を書く。
- 検証: lint / tsc / test（1,627 件）/ build 通過。ドメインパワーのテストは 32 件（登録ドメインの取り出し・年数・配点・合計・RDAP と Open PageRank の応答の読み取りと失敗時の扱い）。
- **次**: いまのキーの状態（SerpApi 設定済み・Open PageRank 未設定）なら、外部リンクの評価（配点 25）以外の 7 指標（配点 75）で採点する。#80 の Open PageRank を入れると 8 指標すべてが埋まる。

### 2026-09-15（自動診断・コンサル回答生成の仕様書を受領、#82）

- 利用者から「Web サイト自動診断・コンサル回答生成システム仕様書」（GSC / GA4 / CRM を取り込み、集計とパターン判定はプログラム、説明文は LLM、承認は人間）を受領。**正本を [diagnosis-rules-spec.md](./diagnosis-rules-spec.md) に取り込んだ**（§1〜§25 が受領した仕様そのまま、§26〜§28 が Claude の追記）。コードは触っていない（ドキュメントのみ）。
- **現状との差分（§26）**:
  - 診断ルール（D / T / Q / P / V / G / U / S / A / L / E / K / M / X / B = 約 120 件）は**1 件も実装されていない**。既存の `src/lib/audit/` の 48 ルールは**クロールした HTML** に対するテクニカル SEO のルールで、GSC / GA4 の数字は見ていない別物。
  - 取り込みは GSC が有利。`SearchAnalyticsDimension` に `query` / `page` / `date` / `country` / `device` が既にあるので V01〜V05・G01〜G07 の材料は揃う。**足りないのは「検索での見え方」（searchAppearance）**（S01〜S04 用）と、**GA4 のイベント別取得**（K01〜K12・M01〜M10 用）。
  - **LLM 側はほぼ出来ている**。事実シート（`Fact` に ID を振って AI に引用させる）・Structured Outputs・数値の照合（`verify.ts`）・セカンドオピニオンはパワーアップ分析（r56〜r60）のものをそのまま使える。足りないのは AI 出力スキーマの `confidence` と、§16 の必須ルール 18 件、§17 の出力項目。
  - ログ・再現性（§20）は `analysis_runs` があるが、**ルールバージョン・閾値バージョン・プロンプトバージョン・人間の修正内容・承認者の列が無い**。
  - 個人情報（§19）: 今は集計値と URL しか LLM に渡していないので問題なし。**CRM を入れる時点で匿名化の層が必須**になる。
- **いちばん大きい論点（§26.8）**: 09-13 に利用者が決めた「**連携を前提にしない**」方針（seo-analysis-spec.md §0）と、この仕様書の「GSC / GA4 が揃っている前提」はぶつかる。矛盾ではなく**対象が違う**と整理した。パワーアップ分析 = URL だけ・サイトの作り・新規のお客様の入口 / この診断 = 連携済み・数字の動き・**継続コンサルの月次報告**。共通化するのは事実シート・AI の検証・`analysis_runs` の 3 つだけにして、二重に作らない。
- **実装の段階（§27）**: G1 正規化と基本計算 → G2 GSC の取り込み → G3 ルールエンジン + D と GSC の約 75 件 → G4 GA4（イベント名の共通化つき）→ G5 連携ルールと優先度スコア → G6 LLM 統合と報告書 → G7 人間による確認 → G8 CRM と匿名化。ルールは**宣言（データ）とエンジン（純関数）に分ける**ので、ルールを足してもコードは増えない。テストは §23 をそのまま `__tests__` にする。
- **次**: §28 の 8 件（特に ① 入口を Google 連携にするか CSV にするか、② パワーアップ分析とは別ツールにするか、③ 初期リリースの範囲）を利用者に決めてもらってから G1 に着手する。

### 2026-09-15（自動診断のルールエンジンを実装、r61）

- 利用者の判断「既存の Google 連携（OAuth）を第一にし、CSV アップロードはしない。パワーアップ分析と同義。3（初期の範囲）は了解」→ **G1・G2・G3・G6 を実装**（#82）。
- **置き方**: 別ツールにせず、パワーアップ分析（`/tools/seo-analysis`）の中に入れた。ただし**パワーアップ分析は「URL だけで動く」のが売り**なので、既存の `google.ts` と同じ**任意の層**にしてある。連携していなければ D05（必須データ不足）だけが発火し、報告書は従来どおり完成する。9/13 の「連携を前提にしない」方針は壊していない。
- **実装（`src/lib/diagnosis/`）**:
  - `thresholds.ts`: 仕様 §8 の 20 個の閾値 + **目的別プリセット**（問い合わせ / EC / 採用 / 来店 / メディア）。BtoB では指名検索とトップ集中が普通なので基準を緩め、EC では逆に厳しくしている。
  - `metrics.ts`: §7 の計算（増減率・CTR・エンゲージメント率・CTA クリック率・フォーム開始率／完了率・Organic CVR・クエリ取得率・指名検索比率・中央値）。**前期 0 は「新規発生」で増減率を出さない**、**行別 CTR の平均を使わない**、**分母 0 は 0% ではなく null**、をテストで固定。
  - `normalize.ts`: §6 の URL 正規化。**統合するもの**（http/https・www・大文字小文字・フラグメント・UTM・末尾スラッシュ）と**統合しないもの**（`.html` の有無・言語パス・ページネーション・ID）を分け、後者は「揺れている」事実だけ出して人間に確認してもらう。クエリの意図分類（費用・導入・事例・比較・とは・問題・採用・サポート・地名）も。
  - `sources/gsc.ts`: 当期・前期 × 日付／クエリ／ページ／デバイス／国 と、**検索での見え方**（`searchAppearance` を `SearchAnalyticsDimension` に追加）。取得に失敗しても例外を投げず notes に残す。
  - `engine.ts`: 派生値を作る → 全ルールに `evaluate` させる → **優先度スコア（重要度 × 影響量 × 確度 ÷ 実装負担）**で並べる。1 つのルールが例外を投げても診断は止まらない。`RULES_VERSION` / `THRESHOLDS_VERSION` を結果に入れる（§20 の再現性）。
  - `rules/`: **79 ルール**を宣言（データ品質 12 / 時系列 12 / クエリ 20 / ページ 14 / デバイス・国 9 / URL 8 / 見え方 4）。§22 の初期リリース推奨（75 件）を満たす。1 ルール = 1 オブジェクト（条件・重要度・確度・事実・原因候補・確認事項・打ち手・**書いてはいけない結論**）なので、ルールを足してもエンジンのコードは増えない。判定に追加データが要るものは `PENDING_RULES` に理由つきで並べ、画面に「データが揃えば判定できる項目」として出す。
- **API の呼び出しは増えていない**。`google.ts` を `collectGscDataset` に付け替え、**1 回の取得を事実シートと診断の両方で使う**ようにした（GSC API は無料だが、呼び出し回数と待ち時間を二重にしない）。
- **LLM 統合（G6）**: 事実シートに領域 `diagnosis`（ID は `N-01`〜）を追加。発火ルール 1 件 = 1 行で、根拠の数値と「書いてはいけないこと」を note に入れる。AI のプロンプトに §16 の必須ルール（平均掲載順位で断定しない・クエリ取得率・GSC だけで訪問後を語らない・母数が小さければ確度を下げる・アクセス増と売上増を同一視しない、ほか）を追加し、発火ルールの上位 8 件を事実シートとは別に先出しする。
- **画面**: 報告書に「数字の診断（Search Console の推移）」カード（`DiagnosisCard`）。**AI を通さない機械的な出力**として、母数・発火項目（重要度バッジ + 根拠の 1 行目）・展開すると原因候補／確認が必要なこと／打ち手／**この数字から言ってはいけないこと**／対象、そして「判定していないこと」と「データが揃えば判定できる項目」を並べる。印刷時は全部開く。
- **検証**: lint / tsc / test（**1,709 件**。診断のテストは 82 件 = §23 の数値テスト・診断テストをそのまま実装）/ build 通過。
- **次**: G4（GA4 のルール 40 件。イベント名の共通化 §5 の対応表を設定画面に置く必要がある）→ G5（GSC × GA4 の 20 件）→ G7（人間による承認）→ G8（CRM）。
- **利用者の作業は無し**。すでに Google 連携していれば次回の分析から自動で出る。連携していなくても報告書は従来どおり出る（「Search Console と連携していないため判定していません」と明記される）。

### 2026-09-16（GA4 の診断ルールとイベント名の共通化、r62）

- 利用者「とりあえず GA4 をすすめておいて」→ **G4 を実装**（#82）。これで診断は **126 ルール**（GSC 79 + GA4 47）。
- **GA4 の 47 ルール**: 集客 A01〜A10（10）／ランディングページ L01〜L08・L10（9）／エンゲージメント E01〜E05・E07〜E10（9）／CTA・フォーム K01〜K09・K11・K12（11）／計測 M01〜M05・M07・M09・M10（8）。
- **いちばん価値があるのは K 系**（問い合わせまでの流れ）。「訪問 → 読まれた → ボタンを押した → フォームを開いた → 送信した」のどこで落ちているかを切り分ける。K04（ボタンは押されるがフォームが開かれない）と K05（開くが送信されない）は重要度 critical。
- **イベント名の共通化（§5）**: 会社ごとに GA4 のイベント名が違う問題を、3 段構えで解いた。
  1. **自動判定**（`events.ts`）: `contact_click` / `inquiry_button` / `generate_lead` / `資料ダウンロード` などを 7 つの共通イベントに自動で当てる。日本語のイベント名にも対応。`page_view` / `scroll` など GA4 が自動収集するものは除外。**利用者が何もしなくても、よくある名前なら動く**。
  2. **手動の上書き**: 設定画面に「GA4 イベントの割り当て」カードを追加（`/settings`）。ボタンを押したときだけ GA4 を 1 回叩いてイベント一覧を読み込み、各イベントを共通イベントに割り当てて保存する。保存先は Clerk の `privateMetadata.googleLink.eventMapping`。人の指定が自動判定より優先される。
  3. **開示**: 報告書の「訪問後の流れ」の下と事実シートに、**どのイベントを何として数えたか**を必ず出す。割り当てが無い段階は 0 ではなく「**未計測**」と表示し、「押されていない」と「計測していない」を混同させない（K01・K06・M03 も同じ考え）。
- **API の呼び出し**: GA4 の取得を `collectGa4Dataset` にまとめ、**事実シートと診断で 1 回の取得を共有**する（GSC と同じやり方）。GA4 Data API は無料。並行実行なので待ち時間もほぼ変わらない。
- **画面**: 報告書の「数字の診断」カードに**訪問後の流れ（ファネル）**を追加。5 段階のセッション数・率・バーを出し、「すべてセッション単位です（イベントの回数ではありません）」と明記。自然検索からの問い合わせ率も出す。
- **エンゲージメント率の出し方を直した**: 以前は GA4 の `engagementRate` 指標をそのまま使っていたが、行ごとの率を平均すると実態とずれるので、`engagedSessions ÷ sessions` で計算するように変えた（§7 の「行別 CTR の単純平均は使わない」と同じ考え）。
- **検証**: lint / tsc / test（**1,762 件**。診断のテストは 134 件）/ build 通過。
- **利用者の作業**: 必須は無し。GA4 を連携していれば次回の分析から自動で出る。ただし **#10（お客様の GSC / GA4 に閲覧権限をもらう）が済んでいないと、お客様のサイトでは診断が動かない**。イベント名が独特なサイトでは、設定画面の「GA4 イベントの割り当て」で 2〜3 分の作業をすると K 系が動くようになる。
- **次**: G5（GSC × GA4 の突き合わせ 20 件。X02「検索のクリックは増えたのに GA4 のセッションが増えない = 計測が壊れている」など。両方のデータは揃っているので 1〜2 日）。
