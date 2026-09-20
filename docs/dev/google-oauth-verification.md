# Google OAuth 本番公開審査（#13）と Business Profile API — 下書き一式

> 2026-09-17 全面改訂。**審査の対象は口コミ返信の `business.manage` だけ**（Search Console / GA4 は r89 で提供終了。もう要求しない）。
> ここにあるのは「承認前に作れる下書き」= ①プライバシーポリシー（本番に反映済み、r96）②用途説明文（日本語 / 英語）③デモ動画の台本。
> `developers.google.com` はこの開発環境から開けないため、要件は検索結果と 2025〜2026 の解説記事で確認した。**最終的な要件は Google Cloud の画面で必ず確認する。**

## 0. 全体の流れ（3 段階・直列）

| 段階 | 何を | 状態 | 通らないと |
|---|---|---|---|
| A | **Business Profile API の利用申請**（Google が手作業で審査。条件: 確認済みで 60 日以上稼働しているプロフィール・実在するサイト・用途） | 申請済み（09-11、ケース ID `0-4126000041187`） | クォータが 0 のまま。口コミが 1 件も取れない = **デモ動画も撮れない** |
| B | **OAuth 本番公開審査**（`business.manage` は機密スコープ。ブランド・ポリシー・用途説明・動画） | 未。この文書の下書きで準備 | 同意画面に「未確認のアプリ」警告。テストユーザー 100 人まで。**トークンが 7 日で失効** |
| C | クォータ増加申請（既定 300 QPM / プロジェクト。店舗ごとの編集 10 回 / 分は増やせない） | 不要（規模が出てから） | — |

**A の承認メールが来る前にできること = この文書の①②③と、Clerk のアプリ名（#7）・ブランディングの URL（#8）。**
A の承認後: Google Cloud で「Google My Business API」（v4。口コミはこれだけ）を有効化 → 自分のプロフィールで `/tools/replies` の投稿まで通す → 動画を撮る → B を申請。

## 1. 落ちる型（地雷）と、こちらの現在地

| # | 落ちる型 | こちら |
|---|---|---|
| 1 | 身元がばらばら（同意画面のアプリ名・ロゴ・ホームページ・ドメインの不一致） | ドメイン `seo-checker.tokyo` は所有確認済み。**Clerk のアプリ名が `My Application` のまま（#7）= 動画に映るので直す** |
| 2 | ホームページがサービスを説明していない | `https://seo-checker.tokyo/` に料金・機能・Google 連携の説明あり |
| 3 | プライバシーポリシーの不備（Limited Use 無し・データの具体名無し・同じドメインに無い） | `https://app.seo-checker.tokyo/privacy`。ログイン不要・robots で Allow。第 5 条に Limited Use、取得するデータの具体名、**r96 で「この権限で行う 3 つの操作」「自動投稿しない」「口コミは保存しない」「解除でトークン削除」を追記** |
| 4 | スコープが過剰 | `business.manage` 1 つだけ。口コミの取得・返信にこれより狭いスコープは無い（用途説明で言う） |
| 5 | 用途説明が抽象的 | 下の §2 で、画面名と操作を具体的に書く |
| 6 | デモ動画の不備（同意画面が映っていない・通しでない・アプリ名が違う） | 下の §3 の台本どおりに撮る |
| 7 | データの扱いが申告と矛盾（AI に送っているのに書いていない） | ポリシー第 4 条（Anthropic）・第 5 条・第 6 条に明記済み。用途説明でも言う |
| 8 | 審査担当の質問に返信しない | 申請後は `contact@seo-checker.tokyo` を毎日見る（1〜2 週間で却下） |
| 9 | 実体が薄い | 独自ドメインのメール・事業内容の分かるサイトあり |

**足りないもの（申請前に埋める）**: #7 Clerk のアプリ名 → `SEO Checker`、#8 ブランディングに `/terms` `/privacy` の URL、ロゴ（任意）、動画（A の承認後）。

## 2. 用途説明文（審査フォームの「スコープの正当化」欄に貼る）

スコープ: `https://www.googleapis.com/auth/business.manage`

### 日本語

> 当サービス「SEO Checker」（https://seo-checker.tokyo/ ）は、日本の中小企業・店舗向けに、ウェブサイトと Google ビジネス プロフィールの状態を診断し、改善を支援する月額制のウェブアプリです。
>
> このスコープは「口コミへの返信」機能（https://app.seo-checker.tokyo/tools/replies ）でのみ使用します。利用者（店舗のオーナーまたは管理者）が自分の Google アカウントで接続を許可すると、当サービスは次の 3 つの操作だけを行います。(1) 利用者のビジネス プロフィールのアカウントと店舗の一覧を取得し、利用者が返信する店舗を選べるようにする。(2) 選んだ店舗の口コミと既存の返信を取得し、未返信のものを先頭にして利用者本人にだけ表示する。(3) 利用者が画面で本文を確認・編集して「Google に投稿する」を押した返信を、その口コミへの返信として投稿・更新・削除する。
>
> 当サービスは返信の下書きを AI（Anthropic）で作成しますが、下書きは利用者が「AI で返信案を作る」を押した口コミについてのみ作成され、利用者が内容を確認・編集して投稿の操作を行わない限り Google には送られません。利用者の操作なしに自動で返信を投稿することはありません。店舗情報（店名・住所・営業時間など）の書き換えも行いません。
>
> 口コミの取得と返信の投稿には Business Profile の管理スコープが必要で、これより狭い（読み取り専用の）スコープでは返信を投稿できないため、このスコープを要求しています。取得した口コミと返信は画面に表示するたびに取得し、当サービスのサーバーやデータベースには保存しません。データは利用者本人への表示と、利用者が指示した返信の投稿以外には使わず、第三者への販売・広告利用・他の利用者への開示・汎用的な AI / 機械学習モデルの開発・改善・学習には使用しません。利用者はいつでも接続を解除でき、解除した時点でトークンを削除します。

