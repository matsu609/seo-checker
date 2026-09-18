# 運用メモ・引き継ぎ（OPERATIONS）

**このファイルだけを読めば、誰でも（次の Claude Code セッションでも、別の開発者でも）作業を引き継げる**ことを目的にした記録です。コードではなく「いまどういう状態で、何が決まっていて、何が残っているか」を書きます。

## このファイルの使い方（更新ルール）

- **利用者とのやり取りのたびに、作業の最後に必ず更新して main に push する**（利用者の指示。2026-09-10）。
- 更新はドキュメントだけなので、作業ブランチ・4 つの検証・`add-release.mjs` は不要。**main に直接コミット**してよい（メッセージは `運用メモを更新（YYYY-MM-DD）`）。コードを触った場合は従来どおりブランチ → 検証 → マージ → `add-release.mjs`。
- **秘密の値（`sk_`、`GOCSPX-`、API キー、パスワード）は絶対に書かない。**変数名と「設定済み / 未設定」だけを書く。
- 利用者への作業依頼は、手順ごとに**サービス名・画面名・URL**を必ず書く（利用者の指示。表: # / サービス・画面 / URL / やること）。よく使う URL は下記「よく使う画面の URL」。
- 「現在の状態」「残タスク」「入力待ち」は常に最新に書き換える。「判断の経緯」「作業ログ」は追記する。
- 読む順番（バックエンドの仕組みを把握したいとき）:
  1. **[scoring-reference.md](./scoring-reference.md)** — このサービスが出すすべての数字（配点・閾値・計算式・してはいけない解釈）。**まずここ**
  2. [tool-map.md](./tool-map.md) — どのツールがどの API キーでつながっているか、キーが切れると何が止まるか
  3. [services.md](./services.md) — GitHub / Vercel / Cloudflare / Clerk / Supabase / Google Cloud の全体像
  4. [ARCHITECTURE.md](./ARCHITECTURE.md) — 開発規約とディレクトリ、[README](../../README.md) — 機能の説明
- Google の審査対応: **[google-oauth-verification.md](./google-oauth-verification.md)** — OAuth 本番公開審査（#13）で落ちる理由の類型と、こちらの現在地・申請の順番・デモ動画の中身
- ブラウザ操作エージェントに渡す作業プロンプト: **[chrome-prompts.md](./chrome-prompts.md)**（Search Console のサイトマップ再送信 / Stripe 本番 → Vercel の環境変数 / `DEFAULT_PLAN` の切り替え。秘密の値の扱いと「絶対に守ること」つき）
- **GSC / GA4 を連携なしで代替する設計**: **[gsc-ga4-substitute-design.md](./gsc-ga4-substitute-design.md)** — 利用者の決定「API 費用が上がっても模倣したい」を受けた設計。GSC は代替可、GA4 の行動・CV は**自前タグ**でしか取れない
- 決済の審査対応: **[stripe-checklist-prompt.md](./stripe-checklist-prompt.md)** — Stripe のセキュリティチェックリスト（#84）への回答プロンプトと、回答に使う「サービスの実態」の一覧
- 仕様書: **自動診断（134 ルール）は [diagnosis-rules-spec.md](./diagnosis-rules-spec.md)**、精密診断は [seo-analysis-spec.md](./seo-analysis-spec.md)、口コミ支援は [review-support-design.md](./review-support-design.md)、画面の作りは [design-spec.md](./design-spec.md) / [ui-notes.md](./ui-notes.md)。
- このファイルには重複させず、**状態と判断**だけを書く。

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
| Ahrefs → API キー（無料アカウント） | https://app.ahrefs.com/account/api-keys |
| DataForSEO → ダッシュボード（残高） | https://app.dataforseo.com/api-dashboard |
| Open PageRank（ドメインの外部リンク評価） | https://www.domcop.com/openpagerank/ |
| Claude Console → クレジット | https://platform.claude.com/settings/billing |
| Claude Console → API キー | https://platform.claude.com/settings/keys |
| Clerk ダッシュボード | https://dashboard.clerk.com/ |
| Cloudflare DNS | https://dash.cloudflare.com/ → seo-checker.tokyo → DNS → レコード |
| Google Search Console | https://search.google.com/search-console |
| 本番 → 設定（外部連携） | https://app.seo-checker.tokyo/settings |
| 本番 → Google マップ・店舗情報 | https://app.seo-checker.tokyo/tools/maps |
| 本番 → マスター画面 | https://app.seo-checker.tokyo/admin |
| 本番 → 代理店画面（代理店アカウントで開く） | https://app.seo-checker.tokyo/agency |

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
| GitHub `matsu609/seo-checker` | main = r102 | main に push すると Vercel が自動デプロイ。紹介サイトのソース `marketing/` も同居（09-10 に統合） |
| Vercel `matsumatsu452-6233/seo-checker` | 本番 `app.seo-checker.tokyo` 稼働中 | Hobby プラン |
| Cloudflare | `seo-checker.tokyo` ゾーンを管理。Worker `seo-checker-hp` が紹介サイト（apex）を配信 | `app.` は Vercel へ CNAME（DNS のみ）。**Workers Builds の接続先を旧 `matsu609/seo-checker-HP` からこのリポジトリ（Root directory `marketing`）へ切り替えるのが #29** |
| GitHub `matsu609/seo-checker-HP`（旧・紹介サイト） | 中身は `marketing/` に移設済み。#29 が終わったら役目を終える | 切り替え前にここを消すと紹介サイトが更新できなくなるので、#29 の完了までは残す |
| Clerk（**Production インスタンス**） | 稼働中。`clerk.seo-checker.tokyo` / `accounts.seo-checker.tokyo` | 2026-09-09 に Development から移行完了。DNS 5/5 Verified、SSL 発行済み |
| Clerk（Development インスタンス） | 残存。本番では未使用 | Preview 用に流用する予定（現在 Preview には Clerk のキーが無い） |
| Google Cloud `seo-checker-508104` | OAuth 構成済み（テスト状態） | 下記「Google Cloud の設定」。**r89 以降、要求するスコープは口コミ返信の `business.manage` だけ**（GSC / GA4 は廃止） |
| Google 連携（GSC / GA4） | **提供終了（r89、09-17。利用者の決定「Google Search Console と GA4 は使わない」）** | 画面は代替へ転送、API は 410。代替: 検索パフォーマンス（推定）（r87）だけ。サイト内の行動（訪問者・CV）は外部から取れず、自前タグも r90 で取り下げ。コード（`src/lib/google/search-console/`・`src/lib/ga4/`・`src/lib/site-report/` の大半・`src/components/{search-performance,site-report,ai-traffic,google}/`）は**削除待ち**（下の残タスク #105） |
| アクセス解析（自前の計測タグ） | **取り下げ（r90、09-17。利用者の決定「ツールで完結しないので面倒。やらない」）** | r89 で作った直後に取り下げ。画面は推定へ転送、API と `/t.js` は 410。コードは r93 で削除済み。Supabase の SQL は**実行不要** |
| サイドバーの構成（r94 → r95、09-17） | **「AIO 対策」を親のくくりにし、その中に 3 本の柱を開閉式で並べる（r95）。親の直下 = AI 検索モニタリング / 柱 SEO = 精密診断・ページ診断・HP 改修提案（AIO から移動）・順位計測・検索の推定・キーワード調査・AI ライティング / 柱 MEO = Google マップ・口コミ支援・口コミへの返信 / 柱 サイテーション = サイテーション（新規）・基本情報掲載・llms.txt** | 利用者の指示「本当に必要な機能に絞る」「AIO 対策 = SEO + MEO + NAP 登録・サイテーションの総称」。サイドバーから外した 3 つ: ページ最適化レポート（→ HP 改修提案へ転送）・AIO 頻出トピック（→ AI 検索モニタリングへ転送）・プロンプト拡張（AI 検索モニタリングの設定からリンク）。定義・API・プランのゲートは残る（`hidden: true`） |
| LLMO モニタリング・セカンドオピニオン（OpenAI / Gemini / Perplexity） | **提供終了（r92、09-17。利用者の決定「AI 検索モニタリングに一本化」）** | `/tools/llmo` → `/tools/geo` へ転送、`/api/llmo/run` と `/api/seo-analysis/second-opinion` は 410。**残る契約は Anthropic・DataForSEO・SerpApi・Google（マップ・PageSpeed）・Supabase・Clerk・Stripe**。コードは r93 で削除済み |
| DataForSEO | **接続済み・動作確認済み（09-17）** | `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` を Production に登録。検索パフォーマンス（推定）が実データを返した = Labs `ranked_keywords` のエンドポイントは合っていた（`DATAFORSEO_LABS_RANKED_PATH` の差し替えは不要）。残高はお試し $1 → 動作確認後に $50 入金 |
| Places API（Google マップ） | **コードは完成、キーは設定済み（09-10）。本番で報告書が出ることの通し確認は未（#2）** | 公開情報だけを使うので Google への申請やオーナー権限は不要。オーナー権限が要る項目（投稿・返信率・説明文など 9 項目）はオーナー申告か Business Profile API（#54、審査申請済み）で埋める |
| PageSpeed Insights | キー作成済み（利用者報告） | Vercel への反映・Redeploy は要確認 |
| Anthropic（Claude） | **本番で「未設定」と表示される** | Vercel には `ANTHROPIC_API_KEY` が登録されているのに `process.env` で空。値の貼り直し → Redeploy が必要 |
| Supabase | **プロジェクト・テーブル・Vercel の環境変数まで完了**（`matsu609の組織` / `matsu609のプロジェクト`、Free プラン、ref `qcdkatzxvdgplgibevlc`） | Vercel への環境変数登録と Redeploy は利用者側で作業中。コード（r19）は完成 |
| Business Profile API | **未申請** | フェーズ 3 に必要。Google の審査制 |
| Stripe（直結） | **コードは完成（r41、r63 で 3 段階に）、本番モードの設定と Vercel の環境変数が未了** | 利用者は Stripe アカウント作成済み。#58 の手順（商品・価格 → Webhook → ポータル → 環境変数）。Clerk Billing はドルのみのため使わない。プランは `DEFAULT_PLAN=pro` のまま（r63 の読み替えで `standard` = スタンダードとして動く） |

### Vercel の環境変数（Production）

| 変数 | 状態 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 設定済み（`pk_live_`、Production のみ） | 復号すると `clerk.seo-checker.tokyo` |
| `CLERK_SECRET_KEY` | 設定済み（`sk_live_`、Production のみ） | **要ローテーション**（会話に貼られた） |
| `ADMIN_EMAILS` | `matsumatsu452@gmail.com` | マスター画面の管理者 |
| `DEFAULT_PLAN` | **`free`（09-18 に `pro` から変更、Redeploy 済み。利用者報告）** | Production and Preview。登録した見込み客はツールが開かない。契約者は Stripe か `/admin` の個別開放。運用者（`ADMIN_EMAILS`）は r99 から全ツールを使える |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_LIGHT` / `STRIPE_WEBHOOK_SECRET`（+ 任意で `STRIPE_PRICE_PREMIUM`） | 未設定（本番）。テスト環境は 09-13 に 3 つ登録済み | 決済（r41、r63 で 3 段階に）。#58。`STRIPE_PRICE_PRO` は `STRIPE_PRICE_STANDARD` の旧名として今も読むので、テスト環境の既存の登録はそのままで動く。**ライトを売るには `STRIPE_PRICE_LIGHT` の追加が要る**（未設定ならライトの「申し込む」だけが出ない）。まずテストキー（`sk_test_`）で確認 → 本番キーに差し替え |
| `SITE_MAX_PAGES` | `100` | Production and Preview（一度誤って Preview のみにしたが復旧済み） |
| `ANTHROPIC_API_KEY` | **設定済み**（09-10 17:30 設定画面で「設定済み」を確認） | Claude Console のクレジット購入済み |
| `PAGESPEED_API_KEY` | **登録済み**（利用者報告 09-10 17:4x「AB 完了」）。設定画面での確認は未 | |
| `AHREFS_API_KEY` | **未設定** | ドメインパワーの DR（0〜100。**他社の無料ドメインパワー測定サイトと同じ数値**）。Ahrefs の無料公開エンドポイントで、無料アカウントのキーだけ・API ユニット消費なし。#83 |
| `OPENPAGERANK_API_KEY` | **未設定** | 上の代替（Open PageRank 0〜10）。DR が取れていればそちらを優先。無料。#80。どちらも未設定でも残り 7 指標でドメインパワーは出る（配点 25 点分を分母から外す） |
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
| 110 | **サイテーションの本番確認**（r94）: Vercel の自動デプロイ後、`https://app.seo-checker.tokyo/tools/citations` を開き、MEO の登録店舗から取り込む（または店名・電話・住所を入力）→「調べる」→ 言及しているサイトの一覧と主要媒体の掲載状況が出ること。DataForSEO の検索を 3 回使う（$0.006 前後）。出なければ「使った検索」のエラー文を共有 | 利用者 | 未 |
| 111 | **サイドバーの整理の続き**: r94 で 3 つ外した。さらに減らす候補は ① ページ診断（競合比較。精密診断と役割が近い）② 順位計測（SerpApi）と検索パフォーマンス（推定）（DataForSEO）の一本化 ③ AIO 頻出トピック・ページ最適化レポートの API と `src/lib/aio-topics/` の削除（1〜2 か月後、転送ページと一緒に）。利用者の判断待ち（下の入力待ち） | 利用者（判断）→ Claude | 未 |
| 112 | ~~タブの並び~~ | — | **不要（r95 で 3 タブをやめ、AIO 対策の中に SEO / MEO / サイテーションを入れ子にした）** |
| 113 | **オーナー権限を自然にもらう導線と Performance API**: ① MEO の報告書の下に「Google での見られ方」カード（接続前は「接続すると表示」の枠 + 接続ボタン）→ **完了（r97）** ② 店舗登録直後のオンボーディングで「接続で増えるもの」を見せる → 未 ③ Performance API の取り込み（表示回数・マップ / 検索表示・電話・サイト・ルート・メッセージ・予約の 18 か月、流入キーワードの当月 / 前月 / 伸びた・落ちた TOP3）→ **完了（r97、`src/lib/google/performance.ts`、`/api/maps/performance`）。動くのは Business Profile API の承認（#5）後** | 利用者（#5 の承認待ち・Cloud での有効化）→ Claude（②） | ①③ 完了。②未 |
| 114 | **口コミ返信をツール内で完結させるための「API 以外」の作業**: ① プライバシーポリシー第 5 条に「この権限で行う 3 つの操作」「自動投稿しない」「口コミは保存しない」「解除でトークン削除」を追記 → **完了（r96）** ② 用途説明文（日 / 英）とデモ動画の台本 → **完了（[google-oauth-verification.md](./google-oauth-verification.md) §2・§3）** ③ Clerk のアプリ名 `My Application` → `SEO Checker`（#7）、ブランディングに規約 / ポリシーの URL（#8） ④ 承認後: Google My Business API（v4）の有効化 → `/tools/replies` で接続 → 自分のプロフィールで投稿まで通す → 撮影 → OAuth 審査申請 ⑤ 任意: 新着口コミの通知（Notifications API + Pub/Sub）と Performance API（#113） | 利用者（③④・撮影・申請） | ①② 完了。③④ 未 |
| 115 | **MEO の月次レポート（競合ツールの帳票の再現。2026-09-17 利用者が PDF を共有）**: 審査なし（Places API + 毎週の保存）で作れる部分を先に作る = 新規口コミ数・平均評価（前月比）／ 口コミの成長（月別件数 + 累計平均評価。登録日以降）／ 星別分布（当月。最新 5 件から）／ キーワード順位変動（月初 / 月末。毎週の順位から）／ 口コミの傾向。オーナー権限が要る欄（表示回数・マップ / 検索表示・電話 / サイト / ルート・流入キーワード・返信数と返信率・投稿数）は「接続すると表示」の枠にして、#113 / #114 のあと Performance API と v4 で埋める。PDF 出力は既存の仕組み。目安 3 日 | 利用者（判断）→ Claude | 未 |
| 116 | **Performance API を承認当日に動かすための利用者の作業**: 下の「Business Profile Performance API を使えるようにする手順（#116）」の表 | 利用者 | **09-18: API 3 本を有効化済み。v4 は承認待ち。スコープ完了（非機密）。テストユーザー完了。**残り: Clerk の名前（7）・ブランディング（8）・ケースの督促（6。9/26 以降） |
| 117 | **無料診断の前にユーザー登録、メールアドレスごとに 2 回まで**（2026-09-18 利用者の要望 → GO） | Claude → 利用者 | **コードは完了（r98）**。残りは利用者の作業 = 下の「登録つき無料診断を本番で開く手順（#117）」（Vercel の `DEFAULT_PLAN=free`、既存の契約者の個別開放、Clerk の設定確認、本番で 1 回通す） |
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
| 7 | Clerk: Legal に `/terms` `/privacy` の URL、サインアップ時の同意 ON。アプリ名を `SEO Checker` に。Restrictions で許可リスト／招待制 | 利用者 | **ほぼ完了（2026-09-17）**: Legal の 2 URL と「Require express consent」オンを保存し、開き直して反映を確認（利用者報告）。アプリ名も `SEO Checker`。**残りは Restrictions の Allowlist が有効（ON）になっているかの確認だけ**（識別子を足しただけでは制限が効かないことがある） |
| 8 | Google Auth Platform → ブランディングに利用規約 / プライバシーの URL（`https://app.seo-checker.tokyo/terms` と `/privacy`。Clerk 側は 09-17 に登録済み） | 利用者 | **完了（2026-09-17、利用者報告）**。これで #13（OAuth の本番公開申請）の前提はそろった |
| 9 | 鍵のローテーション: Clerk Production `sk_live_`（Instance → API keys → Regenerate → Vercel 更新 → Redeploy）、Clerk Development `sk_test_`、Google OAuth クライアントシークレット（シークレットを追加 → Clerk に貼り替え → 古い方を無効化） | 利用者 | 未 |
| 10 | GSC / GA4 の権限付与（上記「Google 側のデータの持ち主」）→ 設定画面「一覧を取り直す」→ 検索パフォーマンス・生成 AI 流入分析で数値確認 | 利用者 | 未 |
| 11 | フェーズ 3（承認後）: Business Profile API で 9 項目（r27 ではオーナー申告で埋めている）を API の値に置き換え、インサイト（8 指標・期間比較・CSV・詳細グラフ）を追加 | Claude | 承認待ち |
| 12 | 規約・ポリシーの専門家レビュー。r89 / r90 で第 5 条（Google 連携は口コミ返信のビジネス プロフィールだけ。GSC / GA4 は取得しない）を書き換えた。計測タグの記述は r90 で取り消した | 利用者 | 推奨 |
| 13 | Google OAuth の本番公開申請（**r89 で対象が口コミ返信の `business.manage` だけになった**。GSC / GA4 の機密スコープはもう要求しない。申請文・デモ動画は口コミ返信だけで作り直す）。準備: #6 運営者情報 → 紹介サイト seo-checker.tokyo に説明 + /privacy /terms リンク → Search Console で seo-checker.tokyo の所有確認 → #8 ブランディング URL → 用途説明文（Claude が文案）→ デモ動画 2〜3 分（Claude が台本）→ Google Auth Platform で「公開」→ 審査申請。**テスト中はトークンが 7 日で失効**。それまではテストユーザー（100 人まで） | 利用者 + Claude | 未 |
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
| 39 | **公開前に必須**: Vercel `DEFAULT_PLAN` を `free` に → Redeploy。**順番に注意（2026-09-17 に判明）: 先に Clerk Production → Users → 自分（matsumatsu452@gmail.com）→ Public metadata に `{"plan": "premium"}` を入れてから変えること。**`ADMIN_EMAILS` に入っていてもプランの判定は素通りできない（`src/lib/plans/current.ts` の判定順は Stripe の契約 → `publicMetadata.plan` → `DEFAULT_PLAN` → free で、管理者かどうかは入っていない。マスター画面の「個別開放」は `publicMetadata.featureOverrides` を機能ごとに立てるもので、プランそのものは上がらない）。順番を逆にすると自分が締め出される（戻し方: `DEFAULT_PLAN` を `pro` に戻して Redeploy）。**Claude in Chrome 用のプロンプトは [chrome-prompts.md](./chrome-prompts.md) の C**。Clerk Production → Configure → Restrictions で招待制 / 許可リスト（決済がつながるまで） | 利用者 | **未。明日の公開の A-1 / A-2（下の「明日リリースするための優先順位」）** |
| 40 | クイック診断（店舗）を「要点のみ」に絞る案 B（#69 と同じ論点）: 総合評価・4 カテゴリ・改善点上位 3・口コミの数字だけ表示し、21 項目の一覧・口コミ本文・PDF は「無料登録で開放」。登録後は free プランで /tools/maps に自社 1 店舗（履歴 1 件・一斉更新対象外・競合なし・AI 総評なし） | Claude | 利用者の判断待ち（推奨 B） |
| 41 | 料金: ~~オールインワン 9,800 円（r26）~~ → ~~定価 50,000 円の 1 本 + クーポン割引（r46）~~ → **3 段階に決定（r63、利用者の決定 2026-09-15）**: ライト 38,000 円（診断・計測）／**スタンダード 50,000 円（本命）**（+ AI が改修案・原稿を作成）／プレミアム（伴走）**150,000 円〜・お見積り**（+ 人の作業。月 3 社まで・問い合わせ受付。r65 で「〜」表記に）。実装・文面・紹介サイトまで完了 | 利用者 → Claude | **完了（r63、r64、r65）**。残りは Stripe 側の作業（#58 の 1 と 3）だけ |
| 42 | **商用化前に Vercel を Pro プランへ**（Hobby は非商用限定。月 20 ドル）。Settings → General → Plan | 利用者 | **未。2026-09-17 の画面で Hobby のままを確認。**課金を始める前に必須 |
| 43 | 「特定商取引法に基づく表記」ページ `/legal/tokushoho` | Claude | **完了（r41）**。内容（解約は期間末まで利用可・日割り返金なし・運営責任者「松下」）は Claude の仮置き。利用者が確認して直す点があれば伝える |
| 44 | ~~決済の開始（Clerk Billing）~~ → **Clerk Billing はドルのみのため取りやめ。Stripe 直結（r41、#58）に置き換え** | — | 取りやめ |
| 58 | **決済を有効にする（Stripe 側と Vercel の作業）**（テスト環境は 1〜7 完了。09-13 にテストカードで申し込み → 「契約中 / ¥50,000 / 次回更新 2026-10-13」を確認。**⑧ 本番モードを作業中（Claude in Chrome 用のプロンプトは [chrome-prompts.md](./chrome-prompts.md) の B）: 2026-09-17 01:50 に本番の商品 2 つ「スタンダード ¥50,000 / 月」「ライト ¥38,000 / 月」を作成済み。残りは Price ID の控え → Webhook → ポータル → `sk_live_` → Vercel の環境変数 4 つ → Redeploy → `DEFAULT_PLAN` を `free` に**）: ① 商品と価格（月 9,800 円 JPY）→ ② Webhook → ③ カスタマーポータル → ④ 公開事業者情報に特商法ページの URL → ⑤ Vercel の環境変数 3 つ → Redeploy → ⑥ テストカードで申し込み → カード変更 → 解約を確認 → ⑦ 本番キーに差し替え（下の「Stripe を有効にする手順」） | 利用者 | 未 |
| 85 | **Gemini の既定モデルを切り替える**: `gemini-2.5-flash` は 2026-10-16 に提供終了予定（公式の料金ページの注記）。Vercel に `GEMINI_MODEL`（後継の Flash。公式の一覧で ID を確認）を追加 → Redeploy → LLMO の Gemini 列が動くこと。Gemini のキーが未設定のままなら急がない | 利用者 → Claude | 未（10 月中旬まで） |
| 109 | **AI 検索モニタリングの対象に Claude と Perplexity を足す**（DataForSEO の LLM Responses は両方に対応。Perplexity は Live のみ）。LLMO モニタリングで見られていた 4 サービスのうち、一本化後は ChatGPT / Gemini / AI Overviews の 3 つになった。`src/lib/geo/`（`GEO_MODELS`・`llmPath`・単価）の拡張。1 日 | Claude | 未（利用者の要望があれば） |
| 105 | 提供終了した機能のコードを削除（GSC / GA4 / 数字の診断 134 ルール / 計測タグ / LLMO 本体 / セカンドオピニオン） | Claude | **完了（r93、09-17）**。利用者の許可「消してよいです」。旧 URL の転送ページ（search-performance / site-report / ai-traffic / llmo）だけ残してある（1〜2 か月後に消してよい） |
| 106 | ~~アクセス解析の Supabase テーブルを作る~~ | — | **不要（r90 で取り下げ。SQL は実行しない）** |
| 107 | ~~アクセス解析の本番確認~~ | — | **不要（r90 で取り下げ）** |
| 108 | 紹介サイト（Cloudflare Worker）の再デプロイ: r89 で `marketing/public/index.html` の文面を GSC / GA4 なしに書き換えた。#29 の切り替えが済んでいれば main の push で自動、済んでいなければ旧リポジトリへの反映が要る | 利用者 | 未 |
| 104 | **GA4 の代わりに自前の計測タグを配る**（2026-09-17 利用者の決定「CS にコストを掛けられないので、API 料金が上がってでも GA4 と GSC を模倣したい」）: 設計は [gsc-ga4-substitute-design.md](./gsc-ga4-substitute-design.md) の第 2 段。**サイト内の行動と CV は外部 API では原理的に取れない**（Similarweb 等の推定は日本の店舗規模では値が出ない）。**自前タグなら「発行した 1 行を貼るだけ」になり、GA4 の設定説明という CS がまるごと消える。**イベント名の揺れも無くなるので「GA4 イベントの割り当て」画面ごと不要になる。最小構成 3 日 → CV 2 日 → 画面差し替え 2 日。Cookie を使わず IP を保存しない設計にして同意バナーを避ける（**#12 の専門家レビューと一緒に見てもらう**） | — | **r89 で作り、r90 で取り下げ**（利用者「ツールで完結しないので面倒。やらない」）。コードは #105 で削除 |
| 102 | **GSC が無くても「検索パフォーマンス（推定）」を出す**（2026-09-17 利用者の問題提起「GSC と GA4 の登録は大変。サービスとして質が低く見える。解決策は？」）: **部品はすべて既にある。**順位 = SerpApi（`src/lib/serp/`、稼働中）／CTR カーブ = `src/lib/site-report/findability.ts` の `ctrForRank`（実装済み）／月間検索数 = `src/lib/rank/store.ts` の `monthlyVolume`（**いまは手入力**。DataForSEO の Keywords Data で自動取得に置き換えられる。アカウントは #91 で用意済み）。推定表示回数 ≒ 月間検索数、推定クリック ≒ 月間検索数 × 順位別 CTR。**契約初日から数字が出せるようになり、GSC をつないだら実測に切り替える**設計にする。**実測の代わりにはならない**（クエリ単位の実データは GSC にしかない）ことは画面に明記する。1〜2 日 | Claude | **完了（r87、2026-09-17）**。`/tools/search-estimate`。DataForSEO Labs の `ranked_keywords` から取得 → `ctrForRank` で推定。**エンドポイントが違っていたら `DATAFORSEO_LABS_RANKED_PATH` で差し替えられる** |
| 103 | **連携のオンボーディング画面**（同上の短期策）: 「Search Console に登録済みですか」→ ①**登録済み（他の人が管理）→ 閲覧権限をもらう依頼文を自動生成**（制作会社に送るメール文面。GSC の「ユーザーと権限」で閲覧者を足すだけ、1 分で済む）②**自分で登録済み → 連携を押すだけ** ③**未登録 → DNS に TXT を 1 行**の手順を提示。**所有確認そのものは API で代行できない**（サイト所有者の操作が要る）が、手順を極限まで短くできる。GA4 も同じ 3 分岐（プロパティがあれば閲覧者権限をもらうだけでタグ設置は不要）。半日 | — | **不要になった（r89 で GSC / GA4 を廃止）** |
| 97 | **GA4 / GTM の計測タグが入っているかを自動判定する（提案。2026-09-17 利用者の質問「GA4 タグはツール画面から入れられないの？」から）**: **タグの設置そのものはこのツールからはできない**（お客様のサイトの HTML に書く必要があり、こちらに書き込み権限は無い）。**できるのは ①入っているかの判定 ②設置手順と貼り付け用スニペットの提示**。①は診断でページの HTML を既に取得しているので、`gtag/js?id=G-`、`googletagmanager.com/gtm.js`、`G-XXXXXXX` を探すだけ。**現状は判定していない**（`src/lib/diagnosis/rules/` は「計測タグが入っているか確認する」と**人に促す文言**があるだけで、自動判定は無い）。②は接続済み GA4 プロパティの測定 ID を出してコピーさせる。半日程度 | Claude | 提案中（利用者の GO 待ち。リリース後で可） |
| 96 | **GA4 の読み取りに 2 つの経路があり、サイトレポートと生成 AI 流入分析がお客様のデータを読めない**（2026-09-17 判明。詳細は [google-oauth-verification.md](./google-oauth-verification.md) の「実装の食い違い」）: **精密診断と GA4 イベント割り当ては OAuth（お客様ごと）**だが、**サイトレポートと生成 AI 流入分析は環境変数 `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` のサービスアカウント方式（運営者の 1 プロパティ固定）**。しかも**本番の画面に「`.env.local` に追加して開発サーバーを再起動」という開発者向けの文言が出ている**。**ライト以上でサイトレポートを売っているので、お客様が開くと使えない。**案 A: 2 画面を OAuth 方式に寄せる（コードは既にある。リリース後で可）／案 B: 今週はプランから外すか「運営者設定のみ」と明記し、**最低限 `.env.local` の文言をお客様向けに直す** | — | **r89 で機能ごと提供終了**（経路の問題は消えた） |
| 95 | **料金の税表記と Stripe の価格が食い違っている（最初の課金までに決める）**: 特商法ページ（`src/components/legal/Tokushoho.tsx`）と紹介サイト `marketing/public/index.html` は「**税別**。消費税は別途申し受けます」だが、**Stripe の価格は ¥50,000 / ¥38,000 で税設定なし（税コード「—」）なので、請求されるのはこの金額ちょうど**。消費税は加算されない。決め方は ①**免税事業者として「税込」表記に直す**（コード修正。受取 50,000 円）か ②**税別で通す**（Stripe の価格を税込 55,000 円 / 41,800 円で作り直すか Stripe Tax を有効化。受取 50,000 円 + 税）。インボイス登録の有無で決まる。**初月無料なので最初の課金は約 30 日後**だが、料金表記は営業で先に見せるので早めに | 利用者（判断）→ Claude（文言の修正） | **完了（r78、2026-09-17）**。利用者の決定「料金の価格は税込み」→ 特商法・料金プラン・サービス案内・紹介サイト・llms.txt・README をすべて「税込」に統一。**Stripe の価格（50,000 円 / 38,000 円）はそのままでよい**（税設定なしで請求がこの額ちょうど = 税込表記と一致） |
| 84 | **Stripe のセキュリティチェックリスト（期日超過・決済と入金が停止中）**: 2026-09-09 付で「Additional information required」。本文は `All businesses in Japan are required to complete the security checklist to process payments.`。**影響: 決済・入金とも 2026/09/09 に一時停止**。つまり #58 の本番モード（⑧）に進む前に、これを片付けないと実際の課金ができない。画面: Stripe → 設定 → ビジネス → アカウントのステータス → 該当タスク → 「Provide information」。テスト環境の検証（#58 の 1〜7）は止まらないので並行して進めてよい | 利用者（回答内容は Claude が下書き可） | **送信済み・審査待ち（09-16）**。要対応タスクが 0 になり赤帯も消えた。設問と回答は [stripe-checklist-prompt.md](./stripe-checklist-prompt.md) に記録。**「支払い」が有効に戻ったかは要確認**（同ファイル「送信後の状態」） |
| 101 | **古いブランチ 12 本の削除**（作り直す前の履歴の残骸。いまの main と共通の祖先が無く、中身は main に入り直し済み）。Claude からは `git push origin --delete` が 403 で拒否されるため、画面操作が要る。画面: https://github.com/matsu609/seo-checker/branches → 各行のごみ箱アイコン。ブランチ名と復元用の SHA は下の作業ログ（2026-09-16「返答フォーマットの追加と、古いブランチ 12 本の削除」）の表 | 利用者 | 未 |
| 94 | **代理店アカウントの本番確認**（r77）: マスター画面で代理店を 1 件追加 → 顧客一覧で担当を割り当て → その代理店でログインして `/agency` に出ることを確認。手順は下の「代理店アカウントを使いはじめる手順」 | 利用者 | 未（コードは完了） |
| 97 | **代理ログインの本番確認**（r79）: マスター画面で「この方の画面を見る」→ そのお客様の画面が出る → 画面下の帯から自分に戻れる、を 1 回通す。手順は下の「お客様の画面を見る手順」 | 利用者 | 未（コードは完了） |
| 98 | **プライバシーポリシーに「運営者がサポートのためにお客様の画面を閲覧しうる」旨を入れるか**（r79 の代理ログイン）。#12 の専門家レビューと一緒に判断。文案は Claude が用意できる | 利用者 → Claude | 判断待ち |
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
| 60 | registry の食い違いを直す: `/tools/maps` の `optional` に `anthropic` を足す、`/tools/site-report` の `serpapi` を間接依存として書き直す（[tool-map.md](./tool-map.md) の ※1・※4） | Claude | 半分不要に（`/tools/site-report` は r89 で提供終了）。`/tools/maps` の `optional` だけ残 |
| 61 | 採点ツールの誤検出を直す: 意図した noindex（サイト内検索の結果ページなど）とトップページのパンくずを減点しない | Claude | **完了（r43、09-12 に利用者の指示で main へマージ）** |
| 62 | 採点ツールの誤検出（続き）: もともと検索に載せないページの **robots.txt での拒否**（`ai-crawlers-allowed`・配点 3）も減点しない。サイト全体の拒否（`Disallow: /`）は従来どおり減点 | Claude | **完了（r44、09-12 に利用者の指示で main へマージ）** |
| 63 | サイト診断: **検索に載せないページを採点対象外（参考）にする**。noindex か robots.txt で実際に検索から外されているサイト内検索の結果などは、診断はするが平均点・項目の集計・ページ一覧に入れず、付録 A に理由つきで載せる | Claude | **完了（r44）** |
| 64 | 採点ツール: **本文の具体性の判定を多言語対応にする**（英語ページが本文を 2 倍にしても「1 / 全 1 文・改善余地」から動かない件）。言語判定・文の区切り・事実の手がかりを多言語化し、文が少ないページは比率で判定しない。判定根拠（総文数・言語・基準・実例 3 件）をレポートに出す | Claude | **完了（r45、09-13 に利用者の指示で main へマージ）**。マージ後の main でも lint / tsc / test（110 ファイル・1,490 件）/ build を通してから push した |
| 65 | 依頼の任意項目「意図的な仕様の申告」: noindex の検索結果ページやトップのパンくずのように、意図して外している項目を申告して指摘から外す仕組み。r43 / r44 で自動判定できるものは既に外してあるので、残るのは「自動では区別できないもの」の手動申告 | 利用者 → Claude | 判断待ち（下の「入力待ち」） |
| 66 | **精密診断（連携不要の SEO 分析。有料・回数制限つき）**: 設計は [seo-analysis-spec.md](./seo-analysis-spec.md) §0。利用者の決定（09-13、6 点すべて推奨案）。**A′（r55）に続き B′〜E′ を r56 で main にマージ**（09-14、利用者の指示「一気に実装してメインにマージ」）: `/tools/seo-analysis`（事実シート → Claude の分析 → ChatGPT のセカンドオピニオン → 報告書 PDF → 履歴）、CrUX、SerpApi、GSC / GA4 の任意層、各画面の「AI に分析させる」（まずサイト診断）。**利用者側の作業**: ① Supabase で `analysis_runs` の SQL を実行（下の「精密診断の実行記録」）② Google Cloud で Chrome UX Report API を有効化し PageSpeed 用キーの制限に追加（下の #78）③ 本番で 1 回動かして AI の出力とトークン量を確認。残り: URL Inspection（E′ の一部）、実際の出力を見てのプロンプト調整 | 利用者 → Claude | **B′〜E′ 完了（r56）。利用者の作業 ①② 待ち** |
| 78 | **精密診断を動かすための設定**（下の表「精密診断を有効にする手順」）: ~~Supabase の SQL~~ → Chrome UX Report API の有効化とキーの制限追加 → 本番で試す → `SEO_ANALYSIS_MONTHLY_LIMIT` は既定 10 のままでよいか | 利用者 | **1・2 完了（09-15。`analysis_runs` を作成、Chrome UX Report API を有効化）**。**1b・3 完了（09-15。`audit` 列を追加、キーの API の制限に Chrome UX Report API を追加）**。残り 4（本番で 1 回実行） |
| 79 | **SerpApi を有効にする**: ~~アカウント → API キー → Vercel `SERPAPI_KEY` → Redeploy → `/admin` で確認~~ → 精密診断を再実行して「対策キーワードの順位」が出ること | 利用者 | **設定完了（09-15、`/admin` で「設定済み」を確認）**。残りは本番で 1 回の再実行 |
| 67 | **クイック診断を本サービスから切り離す**: 専用の公開シェル（サイドバー無し）・結果の下の導線・`robots.txt` / `sitemap.xml`・契約後の「はじめかた」3 ステップ・設定画面の Google 連携の補足 | Claude | **完了（r49、09-13）**。lint / tsc / test（1,504 件）/ build 通過、本番ビルドで表示確認 |
| 68 | **呼び名を「クイック診断 / 精密診断」に統一し、無料の深さを絞る**: 画面・PDF・紹介サイト・llms.txt・README・設計ドキュメントの文言を変更。サイト全体の診断を最大 300 ページ → 代表 10 ページ（`FREE_SITE_MAX_PAGES`）にし、残りページ数を出して精密診断へつなぐ | Claude | **完了（r50、09-13）**。lint / tsc / test（1,509 件）/ build / E2E スモーク（18 ページのダミーサイトが 10 ページで打ち切り）通過 |
| 69 | クイック診断（店舗・MEO）の扱い | 利用者 → Claude | **方針決定・完了（r51）**。利用者の判断「隠すのではなく、評価を厳しくできるなら改善点が増えるのでそちらが良い」→ 項目を隠さず**採点基準を厳しくした（v2）**。#40 の案 B（要点だけ見せて残りは登録で開放）は採らない |
| 100 | **r81（ホームページ URL の一元登録）の本番確認**: `https://app.seo-checker.tokyo/settings` のいちばん上「ホームページ」カードに自社サイトの URL を 1 回登録 → 保存 → サイト診断・精密診断・ページ最適化レポート・ページ診断・AIO 頻出トピック・プロンプト拡張・llms.txt の各タブを開き、**URL の入力欄が無く「対象のホームページ ○○」と出ている**ことを確認する。登録はブラウザごと（localStorage）なので、PC を変えたら登録し直し（移すときは同じ設定画面の「JSON をダウンロード / 読み込む」） | 利用者 | 未（コードは r81 で完了） |
| 99 | **Search Console にサイトマップを 2 本送信する**（2026-09-17 の質問）。画面: https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Aseo-checker.tokyo → 「新しいサイトマップの追加」に**フル URL**を入れて送信（ドメイン プロパティなのでホスト名の省略はできない）。①`https://seo-checker.tokyo/sitemap.xml`（紹介サイト。トップ 1 ページ）②`https://app.seo-checker.tokyo/sitemap.xml`（アプリ。規約・プライバシー・特商法の 3 ページだけ。**OAuth 審査でプライバシーポリシーが参照されるので、こちらも出しておく**）。送信後「ステータス = 成功」と「検出された URL」が 1 / 3 になれば完了（反映に数時間〜数日） | 利用者 | **紹介サイトは「成功しました」／1 ページ（完了）。アプリ側は「取得できませんでした」／0** → 原因は `robots.txt` が `/sitemap.xml` を塞いでいたこと。**r84 で修正済み**。Vercel のデプロイ完了後に、Search Console の同じ画面で app の行を**削除 → もう一度送信**（Claude in Chrome 用のプロンプトは [chrome-prompts.md](./chrome-prompts.md) の A）。**09-17 04:00 時点でまだ「取得できませんでした」のまま。**Google は robots.txt を最大 24 時間キャッシュするので、修正を出した直後に送り直しても古いままのことがある。**先に確かめる順番: ①`/admin` の「動いているコミット」が `1d316f7` 以降か ②Search Console の 設定 → robots.txt レポートに `Allow: /sitemap.xml` が出ているか ③URL 検査で `https://app.seo-checker.tokyo/sitemap.xml` が「robots.txt により拒否されました」と言わないか。**②が古ければ再クロールを依頼して待つだけでよい（Google の自動再試行を待ってもよい）。「成功しました」／3 ページになれば完了 |
| 91 | **AI 検索モニタリングを動かす**（下の「AI 検索モニタリングを有効にする手順」）: Supabase で 8 テーブルの SQL を実行 → DataForSEO に登録して前払い → Vercel に `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` → Redeploy → `/tools/geo` で自社ブランドとプロンプトを登録 → 翌朝の Cron で数字が入る | 利用者 | 利用者 + Claude | **4〜6 完了（09-17 22 時台。`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` を Vercel に登録 → Redeploy → `/tools/search-estimate` が動作）**。残り: 7（`/admin` で設定済み確認）→ 8（`/tools/geo` でブランドとプロンプトを登録）→ 9（翌朝の計測を確認）。お試し $1 なので、動作確認後に $50 を入金 |
| 93 | **AI 検索モニタリングをどのプランに入れるか決める**: いまは**スタンダード**に置いてある（1 アカウント月 ¥2,000 前後の変動費が出るため）。「測る」系なので本来の線引きではライトだが、原価が他のツールと桁違い。ライトに下ろすなら料金表（`src/lib/plans/catalog.ts`）・紹介サイト・サービス資料・`src/lib/features/registry.ts` の `plan` とテストをまとめて直す（Claude 側 30 分）。**このままスタンダードでよければ何もしなくてよい** | 利用者 → Claude | 判断待ち |
| 92 | AI 検索モニタリングの**生成処理**（仕様書 §7.2 / §7.3）: 週次レポート（軽量モデル + テンプレート）と月次深掘り（高性能モデル 月 1 回）、差分実行（前回とほぼ同じなら再生成しない）。クレジットのレート（週次 30 / 月次 150）と台帳は実装済みなので、`run.ts` の後段に足すだけ | Claude | 未（計測が回ってから） |
| 90 | **露出した Ahrefs の API キーを作り直す（急ぎ）**: 2026-09-16 に Vercel の環境変数画面のスクリーンショット（値が平文表示）が会話に貼られた。https://app.ahrefs.com/account/api-keys で**そのキーを削除 → 新しいキーを作成** → Vercel の間違った変数 `AHREFS_API_KEY_ISSUED_2026_09_17` を削除 → 正しい名前で `AHREFS_API_KEY`（Sensitive）と `AHREFS_API_KEY_ISSUED_AT` を作る → Redeploy。DR は無料エンドポイントなので、漏れても課金の被害は無いが、他人がこのアカウントのキーとして使える状態は避ける | 利用者 | **完了（2026-09-17、利用者報告）**。露出したキーは無効になった。**マスター画面 /admin での確認も完了（2026-09-17、利用者報告）**。次回の作り直しは #87（2027-09-17 ごろ） |
| 89 | **Vercel のビルドが 1 push で 2 回走るのを止める**（2026-09-16 判明）: 作業ブランチと main に同じコミットを push しているため Production と Preview の両方がビルドされる。中身が同じなので Preview は無駄で、Hobby プランのビルド時間を倍使う。対策は ①作業ブランチを push せず main だけにする（履歴の追いやすさは落ちる）②Vercel → Settings → Git で Preview を作るブランチを絞る。**急ぎではない**（上限には当たっていない） | 利用者 → Claude | **対応済み（2026-09-17、利用者が設定）**。Vercel → Settings → Git → Ignored Build Step を Custom にし、`case "$VERCEL_GIT_COMMIT_REF" in claude/*) exit 0;; *) exit 1;; esac` を保存（**exit 0 = スキップ、exit 1 = ビルド**）。`claude/*` のプレビュービルドが止まる。**次の push から有効。**Hobby プランには「Preview の対象ブランチを絞る」設定が無かった |
| 88 | **Ahrefs の Domain Rating ライセンスに目を通す**: https://ahrefs.com/legal/domain-rating-license 。有料サービスに組み込む以上、条件（帰属表示・再配布と競合の禁止・一括収集の禁止・いつでも取り消し可）を一度ご自身で確認しておく。Claude 側はこの環境から ahrefs.com に接続できず、検索インデックス経由でしか読めていない | 利用者 | 未 |
| 87 | **Ahrefs の API キーを作り直す**（#83 で作った日の 1 年後）: **期限はマスター画面 https://app.seo-checker.tokyo/admin の「外部連携」→ Ahrefs の行に出る**（残り 30 日で黄色、切れると赤。r73 で実装）。切れたら https://app.ahrefs.com/account/api-keys で新しいキーを作る → Vercel の `AHREFS_API_KEY` を差し替え → `AHREFS_API_KEY_ISSUED_AT` も新しい日付に → Redeploy。**費用はかからない**（`domain-rating-free` は無料の公開エンドポイント） | 利用者 | **次回は 2027-09-17 ごろ**（#90 で 2026-09-17 に作り直したため、#83 の日付ではなくこちらが起点）。期限日は画面が教えてくれるので、このメモに書き込む必要は無い |
| 86 | **Open PageRank をどうするか決める**（2026-09-16 判明）: 旧 API が **2026-09-30 に終了**し、Keywords Everywhere の新 API（`openpagerank.keywordseverywhere.com`、Bearer 認証、無料枠 月 30,000 ドメイン）に移る。選択肢は ① 新 API に移行する ② Open PageRank をやめて Ahrefs の DR 一本にする（DR があれば採点は埋まる）。**推奨は ②**（DR が本命で、OPR は代替。移行の実装と利用者のアカウント作成が要る割に得るものが小さい）。②なら `src/lib/domain-power/openpagerank.ts` と関連の設定・文言を消す | 利用者 → Claude | 判断待ち |
| 80 | ~~**Open PageRank を有効にする**~~ → **保留**（旧 API が 9/30 終了。#86 の判断待ち）。旧: （ドメインパワーの「外部からのリンクの評価」。無料）: domcop で登録 → API キー → Vercel `OPENPAGERANK_API_KEY`（Secret、Production）→ Redeploy → `/admin` の外部連携で「設定済み」を確認 → 精密診断を再実行してドメインパワーの内訳に「外部からのリンクの評価」が出ること。下の「Open PageRank を有効にする手順」 | 利用者 | 未 |
| 83 | **Ahrefs の DR を有効にする**（利用者の質問 09-15「無料でドメインパワーを測るサイトと同じ機能にしたい」への回答。**これが本命**）: Ahrefs の無料アカウント → API キー → Vercel `AHREFS_API_KEY`（Secret、Production）→ Redeploy → `/admin` で確認 → 精密診断を再実行して「よく使われる無料ツールと同じ指標」に DR が出ること。下の「Ahrefs の DR を有効にする手順」 | 利用者 | 未 |
| 81 | ドメインパワーの本番確認: 日本の `.jp` / `.co.jp` のサイトで **RDAP（ドメインの登録日）が取れるか**を 1 回見る。取れなければ内訳の「ドメインの年数」が「未取得」になり、配点 15 点分が分母から外れるだけで報告書は出る（対応が要るなら別の取得先を検討） | Claude + 利用者 | 未 |
| 70 | **MEO の採点基準を厳しくする（v2）**: 営業時間の欠け → 要改善、自社サイト以外の URL → 注意、平均評価 4.5 / 4.2、口コミ件数 50 件、口コミの新しさ 30 / 90 日、オーナー写真 5 枚、低解像度が半数で要改善、口コミ本文 3 割未満で要改善、属性は「はい」だけ数える | Claude | **完了（r51、09-13）**。lint / tsc / test（1,510 件）/ build 通過。本番の登録店舗は次回の一斉更新（月曜 5:00 JST）で新基準に切り替わる |
| 71 | 採点基準 v2 への切り替えを既存のお客様に伝える（スコアが全体に下がるため）。報告書の末尾には「採点基準 v2（2026-09-13 改定）」と履歴が直接つながらない旨を明記済み | 利用者 | 未（お客様に渡す前に） |
| 72 | **MEO 報告書に「優先改善リスト」と「採点基準の付録」を足す（B・C）**: 配点 × 現状で「直すと +N 点」を出す / 21・28 項目の配点と判定条件を開示。クイック診断と精密診断の両方に出す。未取得 9 項目は「オーナーにしか分からない項目」としてまとめ、精密診断への導線にする | Claude | **完了（r52、09-13）** |
| 73 | **口コミの傾向分析（D。精密診断のみ）**: 履歴に貯まった口コミを重複排除して集計し、頻出語・良い点 / 不満の兆候・星別の傾向を出す。生成 AI 不使用・API 費用ゼロ | Claude | **完了（r53、09-13）** |
| 74 | **NAP 整合チェック（E。精密診断のみ）**: 登録サイトを自前クローラで読み、JSON-LD と本文から店名・住所・電話を抜いて Google の値と突き合わせる（`src/lib/listings/profile.ts` の `compareNap` / `normalizeForCompare` を再利用）。追加の API 費用はゼロ | Claude | **完了（r53、09-13）** |
| 75 | クイック診断（店舗）に「その場で答える 9 項目」を置くか（案 A） | — | **見送り（利用者の判断 2026-09-13）**。9 項目はオーナーにしか分からない情報なので、精密診断の「オーナー情報の入力」に残す |
| 76 | **クイック診断の入口を塞ぐ**（サイドバーから削除・ログイン済みは `/start` へ・紹介サイトと robots から除外）とタブ順を SEO → MEO → AIO に | Claude | **完了（r54、09-13）** |
| 77 | 紹介サイトの「クイック診断 0 円」の料金カードを消したので、**無料の診断を営業でどう使うか**（誰に、どの場面で URL を渡すか）を決める。渡す URL は `https://app.seo-checker.tokyo/` と `/meo` | 利用者 | 未 |
| 82 | **GSC / GA4 / CRM の自動診断 + コンサル回答生成**: 仕様は [diagnosis-rules-spec.md](./diagnosis-rules-spec.md)。利用者の決定（09-15）= 入口は既存の Google 連携のみ・CSV は作らない／精密診断と同義。**G1〜G6 完了（r61 / r65 / r66）= 134 ルール**（GSC 79 + GA4 47 + 突き合わせ 8）。§11 の 20 件は重複・共起を除いて 8 件に絞った（利用者の指示「件数より体験の質」）。残り: G7（人間による承認）／ G8（CRM） | Claude | **G1〜G6 完了（r66）。残りは G7・G8 で、どちらも利用者の判断待ち** |

