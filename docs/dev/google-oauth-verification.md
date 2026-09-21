# Google OAuth 本番公開審査（#13）と Business Profile API — 下書き一式

> 2026-09-17 全面改訂。**審査の対象は口コミ返信の `business.manage` だけ**（Search Console / GA4 は r89 で提供終了。もう要求しない）。
> ここにあるのは「承認前に作れる下書き」= ①プライバシーポリシー（本番に反映済み、r96）②用途説明文（日本語 / 英語）③デモ動画の台本。
> `developers.google.com` はこの開発環境から開けないため、要件は検索結果と 2025〜2026 の解説記事で確認した。**最終的な要件は Google Cloud の画面で必ず確認する。**

## 0. 全体の流れ（3 段階・直列）

| 段階 | 何を | 状態 | 通らないと |
|---|---|---|---|
| A | **Business Profile API の利用申請**（Google が手作業で審査。条件: 確認済みで 60 日以上稼働しているプロフィール・実在するサイト・用途） | 申請済み（09-11、ケース ID `0-4126000041187`） | クォータが 0 のまま。口コミが 1 件も取れない = **デモ動画も撮れない** |
| B | **OAuth 本番公開審査**（`business.manage` が**機密なら**ブランド・ポリシー・用途説明・動画。**09-18 にコンソールで「非機密」の欄に入ったと利用者が確認 → 非機密なら「本番環境に公開」だけで審査・動画は不要**。§7-5 で判定） | 未。この文書の下書きで準備 | 同意画面に「未確認のアプリ」警告。テストユーザー 100 人まで。**トークンが 7 日で失効** |
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

**足りないもの（申請前に埋める）**: #7 Clerk のアプリ名 → `SEO Checker`、#8 ブランディングに `/terms` `/privacy` の URL、ロゴ（任意）、動画（A の承認後。**ただしスコープが非機密なら不要。§7-5**）。

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

### 6-6. SEO 研究所は自前のプロフィールを持てない（2026-09-21 確定。利用者の説明）

**利用者の説明**: 「お客さんと直接会って、伺うビジネスではない。もちろん会うこともできるけど、SaaS というかシステム提供なので、代理店にお願いする形になる」「翠煙は代理で適当に登録しただけで、あまり関係はない」。

#### 確定したこと 1: 道 B（SEO 研究所を新規登録）は消える

Google のガイドラインは**対面で接する事業だけ**を対象にしており、SaaS・システム提供は対象外（6-1）。無理に登録しても確認で落ちるか、後でプロフィールが停止される。**停止されたプロフィールは API 申請にも響く**ので、やってはいけない。

#### 確定したこと 2: 入口は「他人の確認済みプロフィールを 1 つ管理させてもらう」以外に無い

これは Google が想定している**正規の形**。公式の前提条件に「**自社のオフィス・本社のプロフィールでも、管理しているクライアントのプロフィールでもよい**」と明記されており、SaaS ベンダー・代理店はみなこの形で通している。

**重要: Google が見ているのは「あなたが実際に確認済みプロフィールを管理しているか」だけで、そのビジネスとあなたの資本関係は問われない。**「関係ない会社のプロフィール」でも、管理者・オーナーとして正当に登録されていれば要件を満たす。そして **承認は Google Cloud プロジェクト `seo-checker-508104` に付く**ので、選んだプロフィールの持ち主が何かを所有することにはならない（6-0）。

#### 使える候補（2026-09-21 時点）

| 候補 | 60 日条件 | 障害 | 判断 |
|---|---|---|---|
| **株式会社Wolf** | **クリア済み**（7/13〜14 のオーナー / 管理者通知から 09-21 で 69 日。プロフィール自体はそれ以前から確認済みで運用） | 09-19 の「追加のお手続きが必要」= **確認が外れている**。確認 URL は https://business.google.com/n/4773232117026925181/profile/verify 、メールは `wolf@wolf-info.org` に届いている | **最短。**残る障害は確認だけ。利用者は「関係ない」と言うが、上のとおり資本関係は問われず、Wolf は何も所有しない |
| **翠煙**（シーシャカフェ＆バー翠煙 新宿歌舞伎町店） | 店舗型なので満たしている可能性が高い | **どの Google アカウントで登録したかが不明。**09-11 に `matsumatsu452@gmail.com` でフォームを開いたとき出なかったので、**別のアカウントで登録したはず**。そのアカウントが分かれば即使える | 要確認。`business.google.com` に思い当たるアカウントでログインして探す |
| **これからの代理店・お客様の店舗** | 店舗型なので確実 | まだ契約が無い | **本命。**代理店モデルなら本来の形。最初の 1 社が決まった時点で確実に申請できる |

#### 承認が無くても売れる（ここが大事）

Business Profile API の承認は**サービスの前提条件ではない**。止まるのは GBP に書き込む機能だけ。

| 承認なしで動く | 承認が要る |
|---|---|
| MEO 診断・報告書（Places API。競合比較も） | 口コミの**全件**取得とツール内からの返信投稿（`/tools/replies`） |
| NAP チェック（r131）・サイテーション・基本情報掲載 | 「Google での見られ方」（表示回数・電話・経路・検索語） |
| 順位計測・検索の推定・キーワード調査 | GBP への予約投稿（`/tools/posts`） |
| サイト診断・精密診断・AI 検索モニタリング・AI ライティング | MEO 採点の 9 項目の自動取得（いまはオーナー申告で代替済み） |
| 口コミ支援（アンケート QR）・**AI 返信案 → コピーして GBP へ貼る** | — |