### English

> SEO Checker (https://seo-checker.tokyo/ ) is a subscription web app for small businesses and local stores in Japan. It diagnoses the state of a business's website and Google Business Profile and helps the owner improve them.
>
> We use this scope only in one feature, "Reply to reviews" (https://app.seo-checker.tokyo/tools/replies ). After the user (the owner or a manager of the Business Profile) grants access with their own Google account, our app performs exactly three operations: (1) list the user's Business Profile accounts and locations so the user can pick the location to reply for; (2) read the reviews and existing replies of that location and show them, unreplied first, only to that same user; (3) create, update, or delete a reply to a review, but only when the user has reviewed and edited the text on screen and pressed "Post to Google".
>
> Our app drafts replies with an AI provider (Anthropic). A draft is generated only for a review the user explicitly chose by pressing "Draft with AI", and nothing is sent to Google until the user reviews, edits, and posts it. We never post replies automatically without a user action, and we never modify location information (name, address, hours, etc.).
>
> Reading reviews and posting replies requires the Business Profile management scope; there is no narrower (read-only) scope that allows posting a reply, which is why we request this scope. Reviews and replies are fetched each time the screen is shown and are not stored on our servers or database. The data is used solely to display it back to the user and to post the reply the user instructed. We do not sell it, use it for advertising, disclose it to other users, or use it to develop, improve, or train generalized AI/ML models. The user can disconnect at any time, and we delete the stored token when they do.

### AI に送っていることの補足（同じ欄の末尾に添える、または質問されたら）

> 「AI で返信案を作る」を押した口コミの本文と評価を、利用者本人に見せる下書きを作る目的に限り、当社が契約する AI 事業者（Anthropic）の API に送信します。送信した内容がモデルの学習に使われない契約・設定で利用し、利用者のアカウント情報（メールアドレス等）は送信しません。この取り扱いはプライバシーポリシー第 4 条・第 5 条・第 6 条に記載しています。

> When the user presses "Draft with AI", we send the text and star rating of that single review to our AI provider (Anthropic) solely to generate a draft reply shown to that same user. We use the API under terms and settings where the content is not used to train models, and we never send the user's account information (such as email address). This is disclosed in sections 4, 5, and 6 of our privacy policy.

## 3. デモ動画の台本（2〜3 分。A の承認後に撮る）

**実装を確認した前提**（台本を現実に合わせるために調べた）:

- 画面: `https://app.seo-checker.tokyo/tools/replies`（サイドバー: AIO 対策 → MEO → 口コミへの返信）。
- 未接続のときのボタンは **「Google アカウントを接続する」**、Google 接続済みで権限が無いときは **「Google に口コミ返信の権限を追加する」**（`ConnectBusinessButton`）。
- Google の同意画面は **同じタブで開く**（Clerk の OAuth）。ブラウザのウィンドウを 1 つ録るだけで全部入る。
- 接続後の画面の順: 「接続」カード（接続中のメールアドレス）→ 「返信するビジネス」「店舗」の選択 → 「返信の設定」（トーン・署名・補足）→ 「口コミ」一覧（未返信が先頭、`未返信` バッジ）→ 各口コミの「返信の本文」欄と **「AI で返信案を作る」** → **「Google に投稿する」**（既に返信があれば「返信を更新する」）→ 「返信を削除」。
- 解除は右上のアカウントメニュー → アカウントを管理 → 接続済みアカウント、または Google アカウント側（https://myaccount.google.com/connections ）。

### 撮影前の準備（30 分）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google アカウント → サードパーティ製のアプリとサービス | https://myaccount.google.com/connections | `SEO Checker` があれば「すべてのアクセス権を削除」。**許可済みだと同意画面が出ず、撮り直しになる** |
| 2 | 本番 → 右上のアカウントメニュー | https://app.seo-checker.tokyo/tools/replies | アカウントを管理 → 接続済みアカウント → Google を削除（あれば） |
| 3 | 本番 → 口コミへの返信 | https://app.seo-checker.tokyo/tools/replies | 「Google アカウントが接続されていません」と「Google アカウントを接続する」が出ていることを確認 = 撮影開始の状態 |
| 4 | Google ビジネス プロフィール | https://business.google.com/ | 撮影に使う Google アカウントが**自分の店舗のオーナーか管理者**で、その店舗に**未返信の口コミが 1 件以上**あること。無ければ知人の投稿でも可（返信は動画のあとで消してよい） |
| 5 | Chrome | — | ブックマークバーを隠す（`Ctrl + Shift + B`）、タブは 1 枚、拡大率 100%（`Ctrl + 0`）、Windows の集中モードをオン |
| 6 | 録画 | — | `Win + Shift + S` → ビデオカメラのアイコン → **アドレスバーを含めて** Chrome のウィンドウ全体を囲む → 開始。うまくいかなければ `Win + G` → `Win + Alt + R` |

音声は任意。話さないなら各場面で **3 秒ずつ止まる**（審査担当が読める速さ）。

### 場面ごとの台本

| # | 時間の目安 | 画面 | 操作 | 音声 / 字幕（日本語で可。英語字幕があれば尚よい） |
|---|---|---|---|---|
| 1 | 0:00–0:10 | `https://app.seo-checker.tokyo/tools/replies` をアドレスバーが見える状態で開く | 3 秒止まる。サイドバーの「口コミへの返信」が選ばれている | 「SEO Checker の『口コミへの返信』です。Google ビジネス プロフィールの口コミに返信するために、Google の権限を求めます」 |
| 2 | 0:10–0:20 | 「接続」カード | 「Google アカウントが接続されていません」の説明文を見せてから **「Google アカウントを接続する」** を押す | 「接続ボタンを押すと Google の確認画面が開きます」 |
| 3 | 0:20–0:45 | **Google の同意画面** | アカウントを選ぶ → **アプリ名 `SEO Checker` と、要求している権限の文言（ビジネス プロフィールの管理）が読める状態で 3 秒止まる** → 許可 | 「アプリ名 SEO Checker と、要求している権限が表示されています。許可します」 |
| 4 | 0:45–1:00 | 口コミへの返信に戻る | 「接続中: （メールアドレス）（口コミ返信の権限あり）」が出る → 「返信するビジネス」「店舗」を選ぶ | 「接続したアカウントのビジネスと店舗を選びます」 |
| 5 | 1:00–1:20 | 「口コミ」一覧 | 口コミが並び、未返信に `未返信` バッジが付いているのを見せる。件数の行（`未返信 N`）も映す | 「Google から取得した口コミが、未返信を先頭に表示されます。この画面に表示する以外の用途には使いません」 |
| 6 | 1:20–1:50 | 1 件の口コミ | **「AI で返信案を作る」** を押す → 「返信の本文」に下書きが入る → **本文を一部書き換える**（人が確認・編集していることを見せる） | 「AI が下書きを作ります。内容を確認して、自分の言葉に直します。自動では投稿されません」 |
| 7 | 1:50–2:10 | 同じ口コミ | **「Google に投稿する」** を押す → 「Google に投稿しました」の表示 → バッジが `返信済み` に変わる | 「確認した返信を投稿します。これがこの権限で行う唯一の書き込みです」 |
| 8 | 2:10–2:30 | （任意）Google マップ | 新しいタブで店舗の Google マップを開き、返信が付いていることを見せる（反映に数分かかる場合は省略可） | 「Google マップに返信が反映されました」 |
| 9 | 2:30–2:50 | 右上のアカウントメニュー → アカウントを管理 → 接続済みアカウント | Google の接続を削除する | 「接続はいつでも解除できます。解除するとトークンを削除します」 |
| 10 | 2:50–3:00 | 口コミへの返信に戻る | 「Google アカウントが接続されていません」に戻っているのを見せて終了 | — |

### 撮ったあと

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | YouTube Studio | https://studio.youtube.com/ | アップロード → 公開設定は **限定公開**。タイトル例 `SEO Checker – Google Business Profile review reply (OAuth demo)`。**審査が終わるまで消さない** |
| 2 | Google Cloud → OAuth → 概要 | https://console.cloud.google.com/auth/overview?project=seo-checker-508104 | 「アプリを公開」→ 審査の申請。スコープ `business.manage` の欄に §2 の英語版（+ AI の補足）と動画の URL を貼る |
| 3 | メール | — | 申請後は毎日 `contact@seo-checker.tokyo` を見る |

## 4. 申請の順番（全体）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Clerk ダッシュボード | https://dashboard.clerk.com/ | アプリ名を `My Application` → **`SEO Checker`**（#7）。Legal に `/terms` `/privacy` を登録 |
| 2 | Google Cloud → OAuth → ブランディング | https://console.cloud.google.com/auth/branding?project=seo-checker-508104 | 利用規約 `https://app.seo-checker.tokyo/terms`、プライバシー `https://app.seo-checker.tokyo/privacy`、ロゴ（任意）（#8） |
| 3 | Google Cloud → OAuth → データアクセス | https://console.cloud.google.com/auth/scopes?project=seo-checker-508104 | スコープが `business.manage` **だけ**であることを確認（GSC / GA4 の残骸があれば外す） |
| 4 | （待ち） | — | Business Profile API の承認メール（段階 A） |
| 5 | Google Cloud → API ライブラリ | https://console.cloud.google.com/apis/library?project=seo-checker-508104 | 「Google My Business API」（v4）を有効化（Account Management / Business Information は済） |
| 6 | 本番 → 口コミへの返信 | https://app.seo-checker.tokyo/tools/replies | 自分のプロフィールで接続 → 口コミが出る → 投稿まで通す（テストユーザーとして。7 日でトークン失効するが撮影には十分） |
| 7 | （撮影） | — | §3 の台本で動画 |
| 8 | Google Cloud → OAuth → 概要 | https://console.cloud.google.com/auth/overview?project=seo-checker-508104 | 「アプリを公開」→ 審査申請（§2 の文 + 動画 URL） |
| 9 | メール | — | 質問に即日返信。目安 2〜6 週間 |

---

## 5. 再申請（2026-09-20。利用者の指示「もう一度申請したい」）

### 5-0. 再申請の前に必ず潰す 2 つ（ここを直さないと、何回出しても同じ結果になる）

| # | 見つかったこと | なぜ致命的か | どうする |
|---|---|---|---|
| **A** | **2026-09-19 13:08（UTC）に Google から「株式会社Wolf 様のアカウントでは、アカウントのご確認のために追加のお手続きを完了していただく必要がございます」というメールが `wolf@wolf-info.org` に届いている（未読）。**本文: 「お客様が『株式会社Wolf』の管理者であることを確認するため、追加の情報のご提供をお願いいたします」「編集内容を公開するには、プロフィールの確認を完了していただく必要がございます」。確認 URL: https://business.google.com/n/4773232117026925181/profile/verify | Business Profile API の**前提条件の 1 番目が「確認済み（verified）のプロフィール」**。確認が外れている / 再確認を求められている状態で申請すると、審査側から見て「確認済みプロフィールが無い」= 自動的に却下になる。**09-11 の申請が通らなかった最有力の理由もこれの可能性がある**（9/19 のメールは、それ以前から確認の問題が続いていた結果とも読める） | 下の 5-1 の手順 1。**再申請より先にこれを終わらせる** |
| **B** | **09-11 の申請は `matsumatsu452@gmail.com` で送った。**このアカウントは 09-09 のメール「まつした さんが『株式会社Wolf』の管理者になりました」のとおり**管理者（manager）**で、**オーナー（owner）ではない**。オーナーは `wolf@wolf-info.org` 側 | 申請フォームは**オーナー権限のアカウントでログインして送る**のが通過条件とされている（管理者アカウントからの申請は弾かれるという報告が複数）。審査対象は「ログイン中のアカウント」なので、管理者で出した申請はプロフィールの実在確認に失敗する | 下の 5-1 の手順 3。**再申請は `wolf@wolf-info.org`（オーナー）で送る** |

> 補足: 「確認済みで 60 日以上」の 60 日について。株式会社Wolf のプロフィール自体は 7 月から稼働しているが、**いま再確認を求められているため「確認済みになった日」がいつ扱いになるかは Google 側にしか分からない**。ここは推測せず、確認を完了させたうえで申請し、却下されたら理由を見て判断する。

### 5-1. 再申請の手順（利用者の作業）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | **Google ビジネス プロフィール → 確認** | https://business.google.com/n/4773232117026925181/profile/verify | **最優先。**9/19 のメールの「確認を行う」の行き先。求められた方法（ハガキ / 電話 / 動画 / 書類）で確認を完了させる。**動画確認を求められたら、店舗の外観 → 看板 → 中 → 設備 → 自分が管理者だと分かる場面を 1 本撮りで**。ここが「確認済み」に戻るまで、API の申請は何回出しても通らない |
| 2 | Google ビジネス プロフィール → ユーザー | https://business.google.com/ → 対象のプロフィール → 設定 → ユーザーとアクセス | `wolf@wolf-info.org` が**オーナー（owner）**であることを確認。もし `matsumatsu452@gmail.com` をオーナーにしたいなら「メインのオーナー」を移譲してもよいが、**移譲すると 7 日間の保留が入る**ので、急ぐなら移譲せず `wolf@wolf-info.org` で申請する |
| 3 | **Google → Business Profile API 申請フォーム**（**必ず `wolf@wolf-info.org` でログインした状態で開く**。ブラウザのシークレットウィンドウで開いてログインし直すのが確実） | https://support.google.com/business/contact/api_default | 種別のプルダウンで **Application for Basic API Access** を選ぶ。記入内容は下の 5-2 をそのまま貼る。**送信後に出るケース ID を控える**（前回は `0-4126000041187`） |
| 4 | Google Cloud → ダッシュボード（Project number の確認） | https://console.cloud.google.com/home/dashboard?project=seo-checker-508104 | フォームに入れる **Project number**（12 桁の数字。Project ID `seo-checker-508104` とは別物）をここで控えてから 3 を書く |
| 5 | メール（前回のケースへの督促） | 件名にケース ID `0-4126000041187` を含む Google からのメールに返信 | 5-3 の英文を返信で送る。**再申請とは別に出す**（前回の分が生きているなら進捗が聞けるし、死んでいるなら理由が分かる） |
| 6 | メール（毎日見る） | `matsumatsu452@gmail.com` と `wolf@wolf-info.org` の両方（**迷惑メールも**） | 審査担当からの質問に**即日返信**する。1〜2 週間放置すると却下される。目安は最大 2 週間 |

### 5-2. フォームの記入内容（コピペ用）

| 欄 | 入れる値 |
|---|---|
| ログインするアカウント | **`wolf@wolf-info.org`**（オーナー） |
| Request type | **Application for Basic API Access** |
| Contact email | `contact@seo-checker.tokyo` |
| Company / Organization name | `SEO Kenkyusho (SEO 研究所)` |
| Website | `https://seo-checker.tokyo/` |
| Google Cloud Project ID | `seo-checker-508104` |
| Google Cloud Project number | （手順 4 で控えた 12 桁の数字） |
| Verified Business Profile | `Yes` — business name: `株式会社Wolf` |
| Do you have an allowlisted project ID? | `Yes` と答えず、**前回の申請があることを備考に書く**（下の英文の末尾） |
| APIs needed | My Business Account Management API / My Business Business Information API / Google My Business API (v4) / Business Profile Performance API |
| OAuth scope | `https://www.googleapis.com/auth/business.manage` |
| Service account を使うか | `No`（利用者ごとの OAuth のみ） |

用途の説明欄（英語。§2 の English をそのまま使う）:

> SEO Checker (https://seo-checker.tokyo/ ) is a subscription web app for small businesses and local stores in Japan. It diagnoses the state of a business's website and Google Business Profile and helps the owner improve them.
>
> We use the Business Profile APIs in two features. (1) "Reply to reviews" (https://app.seo-checker.tokyo/tools/replies ): after the user (the owner or a manager of the Business Profile) grants access with their own Google account, our app lists the user's accounts and locations so they can pick a location, reads the reviews and existing replies of that location and shows them to that same user with unreplied ones first, and creates, updates, or deletes a reply to a review — but only when the user has reviewed and edited the text on screen and pressed "Post to Google". (2) "How you appear on Google" (https://app.seo-checker.tokyo/tools/maps ): we read the Business Profile Performance metrics (impressions, calls, direction requests, website clicks, and search keywords) of the user's own location and display them as a monthly report to that same user.
>
> Our app drafts replies with an AI provider (Anthropic). A draft is generated only for a review the user explicitly chose by pressing "Draft with AI", and nothing is sent to Google until the user reviews, edits, and posts it. We never post replies automatically without a user action, and we never modify location information (name, address, hours, etc.) without the user's explicit action.
>
> Reading reviews and posting replies requires the Business Profile management scope; there is no narrower (read-only) scope that allows posting a reply, which is why we request `https://www.googleapis.com/auth/business.manage`. Reviews and replies are fetched each time the screen is shown and are not stored on our servers or database. The data is used solely to display it back to the user and to post the reply the user instructed. We do not sell it, use it for advertising, disclose it to other users, or use it to develop, improve, or train generalized AI/ML models. The user can disconnect at any time, and we delete the stored token when they do. We do not use service accounts; all access is per-user OAuth.
>
> Note: we submitted an earlier request on September 11, 2026 (Case ID 0-4126000041187) from a manager-level account. This new request is submitted from the owner account of the Business Profile. Please treat this as the authoritative request, or let us know if the earlier case should be used instead.

### 5-3. 前回のケースへの督促（英語。同じスレッドに返信）

> Subject: Follow-up on Business Profile API access request (Case 0-4126000041187)
>
> Hello,
>
> I submitted a Basic API access request on September 11, 2026 (Case ID 0-4126000041187) for Google Cloud project `seo-checker-508104` (Project ID), website https://seo-checker.tokyo/ . I have not received any response yet.
>
> Could you let me know the current status of this case, or whether any additional information is needed from my side? If the case was closed, I would appreciate knowing the reason so that I can correct it.
>
> I have also noticed that the earlier request was submitted from a manager-level Google account. I have now re-submitted the request from the owner account of the Business Profile. Please let me know which case I should follow.
>
> Thank you for your help.

### 5-4. Claude 側は何も待っていない（コードは全部できている）

承認が下りた瞬間に動き出すものは、すでに実装・検証済み。**承認後に足すコードは無い。**

| 機能 | 画面 | 実装 | 承認後に必要な作業 |
|---|---|---|---|
| 口コミの全件取得・返信の投稿 / 更新 / 削除 | https://app.seo-checker.tokyo/tools/replies | r37（`src/lib/google/business-profile.ts`） | v4 を有効化（https://console.cloud.google.com/apis/library/mybusiness.googleapis.com?project=seo-checker-508104 ） |
| Google での見られ方（18 か月・6 指標・流入キーワード） | https://app.seo-checker.tokyo/tools/maps | r97（`src/lib/google/performance.ts`） | 無し（Performance API は有効化済み） |
| GBP への予約投稿 | https://app.seo-checker.tokyo/tools/posts | `src/lib/posts/`（`localPosts`） | 無し（v4 の有効化で一緒に動く） |
| MEO 採点の「未取得」9 項目 | https://app.seo-checker.tokyo/tools/maps | オーナー申告（r27）→ API の値へ | `#11` の差し替え（Claude 側の作業。半日） |

### 5-5. 申請の進捗を確かめる画面（2026-09-20。利用者の質問「申請が正しく行われているか、進捗チェックみたいなページはどこ？」）

**結論: Google には「Business Profile API の利用申請の進捗を見るページ」は無い。**申請フォーム（https://support.google.com/business/contact/api_default ）に出すと**ケース ID がメールで返ってくるだけ**で、ケースの状態を一覧できるポータルは公開されていない（Google のヘルプコミュニティでも「ケース ID から状況を追う方法は無く、返信はメールだけ」という回答で一致している）。

**その代わり、承認が下りたかどうかは Google Cloud の「割り当て（Quotas）」で確実に分かる。**これが実質の進捗チェック画面。

| 割り当ての数字（1 分あたりのリクエスト数） | 意味 |
|---|---|
| **0**（0 QPM） | **未承認**。申請中か、却下されたか。ここで「割り当ての増加」を申請してはいけない（種別が違う。出すのは Application for Basic API Access） |
| **300**（300 QPM） | **承認済み**。プロジェクト `seo-checker-508104` が許可リストに入った |

#### 見る画面（上から順に確かめる）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google Cloud → Account Management API → 割り当て | https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas?project=seo-checker-508104 | **いちばん確実な合否ランプ。**「1 分あたりのリクエスト数」が 0 なら未承認、300 なら承認済み |
| 2 | Google Cloud → Business Information API → 割り当て | https://console.cloud.google.com/apis/api/mybusinessbusinessinformation.googleapis.com/quotas?project=seo-checker-508104 | 同上（3 本とも同じ申請で一度に開く） |
| 3 | Google Cloud → Performance API → 割り当て | https://console.cloud.google.com/apis/api/businessprofileperformance.googleapis.com/quotas?project=seo-checker-508104 | 同上。ここが 300 になれば「Google での見られ方」（`/tools/maps`）が動く |
| 4 | Google Cloud → 割り当て（全サービス横断。上が開けないとき） | https://console.cloud.google.com/iam-admin/quotas?project=seo-checker-508104 | 「サービス」で `My Business` / `Business Profile` を絞り込む |
| 5 | Google Cloud → API ライブラリ → Google My Business API（v4） | https://console.cloud.google.com/apis/library/mybusiness.googleapis.com?project=seo-checker-508104 | **もう一つのランプ。**v4 は承認されたプロジェクトにしか出ない。このページが普通に開いて「有効にする」が押せたら承認済み（09-18 時点では開かない = 未承認） |
| 6 | Google Cloud → 有効な API とサービス | https://console.cloud.google.com/apis/dashboard?project=seo-checker-508104 | 有効化済みの 3 本と、呼び出し回数・エラー率。403 が並んでいれば未承認のまま |
| 7 | Gmail（申請に使ったアカウント） | https://mail.google.com/ → `businessprofile` / ケース ID で検索 | ケース ID のスレッドが唯一の公式な記録。**追加質問が来ていたら即日返信**（放置すると 1〜2 週間で却下） |
| 8 | 当サービス → マスター画面 → 外部連携 | https://app.seo-checker.tokyo/admin | 「Google ビジネス プロフィール（OAuth）」の行。承認後に口コミの取得が通るようになる |
| 9 | 当サービス → 口コミへの返信 | https://app.seo-checker.tokyo/tools/replies | 実地のテスト。未承認なら「承認待ち」の案内（403）が出る。ここが口コミ一覧に変われば承認済み |

#### 「申請は何種類あるのか」の整理

**API は 4 本あるが、申請は 1 本。**Application for Basic API Access はプロジェクト単位の許可で、通れば下の API がまとめて使えるようになる（API ごとに申請するのではない）。

| API | 何に使うか | いまの状態 |
|---|---|---|
| My Business Account Management API | アカウント・店舗の一覧 | Cloud で有効化済み（09-18）。割り当ては未確認 |
| My Business Business Information API | 店舗情報の取得・更新 | 同上 |
| Business Profile Performance API | 「Google での見られ方」（表示回数・電話・経路・検索語） | 同上 |
| Google My Business API（v4） | 口コミの取得・返信、投稿（localPosts）、写真 | **承認されるまでライブラリに出ない** |
| （任意）Verifications / Notifications / Lodging / Place Actions | 今は使わない | — |

**「申請」という言葉で呼んでいるものは 3 種類ある。進捗の見え方がそれぞれ違うので混同しない。**

| 申請 | 出す場所 | 進捗の見え方 |
|---|---|---|
| **A. Business Profile API の利用申請**（#5） | https://support.google.com/business/contact/api_default | **進捗ページ無し。**上の割り当て（0 → 300）で判定。結果はメール |
| **B. OAuth 本番公開審査**（#13） | https://console.cloud.google.com/auth/overview?project=seo-checker-508104 | **進捗ページ有り。**同じ画面に「確認（verification）の状態」が出る（未申請 / 審査中 / 承認済み） |
| **C. クォータ増加申請**（当面不要） | A と同じフォームで種別 Quota Increase Request | 割り当ての数字が増えるかどうか |

#### 「申請が正しく行われているか」の確認（出した内容そのものは Google 側で見られない）

フォームの控えは残らないので、**出したかどうか・正しく出せたかは次の 3 点で確かめる**。

| 確かめること | どこで | 合格の形 |
|---|---|---|
| ① 送信した証拠（ケース ID） | 申請に使ったアカウントの Gmail | Google からの自動返信にケース ID がある（前回は `0-4126000041187`） |
| ② **どのアカウントで送ったか** | そのメールの宛先 | **オーナー `wolf@wolf-info.org` 宛**であること。`matsumatsu452@gmail.com`（管理者）宛なら 5-0 の B の失敗を繰り返している |
| ③ プロフィールが確認済みか | https://business.google.com/n/4773232117026925181/profile/verify | 「確認が必要です」が消えていること。ここが未了だと A は何回出しても通らない（5-0 の A） |

---

## 6. 個人アカウント（`matsumatsu452@gmail.com`）で取り直す（2026-09-20。利用者の指示「株式会社ウルフと関係なく、個人で取りたい」）

**§5 の「オーナー `wolf@wolf-info.org` で送り直す」という方針は、この §6 で置き換える。**利用者の決定により、Wolf からは完全に切り離す。

### 6-0. まず事実の整理（ここを誤解すると、また同じ申請になる）

| 事実 | 出典 | 意味 |
|---|---|---|
| **前回（09-11）の申請も `matsumatsu452@gmail.com` から送っている** | 作業ログ 09-11「結果は `matsumatsu452@gmail.com` にメール」 | 「個人アカウントで取る」は**前回と同じ**。アカウントを変えても状況は変わらない |
| **申請フォームの 1 画面目は「お客様のビジネスを選択」** | 作業ログ 09-11「1 画面目に `株式会社Wolf`（非店舗型・確認済み）だけが出た」 | **ログイン中のアカウントが管理する確認済みプロフィールを必ず 1 つ選ばされる。**Wolf を外すなら代わりが要る |
| **承認は Google Cloud プロジェクトに付く** | 割り当て（Quotas）がプロジェクト単位（§5-5） | どのプロフィールで入口を通っても、承認されるのは `seo-checker-508104`。**その店舗に縛られない**。全お客様のアカウントで使えるようになる |
| **前回が落ちた最有力の理由は 60 日ルール** | 作業ログ 09-11「Wolf のプロフィールは…今日で 59 日目」→ それでも「はい」と答えて送信 | 7/14 の「オーナーになりました」から 09-11 は 59 日目。**1 日足りなかった**可能性が高い。09-19 の「確認が必要」メールも重なる |

→ **変えるべきなのはアカウントではなく「フォームで選ぶ確認済みプロフィール」。**

### 6-1. 法人登記は要らない（利用者の質問 2026-09-20「登記が必要？」）

**Google ビジネス プロフィールにも API 申請フォームにも、法人登記は一切不要。**個人事業主・屋号で登録できる。申請フォームの「会社名」欄も屋号（`SEO 研究所`）でよく、09-11 の申請も実際その形で送っている。

**登記の代わりに効いてくる条件はこちら。**

| 条件 | 判定 |
|---|---|
| 法人格 | **不要**（個人事業主・フリーランスで可） |
| 事務所・店舗 | **不要**（住所は非公開にできる） |
| **お客様と対面で接すること** | **必須。**店舗に来てもらうか、こちらが訪問するか |
| オンライン完結の事業 | **対象外**（Google のガイドラインに「ブランド・団体・アーティスト・オンラインのみの事業は対象外」と明記） |

→ **SEO 研究所を登録できるかは「お客様のところへ訪問しているか」で決まる。**
- **訪問している**（店舗に伺って打ち合わせ・現地調査をする）→ **サービス提供地域型**で登録可。自宅住所で登録して住所は非表示にし、対応エリアだけ出す。確認は動画確認になることが多く、看板・名刺・請求書・機材など「実在する事業」が分かるものを映す
- **Zoom とツールだけで完結している** → ガイドライン上は対象外。無理に登録すると確認で落ちるか、後でプロフィールが停止される。**停止されたプロフィールは API 申請にも響く**ので避ける

出典: [ビジネスの適格性とオーナー権限に関するガイドライン](https://support.google.com/business/answer/13763036?hl=ja)、[Google に掲載するビジネス情報のガイドライン](https://support.google.com/business/answer/3038177?hl=ja)。

### 6-2. 3 つの道（利用者の選択待ち。2026-09-20 時点で未決）

| 道 | 法人登記 | 申請できるのは | 中身 |
|---|---|---|---|
| **A. 翠煙のプロフィールを借りる（推奨）** | 不要 | **数日後** | シーシャカフェ＆バー翠煙 新宿歌舞伎町店のオーナーに `matsumatsu452@gmail.com` をオーナーまたは管理者として追加してもらう。実在の店舗型で確認済み・60 日以上をほぼ確実に満たす。**公式の前提条件が「自社のプロフィールでも、管理しているクライアントのプロフィールでもよい」と明記している**ので正攻法 |
| **B. SEO 研究所を新規登録** | 不要 | **11 月下旬以降** | 自分のプロフィールを作り、オーナー確認（訪問型なら動画確認）を完了させ、そこから 60 日待つ。自前の資産になるが最速でも 2 か月、かつ 6-1 の「対面」判定のリスクを負う |
| **C. 他の確認済みプロフィール** | 不要 | すぐ | `business.google.com` を `matsumatsu452@gmail.com` で開いて Wolf 以外が出る場合。その名前と「確認完了が 60 日以上前か」が分かれば即申請できる |

**A + B の併用**（A で今すぐ承認を取りに行き、B を並行して育てる）がいちばん堅い。

**注意: 代わりのプロフィールが手に入るまで、Wolf から自分を外さないこと。**外すとフォームの 1 画面目で選べるものが 0 になり、申請自体ができなくなる。

### 6-3. 再申請の手順（道が決まってから。A を選んだ場合）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google ビジネス プロフィール（**翠煙のオーナーの作業**） | https://business.google.com/ → 翠煙 → 設定 → ユーザーとアクセス | `matsumatsu452@gmail.com` を**オーナー**（無理なら管理者）として招待してもらう。公式は管理者でも可としているが、管理者だと弾かれたという報告もあるためオーナーが安全 |
| 2 | Gmail（`matsumatsu452@gmail.com`） | https://mail.google.com/ | 招待メールの「承諾」。ここまで終わると次の 3 で翠煙が選べるようになる |
| 3 | Google ビジネス プロフィール | https://business.google.com/ | 翠煙が出ること、**「確認済み」**であることを目視。確認完了日が 60 日以上前かをオーナーに聞く（店舗として長く運用していれば問題ない） |
| 4 | Google Cloud → ダッシュボード | https://console.cloud.google.com/home/dashboard?project=seo-checker-508104 | 「プロジェクト情報」カードの**プロジェクト番号**（数字）を控える。ID `seo-checker-508104` とは別物 |
| 5 | **Google → Business Profile API 申請フォーム**（`matsumatsu452@gmail.com` でログインした状態で開く） | https://support.google.com/business/contact/api_default | 種別は **Application for Basic API Access**。1 画面目で**翠煙**を選ぶ。2 画面目は下の 6-4。3 画面目「オーナー確認が 60 日以上前か」は**事実どおり**に答える（ここで嘘をつくと後で却下される）。最後の「許可リスト登録済みのプロジェクト ID を持っているか」は**いいえ** |
| 6 | 送信後 | — | **新しいケース ID を控えて共有する** |
| 7 | メール（前回ケースの締め） | 件名にケース ID `0-4126000041187` を含むスレッドに返信 | 6-5 の英文。前回の分が生きているなら進捗が聞けるし、死んでいるなら理由が分かる |

### 6-4. フォームの記入内容（コピペ用。個人事業版）

| 欄 | 入れる値 |
|---|---|
| Request type | `Application for Basic API Access` |
| Contact email | `contact@seo-checker.tokyo` |
| Company name | `SEO Kenkyujo (SEO 研究所)` — **法人登記なしの個人事業。そのままでよい** |
| Website | `https://seo-checker.tokyo/` |
| Google Cloud Project ID | `seo-checker-508104` |
| Google Cloud Project number | Cloud のダッシュボードの数字（上の手順 4） |
| Verified Business Profile | `Yes` — 選んだプロフィールの名前 |
| APIs needed | My Business Account Management API / My Business Business Information API / Google My Business API (v4) / Business Profile Performance API |
| Do you have an allowlisted project ID? | `No`（備考に前回のケースを書く。下の英文の末尾） |

**主な理由（英語。フォームの用途欄に貼る）**

> SEO Checker (https://seo-checker.tokyo/ ) is a subscription web app for small businesses and local stores in Japan, operated as a sole proprietorship (SEO Kenkyujo). It diagnoses the state of a business's website and Google Business Profile and helps the owner improve them. The verified Business Profile associated with this request is a client whose profile we manage.
>
> We use the Business Profile APIs in two features. (1) "Reply to reviews" (https://app.seo-checker.tokyo/tools/replies ): after the user (the owner or a manager of the Business Profile) grants access with their own Google account, our app lists the user's accounts and locations so they can pick a location, reads the reviews and existing replies of that location and shows them to that same user with unreplied ones first, and creates, updates, or deletes a reply to a review — but only when the user has reviewed and edited the text on screen and pressed "Post to Google". (2) "How you appear on Google" (https://app.seo-checker.tokyo/tools/maps ): we read the Business Profile Performance metrics (impressions, calls, direction requests, website clicks, and search keywords) of the user's own location and display them as a monthly report to that same user.
>
> Reading reviews and posting replies requires the Business Profile management scope; there is no narrower (read-only) scope that allows posting a reply, which is why we request `https://www.googleapis.com/auth/business.manage`. Reviews and replies are fetched each time the screen is shown and are not stored on our servers or database. The data is used solely to display it back to the user and to post the reply the user instructed. We do not sell it, use it for advertising, disclose it to other users, or use it to develop, improve, or train generalized AI/ML models. The user can disconnect at any time, and we delete the stored token when they do. We do not use service accounts; all access is per-user OAuth.
>
> Note: we submitted an earlier request on September 11, 2026 (Case ID 0-4126000041187) for the same Google Cloud project and have not received a response. Please treat this as the authoritative request, or let us know if the earlier case should be used instead.

### 6-5. 前回のケースの締め（英語。同じスレッドに返信）

> Subject: Follow-up on Business Profile API access request (Case 0-4126000041187)
>
> Hello,
>
> I submitted a Basic API access request on September 11, 2026 (Case ID 0-4126000041187) for Google Cloud project `seo-checker-508104`, website https://seo-checker.tokyo/ . I have not received any response yet.
>
> Could you let me know the current status of this case, or whether any additional information is needed from my side? If the case was closed, I would appreciate knowing the reason so that I can correct it.
>
> I have since re-submitted the request for the same project using a different verified Business Profile that I manage. Please let me know which case I should follow.
>
> Thank you for your help.