### Clerk のアカウントポータルを通らせない設定（#117 の追加。r100 のあと）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` = `/sign-in`、`NEXT_PUBLIC_CLERK_SIGN_UP_URL` = `/sign-up`（Production と Preview）→ Redeploy |
| 2 | Clerk ダッシュボード → Configure → Account Portal（見当たらなければ Paths） | https://dashboard.clerk.com/ | 「Sign-in」を **Custom URL** `https://app.seo-checker.tokyo/sign-in`、「Sign-up」を `https://app.seo-checker.tokyo/sign-up` に。「After sign-in / After sign-up」は `https://app.seo-checker.tokyo/start` |
| 3 | 確認（シークレットウィンドウ） | https://accounts.seo-checker.tokyo/sign-up | 開いたら `app.seo-checker.tokyo/sign-up`（6 項目のフォーム）に転送されること。`https://app.seo-checker.tokyo/tools/rank` を未ログインで開くと `app.seo-checker.tokyo/sign-in` に着くこと |

### 登録つき無料診断を本番で開く手順（#117。r98 の反映後）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | **先に**いまの契約者（無料で使ってもらっている人を含む）の行で、使わせたいツールを個別開放する。`DEFAULT_PLAN` を `free` にすると、Stripe の契約か個別開放が無い人はツールが開かなくなるため |
| 2 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | `DEFAULT_PLAN` を `pro` → **`free`** に（Production と Preview）。任意で `FREE_DIAGNOSIS_LIMIT`（既定 2） |
| 3 | Vercel → Deployments | https://vercel.com/matsumatsu452-6233/seo-checker/deployments | 最新のデプロイを Redeploy（環境変数を反映） |
| 4 | Clerk ダッシュボード → User & Authentication → Email, Phone, Username | https://dashboard.clerk.com/ | **Email address = 必須・Verification は「Email verification code」が ON**、**Password = ON** であること（登録フォームはメール + パスワード + 確認コード。Phone は OFF のまま = 電話は SMS 認証せず文字で保存）。Name は任意（フォームは Clerk の名前欄を使わない） |
| 5 | Clerk ダッシュボード → Restrictions | 同上 | 「Sign-up」が許可されていること（招待制・許可リストにしない。見込み客が自分で登録する設計） |
| 6 | Clerk ダッシュボード → Attack protection | 同上 | Bot protection（Smart CAPTCHA）は ON のままでよい（フォームに `#clerk-captcha` の受け皿あり）。ON でも OFF でも動く |
| 7 | 本番 → 登録フォーム（**シークレットウィンドウ**で） | https://app.seo-checker.tokyo/sign-up | 6 項目を入れて登録 → 確認コード → 無料診断（`/`）に着く → 「残り 2 回」が出る → 1 回診断 → 「残り 1 回」 → `/meo` で 1 回 → 「使い切りました」と料金プランへの導線が出ること |
| 8 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | 7 で作ったアカウントの行に「担当者名・会社名・電話番号・店舗の種類・無料診断 2 / 2 回」が出ること。確認が済んだらそのアカウントは Clerk で削除してよい |
| 9 | Google でログインした人の確認（任意） | https://app.seo-checker.tokyo/sign-in | Google でログインすると `/sign-up/profile`（登録情報の補完）に送られ、4 項目を入れると無料診断に進めること |

### Business Profile Performance API を使えるようにする手順（#116。承認前にできること → 承認後）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google Cloud → API ライブラリ（**検索窓は使わず直リンク**。「Google My Business API（v4）」と検索すると 0 件になる。09-18 利用者が遭遇） | v4（口コミ）: https://console.cloud.google.com/apis/library/mybusiness.googleapis.com?project=seo-checker-508104 ／ Performance: https://console.cloud.google.com/apis/library/businessprofileperformance.googleapis.com?project=seo-checker-508104 ／ Account Management: https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=seo-checker-508104 ／ Business Information: https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com?project=seo-checker-508104 | それぞれ「有効にする」（承認前でも有効化はできる。クォータが 0 なだけ）。v4 の直リンクが「利用できません」なら承認後に開き直す |
| 2 | Google Cloud → 有効な API とサービス | https://console.cloud.google.com/apis/dashboard?project=seo-checker-508104 | 4 本が一覧に出ていることを確認。「割り当て」が 0 のままなら承認待ち（正常） |
| 3 | Google Cloud → OAuth → データアクセス | https://console.cloud.google.com/auth/scopes?project=seo-checker-508104 | スコープに `https://www.googleapis.com/auth/business.manage` があること（無ければ「スコープを追加または削除」で追加）。他のスコープ（webmasters / analytics）が残っていれば外す |
| 4 | Google Cloud → OAuth → 対象（テストユーザー） | https://console.cloud.google.com/auth/audience?project=seo-checker-508104 | ご自身の Google アカウント（店舗のオーナー / 管理者のもの）がテストユーザーに入っていること。審査前はこのアカウントだけ接続できる |
| 5 | Google ビジネス プロフィール | https://business.google.com/ | 承認後の動作確認に使う店舗を決める。**確認済み**で、ご自身のアカウントが**オーナーか管理者**であること。無ければ知人の店舗に管理者として招待してもらう |
| 6 | Business Profile API のケース（申請時のメール） | Google からのメール（件名にケース ID `0-4126000041187`） | 09-11 申請で目安 7〜10 営業日 = 9/24 ごろ。返信が無ければ同じスレッドで進捗を問い合わせる（「Business Profile API access request follow-up」）。質問が来ていたら即日返信 |
| 7 | Clerk ダッシュボード | https://dashboard.clerk.com/ | アプリ名を `SEO Checker` に（#7）。OAuth 審査の動画に映る |
| 8 | Google Cloud → OAuth → ブランディング | https://console.cloud.google.com/auth/branding?project=seo-checker-508104 | 利用規約 / プライバシーの URL を登録（#8） |
| 9 | （承認後）本番 → Google マップ（MEO） | https://app.seo-checker.tokyo/tools/maps | 自社店舗を選ぶ → 「5. Google での見られ方」の「Google アカウントを接続する」→ Google の確認画面で許可 → 表示回数・電話・ルート・流入キーワードが出る。「接続したアカウントがこの店舗を管理していません」と出たら、店舗の管理者のアカウントで接続し直す |
| 10 | （承認後）本番 → 口コミへの返信 | https://app.seo-checker.tokyo/tools/replies | 同じ接続で口コミ全件と返信が出る。ここまで通ったら OAuth 審査の動画を撮る（[google-oauth-verification.md](./google-oauth-verification.md) §3） |

### 口コミ返信を有効にする手順（#54。すべて利用者の作業）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google → Business Profile API のアクセス申請 | https://developers.google.com/my-business/content/prereqs | 前提 1〜3 は済み。4（組織アカウント）は個人アカウントのプロジェクトなので不要。5 のリンクから英語のフォームへ。**`matsumatsu452@gmail.com` でログインした状態で送る**（審査対象はログイン中のアカウント）。Application for Basic API Access / 連絡先 contact@seo-checker.tokyo / SEO 研究所 / https://seo-checker.tokyo/ / Project ID `seo-checker-508104` と Project number（Cloud のダッシュボードの数字）/ 確認済み 60 日以上のプロフィール / 用途の英文は 09-11 の会話に記載（口コミの取得・返信の投稿更新削除・基本情報の取得、OAuth business.manage、サービスアカウント不使用）。**審査は数日〜数週間**。承認メールが来たら次へ |
| 2 | Google Cloud → API ライブラリ（3 つを有効化） | https://console.cloud.google.com/apis/library?project=seo-checker-508104 | 「My Business Account Management API」「My Business Business Information API」「Google My Business API」（v4）をそれぞれ検索して「有効にする」。**前 2 つは 09-11 に有効化済み**（「有効な API とサービス」に表示を確認）。残りは v4（https://console.cloud.google.com/apis/library/mybusiness.googleapis.com?project=seo-checker-508104 ）。承認前は一覧に出ないか、有効化しても 403 になる |
| 3 | Google Cloud → OAuth → データアクセス（スコープ） | https://console.cloud.google.com/auth/scopes?project=seo-checker-508104 | 「スコープを追加または削除」で `https://www.googleapis.com/auth/business.manage` を追加して保存。テスト状態のままでよい（テストユーザーは使える。本番公開の審査時にこのスコープの説明とデモが要る） |
| 4 | 本番 → 口コミへの返信 | https://app.seo-checker.tokyo/tools/replies | 「1. 接続」の「Google に口コミ返信の権限を追加する」→ Google の確認画面で**ビジネスのオーナー / 管理者のアカウント**（`wolf@wolf-info.org` 側にオーナー権限がある。`matsumatsu452@gmail.com` は管理者として追加済み）で「ビジネス プロフィールの管理」を許可 → 戻ったらビジネスの一覧が出る |

①が終わる前に④を押しても害は無い（権限は付くが、口コミ一覧が「利用申請が承認され…」のエラーになる）。承認後に画面を開き直せばそのまま動く。

### 精密診断を有効にする手順（#78。利用者の作業）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Supabase → SQL Editor | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/sql/new | 下の「精密診断の実行記録（r56）」の SQL を貼って Run → Success を確認。Table Editor に `analysis_runs` が出れば完了 |
| 1b | Supabase → SQL Editor | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/sql/new | **r58 で列が 1 つ増えた**: `alter table analysis_runs add column if not exists audit jsonb;` を貼って Run → Success。これが無いと報告書の「詳細: サイト診断」が空になる（他は動く） |
| 2 | Google Cloud → API ライブラリ（Chrome UX Report API） | https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com?project=seo-checker-508104 | 「有効にする」。無料・請求先不要 |
| 3 | Google Cloud → 認証情報 | https://console.cloud.google.com/apis/credentials?project=seo-checker-508104 | API キー「PageSpeed Insights (seo-checker)」を開く → 「API の制限」で **Chrome UX Report API** を追加して保存（別キーにするなら Vercel に `CRUX_API_KEY` を追加 → Redeploy）。制限が「制限なし」なら何もしなくてよい |
| 4 | 本番 → 精密診断 | https://app.seo-checker.tokyo/tools/seo-analysis | `seo-checker.tokyo` などで 1 回実行（収集 1〜5 分 → AI 1〜3 分）。報告書の「結論」「改善案」「セカンドオピニオン」「速度」「付録」が出ること、右上の「今月 n / 10 回」が増えることを確認。運営者（ADMIN_EMAILS）は無制限 |
| 5 | Vercel → 環境変数（任意） | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | 月の回数を変えるなら `SEO_ANALYSIS_MONTHLY_LIMIT`（既定 10）。ChatGPT のセカンドオピニオンは `OPENAI_API_KEY`（LLMO と共用。未設定なら Claude だけで完成） |

### SerpApi を有効にする手順（#79。利用者の作業）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | SerpApi → 登録 | https://serpapi.com/users/sign_up | メールで登録（Google ログイン可）。無料プランは月の検索回数に上限がある（回数と料金は https://serpapi.com/pricing で確認。精密診断 1 回 = 最大 7 回、順位計測 = キーワード数 × 実行回数） |
| 2 | SerpApi → API キー | https://serpapi.com/manage-api-key | 「Your Private API Key」をコピー（会話には貼らない） |
| 3 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | 「Add」→ Key `SERPAPI_KEY`、Value にキー、Environment は Production（Preview も使うなら両方）、Sensitive にチェック → Save |
| 4 | Vercel → Deployments | https://vercel.com/matsumatsu452-6233/seo-checker/deployments | 最新のデプロイの「…」→ Redeploy（環境変数はデプロイ時に読まれるため） |
| 5 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | 「外部連携」の SerpApi が「設定済み」になり、サイドバーの順位計測の「要設定」が消えることを確認 |
| 6 | 本番 → 精密診断 | https://app.seo-checker.tokyo/tools/seo-analysis | 対策キーワードを入れて「分析する」。KPI の「対策キーワードの順位」に「n / m 語が 100 位以内」と出れば完了（このときも今月の回数を 1 つ使う） |

SerpApi の実費が出るのは精密診断（1 回 ≤ 7 検索）・順位計測・AI Overviews 引用・ページ診断の上位 10 件・AIO 頻出トピック。無料枠を超えないよう、SerpApi のダッシュボード（https://serpapi.com/dashboard ）で残り回数を見る。

### AI 検索モニタリングを有効にする手順（#91。利用者の作業）

仕様書は [geo-monitoring-spec.md](./geo-monitoring-spec.md)。**1 アカウント月 ¥3,000 以内**の原価で回す設計。

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Supabase → SQL Editor | https://supabase.com/dashboard/project/qcdkatzxvdgplgibevlc/sql/new | 上の「AI 検索モニタリングのテーブル」の SQL を全部貼って Run → Success。Table Editor に `geo_` で始まる 8 つのテーブルが出れば完了 |
| 2 | DataForSEO → 登録 | https://app.dataforseo.com/register | アカウントを作る（前払い。最低入金額は画面で確認。まずは $50 程度で足りる） |
| 3 | DataForSEO → API アクセス | https://app.dataforseo.com/api-access | **API 用のログイン（メール）とパスワード**を確認・コピー。ログイン画面のパスワードとは別に発行される |
| 4 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | 「Add」→ Key `DATAFORSEO_LOGIN`、Value に 3 のログイン、Production、**Sensitive にチェック** |
| 5 | Vercel → 環境変数（同じ画面） | 同上 | もう 1 つ「Add」→ Key `DATAFORSEO_PASSWORD`、Value に 3 のパスワード、Production、**Sensitive にチェック** |
| 6 | Vercel → Deployments | https://vercel.com/matsumatsu452-6233/seo-checker/deployments | Redeploy |
| 7 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | 外部連携の「DataForSEO」が「設定済み」になることを確認 |
| 8 | 本番 → AI 検索モニタリング | https://app.seo-checker.tokyo/tools/geo | 「設定」タブで**自社ブランド（名前・別名・ドメイン）**を登録 → プロンプトを登録（まずは 5 本ほど）。競合も入れると比較できる |
| 9 | 翌朝 | https://app.seo-checker.tokyo/tools/geo | Cron（毎日 5:00 JST）が当日分を計測するので、翌朝ダッシュボードに数字が入る。すぐ見たいときは「今すぐ実行」（2 クレジット） |

**消し込み用のチェックリスト**（終わったら `[x]` にして、この行を更新して push する）

- [ ] 1. Supabase で 8 テーブルの SQL を実行した
- [ ] 2. DataForSEO に登録して入金した
- [ ] 3. API 用のログインとパスワードを控えた（**会話には貼らない**）
- [ ] 4. Vercel に `DATAFORSEO_LOGIN` を追加した（Sensitive）
- [ ] 5. Vercel に `DATAFORSEO_PASSWORD` を追加した（Sensitive）
- [ ] 6. Redeploy した
- [ ] 7. `/admin` の外部連携で DataForSEO が「設定済み」になった
- [ ] 8. `/tools/geo` で自社ブランド（名前・別名・ドメイン）を登録した
- [ ] 8b. プロンプトを 5 本ほど登録した（競合も入れると比較できる）
- [ ] 9. 翌朝、ダッシュボードに数字が入ったことを確認した

注意: **反復は週内の別の日に分散**します（通常は月・水・金、高精度は月〜金）。登録した翌日に全部の数字が揃うわけではなく、
4 週ほどで見出しの数値（4 週ローリング）が安定します。**1 回の結果や 1 週間の上下では判断しない**設計です。

### Ahrefs の DR を有効にする手順（#83。利用者の作業。無料）

**他社の無料ドメインパワー測定サイトが出している数値そのもの**（Ahrefs の Domain Rating、0〜100）を報告書に出すための設定。Ahrefs の API のうち `domain-rating-free` だけは**無料で、API ユニットも消費しない**（有料プランは不要。無料アカウントのキーだけ）。

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Ahrefs → 登録 | https://ahrefs.com/signup?plan=awt | 無料アカウントを作る。有料プランの契約は不要。**登録後に出る「プロジェクトをインポートまたは追加する」の画面は右上の「キャンセル」で飛ばしてよい**（サイトの所有確認は Ahrefs Webmaster Tools を使うための手順で、このツールが使う DR の公開エンドポイントには関係しない） |
| 2 | Ahrefs → アカウント設定 → API キー | https://app.ahrefs.com/account/api-keys | APIv3 のキーを作成してコピー（会話には貼らないでください） |
| 3 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | **変数を 2 つ、別々に「Add」する**（下の表のとおり。**名前と日付を 1 つの変数にまとめない**） |
| 4 | Vercel → Deployments | https://vercel.com/matsumatsu452-6233/seo-checker/deployments | 最新のデプロイの「…」→ Redeploy |
| 5 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | 「外部連携」の Ahrefs が「設定済み」になることを確認 |
| 6 | 本番 → 精密診断 | https://app.seo-checker.tokyo/tools/seo-analysis | 分析を 1 回実行（今月の回数を 1 つ使う）。「ドメインパワー（推定）」カードの中の「よく使われる無料ツールと同じ指標」に **DR（0〜100）** が出れば完了。他社の測定サイトで同じドメインを調べて、同じ数値になるか見比べられる |

手順 3 で作る変数（**この 2 行を、そのままの名前で**）:

| Key（名前。この文字列をそのまま貼る） | Value（値） | Sensitive |
|---|---|---|
| `AHREFS_API_KEY` | Ahrefs で作った API キー（英数字の長い文字列） | **チェックする** |
| `AHREFS_API_KEY_ISSUED_AT` | キーを作った日。`2026-09-17` のように **YYYY-MM-DD** | 不要 |

よくある間違い（2026-09-16 に実際に起きた）: 名前の欄に `AHREFS_API_KEY_ISSUED_2026_09_17` のように**日付まで含めてしまい、値にキーを入れる**。
これだと `AHREFS_API_KEY` という名前の変数が存在しないので、マスター画面は「未設定」のまま変わらない。

注意: Ahrefs の条件で、**DR を画面に出すときは「Domain Rating by Ahrefs」の表示と https://ahrefs.com/ への機能するリンクが要る**（隠す・消すのは規約違反。カードに入れてあるので消さないこと）。**API キーの有効期限は 1 年**なので、切れたら 2 の画面で作り直す。**乗り換え先は不要・料金も発生しない**（同じ画面で新しいキーを作るだけ。キーは 1 アカウントに 1,000 個まで作れる）。切れたときは精密診断の報告書に「Ahrefs の API キーが拒否されました（AHREFS_API_KEY を確認してください）」と出て DR が「未取得」になるだけで、報告書そのものは出る。**キーを作った日から 1 年後に #87 で作り直す。**回数制限は Ahrefs API 全体の既定で **1 分 60 回**（超えると HTTP 429。公式ドキュメント「Limits consumption」）。無料エンドポイントは API ユニットを消費しない。1 回の分析では自社 + 競合 2 件 = 最大 3 回しか呼ばず、同じドメインは 24 時間キャッシュするので、月 10 回の分析ではこの制限に触れない。429 が返ったときは「未取得」として報告書を続け、失敗はキャッシュしない（次の分析で再取得する）。日次・月次の上限が別にあるかは公式ページをこの環境から開けず未確認（09-16）。

### Open PageRank（#80）は**いったん保留**（2026-09-16 判明）

**旧 API が 2026-09-30 に終了する。**Open PageRank は Keywords Everywhere（同じ運営会社）に移り、
基盤が `openpagerank.keywordseverywhere.com`、認証が Bearer トークンに変わる（無料枠は月 30,000 ドメイン）。
このツールの `src/lib/domain-power/openpagerank.ts` はまだ旧エンドポイント（`openpagerank.com/api/v1.0/getPageRank`）
を呼んでいるので、**いま旧 API のキーを取っても 9/30 で動かなくなる**。

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| — | Open PageRank → 移行のお知らせ | https://www.domcop.com/openpagerank/keywords-everywhere-acquisition | **設定作業は止めて、ここを読むだけ**。移行するかどうかは #86 で判断する |

Open PageRank はドメインパワーの「外部からのリンクの評価」（配点 25 点）の**代替**で、
**本命は Ahrefs の DR（#83、無料）**。DR が取れていればそちらを優先して採点するので、
Open PageRank を入れなくてもドメインパワーは 8 指標すべてが埋まる。急ぐ必要はない。

### お客様の画面を見る手順（#97。利用者の作業。r79 の反映後）

お問い合わせ対応や「ちゃんと表示されているか」の確認のために、**そのお客様としてログインした画面**をご自分の目で見られます。環境変数の追加は不要です。

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | 上部の「動いているコミット」が main の先頭（r79 以降）になっていることを確認 |
| 2 | 本番 → マスター画面 → 見たいお客様のカード右上 | https://app.seo-checker.tokyo/admin | **「この方の画面を見る」**を押す → 確認のダイアログで OK |
| 3 | （自動で遷移します） | — | そのお客様としてログインした状態になり、**そのお客様に見えているとおりの画面**が出ます。サイドバーの鍵・プラン・データもすべてお客様のものです |
| 4 | 画面のいちばん下の帯 | — | 確認が終わったら **「終了して自分に戻る」**を押す。押さなくても 30 分で自動的に切れます |
| 5 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | 自分の画面に戻っていることを確認（ログイン画面に出た場合は、ご自分のアカウントでログインし直してください） |

**注意していただきたいこと**

- **代理中はサイドバーの「マスター画面」が消えます**（お客様のアカウントで判定されるため）。**戻る入口は画面下の帯だけ**です。
- **お支払いの操作はできません**（申し込み・カード変更・解約は 403 で止まります）。運営者がお客様の代わりに解約してしまう、といった事故を作らないためです。
- お支払い以外（診断の実行など）は動きます。**外部 API の実費は運営者のアカウントに付く**ので、確認に必要な分だけにしてください。
- **運用者（`ADMIN_EMAILS`）のアカウントには代理ログインできません。**ご自身にも不要です（そのまま見られるため）。
- 開始したことは**サーバーのログに残ります**（誰が・誰に対して）。Vercel → Logs で確認できます。
- Clerk が複数セッションを持てる設定なら、終了すると自分のセッションに戻ります。そうでなければログイン画面に出るので、もう一度ログインしてください。

### 代理店アカウントを使いはじめる手順（#94。利用者の作業。r77 の反映後）

代理店に、担当としてお預かりしているお客様だけをお見せするための設定です。**環境変数は要りません**（マスターの判定に使う `ADMIN_EMAILS` は設定済み）。r77 が本番に出ていることを確認してから行ってください。

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | 本番 → マスター画面 | https://app.seo-checker.tokyo/admin | ページ上部の「動いているコミット」が main の先頭（r77 以降）になっていることを確認 |
| 2 | 本番 → マスター画面 → 「代理店アカウント」 | https://app.seo-checker.tokyo/admin | 代理店にする方のメールアドレスを入れて「代理店として追加」。**すでに登録済みの方はその場で代理店になり、未登録の方には Clerk から招待メールが飛びます**（相手が登録を済ませると一覧に並びます） |
| 3 | 本番 → マスター画面 → 顧客一覧 | https://app.seo-checker.tokyo/admin | お客様の行の「担当代理店」で、手順 2 の代理店を選ぶ。押した瞬間に保存されます（「担当なし」に戻せば見えなくなります） |
| 4 | Clerk ダッシュボード → Users（必要なときだけ） | https://dashboard.clerk.com/ | 招待が届かないときは、Clerk の Users / Invitations で招待の状態を確認。届いていなければ手順 2 をもう一度（同じアドレスに送り直せます） |
| 5 | 本番 → 代理店画面（**代理店のアカウントでログインして**） | https://app.seo-checker.tokyo/agency | 手順 3 で割り当てたお客様が並ぶことを確認。サイドバーの「運用」にも「代理店画面」が出ます |

**注意していただきたいこと**