→ **承認待ちのあいだも、口コミ返信は「段階 1（AI が案を出す → コピーして GBP に貼る）」で実運用できる。**最初のお客様を取るのを止める理由にはならない。

#### 並行してやっておくとよいこと: 代理店（組織）アカウントの登録

Google は**代理店が複数のお客様のプロフィールをまとめて管理する仕組み**（組織アカウント）を公式に用意している。無料。申請が「空の開発プロジェクト」ではなく「実在の代理店の本物の用途」に見えるようになり、お客様が増えたときの管理も楽になる。

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google ビジネス プロフィール ヘルプ → 代理店向けの概要 | https://support.google.com/business/answer/9199701?hl=ja | 代理店（組織）アカウントの仕組みを読む |
| 2 | Google ビジネス プロフィール | https://business.google.com/ | `matsumatsu452@gmail.com` で組織を作成し、以後お客様のプロフィールはここに招待してもらう |

なお申請フォームの連絡先は `contact@seo-checker.tokyo`（サイトと同じドメイン）にしてあり、ここは要件どおり。ログインするアカウントが Gmail のフリーアドレスである点は弱みになりうるが、**必須ではない**ので今回は変えない。

### 6-7. Wolf の確認を進める（2026-09-21。利用者の決定「Wolf の確認を進めます」）

**利用者の申告「Wolf も実店舗があるビジネスではありません」→ 問題ない。**Wolf のプロフィールは 09-11 の申請フォームで **「非店舗型・確認済み」** と表示されていた（作業ログ 09-11）。非店舗型 = **サービス提供地域型**は Google の正式な区分で、実店舗が無くても登録できる。しかも Google は一度この形で確認を通している。

**唯一の条件は「お客様のところへ訪問してサービスを提供しているか」。**完全にオンラインで完結していると（6-1 のとおり）ガイドライン上は対象外になる。Wolf が訪問型なら、そのまま確認を進めてよい。

#### Google が Wolf に実際に提示した 3 要件（2026-09-21。利用者が画面の文言を共有。**これが正**。下の一般論の 5 点より優先）

画面の見出し「ビジネスの詳細を動画に撮影」— **3 つの要件すべてを 1 つの連続動画に記録**。あわせて「ビデオ通話による確認」へのリンクあり（= Google の担当者とのライブビデオ通話でも同じ 3 点を見せればよい）。

| # | Google の文言 | 満たすもの（イベント管理会社の Wolf の場合） | 撮れるのは誰か |
|---|---|---|---|
| 1 | 「道路標識や近隣の店舗など、周辺地域の様子が含まれている。**住所は入力したサービス提供地域と一致**している必要があります」 | 事務所（または拠点）の前の道路標識・隣の店・番地表示。プロフィールのサービス提供地域（東京周辺）の中であること | **Wolf の拠点にいる人** |
| 2 | 「名刺、営業許可証、または車両に印刷されたビジネス名を確認できる。**ビジネス名は入力した名前と一致**している必要があります」 | 「株式会社Wolf」と印刷された名刺・許可証・車両。表記がプロフィールの名前と完全一致 | **Wolf の名刺・許可証を持つ人** |
| 3 | 「業務用機器もしくは予約システムの外観、またはブランド名が入った車両のロックを解除する様子を含めてください。**このビジネスを代表する権限を有していることを示す**必要があります」 | イベント機材、または Wolf の予約 / 案件管理システムにログインしている画面、または社名入り車両の鍵を開ける場面 | **Wolf の機材・システムにアクセスできる人** |

→ **3 点とも Wolf の拠点・名刺・機材・システムを持つ人にしか撮れない。**SaaS 提供者（利用者）は撮れないし、撮ってはいけない（権限を偽ることになる）。利用者の「撮れません」は正しい。**道 2 は Wolf のオーナー側の作業として依頼する。**

#### 利用者（管理者・従業員）が自分で撮る場合の答え（2026-09-21。利用者の質問「代表でないとダメか / シェアオフィスでよいか / Workspace の画面でよいか」）

