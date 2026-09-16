# Google OAuth 本番公開審査（#13）— 落ちる理由と、こちらの現在地

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
> 取得した値は、アプリ内の「サイトレポート」「生成 AI 流入分析」画面と「精密診断」の報告書に、**その利用者本人にだけ**表示します。当サービスの中心的な価値は、検索で見つかったあと実際にサイトで何が起きているか（直帰、離脱、問い合わせに至らない導線）まで含めて改善点を示すことにあり、GA4 の集計値が無いとこの部分が成立しません。
>
> 「生成 AI 流入分析」は、参照元に生成 AI サービスが含まれる訪問を集計して表示する機能で、GA4 の参照元データを使います。
>
> 個人を特定する情報（ユーザー ID、IP アドレス、端末識別子）は取得せず、集計値のみを扱います。書き込み・削除は行わないため読み取り専用のスコープのみを要求しています。汎用的な AI・機械学習モデルの学習には使用しません。

**英語版**

> We use this scope to read aggregated usage data (sessions, source/medium, pageviews, conversions) **from GA4 properties the user themselves administers**. We use the Admin API to list their properties and the Data API to read the numbers.
>
> We display these values only to that same user, in our "Site report" and "Generative-AI traffic" screens and in the "Detailed diagnosis" report. The core value of our product is showing what happens after a visitor arrives, not just how they found the site, so this data is required for the feature to work. The "Generative-AI traffic" screen aggregates visits whose referrer is a generative-AI service.
>
> We read aggregated metrics only; we do not request user IDs, IP addresses, or device identifiers. We never write or delete, so we request the read-only scope. We do not use this data to develop, improve, or train generalized AI/ML models.

## AI に送っていることの説明（聞かれたら、あるいは先に書いておく）

> 当サービスの「精密診断」では、上記のスコープで取得した**集計値**を、運営者が契約する AI 事業者（Anthropic）の API に送信し、その利用者本人に見せる分析文と改善案を生成します。送信するのは集計された数値と対象ページの情報で、Google アカウントのメールアドレスなどの識別情報は送信しません。AI 事業者側では、送信内容がモデルの学習に使用されない設定・契約のもとで利用しています。この取り扱いはプライバシーポリシー第 5 条・第 6 条に明記しています。

**英語版**

> In our "Detailed diagnosis" feature we send the **aggregated** values obtained through these scopes to our AI provider (Anthropic) in order to generate the written analysis and recommendations that we show back to that same user. We send aggregated figures and page information only; we do not send account identifiers such as the user's Google email address. Our agreement and settings with the provider ensure that this content is not used to train their models. This is disclosed in Articles 5 and 6 of our privacy policy.

---

# デモ動画の台本（2〜3 分。撮影は利用者）

**撮り方**: 画面録画。**ブラウザのアドレスバーを必ず画面内に入れる。**マイクで話せるなら話す。話さないなら各場面にテロップを入れる。
撮り終わったら **YouTube に「限定公開」**でアップし、**審査が終わるまで消さない**。URL を申請フォームに貼る。

**撮影前の準備**: 連携を一度解除しておく（設定画面から Google の接続を外す）。既に連携済みだと同意画面が出ず、**動画の要件を満たさない**。

| # | 画面 | 映すもの | 言う（テロップ） |
|---|---|---|---|
| 1 | https://seo-checker.tokyo/ | 紹介サイトのトップ。アドレスバーが見えること | 「SEO Checker は、中小企業のウェブサイトが検索でどう見つかっているかを診断するサービスです」 |
| 2 | https://app.seo-checker.tokyo/ | ログイン。**アプリ名 `SEO Checker` が出ているログイン画面**を映す | 「利用者はアカウントを作ってログインします」 |
| 3 | アプリ内の設定画面 | 「Google と連携する」ボタンを押す前の画面 | 「Search Console と Google アナリティクスのデータを読み取るため、Google 連携をお願いしています」 |
| 4 | **Google の同意画面** | **全画面。アプリ名・要求スコープの文言が読める大きさで、3 秒以上静止する。スクロールして両方のスコープを見せる** | 「Search Console とアナリティクスの、**閲覧のみ**の権限を求めます」 |
| 5 | 同意画面 | 「続行」を押す | 「利用者が許可します」 |
| 6 | 設定画面に戻ったところ | 連携済みの表示、サイトとプロパティの一覧 | 「連携すると、利用者ご自身のサイトとプロパティを選べます」 |
| 7 | 検索パフォーマンス画面 | **実際に数値が表示されているところ** | 「これが Search Console から読み取った実測値です。どの検索語で表示され、クリックされているかを本人にだけ表示します」 |
| 8 | サイトレポート / 生成 AI 流入分析 | **実際に数値が表示されているところ** | 「こちらは GA4 から読み取った利用状況です」 |
| 9 | 精密診断の報告書 | 分析文と改善案が出ているところ | 「これらの実測値をもとに、改善案を作って本人に示します」 |
| 10 | 設定画面 | 連携を解除するところ | 「連携はいつでも解除できます」 |
| 11 | https://app.seo-checker.tokyo/privacy | **第 5 条（Google アカウントのデータの取り扱い）が画面に出ているところ** | 「取り扱いはプライバシーポリシーに明記しています」 |

**やってはいけないこと**: 同意画面を早送りする／モザイクをかける、テスト用の別アプリで撮る、
申請したアプリ名と違う名前が映る、データが出ていない空の画面だけで終わる。