- 代理店にできるのは**見ること**だけです。プランの変更も機能の個別開放もできません（金額に関わる操作は運用者だけに残しています）。
- 代理店には**契約状況・月額・プラン・次回請求・登録日・最終利用日**が見えます。クーポンコードは見えません。月額も見せたくない場合はお知らせください（外せます）。
- 「解除」を押すと、その場でその方は代理店画面を開けなくなります。担当の割り当て自体は残るので、代理店に戻せば担当もそのまま戻ります。
- 運用者（`ADMIN_EMAILS` のアドレス）は代理店にできません。マスターはもともと全員が見える立場だからです。

### Stripe を有効にする手順（#58。すべて利用者の作業。まずテストモードで通し、最後に本番キーへ）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Stripe → 商品カタログ | https://dashboard.stripe.com/test/products | **一部完了（09-13、サンドボックス）**: 商品「オールインワン」`prod_VFcHhP9RrDhK9E`、価格 **¥50,000 / 月** `price_1UF73IBQZc3g0qHVJGb0aumu`（= テスト環境の `STRIPE_PRICE_STANDARD`。旧名 `STRIPE_PRICE_PRO` のままでも読める）。商品名は「スタンダード」に変えておくと Checkout の表示が料金表と揃う。**r63 で 3 段階にしたので、商品「ライト」＋価格 ¥38,000 / 月（JPY・継続）を新しく作り、その Price ID を控える**（= `STRIPE_PRICE_LIGHT`）。プレミアム（伴走）は Stripe に作らない（月 3 社の枠を確認してから受けるため、問い合わせ経由） |
| 1c | **割引コードを作る（初月無料は自動、割引はコード入力）** | https://dashboard.stripe.com/test/coupons | 「新規」→ 名前「導入割引 2 万円引き」→ **金額割引 ¥20,000（JPY）**→ 期間「**永続**」→ 保存 →「プロモーションコードを追加」→ 顧客に渡すコード（例 `START30`）→ 保存。申し込み画面の「プロモーションコードを追加」で入力すると、無料期間の翌月から 30,000 円になる。コードを持たない人は定価 50,000 円のまま（この形なので定価表示が二重価格表示にならない） |
| 1b | Stripe → 商品カタログ → クーポン | https://dashboard.stripe.com/test/coupons | 割引の作り方: 「新規」→ 名前（例 `導入割引 40%`）→ 種類（% 割引 / 定額）→ 期間（**永続** = 契約中ずっと / 回数 = 最初の n か月 / 1 回）→ 保存 → クーポンの画面で「プロモーションコードを追加」→ 顧客に渡すコード（例 `WOLF40`）と利用回数の上限・有効期限 → 保存。申し込み画面（Checkout）でこのコードを入れると割引後の金額で決済される。契約中の顧客に後から付けるなら 顧客 → サブスクリプション → 「割引を追加」 |
| 2 | Stripe → 開発者 → Webhook（新しい画面では「ワークベンチ」→ Webhook タブ） | https://dashboard.stripe.com/test/workbench/webhooks | 「エンドポイントを追加」→ URL `https://app.seo-checker.tokyo/api/billing/webhook` → イベントを 4 つ選ぶ: `checkout.session.completed`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted` → 追加 → **署名シークレット（`whsec_…`）** をコピー |
| 3 | Stripe → 設定 → 請求 → カスタマーポータル | https://dashboard.stripe.com/test/settings/billing/portal | 有効にして保存。「お支払い方法の更新」「請求書の履歴」「サブスクリプションのキャンセル」を ON（キャンセルは「期間末」）。**プランの変更も ON にして、ライトとスタンダードの 2 つの価格を選べるようにする**（r63 で 2 つ売るようになったため。お客様が自分で上げ下げできる） |
| 4 | Stripe → 設定 → 公開事業者情報 | https://dashboard.stripe.com/settings/public | 事業者名 `SEO 研究所`、サポートメール `contact@seo-checker.tokyo`、サイト `https://app.seo-checker.tokyo/legal/tokushoho`（特商法の表記。本番アカウントの審査で見られる） |
| 5 | Stripe → 開発者 → API キー | https://dashboard.stripe.com/test/apikeys | **シークレットキー（`sk_test_…`）** をコピー（公開可能キー `pk_` は使わない） |
| 6 | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | `STRIPE_SECRET_KEY`（5 の値）、`STRIPE_PRICE_STANDARD`（1 のスタンダードの値。既存の `STRIPE_PRICE_PRO` のままでも動く）、**`STRIPE_PRICE_LIGHT`（1 のライトの値）**、`STRIPE_WEBHOOK_SECRET`（2 の値）を Production に追加 → Deployments で Redeploy |
| 7 | 本番 → 料金プラン | https://app.seo-checker.tokyo/plans | 「テストモード」の表示と、**プレミアム → スタンダード → ライトの 3 枚が高い順に並び、真ん中に「いちばん選ばれています」が出る**ことを確認 → スタンダードを申し込む → テストカード `4242 4242 4242 4242`（有効期限は未来、CVC 任意）→ 戻ったら「ご契約のプラン: スタンダード」「契約中」→「お支払い方法の変更・プランの変更・請求書・解約」でカードを変えてみる → 解約 → 「期間末で解約予定」になる。ライトでも 1 度通す（`STRIPE_PRICE_LIGHT` の確認） |
| 8 | Stripe → 本番モードに切替 | https://dashboard.stripe.com/products | 1〜3・5 を**本番モード**でもう一度（商品・Webhook・ポータル・`sk_live_`）→ 6 の 4 つを本番の値に差し替え → Redeploy。あわせて `DEFAULT_PLAN` を `free` に（#39）、自分は管理画面で個別開放。**下の 8a〜8f に分解した** |
| 8a | Stripe（本番）→ 商品カタログ | https://dashboard.stripe.com/products | **完了（2026-09-17 01:50）**: 「スタンダード ¥50,000 / 月」「ライト ¥38,000 / 月」を作成済み。税コードが「—」なのは**正しい**（09-17 の決定「料金は税込み」。税を足さずこの額ちょうどを請求する）。プレミアムを作らないのも**正しい**（09-15 の決定。月 3 社の枠を確認してから問い合わせで受ける） |
| 8b | Stripe（本番）→ 商品カタログ → 各商品 | https://dashboard.stripe.com/products | **Price ID を控える**（一覧には出ない）。商品名をクリック → 「料金」の行 → `price_…` をコピー。スタンダードの分が `STRIPE_PRICE_STANDARD`、ライトの分が `STRIPE_PRICE_LIGHT`。**テスト用の `price_1UF73IBQ…` とは別物**なので取り違えない |
| 8c | Stripe（本番）→ Webhook | https://dashboard.stripe.com/workbench/webhooks | 手順 2 と同じことを本番で。URL `https://app.seo-checker.tokyo/api/billing/webhook`、イベント 4 つ → **署名シークレット `whsec_…`** をコピー（= `STRIPE_WEBHOOK_SECRET`） |
| 8d | Stripe（本番）→ カスタマーポータル | https://dashboard.stripe.com/settings/billing/portal | 手順 3 と同じことを本番で（お支払い方法の更新・請求書の履歴・期間末での解約・プラン変更で 2 価格） |
| 8e | Stripe（本番）→ API キー | https://dashboard.stripe.com/apikeys | **シークレットキー `sk_live_…`** をコピー（= `STRIPE_SECRET_KEY`）。**あわせてアカウントが有効化（本人確認）済みかを確認する。**未了だと本番の支払いを受け取れない |
| 8f | Vercel → 環境変数 | https://vercel.com/matsumatsu452-6233/seo-checker/settings/environment-variables | `STRIPE_SECRET_KEY`（8e）・`STRIPE_PRICE_STANDARD`（8b）・`STRIPE_PRICE_LIGHT`（8b）・`STRIPE_WEBHOOK_SECRET`（8c）を Production に**本番の値で**登録 → `DEFAULT_PLAN` を `free` に（#39）→ Redeploy → `/plans` で「テストモード」の表示が消えていることを確認 |

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

**いちばん手前にあるのは #84（Stripe のセキュリティチェックリスト）。決済・入金が 2026/09/09 から停止しているので、これが終わるまで本番の課金は通らない。**

| # | 内容 | 担当 |
|---|---|---|
| 1 | #58 の 8（本番モードで商品・Webhook・ポータル・`sk_live_` を作り直し → Vercel の 3 つを差し替え → Redeploy） | 利用者 |
| 2 | #39 `DEFAULT_PLAN` を `free` に（これを変えるまで全員が pro のまま。**決済を本番にする前に必須**） | 利用者 |
| 3 | #7 Clerk → Legal に `/terms` `/privacy` の URL と登録時の同意チェック。アプリ名を `SEO Checker` に | 利用者 |
| 4 | Stripe の「Multiple capabilities paused」（本人確認・事業情報）の完了。終わらないと入金が保留される | 利用者 |
| 5 | 割引コードの発行（#58 の 1c）。初月無料は自動なので設定不要 | 利用者 |
| 6 | Vercel の 2 段階認証 | 利用者 |

### 今週中にリリースするための優先順位（2026-09-16 に整理 → 2026-09-17 に「今週中」へ改めた）

**利用者の意向（2026-09-17）**: 「リリースは明日ではなく今週中。なるべく早く、でも適当にやりたくない。
**やらなければいけないことを先に早めにやって、細かい機能の調整は後から**」。

**順番の決め方**: 自分では早められない「待ち時間のあるもの」を先に投げ、自分で終わるものを並行で片付ける。

| 種類 | 中身 | いつ |
|---|---|---|
| **① 待ち時間がある（投げるのが早いほど良い）** | Stripe の審査（#84。**09-16 に送信済み**）、Google OAuth の本番公開申請（#13。審査 2〜6 週間）、Business Profile API の承認（#5。申請済み） | **今すぐ投げる。**結果は待つしかない |
| **② 自分で終わる・公開に必須** | A-1〜A-4（`DEFAULT_PLAN=free` / Clerk の登録制限とアプリ名・Legal / 鍵のローテーション / Vercel Pro） | **合計 1 時間以内。**ここが終われば招待した相手に渡せる |
| **③ 最初のお客様を受け入れる準備** | A-5 の通し確認、A-6 の初期設定、#95 の税表記の決定 | ②のあと、最初の 1 社に渡す前 |
| **④ 後から調整でよい** | AI 検索モニタリングの設定（#91）、Ahrefs のキー（#83）、Open PageRank の判断（#86）、Gemini の切替（#85）、プランの置き場所（#93）、機能追加（#15〜#22 など） | **リリース後**。無くても報告書は出る |

**①の Google OAuth 申請（#13）を今週のうちに出すのが、いちばん効く。**審査 2〜6 週間で、通るまでお客様のトークンが 7 日で切れ続けるため。
申請の準備（用途説明文・デモ動画の台本）は Claude が下書きできる。

#### 作業の一覧（A = 公開前に必須 / B = 決済 / C = 後回し可）

**前提（動かせない事実）**: Stripe の決済・入金は #84（セキュリティチェックリスト）が Stripe 側の審査を通るまで止まったまま。**明日までに Stripe の本番課金を通すのは無理**なので、明日は「**招待した相手だけが登録でき、プランは管理画面で個別に開け、初月無料のあいだに Stripe を復旧させる**」形で公開する。決済の入口（`/plans` の「申し込む」）は Stripe 復旧まで開けない。

| 優先 | # | やること | 担当 | 目安 |
|---|---|---|---|---|
| A-1 | 39 | Vercel `DEFAULT_PLAN` を `free` に → Redeploy。これをしないと登録した全員が無料で全機能（Places / Claude の実費が出る）を使える | 利用者 | 5 分 |
| A-2 | 7 | Clerk Production → Restrictions を **許可リスト（お客様のメールだけ）か招待制** に。同じ画面でアプリ名 `My Application` → `SEO Checker`、Legal に `/terms` `/privacy` と登録時の同意 ON | 利用者 | 15 分 |
| A-3 | 9 | 鍵のローテーション: Clerk Production `sk_live_`（会話に貼られた）→ Regenerate → Vercel 更新 → Redeploy。Google OAuth のクライアントシークレットも | 利用者 | 15 分 |
| A-4 | 42 | Vercel を Pro プランに（Hobby は非商用限定。お金をもらった時点で規約違反） | 利用者 | 5 分 |
| A-5 | — | 本番の通し確認（Claude が手順を出し、利用者が画面で見る）: `/admin` の「動いているコミット」= main の先頭 / 外部連携が Anthropic・Places・Supabase・PageSpeed・SerpApi・Chrome UX すべて「設定済み」/ 精密診断を 1 回実行して報告書と PDF が出る / `/tools/maps` `/tools/reviews` `/tools/listings` で保存できる | 利用者 + Claude | 30 分 |
| A-6 | — | 最初のお客様の初期設定: Clerk の許可リストに追加 → 登録してもらう → `/admin` でスタンダード相当を個別開放 → お客様の Google アカウントを Google Auth Platform の **テストユーザー** に追加（OAuth が審査前のため。追加しないと GSC / GA4 が接続できない。トークンは 7 日で切れるので週 1 回つなぎ直しが要る旨を伝える） | 利用者 | 顧客ごと 10 分 |
| B-1 | 84 | ~~Stripe のセキュリティチェックリストに回答を送る~~ → **09-16 に送信済み。審査待ち。**残りは「支払い」が有効に戻ったかの確認（[stripe-checklist-prompt.md](./stripe-checklist-prompt.md) の「送信後の状態」の 4 項目） | 利用者 | 確認 10 分 + 審査 |
| B-2 | — | Stripe の「Multiple capabilities paused」（本人確認・事業情報）を完了 | 利用者 | 15 分 |
| B-3 | — | Vercel / Clerk / Stripe の 2 段階認証。**B-1 より先に**（設問で問われたときに正直に「はい」と答えられるようにするため。手順は [stripe-checklist-prompt.md](./stripe-checklist-prompt.md) の「渡す前の準備」） | 利用者 | 15 分 |
| B-4 | 58-⑧ | Stripe 復旧後: 本番モードで商品・Webhook・ポータル → Vercel の `STRIPE_*` を本番の値に → Redeploy → `/plans` で申し込みが通ることを確認。ここで初めて「申し込む」を開ける | 利用者 | 1 時間 |
| C-1 | 83 / 90 | Ahrefs の新しいキーを Vercel `AHREFS_API_KEY`（+ `AHREFS_API_KEY_ISSUED_AT=2026-09-16`）に → Redeploy → `/admin` で「設定済み」。無いと報告書のドメインパワーから DR の 25 点分が抜けるだけ | 利用者 | 10 分 |
| C-2 | 13 | Google OAuth の本番公開申請（審査 2〜6 週間）。お客様が増えたらテストユーザー 100 人の上限と 7 日失効が効いてくる | 利用者 + Claude | 申請は来週でも可 |
| C-3 | 5 / 54 | Business Profile API の承認待ち（ケース ID `0-4126000041187`）。承認まで口コミ返信は「段階 1（コピーして GBP へ）」で運用 | — | 待ち |
| C-5 | 91 | **AI 検索モニタリング（r76）を動かす**: Supabase の SQL → DataForSEO 登録（前払い $50 程度）→ Vercel に `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` → Redeploy → `/tools/geo` でブランドとプロンプトを登録。下の「AI 検索モニタリングを有効にする手順」に 8 手順の表がある。**明日のリリースには不要**（新機能で、数値が安定するまで 4 週かかるため、落ち着いてから） | 利用者 | 40 分 + 翌朝の確認 |
| C-6 | 93 | AI 検索モニタリングをライトに含めるかスタンダードのままかを決める（下の #93） | 利用者 | 5 分 |
| C-4 | 12 | 規約・特商法の専門家レビュー（r41 の文面は Claude の仮置き。少なくとも運営責任者名・解約条件を利用者が一読する） | 利用者 | 30 分 |

**明日やらなくてよいもの**: **#91・#92・#93（AI 検索モニタリング。新機能なので落ち着いてから）**、#86（Open PageRank の判断）、#85（Gemini の切替。10 月中旬まで）、#89（ビルド 2 回）、#32（SNS の URL）、#15〜#22・#33・#34 の機能追加。

**Claude 側の準備（利用者の GO があれば着手）**: ① B-1 の回答文の下書き ② A-5 の通し確認のチェックリスト ③ A-6 でお客様に渡す「はじめかた」の案内文（Google 連携の 7 日失効の注意を含む）。

### AI 検索モニタリングのテーブル（Supabase SQL Editor で実行。#91）

`/tools/geo` が使う。仕様書は [geo-monitoring-spec.md](./geo-monitoring-spec.md)。
**`geo_measurements` だけは user_id を持たない**（顧客間で結果を使い回して原価を下げる設計。§7.1）。
それ以外は必ず user_id で絞る。RLS は有効のまま、アプリはサーバーの service_role だけで読み書きする。

```sql
-- 1. アカウント（クレジットと実行曜日のオフセット）
create table if not exists geo_accounts (
  user_id text primary key,
  credit_balance numeric not null default 2000,
  credit_reset_at timestamptz not null,
  run_day_offset int not null default 0,
  precision_slots int not null default 5,
  created_at timestamptz not null default now()
);

-- 2. ブランド（自社・競合とエイリアス）
create table if not exists geo_brands (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  brand_type text not null check (brand_type in ('own','competitor')),
  display_name text not null,
  aliases text[] not null default '{}',
  domains text[] not null default '{}',
  aliases_updated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists geo_brands_user on geo_brands (user_id, brand_type);

-- 3. 検索キーワード（順位・AI Overviews）
create table if not exists geo_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  text text not null,
  normalized_hash text not null,
  track_rank boolean not null default true,
  track_aio boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists geo_keywords_user on geo_keywords (user_id);

-- 4. プロンプト（LLM 計測）
create table if not exists geo_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  text text not null,
  normalized_hash text not null,
  is_branded boolean not null default false,
  precision_mode boolean not null default false,
  models text[] not null default '{}',
  tags text[] not null default '{}',
  precision_mode_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists geo_prompts_user on geo_prompts (user_id);

-- 5. 計測（★顧客間で共有。user_id を持たない）
create table if not exists geo_measurements (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  normalized_hash text not null,
  text text not null,
  model text not null,
  locale text not null,
  executed_at timestamptz not null,
  model_version text,
  response_text text not null default '',
  citations jsonb not null default '[]',
  rank int,
  mode text not null default 'standard',
  cost_usd numeric not null default 0
);
-- キャッシュ照会（ハッシュ × モデル × ロケール × 24 時間）が速いように
create index if not exists geo_measurements_cache
  on geo_measurements (normalized_hash, model, locale, executed_at desc);

-- 6. 観測（アカウントごと。計測から導く）
create table if not exists geo_observations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  measurement_id uuid not null references geo_measurements (id) on delete cascade,
  prompt_id uuid,
  keyword_id uuid,
  brand_id uuid not null,
  cited boolean not null default false,
  mentioned boolean not null default false,
  mention_confidence numeric not null default 0,
  position int,
  cited_domains text[] not null default '{}',
  domain_class text,
  observed_at timestamptz not null default now()
);
create index if not exists geo_observations_user on geo_observations (user_id, observed_at desc);

-- 7. クレジット台帳
create table if not exists geo_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action text not null,
  credits numeric not null,
  measurement_id uuid,
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists geo_ledger_user on geo_credit_ledger (user_id, created_at desc);

-- 8. モデル更新の記録（グラフのマーカー）
create table if not exists geo_model_versions (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  version_from text,
  version_to text not null,
  detected_at timestamptz not null default now()
);
```

### 入力待ち（利用者からの回答が要るもの）

- **登録つき無料診断（#117）**: 本番で開く前の作業（`DEFAULT_PLAN=free`・既存契約者の個別開放）が済んだら一言。
- **サイドバーの整理（#111）**: r94 で外した 3 つ（ページ最適化レポート・AIO 頻出トピック・プロンプト拡張）はこれでよいか。さらに減らすか（ページ診断 / 順位計測と検索の推定の一本化）。
- **明日の公開の形（09-16 提案）**: Stripe が止まっているあいだ、最初のお客様の初月（無料）は管理画面の個別開放で使ってもらい、2 か月目の請求は ①Stripe 復旧を待って Checkout で ②請求書（銀行振込）で、のどちらにするか。②なら請求書の発行方法（Stripe の請求書機能は決済停止中は使えない可能性が高いので、手書き / 会計ソフト）
- 運営者名・連絡先メール・所在地（#6）
- Supabase の SQL 実行と Vercel の環境変数登録が済んだという連絡（#3。URL もキーも会話に貼らなくてよい）
- Business Profile API の承認結果（#5 / #54 ①。09-11 申請、ケース ID `0-4126000041187`、7〜10 営業日）。承認されたら #54 の②〜④へ
- 口コミ支援の課金（スタンダードに含めたまま = 現状。店舗数課金にするなら 2 店舗目以降の単価）と、低評価のメール通知を足すか（送信サービスが要る）
- **Clerk のユーザーで `publicMetadata.plan` に `standard` を手で割り当てた人がいないか**（r63 で `standard` の意味が「診断・計測のみ」から「全機能」に変わったため。いれば `light` に直す。誰にも割り当てていなければ何もしなくてよい）。画面: https://dashboard.clerk.com/ → Users → 各ユーザー → Metadata
- プレミアム（伴走）の中身の詰め: レポート代行の範囲と、お見積りの目安（どういう条件だと 150,000 円で、何が増えるといくら上がるのか）。r65 で**所要時間と返信目標の数字は外した**（「月 1 回の報告ミーティング（オンライン）」「優先サポート（メール・チャット）」）ので、約束しているのは頻度と手段だけ。数字を戻すなら `src/lib/plans/catalog.ts` と `marketing/public/index.html`・`public/service-guide.html` の 3 か所
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

**精密診断の実行記録（r56、#66）**:

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

6 つ目（r89、アクセス解析 = 自前の計測タグ。**r90 で取り下げたので実行しない。**記録として残す）:

```sql
create table if not exists tracking_sites (
  key text primary key,
  user_id text not null unique,
  created_at timestamptz not null default now()
);
alter table tracking_sites enable row level security;

create table if not exists tracking_events (
  id bigserial primary key,
  site_key text not null references tracking_sites (key) on delete cascade,
  day date not null,
  ts timestamptz not null default now(),
  visitor text not null,
  type text not null,
  path text not null default '/',
  referrer_host text not null default '',
  channel text not null default 'direct',
  source text not null default '',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  device text not null default '',
  kind text not null default '',
  seconds integer not null default 0,
  scroll integer not null default 0
);
create index if not exists tracking_events_site_day_idx on tracking_events (site_key, day);
create index if not exists tracking_events_site_ts_idx on tracking_events (site_key, ts desc);
alter table tracking_events enable row level security;
```

`tracking_sites.key` はタグに埋め込む公開 ID（20 文字の乱数。`src/lib/analytics/store.ts`）。利用者が `/tools/analytics` を開いた時点で自動で作られる。
`tracking_events` は `type` = pageview / leave / click / form。`visitor` は日替わりハッシュ（IP は保存しない）。生ログは 400 日で消す（報告書を開いたときにそのサイトの分だけ削除。Cron は増やしていない）。

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
- **役割（マスター / 代理店）を増やすときの置き場所**（r77 で追加）。運用者（マスター）の判定は**環境変数 `ADMIN_EMAILS` のまま**にしてある。Clerk 側の値に移すと、Clerk を触れる人が自分を運用者にできてしまう。代理店（`publicMetadata.role`）と担当（`publicMetadata.agencyId`）は Clerk に持つが、`publicMetadata` は Backend API からしか書けないので、お客様がご自分で書き換えることはできない。**クライアントから書ける `unsafeMetadata` を権限の判定に使わないこと。**
- **他人の一覧を引く ID は、必ずログイン中のセッションから取る**（`currentAgencyId()`）。リクエストの本文で受け取った ID を信用すると、他の代理店の担当が見えてしまう。
- **代理ログイン（r79）はお客様のデータがそのまま見える操作。**入れるのは運用者だけ、運用者どうしは不可、チケット 5 分・セッション 30 分、開始時に「誰が・誰に対して」をサーバーログへ記録。代理中は決済 API（申し込み・カード変更・解約）を 403 で塞いでいる。**新しく「取り返しのつかない操作」を足すときは、`isImpersonating()` を見て同じように塞ぐこと。**
- **代理ログインはプライバシーポリシーに書いていない**（#98）。お客様のデータを運営者が閲覧しうることは、規約かポリシーのどこかで触れておくのが望ましい。#12（専門家レビュー）と一緒に見てもらう。

---

## 判断の経緯（なぜそうしたか）

| 日付 | 判断 | 理由 |
|---|---|---|
| 09-17 | **サイドバーは 3 つの並列タブではなく、「AIO 対策」（親）の中に SEO / MEO / サイテーション（柱）が入る入れ子にする**（r95） | 利用者の指示「独立しちゃっているので、くくり的には AI の中に MEO・SEO・サイテーションがあると分かる構成に」。柱は開閉式（開くのは 1 本。r94 の「押した柱が最優先」はそのまま）。AI 検索モニタリングは柱ではなく AIO 対策全体の成果をはかるものなので親の直下。柱の並びは 09-13 の指定（SEO → MEO → 基礎情報）のまま |
| 09-18 | **無料診断はアカウント登録のあと、メールアドレスごとに 2 回まで（サイト + 店舗の合計）。契約済みには見せない。本番の `DEFAULT_PLAN` は `free` にする**（r98） | 利用者の要望と決定（a: 合計 2 回 = 既定案、b: 見せない、c: 切り替える）。見込み客の情報（担当者名・会社名・電話・店舗の種類）を先に集め、無料の体験を 2 回に限って料金プランへつなぐ。Clerk だけで作った（自前のフォーム + `useSignUp`。追加項目は `unsafeMetadata.lead`、回数は `privateMetadata.freeRuns`）。Supabase のテーブルは増やしていない |
| 09-17 | **このサービスは「AIO 対策の可視化ツール」で、SEO に競合より少し力を入れている。AIO 対策 = SEO 対策 + MEO 対策 + 海外を含む基本情報サイトへの NAP 登録（サイテーション）の総称**（r94） | 利用者の指示。サイドバーの位置づけを AIO タブ = 土台（サイテーション・NAP 登録・llms.txt）+ AI 検索の計測、SEO タブ = お客様のホームページの最適化、MEO タブ = Google マップ・口コミ、に直し、タブの下に 1 行の説明を出す。HP 改修提案は「ホームページを直す機能」なので SEO タブへ |
| 09-17 | **サイドバーを「本当に必要な機能」に絞る。外した 3 つ: ページ最適化レポート・AIO 頻出トピック・プロンプト拡張**（r94） | 利用者の指示「いらない機能が多い」。外す基準 = ①同じ答えを別のツールが出す（1 ページの採点はクイック診断、直し方は HP 改修提案）②必要な鍵が多く単独では使いにくい（AIO 頻出トピック = SerpApi + Anthropic）③別のツールの下ごしらえ（プロンプト拡張 → AI 検索モニタリングの設定からリンク）。消したのは画面の部品だけで、定義・API・プランのゲートは `hidden: true` で残す（戻すのは 1 行） |
| 09-17 | **サイテーションは DataForSEO の Google 検索（Live）で作り、ライトに置く**（r94） | SerpApi は未設定、DataForSEO は接続済みで同じ鍵が使える。読む・測る系なのでライト（1 回 = 検索 3 回 ≒ $0.006、24 時間キャッシュ）。地図アプリ（Google / Apple / Bing など）は通常の検索結果に出ないので「主要媒体の掲載状況」には数えず、検索に出る媒体（Yahoo!ロコ・Foursquare・Facebook・Yelp など 8 つ）だけを数える |
| 09-17 | **タブの切り替え不具合の原因と直し方**（r94） | 表示するタブを「開いている画面のタブ ?? 保存したタブ」で決めていたため、タブに属する画面（順位計測など）を開いたままタブを押しても画面のタブが常に勝って切り替わらなかった。「この画面で押したタブ」を最優先にし、別の画面へ移動したらその画面のタブ、共通画面では最後に押したタブ、に変更（`Sidebar.tsx`） |
| 09-17 | **AI の計測を DataForSEO 経由の「AI 検索モニタリング」に一本化し、LLMO モニタリング（直接 API）とセカンドオピニオン（OpenAI）を提供終了**（r92）。OpenAI / Gemini / Perplexity の契約と鍵をやめる。**AI 検索モニタリングはスタンダードのまま**（09-15 の判断「変動費が出るのでスタンダード」を維持。ライトから AI の計測は無くなる） | 利用者の決定「いいですね！それでいきます！」。2 つのツールは「登録プロンプトを AI に投げてブランドの言及・引用を数える」で重複していた。DataForSEO 経由の料金は実費 + 基本料でほぼ同じだが、口座と請求が 3 つ減る。ライトに下ろす案は、以前の判断（変動費）に反するので採らず、料金表に「AI 検索モニタリングはスタンダード」と明記して補った |
| 09-17 | **自前の計測タグ（アクセス解析）は提供しない**（r89 で作り、r90 で取り下げ）。**「お客様側の作業が要る機能は置かない」を新しい線にする** | 利用者の決定「発行したタグをホームページに貼るだけ、はツールで完結しないので面倒。やらない」。GSC / GA4 を止めた理由（お客様側の設定が CS を生む）は、タグの貼り付けにもそのまま当てはまる。サイト内の行動（訪問者・CV）は外部 API では原理的に取れない（gsc-ga4-substitute-design.md）ので、**この領域は数字を出さない**と割り切る。検索の状況は推定（r87）で足りる |
| 09-17 | **Google Search Console と GA4 は使わない。機能ごと提供終了し、代わりに連携の要らない 2 つ（検索パフォーマンス（推定）= r87、アクセス解析（自前の計測タグ）= r89）をライトから使えるようにする** | 利用者の決定「GSC と GA4 は使わない方針で。機能自体はオフにして構わない。それに似たデータを取れるサービスを使えるように」。GSC / GA4 はお客様側の登録・所有確認・権限付与が要り、その CS に人の時間が食われる（09-17 の問題提起）。代替は「API 費用 < CS 費用」の軸で既に決めてあった（gsc-ga4-substitute-design.md）。**コードの削除は安全装置で止められたので、画面は転送・API は 410 にとどめ、削除は利用者の許可を得てから（#105）** |
| 09-17 | **GSC / GA4 の詳細機能（Search Console の実測・サイトレポート・生成 AI 流入分析）はサイドバーに一切出さない**（r85 + r88）。`hidden: true` で消し、ページ・API・プレミアムのゲートは残す | 利用者の指示「GSC と GA4 の詳細機能は基本的にほとんどのユーザーに使われないのでタブから消してください」。お客様側の設定（所有確認・計測タグ）が要る機能は、大半のお客様には「有料」バッジ付きで使えない項目が並ぶだけになり、ライトの人ほど「使えないものが多い」印象になる。ライトには連携の要らない「検索パフォーマンス（推定）」があるので、実測は連携を代行したプレミアムのお客様に URL を渡す形にした。**テストで「プレミアム限定 = 全部 hidden」を固定**（`plans.test.ts`）し、今後プレミアム限定のツールを足してもサイドバーに出ないようにした |
| 09-16 | **ホームページの URL は設定で 1 回だけ登録し、他のタブでは URL を聞かない**（r81）。URL の入力欄を残すのは**競合**と**クイック診断（`/`・`/meo`。見込み客向けで登録が無い）**だけ | 利用者の指示。同じ URL を画面ごとに打ち直させるのは手間で、打ち間違いがあると「タブごとに違うサイトを診断している」状態になり、数字が食い違う。設定に 1 か所だけ正本を置けば、対象がずれない。ページ単位のツール（ページ最適化レポート・HP 改修提案・ページ診断・AIO 頻出トピック）は URL ではなく**登録サイトからのパス**だけを聞き、空欄ならトップページ（ページ診断だけは「検索順位が最も高い自社ページを自動で選ぶ」）。**新しいツールに自社サイトの URL 入力欄を足さない**（規約は ARCHITECTURE.md に記載） |
| 09-15 | **料金を 1 プランから 3 段階にした**（r63）。ライト 38,000 円 / **スタンダード 50,000 円（本命）** / プレミアム（伴走）150,000 円・月 3 社まで | 利用者の提起（極端回避性・おとり効果・松竹梅）。1 つだけ並べると、お客様が比べる軸が「買うか買わないか」＝ 50,000 円 vs 0 円になる。3 つ並べると軸が「どれを買うか」に変わり、両端を避けて真ん中が選ばれやすくなる。上に 3 倍の段を置くと、それが基準になって 50,000 円が手ごろに見える（アンカリング）。**50,000 円という数字は 09-13 の決定のまま動かしていない**。変えたのは、その数字が置かれている文脈だけ |
| 09-15 | 段の切り方は **「AI が作るかどうか」**（ライト = 診断・計測 / スタンダード = + AI が改修案・原稿）。領域別（SEO / AIO / MEO から 1 つ）は採らなかった | この線は `registry.ts` の `plan` フィールドに前からあるもので、恣意的でない。「なぜここで切れているのか」をそのままお客様に説明できるので、おとりだと見抜かれにくい。実装も新しいゲートが要らない（既存の 2 段階を売り物にしただけ）。領域別は 1 領域で満足する層が本命から抜ける危険があり、ゲートの新規実装も要る |
| 09-15 | ライトは **38,000 円**（50,000 円との差は 12,000 円）。極端に安くしなかった | 極端回避性が働くのは、下の段が「安いけれど物足りない」に見えるとき。下が十分安く十分使えると、下が本命になって 50,000 円が売れなくなる。12,000 円差なら「あと少し出せば AI が作る 7 つが全部つく」と見え、下がおとりとして機能する。同時に、ライトを選ばれても損はしない（AI の実費が出ない分むしろ利益率は高い）ので、「おとり側も売れて困らない」条件も満たす |
| 09-15 | プレミアム（伴走）は **月 3 社まで**、Stripe に価格を作らず問い合わせで受ける | 中身が松下の時間（月 1 回のミーティング + レポート代行 + 優先対応 ≒ 月 5〜7 時間 / 社）なので、売れすぎると回らない。枠を切ることで受注量を抑えつつ、希少性がアンカーとしての説得力も足す。画面から即決済できると枠の確認ができないため、`catalog.ts` の `checkout: "contact"` で問い合わせに倒した |
| 09-15 | 値引きの要望には**クーポンではなくライトを案内する**（クーポンは特定の相手向けに残す） | 同じ商品を値引きすると定価が崩れ、「言えば安くなる」が常態化する。段を作った以上、安くしたい人には「安い商品」を売るのが筋。クーポン自体は 09-13 の決定どおり残すが、位置づけを「値引き交渉の道具」から「こちらが渡した相手だけの割引」に戻した |
| 09-15 | 料金表は**高い順**（プレミアム → スタンダード → ライト）に並べ、真ん中に「いちばん選ばれています」を出す | 最初に目に入る 150,000 円が基準になり、50,000 円が相対的に手ごろに見える（アンカリング）。松竹梅の並びも高い順で、日本のお客様には自然。画面が狭いときは 1 列に積むが、順番は変えない |
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

- **SEO 分析ツールは Google 連携を前提にせず、URL だけで動く「精密診断」にする（2026-09-13）**: 利用者の指示。顧客は WordPress を外注していて GSC / GA4 を把握していないことが多い。連携で止まるより、無料・安価な API の指標を集めて AI に語らせる方が「中身の無いコンサル」を置き換えられる。連携は任意の層として残す（[seo-analysis-spec.md](./seo-analysis-spec.md) §0）。

- **精密診断の 6 点は推奨案どおり（2026-09-13）**: 月 10 回・ChatGPT はセカンドオピニオン・URL だけで動く・300 ページ + PSI 6 本・A′ → E′ の順・`/tools/seo-analysis` を 1 つ追加。加えて「最終的には**個々の分析結果ごとに AI の分析を見られるようにしたい**」→ B′ の事実シート → AI 分析は画面ごとの部分シートでも動く形に分ける（報告書 = 各画面の分析の合成）。
- **A′ は新しいルールを足さず、別の層として同梱した（2026-09-14）**: 構成・信頼の指標は「課題（Issue）」ではなく「事実」として扱う。ルールにすると課題件数が跳ね上がって前回比が壊れるうえ、B′ で AI に読ませるのは判定済みの課題より生の数字の方がよい。48 ルールと 10 カテゴリの集計はそのまま。
- **重要度は PageRank 風の計算にした（2026-09-14）**: 被リンク数だけだとナビに載っているページが全部同点になる。リンクの向きを 30 回反復して、トップから近くリンクを多く受けるページが高くなるようにし、サイト内の最大を 100 に正規化して画面に出す。本文のリンクとナビのリンクは別に数える（`main / article / [role=main]` の中で、`nav / header / footer / aside` の外を本文とみなす）。

- **外部連携（API キーの設定状況）はお客様に見せない（2026-09-15）**: 利用者の指示「ユーザーに見える必要はない。マスターアカウントだけが把握していればいい」。設定画面から外し、マスター画面 `/admin` に移した（r57）。お客様の設定画面は「プロジェクト・競合・Google 連携・データ」だけ。各ツールの `SetupNotice`（未設定のキー名を出す案内）はまだお客様にも見えるので、隠すなら別途。

