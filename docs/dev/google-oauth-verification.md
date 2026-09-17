# Google OAuth 本番公開審査（#13）— 落ちる理由と、こちらの現在地

> **2026-09-17 の方針変更（利用者の決定）**: Google Search Console と GA4 は**使わない**ことになった（r89）。
> `webmasters.readonly` と `analytics.readonly` はもう要求しない。**この審査の対象は口コミ返信の `business.manage` だけ**になり、
> 申請文・デモ動画も「口コミ返信」だけで作り直す必要がある。以下の GSC / GA4 に関する記述は経緯として残してあるが、現行ではない。


GA4 の `analytics.readonly` と Search Console の `webmasters.readonly` は Google の**機密スコープ（sensitive）**。
テスト状態のままだと ①テストユーザー 100 人まで ②**トークンが 7 日で失効**、の 2 つが外れないので、本番公開の審査を通す必要がある。

**まず安心材料**: 今回は「機密（sensitive）」であって「**制限付き（restricted）**」ではない。
制限付き（Gmail の本文、Drive の全ファイルなど）で要求される**第三者機関による年 1 回のセキュリティ評価（CASA。数十万〜数百万円）は不要**。
ブランドとポリシーの審査だけで済む。**目安 2〜6 週間**。

> 2026-09-17 時点の調べ。`developers.google.com` と `support.google.com` はこの開発環境から直接開けないため、
> 検索結果の要約と公開されている申請体験談をもとにまとめている。**最終的な要件は Google Cloud の画面と公式ドキュメントで必ず確認する。**

## 落ちる事業者・アプリの類型（地雷）

| # | 落ちる型 | 何が見られているか |
|---|---|---|
| 1 | **身元がばらばら** | OAuth 同意画面のアプリ名・ロゴ・ホームページ URL・クライアントのドメインが一致しない。**ブランディングの不一致は最頻の却下理由**。所有権を確認していないドメインを書いている |
| 2 | **ホームページが実体を説明していない** | 何のサービスか、**なぜ Google のデータが必要か**がトップページから読み取れない。ログインしないと中身が一切見えない。作りかけの LP |
| 3 | **プライバシーポリシーの不備（いちばん多い）** | ①**Limited Use（限定的な使用）の明記がない** ②取得する Google データを**具体名で**書いていない（「情報」など曖昧）③ホームページと同じ URL に混ぜている ④**要求しているスコープと書いてある内容が食い違う** ⑤汎用 AI / ML モデルの学習に使わない旨がない |
| 4 | **スコープが過剰** | 読み取りで足りるのに書き込み権限を要求。**使っていないスコープを宣言している**。「とりあえず全部」は確実に刺さる |
| 5 | **用途説明が抽象的** | 「分析のため」「サービス向上のため」だけ。**どの画面のどの機能で、そのデータをどう表示するか**が書いていない |
| 6 | **デモ動画の不備** | ①**OAuth 同意画面が映っていない** ②スコープを許可する瞬間から、データが画面に出るところまでの**一連の流れ**が通しで映っていない ③**申請したアプリ名と動画のアプリ名が違う** ④動画が限定公開でなく非公開／後で削除している ⑤何をしているのか説明が無い |
| 7 | **データの扱いが申告と矛盾** | **AI に送っているのにポリシーに書いていない**、第三者提供の記載漏れ、保存しないと書いてあるのに保存している |
| 8 | **連絡が取れない** | 審査担当からの質問メールに返信しない。**1〜2 週間放置すると却下**される。申請したら受信箱を毎日見る |
| 9 | **実体が薄い** | 連絡先がフリーメール、ドメインが無い、事業の説明が無い。**個人事業でも通る**が、独自ドメインのメールと、事業内容の分かるサイトは実質必須 |

## こちらの現在地

### できていること

| 項目 | 状態 |
|---|---|
| 独自ドメインと所有確認 | `seo-checker.tokyo` を Search Console で確認済み（#31）。アプリは同一ドメインのサブドメイン `app.` |
| 独自ドメインの連絡先 | `contact@seo-checker.tokyo`（受信設定済み） |
| 事業内容の分かるホームページ | `https://seo-checker.tokyo/`。料金・機能・Google 連携の説明あり |
| プライバシーポリシー | `https://app.seo-checker.tokyo/privacy`。**ログイン不要**（`PUBLIC_PAGES`）、**robots.txt でも開けてある**（アプリ全体は塞いでいるが規約類だけ Allow） |
| **Limited Use の明記** | **あり**（`src/components/legal/PrivacyPolicy.tsx` 第 5 条。「限定的な使用（Limited Use）の要件を含む Google API サービスのユーザーデータに関するポリシーに準拠します」） |
| 取得する Google データの具体名 | あり（第 3 条の表に Search Console のサイト・GA4 のプロパティまで明記） |
| 読み取り専用であること | あり（第 5 条「データの書き換え・削除・投稿を行う権限は要求しません」）。実装も `readonly` スコープのみ |
| AI 事業者への提供の開示 | あり（第 4 条の表に Anthropic を明記） |
| 同意画面のブランディング | アプリ名 `SEO Checker`、サポートメール、ホームページ、承認済みドメインまで登録済み（#27、09-11 確認） |