| 質問 | 答え | 根拠・注意 |
|---|---|---|
| **代表でないと撮ってはいけない？ 従業員は？** | **従業員でもよい。**条件は ①プロフィール上でオーナーか管理者であること（`matsumatsu452@gmail.com` は管理者 = OK。確認のボタンもこのアカウントに出ている）②撮影者本人が現地にいること ③動画の中で「自分がこのビジネスの関係者」だと示すこと | Google ヘルプの表現は「オーナーまたは権限のある管理者・現地の代表者」。代表者本人である必要は無い |
| **要件 1: シェアオフィスの周辺でよい？** | **よい。**ただし ①**プロフィールに登録してある住所（非表示でも Google は持っている）と同じ場所**で撮る ②「実際にここで業務している」ことが分かるように、建物の入口 → 受付・案内板（Wolf の名前があればそれ）→ 自分のデスク / 部屋、と続けて撮る | Google のガイドライン: 郵送先だけのバーチャルオフィスは不可。コワーキングは看板 + 営業時間中のスタッフ常駐が条件（住所を公開する店舗型の話）。Wolf は非店舗型で住所非表示なので「拠点」扱いだが、看板・案内板が無いのは減点要因になりうる（致命ではない） |
| **要件 2: 名刺が代表のものでなくてよい？** | **よい。むしろ撮影者本人の名刺（自分の名前 + 株式会社Wolf）のほうが強い**（撮影者と会社の結びつきを示すため） | 表記がプロフィールの「株式会社Wolf」と一字一句同じか確認 |
| **要件 3: Google Workspace の PC 画面でよい？** | **単独では弱い。組み合わせれば使える。**Google の趣旨は「従業員しかアクセスできないもの・場所・書類」を見せること。強い順: **①ビジネス名（できれば住所も）が載った書類**（請求書・契約書・シェアオフィスの利用契約書・登記事項証明書・営業許可証）> **②従業員専用エリアに入る場面**（キーカードで入館・自分の部屋の解錠）> **③社内システムにログインした画面**（`@wolf-info.org` の Workspace で自分の名前と会社ドメインが見える Gmail / カレンダー / ドライブ）。**①〜③を 1 本の中で続けて見せる**のが確実。イベント機材（プロジェクター・サイン・什器）があればそれも | Google の例示は「業務用機器 / 予約システム / 社名入り車両」だが、ヘルプは「非機密の業務書類」「従業員専用エリア」「POS・システムの操作」も認めている。Workspace の画面は「システムの操作」に当たるが、公式の例に直接は無いので単独にしない |

**登記の住所とシェアオフィスの住所が違う件（2026-09-21。利用者の質問「GBP の住所をシェアオフィスに書き換える必要がある？」）**

| 論点 | 答え |
|---|---|
| Google に登録する住所は何であるべきか | **実際に業務している拠点**（= シェアオフィス）。**登記の住所（代表の住所）と一致させる必要は無い。**Google はビジネス プロフィールでも API 申請でも登記簿を見ない。見るのは「その場所で本当に業務しているか」だけ |
| では書き換えが必要か | **いま何が登録されているか次第。**まず https://business.google.com/ → Wolf → ビジネス情報 → 所在地（非表示でも入力欄には入っている）を見る。(a) すでにシェアオフィス → そのまま。撮影もシェアオフィスで。(b) 登記の住所（代表の自宅など）→ 2 択: **(b-1) シェアオフィスに書き換えてからシェアオフィスで撮る**（利用者が撮るならこれ）/ (b-2) 書き換えず、代表が自宅の周辺で撮る（Google は自宅拠点の非店舗型を認めている。撮るのは代表になる） |
| 書き換えるときの注意 | ①住所は**非表示のまま**（非店舗型のまま。「住所を表示」にしない）②**住所以外は触らない**（名前・カテゴリ・電話・サービス提供地域はそのまま。同時に複数変えると審査が重くなる）③「編集内容は確認が完了した後に表示されます」と出るが、それでよい。**書き換え → その住所で撮影**の順にする ④シェアオフィスは「Wolf のスタッフが実際にそこで業務している」場所であること。郵便受けだけのバーチャルオフィスは Google のガイドラインで不可 |
| 要件 1 の判定はどちらでも通る？ | Google の画面文言は「住所は入力した**サービス提供地域**と一致」なので、東京都内ならどちらの場所でも要件 1 自体は通る可能性が高い。ただしヘルプは「ビジネス拠点の住所にある道路標識」とも書いており、**拠点住所と撮影場所を揃えるのが安全** |

**→ 2026-09-21 利用者の確認: 登録されているのは登記の住所（代表の住所）。シェアオフィスの住所に書き換える（利用者の決定）。**手順:

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| A-1 | Google 検索「株式会社Wolf」（`matsumatsu452@gmail.com` でログイン）→「プロフィールを編集」 | https://www.google.com/search?q=株式会社Wolf | 「Google に掲載中のあなたのビジネス」の**「プロフィールを編集」**（鉛筆）を押す |
| A-2 | 「ビジネス情報」→「所在地」（表示によっては「所在地とエリア」） | （同上） | **「ビジネス所在地」の横の編集アイコン**を押す |
| A-3 | 住所の入力 | （同上） | **シェアオフィスの住所**を入力（建物名・階・部屋番号まで）。地図のピンが**その建物の上**に落ちていることを確認（ずれていたらドラッグ） |
| A-4 | 「顧客に住所を表示しますか」（文言は「お客様はこの住所を訪問できますか」など） | （同上） | **いいえ / 表示しない**のまま（非店舗型を維持。ここを「はい」にすると店舗型に変わり、看板・常駐スタッフの条件が付く） |
| A-5 | サービス提供地域 | （同上） | **触らない**（東京周辺のまま） |
| A-6 | 保存 | （同上） | 「編集内容は確認が完了した後に表示されます」と出てよい。**住所以外（名前・カテゴリ・電話・営業時間）は触らない** |
| A-7 | その足でシェアオフィスへ → 「オーナー確認を行う」→「次へ」 | https://business.google.com/n/4773232117026925181/profile/verify | **書き換えた住所の現地**で、スマホから 3 要件を 1 本撮り（§6-7 の「おすすめの順番」）。書き換えと撮影の場所が一致していることが要点 |
| A-8 | 3〜5 営業日待つ | https://business.google.com/ | 「確認済み」に戻り、警告が消えたら §7-2 の申請へ |