- **サイト診断は精密診断に統合、ページ診断は別のまま（2026-09-15）**: 利用者の質問「3 つの違いは？同じなら統合して」。サイト診断（A1）は精密診断の中で同じクロール + 48 ルールを実行している部分集合なので、二重に持たず統合（r58）。課題一覧・カテゴリ別・ページ一覧・CSV は報告書の「詳細」に残した。ページ診断（A4）は「1 キーワード × Google 上位 10 件 × 自社 1 ページ」の競合比較で軸が違うため別のまま（名前を「ページ診断（競合比較）」に）。前回比（差分）はブラウザ履歴に依存していたので今回は落とした。要望があれば Supabase の前回の run と比べる形で復活できる。

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
- **次**: いまのキーの状態（SerpApi 設定済み・Ahrefs / Open PageRank 未設定）なら、外部リンクの評価（配点 25）以外の 7 指標（配点 75）で採点する。**#83 の Ahrefs（無料）**を入れると 8 指標すべてが埋まる（#80 の Open PageRank は代替なので、DR が入るなら急がない）。

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

### 2026-09-15（他社の無料ドメインパワー測定サイトと同じ数値を出す、r62）

- 利用者「domain パワーを無料で測るサイトと同じ機能を追加したかったんですけど、それは難しいですかね」。r60 は独自の推定値だったので、**他社ツールが出しているのと同じ数値**を足した。
- 調べた結果（2026-09-15 時点）:

| 出どころ | 数値 | 取り方 | 費用 |
|---|---|---|---|
| **Ahrefs の DR** | 0〜100 | **無料の公開エンドポイント** `GET https://api.ahrefs.com/v3/public/domain-rating-free?target=<ドメイン>`（`Authorization: Bearer <無料アカウントの APIv3 キー>`）。**API ユニットを消費しない**。回数制限は API 全体の既定 1 分 60 回（429） | **0 円** |
| Open PageRank | 0〜10 | ラッコキーワードの「ドメインパワーチェックツール」が使っているのと同じもの（r60 で実装済み） | 0 円 |
| Moz の DA | 0〜100 | Moz Links API。無料枠は**月 50 行・10 秒に 1 回**。有料は $20/月（3,000 行）〜 | 無料枠あり |
| DataForSEO の domain rank + 実際の被リンク数 | 0〜100 + 件数 | Backlinks API。2026 年 7 月から月額の最低契約が無くなり従量のみ | 1 回 約 $0.024（≒4 円） |
| パワーランクチェックツール（ispr.net） | 独自 0〜100 | **API の提供なし**（ゲスト 1 日 3 回 / AJID 登録で 10 回）。中で複数の有料ツールを使っている。スクレイピングは規約・安定性の両面で採らない | — |

- **採ったのは Ahrefs の DR**。無料ツールで一番よく参照される数値で、費用ゼロ、利用者の作業は無料アカウントの API キーを 1 つ作るだけ（#83）。
- **r61 の実装**: `src/lib/domain-power/ahrefs.ts`（`AHREFS_API_KEY`。401 はキーの問題と分かる文言、429 はキャッシュに残さない、応答は入れ子 `{domain_rating:{domain_rating,license}}` と平たい形の両方を読む）。配点 25 点の「外部からのリンクの評価」は **DR があれば DR（0〜100、30 以上で「強い」）、無ければ Open PageRank（0〜10）**で採点する。
- 報告書のカードに「よく使われる無料ツールと同じ指標」の枠を追加し、DR と Open PageRank を素の数値で並べた（他社の測定サイトと突き合わせるため）。競合比較の表にも DR の列を足した。KPI の補足にも `Ahrefs DR nn` が出る。
- **帰属表示**: Ahrefs の条件により DR の表示には「Domain Rating by Ahrefs」のリンクが必要。カードに入れてあるので消さないこと（`AHREFS_ATTRIBUTION` / `AHREFS_URL`）。
- 検証: lint / tsc / test（1,718 件。ドメインパワーは 41 件。同じ日に別セッションが入れた「数字の診断」と合流させたうえで通した）/ build 通過。
- 09-16 利用者「Ahrefs の API は回数制限はないの？」→ 公式の既定は **1 分 60 回**（前日に書いた「40 回」は第三者のラッパーの制限だったので訂正）。詳細は上の「Ahrefs の DR を有効にする手順」の注意書き。**この環境からは外部接続が塞がれているため、実際の API 応答は本番で初めて通る**（#83 の 6 で確認する）。応答の形が違っても parse は null を返して「未取得」になるだけで、報告書は止まらない。
- 見送った案: Moz の DA（無料枠が月 50 行・10 秒に 1 回と細く、DR ほど参照されない）、DataForSEO（実際の被リンク数・参照ドメイン数まで出せるが有料。欲しくなったら別途 提案する）。


### 2026-09-15（料金プランを 3 段階に、r63）

- 利用者から「極端回避性（妥協効果）・おとり効果・松竹梅」の整理が共有され、**この話を踏まえて価格を見直したい**という依頼。
- こちらから 3 案（A: AI が作るかどうかで分ける / B: 領域別ライト / C: 2 段階のまま上に伴走を足す）と価格の選択肢を提示。
  利用者の回答は「**AI がコンサルしてくれるのがスタンダード。物足りないのがライト、やりすぎなのがプレミアム**」「38,000 / 50,000 / 150,000」「上は伴走・月 3 社限定」。
- 実装（r63）:
  - `PlanId` を `free` / `light` / `standard` / `premium` に。**旧 ID の `pro` は `toPlanId()` が `standard` に読み替える**ので、Vercel の `DEFAULT_PLAN=pro` も Clerk に残った値もそのまま動く。
  - 機能ごとの `plan` を付け替え（読む・測る 12 個 → `light`、AI が作る 7 個 → `standard`）。プレミアム限定のツールは作っていない（人の作業だけを足す段）。
  - Stripe をプランごとの Price に対応（`STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_LIGHT`。`STRIPE_PRICE_PRO` は旧名として読む）。契約状態（`publicMetadata.stripe`）に **どのプランを買ったかを保存**するようにし、保存が無い古い契約はスタンダード扱い（free に倒すと払っている人が使えなくなるため）。
  - `/plans` の料金表を高い順の 3 列にして、プランごとに「申し込む」ボタン（`PlanCheckoutButton`）を置いた。プレミアムは `contact@seo-checker.tokyo` への問い合わせボタン。
  - 紹介サイト（料金セクション・JSON-LD の Offer 3 本・FAQ・ヒーロー・概要表・meta description）、`public/service-guide.html`（**5,000 / 10,000 円のまま 2 世代放置されていた**ので合わせて更新）、特商法の表記、README、仕様書のプラン名を更新。
- 検証: lint / tsc / test（1,724 件）/ build すべて通過。
- 利用者の残作業: Stripe に商品「ライト」＋価格 ¥38,000 / 月を作る → `STRIPE_PRICE_LIGHT` を Vercel に登録 → Redeploy（#58 の 1・6）。カスタマーポータルの「プランの変更」を ON に（#58 の 3）。Clerk に `publicMetadata.plan = standard` を手で割り当てた人がいないかの確認（意味が変わったため）。


### 2026-09-16（Stripe のセキュリティチェックリストが期日超過 → #84）

- 利用者が Stripe の設定画面を確認したところ、赤帯「Multiple capabilities paused / A required task is past due」。タスクの詳細は **Additional information required**、内容は
  `All businesses in Japan are required to complete the security checklist to process payments. Please provide additional information.`、期日 **09/09**、
  **影響: 決済・入金とも 2026/09/09 に一時停止**。進捗は「送信済み → 審査中 → 完了」の 3 段階で、まだ 1 つ目にも入っていない。
- 日本の加盟店に求められるセキュリティ確認（不正利用対策・管理画面のアクセス管理・脆弱性対策など）で、**Stripe 側の審査があるため時間がかかる**。#58 の ⑧（本番モード）より先に片付ける必要がある。テスト環境（サンドボックス）の検証は影響を受けないので、#58 の 1〜7 は並行して進めてよい。
- 回答に使える、このサービスの実態（設問に答えるときの材料。Claude が下書きする場合の根拠）:
  - **カード情報はアプリを一切通らない**。入力は Stripe Checkout のホスト画面で、こちらが受け取るのは顧客 ID（`cus_…`）とサブスクリプション ID だけ（`src/lib/billing/`）。PCI DSS でいえば SAQ A に相当する構成。
  - 保存しているのは Clerk のユーザーの `publicMetadata.stripe`（契約状況・金額・次回更新日）と `privateMetadata.stripeCustomerId`。**カード番号・有効期限・セキュリティコードはどこにも保存していない**。
  - 管理画面（`/admin`）は Clerk のログイン + `ADMIN_EMAILS` の一致で制限。アプリ全体のログインは Clerk（Google SSO）。
  - Webhook は Stripe の署名検証つき（`STRIPE_WEBHOOK_SECRET`）。古いイベントで新しい状態を上書きしない作り。
  - ホスティングは Vercel、DB は Supabase（店舗情報・診断結果のみ。決済情報は持たない）。
  - **未対応**: Clerk と Stripe ダッシュボードの多要素認証（2 段階認証）、Clerk の登録制限（#7）、鍵のローテーション（#9）。チェックリストで問われる可能性が高いので、回答の前に済ませておくとよい。


### 2026-09-16（プレミアムの契約を Stripe から正しく読む、r64）

- 利用者「**プレミアムは無くてもいいの？**」（Stripe に商品を作らなくてよいのか）。作らなくてよい、と答えたうえで、r63 の抜けが 1 つ見つかった。
- **見つけた抜け**: r63 は Price ID → プランの対応表を「画面から買えるプラン」だけで引いていた。プレミアムは `checkout: "contact"` なのでこの表に無く、
  受注した相手に支払いリンク・請求書で 150,000 円のサブスクリプションを立てると、**価格が対応表に無いため本命（スタンダード）として記録される**。
  しかも `getCurrentPlan()` は契約状態を `publicMetadata.plan` より先に見るので、**あとから手で `premium` を入れても上書きされない**。
  機能は開く（プレミアム限定のツールは無い）が、お客様の画面とマスター画面に「スタンダード」と出てしまう。
- **直し方（r64）**: `STRIPE_PRICE_PREMIUM`（任意）を足し、`planForPriceId()` は全プランを見るようにした。
  申し込みの可否を決める `purchasablePlanIds()` は今までどおり画面から買えるプランだけなので、**料金画面にプレミアムの「申し込む」は出ない**。
  「買えるか」と「読めるか」は別、という線引き。回帰テスト `src/lib/billing/__tests__/stripe-prices.test.ts` で固定した。
- 検証: lint / tsc / test（1,729 件）/ build 通過。
- **プレミアムを受注したときの手順**（決まったので記録）: Stripe で商品「プレミアム（伴走）」＋価格 ¥150,000 / 月 を作る →
  支払いリンクか請求書でその顧客に契約を立てる → **その Price ID を Vercel の `STRIPE_PRICE_PREMIUM` に入れて Redeploy** →
  以後その契約は「プレミアム」として記録される。1 社目を受注するまでは何もしなくてよい。

### 2026-09-16（GA4 の診断ルールとイベント名の共通化、r65）

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

### 2026-09-16（突き合わせルールと、報告書の見せ方の作り直し、r66）

- 利用者の指示「**ユーザー体験の質を上げてください**」。G5（Search Console × GA4）を進めつつ、報告書の読みやすさを作り直した。

**1. G5 は 20 件ではなく 8 件にした**

- 仕様書 §11 の 20 件を見直したところ性質がバラバラだった。**実装したのは X02・X03・X14〜X18・X20 の 8 件**。
  - 除いたもの: 既存ルールと重複（X04 = T02、X08 = K02、X09 = K04、X10 = K05）／ただ同時に起きているだけ（X01・X05・X06・X07・X12・X13 → まとめるのは LLM の仕事。§25 の設計方針そのもの）／データ不足（X11 = CRM、X19 = 遷移データ）。
  - 理由は `rules/cross.ts` の `CROSS_SKIPPED` にコードとして残し、テストで固定した。件数を水増しせず、同じ指摘が報告書に 2 回出ないことを優先。
- **X02 がいちばん重い**（重要度 = 重大）。「検索のクリック 1,000 に対して GA4 の自然検索セッションが 400」のような乖離は、**他のすべての数字の信用度を決める**。Direct の比率が高ければ手がかりとして添える。

**2. 報告書の見せ方（`summary.ts` = 純関数 + `DiagnosisCard`）**

- 134 ルールを平置きにしていたのをやめ、**まず手を付けるところ（上位 3 件）→ 訪問後の流れ → そのほか（重大・高は開き、中・低は折りたたみ）→ つなぐと分かること**の順に組み替えた（§15 の「優先施策は上位 3 件」に合わせた）。
- **ルール ID（T02 など）を行の先頭から外した。**内部の符号なので、詳細を開いたときだけ出す。
- **ファネルの「いちばん落ちている段階」の判定を直した。** 素の率どうしを比べると、訪問 → CTA（数 % が普通）が必ず最下位になって役に立たない。`thresholds.funnelReference`（段階ごとの目安。業種プリセットで変わる）に対してどれだけ足りないかで決め、**目安を下回った段階だけ色を変える**ようにした。
- **発火 0 件の書き分け**: 「問題が見つからない」と「まだ診断できていない（連携が無い）」を区別。データ不足のときは件数バッジも出さない（「1 件」と「まだ診断できていません」が同時に出ていた）。
- **「データが揃えば判定できる項目」から開発者向けの ID を消した。**「GA4 と連携すると、訪問したあとの行動を診断できます（判定項目が 47 件増えます）」のように利用者の行動として書き、設定画面へのボタンを付けた。件数は実装済みルールから数えているので、ルールを足せば自動で増える。

**3. PDF の不具合を見つけて直した（既存の不具合）**

- **PDF は `@media print` ではなく DOM の複製（`.pdf-capture`）を画像化して作っている**ので、Tailwind の `print:block` / `print:hidden` は **PDF にまったく効いていなかった**。
- そのため「画面で開かずに PDF を作ると、折りたたんだ部分が丸ごと抜ける」状態だった。影響していたのは **付録の事実シート**、**詳細のサイト診断**、r61 で入れた診断カードの詳細。お客様に渡す PDF から中身が落ちていたことになる。
- `globals.css` に `.print-expand`（`.pdf-capture` と `@media print` の両方で開く）を足し、報告書の折りたたみを全部そちらに寄せた。画面専用の操作は既存の `no-print` に統一。
- 同じ間違いを繰り返さないよう、**`src/app/__tests__/pdf-capture-css.test.ts` に「報告書の部品が `print:block` / `print:hidden` を使っていないこと」のテストを追加**し、[ARCHITECTURE.md](./ARCHITECTURE.md) にも約束として書いた。
- 画面は実際にブラウザで描いて確認した（ダミーデータの一時ページを作り、広い画面 1,200px と狭い画面 400px で横スクロールが出ないこと、ファネルの細い段階でもバーが見えること、目安を下回った段階に色が付くことを確認して削除）。
- **検証**: lint / tsc / test（**1,816 件**。診断のテストは 165 件）/ build 通過。
- **次**: 残りは G7（人間による承認の工程）と G8（CRM）。どちらも「いま要るか」の判断待ち。

### 2026-09-16（評価方法と指標の資料を整備）

- 利用者の依頼「**この評価方法や指標をどこかに .md ファイルでまとめておいてください。バックエンドの仕組みを把握しておきたくて**」。コードは触っていない（ドキュメントのみ）。
- **[scoring-reference.md](./scoring-reference.md) を新規作成**（正本）。このサービスが出すすべての数字について、何を測り・どう計算し・何を根拠にし・**それを使って言ってはいけないこと**を 1 か所にまとめた。数値はすべてコードから拾って書いた（推測で書いていない）。
  - §0 全部に共通する約束（測れなかったものを 0 点にしない／分母 0 は 0% ではなく「—」／率の平均を取らない／前期 0 は「新規発生」／「未計測」と「0 件」を書き分ける、ほか 8 件）と、共通のグレード（A〜E）
  - §1 クイック診断（5 カテゴリの重み 20/25/20/15/20、項目の重み 1〜3）
  - §2 サイト診断 48 ルール（`AUDIT_THRESHOLDS` の主要な閾値 10 件）
  - §3 サイトの構成・信頼（9 判定。プライバシーポリシーの判定が条件で変わることも明記）
  - §4 ドメインパワー（8 指標の配点と満点条件、段階の刻み、`MIN_MEASURED_MAX = 30` で合計点を出さない条件、グレード境界）
  - §5 速度（CrUX と PSI の使い分け =「速いか」と「なぜ遅いか」）
  - §6 検索での見え方（SerpApi）
  - §7 数字の診断 134 ルール（内訳表、重要度 4 段と確度 3 段のスコア、優先度スコアの式、閾値 18 件、ファネルの目安、主な計算式 9 本、再現性）
  - §8 MEO（採点基準 v2 の閾値。オーナー申告の分も実数で）
  - §9 AI の使い方と検証（事実シートだけ渡す／ID の引用／数値の照合と作り直し／回数と費用）
  - §10 してはいけない解釈（横断。§18 の要点）
  - §11 どこを見れば確かめられるか（項目 → ファイルの対応表）
- **[tool-map.md](./tool-map.md) を main に入れて更新した。** このファイルは 2026-09-12 に作ったあと**作業ブランチ `claude/tool-relationships-api-diagram-jdyj3h` に置いたままマージされておらず、OPERATIONS.md からのリンクが切れていた**。ブランチから取り出して main に入れ、その後の変更を反映した。
  - 追加した鍵: `AHREFS_API_KEY` / `OPENPAGERANK_API_KEY` / `CRUX_API_KEY`、キー不要の RDAP
  - ツール表を現状に合わせた（パワーアップ分析を追加、サイト診断は統合済みで `hidden`、プランを 3 段階 light / standard / premium に、クイック診断への改名）
  - 「パワーアップ分析が 1 回で触る外部 API」の内訳表を新設（回数の目安と実費）
  - Supabase の表に `analysis_runs` を追加、決済を 3 段階に、`STRIPE_PRICE_PREMIUM` が「買えるか」ではなく「読めるか」のためであることを明記
  - 「キーが切れたら何が止まるか」に Ahrefs / Open PageRank / PageSpeed（CrUX）と、**Google 連携が無いと数字の診断の 126 ルールが判定されない**ことを追加
- **OPERATIONS.md の冒頭に「読む順番」を置いた。** バックエンドを把握したい人は scoring-reference → tool-map → services → ARCHITECTURE の順。ARCHITECTURE.md の冒頭にも関連リンクを追加。
- ドキュメント内の相対リンクが全部つながっていることを確認した（リンク切れ 0 件）。

### 2026-09-16（プレミアムを「150,000 円〜・お見積り」表記に、r67）

- 利用者の指示「**15 万〜という表記にして ASK みたいなニュアンスを強めてください。そうすれば決済はまた別で用意できます。いったん ASK でお願いします**」。
- **なぜこれでよいか**: 定額に見せると、重い案件（多店舗・大規模サイト）でも 150,000 円で受けざるを得なくなる。
  下限だけを出せば**アンカーとしての働きは変わらない**（先に目に入る数字が基準になるという点では同じ）うえ、実際の受注では中身に合わせて積める。
  決済も受注ごとに支払いリンク・請求書で立てる前提なので、画面から買えない今の作り（`checkout: "contact"`）と噛み合う。
- 実装（r67）:
  - `catalog.ts` に `priceFrom`（true なら表示に「〜」を付ける）と `contactLabel` を追加。`planPriceLabel("premium")` は「月額 150,000 円〜」。
  - 料金表のボタンを「**お見積りを依頼する**」に、メールの件名も「プレミアム（伴走）のお見積り依頼」に。`limitNote` は「月 3 社まで・お見積り」。
  - **特商法の販売価格**に「ご依頼の範囲に応じて個別にお見積りし、お申し込み前に金額をご提示します」を追記。
    金額を 1 つだけ書くと「その額で申し込める」と読めてしまうため（`priceFrom` のプランだけこの文が出る）。
  - 紹介サイト・サービス資料・README を「150,000 円〜（お見積り）」に。**JSON-LD の Offer は `price` をやめて `priceSpecification.minPrice`** にした（下限であることを構造化データでも正しく表す）。
  - あわせて**約束の数字を外した**: 「60 分」「平日 24 時間以内に返信」→「月 1 回の報告ミーティング（オンライン）」「優先サポート（メール・チャット）」。
    見積り制にした以上、時間や返信目標は案件ごとに決めるほうが筋が通る。
- 検証: lint / tsc / test（1,730 件）/ build 通過。
- **利用者の作業は増えていない**。Stripe にプレミアムの商品を作るのは、1 社目を受注してからのままでよい（#84 の手順は r64 のログ）。

### 2026-09-16（マスター画面の外部連携に料金・上限・公式リンク、r68）

- 利用者「マスター画面に API がまとまっているが、料金や上限をドロップダウンで見られるようにして。公式サイトのリンクをタップで開けるように」。
- **r68**: `/admin` の「外部連携」を表から**行ごとに開閉できる一覧**（`<details>`）に変えた。行をタップすると **料金 / 上限・超えたときの動き / このツールでの消費量** の 3 欄と、**公式サイトのリンク**（料金・レート制限・ダッシュボード・API キーなど。別タブ）が出る。文言は `src/lib/features/integrations.ts` の `pricing` / `limits` / `usage` / `links`。確認日 `PRICING_CHECKED_AT = 2026-09-16` をカードの説明に出し、単価はリンク先で確かめてもらう前提にした。
- 載せた値（09-16 に確認。単価は変わるので、変わったら `integrations.ts` を直して確認日を更新する）:

| 連携 | 料金 | 上限 |
|---|---|---|
| Anthropic | 従量（前払い）。Opus 5 = $5 / $25、Haiku 4.5 = $1 / $5（100 万トークン） | Tier ごとの RPM / TPM。残高 0 で停止 |
| OpenAI | 従量（プリペイド）。gpt-5 + Web 検索ツールは別建て | Tier ごとの RPM / TPM |
| Gemini | 2.5 Flash は無料枠あり。有料 $0.30 / $2.50。**2.5 Flash は 2026-10-16 提供終了予定 → `GEMINI_MODEL` の切り替えが要る** | 無料枠 1 分 15 回・1 日 1,500 回程度 |
| Perplexity | sonar $1 / $1 + 1 リクエスト $5〜12 / 1,000 件の検索料金 | Tier ごとの RPM |
| SerpApi | 無料 100 回 / 月（250 の表記もあり）、$25 = 1,000、$75 = 5,000、$150 = 15,000 | 月の回数を使い切ると検索がエラー |
| PageSpeed / CrUX | 無料 | 1 日 25,000 回・100 秒 400 回（買い足し不可） |
| Ahrefs（DR） | 無料（ユニット消費なし） | 1 分 60 回 |
| Open PageRank | 無料 | 1 日 1,000 リクエスト・1 回 100 ドメイン |
| GA4 Data API | 無料 | 1 日 200,000・1 時間 40,000 コアトークン・同時 10 |
| Places API (New) | SKU ごと無料枠 Essentials 10,000 / Pro 5,000 / Enterprise 1,000（月） | 使い切ると自動課金 → 予算アラート必須 |
| Supabase | Free $0（DB 500 MB、2 プロジェクト）、Pro $25 / 月 | **1 週間アクセス無しで一時停止**。500 MB 超で書き込み停止 |

- 気づき: **Gemini 2.5 Flash（LLMO の Gemini 列の既定モデル）が 2026-10-16 に提供終了予定**。10 月中旬までに `GEMINI_MODEL` を後継の Flash に切り替える（#85）。
- 検証: lint / tsc / test（1,817 件）/ build 通過。UI の変更だけで、API・保存形式は変えていない。

### 2026-09-16（返答フォーマットの追加と、古いブランチ 12 本の削除）

- 利用者の指示 ①「**今回の作業がどう合流したかの図を毎回会話の後に表示されるようにメインに merge して**」→ `CLAUDE.md` に
  「**返答フォーマット: 合流の図（必須）**」を追加した。コミットを作った返答では、最後に (1) いまどこにいるか (2) 今回の作業がどう合流したか
  (3) リリース番号の一覧、を図と表で出す。**値は必ず実際の git から取り、SHA・ブランチ名を推測で書かない**ことをルールに明記。
  - 未マージの作業ブランチ `claude/claude-response-format-t9moa7`（2026-09-06）に、同じ趣旨の古いルール案が眠っていた。
    削除する前に中身を読み、「必ず git の実状から取る / 捏造しない / 取れないものは不明と書く」という良い部分を新しいルールに引き継いだ。
- 利用者の指示 ②「**古いブランチ 12 本をすべて削除できるなら削除して**」→ **こちらからは削除できなかった（#85）。**
  `git push origin --delete <ブランチ>` が **HTTP 403** で拒否される。通常の push は通るので、
  このセッションの認証が **ref の削除だけを許可していない**。GitHub MCP にもブランチ削除のツールは無い。
  **削除は利用者の画面操作が必要**（手順は #101。2026-09-17 に #85 が Gemini のタスクと重複していたので振り直した）。削除してよいことは下記のとおり確認済み。
  - 12 本とも**いまの main と共通の祖先が無い**（`git merge-base` が空）。リポジトリの履歴を作り直す前のもので、
    そもそも今の main にマージできない。中身は作り直したあとの main に入り直しているか、役目を終えている。
  - 主な成果物が今の main にあることは確認済み: `docs/dev/tool-map.md`、`src/lib/pdf/download.ts`、
    `src/app/admin/page.tsx`、`src/components/free/ServiceGuide.tsx`、noindex の判定（`src/lib/page-report/`）、
    口コミアンケートの多言語（`src/lib/reviews/translate.ts`）。
  - **削除対象と、復元するための記録**（GitHub の Branches 画面で消したブランチは一定期間 Restore できる）:

| ブランチ | 先頭 SHA | 最終コミット日 | 最終コミット |
|---|---|---|---|
| `claude/aio-diagnosis-multilingual-jh9apk` | `f98e5a8` | 2026-09-13 | 運用メモを更新: ブランチのコミットを追記 |
| `claude/claude-response-format-t9moa7` | `50b33ed` | 2026-09-06 | CLAUDE.md に返答フォーマットのルールを追加 |
| `claude/deploy-hp-content-i82npa` | `172cf8d` | 2026-09-10 | Merge remote-tracking branch 'origin/main' |
| `claude/deploy-merge-main-evgrco` | `3149ae2` | 2026-09-06 | Add SEO Checker (AIO diagnostics + FAQ generation) Next.js app |
| `claude/happy-mendel-xul1eh` | `57b0c08` | 2026-09-12 | 運用メモを更新: 無料診断の切り出しと zip の作り方 |
| `claude/merge-to-main-j2rew5` | `e6a0366` | 2026-09-09 | 料金プラン・改善提案・管理画面とサービス資料を追加 |
| `claude/merge-to-main-zs5iea` | `7408aee` | 2026-09-08 | ログイン（Clerk）と利用者ごとの Google 連携、検索パフォーマンス画面を追加 |
| `claude/pdf-save-feature-jz2o4o` | `e8f8d2b` | 2026-09-06 | 印刷ダイアログを開かずに PDF をダウンロードするボタンを追加 |
| `claude/search-noindex-breadcrumb-bb0b70` | `e18f3a1` | 2026-09-12 | サイト診断: 検索に載せないページを採点対象外（参考）にする |
| `claude/tool-relationships-api-diagram-jdyj3h` | `bd9ee3b` | 2026-09-12 | ツールと API キーの関係図を追加（docs/dev/tool-map.md） |
| `claude/update-9jqj64` | `d61c774` | 2026-09-07 | アップロード版一式に更新（AIO/LLMO ツール群とドキュメントを追加） |
| `claude/wolf-g-content-score-diff-dj9cye` | `34472b6` | 2026-09-06 | サイト単位の診断を追加し、ページ間で不当に差が出る採点を修正 |

- **残したブランチ**: `main` と、いま動いているセッションの作業ブランチだけ。作業ブランチは main にマージ済みでも、
  そのセッションが続いている間は消さない（消すとそのセッションの push 先が無くなる）。

### 2026-09-16（「パワーアップ分析」を「精密分析」に改称、r69）

- 利用者の指示「パワーアップ分析の名前を精密分析に変えてください」。
- **画面・PDF・紹介サイト・サービス資料・料金表・オンボーディング・README・設計ドキュメント・コード中の説明文**をすべて `精密分析` に置換（30 ファイル）。サイドバーの表示、PDF のファイル名（`精密分析_<ドメイン>_<日付>.pdf`）、`/tools/site-audit` の転送案内、Google 連携のイベント割り当ての保存メッセージも新しい名前になる。
- **変えていないもの**（意図的）:
  - **URL `/tools/seo-analysis` と API `/api/seo-analysis/*`**、`src/lib/seo-analysis/`、Supabase の `analysis_runs` テーブル。英語の識別子は「精密分析」でも意味が通り、変えるとブックマーク・保存済みの履歴・テーブル定義まで壊れるため。
  - **リリース履歴（`releases.json`）と、この運用メモの「作業ログ」の過去の記述**。当時の名前のままにしてある（後から読んだときに、いつ何が起きたかが変わってしまわないように）。**旧称「パワーアップ分析」= 現在の「精密分析」**。
- **名前が近い用語との関係**: このツールとは別に、無料の「クイック診断」に対する有料側の総称として **「精密診断」**（`PAID_DIAGNOSIS_LABEL`）を使っている。今回の「精密分析」は `/tools/seo-analysis` という個別ツールの名前で、別物。1 文字違いで紛らわしければ、どちらかを変える（例: 有料側の総称を「有料プラン」に、またはツール名を「精密SEO分析」に）ので声をかけてほしい。
- 検証: lint / tsc / test（1,817 件）/ build 通過。文言だけの変更で、API・保存形式・採点ロジックは触っていない。

### 2026-09-16（呼び名を「精密診断」に統一、r70）

- 利用者の指示「精密診断に統一してください」。r69 で付けた「精密分析」を、既にあった有料側の総称「精密診断」に寄せた。**これで `/tools/seo-analysis` のツール名と、クイック診断（無料）に対する有料側の総称が同じ言葉になった**（クイック診断 ⇔ 精密診断）。
- 名前の変遷: 「パワーアップ分析」→（r69）「精密分析」→（r70）**「精密診断」**。
- **名前の置き場所を 1 つにした**: `src/lib/features/registry.ts` の `PAID_DIAGNOSIS_LABEL`。サイドバーのツール名（`label` / `shortLabel`）はこの定数を参照するようにしたので、**次に名前を変えるときはこの 1 行だけ**直せばサイドバーは付いてくる（説明文・報告書・紹介サイトの本文は個別の文言なので別途）。
- ついでに直したもの:
  - `src/app/api/site/route.ts` のコメントが「精密診断（/tools/site-audit）」と古い経路を指していたので `/tools/seo-analysis` に修正（サイト診断は r58 で統合済み）。
  - 料金プラン「未契約」の説明が「診断ツールは精密診断のお申し込み後に…」と堂々巡りになるので「有料プランのお申し込み後に…」に変更。
- **気づいた点（利用者の判断待ち）**: 料金プランの説明文で、**ライト**の highlights は「SEO: サイト診断・…」と**旧称の「サイト診断」**のまま、**スタンダード**は「精密診断: サイト全体の診断と、AI による現状分析・改善案」になっている。サイト診断は r58 で精密診断に統合されたので、いまのライトの書き方だと「ライトでも精密診断が使えるのか？」が読み取れない。どちらが正か（＝精密診断はライトに含めるのか、スタンダードだけか）を決めてもらえれば、料金表・紹介サイト・サービス資料をまとめて直す。
- 検証: lint / tsc / test（1,817 件）/ build 通過。文言と定数の参照だけで、API・保存形式・採点ロジックは触っていない。

### 2026-09-16（精密診断をライトにも / llms.txt の有無を評価、r71）

利用者の指示 2 件。

**1. ライトでも精密診断が使える（料金の線引きの変更）**

- 料金プラン（アプリの `/plans`・紹介サイト・サービス資料）で、**精密診断をライト（38,000 円）に含める**ように直した。スタンダードからは重複する行を外し、差は「AI が原稿・改修案そのものを作る 7 つのツール」だけになった。
- 言い回しも揃えた: ライトは「診断と計測がすべて使えます（AI が現状分析と改善案を書く精密診断も含みます）」。旧「AI が改修案・原稿を作るツールは含みません」は、精密診断の AI 分析と読み手が混同するので「**AI が原稿・改修案そのものを作るツールは含みません**」に変更。
- ついでに**古い名前と古いプラン名も直した**: 紹介サイト・サービス資料の「サイト診断」（r58 で精密診断に統合済み）→「精密診断」。サービス資料のバッジが実在しないプラン名だったので、同じ資料の料金表に合わせて **診断・計測 11 個 = ライト、AI 生成 3 個 = スタンダード**（旧「プロ」）に修正。

**2. 精密診断で llms.txt の有無を評価する**

- `src/lib/seo-analysis/llms.ts` を追加。収集の段階で `/llms.txt` と `/llms-full.txt` を取りに行き、**有無**と、あるときは中身の作りを判定する。判定は**生成ツール（`/tools/llms-txt`）と同じ `validateLlmsTxt`** を使うので、2 つの画面で基準が食い違わない。
- 見るもの: ファイルの有無 / サイズ / `# サイト名` / `> 概要` / `## セクション` / `- [題名](URL): 説明` の記法 / 説明が付いているリンクの割合 / 絶対 URL か / llms-full.txt の有無。
- **リンク切れの確認はしない**（リンクの数だけ追加リクエストが要るため）。それは `/tools/llms-txt` の検証タブの役目で、カードにもその旨を書いてある。
- 報告書に「llms.txt（AI 向けの案内ファイル）」カードを追加。**無いときは黄色の枠で「まだありません」+ 生成ツールへの案内**、あるときは判定の一覧を出す。事実シートに領域 `llms`（ID は `L-01`〜）が増え、AI はこれを引用して分析を書く。
- AI のプロンプトに 1 行足した: **llms.txt はまだ必須ではないので、無いことを致命的な欠陥のように書かせない**（優先度を上げすぎない）。
- 費用は 0（自前で 2 ファイル取りに行くだけ。API キー不要）。所要時間もほぼ増えない（他の取得と並行）。
- 事実 ID の頭文字が三項演算子の長い連鎖になっていたので、`AREA_PREFIX` の対応表に直した（領域を足すときはここに 1 行足す）。

- 検証: lint / tsc / test（**1,825 件**。llms.txt の評価は 6 件 = あり / なし / HTML を返す 404 ページ / 中身が薄い / 取得失敗 / llms-full.txt だけある）/ build 通過。
- **利用者の作業は無し**。次回の精密診断から自動で出る。

### 2026-09-16（外部連携のリンク切れを修正 / Open PageRank の旧 API 終了が判明、r72）

- 利用者が #83 の手順 1 のリンクを開いたら **Ahrefs が 404**（画面を共有してもらった）。こちらが URL を推測で書いていたのが原因。**このセッションで追加した外部リンクを全部検証し直した。**

**直したリンク**

| どこ | 誤 | 正 |
|---|---|---|
| Ahrefs 登録（#83 手順 1） | `ahrefs.com/user/signup`（404） | `ahrefs.com/signup?plan=awt`（無料の Ahrefs Webmaster Tools） |
| Ahrefs API キー（よく使う URL・#83 手順 2・マスター画面） | `app.ahrefs.com/account/api/keys` | `app.ahrefs.com/account/api-keys` |
| Open PageRank ログイン（マスター画面） | `.../auth/signin` | `.../auth/login` |

**判明したこと 2 つ**

1. **Ahrefs の API キーは有効期限が 1 年**。切れると DR が「未取得」になるだけで報告書は出るが、気づきにくいので手順表とマスター画面の「上限」欄に書いた。帰属表示の条件も正確に書き直した（「Domain Rating by Ahrefs」の文字だけでなく **https://ahrefs.com/ への機能するリンク**が必須。隠す・消すのは規約違反）。
2. **Open PageRank の旧 API が 2026-09-30 に終了する**（あと 2 週間）。運営が Keywords Everywhere に統合され、基盤が `openpagerank.keywordseverywhere.com`、認証が Bearer トークンに変わる（無料枠は月 30,000 ドメイン）。`src/lib/domain-power/openpagerank.ts` はまだ旧エンドポイントを呼んでいる。
   - **#80（Open PageRank を有効にする）は保留にした**。いま旧 API のキーを取っても 9/30 で動かなくなるため、手順表は「設定作業は止めて移行のお知らせを読むだけ」に差し替え、マスター画面の説明にも「いまは新規に設定しないこと」と出した。
   - **#86 として判断を残した**: ① 新 API に移行する ② Open PageRank をやめて Ahrefs の DR 一本にする。**推奨は ②**（DR が本命で OPR は代替。DR が取れていればドメインパワーの 8 指標は埋まる。移行の実装と利用者のアカウント作成が要る割に得るものが小さい）。
- **この環境からは ahrefs.com / domcop.com / openpagerank.keywordseverywhere.com への接続が塞がれている**ので、URL は検索インデックスに載っている実在のページで裏を取った（実際に開いての確認はできていない）。新 API のエンドポイントの形も確認できていないため、移行の実装は #86 で方針が決まってから行う。
- 検証: lint / tsc / test（1,825 件）/ build 通過。リンクと説明文だけの変更で、コードの動きは変えていない。

### 2026-09-16（利用者の質問: Ahrefs のキーが切れたあとの乗り換え先と料金）