### 足りないもの（申請前に埋める）

| # | 足りないもの | どこ |
|---|---|---|
| 1 | **ブランディングに利用規約・プライバシーの URL が未登録**（#8） | Google Cloud → OAuth → ブランディング |
| 2 | **Clerk のアプリ名が `My Application` のまま**（#7） | ログイン画面と確認メールに出る。**デモ動画に映るので、Google 側の `SEO Checker` と食い違って見える**。型 1 の地雷 |
| 3 | **「Google のデータを汎用 AI モデルの学習に使わない」の明記が弱い** | ポリシー第 6 条は「学習に利用されない契約・設定での利用に**努めます**」。**Google のデータについては言い切る**ほうが安全。型 3 の地雷 |
| 4 | **用途説明文**（未作成） | Claude が下書きする |
| 5 | **デモ動画**（未作成） | Claude が台本を書く。撮影は利用者 |
| 6 | ロゴ | 未登録（必須ではないが、あるほうがブランドの一致を示せる） |

### このサービス特有の申告ポイント

**Search Console と GA4 から取得した集計値は、Claude（Anthropic）に送って分析文を作っている**
（`src/lib/seo-analysis/ai/analyze.ts` が事実シートに GSC / GA4 の集計を含めて渡す）。
隠さず、**「利用者本人に見せるレポートを作るためだけに使い、モデルの学習には使わない」**と用途説明とポリシーの両方で言い切る。
型 7（申告との矛盾）を避けるうえで、ここがこのサービスのいちばんの要点。

## 申請の順番

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Clerk ダッシュボード | https://dashboard.clerk.com/ | アプリ名を `My Application` → **`SEO Checker`** に（#7）。Legal に `/terms` `/privacy` も登録 |
| 2 | （Claude の作業） | — | ポリシー第 6 条に「Google から取得したデータを汎用的な AI / ML モデルの開発・改善・学習に使用しない」を追記 |
| 3 | Google Cloud → OAuth → ブランディング | https://console.cloud.google.com/auth/branding?project=seo-checker-508104 | 利用規約 `https://app.seo-checker.tokyo/terms`、プライバシー `https://app.seo-checker.tokyo/privacy` を登録（#8）。アプリ名・ホームページ・承認済みドメインが揃っているか再確認 |
| 4 | Google Cloud → OAuth → データアクセス | https://console.cloud.google.com/auth/scopes?project=seo-checker-508104 | **使っていないスコープが混ざっていないか**を確認。必要なのは `webmasters.readonly` と `analytics.readonly`（口コミ返信を出すなら `business.manage` も。承認後） |
| 5 | （利用者の撮影） | — | デモ動画を YouTube に**限定公開**でアップ。**審査が終わるまで消さない** |
| 6 | Google Cloud → OAuth → 概要 | https://console.cloud.google.com/auth/overview?project=seo-checker-508104 | 「アプリを公開」→ 審査に出す。スコープごとに用途説明と動画 URL を入れる |
| 7 | メール | — | **申請後は毎日受信箱を見る。**Google からの質問に 1〜2 週間返さないと却下される |

## デモ動画に必ず入れるもの

1. ブラウザのアドレスバーに `app.seo-checker.tokyo` が映った状態から始める
2. ログイン → 設定画面の「Google と連携する」を押す
3. **Google の同意画面をまるごと映す**（アプリ名 `SEO Checker` と、要求しているスコープの文言が読めること）
4. 許可する
5. **そのデータが実際に画面に出るところまで**映す（検索パフォーマンス、生成 AI 流入分析、精密診断の報告書）
6. 連携の解除もできることを見せる（できれば）

音声か字幕で「いま何をしているか」を説明する。2〜3 分で足りる。

---

# 申請に貼る文面（2026-09-17 作成）

Google Cloud の「アプリを公開」→ 審査の申請フォームに、**スコープごとに**用途説明を入れる欄がある。
下の文をそのまま貼る（英語欄なら英訳を使う）。**動画の URL も同じ欄に入れる。**

## スコープ①: `https://www.googleapis.com/auth/webmasters.readonly`（Search Console・閲覧のみ）