**→ 2026-09-21 の結果（利用者のスクリーンショット）: 「顧客に表示しない」を選んだら、住所欄そのものが消えて「ビジネス所在地: 拠点なし: 商品配達や出張型サービスのみ」になった。サービス提供地域は「日本、東京都 東京23区」。**

これが**いまの Google の仕様として正しい状態**。上の A-3 / A-4 は古い UI（住所を持ったまま非表示にする方式）を前提に書いていたが、**現在の UI では「お客様は訪問できない」= 「拠点なし」= 住所を持たない**。したがって:

| 論点 | 答え |
|---|---|
| 住所を入れ直す必要は？ | **無い。**「拠点なし」が非店舗型の正しい形。Google は住所を持たず、**サービス提供地域（東京23区）だけ**で判定する。登記の住所も、シェアオフィスの住所も、どこにも入れなくてよい |
| 動画の要件 1 はどうなる？ | 画面の文言どおり「**住所は入力したサービス提供地域と一致**」= **東京23区の中**で、実際の拠点（シェアオフィス）の周辺を撮ればよい。**区名の入った道路標識や住居表示板**（例「新宿区○○ 1-2」）を映して「23 区内」が一目で分かるようにする |
| シェアオフィスが 23 区の外だったら | 要件 1 で落ちる。先にサービス提供地域にその市を追加してから撮る |
| 「編集内容は確認が完了した後に表示」の意味 | 「拠点なし」への変更は確認完了後に反映される。そのまま「オーナー確認を行う」に進んでよい。万一「所在地が一致しない」で却下されたら、変更が反映されたあとに撮り直す |
| API 申請への影響 | 無し。申請フォームは住所を聞かない。要るのは「確認済みのプロフィール」だけ |

注意: シェアオフィスは複数の会社が同じ住所を使うが、**住所を非表示にした非店舗型ならそれ自体は問題にならない**。ただし「Wolf のスタッフが実際にそこで業務している」ことが前提（郵便受けだけの契約なら不可）。

**→ 2026-09-21 利用者の確認: シェアオフィスは東京23区内。質問「外を映した後、中も映したほうがよいか。エレベーターで 9 階まで上がる必要がある」→ 中も映す。エレベーターも止めずに撮り続ける（それが強み）。**

**この現場に合わせた撮影順（1 本・無編集・2〜4 分。途中で止めない）**

| # | 場面 | 映すもの | 満たす要件 |
|---|---|---|---|
| 1 | 建物の外（開始） | **区名の入った道路標識か住居表示板**（例「新宿区○○ 1-2」）→ 隣の店 → 建物の名前（銘板・入口の表示） | 要件 1（23 区内の実在の場所） |
| 2 | 建物に入る | 入口 → ロビーのテナント案内板（シェアオフィスの名前、あれば「株式会社Wolf」） | 要件 1 の補強 |
| 3 | **エレベーター（止めない）** | 「9」のボタンを押す → 階数表示が 9 になる → 降りる | 外と中がつながっている証拠（編集無しの証明にもなる） |
| 4 | 9 階 | フロア表示・案内板 → シェアオフィスの入口 → **キーカードや鍵で入る場面**（従業員しか入れない） | 要件 3（代表する権限） |
| 5 | 自分の席・部屋 | 席に着く → **名刺（自分の名前 + 株式会社Wolf）を読める距離で 3 秒以上** | 要件 2（ビジネス名） |
| 6 | 書類 | 「株式会社Wolf」宛の書類（シェアオフィスの利用契約書・請求書・登記事項証明書など）を読める距離で | 要件 3 |
| 7 | PC | `@wolf-info.org` の Workspace にログイン済みの画面（自分の名前と会社ドメインが見える） | 要件 3 |
| 8 | （あれば）機材 | イベント機材・社名入りの物 → 終了 | 要件 3 の補強 |

**現場での注意**
- 撮影は**スマホの Google マップアプリ（または Google アプリ）→ ビジネス プロフィール → オーナー確認**の流れの中で「その場で撮影」する。`matsumatsu452@gmail.com` でログインしておく。
- 途中で電話・通知が来ても止めない。画面ロックの自動オフを長めにしておく。電池と空き容量を確認。
- 声で補足してよい（「株式会社Wolf の拠点、9 階です」）。
- **他社の人の顔・他社の書類は映さない**（シェアオフィスなので特に）。受付の人が映るなら顔は避ける。
- 口座番号・マイナンバー・納税者番号は映さない。
- 送信後の審査は 3〜5 営業日。却下されたら理由を見て撮り直す（撮り直しは何度でもできる）。

**撮り方（変わらず）**: 現地で、スマホの Google マップアプリ（または Google アプリ）のビジネス プロフィールから**その場で撮影**。30 秒以上・1 本・無編集・途中で止めない。銀行口座番号・マイナンバー・納税者番号は映さない。審査 3〜5 営業日。

**おすすめの順番（1 本・2〜3 分）**: 建物の外で道路標識と隣の店 → 建物の入口・案内板 → キーカードで入館 → 自分のデスク → 名刺（自分の名前 + 株式会社Wolf）を読める距離で → 「株式会社Wolf」宛の書類を読める距離で → PC の `@wolf-info.org` の Workspace 画面 → 機材があれば機材。