**質問**「Ahrefs の API キーは有効期限が 1 年とあるが、乗り換え先やその後の料金は？」

**答え: 乗り換え先は要らない。料金も 0 円のまま。**

- 1 年で切れるのは**キーの寿命（セキュリティのためのローテーション）**であって、無料期間の終わりではない。同じ画面（https://app.ahrefs.com/account/api-keys ）で**新しいキーを作って Vercel の `AHREFS_API_KEY` を差し替えるだけ**。キーは 1 アカウントに 1,000 個まで作れる。
- 使っている `domain-rating-free` は**公開エンドポイントで、有料プランも API ユニットも不要**。Ahrefs 側が方針を変えない限り、1 年後も 2 年後も 0 円。
- **切れたときの見え方**: 精密診断の報告書に「Ahrefs の API キーが拒否されました（AHREFS_API_KEY を確認してください）」と注記が出て、DR が「未取得」になる。ドメインパワーは残り 7 指標（配点 75）で採点を続けるので、**報告書が壊れることはない**。気づける作りになっている。
- 忘れないように **#87（期限日の 1 年後に作り直す）** を残タスクに追加した。期限日は #83 でキーを作ったときに書き込む。

**もし将来 Ahrefs が無料公開をやめたら**（いまそうなる兆候は無い）、代わりの候補は r62 で調べた次のとおり。

| 候補 | 数値 | 費用 |
|---|---|---|
| Open PageRank（Keywords Everywhere の新 API） | 0〜10 | 無料枠 月 30,000 ドメイン。ただし**旧 API は 9/30 終了・移行の実装が要る（#86）** |
| Moz の DA | 0〜100 | 無料枠 月 50 行（10 秒に 1 回）。有料 $20/月〜 |
| DataForSEO の domain rank | 0〜100 + 実際の被リンク数 | 従量 1 回 約 $0.024（≒4 円） |

参考: Ahrefs の**有料 API**（DR 以外の指標も使う場合）は API v3 が Lite（$129/月）以上に含まれ、無制限は Enterprise（$1,499/月）。**このツールは有料 API を使っていない。**

- この回答はドキュメントの更新のみ（コードは触っていない）。

### 2026-09-16（API キーの有効期限をマスター画面に出す、r73）

- 利用者「（キーの期限は）ツールの管理画面に表示されるようにしたいですね」。メモに期限日を書いても見に行かないと気づけないので、**`/admin` の「外部連携」に残り日数を出す**ようにした。
- **仕組み**: キーの発行日を環境変数 **`AHREFS_API_KEY_ISSUED_AT`（`YYYY-MM-DD`）** で受け取り、`src/lib/features/key-expiry.ts`（純関数）が寿命（Ahrefs は 365 日）を足して失効日と残り日数を出す。`GET /api/integrations` が**日付だけ**を返す（**キーの値は従来どおり一切返さない**。日付は秘密ではない）。
- **見え方**: 連携の行に「あと 341 日（2027-09-17 まで）」のバッジ。残り 30 日を切ると**黄色**、切れると**赤で「期限切れ」**。行を開くと「キーの有効期限」の欄に発行日・失効日と、作り直しが無料であることが出る。発行日が未設定なら「発行日が未設定」と出し、**どの環境変数にどう入れればよいか**を画面に書いてある。
- **なぜ環境変数か**: Ahrefs の API にキーの発行日を教えてくれる無料の口が無いため。運用者が 1 回入れるだけで、あとは画面が数えてくれる。
- **キーが未設定の連携には出さない**（`getKeyExpiries()` がキー未設定なら飛ばす）。いまは Ahrefs だけが寿命つきだが、`IntegrationMeta.keyLifetime` に足せば他の連携にも同じ仕組みが効く。
- 併せて `.env.example` に `AHREFS_API_KEY` / `AHREFS_API_KEY_ISSUED_AT` / `OPENPAGERANK_API_KEY`（9/30 終了の注記つき）を追記した（これまで抜けていた）。
- `GET /api/integrations` の応答は `{ ...boolean, status, keyExpiry }` の形にした。最上位の boolean を残してあるので、古い読み方をする画面があっても壊れない。
- 検証: lint / tsc / test（**1,834 件**。期限の計算は 9 件 = 日付の形・存在しない日付・当日・境界の 30/31 日・期限切れ・未設定・時刻でずれないこと）/ build 通過。
- **#87 は「画面が教えてくれる」形になった**ので、期限日をこのメモに書き込む運用はやめる。

### 2026-09-16（利用者の確認: Ahrefs の DR を自社サービスに組み込んでよいか、r74）

**質問**（登録画面に「Ahrefs Webmaster Tools は、ご自身が所有するウェブサイトでのみご利用いただけます」と出たのを見て）「これ自社の分析ツールにしか使えないのでは？ サービスの一部として組み込んでもいいの？」

**結論: 別物。DR の公開エンドポイントは、他人のサイトに対しても、自社サービスに組み込んで使ってよい。** ただし守る条件がある。

**1. 2 つを混同しない**

| | Ahrefs Webmaster Tools（AWT） | DR の公開エンドポイント（このツールが使う方） |
|---|---|---|
| 何 | 無料の SEO 分析画面（被リンク・順位・サイト監査） | `GET /v3/public/domain-rating-free` |
| 制限 | **所有権を確認したサイトだけ**。競合調査はできない | **どのドメインでも引ける**。所有確認は不要 |
| 必要なもの | サイトの所有確認 | 無料アカウントの APIv3 キーだけ |

画面に出た「ご自身が所有するウェブサイトでのみ」は **AWT という製品の制限**で、公開エンドポイントの話ではない。
登録後の「プロジェクトをインポートまたは追加する」は**キャンセルで飛ばしてよい**（#83 の手順 1 に追記した）。

**2. ライセンスは商用組み込みを明示的に許している**

Domain Rating License（https://ahrefs.com/legal/domain-rating-license ）の許諾はこう書かれている:
「worldwide, non-exclusive, royalty-free, **revocable** licence to access the DR APIs and **use, display, publish or integrate DR Data into or within your products and services**」。
**自社の製品・サービスに組み込んで表示・公開してよい**と明記されている。無料。

**3. 守る条件（4 つ）と、このツールの状況**

| 条件 | 守れているか |
|---|---|
| 表示のたびに「Domain Rating by Ahrefs」+ **ahrefs.com への機能するリンク**。隠す・消すのは不可 | ○（カードに実装。**r74 で PDF 対策として URL も文字で併記**した。PDF は画面を画像化するのでリンクが押せないため） |
| DR データを**そのままの形で再配布・販売**しない／**Ahrefs の代替・競合になる製品**にしない | ○ の想定。8 指標のうちの 1 つとして報告書に出しているだけで、DR の配信そのものを売ってはいない。**ただし「競合か」は判断の幅がある**（下の注意） |
| **一括・組織的に収集**してデータセット・索引・製品を作らない | ○（1 回の分析で最大 3 ドメイン、24 時間キャッシュ） |
| 無保証・**いつでも取り消される**（revocable） | ○（取り消されても DR が「未取得」になるだけで、残り 7 指標で採点は続く） |

**注意（判断の幅があるところ）**: 「Ahrefs の製品・サービスの代替や競合になるもの」は線引きが書かれていない。
いまの使い方（**総合的な SEO 診断の中の 1 指標**として出す）は「組み込み」の範囲だと読めるが、
もし将来「DR を調べる画面」そのものを売りにする形にすると、この条件に触れる可能性がある。
**DR 単体を主役にした機能・料金プランは作らない**という方針にしておく。

**この回答の確からしさ**: この環境から ahrefs.com に接続できないため、ライセンス本文は検索インデックス経由の引用で確認した。
**お金を取るサービスに組み込む以上、利用者ご自身で一度 https://ahrefs.com/legal/domain-rating-license を読んでおくことを勧める**（#88）。

- 検証: lint / tsc / test（1,834 件）/ build 通過。r74 の変更は帰属表示に URL の文字を足しただけ。

### 2026-09-16（マスター画面の「再確認」が効かない不具合を修正、r75）

**利用者の報告**「（Ahrefs の行が「未設定」のまま）ページを読み込みなおしても何も起きません。あと上部の確認ボタンが機能してません。」

**原因は 2 つ。1 つは不具合、もう 1 つは仕様の説明不足だった。**

**1. 「再確認」ボタンの不具合（本物のバグ。r75 で修正）**

- `fetchIntegrations(force)` が `if (!inflight)` で判定していたため、**進行中の取得があると `force` を無視してその結果を使い回していた**。押しても古い値が返ることがあった。→ `force` のときは必ず新しいリクエストを作るようにした。
- `loading` が「最初の取得が終わるまで」の意味しか持たず、**2 回目以降はボタンが一切反応しない見た目**だった（押しても回らない・何も変わらない → 壊れて見える）。→ `refreshing` を足してボタンが回るようにし、**「最終確認 19:58:03」の時刻**を横に出した。**表示が変わらなくても「いま確認した」ことが分かる。**
- テストを 6 件足した（キャッシュが効くこと / force で必ず取り直すこと / 進行中のものを使い回さないこと / 古い形の応答も読めること / 期限の読み取り / 失敗してもキャッシュを汚さないこと）。

**2. 「未設定」が変わらないのは仕様（説明を画面に足した）**

`AHREFS_API_KEY` は**サーバーの環境変数**なので、**ブラウザの再読み込みでも「再確認」でも変わらない**。
Vercel で値を足したあと **Redeploy** して初めて反映される（環境変数はデプロイ時に読み込まれるため）。
これが一番よくある詰まりどころなので、**カードの下に赤字相当の注意書きとして常時表示**するようにした。

> 「未設定」のまま変わらないとき: 環境変数はデプロイのときに読み込まれます。Vercel で値を足しただけでは反映されないので、Deployments から Redeploy してください（ブラウザの再読み込みや「再確認」では変わりません）。

**キーの有効期限のバッジが出ないのも同じ理由**。`getKeyExpiries()` は**キーが設定済みの連携だけ**を対象にするので、`AHREFS_API_KEY` が入るまでバッジは出ない（行を開けば「キーの有効期限 / キー未設定」と、どの環境変数に何を入れればよいかは読める）。

- 検証: lint / tsc / test（**1,840 件**）/ build 通過。

### 2026-09-16（r75 の本番反映を確認 / ビルドが 2 回走っていることに気づいた）

- 利用者が Vercel の Deployments 画面を共有。**`0ac25e0`（r75）が Production で Ready（44 秒）**、main の先頭と一致。r73 の「キーの有効期限」表示と r75 の「再確認」修正は**本番に出ている**。
- r74 の行に「Redeploy of GeWjkxbYd」があり、利用者が手で Redeploy したことも確認できた。
- **残っているのは #83 の手順 2〜5 だけ**（Ahrefs のキーを作る → Vercel に `AHREFS_API_KEY` と `AHREFS_API_KEY_ISSUED_AT` → Redeploy → `/admin` で確認）。
- **気づき（#89）: 1 回の push で Vercel のビルドが 2 回走っている。** 作業ブランチと main に同じコミットを push しているため、Production（main）と Preview（`claude/practical-dirac-v1q4q3`）の両方がビルドされる。中身は同じなので Preview 側は無駄で、Hobby プランのビルド時間を倍使う。対策は ①作業ブランチを push せず main だけにする ②Vercel の Settings → Git で Preview のブランチを絞る、のどちらか。**急ぎではない**（いまのところ上限に当たっていない）。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-16（Ahrefs のキー設定でつまずき / キーの露出、要ローテーション）

**利用者の報告**「追加したがサービス画面は変化なしです」（Vercel の環境変数画面と `/admin` の画面を共有）。

**原因: 変数の名前が違う。** Vercel に作られていたのは **`AHREFS_API_KEY_ISSUED_2026_09_17`** という **1 つの変数**で、値に API キーが入っていた。
こちらの手順表が「`AHREFS_API_KEY` と `AHREFS_API_KEY_ISSUED_AT`」を 1 つのセルに書いていたため、**名前と日付が 1 つの変数に混ざった**。
アプリは `AHREFS_API_KEY` という名前だけを読むので「未設定」のまま。**アプリの動作は正しい**（r73 の期限表示・r75 の再確認も本番で表示されているのを画面で確認した）。

**もう 1 つ、急ぎ: キーが露出した（#90）。** 共有された画面で、その変数の値（API キーそのもの）が**伏せ字でなく平文で表示されていた**（Sensitive にチェックされておらず、Vercel の「Needs Attention」もそれを指している）。
画面が会話に貼られた時点で、このキーは**漏れたものとして扱う**。**Ahrefs で削除して新しいキーを作り直す**（無料・数分）。
このメモにも会話にもキーの値は書かない（既存ルール）。

**直したこと**: #83 の手順 3 を「変数ごとに 1 行の Key / Value / Sensitive の表」に書き換え、「名前に日付を混ぜない」と実例つきで注記した。

**やり直しの手順**は #83 の表のとおりだが、順番は **①古いキーを Ahrefs で削除 → ②新しいキーを作る → ③Vercel の間違った変数を削除 → ④正しい名前で 2 つ作る → ⑤Redeploy**。

- ドキュメントのみの更新。コードは触っていない。

### 2026-09-16（利用者の質問: `AHREFS_API_KEY_ISSUED_AT` はなぜ必要か）

- 答え: **Ahrefs の API はキーの作成日を教えてくれない**ので、r73 で作った「残り日数をマスター画面に出す」機能（利用者の要望）には、作成日を人が 1 回教える必要がある。それがこの変数。アプリはこれに 365 日を足して失効日と残り日数を出す。
- **無くても DR は動く**（任意）。無いと画面のバッジが「発行日が未設定」のままになるだけで、報告書は普通に出る。切れたときは報告書に「キーが拒否されました」と出て DR が「未取得」になる（黙って壊れはしない）。
- 代替案（提案のみ、未実装）: 最初に DR が取れた日を Supabase に記録して「初回利用日 + 1 年」で自動計算する。日付を手で入れなくて済むが、作成日ではなく初回利用日なので数日ずれる。手で 1 回入れる方が正確で単純なので、いまは環境変数のまま。
- ドキュメントのみの更新。

### 2026-09-16（Ahrefs の API キー作成画面を確認）

- 利用者が https://app.ahrefs.com/account/api-keys の「Generate Public API key」ダイアログを共有。**URL は手順表のとおりで正しかった**（前回の 404 は登録ページの方）。
- 無料アカウントで作れるのは **「Public API key」**。これは `/v3/public/domain-rating-free` のような公開エンドポイント用のキーで、**このツールが必要としているものと一致**（有料 API 用のキーではない）。ここで「無料アカウントでも DR のキーが作れる」ことが画面で裏付けられた。
- 「Key title」は自分用のラベル（例 `seo-checker`）。アプリは使わないので何でもよい。
- 画面上はキーが 1 つも無い状態に見えるので、露出した古いキー（#90）は削除済みのようだ（利用者に確認）。
- 作成日は **2026-09-16**（JST）なので、`AHREFS_API_KEY_ISSUED_AT` は `2026-09-16`（手順表の例 `2026-09-17` は「明日作るなら」の例だった。今日作るなら今日の日付）。
- ドキュメントのみの更新。

### 2026-09-16（利用者の依頼: 明日リリースしたい。優先順位を整理）

- 利用者「明日このサービスをリリースしたい。まず何をすべきか優先順位を」。メモを読み直して整理した結果を「明日（2026-09-17）リリースするための優先順位」の表にまとめた（「本番公開までに残っていること（決済まわり）」の下）。
- 結論: **Stripe の課金は明日までに通らない**（#84 の審査待ち。決済・入金が 09/09 から停止）。明日は「Clerk の許可リストで招待した相手だけ登録 → 管理画面で個別開放 → 初月無料のあいだに Stripe を復旧」の形で公開する。
- 公開前に必ず要るのは A-1〜A-4 の 4 つ（`DEFAULT_PLAN=free`、Clerk の登録制限とアプリ名・Legal、鍵のローテーション、Vercel Pro）。合計 1 時間以内。
- お客様に GSC / GA4 を使ってもらうには、Google Auth Platform のテストユーザーに相手の Google アカウントを追加する必要がある（OAuth が審査前）。7 日でトークンが切れる制約は案内文に入れる。
- 入力待ちに「2 か月目の請求を Stripe 復旧待ちにするか請求書にするか」を追加。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-16（AI 検索モニタリング（GEO）を仕様書どおりに実装、r76）

- 利用者から「AI検索モニタリングツール 仕様書」（Draft v1）を受領。**正本を [geo-monitoring-spec.md](./geo-monitoring-spec.md) に取り込み**、§12 に実装メモを足した。依頼は「忠実に再現」「API の登録を済ませれば利用できるように作りきる」。
- **作ったもの**: `/tools/geo`（スタンダード）。`src/lib/geo/` に 12 ファイル、API 3 本 + Cron 1 本、画面 5 ファイル。テスト 69 件。
- **設計の芯**（仕様書の意図をコードの形にした部分）:
  - **単価と為替はコードに直書きしない**（`pricing.ts` + `GEO_PRICE_*` / `GEO_USD_JPY`）。DataForSEO の値上げや為替変動をデプロイだけで吸収する。
  - **定期実行から Live を呼ぶ経路を作らない**（§7.4）。標準キューと Live はパスごと分け、バッチは `mode: "standard"` を直に渡す。設定で切り替える口が無い。テストで「バッチは必ず standard」を固定した。
  - **反復は週内の別の日に分散**（§2.3）。通常は月・水・金、高精度は月〜金 ×2。顧客ごとに曜日をずらす（§2.4）。Cron は**毎日**回して当日分だけ実行する。
  - **顧客間キャッシュ**（§7.1）。正規化 → SHA-256 → 24 時間以内なら使い回す。同業の顧客が増えるほど 1 社あたりの原価が下がる。
  - **言えないことを言わない**（§5）。Wilson 区間をバンドで出し、観測 30 件未満はパーセントを出さず「よく言及される / たまに / ほとんど無い」の段階表示。**「有意差」という語は UI に無い**。n=3 同士の完全分離でも「差は読み取れません」と答えることをテストで固定した。
  - **参照判定は文字列 → 軽量 LLM の 2 段**（§4.2）。候補が無ければ LLM を呼ばない（費用ゼロ）。低確信は「要確認」で画面に出し、**自動で捨てない**。
- **§11 の未決事項は仮決めして全部設定で変えられるようにした**（詳細は仕様書 §12.2）。キャッシュ時のクレジットは **消費する**、超過課金は **行わない**、ロケールは **日本固定**。
- **まだ無いもの**: §7.2 / §7.3 の生成処理（週次レポート・月次深掘り・差分実行）。クレジットのレートと台帳は入れてあるので後から足せる（#92）。折れ線グラフ本体も未実装（モデル更新イベントの記録と一覧は実装済み）。
- **料金プランの置き場所**: 「測る」系だがスタンダードに置いた。1 アカウント月 ¥2,000 前後の変動費が出るため。ライトに下ろすなら料金表（`plans/catalog.ts`・紹介サイト・サービス資料）も直す必要がある（テストのコメントにも書いた）。
- 検証: lint / tsc / test（**1,909 件**。うち GEO は 69 件）/ build 通過。`/tools/geo` がビルドに出ることを確認。
- **利用者の作業は #91**（Supabase の SQL → DataForSEO 登録 → Vercel に 2 つの環境変数 → Redeploy → ブランドとプロンプトの登録）。

### 2026-09-16（AI 検索モニタリングの作業をやることリストに反映）

- 利用者「これらをやることリストに入れてください」。r76 で作った AI 検索モニタリングの作業を、メモの 3 か所に入れた。
  1. **残タスク**に #93（プランの置き場所の判断）を追加（#91 #92 は r76 のときに追加済み）。
  2. **「明日リリースするための優先順位」**に **C-5（#91 の設定作業）** と **C-6（#93 の判断）** を追加。どちらも **C（明日でなくてよい）** に置いた。理由: 新機能で、見出しの数値が安定するまで 4 週かかるため、リリース当日の確認項目を増やす意味が薄い。「明日やらなくてよいもの」の行にも #91・#92・#93 を明記した。
  3. **#91 の手順表の下に「消し込み用のチェックリスト」**（10 項目）を付けた。終わった項目を `[x]` にして push すれば、次のセッションがどこまで済んだか一目で分かる。
- **明日のリリースに要るもの（A-1〜A-6）は変えていない。**AI 検索モニタリングは明日の必須作業ではない。
### 2026-09-16（B-1 の回答を Claude in Chrome にやらせるプロンプトを用意）

- 利用者「B-1 やります。Claude in Chrome にやらせるプロンプト考えて」。**[stripe-checklist-prompt.md](./stripe-checklist-prompt.md)** を新規作成した。
- 設計した安全策: ①最終確定ボタンは人の確認を取ってから押す ②API キーの画面を開かせない・値を要約させない（#90 の再発防止）③チェックリスト以外の設定（商品・価格・Webhook・銀行口座）は読むだけ ④分からない設問は推測で埋めず人に聞く ⑤**MFA が有効かの設問は、利用者が「有効にした」と言うまで「はい」にさせない**。
- 回答の根拠として「サービスの実態」をプロンプトに埋め込んだ。コードで確認した事実のみ: Stripe Checkout / カスタマーポータルの**ホスト画面のみ**（`src/lib/billing/stripe.ts` の `checkout.sessions.create` / `billingPortal.sessions.create`）→ カード情報はアプリを通らず **SAQ A 相当**。保持するのは `publicMetadata.stripe`（契約状況・金額・次回更新日）と `privateMetadata.stripeCustomerId` だけ（`src/lib/billing/sync.ts`）。Webhook は署名検証つきで失敗は 400（`src/app/api/billing/webhook/route.ts`）。管理画面は Clerk のログイン + 確認済みメールが `ADMIN_EMAILS` に一致の 2 条件（`src/lib/admin/guard.ts`）。
- **未対応のものは正直に答えさせる**: 第三者の脆弱性診断なし、専任のセキュリティ担当・インシデント手順書なし、ダッシュボードの 2 段階認証は「設定作業中」。偽って「はい」と答えると審査で不利になるため。
- **B-3（Vercel / Clerk / Stripe の 2 段階認証）を B-1 より先に**やる順番に変更した。先に済ませておけば MFA の設問に「はい」と答えられる。
- 次にこちらでやること: エージェントが出した「設問と回答の一覧」を利用者が貼ったら、妥当性を確認してこのログに記録する。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-16（B-1: セキュリティチェックリストの 1 ページ目の回答を決めた）

- 利用者が 2 段階認証 3 つ（Stripe / Vercel / Clerk のダッシュボード）を完了。続いてチェックリストの画面（**Tell us about your security posture**）を共有。
- 設問と回答は **[stripe-checklist-prompt.md](./stripe-checklist-prompt.md) の「実際に出た設問と回答」** に記録した。要点:
  - **Outsourcing → `Employee(s)`**（個人事業で代表本人が実施。SaaS の利用は「委託」に当たらないと判断）。
  - **ログイン対策 → 3 つ**: 「登録時の本人情報の確認」（メール確認済み + 招待制の許可リスト）、「ログイン試行回数の制限」（Clerk の Attack protection が ON なら）、「その他の対策」（自由記述に実態を書く。文案は記録済み）。
  - **多要素認証は Clerk で有効にしてからチェックする。**画面に「開発中なら、決済受付を始める前に実施する対策で回答してよい」と明記があるので、有効化予定として答えてもよいが、**先に有効にするほうが確実**。
  - **「Not applicable: No user login function」は絶対に選ばない**（ログイン機能はある）。
- **送信前に Clerk のダッシュボードで 2 か所を確認する必要がある**（Multi-factor、Attack protection）。確認できるまでは画面の「後で続けるために保存」で中断する。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-16（B-1: セキュリティチェックリストを送信 → 審査待ちに）

- 利用者が Stripe → 設定 → ビジネス → **アカウントのステータス**を共有。**要対応タスクが「完了すべきアクティブなタスクはありません」になり、赤帯（Multiple capabilities paused / A required task is past due）も消えていた**。→ **#84 のチェックリストは送信できた**と判断。Stripe 側の審査に回った。
- ただし**ステータス欄はまだ 2 つに分かれている**: ⊖「しばらく休憩しよう」に 支払い / Cartes Bancaires / JCB / Link / MB WAY、✓「有効」に 支払い。
  Cartes Bancaires・MB WAY・Link・JCB は**そもそも有効化していない決済手段**なので並ぶこと自体は異常ではないが、**「支払い」が両方に出ているため、決済が再開したかはこの画面だけでは断定できない**。各行をクリックして理由を読む必要がある。
- 確認手順の 4 項目（完了タブで送信日を控える / 支払いの行の理由 / 残高で入金の保留 / 決済手段）を [stripe-checklist-prompt.md](./stripe-checklist-prompt.md) の「送信後の状態」に書いた。
- **「支払い」が有効と確認できるまで #58 の ⑧（本番モード）には進まない。**進めても決済が止まっていれば申し込みが失敗するだけで確認にならないため。
- **明日のリリース（A-1〜A-6）は予定どおり進められる。**招待制 + 管理画面での個別開放なので、Stripe の審査結果を待たない。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（Stripe のホーム画面に警告が出ていないことを確認）

- 利用者が Stripe のホーム（本番モード）を 1:35 に共有。**警告の赤帯が無い**（09-16 の「Multiple capabilities paused」は消えている）。売上 0 円・残高 0 円・入金「—」は、本番で 1 件も決済していないので当然の表示で、停止の証拠ではない。
- **この画面では決済再開の確定はできない。**確定は [stripe-checklist-prompt.md](./stripe-checklist-prompt.md) の「送信後の状態」の 2（アカウントのステータスの「支払い」の行）と 4（決済手段）で見る。
- **今日（09-17）のリリース作業は A-1〜A-4 が先。**Stripe の審査結果を待つ必要はない（招待制 + 管理画面での個別開放で公開するため）。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（Stripe の「Billing の概要」は使わないことを確認）

- 利用者が 1:36 に Stripe → 請求する → **Billing の概要**（`/billing/setup`）を共有。**この画面は不要**と回答。Billing の紹介ページで、「始める」を押さないと使えないものは無い。
- このサービスは自前のコードから Stripe Checkout を呼ぶので、**Stripe 側で要るのは 商品カタログ / Webhook / カスタマーポータル / `sk_live_` の 4 つだけ**。
- **初月無料（30 日）と割引コードの受け付けはコード側で指定済み**なので Stripe の画面では設定しない（`src/lib/billing/trial.ts` の `DEFAULT_TRIAL_DAYS = 30`、`src/lib/billing/stripe.ts` の `trial_period_days` / `allow_promotion_codes: true`）。日数を変えるなら環境変数 `STRIPE_TRIAL_DAYS`。
- **前回の「⑧ には進まない」を修正**: 商品・Webhook・ポータル・キーの作成は決済が停止中でもできる。審査待ちなのは**実際に課金が通るかだけ**。お客様に `/plans` の「申し込む」を使わせるのは確認が取れてから。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-16（代理店アカウントを実装、r77）

**利用者の依頼**: 「マスターアカウントから代理店アカウントを追加できるようにしてほしい。その代理店アカウントからも登録者の情報が見れるように。もちろんマスターアカウントからは登録しているすべてのユーザーが見れるように。」

**入れたもの（コード。r77）**

| 役割 | 決まり方 | 見えるお客様 | できること |
|---|---|---|---|
| マスター（運用者） | 環境変数 `ADMIN_EMAILS` の**確認済み**メール（従来どおり） | **登録しているすべてのお客様** | 代理店の追加・解除、担当の割り当て、機能の個別開放 |
| 代理店 | Clerk の `publicMetadata.role` が `agency` | **自分に割り当てられたお客様だけ** | **表示のみ** |
| 登録者（お客様） | 上のどちらでもない | 自分のツール画面だけ | — |

- **マスター画面（`/admin`）に「代理店アカウント」カードを追加**。メールアドレスを入れて「代理店として追加」を押すと、
  - すでに登録済みの方 → その場で代理店になる
  - まだ登録していない方 → Clerk から招待メールが飛び、相手が登録を済ませた時点で代理店になる（招待の `publicMetadata` が登録完了時にユーザーへ入る Clerk の仕組みを使っている）
- **顧客一覧の各行に「担当代理店」の選択**を追加。選ぶとその代理店の画面に出る。「担当なし」に戻せば見えなくなる。押した瞬間に保存する。
- **代理店画面（`/agency`）を新設**。担当の登録者の契約状況・月額・プラン・次回請求・登録日・最終利用日を出す。**表示のみ**で、プラン変更も機能の個別開放も持たせていない（金額に関わる操作は運用者だけに残す線引き）。クーポンコードも代理店には出さない。
- サイドバーの「運用」に、代理店には「代理店画面」が出る（マスターには従来どおり「マスター画面」）。判定はサーバー（`GET /api/plan` が `admin` / `agency` を返す）。
- ログイン直後の振り分け（`/start`）は、代理店を `/agency` へ送る。代理店はツールを買う立場ではないので、料金プランへ送ると「払わないと何も見えない」画面に着いてしまうため。

**判断したこと（なぜそうしたか）**

- **マスターだけ環境変数のまま**にした。運用者の権限を Clerk 側の値に置くと、Clerk を触れる人が自分を運用者にできてしまう。Vercel の設定を触れる人だけが変えられる場所に残す。
- **代理店と担当は Clerk の `publicMetadata`**（`role` / `agencyId`）。このサービスは DB を持たない方針で、`plan` / `featureOverrides` / `stripe` と同じ置き場所にそろえた。`publicMetadata` は Backend API からしか書けないので、お客様がご自分で代理店に化けたり担当を付け替えたりはできない（クライアントから書ける `unsafeMetadata` は使っていない）。
- **代理店画面が引く ID は必ずセッションから取る**（`currentAgencyId()`）。リクエストで受け取った ID を信用すると、他の代理店の担当が見えてしまう。
- **解除しても担当の割り当ては消さない**。解除した時点で代理店画面は 404 になり見えなくなる。戻したいときは代理店に戻せば担当もそのまま戻る（数百件の書き換えを走らせない判断でもある）。解除済みの代理店が担当に残っている行は、顧客一覧で「解除済み」と出して気づけるようにした。
- **代理店アカウントに担当は付けない**（画面でも選べず、API でも弾く）。許すと代理店どうしで契約情報が見え合う関係ができてしまう。
- Clerk の `emailAddress` 絞り込みは**部分一致**なので、そのまま先頭 1 件を採ると別人（`a@example.com` で探して `aa@example.com` が返る）を代理店にしてしまう。完全一致だけを拾うようにした。
- Clerk の Backend API には `publicMetadata` で絞る条件が無いため、代理店の一覧と担当分は**読んでから絞る**。読む人数は 500 人で打ち切る（`src/lib/admin/clients.ts` の `MAX_SCAN`）。これを超える規模になったら、担当の関係だけ Supabase に持たせて絞り込みを DB 側に移す。

**触ったファイル**: `src/lib/admin/roles.ts`（新規・純関数）、`src/lib/admin/agencies.ts`（新規）、`src/lib/admin/clients.ts`、`src/lib/admin/guard.ts`、`src/app/agency/page.tsx`（新規）、`src/app/api/admin/agencies/route.ts`（新規）、`src/app/api/admin/clients/agency/route.ts`（新規）、`src/app/api/plan/route.ts`、`src/app/admin/page.tsx`、`src/app/start/page.tsx`、`src/components/admin/{AdminConsole,AgencyCard,ClientTable,format}`、`src/components/agency/ClientCards.tsx`、`src/components/shell/Sidebar.tsx`、`src/lib/store/usePlan.ts`、テスト 2 本、README・ARCHITECTURE。

**検証**: lint / tsc / test（151 ファイル・1,925 件）/ build すべて通過。本番での動作確認は未（下の「利用者にお願いすること」）。

**残していること（利用者の判断待ち）**

- **代理店が自分でお客様を招待できるようにするか。**いまは担当の割り当てがマスターだけなので、代理店が連れてきたお客様は運用者が毎回割り当てる必要がある。代理店の画面に「お客様を招待」を置けば、招待から登録した方が自動でその代理店の担当になる（Clerk の招待の `publicMetadata` に `agencyId` を載せる。実装は半日）。ご依頼が無かったので今回は入れていない。
- **代理店の画面に出す情報の範囲。**いまは契約状況・月額・プラン・次回請求・登録日・最終利用日まで出している（クーポンコードは出していない）。月額を代理店に見せたくない場合は外せる。
- **代理店にもツールのサイドバーが出る点。**代理店は未契約なので鍵バッジ付きで並ぶ。気になるようなら、代理店には代理店画面だけを出す専用のシェルにできる。

### 2026-09-17（Stripe の Checkout ビルダーも使わないことを確認）

- 利用者が 1:47 に Stripe の **Checkout ビルダー**（「アプリ内ページ1」、`/checkout/checkouts/draft/chkplan_…`）を共有。プレビューは ¥5,000・「1 回限りの購入」のダミーで、右上に「実装」ボタン。
- **これも不要と回答。「実装」は押さない。**アプリは `mode: "subscription"` で Checkout セッションを**コードから**作り、価格は環境変数の Price ID から引く（`src/lib/billing/stripe.ts` の `createCheckoutSession` / `priceIdOf`）。Stripe の画面で作ったチェックアウトページは使われない。
- この画面の「割引コードを許可」「支払い情報の保存」「ブランディング」のトグルは**アプリが開く Checkout には効かない**（割引コードは `allow_promotion_codes: true` をセッションごとに指定済み。ブランディングは Stripe → 設定 → ブランディング）。
- **商品は「商品カタログ → 商品を追加」で作る。**Checkout ビルダーではない。本番で要るのは 商品カタログ / Webhook / カスタマーポータル / `sk_live_` の 4 つだけ（[stripe-checklist-prompt.md](./stripe-checklist-prompt.md)）。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（本番の商品を作成 / 税表記の食い違いを発見 / リリースを「今週中」に）

- 利用者が Stripe の**本番の商品カタログ**を共有。**スタンダード ¥50,000 月額、ライト ¥38,000 月額の 2 件が作成済み**（2026/09/17 01:50）。#58 の ⑧ のうち商品の作成は完了。
- **見つけた食い違い（#95）**: 特商法ページと紹介サイトは「**税別**。消費税は別途申し受けます」だが、**Stripe の価格は税設定なし（税コード「—」）なので請求は 50,000 円ちょうど**。消費税が乗らない。①税込表記に直す ②Stripe を税込価格にするか Stripe Tax、のどちらかを利用者が決める。**初月無料なので最初の課金は約 30 日後**で、今週のリリースは止めない。
- **利用者の意向でリリース目標を「明日」から「今週中」に変更。**「やらなければいけないことを先に早めにやって、細かい機能の調整は後から」。
  → 優先順位の節を書き直し、**①待ち時間があるもの（Stripe の審査・Google OAuth 申請・Business Profile 承認）を先に投げる / ②自分で終わる公開必須の 4 つ / ③最初のお客様の受け入れ / ④後から調整**の 4 段に整理した。
  **いちばん効くのは Google OAuth の本番公開申請（#13。審査 2〜6 週間）を今週中に出すこと。**通るまでお客様のトークンが 7 日で切れ続けるため。
- 次に利用者がやるのは **Price ID の取得 → Webhook → カスタマーポータル → `sk_live_` → Vercel の 4 変数**（[stripe-checklist-prompt.md](./stripe-checklist-prompt.md)）。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（料金の表示を税込に統一、r78）

- **利用者の決定「料金の価格は税込みです。統一してください」**（#95 の判断）。→ 表記を実態（Stripe の価格に税設定が無く、請求が 50,000 円 / 38,000 円ちょうど）に合わせた。**Stripe 側の価格は作り直さない。**
- 直したファイル（9 つ）:
  - `src/components/legal/Tokushoho.tsx` … 販売価格の「（税別。消費税は別途申し受けます）」→「（税込）」。価格は `catalog.ts` から引いているので数字は触っていない
  - `src/app/plans/page.tsx` / `src/components/free/ServiceGuide.tsx` / `src/components/free/UpgradeCta.tsx` … 注記を税込に
  - `src/lib/plans/catalog.ts` … `priceYen` のコメントを「月額（円・税込）」に
  - `public/service-guide.html` / `marketing/public/index.html` … meta description・料金カード・FAQ・JSON-LD（FAQPage の回答文）・比較表・注記の 7 か所
  - `marketing/public/llms.txt` … **料金の行が r63 より前の 1 プラン（「オールインワン」定価 50,000 円）のままだったので、現行の 3 プランに直した**うえで税込に
  - `README.md` … 料金表の見出し
- 検証: lint / tsc / **test 1,925 件** / build すべて通過。
- **残る注意**: 免税事業者か課税事業者かで、税込 50,000 円の内訳（消費税相当の扱い）が変わる。インボイス登録をしている場合は請求書に税額の記載が要るので、そのときは Stripe Tax の有効化を検討する。**今回の変更は「表示と実際の請求額を一致させる」ところまで。**
### 2026-09-16（代理ログイン: マスターからお客様の画面をそのまま見る、r79）

**利用者の依頼**: 「マスター画面から、ユーザーごとのログイン画面にアクセスできるようにしてほしい。マスターアカウントであればユーザーのログイン画面を見ることができるので、トラブル対応や、ユーザーにきちんと表示されているのかというチェックをやりやすくなる。」

**入れたもの（コード。r79）**