> 当サービス「SEO Checker」（https://seo-checker.tokyo/ ）は、日本の中小企業・店舗に向けて、自社ウェブサイトの検索での見つかりやすさを診断し、改善案を提示する月額制のツールです。
>
> このスコープは、**利用者本人が所有・管理する Search Console のプロパティ**から、検索パフォーマンスの実測値（検索クエリ、表示回数、クリック数、平均掲載順位、対象ページ）を**読み取るため**に使用します。
>
> 取得した値は、アプリ内の「検索パフォーマンス」画面と「精密診断」の報告書に、**その利用者本人にだけ**表示します。どのクエリで表示されていてクリックされていないか、順位が下がったページはどれか、といった改善点を具体的に示すために必要です。実測値が無いと、当サービスは一般論の助言しか出せず、中核となる機能が成立しません。
>
> 書き込み・削除は一切行わないため、読み取り専用のスコープのみを要求しています。データは利用者本人への表示以外の目的には使わず、第三者への販売・広告利用・他の利用者への開示は行いません。汎用的な AI・機械学習モデルの学習には使用しません。

**英語版**

> SEO Checker (https://seo-checker.tokyo/ ) is a subscription web app for small businesses in Japan that diagnoses how well their website is found in search and suggests concrete improvements.
>
> We use this scope to read search performance data (queries, impressions, clicks, average position, and pages) **from Search Console properties the user themselves owns**. We display these values only to that same user, inside our "Search performance" screen and our "Detailed diagnosis" report, so they can see which queries show but do not get clicked and which pages lost position. Without this real data our product can only give generic advice, so this is core functionality.
>
> We never write or delete anything, so we request the read-only scope. The data is used solely to present it back to the user. We do not sell it, use it for advertising, disclose it to other users, or use it to develop, improve, or train generalized AI/ML models.

## スコープ②: `https://www.googleapis.com/auth/analytics.readonly`（Google アナリティクス・閲覧のみ）

> このスコープは、**利用者本人が管理する GA4 プロパティ**から、サイトの利用状況（セッション数、参照元・メディア、ページ別の表示回数、コンバージョンなどの集計値）を**読み取るため**に使用します。プロパティの一覧を取得するために Admin API、数値を取得するために Data API を使います。
>
> 取得した値は、アプリ内の「精密診断」の報告書と、設定画面の「GA4 イベントの割り当て」に、**その利用者本人にだけ**表示します。当サービスの中心的な価値は、検索で見つかったあと実際にサイトで何が起きているか（直帰、離脱、問い合わせに至らない導線）まで含めて改善点を示すことにあり、GA4 の集計値が無いとこの部分が成立しません。
>
> 設定画面では、利用者が自分の GA4 プロパティを一覧から選べるようにするため Admin API を使い、選んだプロパティのイベント名を読み取って、当サービス共通の指標に割り当てます。
>
> 個人を特定する情報（ユーザー ID、IP アドレス、端末識別子）は取得せず、集計値のみを扱います。書き込み・削除は行わないため読み取り専用のスコープのみを要求しています。汎用的な AI・機械学習モデルの学習には使用しません。

**英語版**

> We use this scope to read aggregated usage data (sessions, source/medium, pageviews, conversions) **from GA4 properties the user themselves administers**. We use the Admin API to list their properties and the Data API to read the numbers.
>
> We display these values only to that same user, in our "Detailed diagnosis" report and in the "GA4 event mapping" section of the settings screen. The core value of our product is showing what happens after a visitor arrives, not just how they found the site, so this data is required for the feature to work. On the settings screen we use the Admin API so the user can pick their own GA4 property from a list, and we read that property's event names to map them onto our standard set of metrics.
>
> We read aggregated metrics only; we do not request user IDs, IP addresses, or device identifiers. We never write or delete, so we request the read-only scope. We do not use this data to develop, improve, or train generalized AI/ML models.

## AI に送っていることの説明（聞かれたら、あるいは先に書いておく）

> 当サービスの「精密診断」では、上記のスコープで取得した**集計値**を、運営者が契約する AI 事業者（Anthropic）の API に送信し、その利用者本人に見せる分析文と改善案を生成します。送信するのは集計された数値と対象ページの情報で、Google アカウントのメールアドレスなどの識別情報は送信しません。AI 事業者側では、送信内容がモデルの学習に使用されない設定・契約のもとで利用しています。この取り扱いはプライバシーポリシー第 5 条・第 6 条に明記しています。

**英語版**

> In our "Detailed diagnosis" feature we send the **aggregated** values obtained through these scopes to our AI provider (Anthropic) in order to generate the written analysis and recommendations that we show back to that same user. We send aggregated figures and page information only; we do not send account identifiers such as the user's Google email address. Our agreement and settings with the provider ensure that this content is not used to train their models. This is disclosed in Articles 5 and 6 of our privacy policy.

---

# デモ動画の作り方（2026-09-17 作成。この順にやれば撮れる）

**実装を確認した前提**（台本を現実に合わせるために調べた）:

- 連携ボタンの文言は **「Google アカウントを接続する」**（`src/components/google/GoogleLinkPanel.tsx`。未接続のとき）。
- **Google の同意画面は同じタブで開く**（`window.location.href = url`）。ポップアップではないので、**ブラウザのウィンドウを 1 つ録るだけで全部入る**。
- **アプリ側に「連携を解除」ボタンは無い。**解除はヘッダー右上のアカウントメニュー（Clerk の `UserButton`）→ アカウントを管理 → 接続済みアカウント、または Google アカウント側で行う。

---

## フェーズ 0: 撮影前の準備（30 分）

### 0-1. いちばん大事な確認 — 画面に数字が出るか

**審査で見られるのは「許可したデータが実際に本人の画面に出ること」**。数字が出ない空の画面だけでは弱い。
先に本番で確かめる。

| # | サービス・画面 | URL | 見ること |
|---|---|---|---|
| 1 | 本番 → 設定 | https://app.seo-checker.tokyo/settings | Google 連携が「接続中」で、Search Console のサイトと GA4 のプロパティが**選べる**か |
| 2 | 本番 → 検索パフォーマンス | https://app.seo-checker.tokyo/tools/search-performance | **表に数字が出るか**（表示回数・クリック数・掲載順位） |
| 3 | 本番 → サイトレポート | https://app.seo-checker.tokyo/tools/site-report | **GA4 の数字が出るか** |

**数字が出ない場合の対処**（#10 の未確認事項がここに効く）:

- **案 A（推奨）**: **すでに Search Console と GA4 にデータがある Google アカウント**で連携して撮る。顧客サイトや自社の別サイトの権限を持つアカウントがあればそれを使う。アプリのログインは今のアカウントのままでよく、**接続する Google アカウントだけ変えればよい**。
- **案 B**: `seo-checker.tokyo` に GA4 プロパティを作り、数日アクセスを溜めてから撮る。**リリースが遅れるので今回は避ける。**
- **案 C**: Search Console だけ数字が出て GA4 が空なら、**GA4 の画面は「プロパティを選べる」ところまでを映す**。同意画面と Search Console の実データが映っていれば、通る見込みはある。

### 0-2. 同意画面が必ず出る状態にする（最重要）

**すでに許可済みだと、Google は同意画面を出さずに素通りさせる。**そうなると動画の要件を満たさず、撮り直しになる。

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google アカウント → データとプライバシー → サードパーティ製のアプリとサービス | https://myaccount.google.com/connections | **`SEO Checker` を探して「すべてのアクセス権を削除」**。ここを消さないと同意画面は出ない |
| 2 | 本番 → ヘッダー右上のアカウントメニュー | https://app.seo-checker.tokyo/settings | アカウントを管理 → 接続済みアカウント → Google を削除（あれば） |
| 3 | 本番 → 設定 | https://app.seo-checker.tokyo/settings | **「まだ接続されていません」と「Google アカウントを接続する」ボタンが出ている**ことを確認。これが撮影開始の状態 |

### 0-3. 画面をきれいにする

- **Chrome のブックマークバーを隠す**（`Ctrl + Shift + B`）。個人的なブックマークが映らないようにする。
- **他のタブを全部閉じる。**タブは 1 枚だけにする。
- 通知が出ないように、Windows の集中モードをオンにする（`Win + N` → 集中モード）。
- 画面の拡大率を 100% にする（`Ctrl + 0`）。文字が読めることが大事。

### 0-4. 録画ツール（Windows 11）

**おすすめは Snipping Tool の画面録画**（範囲を選んで録るので、ブラウザのウィンドウだけを確実に収められる）。

1. `Win + Shift + S` を押す
2. 上部のメニューで**ビデオカメラのアイコン**（画面録画）を選ぶ
3. **Chrome のウィンドウ全体**を囲むように範囲をドラッグする。**アドレスバーを必ず範囲に入れる**
4. 「開始」を押す（3 秒のカウントダウンがある）

うまくいかないときは Xbox Game Bar（`Win + G` → `Win + Alt + R` で録画開始・停止）。Chrome のウィンドウを録る。

**音声は任意。**マイクで話せるなら話す。話さないなら無音でよい（同意画面と実データが映っていることが本質）。
無音で撮るなら、各場面で **3 秒ずつ止まる**。早すぎると審査担当が読めない。

---

## フェーズ 1: 撮影（5 分）

録画を開始してから、この順に操作する。**各場面で 3 秒止まる。**

| # | 操作 | 映るもの | 話す（任意） |
|---|---|---|---|
| 1 | アドレスバーに `seo-checker.tokyo` を入れて開く | 紹介サイトのトップ | 「SEO Checker は、中小企業のウェブサイトが検索でどう見つかっているかを診断するサービスです」 |
| 2 | `app.seo-checker.tokyo` を開いてログイン | **アプリ名 `SEO Checker` が出ているログイン画面** | 「利用者はアカウントを作ってログインします」 |
| 3 | 設定画面を開く | 「まだ接続されていません」の案内と**「Google アカウントを接続する」ボタン** | 「Search Console と Google アナリティクスのデータを読み取るため、Google 連携をお願いしています」 |
| 4 | ボタンを押す | Google のアカウント選択画面 | 「Google アカウントを選びます」 |
| 5 | アカウントを選ぶ | **同意画面。ここが最重要** | 「Search Console とアナリティクスの、**閲覧のみ**の権限を求めます」 |
| 6 | **同意画面で 5 秒静止し、スクロールして 2 つの権限を両方見せてから、もう一度 3 秒静止** | アプリ名と権限の文言が読める状態 | （読み上げる） |
| 7 | 「続行」を押す | 設定画面に戻る | 「利用者が許可します」 |
| 8 | Search Console のサイトを選んで保存 | 一覧から選べるところ | 「ご自身のサイトを選びます」 |
| 9 | GA4 のプロパティを選んで保存 | 一覧から選べるところ | 「アナリティクスのプロパティも同じように選びます」 |
| 10 | 検索パフォーマンス画面を開く | **数字が出ている表** | 「これが Search Console から読み取った実測値です。本人にだけ表示します」 |
| 11 | 設定画面の「GA4 イベントの割り当て」に戻る | **選んだ GA4 プロパティと、読み取ったイベント名の一覧** | 「アナリティクスのプロパティを選び、イベント名を読み取って指標に割り当てます」（**サイトレポートと生成 AI 流入分析は OAuth ではなく運営者のサービスアカウントを使うので、この動画には出さない。#96**） |
| 12 | 精密診断の報告書を開く（あれば） | 分析文と改善案 | 「これらの実測値をもとに改善案を作ります」 |
| 13 | ヘッダー右上 → アカウントを管理 → 接続済みアカウント | 解除できる画面 | 「連携はいつでも解除できます」 |
| 14 | `app.seo-checker.tokyo/privacy` を開き、**第 5 条までスクロール** | **第 5 条（Google アカウントのデータの取り扱い）** | 「取り扱いはプライバシーポリシーに明記しています」 |

録画を止める（Snipping Tool の停止ボタン、または `Win + Alt + R`）。

**撮り直しになる失敗**: 同意画面が出なかった（0-2 をやり忘れ）／アドレスバーが映っていない／数字が 1 つも出ていない／アプリ名が違う／早すぎて読めない。

---

## フェーズ 2: 見直し（5 分）

撮れた動画を再生して、次を 1 つずつ確認する。1 つでも欠けたら撮り直す。

- [ ] アドレスバーの `app.seo-checker.tokyo` が読める
- [ ] ログイン画面に `SEO Checker` と出ている
- [ ] **Google の同意画面が映っていて、アプリ名と 2 つの権限の文言が読める**
- [ ] 許可を押す操作が映っている
- [ ] **Search Console の数字が実際に出ている画面**が映っている
- [ ] **GA4 の数字（または少なくともプロパティを選べる画面）**が映っている
- [ ] プライバシーポリシーの第 5 条が映っている
- [ ] 個人的なブックマークや他のタブが映り込んでいない
- [ ] 長さが 2〜4 分に収まっている

---

## フェーズ 3: YouTube にアップ（5 分）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | YouTube → 動画をアップロード | https://studio.youtube.com/ | 右上の「作成」→「動画をアップロード」 |
| 2 | 同上 | 同上 | タイトル: `SEO Checker - OAuth scope usage demo (webmasters.readonly / analytics.readonly)` |
| 3 | 同上 | 同上 | 説明欄に、資料の「申請に貼る文面」の英語版を貼っておく（審査担当が英語で読む場合に効く） |
| 4 | 同上 | 同上 | 視聴者設定: **「いいえ、子ども向けではありません」** |
| 5 | 同上 | 同上 | 公開設定: **「限定公開」**（Unlisted）。**非公開（Private）にしない**。非公開だと審査担当が見られない |
| 6 | 同上 | 同上 | 公開 → **URL をコピー**。**審査が終わるまでこの動画を消さない・設定を変えない** |

---

## フェーズ 4: 申請（10 分）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | ~~Google Cloud → OAuth → ブランディング~~ | https://console.cloud.google.com/auth/branding?project=seo-checker-508104 | **完了（2026-09-17、別セッションで利用者が実施）**。規約とプライバシーの URL は登録済み |
| 2 | Google Cloud → OAuth → データアクセス | https://console.cloud.google.com/auth/scopes?project=seo-checker-508104 | **使っていないスコープが混ざっていないか**確認。必要なのは `webmasters.readonly` と `analytics.readonly` だけ |
| 3 | Google Cloud → OAuth → 概要 | https://console.cloud.google.com/auth/overview?project=seo-checker-508104 | 「アプリを公開」→ 確認画面 → 審査に出す |
| 4 | 申請フォーム | 同上 | スコープごとの用途説明（この資料の「申請に貼る文面」）と、**動画 URL** を貼る |
| 5 | メール | — | **申請後は毎日受信箱を見る。**Google の質問に 1〜2 週間返さないと却下される |

---

# 「アクセスをブロック: エラー 403 access_denied」が出たとき（2026-09-17 に発生）

**症状**: `wolf@wolf-info.org` で Google の画面に進んだところ、
「**アクセスをブロック: seo-checker.tokyo は Google の審査プロセスを完了していません**」「エラー 403: access_denied」。

**原因**: OAuth アプリが**テスト状態**で、そのアカウントが**テストユーザーに登録されていない**から。
登録済みは `matsumatsu452@gmail.com` だけ（#27 の設定時に入れたもの）。

**重要な意味**: これは Google 連携だけの話ではない。**Clerk のログイン（Google で続ける）も同じ OAuth クライアントを使う**ので、
テスト状態のあいだは**テストユーザーに入っていない人は、そもそもログインすらできない**。
招待制でリリースするなら、**お客様を 1 人ずつテストユーザーに追加する運用**になる。

## すぐの対処（確実）

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google Cloud → OAuth → 対象（Audience） | https://console.cloud.google.com/auth/audience?project=seo-checker-508104 | 「テストユーザー」→ **`wolf@wolf-info.org` を追加**して保存。上限 100 人 |
| 2 | ブラウザ | — | いったん Google からログアウトするか、シークレットウィンドウで開き直してからやり直す |

## 検討すべき選択肢: 審査を待たずに「本番」へ切り替える

Google Cloud の公開ステータスは、**審査の完了を待たずに「テスト」→「本番」へ切り替えられる**。
切り替えると次が変わる。

| | テスト（いま） | 本番・未確認 |
|---|---|---|
| 誰が使えるか | **テストユーザーに登録した人だけ** | **誰でも**（未確認アプリの上限 100 ユーザー） |
| 画面 | 普通の同意画面 | **「このアプリは Google で確認されていません」の警告**が先に出る（「詳細」→「安全でないページに移動」で進める） |
| トークン | **7 日で失効**（毎週つなぎ直し） | **失効しない** |
| 審査 | — | 並行して申請できる |

**招待制で今週リリースするなら、本番に切り替えるほうが運用が軽い**（テストユーザーの追加が不要になり、7 日失効も消える）。
代わりに、お客様に「警告画面が出ますが『詳細』から進んでください。審査に出しているところです」と一言伝える必要がある。

**ただし切り替えの可否と挙動は、Google Cloud の画面で実際に確認すること**（この環境からは Google のドキュメントを開けない）。
「アプリを公開」を押したときに審査への申請を求められるか、警告つきで公開できるかを見てから決める。

**動画の撮影には影響しない。**むしろテスト状態のまま撮ったほうが、同意画面がそのまま出るので都合がよい。

---

# 実行手順（2026-09-17。この順にやる）

**方針**: 公開ステータス（テスト / 本番）と確認ステータス（未確認 / 確認済み）は独立している。
**公開ステータスだけ先に本番へ上げて今週リリースし、確認（審査）は並行して待つ。**

| ステップ | 内容 | 所要 | 誰 |
|---|---|---|---|
| 1 | テストユーザーに `wolf@wolf-info.org` を追加 | 5 分 | 利用者 |
| 2 | 画面に数字が出るか確認 | 10 分 | 利用者 |
| 3 | デモ動画を撮る（**テスト状態のまま**） | 30 分 | 利用者 |
| 4 | YouTube に限定公開でアップ | 5 分 | 利用者 |
| 5 | **公開ステータスを本番に切り替える** | 10 分 | 利用者 |
| 6 | 審査を申請する | 15 分 | 利用者 |
| 7 | お客様への案内文に警告画面の説明を足す | — | Claude（下記の文案） |

**3 を 5 より先にやる理由**: 本番に切り替えると同意画面の前に「確認されていません」の警告が挟まり、動画が分かりにくくなる。
テスト状態のうちに撮るのがきれい。

---

## ステップ 1: テストユーザーを追加

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google Cloud → Google Auth Platform → 対象（Audience） | https://console.cloud.google.com/auth/audience?project=seo-checker-508104 | 「テストユーザー」の欄で「+ ADD USERS」→ `wolf@wolf-info.org` → 保存。上限 100 人 |
| 2 | ブラウザ | — | **シークレットウィンドウ**で `https://app.seo-checker.tokyo/settings` を開き、`wolf@wolf-info.org` で連携できるか試す。403 が消えていれば成功 |

## ステップ 2: 数字が出るか確認

| # | サービス・画面 | URL | 見ること |
|---|---|---|---|
| 1 | 本番 → 設定 | https://app.seo-checker.tokyo/settings | Search Console のサイトと GA4 のプロパティが**一覧から選べる**か |
| 2 | 本番 → 検索パフォーマンス | https://app.seo-checker.tokyo/tools/search-performance | **表に数字が出るか** |
| 3 | 本番 → サイトレポート | https://app.seo-checker.tokyo/tools/site-report | **GA4 の数字が出るか** |

一覧が空、または数字が出ないときは、その時点で Claude に報告する（連携するアカウントを変えるか、GA4 を作るかの判断が必要）。

## ステップ 3: 撮影

**この資料の「デモ動画の作り方」のフェーズ 0-2 以降**をそのまま実行する。要点だけ再掲:

- 撮影前に https://myaccount.google.com/connections で `SEO Checker` のアクセス権を削除する（**これをしないと同意画面が出ない**）
- ブックマークバーを隠す（`Ctrl + Shift + B`）、タブを 1 枚にする
- `Win + Shift + S` → ビデオカメラのアイコン → Chrome のウィンドウを囲む（**アドレスバーを範囲に入れる**）
- 14 場面を各 3 秒静止しながら操作する。同意画面だけ 5 秒 + スクロール + 3 秒

## ステップ 4: YouTube

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | YouTube Studio | https://studio.youtube.com/ | 右上「作成」→「動画をアップロード」 |
| 2 | 同上 | 同上 | タイトル `SEO Checker - OAuth scope usage demo (webmasters.readonly / analytics.readonly)` |
| 3 | 同上 | 同上 | 説明欄に、この資料の「申請に貼る文面」の**英語版**を貼る |
| 4 | 同上 | 同上 | 「いいえ、子ども向けではありません」を選ぶ |
| 5 | 同上 | 同上 | 公開設定 **「限定公開」**。**「非公開」にしない**（審査担当が見られない） |
| 6 | 同上 | 同上 | 公開 → **URL をコピーして控える**。審査が終わるまで消さない・設定を変えない |

## ステップ 5: 公開ステータスを本番に切り替える

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google Cloud → Google Auth Platform → 概要 | https://console.cloud.google.com/auth/overview?project=seo-checker-508104 | 「公開ステータス」の欄を見る。**「テスト中」**と出ている |
| 2 | 同上 | 同上 | **「アプリを公開」**（PUBLISH APP）を押す |
| 3 | 同上 | 同上 | 確認のダイアログが出る。**機密スコープを使っているため「確認が必要です」といった案内が出る**。ここで公開できるなら公開する |
| 4 | 同上 | 同上 | 公開ステータスが**「本番」**になったことを確認 |

**見るべき分岐**:

- **警告つきで公開できた場合** → 目的達成。テストユーザーの追加が不要になり、7 日失効も消える。ステップ 6 へ。
- **「先に確認（審査）を完了させる必要があります」と止められた場合** → 切り替えられない。**テスト状態のまま運用する**（お客様を 1 人ずつテストユーザーに追加し、7 日ごとに再連携してもらう）。この場合もステップ 6 の申請は出す。

**どちらになったか Claude に報告する。**運用の案内文が変わる。

## ステップ 6: 審査を申請する

| # | サービス・画面 | URL | やること |
|---|---|---|---|
| 1 | Google Cloud → Google Auth Platform → データアクセス | https://console.cloud.google.com/auth/scopes?project=seo-checker-508104 | **余計なスコープが混ざっていないか**確認。必要なのは `webmasters.readonly` と `analytics.readonly` の 2 つだけ。ログイン用の `openid` / `email` / `profile` は非機密なので気にしなくてよい |
| 2 | Google Cloud → Google Auth Platform → 検証センター（Verification center） | https://console.cloud.google.com/auth/verification?project=seo-checker-508104 | 「確認を申請」。見つからなければ概要の画面から辿る |
| 3 | 申請フォーム | 同上 | スコープごとの用途説明（この資料の「申請に貼る文面」）を貼る。**日本語欄があれば日本語版、英語のみなら英語版** |
| 4 | 同上 | 同上 | **動画 URL**（ステップ 4 で控えたもの）を貼る |
| 5 | 同上 | 同上 | 送信 |
| 6 | メール | — | **申請後は毎日受信箱を見る。**Google の質問に 1〜2 週間返さないと却下される。返信は Claude が下書きできる |

## ステップ 7: お客様に渡す案内文（警告画面が出る場合）

本番・未確認のあいだ、お客様には Google の警告画面が出る。申し込み案内にこの一節を入れる。

> **Google 連携のときに出る画面について**
>
> Search Console と Google アナリティクスを接続していただくとき、Google の画面に
> 「このアプリは Google で確認されていません」という注意が表示されることがあります。
>
> これは、当サービスが Google の確認手続きの途中にあるためです（申請済み、審査待ち）。
> お手数ですが、**「詳細」→「seo-checker.tokyo（安全ではないページ）に移動」**を選んでお進みください。
>
> 当サービスが求めるのは **Search Console と Google アナリティクスの「閲覧のみ」の権限**です。
> データの書き換え・削除・投稿は一切できません。取得した数値は、お客様ご自身のレポートを作るためにのみ使用します。
> 詳細は[プライバシーポリシー](https://app.seo-checker.tokyo/privacy)の第 5 条に記載しています。
>
> 連携はいつでも解除できます（Google アカウントの「セキュリティ」→「サードパーティ製のアプリとサービス」）。

**テスト状態のまま運用する場合**は、上の文の代わりにこちら:

> **Google 連携の前に、お客様の Google アカウントのご登録が必要です**
>
> 当サービスは現在 Google の確認手続きの途中にあり、あらかじめご登録したアカウントのみ連携できます。
> お使いになる Google アカウントのメールアドレスを contact@seo-checker.tokyo までお知らせください。登録後にご案内します。
>
> また、この期間中は **約 1 週間ごとに連携の再許可**が必要です（Google の仕様）。
> 画面に「権限が足りません」と出たら、設定画面の「接続し直す」を押してください。確認手続きが完了すると、この作業は不要になります。

---

# 実装の食い違い（2026-09-17 に判明。#96）

**GA4 の読み取りに 2 つの経路がある。**

| 経路 | 使うもの | 誰のデータか | 使っている画面 |
|---|---|---|---|
| **A: OAuth（お客様ごと）** | `analytics.readonly` + `createGa4ClientWithToken`（`src/lib/google/ga4.ts` の `settings.ga4PropertyId`） | **お客様が選んだプロパティ** | **精密診断**、設定画面の **GA4 イベントの割り当て** |
| **B: サービスアカウント（運営者固定）** | 環境変数 `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON`（`src/lib/ga4/client.ts` の `getGa4Client`） | **運営者の 1 プロパティだけ** | **サイトレポート**、**生成 AI 流入分析** |

**これが問題になる点:**

1. **サイトレポートと生成 AI 流入分析は、お客様ごとの GA4 を読めない。**環境変数を入れれば動くが、映るのは運営者のプロパティ。**多店舗・多顧客の SaaS としては成立していない。**
2. **本番の画面に開発者向けの文言が出ている。**「プロジェクト直下の `.env.local` に次の行を追加し、開発サーバーを再起動してください」。**お客様に見せる文面ではない。**
3. **OAuth の申請文が実態とずれていた。**当初「GA4 のデータはサイトレポートと生成 AI 流入分析に表示する」と書いていたが、この 2 画面は OAuth を使っていない。**上の申請文を「精密診断」と「GA4 イベントの割り当て」に直した**（型 7「申告との矛盾」を避けるため）。

**やること（利用者の判断が要る）:**

- **案 A（推奨・後回し可）**: サイトレポートと生成 AI 流入分析を、経路 A（お客様の OAuth + `settings.ga4PropertyId`）に寄せる。コードは既にあるので、クライアントの取得元を差し替える作業。**リリース後でよい。**
- **案 B（今週の暫定）**: この 2 画面を**プラン機能から外す**か、「運営者が設定したプロパティのみ」と画面に明記する。少なくとも**開発者向けの文言（`.env.local`）はお客様向けに書き直す**。

**今週のリリースへの影響**: ライト以上に「サイトレポート」を含めて売っているので、**お客様が開くと使えない状態になる**。案 B の最低限（文言の修正と、使えない旨の明示）は**リリース前に入れたほうがよい**。
