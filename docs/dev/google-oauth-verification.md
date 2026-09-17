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