- **マスター画面の各お客様のカード右上に「この方の画面を見る」ボタン**。押すとそのお客様としてログインした状態になり、**お客様に見えているとおりの画面**（サイドバーの鍵・プラン・データすべて）が出る。
- 仕組みは **Clerk の Actor Token**（公式の代理ログイン機能）。運用者を `actor`、お客様を本人とする短命のチケットを作り、その URL へ遷移させる。セッションに「誰が代理でログインしたか」（`actor.sub`）が残る。
- **画面のいちばん下に「代理ログイン中」の帯**を常に出す（どのページでも消えない）。代理中はサイドバーの「マスター画面」が消える（判定がお客様のアカウントで行われるため）ので、**戻る入口はこの帯だけ**。

**歯止め（なぜ入れたか）**

| 歯止め | 中身 | 理由 |
|---|---|---|
| 入れる人 | `ADMIN_EMAILS` の運用者だけ | 他人のデータが丸ごと見える操作なので |
| 運用者どうし | **不可** | 片方が片方になりすませると、操作の責任がログからも追えなくなる |
| 自分自身 | 不可 | 代理ログインしなくても開けるため |
| 有効期限 | チケット 5 分・セッション 30 分 | 開きっぱなしにしない |
| お支払いの操作 | **403 で塞ぐ**（`/api/billing/checkout` と `/api/billing/portal`） | 運営者がお客様の代わりに申し込む・解約する事故は取り返しがつかない |
| 記録 | 開始時に「誰が・誰に対して」をサーバーログへ | あとから追えるようにする |

- **お支払い以外（診断の実行など）は動かせるままにした。**トラブルの再現に要ることがあるため。ただし**外部 API の実費は運営者のアカウントに付く**ので、この点は手順書に書いた。
- **新しく「取り返しのつかない操作」を足すときは、`isImpersonating()` を見て同じように塞ぐこと**（ARCHITECTURE.md にも記載）。

**触ったファイル**: `src/lib/admin/impersonate.ts`（新規）、`src/app/api/admin/impersonate/route.ts`（新規）、`src/components/shell/ImpersonationBanner.tsx`（新規）、`src/components/shell/AppShell.tsx`、`src/components/admin/ClientTable.tsx`、`src/app/api/billing/{checkout,portal}/route.ts`、テスト 2 本、README・ARCHITECTURE。

**検証**: lint / tsc / test（152 ファイル・1,932 件）/ build すべて通過。本番での動作確認は未（#97）。

**残していること（利用者の判断待ち）**

- **プライバシーポリシーへの記載（#98）。**「運営者がサポートのためにお客様の画面を閲覧しうる」旨は、いまのポリシーに書いていない。#12（専門家レビュー）と一緒に判断していただきたい。文案は用意できる。
- **代理ログインの記録を画面でも見られるようにするか。**いまはサーバーログ（Vercel → Logs）だけ。件数が増えて「いつ誰に入ったか」を一覧で見たくなったら、Supabase に履歴を残す形にできる。
- **お支払い以外も読み取り専用にするか。**いまは診断の実行などが動く。誤操作が怖い場合は、代理中は書き込み系をすべて塞ぐこともできる（再現はできなくなる）。

### 2026-09-17（料金プランを安い順に並べ替え、r80）

- **利用者の指示「料金プランを左にライト、真ん中にスタンダード、右に（最上位）にしてください」**。高い順（プレミアム → スタンダード → ライト）から**安い順（ライト → スタンダード → プレミアム）**に変えた。
- 直したもの: `src/lib/plans/catalog.ts` の `LISTED_PLANS`（並び順の唯一の定義。料金プラン画面とサービス案内が従う）、`marketing/public/index.html` と `public/service-guide.html` のカードの並び。特商法の販売価格は元から安い順なので変更なし。
- **真ん中のスタンダードを本命として強調する形は変わらない**（「いちばん選ばれています」のバッジ）。r63 で採ったアンカリング（高い段を先に見せる）は外れるが、利用者の指示を優先した。
- 検証: lint / tsc / **test 1,932 件** / build 通過。
- **利用者の言葉は「右にプロ」だった。**現在の最上位の名前は「プレミアム（伴走）」。**プレミアム → プロ に改名するかは利用者に確認中**（改名する場合は `catalog.ts` のラベル・紹介サイト・サービス案内・特商法・llms.txt・README と、Stripe の商品名が対象。プレミアムは Stripe に商品を作っていないので決済側の影響は小さい）。

### 2026-09-17（利用者の質問: GA4 / Search Console の認証は通っているのか）

- 質問「Google Analytics 4 や Google Search コンソールの API キー、の認証などは通っているんですか」。
- **答え: この 2 つに API キーは要らない。**認証は **OAuth**（お客様ご自身が Google でログインして許可する方式）で、Clerk の外部アカウント連携を使う（`src/components/google/GoogleLinkPanel.tsx` の `additionalScopes`、`src/lib/google/scopes.ts`）。アプリに Google の鍵を置く箇所は無い。
- **現状は「通っている。ただしテスト状態」**: Google Cloud で API 4 つ（Search Console / Analytics Admin / Analytics Data / PageSpeed Insights）は有効、OAuth クライアントも Clerk 用に設定済み、`matsumatsu452@gmail.com` で両スコープの許可まで確認済み。
- **テスト状態の制約が 2 つ**: ①**テストユーザーに登録した Google アカウントしか連携できない**（100 人まで）②**トークンが 7 日で失効する**（お客様が週 1 回つなぎ直すことになる）。
- **だから #13（OAuth の本番公開申請）が要る。**`analytics.readonly` が機密スコープなので Google の審査（2〜6 週間）。**今週のうちに出すのがいちばん効く**（①の分類。待ち時間が長い）。
- なお PageSpeed Insights だけは API キー方式で、`PAGESPEED_API_KEY` として登録済み。

### 2026-09-17（利用者の質問: OAuth 審査で落ちる事業者は何が違うのか）

- 質問「通らない事業者は逆にどういうものなのですか。地雷を踏まないように申請したい」。→ **[google-oauth-verification.md](./google-oauth-verification.md)** を新規作成。
- **まず安心材料**: 今回は**機密（sensitive）**スコープであって**制限付き（restricted）ではない**ので、**第三者機関の年次セキュリティ評価（CASA）は不要**。ブランドとポリシーの審査だけ。
- **落ちる型は 9 つ**に整理した。多いのは ①**ブランディングの不一致**（アプリ名・ロゴ・ホームページ・ドメインが揃っていない）②**プライバシーポリシーの不備**（Limited Use の明記なし、取得するデータが曖昧、スコープと記載の食い違い）③**デモ動画の不備**（同意画面が映っていない、アプリ名が違う）④**申請後にメールを放置**（1〜2 週間で却下）。
- **こちらの現在地を調べた結果、土台はできている**: 独自ドメインと所有確認（#31）、独自ドメインの連絡先、事業内容の分かる紹介サイト、**ログイン不要で robots も開けてあるプライバシーポリシー**、**Limited Use の明記あり**（`PrivacyPolicy.tsx` 第 5 条）、取得データの具体名あり、読み取り専用の明記と実装、Anthropic への提供の開示。
- **足りないのは 6 つ**: ①ブランディングに規約・ポリシーの URL 未登録（#8）②**Clerk のアプリ名が `My Application` のまま**（#7。**デモ動画に映るので Google 側の `SEO Checker` と食い違って見える**）③「**Google のデータを汎用 AI モデルの学習に使わない**」の明記が弱い（第 6 条は「努めます」）④用途説明文 ⑤デモ動画 ⑥ロゴ。
- **このサービス特有の要点**: **GSC / GA4 の集計値を Claude に送って分析文を作っている**（`src/lib/seo-analysis/ai/analyze.ts`）。隠さず「利用者本人に見せるレポートのためだけに使い、学習には使わない」と用途説明とポリシーの両方で言い切る。
- 環境の制約: `developers.google.com` / `support.google.com` はこの環境の egress プロキシで遮断されており直接読めない。検索結果の要約と申請体験談をもとにまとめた旨を資料に明記した。
- ドキュメントのみの更新。コードは触っていない。**次にこちらでやれるのは、ポリシー第 6 条の追記（③）と、用途説明文・動画台本の下書き。**

### 2026-09-17（Clerk の本番インスタンスの画面を確認）

- 利用者が Clerk ダッシュボードの **Production インスタンスの Overview** を共有（`dashboard.clerk.com/apps/app_3J2KNwgzUABIRRWZzdE3RdipIVy/instances/ins_3J5Ge14Mu0nl6S9gqL7fxZcvQzz`）。
- **分かったこと**:
  - パンくずは「まつした's Organization（**Pro** プラン）/ **SEO Checker** / Production」。**アプリ名は既に `SEO Checker`**（#7 の「アプリ名が `My Application` のまま」は解消済みに見える。ログイン画面での表示は要確認）。
  - **Clerk の組織が Pro プラン**。無料枠を超えた課金が発生している可能性があるので、Billing タブで月額を一度見ておく。
  - 利用者数は **Active 2 / New 0 / Retained 2**（9/14 の週）。運営者本人ぶんと見られる。
  - 上部に「Email setup: Add a second email provider to increase deliverability」の案内。**必須ではない**（Clerk の既定の送信元でも確認メールは届く）。#26 で `contact@seo-checker.tokyo` の受信は設定済み。
- **この画面で残っている作業は 3 つで、すべて `Configure` タブの中**（#7）: ①Restrictions で招待制／許可リスト ②Legal に `/terms` `/privacy` と登録時の同意 ③アプリ名の最終確認。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-16（ホームページの URL を設定で 1 回だけ登録する。r81）

- 利用者の指示「設定のところで、ホームページの URL の登録をできる画面を作って、他のタブで URL の入力を求めるようなことがないようにしてほしい。競合の URL は入力する場所があってもいい」。
- **やったこと**: 設定（`/settings`）を「**ホームページ**」「**競合サイト**」「Google 連携」「データ」の 4 カードに組み替え、旧「プロジェクト」カード（名前・ドメイン・開始 URL をまとめて編集する表）をやめた。ホームページのカードは URL 1 本が主役で、サイト名とブランド表記は任意。保存すると「ほかのタブではこのサイトが対象になります」と出る。複数サイトは「別のサイトを追加」で登録して切り替えられる（内部のデータ構造は今までの `projects` ストアのまま。**移行作業は不要**）。
- **URL の入力欄を消したタブ**: サイト診断 / 精密診断 / llms.txt 生成（① 基本情報）/ llms.txt 検証 / プロンプト拡張。対象は画面の先頭に「対象のホームページ example.co.jp ｜ 設定で変更」と出るだけになった。
- **ページ指定だけに変えたタブ**: ページ最適化レポート / HP 改修提案 / ページ診断 / AIO 頻出トピック。ドメインが灰色の枕として左に付き、右に `/service/` のようなパスを入れる形。空欄ならトップページ（ページ診断だけは従来どおり「検索順位が最も高い自社ページを自動で選ぶ」）。
- **初期値に使うようにしたタブ**: 基本情報掲載（NAP）の「サイト」欄。未入力なら登録したホームページが入る（自分で触れば以後そちらが優先）。
- **URL 入力欄を残したもの**（意図的）: 競合サイト（設定・精密診断の両方）、クイック診断 `/` と `/meo`（見込み客に渡す入口なので登録が無い）、口コミ投稿画面の URL、基本情報掲載の媒体ごとの掲載ページ URL、llms.txt に書く任意の URL（会社概要・RSS・サイトマップ。placeholder は登録したホームページに合わせた）。
- **未登録のときの見え方**: 各タブの先頭に黄色の帯「ホームページの URL が未登録です」と `/settings#home-url` への導線を出し、実行ボタンを押せなくする。ダミーでは動かさない。
- **新しく足した仕組み**（次に画面を作る人向け）:
  - `src/lib/site/target.ts` … URL の正規化と解決の**純関数**（`toSiteUrl` / `resolvePageUrl` / `isSameSite` / `displayUrl` / `pageLabel`）。テストは `src/lib/site/__tests__/target.test.ts`。
  - `src/components/site/RegisteredSite.tsx` … `useRegisteredSite()`（登録済みか・URL・ドメイン）、`SiteTargetNotice`（対象の表示と未登録の導線）、`PageTargetField`（パスだけを聞く欄）。
  - **規約**: 新しいツールに自社サイトの URL 入力欄を足さない。ARCHITECTURE.md の「ディレクトリ」節の下に明記した。
- **文言の統一**: 画面に出ていた「プロジェクト」を「ホームページ」に置き換えた（順位計測・LLMO モニタリング・キーワード調査・サイドバーの設定ラベル・README・ARCHITECTURE）。**利用規約とプライバシーポリシーの本文にある「プロジェクト」はそのまま**にしてある（法務文書なので改定日の扱いが要る。直すなら利用者の判断で）。
- **「はじめかた」の手順を 3 → 4 に**（`src/lib/onboarding/steps.ts`）。1 番目を「ホームページの URL を登録する」にした。
- 検証は 4 つとも通過（lint / tsc / test 1,946 件 / build）。ブラウザでも設定 → 8 タブを実際に開いて、登録した URL が各タブに出ること・コンソールエラーが無いことを確認した。
- **利用者にお願いしたいこと**: 本番に反映されたら `https://app.seo-checker.tokyo/settings` で自社のホームページ URL を 1 回登録してください。登録はブラウザごと（localStorage）なので、**PC を変えたら登録し直し**になります。移すときは同じ設定画面の「JSON をダウンロード / 読み込む」が使えます。

### 2026-09-17（Clerk の Legal と同意チェックを設定 / Chrome 側の指摘 4 点を突き合わせ）

- **利用者が Clerk 本番の Legal を設定完了**（#7）: 利用規約 `https://app.seo-checker.tokyo/terms`、プライバシー `https://app.seo-checker.tokyo/privacy`、**Require express consent オン**。ページを開き直して反映を確認済み。
- 利用者が Claude in Chrome からの指摘 4 点を転記。**こちらの実物と突き合わせた結果、残っているのは 1 点だけ**:

| Chrome 側の指摘 | 実際 | 根拠 |
|---|---|---|
| Google Cloud のブランディングにも同じ 2 URL を入れる | **未。これだけが本当に残っている**（#8） | Google Auth Platform → ブランディング |
| `/terms` `/privacy` をログイン不要にする | **済み** | `src/lib/auth/routes.ts` の `PUBLIC_PAGES` に両方あり。`src/proxy.ts` は `isProtectedPath()` が false のパスを Clerk に通さない。`src/app/robots.ts` も両方を Allow |
| `seo-checker.tokyo` の所有確認と承認済みドメイン | **済み** | #31（09-11、Cloudflare 連携で Search Console 所有確認）、#27（09-11、承認済みドメイン登録を画面で確認） |
| プライバシーポリシーに Google のデータの用途を書く | **済み（ただし 1 か所だけ弱い）** | 第 3 条の表に取得するデータを具体名で、第 5 条に用途と Limited Use の明記あり。**弱いのは第 6 条の「学習に利用されない契約・設定での利用に努めます」**。Google のデータについては言い切るほうが安全（[google-oauth-verification.md](./google-oauth-verification.md) の「足りないもの」③） |

- 環境の制約: `app.seo-checker.tokyo` も egress プロキシで遮断されており、本番ページを直接開いての確認はできない。**コードの定義（`PUBLIC_PAGES` / `proxy.ts` / `robots.ts`）で確認した。**
- ドキュメントのみの更新。コードは触っていない。
### 2026-09-17（利用者の質問: Search Console のサイトマップ画面に何を入れるのか）

- 利用者が **Search Console → サイトマップ**（プロパティ `sc-domain:seo-checker.tokyo`）の画面を共有。「新しいサイトマップの追加」が空、「送信されたサイトマップ」も 0 件。→ **まだ 1 本も送っていない状態**。
- **答え: 送るのは 2 本で、どちらもフル URL を入れる。**このプロパティは**ドメイン プロパティ**（`sc-domain:`）なので、ホスト名を省いた `sitemap.xml` だけでは受け付けられない。ドメイン プロパティは `seo-checker.tokyo` とそのサブドメイン全部（= `app.` も）を含むので、2 本とも同じ画面から送れる。
  1. `https://seo-checker.tokyo/sitemap.xml` … 紹介サイト（Cloudflare Workers `seo-checker-hp` が配信。正本は `marketing/public/sitemap.xml`）。**URL は 1 本**（1 ページの静的サイトなので正しい）。
  2. `https://app.seo-checker.tokyo/sitemap.xml` … アプリ（Vercel。正本は `src/app/sitemap.ts`）。**URL は 3 本**（`/terms`・`/privacy`・`/legal/tokushoho`）。アプリ本体は `robots.ts` で意図的に塞いであり（利用者の決定 09-13）、開いているのは規約類だけなので、サイトマップもその 3 ページだけになっているのが正しい。**#13 の OAuth 審査で Google がプライバシーポリシーを見に来るので、こちらも送っておくと早くインデックスされる。**
- **ついでに直したこと**: 紹介サイトの `sitemap.xml` の `<lastmod>` が **2026-09-11 のまま**だった（`index.html` は 09-16 の r80 まで更新されている）。日付を 09-16 に直し、`marketing/README.md` に「`index.html` を直したら `lastmod` も直す」と明記した。lastmod が実態とずれていると Google がその値を信用しなくなり、更新を知らせる意味が無くなるため。
- **確認できなかったこと**: この環境の egress プロキシが `seo-checker.tokyo` / `app.seo-checker.tokyo` への接続を 403 で止めるため、**公開中の `sitemap.xml` / `robots.txt` に実際にアクセスして確かめることはできていない**（リポジトリの中身と生成コードから判断した）。送信時に Search Console がエラーを返したら、その文言をお知らせください。
- 残タスクに **#99** として手順を追加した（#90〜#98 は別セッションが先に使っていたため、番号をずらした）。

### 2026-09-17（OAuth 審査の備え: ポリシーの明記と、申請文・動画台本を作成、r83）

利用者の「進めてください」を受けて 3 つ実施。

**① プライバシーポリシーの修正（r82）**
- 第 5 条に 2 段落を追加。「**運営者は、Google から取得したデータを、汎用的な人工知能（AI）・機械学習モデルの開発・改善・学習には使用しません**」と言い切り、あわせて**精密診断で集計値を AI 事業者の API に送る場面も開示**した（隠すと型 7「申告との矛盾」で刺さるため）。
- 第 6 条の「学習に利用されない契約・設定での利用に**努めます**」→「学習に利用されない**設定・契約のもとで各 AI 事業者の API を利用します**」と運営者の約束として言い切り、Google のデータについて重ねて明記。
- 検証: lint / tsc / **test 1,946 件** / build 通過。別セッションと同時に r82 を取り、マージで**こちらは r83** になった。
- **運用上の条件（重要）**: この記載は「AI 事業者側で学習に使われない設定・契約」を前提にしている。Anthropic の API は既定でそうだが、**Gemini を足すとき（#85）は無料枠を使わない**こと。無料枠は学習に使われうるため、この記載と矛盾する。

**② スコープごとの用途説明文**（[google-oauth-verification.md](./google-oauth-verification.md) の「申請に貼る文面」）
- `webmasters.readonly` と `analytics.readonly` の 2 本を、**日本語と英語の両方**で用意。申請フォームにそのまま貼れる形。
- 芯にした論点: ①**利用者本人が所有・管理するプロパティ**のデータであること ②**本人にだけ表示**すること ③**それが無いと中核機能が成立しない**こと ④読み取り専用しか要求していないこと ⑤売らない・広告に使わない・学習に使わないこと。
- 「AI に送っていることの説明」も別段落で用意した（聞かれる前に出す方針）。

**③ デモ動画の台本**（同ファイルの末尾）
- 11 場面の表。**撮影前に連携を一度解除しておく**（既に連携済みだと同意画面が出ず、動画の要件を満たさない）。
- 要点: 同意画面を全画面で 3 秒以上静止しスコープの文言を読ませる／実際に数値が出ている画面まで映す／YouTube に**限定公開**で上げ、**審査が終わるまで消さない**。

**次の担当は利用者**: #8（Google Cloud のブランディングに 2 つの URL）→ 動画の撮影 → 申請。

### 2026-09-17（利用者報告: サイトマップ 2 本の送信と Ahrefs キーの作り直しが完了）

- 利用者「1 と 2 と 3 完了です」= 前の返答でお願いした 3 件。**#99（サイトマップ 2 本の送信）と #90（露出した Ahrefs キーの作り直し）を完了に変更**した。
- **#99**: `https://seo-checker.tokyo/sitemap.xml` と `https://app.seo-checker.tokyo/sitemap.xml` を Search Console のドメイン プロパティに送信済み。**送信直後のステータスは「取得できませんでした」のこともある**（Google がまだ読みに来ていないだけ）。数時間〜数日後に同じ画面で「成功」／検出された URL が 1 本・3 本になるかだけ見ればよい。数日たっても赤いままなら、その文言を知らせてもらう。
- **#90**: 露出したキーを削除して作り直し済み。これで **#87（1 年ごとの作り直し）の起点は 2026-09-17** になった。期限はマスター画面 `/admin` の「外部連携」→ Ahrefs の行に出る（残り 30 日で黄色、切れると赤。r73）。
- **次に見ておくとよいのは /admin の「外部連携」**: Ahrefs が「設定済み」で期限が 2027-09-17 前後になっていれば、#90 の Vercel 側（変数名の直しと Redeploy）まで正しく通っている。ここが「未設定」なら Redeploy がまだか、変数名が違う。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（サイトマップが片方だけ失敗 → robots.txt が原因だった。r84）

- 利用者が Search Console の結果を共有。**紹介サイトは「成功しました」／検出 1 ページ**、**アプリは「取得できませんでした」／0、型も「不明」**（= Googlebot が一度も中身を読めていない）。
- **原因はアプリの `robots.txt`。**`src/app/robots.ts` は `Allow: /terms` `/privacy` `/legal/tokushoho` と `Disallow: /` を出していた。robots.txt は**より長く一致した行が勝つ**規則なので、`/sitemap.xml` に一致する Allow が 1 本も無く、`Disallow: /`（1 文字）だけが当たって**サイトマップの取得そのものが禁止**されていた。送信しても永久に読まれない状態。
  - **認証（Clerk）は無関係**だった。`src/proxy.ts` のマッチャが拡張子 `.xml` / `.txt` を除外しているので、ログインへのリダイレクトは起きていない。
  - 紹介サイト側が成功したのは、`marketing/public/robots.txt` が `Allow: /`（全許可）だから。対照的で分かりやすい。
- **直したこと（r84）**:
  - `src/app/robots.ts` … `Allow` に `/sitemap.xml` を追加。生成される robots.txt を `npm run build` の出力で確認済み。
  - `src/lib/auth/routes.ts` … `/robots.txt` と `/sitemap.xml` を公開パス（`PUBLIC_PAGES`）にも明示。いまは proxy のマッチャが拡張子で除外しているが、**マッチャを書き換えたときに静かに保護対象へ戻ると同じ事故が起きる**ので、公開範囲の定義でも守る（このファイルの冒頭にある「二重に守る」方針どおり）。
  - `src/app/__tests__/robots-sitemap.test.ts` … **robots.txt の最長一致を再現する小さな関数を書き、「送信したサイトマップを Googlebot が取りに来られる」ことをテストで固定**した。`/`・`/meo`・`/admin`・`/tools/rank`・`/api/analyze` が塞がれたままであることも同時に確認する。Allow / Disallow をいじったときにここで気づける。
  - `src/lib/auth/__tests__/routes.test.ts` の「公開パスが増えていないか」の一覧も意図的に更新（このテストは増やしたら必ず手で直す約束のもの）。
- **学び**: **robots.txt で全体を塞いでいるサイトでは、`sitemap.xml` 自体を Allow に入れ忘れやすい。**アプリ本体を検索から隠す方針（09-13 の決定）と、規約類だけインデックスさせたい要求が両立しているせいで見落としていた。
- 検証は 4 つとも通過（lint / tsc / test 1,948 件 / build）。

### 2026-09-17（利用者の質問: Stripe の商品カタログは何もしなくていいのか）

- 利用者が Stripe の**本番モード**の商品カタログを共有（URL に `/test/` が無い = 本番）。「スタンダード ¥50,000 / 月」「ライト ¥38,000 / 月」の 2 件、作成 2026/09/17 01:50。
- **答え: この画面の中身は正しい。ただし、商品を作っただけでは決済は 1 円も動かない。**
  - **正しい点 3 つ**: ①2 件だけなのは正しい（プレミアムは Stripe に作らない。09-15 の決定）②税コードが「—」なのは正しい（09-17 の決定「料金は税込み」。税を足さずこの額ちょうどを請求する）③「月当たり」= 継続課金になっている。
  - **足りない点**: アプリが決済を出すかどうかは `isStripeConfigured()`（`src/lib/billing/stripe.ts`）が決めていて、条件は **`STRIPE_SECRET_KEY` と スタンダードの Price ID と `STRIPE_WEBHOOK_SECRET` の 3 つが Vercel にそろっていること**。本番の値はまだ 1 つも入っていないので、いまの本番 `/plans` は「テストモード」のまま（= サンドボックスのキーで動いている）。
- **残り 5 手**（#58 の ⑧ を **8b〜8f** に分解して残タスクに書いた）: Price ID を控える → Webhook（`whsec_`）→ カスタマーポータル → `sk_live_` → Vercel に 4 つ入れて Redeploy（+ `DEFAULT_PLAN` を `free` に）。
- **見落としやすい点**: **Price ID は商品一覧に出ない**（商品を開いて「料金」の行から取る）。**テストの `price_…` と本番の `price_…` は別物**なので、テスト側の値を本番に貼ると申し込みが通らない。**Stripe アカウントの有効化（本人確認）**が済んでいないと本番の入金が止まる。
### 2026-09-17（デモ動画の作り方を、実装に合わせた手順に書き直した）

- 利用者「デモ動画を作る流れを、ネクストアクションを詳細に。その通りにやる」。→ [google-oauth-verification.md](./google-oauth-verification.md) の台本を、**フェーズ 0（準備）→ 1（撮影）→ 2（見直し）→ 3（YouTube）→ 4（申請）**の手順に書き直した。
- **実装を調べて台本を現実に合わせた**（`src/components/google/GoogleLinkPanel.tsx`）:
  - ボタンの文言は **「Google アカウントを接続する」**（未接続のとき）。
  - **同意画面は同じタブで開く**（`window.location.href`）。ポップアップではないので**ブラウザのウィンドウ 1 つを録れば全部入る**。
  - **アプリ側に「連携を解除」ボタンは無い**（`grep` で確認）。解除はヘッダー右上の Clerk の `UserButton` → アカウントを管理 → 接続済みアカウント、または Google アカウント側。台本の場面 13 をこれに直した。
- **撮影前の最大の落とし穴を 2 つ明記した**:
  1. **すでに許可済みだと Google は同意画面を出さない。** https://myaccount.google.com/connections で `SEO Checker` のアクセス権を削除してから撮る。やり忘れると確実に撮り直し。
  2. **画面に数字が出るかを先に確認する。**空の画面だけでは弱い。数字が出ないときの対処を 3 案（A: データのある別の Google アカウントで連携して撮る ← 推奨 / B: GA4 を作って数日待つ ← リリースが遅れるので避ける / C: GA4 は選べる画面までにする）。**#10（`wolf@wolf-info.org` 側に GSC / GA4 があるか未確認）がここに効く。**
- YouTube は **限定公開（Unlisted）**。**非公開（Private）にすると審査担当が見られない。**審査が終わるまで消さない。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（Claude in Chrome に渡す作業プロンプトを用意）

- 利用者「やることを Claude in Chrome が分かるようなプロンプトにして出力して」。→ **[chrome-prompts.md](./chrome-prompts.md)** を新規作成し、3 本のプロンプトを置いた。
  - **A. Search Console のサイトマップ再送信**（#99）。r84 が本番に出てから実行する。
  - **B. Stripe 本番の設定 → Vercel の環境変数 → Redeploy → 確認**（#58 の ⑧）。**Stripe と Vercel を 1 本のプロンプトにまとめた**のは、`sk_live_` と `whsec_` を人が中継しなくて済むようにするため。
  - **C. 自分に `plan` を割り当ててから `DEFAULT_PLAN` を `free` にする**（#39）。
- **調べて分かった重要な点: 管理者（`ADMIN_EMAILS`）でもプランの判定は素通りできない。**`src/lib/plans/current.ts` の判定順は Stripe の契約 → `publicMetadata.plan` → `DEFAULT_PLAN` → free で、管理者かどうかは入っていない。管理者権限は `/admin` を開けることと機能の個別開放（`publicMetadata.featureOverrides`）を操作できることであって、自分のプランが上がるわけではない。**だから `DEFAULT_PLAN` を `free` にする前に、Clerk で自分の `publicMetadata` に `{"plan": "premium"}` を入れておく必要がある**（順番を逆にすると自分が締め出される。戻し方は `DEFAULT_PLAN` を `pro` に戻して Redeploy）。C のプロンプトはこの順番を強制する形にした。
- **プロンプトの書き方の方針**（次に作るときも同じにする）: ①冒頭に「絶対に守ること」を置き、**触ってよい対象を明示的に限定**する ②**秘密の値はチャットに書かせず、末尾 4 文字だけ報告させる** ③保存・作成ボタンの前に「何をどこに入れたか」を報告させる ④「分からなければ止めて聞く」と書く ⑤**推測で理由を補わせず、画面の文言をそのまま引用させる** ⑥本番モードでの申し込みテストはやらせない（実課金になる）。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（`wolf@wolf-info.org` で 403 access_denied / テスト状態の本当の影響が判明）

- 利用者が `wolf@wolf-info.org` で Google の画面に進み、**「アクセスをブロック: seo-checker.tokyo は Google の審査プロセスを完了していません」「エラー 403: access_denied」**。
- **原因**: OAuth アプリがテスト状態で、このアカウントが**テストユーザーに未登録**（登録済みは `matsumatsu452@gmail.com` だけ）。
- **ここで判明した重要なこと**: **Clerk のログイン（Google で続ける）も同じ OAuth クライアントを使う**ので、テスト状態のあいだは**テストユーザーに入っていない人はログインすらできない**。招待制リリースでは、お客様を 1 人ずつテストユーザーに追加する運用になる。**#13 の優先度が上がった。**
- **すぐの対処**: https://console.cloud.google.com/auth/audience?project=seo-checker-508104 で `wolf@wolf-info.org` をテストユーザーに追加。
- **検討すべき選択肢を [google-oauth-verification.md](./google-oauth-verification.md) に書いた**: **審査の完了を待たずに公開ステータスを「本番」に切り替える**。未確認のままでも誰でも使え（上限 100 ユーザー）、**7 日失効も消える**。代わりに「このアプリは確認されていません」の警告画面が出る。**招待制で今週リリースするなら、こちらのほうが運用が軽い。**切り替えの可否は Google Cloud の画面で実際に確認してから決める。
- **動画の撮影には影響しない**（テスト状態のままのほうが同意画面がそのまま出て都合がよい）。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（サイトマップがまだ「取得できませんでした」— 待ちなのか別の原因なのかの切り分け）

- 利用者が同じ画面を再共有。**app 側は「取得できませんでした」／0 のまま、紹介サイトは「成功しました」／1**。
- **この時点では、直っていないのか・待てばよいだけなのかを画面から断定できない。**理由は 3 つ重なりうるため:
  1. r84（robots.txt の修正）がまだ本番に出ていない
  2. 出てはいるが、**Google が robots.txt を最大 24 時間キャッシュ**しているので古い内容で判断している
  3. 送り直しをまだしていない（古い失敗の表示が残っているだけ）
- **こちらからは本番を直接見られない**（egress プロキシが `app.seo-checker.tokyo` を 403 で止める。09-17 に再試行して同じ）。**だから推測で「直りました」とは言わない。**
- **切り分けの順番を決めた**（[chrome-prompts.md](./chrome-prompts.md) の A をこの順番に書き直した）:
  1. `https://app.seo-checker.tokyo/admin` の「バージョン」カード →「動いているコミット」が **`1d316f7` 以降**か（robots.txt を直したコミット。マージは `210f868`）。古ければデプロイ待ちで、送り直しても無駄。
  2. Search Console → **設定 → robots.txt レポート** → Google が持っている中身に **`Allow: /sitemap.xml`** の行があるか。無ければ 24 時間キャッシュ。「再クロールをリクエスト」して待つ。
  3. **URL 検査**に `https://app.seo-checker.tokyo/sitemap.xml` を入れる → **「robots.txt により拒否されました」と出るかどうか**が決定的。出なくなっていれば原因は解消していて、あとは Google の再試行を待つだけ。
- **学び**: robots.txt を直したあとの確認は「サイトマップを送り直す」ではなく **URL 検査と robots.txt レポート**で見るほうが速くて確実。送信の成否は Google の都合で遅れるが、この 2 つは今の判定をそのまま返す。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（OAuth の「何の申請か」を整理し、実行手順 7 ステップを確定）

- 利用者の質問「なんの申請ですか？GSC？」→ **Search Console への申請ではない。**GSC / GA4 の API を使う許可は申請不要（Google Cloud で有効化するだけ。済み）。申請するのは **OAuth 同意画面の確認（アプリ検証）**で、対象はプロジェクト `seo-checker-508104` の 1 アプリ。**GSC 用と GA4 用で別々ではなく、1 回の申請で 2 つのスコープをまとめて審査される。**
- **混乱の元だった 2 つの軸を分けて整理した**:

| 軸 | 選択肢 | いま |
|---|---|---|
| **公開ステータス** | テスト / 本番 | **テスト** |
| **確認ステータス** | 未確認 / 確認済み | **未確認** |

  この 2 つは独立で、**「本番だけど未確認」という状態が存在する**。公開ステータスを本番に上げるだけなら**審査を待たずに自分でできる**（テストユーザー登録が不要になり、7 日失効も消える。代わりに「確認されていません」の警告画面が出る）。**今週のリリースに効くのはこちら。**
- **[google-oauth-verification.md](./google-oauth-verification.md) に「実行手順」7 ステップを追記**: ①テストユーザー追加 ②数字が出るか確認 ③**テスト状態のまま**撮影 ④YouTube 限定公開 ⑤**本番へ切り替え** ⑥審査申請 ⑦お客様への案内文。
  **③を⑤より先にやる**のは、本番にすると同意画面の前に警告が挟まり動画が分かりにくくなるため。
- **ステップ 5 の分岐を明記した**: 警告つきで公開できた場合（目的達成）と、「先に確認を完了させる必要があります」で止められた場合（テスト状態のまま運用）。**どちらになったか利用者が報告する**。案内文が変わる。
- **お客様向けの案内文を 2 通り用意した**（本番・未確認のとき用 / テスト状態のまま運用するとき用）。同じファイルのステップ 7。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（利用者の確認: 依頼した作業はやることリストに入っているか）

- 質問「（返答の『次にお願いしたいこと』）これらはやることリストに入ってる？」→ **この会話でお願いした 5 件はすべて入っていた**。対応は #99（サイトマップ）／ #58 の 8a〜8f（Stripe 本番）／ #8（OAuth ブランディング。完了）／ #90（Ahrefs キー。完了）／ #39（`DEFAULT_PLAN`）。
- **ただし、点検して 3 つの不備が見つかったので直した。**
  1. **#39 の書き方が間違っていた。**「自分は `ADMIN_EMAILS` なのでマスター画面で pro を個別開放」と書いてあったが、**管理者であることとプランは別**。`src/lib/plans/current.ts` の判定順は Stripe の契約 → `publicMetadata.plan` → `DEFAULT_PLAN` → free で、管理者かどうかは入っていない。マスター画面の「個別開放」は `publicMetadata.featureOverrides` を機能ごとに立てるもので、プランそのものは上がらない。**このまま従うと `DEFAULT_PLAN` を `free` にした瞬間に自分が締め出される。**正しい手順（先に Clerk で自分に `{"plan": "premium"}` を入れる）と戻し方を #39 に書き足した。
  2. **#85 が 2 つあった**（Gemini の既定モデル／古いブランチ 12 本の削除）。後者を **#101** に振り直した。参照していた作業ログの行も直した。
  3. **r81（ホームページ URL の一元登録）の本番確認が残タスクに無かった。**作業ログには書いたが、利用者がやる確認作業なので **#100** として表に起こした。
- **やり方として決めたこと**: 返答の「次にお願いしたいこと」の表に出したものは、**その場で残タスクの番号に結びつける**（新しいものなら番号を採る）。表に出しただけでメモに無いと、セッションをまたいだ瞬間に消える。
### 2026-09-17（ステップ 2 で「未契約」で止まった → プランの割り当て方）