#### 動画確認で映すもの（非店舗型の一般論。上の 3 要件が優先）

確認方法は画面が指示するもの（ハガキ / 電話 / メール / 動画）に従う。非店舗型は**動画確認**になることが多い。

| # | 映すもの | 具体例 |
|---|---|---|
| 1 | **所在地が実在すること** | 建物の外・道路の標識・番地表示・近隣の目印になる建物。**自宅兼事務所でよい**（近隣のランドマークや標識が映っていれば住所を確認できる、と Google のヘルプに明記） |
| 2 | **事業の実態** | 社名入りの車・道具・ユニフォーム・作業スペース。訪問型なら作業車と道具がいちばん強い。デスクワーク中心なら仕事場と使っている機材 |
| 3 | **自分が管理者である証拠** | 名刺・請求書・契約書・公共料金の請求書・賃貸契約書・許可証・**屋号や社名入りの郵便物**。事業用のシステムにログインして見せるのも有効 |
| 4 | **撮り方** | **1 本撮り・無編集・スマホでその場でリアルタイム撮影**（あらかじめ撮っておいた動画のアップロードではない）。途中で止めない |
| 5 | **映してはいけないもの** | 銀行口座番号・マイナンバー・納税者番号などの機密情報 |

**審査は 3〜5 営業日**が目安。

#### 却下されないための事前チェック

**プロフィールの ビジネス名・住所・電話・営業時間・説明が、実態および他の掲載情報と一致していること。**ここがズレていると、動画の中身が良くても却下される。確認を出す前に https://business.google.com/ で見直す。

#### 確認が終わったあとの注意（正直に書いておく）

**再確認が完了したあと、Google が「確認済みになった日」をいつ扱いにするかは分からない。**元の確認日（7 月以前）のままなら 60 日条件はすでにクリアだが、再確認の日にリセットされる可能性もある。**ここは推測せず、確認完了後すぐに申請し、却下されたら理由を見て判断する**（却下にペナルティは無い）。

#### 手順

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google ビジネス プロフィール → 確認 | https://business.google.com/n/4773232117026925181/profile/verify | 9/19 のメール（`wolf@wolf-info.org` 宛）の「確認を行う」の行き先。**開けるのはオーナー権限のアカウント**。提示された方法で確認を完了させる |
| 2 | Google ビジネス プロフィール | https://business.google.com/ | 確認を出す前に、ビジネス名・住所・電話・営業時間・説明が実態と合っているかを見直す |
| 3 | （動画確認の場合） | — | 上の 5 点を 1 本撮りで。撮り直しは何度でもできるので、焦らず全部入れる |
| 4 | Google Cloud → 割り当て | https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas?project=seo-checker-508104 | 確認が済んだら念のため「0 のまま」を見ておく（09-11 の申請が生きていて通っていた、という可能性を潰す） |
| 5 | **申請フォーム**（`matsumatsu452@gmail.com` でログイン） | https://support.google.com/business/contact/api_default | 確認完了後すぐに再申請。1 画面目で **株式会社Wolf** を選ぶ。記入内容は 6-4。**新しいケース ID を控える** |
| 6 | メール | 件名にケース ID `0-4126000041187` を含むスレッドに返信 | 6-5 の英文で前回ケースを締める |

---

---

## 7. 一から申請し直す手順（決定版・訂正版。2026-09-21）

> **2026-09-21 の訂正**: この §7 の初版は「動画」を 3 種類混ぜて書いており、利用者の指摘（「前回は動画はいらないと言っていた」）が正しかった。**Business Profile API の利用申請そのもの（段階 A）に動画は一切要らない。**下の 7-0 で 3 つを分けたうえで手順を組み直した。§0・§1・§4 に残っている「`business.manage` は機密スコープ・動画が要る」という記述は、09-18 に利用者がコンソールで「非機密」の欄に入ったのを確認しているため**保留扱い**（7-5 の判定表で決める）。

### 7-0. 「動画」は 3 つある（混ぜない）

| 動画 | どの段階のもの | 要るか | 根拠 |
|---|---|---|---|
| **① API 利用申請のデモ動画** | 段階 A: Application for Basic API Access | **要らない。**フォームは文字入力と選択だけ | 09-11 に利用者が実際に通ったフォームの記録（1 ビジネス選択 / 2 プロジェクト・会社情報 / 3 60 日の質問 / 最後 許可リストの質問。添付欄なし）。公開情報でもフォームの項目は「プロジェクト番号・連絡先・用途・必要なスコープ」だけ |
| **② Google ビジネス プロフィールのオーナー確認の動画** | Wolf のプロフィールを「確認済み」に戻す作業（API とは別の手続き） | **Wolf がいま「確認済み」のままなら不要。**「確認が必要」になっているときだけ、**Google が提示した方法**で確認する。方法（ハガジ・電話・メール・動画・ライブビデオ）は **Google が自動で決め、利用者は選べない**。非店舗型は動画になりやすいが、動画と決まっているわけではない | Google ヘルプ「Google でビジネスのオーナー確認を行う」（方法は Google が決める）、「動画の録画でビジネスのオーナー確認を行う」（動画は方法の一つ。店舗型・非店舗型・両方で使える） |
| **③ OAuth 本番公開審査のデモ動画** | 段階 B: 承認後、同意画面の「未確認のアプリ」警告を消すとき | **スコープの分類しだい。**コンソールで `business.manage` が**非機密**の欄にあれば**不要**（ブランド確認だけ、それも任意）。**機密**の欄にあれば**必要**（用途説明 + デモ動画）。**09-18 に利用者は「非機密の欄に入った」と報告**しているが、外部の解説記事は「機密」と書いており食い違う → 7-5 で利用者のコンソール画面を正とする | Google「Sensitive scope verification」「Submit for brand verification」（非機密のみなら審査は必須でなく、動画は要らない） |

