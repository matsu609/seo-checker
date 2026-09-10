# 紹介サイト（seo-checker.tokyo）の文面

> 2026-09-10: `marketing/public/index.html` に反映済み。以後はそちらが正本で、ここは素案の控え。

Google OAuth の審査は「ホームページを見てアプリの用途が分かり、プライバシーポリシーにたどり着ける」ことを見る。
紹介サイトはこのリポジトリの外（別管理）なので、貼り付ける文面をここに置く。運営者名・連絡先は
`src/lib/legal/operator.ts` と揃えること。

---

## 1. ヒーロー（ページ最上部）

**SEO Checker**

Google 検索・生成 AI・Google マップ。3 つの「見つけてもらう場所」を、ひとつのツールで診断します。

URL を入れるだけの無料診断から、Search Console・Google アナリティクスの実測値、店舗のビジネス プロフィールの採点まで。
専門知識がなくても、何を直せばよいかが分かる報告書を PDF で出せます。

[無料で診断する](https://app.seo-checker.tokyo/) 　[ツールにログイン](https://app.seo-checker.tokyo/sign-in)

---

## 2. できること（3 列）

### SEO（Google 検索）
サイトの技術的な問題、ページごとの改善点、キーワードの順位を診断・計測します。
Search Console を連携すると、クリック数・表示回数・掲載順位を Google の実測値で表示します。

### AIO（生成 AI・AI Overviews）
ChatGPT や Google の AI Overviews に自社が引用・言及されているかを確認し、AI に選ばれるためのページ改善と llms.txt の作成を支援します。
Google アナリティクスを連携すると、生成 AI からの流入を分析します。

### MEO（Google マップ）
Google マップ上の店舗情報（ビジネス プロフィール）を、基本情報・投稿・写真・レビューの 4 カテゴリで採点。
競合との比較と、毎週の自動更新による推移の記録で、口コミ対策の効果が見えます。

---

## 3. Google アカウント連携について（審査担当も読む想定）

SEO Checker は、利用者の許可を得て次の Google サービスのデータを **読み取り専用** で利用します。

- **Google Search Console**: 利用者が所有するサイトのクリック数・表示回数・CTR・掲載順位を、「検索パフォーマンス」画面に表示するため。
- **Google アナリティクス（GA4）**: 利用者が所有するプロパティのユーザー数・セッション・流入元を、「生成 AI 流入分析」「サイトレポート」画面に表示するため。

取得したデータは、利用者本人の画面に表示する目的にだけ使い、運営者のサーバーには保存しません（応答を速くするための短時間のキャッシュを除く）。
第三者への提供、広告目的の利用、AI モデルの学習への利用は行いません。連携は設定画面からいつでも解除できます。

詳しくは [プライバシーポリシー](https://app.seo-checker.tokyo/privacy) をご覧ください。

---

## 4. 料金

無料診断は登録不要で何度でも使えます。ツールは月額プランで、詳細は [料金プラン](https://app.seo-checker.tokyo/plans) をご覧ください。

---

## 5. フッター

SEO Checker は SEO 研究所（代表: 松下）が運営しています。

[アプリを開く](https://app.seo-checker.tokyo/) ・ [利用規約](https://app.seo-checker.tokyo/terms) ・ [プライバシーポリシー](https://app.seo-checker.tokyo/privacy) ・ お問い合わせ: contact@seo-checker.tokyo

© SEO 研究所

---

## 貼り付けのチェックリスト（Google 審査向け）

- [ ] フッターの「プライバシーポリシー」リンクが https://app.seo-checker.tokyo/privacy を指している
- [ ] フッターの「利用規約」リンクが https://app.seo-checker.tokyo/terms を指している
- [ ] アプリ本体へのリンク（https://app.seo-checker.tokyo/）がある
- [ ] 「3. Google アカウント連携について」がトップページか、トップからリンクされたページにある
- [ ] 運営者名が規約・ポリシーの表記（SEO 研究所（代表: 松下））と一致している
- [ ] Google Auth Platform → ブランディングの「アプリのホームページ」に https://seo-checker.tokyo/ を入れる