- 利用者が本番の検索パフォーマンスを開いたところ、**「『ライト』プランの機能です / 現在のプランは『未契約』です」**で止まった。ログインは **`wolf@wolf-info.org`**（アバターは「康太」）。
- **原因はデータではなくプラン判定。**`src/lib/plans/current.ts` の順番は ①Clerk Billing ②`publicMetadata.stripe`（Stripe の契約）③**`publicMetadata.plan`（運用者が手で割り当てる値）**④環境変数 `DEFAULT_PLAN` ⑤free。このユーザーは ②③が無く、**「未契約」= free と判定されている**。
- **ここから分かること: `DEFAULT_PLAN` はすでに `free` になっている（か未設定）。**以前の `pro` のままなら ④で standard と判定され、この画面は開けていたはず。**#39 / A-1 は済んでいる見込み**（Vercel の画面で確認したい）。
- **`ADMIN_EMAILS` はプラン判定に関与しない。**管理者でもプランは別に割り当てが要る（`current.ts` は `ADMIN_EMAILS` を見ていない）。また `/admin` は `matsumatsu452@gmail.com` だけなので、`wolf@wolf-info.org` ではマスター画面から開放できない。
- **対処（招待制リリースでお客様に開放するときも同じ手順）**:

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Clerk → Users → 該当ユーザー → Metadata | https://dashboard.clerk.com/ | **Public metadata** に `{"plan": "standard"}` を入れて保存（`light` / `premium` も可） |
| 2 | 本番 | https://app.seo-checker.tokyo/ | いったんログアウト → ログインし直す（メタデータはセッションに乗るため） |
| 3 | 本番 → 検索パフォーマンス | https://app.seo-checker.tokyo/tools/search-performance | 開けるようになったか、**数字が出るか**を確認 |

- 補足: `wolf@wolf-info.org` でもマスター画面を使いたいなら、Vercel の `ADMIN_EMAILS` にこのアドレスを足して Redeploy（カンマ区切り）。**ただしプランの割り当ては別途必要。**
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（ステップ 2 の結果: Search Console は実データが出た / GA4 は未設定）

- `{"featureOverrides": [], "plan": "standard"}` を Clerk の Public metadata に入れて再ログイン → **検索パフォーマンスが開き、実データが表示された**。
  - 対象サイト **`sc-domain:wolf-g.jp`**（ドメインプロパティ）。28 日: クリック **264**（+37.5%）、表示 **1,670**（+77.8%）、CTR **15.8%**（−22.7%）、平均掲載順位 **7.5**（−1.1）。
  - **動画のステップ 10（Search Console の実データ）はこれで撮れる。**
- **残っているのは GA4。**サイドバーの「サイトレポート」に **「要設定」**が出ている = **GA4 のプロパティが未選択**。設定画面で選ぶ必要がある。一覧が空なら、そのアカウントに GA4 プロパティが無いということ。
- **動画に映すデータについての注意（利用者の判断が必要）**: `wolf-g.jp` の検索データが動画に映る。**自社サイトなら問題ないが、顧客のサイトなら公開（限定公開でも URL を知る人は見られる）の可否を確認するか、自社サイトに切り替える。**
- 次の作業: 設定画面で GA4 のプロパティを選ぶ → サイトレポートに数字が出るか確認 → 出れば撮影へ。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（GA4 の実装の食い違いを発見、OAuth の申請文を訂正、#96）

- 利用者が設定画面とサイトレポートを共有。**2 つのことが分かった。**

**① GA4 プロパティは接続できているが、データが入っていない**
- 設定画面の「GA4 イベントの割り当て」に **プロパティ `546617184` / 直近 28 日 / イベント 0 種類**、「この期間に記録されたイベントがありません」。**OAuth の連携自体は成功しているが、そのプロパティに計測データが無い**（タグ未設置か別プロパティ）。
- `wolf-g.jp` は Search Console で 28 日 264 クリックあるので、**サイトには流入がある。GA4 のタグが入っていないか、別のプロパティに入っている**と考えられる。

**② 実装の食い違い（#96）— GA4 の読み取りに 2 つの経路がある**

| 経路 | 使うもの | 誰のデータか | 画面 |
|---|---|---|---|
| A: **OAuth（お客様ごと）** | `analytics.readonly` + `createGa4ClientWithToken`（`src/lib/google/ga4.ts`） | お客様が選んだプロパティ | **精密診断**、**GA4 イベントの割り当て** |
| B: **サービスアカウント（運営者固定）** | `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON`（`src/lib/ga4/client.ts` の `getGa4Client`） | 運営者の 1 プロパティのみ | **サイトレポート**、**生成 AI 流入分析** |

- **サイトレポートはライト以上の機能として売っているのに、お客様ごとの GA4 を読めない。**しかも本番の画面に**「プロジェクト直下の `.env.local` に次の行を追加し、開発サーバーを再起動してください」という開発者向けの文言**が出ている（`src/components/site-report/SiteReportView.tsx`、`src/components/ai-traffic/AiTrafficView.tsx`）。
- **→ #96 として残タスクに追加。**案 A（2 画面を OAuth 方式に寄せる。コードは既にある）／案 B（今週は外すか明記し、最低限 `.env.local` の文言を直す）。**案 B の最低限はリリース前に入れたい。**

**③ OAuth の申請文を訂正した**
- 当初 `analytics.readonly` の用途説明に「サイトレポートと生成 AI 流入分析に表示する」と書いていたが、**この 2 画面は OAuth を使っていない**。**「精密診断」と「GA4 イベントの割り当て」に直した**（日本語・英語とも）。型 7「申告との矛盾」で刺さるのを避けるため。
- **デモ動画の場面 11 も差し替えた**: サイトレポートではなく、**設定画面の GA4 イベント割り当て**（選んだプロパティとイベント一覧）を映す。

- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（利用者の質問: GA4 タグはツール画面から入れられないのか）

- **答え: 入れられない。**GA4 の計測タグはお客様のサイトの HTML に置くもので、当サービスは別のサイトなので**お客様のサイトに書き込む権限が無い**。どの SaaS でも同じで、①お客様がスニペットを貼る ②CMS のプラグイン ③GTM が既に入っていてコンテナの権限をもらう、のいずれかしかない。
- **できることは 2 つあり、どちらも未実装（#97 として提案）**:
  1. **入っているかの自動判定。**診断でページの HTML を既に取得しているので、`gtag/js?id=G-`・`googletagmanager.com/gtm.js`・`G-XXXXXXX` を探すだけ。**現状は判定していない**（`src/lib/diagnosis/rules/measurement.ts` や `cross.ts` に「主要ページのソースに計測タグが入っているか確認する」という**人への促し**はあるが、自動では見ていない）。半日程度。
  2. **設置手順と貼り付け用スニペットの提示。**接続済み GA4 プロパティの測定 ID を出してコピーさせる。
- **今週の動画への影響**: `wolf-g.jp` にタグを今から入れても**データが貯まるまで数日かかる**ので、今週の撮影では GA4 の数字は出せない。**既に GA4 のデータがある Google アカウント（顧客サイトなど）で連携して撮る**のが唯一の近道。無ければ GA4 は「プロパティを選べる画面」までで撮る。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（利用者の質問: ツール内で完結するのは何か。GSC か）

- **[tool-map.md](./tool-map.md) に「お客様側にどれだけ作業が要るか」の節を追記**（A / B / C の 3 段階）。`src/lib/features/registry.ts` の `requires` / `requiresAny` を機械的に読んで分類した。
- **A: お客様の作業ゼロ = 16 機能**。サイト診断、ページ最適化レポート、ページ診断、AIO 頻出トピック、HP 改修提案、順位計測、LLMO、プロンプト拡張、キーワード調査、AI ライティング、llms.txt、AI 検索モニタリング、**MEO（店名を入れるだけ。お客様の Google 権限は不要）**、口コミ支援、口コミ返信（段階 1）、基本情報掲載。**Google 連携が 1 つも無くても売り物になる。**
- **B: Google 連携だけ（サイトに触らない）** = 検索パフォーマンス。**ただし「完結」ではない**: お客様が Search Console にドメインを登録し**所有確認を済ませている**必要がある。未登録なら DNS に TXT を 1 行（数分）。**GA4 より軽い。**
- **C: サイトに手を入れる** = 生成 AI 流入分析、サイトレポート。**GA4 のタグ設置 + データが貯まるのを待つ**。ここだけが本当に重い。
- **立ち上げの案内の順番**（営業・オンボーディングの指針）: **まず A を全部回す → GSC をつなぐ → GA4 は入っていれば繋ぎ、無ければ別途相談**。これなら初日から価値が出る。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（GA4 の 2 ツールをプレミアムへ、既定で非表示に、r85）

- **利用者の指示**「GA4 は入っていれば繋ぐ、無ければ別途ご相談でいい。**これはプロプランに入れてください。基本この機能はオフでいいです。**」
- **やったこと**（#96 の案 B）:
  - `src/lib/features/registry.ts` の **`site-report` と `ai-traffic` を `plan: "light"` → `"premium"`、`hidden: true`** に。`hidden` は既にある仕組みで、**サイドバーから消えるがページと API は残り、プランのゲートも効く**（API が素通りにならない）。
  - `src/lib/plans/catalog.ts` の**ライトのハイライトから 2 つを外し**、プレミアムに「**Google アナリティクス（GA4）を使う分析。GA4 の計測タグがサイトに入っていることが前提のため、ご相談のうえ有効にします**」を追加。
  - 紹介サイトとサービス案内の**ライトの箇条書きから外し、ツール一覧のバッジを「ライト」→「プレミアム」**に。プレミアムの箇条書きにも 1 行追加。
  - テスト「プレミアム限定のツールは無い」を**「GA4 を使う 2 つだけで、どちらも既定では出さない」**に更新。
- **これで「買ったのに使えない」形が消えた。**ライトを買ったお客様のサイドバーに、GA4 が無いと空になる画面は出なくなる。
- 検証: lint / tsc / **test 1,948 件** / build 通過。
- **残っているもの**: #96 の経路 A（OAuth 方式）への移行は未実装。プレミアムで有効にする場合、いまは運営者が `GA4_PROPERTY_ID` と `GOOGLE_SERVICE_ACCOUNT_JSON` を入れる必要がある（= 運営者の 1 プロパティのみ）。**お客様ごとに出すには経路 A への移行が要る。**
- **未確認**: 利用者は最上位プランを「**プロ**」と呼んでいる（2 回目）。現在のラベルは「プレミアム（伴走）」。**改名するかは未回答。**

### 2026-09-17（初期設定の代行をプレミアムの内容に、r86）

- **利用者の指示**「GSC の初期設定も大変なので、**開放はしているがセットアップ代行はプロプラン**」。
- **機能のゲートは動かしていない。**検索パフォーマンス（GSC）は**ライトのまま**。変えたのは料金表の文言だけ。
  - **プレミアム**に「**Search Console と Google アナリティクスの初期設定の代行（ドメインの登録・所有確認、GA4 の計測タグの設置のご案内、連携の設定まで）**」を追加。
  - **ライト**に「**Search Console・Google アナリティクスの初期設定はお客様側で行っていただきます（設定の代行はプレミアム）**」を明記。買ってから気づく形にしない。
  - 紹介サイトとサービス案内にも同じ線を引いた（ライトは `is-out` の打ち消し行、プレミアムは箇条書きに追加）。
- **これでプレミアムの中身が「人の作業」で一貫した**: 報告ミーティング / 月次レポートと改善作業の代行 / **初期設定の代行** / 優先サポート / GA4 分析（相談のうえ有効化）。
- 検証: lint / tsc / **test 1,948 件** / build 通過。
- **[tool-map.md](./tool-map.md) の A / B / C の整理と合う**: A（作業ゼロ）はそのまま、B（GSC）と C（GA4）の「お客様の手間」をプレミアムで肩代わりする、という売り方になった。

### 2026-09-17（利用者の問題提起: GSC / GA4 の登録が大変。サービスの質として弱くないか）

**質問**「GSC の機能は簡単に模倣できない？ これだとサービスとして質が低いような気がします。GSC と GA4 を登録するのは大変です。解決策は？」

**答えの骨子（調べた結果）**

**① GSC と GA4 は難易度が決定的に違う。同じ「連携」で括ってはいけない。**

| | Search Console | Google アナリティクス |
|---|---|---|
| 必要な作業 | ドメインの所有確認（DNS に TXT 1 行、または HTML ファイル 1 つ） | **サイトに計測タグを設置** |
| 過去のデータ | **登録した瞬間から過去 16 か月分が見える** | **設置した日より前は永久に取れない** |
| 待ち時間 | **ゼロ** | 数日〜数週間 |

→ **GSC は「やれば即戦力」。GA4 だけが本当に重い。**

**② そもそも「登録が大変」なのはゼロから作る場合だけ。**
- すでに制作会社や前の担当者が GSC / GA4 を持っているなら、**「ユーザーと権限」でお客様のアカウントを閲覧者として足してもらうだけ**（1 分）。所有確認をやり直す必要も、タグを入れ直す必要も無い。
- **この分岐を画面で案内していないのが、いまの弱さ。**→ #103。

**③ GSC の「模倣」は部分的に可能で、部品はもう全部ある。**

| GSC の指標 | 代替できるか | 使う部品 |
|---|---|---|
| 掲載順位 | **できる**（既に稼働） | SerpApi（`src/lib/serp/`） |
| 表示回数 | **推定できる** | 月間検索数（`monthlyVolume`。いまは手入力 → DataForSEO で自動化） |
| クリック数 | **推定できる** | 月間検索数 × `ctrForRank`（`src/lib/site-report/findability.ts` に実装済み） |
| CTR | 推定値どうしの割り算 | 同上 |
| **実際の検索クエリ** | **できない** | Google の一次データで、代替が存在しない |

→ **「検索パフォーマンス（推定）」を 1〜2 日で作れる。**#102。契約初日から数字が出て、GSC をつないだら実測に切り替わる設計にする。
**実測の代わりにはならない**（クエリ単位は GSC にしかない）ことは画面に明記する。

**④ GA4 の代替は無い。**タグが要る。ただし #97（タグの自動判定）を入れれば「入っている / いない」を即答でき、案内が早くなる。

**次の判断は利用者**: #102（推定版。1〜2 日）と #103（オンボーディング画面。半日）をやるか。**どちらもリリース後で構わないが、#103 は営業の初回接触で効く。**
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（利用者の決定: API 費用が上がっても GSC / GA4 を模倣する）

**利用者の言葉**「CS が大変ですし、そこにコストを掛けれないので、**API の料金が上がってでも何としてでも GA4 と GSC の機能を模倣したい**」。

**判断の軸が確定した: API 費用 < CS 費用。**連携の説明と代行に人の時間を使うくらいなら、金を払って自動で取る。
設計を **[gsc-ga4-substitute-design.md](./gsc-ga4-substitute-design.md)** に起こした。

**結論**

| 対象 | 代替できるか | 方法 | 規模 |
|---|---|---|---|
| **GSC** | **ほぼできる** | DataForSEO Labs で**ドメインの獲得キーワードを自動発見** → 順位 × 検索数 × CTR で推定。**お客様のキーワード手入力も不要になる** | 2〜3 日（#102） |
| **GA4（流入の量と経路）** | **推定できる** | 同上の集計。オーガニックのみ | 上に含む |
| **GA4（サイト内の行動・CV）** | **外部 API では原理的に不可能** | **自前の計測タグを配る**しかない | 5〜7 日（#104） |

- **なぜ GA4 の行動は外から取れないか**: サイト上でスクリプトが動いていないと観測できない。Similarweb 等の推定サービスは大規模サイト向けで、**月数百セッションの店舗サイトでは値が出ないか誤差が大きすぎる**。
- **自前タグの効き目**: お客様の作業が「Google アカウント → プロパティ作成 → データストリーム → タグ設置 → イベント設定 → 権限付与」から「**発行した 1 行を貼るだけ**」になる。**イベント名の揺れも消えるので、いまの「GA4 イベントの割り当て」画面ごと不要になる**（あの画面の存在自体が、GA4 を使う限り避けられない複雑さの証拠）。**#96 の経路問題もこれで消える。**
- **費用**: Vercel の関数呼び出しと Supabase の行数だけ。GA4 側の API 費用はゼロになる。

**進める順番の提案**: ①#103 オンボーディングの 3 分岐（0.5 日。いちばん安く CS が減る）→ ②#102 GSC の代替（2〜3 日）→ ③#104 自前タグの最小構成（3 日）→ ④CV と画面差し替え（4 日）。**①②は今週のリリースを止めない。③以降はリリース後。**

**先に確定させたいこと**: ①**DataForSEO Labs の単価**（この環境から dataforseo.com に接続できないので、利用者の画面で確認してほしい）②自前タグを作るか ③同意バナーの扱い（Cookie を使わない設計にするが、#12 の専門家レビューと一緒に見てもらう）。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（検索パフォーマンス（推定）を実装、実測をプレミアムへ、r87）

**利用者の指示**「**GSC の代替だけお願いします。既存の GSC と GA4 の機能はプレミアムのみにしてください**」。

**作ったもの（#102 完了）**
- **`src/lib/search-estimate/`**（4 ファイル + テスト）。DataForSEO Labs の `POST /v3/dataforseo_labs/google/ranked_keywords/live` に**ドメインを渡すだけ**で、そのドメインが順位を持っているキーワードが検索数・順位つきで返る。そこに既存の `ctrForRank`（`src/lib/site-report/findability.ts`）を掛けて推定する。
  - 推定表示回数 ≒ 月間検索数／推定クリック ≒ 月間検索数 × CTR(順位)／平均順位は**検索数で重み付け**。
  - **月間検索数が不明な語は分子にも分母にも入れない**（0 扱いにすると数字が黙って小さくなるため。`findability.ts` と同じ方針）。
  - 計算は純関数、応答の読み取りは**壊れた値で例外を投げない**。**テスト 17 件**。
  - **1 件も読めなかったら空で返さずエラーにする**（パスや項目名が変わったのを黙って見逃さないため）。
- `POST /api/search-estimate`（**24 時間キャッシュ**。クレジット節約）と `/tools/search-estimate`。
- 画面の**先頭の注意書きと表の見出しの両方で「推定であって実測ではない」と明示**。実際に検索された語は Search Console にしかない旨も書いた。
- **副産物: お客様のキーワード手入力が不要になる。**ドメインを入れるだけで、実際に順位が付いている語が並ぶ。

**プランの移動**
- **`search-performance`（Search Console の実測）を light → premium。**ライトには推定版を置いた。
- GA4 の 2 つ（`site-report` / `ai-traffic`）は r85 で premium + hidden 済み。
- **プレミアム限定のツール = 「お客様側の設定が要るもの」という線に統一した**（テストにもその意図を書いた）。
- 料金表・紹介サイト・サービス案内をこの線に合わせ、紹介サイトには「検索パフォーマンス（推定）」のツールカードを追加した。

**検証**: lint / tsc / **test 1,967 件**（+19）/ build 通過。`/api/search-estimate` と `/tools/search-estimate` がビルドに出ることを確認。

**利用者に確認したいこと（本番で動かす前に）**
1. **`DATAFORSEO_LOGIN` と `DATAFORSEO_PASSWORD` が Vercel に入っているか**（#91 の作業。入っていないと画面が「未設定」で止まる）。
2. **エンドポイントと単価**。この環境から dataforseo.com に接続できないため、**パスは知識で書いた**。違っていたら画面にエラーが出るので、そのときは **`DATAFORSEO_LABS_RANKED_PATH` に正しいパスを入れれば差し替えられる**（デプロイ不要）。**単価は利用者の画面で確認してほしい。**
3. 1 回の取得は既定 200 語。増やすと単価が上がる（`limit` で変更可、上限 1,000）。

### 2026-09-17（Vercel の画面を確認: Hobby のまま / 容量 62% / 二重ビルド継続）

利用者が Vercel の Overview を共有。3 つ分かった。

**① Vercel は Hobby プランのまま（#42。リリース前に必須）**
- 左上に `Hobby` バッジ、「Upgrade to Pro」が出ている。**Hobby は非商用限定**なので、**お金を受け取る前に Pro（月 20 ドル）へ上げる必要がある**。画面: https://vercel.com/matsumatsu452-6233/seo-checker/settings （Settings → General → Plan）。

**② 直近 30 日の使用量。Functions Storage が 62% で、ここだけ注意が要る**

| 項目 | 使用量 | 上限に対して |
|---|---|---|
| **Functions Storage** | **6.26 GB / 10 GB** | **62%。ここが先に埋まる** |
| Deployment Storage | 2.8 GB / 10 GB | 28% |
| Fluid Active CPU | 17分31秒 / 4時間 | 7% |
| Edge Requests | 15K / 1M | 1.5% |

- **CPU もリクエストも余裕がある。**増えているのは**ビルドの成果物の保存量**だけ。

**③ #89 の二重ビルドが続いている（②の原因の一部）**
- Recent Previews に `claude/laughing-fermat-c9rh4z` と `claude/happy-sagan-zmn1rk` のプレビュービルドが並んでいる。
- **main と作業ブランチに同じ内容を push しているため、Production と Preview の両方がビルドされる。**中身は同じなので Preview 側は捨てているのと同じで、**保存量とビルド時間を倍使っている**。
- **Claude 側の運用ルール（作業ブランチに push する）を変えずに直す方法**: Vercel の **Settings → Git → Ignored Build Step** に `claude/*` ブランチをスキップする条件を入れるか、**Preview の対象ブランチを絞る**。画面操作だけで済み、履歴の運用は変えなくてよい。
- Pro に上げれば上限も上がるので、**#42 を先にやれば ② は当面問題にならない**。

**デプロイ自体は正常**: r87 のコミットが 5 分前に緑のチェックで入っている。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（Vercel の二重ビルドを止めた / さらに効く改善を計測した）

**利用者が設定した内容（#89 対応済み）**
- Vercel → Settings → Git → **Ignored Build Step** を Custom にして保存（「Ignored build step updated」を確認）:

```sh
case "$VERCEL_GIT_COMMIT_REF" in claude/*) exit 0;; *) exit 1;; esac
```

- **exit 0 = ビルドをスキップ、exit 1 = ビルドする**（Vercel の仕様。直感と逆なので注意）。`claude/*` のプレビュービルドが止まり、`main` は今までどおり。**次の push から有効。**
- 「Preview の対象ブランチを絞る」は **Hobby プランの Git 設定に項目が無かった**ため使っていない。

**Claude in Chrome が挙げた注意点の評価**
- 「Production Overrides が出ている」→ **正しい。**いまの本番デプロイが古い設定のまま動いているという意味で、次の push で解消する。
- 「Automatic のときの重複スキップが無くなった」→ **このリポジトリではほぼ影響しない。**Vercel の Automatic は**プロジェクトのルートディレクトリ配下に変更があったか**で判断する仕組みで、ここはリポジトリの直下が Next.js のプロジェクトなので、もともとほとんどスキップされていなかった。

**さらに効く改善（提案。実データで確認した）**
- **直近 40 コミットのうち 27 件（68%）が `docs/` だけの変更**（運用メモの更新ルールのため、やり取りのたびに 1 件出る）。**これが全部、本番の完全ビルドを起こしている。**Functions Storage 6.26 GB の大半はこれ。
- 対策: Ignored Build Step を次の形にすると、**`docs/` と `marketing/` だけの変更ではビルドしなくなる**（`marketing/` は Cloudflare が配信するので Vercel には無関係）。

```sh
case "$VERCEL_GIT_COMMIT_REF" in claude/*) exit 0;; esac
git diff --quiet HEAD^ HEAD -- . ':(exclude)docs' ':(exclude)marketing' && exit 0 || exit 1
```

- **失敗したときの向きが安全**: git の履歴が浅くて差分が取れないときはコマンドがエラーになり、**ビルドする側に倒れる**（取りこぼしではなく余分に作る側）。
- **代わりに 1 つ失うもの（判断が要る）**: マスター画面の「**動いているコミット**」（`VERCEL_GIT_COMMIT_SHA` を表示。`src/lib/release/build.ts`）が **main の先頭と一致しなくなる**。ドキュメントだけの更新をスキップするので当然だが、**いまの動作確認の手順が「一致すること」になっている**ため、手順の書き換えが要る（「main の**コードを含む**最後のコミットと一致」に変える）。
- **リリース番号は影響を受けない**（`src/lib/release/releases.json` は `src/` にあるのでコード扱い。r 番号を足すコミットは必ずビルドされる）。
- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（GSC / GA4 の詳細機能をサイドバーから完全に外す、r88）

**利用者の指示**「GSC と GA4 の詳細機能は基本的にほとんどのユーザーに使われないのでタブから消してください。ライトプランだと使えない機能はどう表示されていますか？」

**やったこと（r88）**
- **`search-performance`（Search Console の実測）を `hidden: true` に**（`src/lib/features/registry.ts`）。GA4 の 2 つ（`site-report` / `ai-traffic`）は r85 で非表示済みだったので、これで **GSC / GA4 の詳細機能 3 つはどのタブにも出ない**。ページ（`/tools/search-performance`）・API・プレミアムのゲートはそのまま残る。
- 「検索パフォーマンス（推定）」の説明文にあった「連携できる場合は『検索パフォーマンス』の実測値をご覧ください」を「実測値が必要な場合はプレミアムで連携の設定を代行します」に変更（サイドバーに無い画面へ誘導しないため）。
- テスト追加: **「プレミアム限定のツールはすべてサイドバーに出さない」**（`src/lib/plans/__tests__/plans.test.ts`）。`groupsForSidebar()` の結果に `plan: "premium"` が混ざらないことを固定。
- `docs/dev/ARCHITECTURE.md` のルーティング表に `/tools/search-estimate` と `/tools/search-performance` の行を足し、`hidden` の 3 つに印を付けた。
- **設定画面の Google 連携（Search Console / GA4 の接続）は残してある。**精密診断が「連携済みなら」GSC / GA4 の数字を事実シートに入れる仕組みは変えていない。

**検証**: lint / tsc / **test 1,968 件**（+1）/ build 通過。

**利用者の質問への回答: ライトで使えない機能はどう見えているか**
- **サイドバー**: 項目は消さずに残し、右端に **「有料」の小さなバッジ**が付く（`src/components/shell/Sidebar.tsx`）。マウスを乗せると「『スタンダード』プランでご利用いただけます」と出る。プランが分かる前（読み込み中）はバッジを出さない。運用者がマスター画面で個別開放した機能はバッジなしで開く。
- **クリックして開いたとき**: 画面の見出しは出るが、ツール本体の代わりに **「『スタンダード』プランの機能です」の案内**（`src/components/plans/PlanGate.tsx`）。本文は「この機能はスタンダード（月額 50,000 円）以上でご利用いただけます。現在のプランは『ライト』です」と「プランの内容を見る」のリンク（`/plans`）。
- **API**: 画面と別に `checkPlanForFeature` でも止めているので、URL を直接叩いても動かない。
- **今回の変更前は**、Search Console の実測がライト・スタンダードの人に「有料」バッジ付きで見えていた（バッジの文言は「『プレミアム（伴走）』プランでご利用いただけます」）。使えない項目がタブに残る状態だったので、今回消した。
- 見せ方を変えたければ候補は 2 つ: ①「有料」バッジを「スタンダード」のようにプラン名にする（`planShortLabel` を変えるだけ）、②ライトでは項目ごと消す（`hidden` と同じ仕組みでプラン別に出し分ける）。①は「上に何があるか」が見えるので、いまの 3 段階の売り方（ライトをおとりにしてスタンダードへ）とは①のほうが相性がよい。判断があれば次の作業で。

### 2026-09-17（GSC / GA4 を提供終了、自前の計測タグ「アクセス解析」を追加、r89）

**利用者の指示**「Google Search Console と Google Analytics 4 は使わない方針で。機能自体はオフにして構わない。スタンダード・ライトから、この 2 つの無料の Google の機能を使ったサービスは停止して。その代わり、似たデータを取れるサービス（先ほど説明したもの）を使えるように。main にマージして」

**止めたもの（r89）**
- 画面: `/tools/search-performance` → `/tools/search-estimate` へ転送、`/tools/site-report` と `/tools/ai-traffic` → `/tools/analytics` へ転送。registry から 3 つとも削除（プレミアム限定のツールは 0 に。テストで固定）。
- API: `/api/search-performance` `/api/site-report` `/api/ai-traffic` `/api/google/link` `/api/google/events` は **410 Gone**（古いクライアントが叩いても実費が出ない）。
- 設定画面の「Google 連携」カード（Search Console のサイト・GA4 プロパティの選択）と「GA4 イベントの割り当て」を撤去。
- 接続時に要求する OAuth スコープから `webmasters.readonly` / `analytics.readonly` を外した（`REQUIRED_SCOPES = []`）。口コミ返信の `business.manage` だけを、口コミ返信の画面から要求する。
- 精密診断: Google 連携の層を集めない（`unusedGoogleOutcome`）。「数字の診断」カードはデータが無ければ出さない。
- 料金表（ライト・プレミアムの記載）、オンボーディングの手順 2（Google 接続 → 計測タグの設置）、紹介サイト（12 か所）、プライバシーポリシー、README、ARCHITECTURE / tool-map / OAuth 審査メモを同じ方針に書き換え。
- **削除していないもの**: 上記の裏側のコード（`src/lib/google/search-console/`・`src/lib/ga4/`・`src/components/{search-performance,site-report,ai-traffic,google}/` など）。`git rm` がこのセッションの安全装置（不可逆な削除の扱い）で止められたため、**転送と 410 で止めるにとどめた**。削除は #105 として利用者の許可待ち。

**足したもの: アクセス解析（計測タグ）`/tools/analytics`（ライト）**
- **`/t.js`**: お客様のサイトに貼る 1 行 `<script async src="https://app.seo-checker.tokyo/t.js" data-site="…"></script>` の本体（`src/lib/analytics/script.ts`）。ページビュー（パス・参照元・UTM・自サイトのホスト）、離脱（滞在秒・スクロール到達 %）、電話 / メール / 外部リンクのタップ、フォーム送信。SPA の pushState にも追従。Cookie も localStorage も使わない。
- **`POST /api/t`**（公開）: 収集口。サイト ID の実在確認（10 分キャッシュ）、1 回 20 件まで、IP ごとに 1 分 120 回、クローラの UA は捨てる。常に 204。訪問者 ID は「日替わりの塩 + サイト + IP + UA」の SHA-256（IP は保存しない。`TRACKING_SECRET` 任意、無ければ Supabase のキーから派生）。
- **`POST /api/analytics`**: 7 / 28 / 90 日の報告書 + 貼り付け用タグ + 最後に届いた時刻。集計は純関数（`aggregate.ts`。セッション = 30 分の空き、流入元 = 最初のページビュー、CV はセッションの範囲内）。開くたびに 400 日より古い生ログをそのサイトの分だけ削除。
- 画面: タグのコピー・受信状況 → 期間タブ → サマリー（訪問者・セッション・PV・平均滞在・CV・生成 AI 経由。前期比）→ 日別 → 流入元（検索 / 生成 AI / SNS / 広告 / 参照 / 直接。AI の内訳と参照元の上位）→ ページ別。生成 AI の判定は GA4 版の辞書（`src/lib/ga4/ai-sources.ts`）を流用。
- テスト 21 件（分類・集計・収集口の検証・ハッシュ・クローラ判定）。

**検証**: lint / tsc / **test 1,969 件** / build 通過。`/t.js` `/api/t` `/api/analytics` `/tools/analytics` がビルドに出ることを確認。

**利用者にお願いしたいこと**
1. Supabase の SQL Editor で「6 つ目（r89）」の SQL を実行（#106）。実行するまで `/tools/analytics` は「テーブルが見つかりません」。
2. 死んだコードを消してよいか（#105）。「消してよい」の一言で次のセッションが削除する。
3. プライバシーポリシーの第 2・5・7・8・11 条を専門家レビューに含める（#12）。計測タグは**お客様のサイトの訪問者**のデータを預かるので、ここがいちばん見てもらうべき箇所。
4. 紹介サイトの再デプロイ（#108）。

### 2026-09-17（アクセス解析（自前の計測タグ）を取り下げ、r90）

**利用者の指示**「（タグを貼るだけで見られる、について）これはツールで完結しないので面倒なのでやりません」

**やったこと（r90）**
- registry から `analytics` を削除。`/tools/analytics` と GA4 系 2 画面の転送先を「検索パフォーマンス（推定）」に統一。
- `/api/analytics` `/api/t` は 410、`/t.js` は空のスクリプトを 410 で返す（万一貼られていても何も起きない）。公開ルートから `/t.js` `/api/t` を外した（routes.test.ts）。
- オンボーディングは 3 手順（URL 登録 → 店舗登録 → 精密診断）。テストで「Search Console」「計測タグ」を含む手順が無いことを固定。
- 料金表（ライトの記載・プレミアムの「タグ設置の代行」）、紹介サイト（8 か所）、プライバシーポリシー（計測タグの記述をすべて取り消し。第 5 条の GSC / GA4 不使用は残す）、README、ARCHITECTURE、tool-map を同じ方針に。
- `src/lib/analytics/`・`src/components/analytics/` は削除待ち（#105 に追記）。Supabase の SQL（6 つ目）は**実行不要**。
- **新しい線**: お客様側の作業が要る機能は置かない（判断の経緯に追記）。

**検証**: lint / tsc / **test 1,969 件** / build 通過。

**利用者にお願いしたいこと**: 死んだコードを消してよいか（#105）の一言だけ。Supabase の SQL は実行しないでください。

### 2026-09-17（利用者の質問: 検索パフォーマンス（推定）は AI の検索結果? GSC / GA が無いと厳しい? → 説明文を修正、r91）

**利用者の質問**（本番の `/tools/search-estimate` の画面を共有）「これは AI による検索結果をまとめたページ? ここは SEO のページなので SEO の検索結果をまとめた機能が欲しい。GSC / GA が無いと厳しい?」

**回答**
- **AI ではなく Google の通常検索（SEO）が対象。**誤解の原因は、未設定の案内に出る DataForSEO の説明文が「AI 検索モニタリング。ChatGPT / Gemini …」（GEO ツール向けの文）だったこと。同じ鍵を 2 つのツールで使っているのに、説明が片方しか書いていなかった。
- **GSC / GA が無くても、SEO の「どのキーワードで何位か・およその表示回数とクリック数」は出せる**（DataForSEO Labs の ranked keywords × 順位別 CTR）。**出せないのは「実際に検索された語」と「実際のクリック数」**（GSC の一次データ）。この線は gsc-ga4-substitute-design.md のとおり。
- **画面が「要設定」で止まっているのは `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` が Vercel に無いから**（#91 の作業 4〜5 が未了）。入れれば動く。

**やったこと（r91）**
- `integrations.ts` の DataForSEO の説明を「Google の通常検索（SEO）の推定 + AI 検索モニタリング」に。
- 推定の画面の注意書きから「Search Console の実測値をご覧ください」（r89 で不使用にしたのに残っていた）を消し、「対象は Google の通常検索。AI での引用は LLMO / AI 検索モニタリングで」と明記。
- 未設定の案内（`SetupNotice`）を「運用者側の設定でお客様の作業は無い。本番は Vercel の環境変数」に（本番に `.env.local` と出ていた問題。09-17 の作業ログで指摘済み）。
- 検証: lint / tsc / test 1,969 件 / build 通過。

**利用者にお願いしたいこと**: #91 の 4〜5（DataForSEO のログインとパスワードを Vercel に登録 → Redeploy）。これで推定の画面が動く。

### 2026-09-17（利用者の質問: DataForSEO 1 本で AI 検索も SEO も済む? Perplexity / Gemini / OpenAI の API は不要になる? 安い?）

**調べたこと（Web 検索の要約。dataforseo.com 本体はこの環境から開けないので、検索結果の要約と第三者の解説記事。単価は本人の画面で要確認）**
- DataForSEO は 1 契約で **SEO（順位 = SERP API、獲得キーワード = Labs API）と AI（LLM Responses = ChatGPT / Claude / Gemini / Perplexity、AI Overviews / AI Mode = SERP API）の両方**を提供。月額なし・前払い（最低入金 $50、$1 のお試し）。**2026-07-01 に約 20% の値上げ**があった → `integrations.ts` / `pricing.ts` の既定単価（09-16 に記録）は古い可能性。
- **LLM Responses の料金 = 基本料（Live $0.0006 / 回）+ その LLM のトークン代と Web 検索代（各社の API 料金をそのまま転嫁）**。つまり **DataForSEO 経由でも LLM の実費は消えない。直接契約より「基本料の分だけ高い」が、口座が 1 つで済む。**
- **重要**: `src/lib/geo/pricing.ts` の既定（LLM 標準キュー $0.0012 / 回など）は**基本料だけ**を見ている。トークン代の転嫁分が乗るなら、メモの「1 アカウント月 ≒ $3.9」は**過小**。$1 のお試しクレジットで 1 回叩き、ダッシュボードの請求額で実測するのが確実。
- Labs `ranked_keywords`: **$0.012 / タスク + $0.00012 / 行**（200 行なら ≒ $0.036 / 回。24 時間キャッシュなので 1 社月 ≒ $1 以下）。順位: Live $0.002 / 標準 $0.0006。AI Overviews は通常の 2 倍。
- 直接契約の単価: OpenAI GPT-5 $1.25 / $10 per 1M + Web 検索 $10 / 1,000 回（+ 検索内容 8K トークン）。Gemini 2.5 Flash $0.30 / $2.50 + グラウンディング（1 日 1,500 回まで無料、超過 $35 / 1,000。3.x は月 5,000 回無料、超過 $14 / 1,000）。Perplexity sonar $1 / $1 + 検索料 $5〜12 / 1,000 回。Claude は Web 検索 $10 / 1,000 回 + トークン。

**回答の要点**
- 「両方できる」= **はい**。「他社 API が不要になる」= **やり方次第で、はい**（LLMO モニタリングを DataForSEO 経由に作り替えるか、AI 検索モニタリングに一本化して LLMO を引退させる）。**Anthropic だけは残る**（改修案・原稿・返信文を書くのは Claude）。
- 「安いか」= **同じか少し高い**（実費 + 基本料）。利点は安さではなく**口座と請求が 1 つになること**。
- 提案: **AI 検索モニタリング（DataForSEO）に一本化し、LLMO モニタリングは引退**（機能がほぼ重複: どちらも「登録プロンプトを AI に投げてブランドの言及・引用を数える」）。判断待ち → 入力待ちに追加。