### 7-1. フェーズ 0: 申請前に揃える（今日〜数日）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 0-1 | Google ビジネス プロフィール（Wolf） | https://business.google.com/ | `matsumatsu452@gmail.com` でログインし、Wolf を開く。**画面の状態を見る**: (a) 「確認済み」のバッジだけ → **0-2 は飛ばして 0-3 へ**。(b) 「確認が必要」「確認を行う」のボタンが出ている → 0-2 へ |
|  | **→ 2026-09-21 に利用者のスクリーンショットで (b) と確定。**Google 検索「株式会社Wolf」（`matsumatsu452@gmail.com` = 康太 でログイン）に「お客様がこのビジネスの管理者であることを確認するために、追加の情報をご提供いただく必要があります。編集内容は、確認が完了した後に表示されます」の警告と「オーナー確認を行う」ボタン。右のカードは「株式会社Wolf / イベント管理会社 / あなたはこのビジネス プロフィールの管理者です」、地図はサービス提供地域（東京周辺） | | **0-2 へ。この警告を消してから申請する** |
| 0-2 | Google ビジネス プロフィール → 確認 | https://business.google.com/n/4773232117026925181/profile/verify | **(b) のときだけ。**9/19 のメール（`wolf@wolf-info.org` 宛）の行き先。**オーナー権限のアカウントで開く**（開けなければ `wolf@wolf-info.org` で）。**Google が提示した方法に従う**（ハガキ / 電話 / メール / 動画 / ライブビデオ。選べない）。動画を指示されたときだけ §6-7 の 5 点を 1 本撮りで。審査 3〜5 営業日。終わったら 0-1 に戻って「確認済み」を目視 |
| 0-3 | Google ビジネス プロフィール（Wolf）→ ビジネス情報 | https://business.google.com/ → Wolf → 「ビジネス情報を編集」 | ビジネス名・住所（非店舗型なら非表示のまま）・電話・営業時間・説明・**ウェブサイト**が実態と一致しているか見直す。API 審査は「実在する事業か」を見るので、ここが空欄・不一致だと弱い |
| 0-4 | Google ビジネス プロフィール → ユーザー | https://business.google.com/ → Wolf → 設定 → ユーザーとアクセス | `matsumatsu452@gmail.com` が**管理者かオーナー**として入っていることを確認（09-09 に管理者として追加済み。外れていないかだけ見る） |
| 0-5 | Google Cloud → ダッシュボード | https://console.cloud.google.com/home/dashboard?project=seo-checker-508104 | 「プロジェクト情報」の**プロジェクト番号**（数字）を控える。ID `seo-checker-508104` とは別物 |
| 0-6 | Google Cloud → 割り当て | https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas?project=seo-checker-508104 | 「1 分あたりのリクエスト数」が **0** であることを見る（**300 なら前回の申請が通っている**ので、フェーズ 1 を飛ばして 7-4 へ） |
| 0-7 | Google Cloud → 有効な API とサービス | https://console.cloud.google.com/apis/dashboard?project=seo-checker-508104 | Account Management / Business Information / Performance の 3 本が並んでいることを確認（09-18 に有効化済み。見るだけ） |

#### 0-2 の補足: 動画が撮れない場合（2026-09-21。利用者「動画は撮れません」）

**前提: オーナー確認の動画は「そのビジネスの実在」を示すものなので、撮るのは Wolf 側の人であって、SaaS 提供者（利用者）ではない。**利用者が撮れないこと自体は行き止まりではない。順に試す。

| 順 | 道 | やること | 動画 | 60 日のリセット |
|---|---|---|---|---|
| **1** | **まず Google が出す方法を見る** | 「オーナー確認を行う」を押すと**方法の一覧**が出る（電話 / メール / ハガキ / 動画 / ライブビデオ通話のうち Google が許したもの）。**動画を選ばない限り何も始まらない。**電話・メール・ハガキが出ればそれで終わり。メールは `wolf-info.org` 宛になりやすく、オーナーの受信箱で済む | 出方しだい | あり得る |
| **2** | **Wolf 側の人に確認を完了してもらう** | 動画 / ライブビデオしか出ないとき。確認はビジネス側の作業なので、**オーナー `wolf@wolf-info.org` か Wolf の事務所にいる人**が、事務所・機材・名刺・請求書を映して 1 本撮り（§6-7 の 5 点）。利用者は撮らない。依頼文は下 | Wolf 側が撮る | あり得る |
| **3** | **Wolf を諦め、すでに「確認済み」のプロフィールの管理者にしてもらう** | 翠煙（店舗型。登録に使ったアカウントが分かればすぐ）か、最初の代理店・お客様の店舗。**すでに確認済みのプロフィールなら、誰も何も撮らない。**60 日の心配も無い（確認は過去に済んでいる） | **無し** | **無し** |

→ **1 で動画以外が出れば最短。出なければ 2 と 3 を同時に動かす**（2 は Wolf 側の都合待ちになるため）。

**→ 2026-09-21 に利用者が押した結果: 出た方法は「ビジネスの動画を送信する」の 1 つだけ**（スクリーンショット。「オーナー確認を行う方法を選択」画面に動画の項目のみ。下に「問題が発生した場合 / 後で確認」と「次へ」）。**道 1 は閉じた。道 2（Wolf 側が撮る）と道 3（確認済みのプロフィールを借りる）を同時に動かす。本命は 3**（誰も撮らず、60 日のリセットも無い）。「次へ」は押さず × で閉じてよい（押しても撮影の案内が出るだけで、撮らなければ何も送られない）。

**Wolf 側への依頼文（道 2。コピペ用）**

> 株式会社Wolf の Google ビジネス プロフィールに、Google から「管理者であることを確認するために追加の情報が必要」という表示が出ています（9/19 に wolf@wolf-info.org 宛にもメールが届いています）。
> このままだと Google 上の編集内容が公開されず、私が進めている Google の API 利用申請も通りません。
> 確認方法は Google 側で「ビジネスの動画を送信する」の 1 つに固定されており、私は御社の拠点・名刺・機材を持っていないため撮影できません。お手数ですが、次の URL を wolf@wolf-info.org でログインして開き、「オーナー確認を行う」→「次へ」から、スマホでその場で撮影して送っていただけますか。
> https://business.google.com/n/4773232117026925181/profile/verify
>
> Google が求めている 3 点（**1 本の連続動画**に全部入れる。編集・撮り置きは不可）:
> 1. 事務所（拠点）の前で、道路標識や隣の店など周辺の様子。プロフィールのサービス提供地域（東京周辺）の中であること
> 2. 「株式会社Wolf」と印刷された名刺・営業許可証・車両のどれか。表記はプロフィールの名前と完全一致で
> 3. 業務用の機材、または予約 / 案件管理システムにログインしている画面、または社名入り車両の鍵を開ける場面（会社を代表する権限があることを示すため）
>
> 銀行口座番号・マイナンバー・納税者番号は映さないでください。同じ 3 点を見せる形で、Google の担当者との「ビデオ通話による確認」を選ぶこともできます。
> 審査は 3〜5 営業日ほどです。終わりましたら一言いただけると助かります。

### 7-2. フェーズ 1: 申請（0-1 が「確認済み」の当日。**動画なし**）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1-1 | ブラウザ | — | **シークレットウィンドウ**を開き、`matsumatsu452@gmail.com` **だけ**でログイン（複数アカウントが混ざると別のアカウントで送ってしまう） |
| 1-2 | Google → Business Profile API 申請フォーム | https://support.google.com/business/contact/api_default | プルダウンで **Application for Basic API Access（基本の API アクセスの申請）** を選び、青いボタンで進む。上部に「オーナー確認が必要」の帯が出たら 0-1 (b) の状態 → 0-2 へ戻る |
| 1-3 | 1 画面目「お客様のビジネスを選択」 | （同上） | **株式会社Wolf** を選ぶ。出なければ 0-4 が未了 |
| 1-4 | 2 画面目「プロジェクトおよび会社情報」 | （同上） | 下の「記入内容」をそのまま入れる。**添付欄は無い** |
| 1-5 | 3 画面目「オーナー確認が 60 日以上前に完了しているか」 | （同上） | **事実どおり**に答える。0-2 で再確認をしたなら、その日が「確認完了日」と扱われる可能性がある → 「いいえ」が事実なら「いいえ」。嘘は後で却下される |
| 1-6 | 最後「許可リスト登録済みのプロジェクト ID を持っているか」 | （同上） | **いいえ** |
| 1-7 | 送信 | （同上） | **新しいケース ID を控えて共有**。自動返信メールが `matsumatsu452@gmail.com` に届く |
| 1-8 | Gmail（`matsumatsu452@gmail.com`） | https://mail.google.com/ → `0-4126000041187` で検索 | 前回のスレッドに **§6-5 の英文**で返信して締める |

#### 記入内容（1-4。コピペ用）

| 欄 | 入れる値 |
|---|---|
| 連絡先メール | `contact@seo-checker.tokyo` |
| 会社名 | `SEO Kenkyujo (SEO 研究所)` — 法人登記なしの個人事業。屋号のままでよい |
| ウェブサイト | `https://seo-checker.tokyo/` |
| Google Cloud プロジェクト ID | `seo-checker-508104` |
| Google Cloud プロジェクト番号 | 0-5 で控えた数字 |
| 知った経緯 | デベロッパー向けドキュメント |
| 確認済みビジネスプロフィール | `Yes` — `株式会社Wolf` |
| 必要な API | My Business Account Management API / My Business Business Information API / Google My Business API (v4) / Business Profile Performance API |
| 主な理由（英文） | **§6-4 の英文をそのまま貼る** |