- ドキュメントのみの更新。コードは触っていない。

### 2026-09-17（LLMO モニタリングとセカンドオピニオンを提供終了、AI の計測を AI 検索モニタリングに一本化、r92）

**利用者の決定**「AI 検索モニタリングに一本化して LLMO モニタリングを引退させる。いいですね！それでいきます！」

**やったこと（r92）**
- `/tools/llmo` → `/tools/geo` へ転送。`/api/llmo/run` と `/api/seo-analysis/second-opinion` は 410。registry から `llmo` を削除。
- 精密診断: セカンドオピニオン（ChatGPT）のカードを撤去、`optional` から `openai` を外した。Claude だけで報告書は完成する（もともとそう作ってある）。
- 連携一覧（`INTEGRATION_KEYS`）から `openai` / `gemini` / `perplexity` を削除。マスター画面の「外部連携」からも消える。
- プロンプト拡張の「LLMO モニタリングに登録」→「**AI 検索モニタリングに登録**」（`PUT /api/geo/setup` にプロンプトを 1 本ずつ登録。モデルは ChatGPT / Gemini、カテゴリ名をタグに）。
- **AI 検索モニタリングのプランはスタンダードのまま。**いったんライトに下げたが、`plans.test.ts` に「変動費（月 ¥2,000 前後）が出るためスタンダード。ライトに下ろすなら料金表も直す」という 09-15 の判断が記録されていたので戻した。代わりに料金表と紹介サイトに「AI 検索モニタリング: …（ライトには含まない）」を明記。**ライトに下ろしたければ一言ください**（registry の `plan` と料金表の 2 か所）。
- README / ARCHITECTURE / tool-map / `.env.example` / プライバシーポリシー（Anthropic 以外の AI 事業者の記述を削除）を同じ方針に。
- 削除待ち: `src/lib/llmo/providers/`・`src/components/llmo/`・セカンドオピニオン一式（#105 に追記）。`src/lib/llmo/expansion/` はプロンプト拡張が使うので残す。
- 検証: lint / tsc / **test 1,962 件**（LLMO API のテスト 8 件 → 410 の 1 件に） / build 通過。

**一本化で失われたもの（要望があれば #109）**: LLMO では Claude と Perplexity の回答も見られたが、AI 検索モニタリングは ChatGPT / Gemini / AI Overviews の 3 つ。DataForSEO は Claude / Perplexity にも対応しているので、足すなら `src/lib/geo/` の拡張で 1 日。

**利用者にお願いしたいこと**
1. Vercel に `OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY` が入っていれば削除（残っていても害は無いが、鍵は使わないものを置かない）。各社の API 契約（前払い残高）は使い切りか解約。
2. DataForSEO の登録 → `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` を Vercel に → Redeploy（#91 の 2〜6）。これで検索パフォーマンス（推定）と AI 検索モニタリングの両方が動く。
3. 死んだコードを消してよいか（#105）。

### 2026-09-17（DataForSEO 登録完了、`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` の対応を案内）

- 利用者が DataForSEO に登録し「API アクセス」画面を共有（残高 $1.00 = お試しクレジット）。
- 対応: **`DATAFORSEO_LOGIN` = 画面の「API ログイン」（メールアドレス）**、**`DATAFORSEO_PASSWORD` = 「API パスワード」**（ログイン画面のパスワードとは別物）。「Base64 形式」は使わない（コードが login:password から自分で作る。`src/lib/geo/dataforseo.ts`）。
- **API パスワードがスクリーンショットに写った状態で共有された** → 画面の「パスワードをリセット」で作り直し、**新しい方**を Vercel に入れるよう案内。古い値はメモに書かない。
- 次: #91 の 4〜6（Vercel に 2 つ登録 → Redeploy）→ `/admin` で「DataForSEO 設定済み」→ `/tools/search-estimate` と `/tools/geo` で動作確認。
- ドキュメントのみの更新。

### 2026-09-17（DataForSEO を Vercel に登録、検索パフォーマンス（推定）が本番で動作）

- 利用者報告「入れた。6 も OK」= `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` を登録して Redeploy し、`/tools/search-estimate` でドメインを入れて推定が出た。
- これで **r87 で「知識で書いた」Labs のエンドポイント（`/v3/dataforseo_labs/google/ranked_keywords/live`）が正しかったことが確定**。#102 の「要確認」は解消。
- 未確定: 1 回の取得で減ったクレジット額（単価）。利用者に「残高がいくらになったか」を確認中。
- 次: #91 の 7〜9（`/admin` で設定済み確認 → `/tools/geo` でブランド・プロンプト登録 → 翌朝の計測）、$50 の入金、#105（死んだコードの削除）の許可。
- ドキュメントのみの更新。

### 2026-09-17（提供終了した機能のコードを削除、r93）

**利用者の許可**「消してよいです」（#105）。

**消したもの**: `src/lib/google/{search-console,setup,settings,status,ga4,analytics-admin}`、`src/lib/ga4`、`src/lib/ai-traffic`、`src/lib/site-report`（`findability.ts` だけ `src/lib/search-estimate/` へ移動）、`src/lib/analytics`、**`src/lib/diagnosis`（数字の診断 134 ルール。GSC / GA4 が無いと発火しないので機能ごと廃止）**、`src/lib/llmo` の LLMO 本体（`expansion/` = プロンプト拡張だけ残す）、セカンドオピニオン一式、`components/{google,search-performance,site-report,ai-traffic,analytics,llmo}`、対応する API と tests、GA4 の連携キー（`ga4`）。
**残したもの**: 旧 URL の転送ページ 4 つ（ブックマーク対策。1〜2 か月後に消してよい）、`src/lib/google/{business-profile,token,scopes,errors}.ts`（口コミ返信）。

**精密診断への影響**: 事実シートから「数字の診断」の層（N-◯◯ の行）と、`coverage.searchConsole / ga4 / diagnosis` を外した。AI への指示文からも数字の診断の決まりを削除。**古い保存分（`analysis_runs.sheet`）に残っている `diagnosis` キーは読まないだけで、表示は壊れない。** `analysis_runs.second_opinion` 列は使わなくなった（消さなくてよい）。

**検証**: lint / tsc / **test 1,506 件**（削除したテスト 456 件分減少） / build 通過。文書（README / ARCHITECTURE / tool-map / scoring-reference §7 / diagnosis-rules-spec / `.env.example`）に「廃止」を明記。

### 2026-09-17（サイドバーのタブ不具合修正・ツール構成の見直し・サイテーション追加、r94）

**利用者の指示**「（SEO / MEO / AIO の）ボタンの反応が悪い。切り替わらないことが多い」「いらない機能が多い。本当にユーザーが必要な機能に絞ってシンプルにしたい。大規模なリファクタリングと機能の整理を」「AIO にサイテーション機能を付けたい」「HP 改修提案は SEO にあるべき」「SEO はユーザーの HP の最適化。AIO はサイテーションなど基礎的な内容も含める。AIO 対策 = SEO + MEO + 海外の基本情報登録サイトへの NAP 登録・サイテーション。このツールは SEO に競合より少し力を入れている AIO 対策可視化ツール」。

**やったこと（r94）**
- **タブの不具合**: 原因は表示の決め方（画面のタブが常に勝つ）。押したタブを最優先にした（上の「判断の経緯」）。タブの下に選んだタブの位置づけを 1 行出す。
- **構成**（`src/lib/features/registry.ts`。並びは 09-13 の指定 SEO → MEO → AIO のまま）
  - AIO タブ: 基礎対策 = **サイテーション（新規 `/tools/citations`）**・基本情報掲載・llms.txt 生成（生成 → 基礎対策へ）／ 計測 = AI 検索モニタリング
  - SEO タブ: 診断 = 精密診断・ページ診断・**HP 改修提案（AIO → SEO）**／ 計測 = 順位計測・検索の推定 ／ 調査 = キーワード調査 ／ 生成 = AI ライティング
  - MEO タブ: Google マップ・口コミ支援・口コミへの返信（変更なし）
  - サイドバーから外した: ページ最適化レポート（`/tools/page-report` → HP 改修提案へ転送。`src/lib/page-report/` は HP 改修提案・PSI・llms.txt が使うので残す）、AIO 頻出トピック（`/tools/aio-topics` → AI 検索モニタリングへ転送。API は残る）、プロンプト拡張（ページはそのまま。AI 検索モニタリングの「計測するプロンプト」カードからリンク）。画面の部品（`src/components/{page-report,aio-topics}/`）は削除。
  - 料金表・マスター画面の個別開放・サービス資料も `toolGroupsForDisplay()` で同じ一覧を使う（外した機能が料金表にだけ残らない）。料金表の文言（ライト / スタンダード）を新しい構成に合わせた。
- **サイテーション**（`src/lib/citations/`・`/api/citations`・`src/components/citations/`。ライト。DataForSEO）: 店名 + 電話 / 店名 + 住所 / 店名（自社サイト以外）の 3 通りで Google を検索（`/v3/serp/google/organic/live/advanced`、上位 30 件）→ 1 サイト 1 行にまとめ、種類（地図 / ディレクトリ / 口コミ / SNS / メディア / その他。既知の媒体 50 件は `sources.ts`）と、検索結果の文中の電話番号・住所が基本情報と一致するか（別の番号が出ていれば「要確認」）を表示。主要媒体（検索結果に出る 8 媒体）の見つかった / 見つからない → 基本情報掲載へ。MEO の登録店舗から基本情報を取り込み。CSV。同じ入力は 24 時間キャッシュ。1 つの検索が失敗しても残りは返す。
- 文書: README / ARCHITECTURE / tool-map を新しい構成に。
- 検証: lint / tsc / **test 1,524 件**（サイテーション 15 件を追加、削除した画面のテストは無し） / build 通過。

**利用者にお願いしたいこと**: #110（サイテーションの本番確認）と、#111 / #112 の判断（入力待ち）。

### 2026-09-17（サイドバーを「AIO 対策の中に SEO / MEO / サイテーション」の入れ子に、r95）

**利用者の指示**「AI の中に SEO や MEO、サイテーションが入るようにしてほしい。現状は独立しているので、くくり的には AI の中にあると分かる構成に」。

**やったこと（r95）**
- `registry.ts`: 親 `AIO_CATEGORY`（AIO 対策）と柱 `FEATURE_CATEGORIES`（seo / meo / citation）に分け、`sidebarTree()` で「親の直下（AI 検索モニタリング）／ 柱ごとの機能 ／ 共通（料金・設定）」を返す。サイテーション・基本情報掲載・llms.txt は `category: "citation"`。
- `Sidebar.tsx`: 3 タブを廃止。見出し「AIO 対策」+ 説明 → AI 検索モニタリング → 罫線でぶら下げた 3 本の柱（開閉式。見出しに機能数、開いた柱に説明 1 行）→ 設定。ツール 1 件の描画を `FeatureLink` にまとめた。
- 保存する値（`sidebarTab`）は `seo / meo / citation`。古い `aio` は検証で落ちて既定（seo）に戻るだけ。
- 検証: lint / tsc / test 1,522 件 / build 通過。本番ビルドで柱の開閉と画面移動を確認。

### 2026-09-17（利用者の質問: Google マップの詳細取得は権限なしで全部見られるのか）

**質問**「Google マップの詳細情報を取得する仕組みが正しく動いているか確認したい。申請や編集権限なしで、ビジネス プロフィールのある店舗・会社の過去のデータまで全部見られるのか」。

**回答の要点**（コード `src/lib/maps/client.ts` と `score.ts` から）
- **申請も編集権限も不要**なのは Places API (New) の範囲 = Google マップに公開されている情報（店名・住所・電話・サイト・営業時間・評価・口コミ件数・**口コミは最新 5 件だけ**・写真は最大 10 枚のメタ情報・カテゴリ・属性・営業ステータス・価格帯・Google の要約）。運営者の API キー（`GOOGLE_PLACES_API_KEY`）だけで、誰の店舗でも取れる。
- **取れないもの**（オーナー権限 = Business Profile API。#54 で審査申請済み）: 説明文・開業日・メニュー・投稿（最新情報）・写真の投稿日とオーナー投稿かどうか・ロゴ / カバー・口コミの全件・返信と返信率・インサイト（表示回数・経路検索）。ツールではこれらを「未取得」として分母から外すか、オーナー申告（9 項目）で埋める。
- **過去のデータは Google からは取れない**。Places API は「いま」のスナップショットだけ。ツールの履歴は登録した日から毎週月曜 5:00 に取り直して積み上げる（`refresh.ts`）。登録前にさかのぼることはできない。
- 動作確認は #2 の通し確認（`/admin` の外部連携で Places 設定済み → `/tools/maps` で店名検索 → 報告書）で行う。未取得の項目が「未取得」と出るのは正常。
- ドキュメントのみの更新。

### 2026-09-17（利用者の質問: オーナー権限を自然にもらって返信率・インサイトを見るには）

**質問**「サービスとしてオーナー権限が要る。どういう方法なら自然にもらえて、返信率やインサイトを見られるか」。

**回答の要点**
- 方法は 3 つ。**A. お客様が自分の Google アカウントで「接続」を押す（OAuth、`business.manage`）** = ツールにもう作ってある（口コミへの返信の `ConnectBusinessButton`）。お客様の作業は 1 クリック。**B. 運営者の Google アカウントを店舗の「管理者」に招待してもらう** = 伴走（プレミアム）向け。運営者が 1 回接続すれば担当店舗が全部見える。**C. Google の代理店（組織）アカウント** = 10 店舗以上を運用する段階で。
- 既定は A（セルフサーブ。契約初日に本人が押せる）、プレミアムは B。どちらも「主要オーナー」は不要で、管理者権限で口コミ全件・返信・投稿・写真・説明文・Performance API のインサイト（過去 18 か月）が取れる。
- 「自然に」の肝は**タイミングと見せ方**: 店舗登録直後に、公開情報だけで作った報告書の「未取得」の横に「接続すると入る」を並べ、AI 返信案をそのまま投稿できることを一緒に見せる。権限をもらう理由がその場で分かる。
- **前提が 2 つ未了**: #5（Business Profile API の承認。09-11 申請、審査待ち）と #13（OAuth の本番公開審査。未審査だと同意画面に「未確認のアプリ」警告、テストユーザー 100 人まで）。承認前に導線だけ作っても押せない。
- 実装の穴: 接続ボタンが口コミへの返信画面にしか無い／Performance API の取り込みが未実装 → #113 に追加。
- ドキュメントのみの更新。

### 2026-09-17（利用者の質問: 口コミ返信をツール内で完結させるのに必要な API と審査）

**質問**「口コミの返信案を AI で生成してツール内で返信まで完結させたい。必要な API と審査を調べてほしい。API を連結するだけではない気がする」。

**調べ方**: `developers.google.com` はこの環境から開けないため、検索結果の要約と二次情報（2025〜2026 の解説記事・開発者フォーラム）で確認。**最終的な要件は Google Cloud の画面と公式ドキュメントで確認すること。**

**回答の要点**
- ツール側は口コミ一覧 → AI 返信案 → 編集 → 投稿 / 削除まで**実装済み**（`/tools/replies`、`src/lib/google/business-profile.ts`）。足りないのは Google 側の承認と審査、それに伴う文書。
- **必要な API（同じ Cloud プロジェクトで有効化）**: Account Management（済）・Business Information（済）・**Google My Business API v4（口コミの取得・返信はこれだけ。未有効化）**・任意で My Business Notifications API + Cloud Pub/Sub（新着口コミの通知）・Business Profile Performance API（インサイト）。返信案は Anthropic（設定済み）。
- **審査は 3 段階・直列**: ① Business Profile API の利用申請（申請済み・審査中。条件は 60 日以上確認済みのプロフィール・実在するサイト・用途の説明。承認までクォータ 0）→ ② OAuth 本番公開審査（`business.manage` は機密スコープ。ホームページ・プライバシーポリシー・限定的な使用・用途説明・デモ動画。目安 2〜6 週間。審査前はテストユーザー 100 人・トークン 7 日失効）→ ③ 規模が出てからクォータ増加申請（既定 300 QPM / プロジェクト、店舗ごとの編集 10 回 / 分は増やせない）。
- **API 連結「以外」に要ること**: プライバシーポリシーの書き換え（現行は「書き込み権限は要求しない」と書いてあり矛盾する）／ Google のポリシー「代理で返信するには事業者の承認が要る」= **人が確認して押す**フローを崩さない（全自動投稿にしない）／ 返信は Google の禁止コンテンツポリシー準拠 ／ お客様が自分の Google アカウントでプロフィールのオーナーか管理者であることの確認（オンボーディング）／ 通知を入れるなら Cloud 側の Pub/Sub 設定 ／ トークンの失効・権限取り消し時の再接続の導線（Clerk 経由で実装済み。文言の確認）。
- 残タスク #114 に整理。ドキュメントのみの更新。

### 2026-09-17（承認前にできる下書き: ポリシー改訂・用途説明文・デモ動画の台本、r96）

**利用者の指示**「承認前にできる下書き（ポリシー・用途説明・動画台本）を作って」。

**やったこと**
- **訂正**: 前の回答で「ポリシー第 5 条に『書き込み権限は要求しない』と書いてある」と言ったのは古いメモの記述で、**本文はすでに r89 で口コミ返信の権限を要求する内容になっていた**。矛盾は無かった。
- **プライバシーポリシー（r96、`src/components/legal/PrivacyPolicy.tsx`）**: 第 5 条に「この権限で行う操作は 3 つ（アカウント・店舗の一覧 / 口コミと返信の取得 / 利用者が確認して押した返信の投稿・更新・削除）」「利用者の操作なしに自動投稿しない・店舗情報は書き換えない」「口コミと返信は保存しない」「AI の下書きは押した口コミだけ・投稿操作まで Google に送らない」「解除でトークン削除」を追記。第 8 条にもトークン削除。最終更新日を 2026-09-17 に。Limited Use の文言は変えていない。
- **[google-oauth-verification.md](./google-oauth-verification.md) を全面改訂**（GSC / GA4 の記述を撤去）: 3 段階の流れ（A: Business Profile API の承認 / B: OAuth 審査 / C: クォータ）、地雷と現在地、**§2 用途説明文（日本語 + 英語 + AI 送信の補足）**、**§3 デモ動画の台本**（撮影前の準備・場面ごとの操作と音声・撮ったあと）、§4 申請の順番。台本の文言は実装（`RepliesTool.tsx` / `ConnectBusinessButton.tsx`）のボタン名に合わせた。
- **動画は A の承認後にしか撮れない**（承認前は口コミが 1 件も取れない）。承認前にできるのは #7（Clerk のアプリ名）と #8（ブランディングの URL）。
- 検証: lint / tsc / test 1,522 件 / build 通過。

### 2026-09-17（利用者の質問: 審査のいらない API でどこまでできるか。競合ツールの月次レポート（PDF）は再現できるか）

**共有された PDF**: 競合ツールの月次 MEO レポート（2026-08）。新規口コミ数 / 平均評価 / Google 表示回数 / ユーザーアクション、口コミの成長（12 か月）、星別分布、Google での見られ方（表示回数合計・マップ表示・検索表示・電話クリック・サイトクリック・ルート検索）、流入キーワード（伸びた / 落ちた TOP3）、キーワード順位変動（月初 / 月末）、運用実績（返信数・返信率・投稿数）。

**回答の要点**
- 審査なしで使えるのは Places API（公開情報）だけ。これと毎週の保存（r19〜）で再現できるのは **口コミの件数・平均評価とその推移、星別分布（最新 5 件の範囲）、キーワード順位の月初 / 月末**。帳票の半分弱。過去にさかのぼれないので「登録した月から」になる。
- **「Google での見られ方」6 枠・流入キーワード・返信数と返信率・投稿数は Business Profile の API（オーナー権限）でしか取れない**。Places の口コミにはオーナー返信が含まれないので返信率も出ない（`parse.ts` で確認）。代替のデータ源は無い（Google が外に出していない）。
- オーナー権限の経路でも **Business Profile API の利用申請（段階 A）は避けられない**。OAuth の本番公開審査（段階 B）は、運営者のアカウントを店舗の管理者に招待してもらう方法（方法 B）なら「テスト状態のまま」でも技術的には動くが、トークンが 7 日で切れて毎週の自動更新が止まるので、実運用は B まで通すべき。
- 提案: 再現できる部分で月次レポートを先に作り、オーナー権限の欄は「接続すると表示」にしておく（#115）。承認後に Performance API（#113）と v4（#114）で埋めれば、PDF と同じ帳票になる。
- ドキュメントのみの更新。

### 2026-09-17（Business Profile Performance API を承認当日に動く状態に、r97）

**利用者の指示**「Performance API を早急に使えるようにしたい。今すぐできることはすべてやりたい」。

**やったこと（r97）**
- `src/lib/google/performance.ts`: Performance API のクライアント。日次指標 9 本（`fetchMultiDailyMetricsTimeSeries`。マップ / 検索 × PC / モバイルの表示回数・電話・サイト・ルート・メッセージ・予約）を 18 か月ぶん、検索キーワード（`searchkeywords/impressions/monthly`）を当月と前月。純関数で月次に集計（前月比・伸びた / 落ちた TOP3。Google が「～15」と丸めた語は近似として除外）。場所の名前は `locations/{id}`（口コミ API の `accounts/…/locations/…` から変換）。
- `/api/maps/performance?placeId=&month=`: 接続 → スコープ → 接続アカウントがその Place ID を管理しているか（`listAllLocations` の `metadata.placeId` と突き合わせ）→ 取得。未接続 / 権限無し / 未管理は `enabled: false` と理由。承認前の 403 は理由の文を返して接続ボタンは出さない。6 時間キャッシュ。
- MEO 画面に「5. Google での見られ方」カード（`PerformanceCard.tsx`）: 接続前は「接続すると表示」の枠 + 接続ボタン（口コミ返信と同じ `ConnectBusinessButton`）。接続後は 6 指標の前月比・ユーザーアクション・月別 12 か月の表・流入キーワード（当月 / 前月 / 増減、TOP3）。対象月は 18 か月から選べる（既定は先月 = Google の集計遅れ対策）。競合との比較は 6 番に。
- テスト 19 件（URL・解析・集計・エラー）。lint / tsc / test 1,533 件 / build 通過。
- **利用者の作業は #116 の表**（承認前: Cloud で 4 本の API を有効化・スコープ・テストユーザー・Clerk の名前・ブランディング・ケースの督促。承認後: MEO 画面で接続 → 数字が出る）。

### 2026-09-18（利用者の報告: API ライブラリで「Google My Business API（v4）」が見つからない）

- 原因: 検索語に「（v4）」を含めていた。ライブラリ上の名前は「Google My Business API」。#116 の表を直リンク（`mybusiness.googleapis.com` など 4 本）に書き換えた。
- ドキュメントのみの更新。
- 続報（09-18 15:54）: 「My Business」で検索すると Business Information / Account Management / Verifications の 3 本だけが出て、**v4（Google My Business API）は一覧に出ない**。承認されたプロジェクトにしか表示されない扱いと判断。Performance API は名前が違う（「Business Profile Performance」）ので直リンクで有効化するよう案内。v4 は承認後に直リンクを開き直す。

### 2026-09-18（利用者の報告: Cloud の API 有効化）

- **有効化済み（利用者報告）**: Business Profile Performance API、My Business Account Management API、My Business Business Information API。
- **Google My Business API（v4）は直リンクが開かない** → 承認されたプロジェクトにしか出ない扱いなので、承認メール後に同じ URL（https://console.cloud.google.com/apis/library/mybusiness.googleapis.com?project=seo-checker-508104 ）を開き直す。これが無いと口コミの取得・返信（`/tools/replies`）だけが動かない。Performance API（Google での見られ方）は承認が下りればこのまま動く。
- ドキュメントのみの更新。

### 2026-09-18（利用者の質問: v4 の審査をしてもらった覚えがない。どこまでやったか）

- 回答: **申請は 1 回で済んでいる。** 09-11 20:52 に GBP API サポート（「基本の API アクセスの申請」フォーム）から送信し、ケース ID `0-4126000041187`。この 1 件が Business Profile API 全体（Account Management / Business Information / **v4** / Performance / Notifications）の許可リスト登録の申請で、v4 だけ別に審査を受ける必要は無い。承認されるとプロジェクトが許可リストに入り、v4 がライブラリに出て、全 API のクォータが付く。
- 申請の中身: ログインは `matsumatsu452@gmail.com`、ビジネスは `株式会社Wolf`（確認済み。60 日以上前かの質問は「はい」で送信。7/13 のオーナー通知が最古で、確認完了日は未確認 → 却下なら 10/1 以降に再申請）、サイト `https://seo-checker.tokyo/`、初回なので許可リスト済みのプロジェクト ID は「いいえ」。結果は `matsumatsu452@gmail.com` にメール。
- 09-18 に `wolf@wolf-info.org` の受信箱を検索（ケース ID / Business Profile API / My Business API、直近 14 日）→ 該当なし。結果は `matsumatsu452@gmail.com` 宛なので、そちらの受信箱（迷惑メール含む）を見る。
- ドキュメントのみの更新。
- 続報（09-18）: 利用者「メールまだ来てない」（`matsumatsu452@gmail.com`）。09-11 申請の 5 営業日目で目安（7〜10 営業日 = 9/24〜9/25）の範囲内。**9/26（金）になっても無ければ督促**（文案は下）。督促文（英語。申請時の自動返信に返信する形で）:
  > Subject: Follow-up on Business Profile API access request (Case 0-4126000041187)
  > Hello, I submitted a Basic API access request on September 11, 2026 (Case ID 0-4126000041187) for Google Cloud project seo-checker-508104 (website: https://seo-checker.tokyo/). I have not received a response yet. Could you let me know the current status, or whether any additional information is needed from my side? Thank you.
- 続報（09-18）: 利用者「メールが来たら知らせる。#116 の残り（スコープ・テストユーザー）を進める」→ スコープ（データアクセスで `business.manage` の有無・追加・GSC / GA4 の残骸を外す）とテストユーザー（対象で `matsumatsu452@gmail.com` を追加）の手順を画面ごとに案内。完了報告待ち。
- 続報（09-18）: 利用者報告 = データアクセスに `business.manage` を追加（表示名「お客様の Google ビジネス リスティングの確認、編集、作成、削除を行う」）、GSC / GA4 のスコープは外した。**コンソール上は「非機密のスコープ」の欄に入った。** → これまで「機密スコープ」と書いてきたのは誤りの可能性が高い（コンソールの分類が正）。非機密だけなら OAuth の本番公開は**ブランド確認だけ**（用途説明・デモ動画は原則不要。聞かれたときのために下書きは残す）。テスト状態の制限（100 人・7 日失効）は「本番に切り替え」で外れる。google-oauth-verification.md の「機密」の記述は次に触るときに直す。次: テストユーザー（4）。

### 2026-09-18（テストユーザー完了 / 利用者の要望: 無料診断の前にユーザー登録、メールごとに 2 回まで）

- 利用者報告「テストユーザー OK」→ #116 の残りは Clerk の名前（#7）・ブランディング（#8）・督促（9/26 以降）。
- **要望**: 無料診断の前に登録（①担当者名 ②メール ③会社名 ④電話 ⑤店舗の種類 ⑥パスワード）→ 無料診断はメールごとに 2 回まで。「Clerk だけで厳しい？」
- **回答: Clerk だけで作れる。** Clerk の出来合いの `<SignUp />` は追加項目（会社名・電話・店舗の種類）を出せないので、**自前のフォーム + Clerk の `useSignUp`**（メール + パスワードで作成 → 追加項目は `unsafeMetadata` に載せる → メールの確認コード → 完了）。電話は Clerk の「電話番号」機能を使わず文字として保存（SMS 認証が要らない）。回数は API 側で Clerk の `privateMetadata.freeRuns` を加算（サーバーだけが書ける。厳密な排他は無いが 2 回制限なら十分）。Supabase は不要。
- **落とし穴 2 つ**: ① 本番の `DEFAULT_PLAN=pro`（登録した人が全員スタンダード扱い）→ 登録を開く前に `free` にする。プランは Stripe か `/admin` の個別開放で付ける。② いまは「ログイン済みは無料診断を見せない（/start へ）」（09-13 の決定）→ 未契約（free）の人だけ無料診断へ、契約済みはこれまでどおりツールへ、に変える。
- **画面の流れ（案）**: `/` `/meo` → 未ログインなら登録フォーム（ログインへのリンクあり）→ 確認コード → `/`（残り 2 回の表示）→ 診断 → 結果の下に「精密診断はスタンダードで」→ 3 回目は診断ボタンの代わりに料金プランへの導線 + 「運営者に相談」。`/api/analyze` `/api/site` `/api/faq` `/api/meo/*` はログイン必須 + 回数チェック（IP の制限は二重の保険で残す）。登録内容は `/admin` の一覧に列を足して見られるようにする（見込み客リスト）。
- **決めてもらうこと**: (a) 2 回は「サイト + 店舗の合計」か「それぞれ 2 回」か（既定案: 合計 2 回） (b) 契約済みの人にも無料診断を見せるか（既定案: 見せない、これまでどおり） (c) `DEFAULT_PLAN` を `free` にしてよいか（既定案: 今の契約者は `/admin` で個別開放してから切り替え）。目安 2〜3 日。
- ドキュメントのみの更新。

### 2026-09-18（登録つき無料診断、メールアドレスごとに 2 回まで、r98）

**利用者の決定**: (a) 2 回はサイト + 店舗の合計（既定案）(b) 契約済みには見せない (c) `DEFAULT_PLAN` を `free` に切り替える → GO。

**やったこと（r98）**
- **登録フォーム**（`/sign-up`、`src/components/auth/RegisterForm.tsx`）: 担当者名・メール・会社名・電話・店舗の種類（11 択）・パスワード → Clerk v7 の `useSignUp`（`create` → `verifications.sendEmailCode` → `verifyEmailCode` → `finalize`）→ `/start`。追加項目は `unsafeMetadata.lead`（`src/lib/free/lead.ts` の zod で検証）。Google での登録は出さない。Google でログインした人は入口が `/sign-up/profile`（補完フォーム → `POST /api/account/lead` → `publicMetadata.lead`）へ送る。
- **入口**（`src/lib/free/gate.ts`。`/` と `/meo` の page が呼ぶ）: 未ログイン → `/sign-up?redirect_url=…`、代理店 → `/agency`、契約済み（free 以外）→ ツール、登録情報なし → 補完、それ以外 → 画面（残り回数つき）。運用者は回数制限なしで入れる。
- **回数**（`src/lib/free/quota.ts`）: `FREE_DIAGNOSIS_LIMIT`（既定 2）。`/api/analyze` `/api/site` `/api/meo/report` が本当に診断するときだけ 1 回消費（キャッシュに当たれば消費しない）。`/api/meo/search` `/api/faq` はログインだけ。保存先は Clerk の `privateMetadata.freeRuns`（サーバーだけが書く）。使い切ると 402 と `FREE_QUOTA_MESSAGE`。運用者・契約済み・認証無効は無制限。`GET /api/free/quota` で画面が取り直す。
- **公開範囲**（`src/lib/auth/routes.ts`）: 無料診断の API 5 本を公開から外した（画面 `/` `/meo` は公開のまま。Proxy に任せると Clerk のログイン画面へ飛び、見込み客が登録にたどり着かないため）。
- **画面**: `/` `/meo` の先頭に「残り N 回」（使い切ると料金プラン + 運営者への相談の Callout、診断ボタンは押せない）。ヘッダーはログイン済みならアカウントメニュー + 料金プラン（`/start` へ追い出さない）。`/start` は未契約を `/` へ。結果下の CTA は `/plans` へ（登録済みなので `/sign-up` ではない）。文言の「ログイン不要」を全部「登録のあと 2 回まで」に。
- **マスター画面**: 各行に担当者名・会社名・電話・店舗の種類・無料診断 N / 2 回（使い切りの印）。名前が無い人は担当者名を名前に。
- テスト: routes（公開範囲）・lead・quota-rules を追加 / 更新。lint / tsc / **test 1,540 件** / build 通過。
- **利用者の作業は「登録つき無料診断を本番で開く手順（#117）」の表**。特に **1（既存契約者の個別開放）→ 2（`DEFAULT_PLAN=free`）の順番**を守る。
- 補足: Clerk の Bot protection が ON だと登録フォームに CAPTCHA が出る（`#clerk-captcha` に描画）。Clerk の Email verification code が OFF だと `sendEmailCode` が失敗するので 4 で確認。

### 2026-09-18（利用者報告: `DEFAULT_PLAN=free` にして Redeploy。運用者の全ツール開放、r99）

- 利用者「DEFAULT_PLAN を free にして Redeploy した」（#117 の 2・3）。
- **気づき**: プランのゲートは運用者（`ADMIN_EMAILS`）を特別扱いしていなかったので、`free` にした瞬間に運用者自身のツールも閉じる。r99 で **運用者は全ツールを使える**ようにした（`checkPlanForFeature` / `canUseFeature` / `/start`）。契約状況の表示（`/plans` の「現在のプラン」）は変えていない。
- 残り: #117 の 1（既存契約者の個別開放。まだなら `/admin` で）、4〜5（Clerk の設定確認）、6〜7（本番で登録 → 2 回 → 使い切りを通す）。
- 続報（09-18）: 利用者が Clerk の User & authentication の画面を共有。**Email: Sign-up with email ON / Require email ON / Verify at sign-up ON（Email verification code ✓）**、Phone: OFF、Username: OFF、**Password: Sign-up with password ON**。登録フォームの前提（#117 の 4）は満たしている。未確認: User model の Name が必須になっていないか（必須だと `finalize` で止まる。任意か OFF に）。

### 2026-09-18（利用者の報告: 登録画面にサイドバーが出て、押すと Clerk のログイン画面に飛ぶ、r100）

- 利用者報告: Clerk の Allowlist のトグルを OFF、User model の Name を任意に。`/sign-up` を開くと左に有料ツールのサイドバーが出て、押すと `accounts.seo-checker.tokyo/sign-in`（Clerk のアカウントポータル）に飛ぶ。「この画面から登録されるとカスタマーサポートが面倒」。
- 原因: ① 登録・ログイン画面が管理画面の枠（AppShell + サイドバー）で描かれていた ② Proxy の `redirectToSignIn()` の行き先が Clerk のアカウントポータル（`signInUrl` 未指定）。
- **r100**: ① `/sign-in` `/sign-up` `/sso-callback` は無料診断と同じ公開シェル（ロゴ・規約だけ）で描く ② `clerkMiddleware` に `signInUrl: "/sign-in"` `signUpUrl: "/sign-up"`。`.env.example` の `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL` を有効化（本番の Vercel にも入れる）。
- **アカウントポータルそのものを塞ぐのは Clerk 側の設定**（下の表）。Clerk ダッシュボード → Account Portal（または Paths）で Sign-in / Sign-up のページを「アプリの URL」に向けると、`accounts.seo-checker.tokyo/sign-up` を開いても `https://app.seo-checker.tokyo/sign-up` に転送される。

### 2026-09-18（登録画面の整理: ヘッダーのボタンとフッターを消す、パスワードの案内、r101）

- 利用者報告: `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL` を追加して Redeploy 済み。登録フォームでパスワードを入れると「パスワードがオンラインデータ漏洩により流出しました」で進めない。右上の「ログイン」「登録して無料診断」とフッター（クイック診断の説明・規約類）は不要。
- **パスワードのエラーは Clerk の流出済みパスワード判定（Have I Been Pwned）**で、長さの条件ではない。試した値（数字の並びなど）が流出リストに載っていると、何文字でも拒否される。英字 + 数字を混ぜた別の値なら通る。Clerk の Password 設定に最小文字数の項目があり、既定は 8（利用者は「15 文字以上のはず」と認識 → 設定を確認してもらい、違えば `PASSWORD_MIN` を合わせる）。
- **r101**: 登録・ログイン画面（FreeShell の `minimal`）ではヘッダーのボタンとフッターを出さない。パスワード欄の案内を「8 文字以上。英字と数字を混ぜる。流出したことのあるパスワードは使えない」に、流出時のエラー文も具体的に。

### 2026-09-18（登録の確認コードのあと「Cannot finalize sign-up without a created session」、r102）

- 利用者報告: 英字 + 数字のパスワードで登録は通り、確認コードのメールも届いたが、コードを入れると「Cannot finalize sign-up without a created session.」で止まる。
- 見立て: Clerk v7 の `useSignUp()`（signals API）が返す `signUp` は押した時点の写しで、`verifyEmailCode` のあと写しの `finalize()` を呼ぶと `createdSessionId` が無くて止まる。または Clerk 側に要件（規約同意・追加の確認）が残っている。
- **r102**: 確認後は `clerk.client.signUp`（クライアント側の最新のリソース）から `status` と `createdSessionId` を読み、`clerk.setActive({ session })` でログイン状態にしてから `/start` へ。`create` に `legalAccepted: true` を付ける（フォームに同意文があるので、Clerk の「規約への同意」が必須でも止まらない）。それでも完了しないときは **状態・不足している項目・未確認の項目を画面に出す**ので、その表示を見れば次の原因が分かる。