### 7-3. フェーズ 2: 待つ（目安 7〜10 営業日、最大 2 週間）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 2-1 | Gmail（`matsumatsu452@gmail.com`） | https://mail.google.com/ | **毎日**見る。追加の質問が来たら**即日**返信（放置すると却下） |
| 2-2 | Google Cloud → 割り当て | https://console.cloud.google.com/apis/api/mybusinessaccountmanagement.googleapis.com/quotas?project=seo-checker-508104 | **週 1 回**見る。**0 → 300 に変わったら承認**（メールより先に変わることがある） |
| 2-3 | Gmail | 新しいケース ID のスレッド | 10 営業日で返信が無ければ同じスレッドで進捗を聞く（§6-5 の 1 段落目を流用） |
| 2-4 | 本番 | https://app.seo-checker.tokyo/tools/replies | 待つ間も「AI 返信案 → コピーして GBP に貼る」で実運用できる（§6-6 の表） |

### 7-4. フェーズ 3: 承認後（承認メールが来た当日。**動画なし**）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 3-1 | Google Cloud → API ライブラリ → Google My Business API（v4） | https://console.cloud.google.com/apis/library/mybusiness.googleapis.com?project=seo-checker-508104 | 「有効にする」。**承認前は開けなかったページ**。無いと口コミの取得・返信・投稿だけが動かない |
| 3-2 | Google Cloud → 割り当て | （2-2 と同じ） | 300 を確認 |
| 3-3 | Google Cloud → OAuth → データアクセス | https://console.cloud.google.com/auth/scopes?project=seo-checker-508104 | `https://www.googleapis.com/auth/business.manage` があることを確認（追加済み）。**同時に、このスコープが「非機密」「機密性の高い」「制限付き」のどの見出しの下にあるかをメモする → 7-5 の分岐に使う** |
| 3-4 | Google Cloud → OAuth → 対象 | https://console.cloud.google.com/auth/audience?project=seo-checker-508104 | 接続に使う Google アカウントがテストユーザーにいることを確認（追加済み） |
| 3-5 | 本番 → Google マップ（MEO） | https://app.seo-checker.tokyo/tools/maps | 自社店舗 → 「5. Google での見られ方」→「Google アカウントを接続する」→ **Wolf の管理者のアカウント**で「ビジネス プロフィールの管理」を許可。テスト状態なので「未確認のアプリ」警告が出るが「詳細 → 移動」で進める |
| 3-6 | 本番 → 口コミへの返信 | https://app.seo-checker.tokyo/tools/replies | 口コミ全件と返信の投稿が出る。エラーは**文面ごと**共有 |

### 7-5. フェーズ 4: OAuth を本番に切り替える（ここだけスコープの分類で分岐）

3-3 でメモした見出しで決める。**利用者のコンソール画面が正**（外部記事より優先）。

| 3-3 の見出し | やること | 動画 |
|---|---|---|
| **非機密のスコープ**（09-18 の観察） | Google Cloud → OAuth → 対象（https://console.cloud.google.com/auth/audience?project=seo-checker-508104 ）で**「本番環境に公開」**。審査の申請は不要。ロゴを出したいときだけブランド確認（ホームページ・プライバシーポリシー・ドメイン所有）。テストの制限（100 人・トークン 7 日失効）はこれで外れる | **不要** |
| **機密性の高いスコープ** | 「本番環境に公開」→ 審査の申請。§2 の用途説明（英語）+ **§3 の台本でデモ動画**（OAuth の同意画面 → 権限の使われ方を通しで）+ #7 Clerk のアプリ名 + #8 ブランディングの規約 / ポリシーの URL。目安 2〜6 週間 | **必要** |

### 7-6. 却下されたら

| メールの文面 | 打ち手 |
|---|---|
| 確認済みプロフィールが無い / 60 日未満 | 0-2 で再確認をしたなら、その日にリセットされたと判断。**確認完了日 + 60 日**に同じ内容で再申請（ペナルティ無し）。その間に翠煙の登録アカウントを探す・最初のお客様の店舗を用意する（§6-6） |
| 用途が不明確 | §6-4 の英文に画面のスクリーンショット（`/tools/replies` の接続画面・口コミ一覧）を添えて返信 |
| アカウントがプロフィールに紐づいていない | 0-4 を確認して、管理者として入っているアカウントで送り直す |
| 理由が書かれていない | 同じスレッドで理由を聞く（§6-5 の 2 段落目） |

### 7-7. 出典と、この環境から確認できなかったこと（正直に）

- **この作業環境は `developers.google.com` / `support.google.com` / ミラー / 解説サイトのほぼ全部を遮断**しており、Google の原文ページは開けない。検索エンジンの要約スニペットと、**このリポジトリに残っている 09-11 の実フォームの記録**を根拠にした。
- 検索で確認した出典: [Prerequisites | Business Profile APIs](https://developers.google.com/my-business/content/prereqs)、[Applying for Google Business Profile API access](https://support.google.com/business/workflow/16726127?hl=en)、[Google でビジネスのオーナー確認を行う](https://support.google.com/business/answer/7107242?hl=ja)、[動画の録画でビジネスのオーナー確認を行う](https://support.google.com/business/answer/14271705?hl=ja)、[Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)、[Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)。
- **確認できなかったこと**: `business.manage` が Google の分類で機密か非機密か（外部記事は「機密」、09-18 の利用者のコンソールは「非機密」）。**3-3 で利用者に見出しを読んでもらうのが唯一の確実な方法。**
