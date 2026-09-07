# 競合 SEO / LLMO ツール調査資料（機能追加の参考）

2026-09-06 に共有された 2 つの PDF（Google Drive エクスポート）と、ミエルカ GEO の LP キャプチャ 12 枚を読み取り、
seo-checker1 に今後追加する機能の参考として整理したものです。

| # | 資料 | 提供元 / 製品 | ページ数 | 内容 |
|---|------|---------------|---------|------|
| 1 | `WebUI2Catalog_AIO.pdf` | 株式会社ユーザーローカル / User Insight | 10 | AIO/LLMO（生成 AI 検索最適化）対策機能のカタログ（2026-06-22 作成） |
| 2 | `yoriaiSEO_サービス資料.pdf`（PDF タイトル「【完全版】yoriaiSEOサービス資料」） | 株式会社 Cominka / yoriaiSEO | 42 | SEO 対策支援 SaaS のサービス資料（機能・料金・事例、2025 年版） |
| 3 | mieru-ca.com の LP キャプチャ（スマホ表示） | 株式会社 Faber Company / ミエルカ GEO | 12 枚 | AI 検索（AIO・LLM）特化の分析ツールの機能紹介（2026 年版） |

## ドキュメント構成

| ファイル | 内容 |
|---|---|
| [01_user-insight_aio-llmo.md](./01_user-insight_aio-llmo.md) | User Insight の AIO/LLMO 機能をページ順に分析。画面構成・指標・UI 要素まで記載 |
| [02_yoriai-seo.md](./02_yoriai-seo.md) | yoriaiSEO の 6 基本機能 + AI ライティング + 料金/クレジット体系をページ順に分析 |
| [03_feature-catalog.md](./03_feature-catalog.md) | 2 製品を横断した機能カタログ（「どのようなものがあるか」）。外部依存と優先度付き |
| [04_implementation-guide.md](./04_implementation-guide.md) | 各機能を「どのように実装するか」。アーキテクチャ、データソース、判定ルール、データモデル、LLM プロンプト設計 |
| [05_roadmap.md](./05_roadmap.md) | 実装順序の提案（外部 API 依存・コスト・価値で段階分け） |
| [06_mieruca-geo.md](./06_mieruca-geo.md) | ミエルカ GEO の 5 機能（AIO レポート、AI 検索流入、LLM リサーチ、シェアモニタリング、サイトレポート）を画面ごとに分析。03〜05 に追記した機能 ID の一覧 |
| [raw/](./raw/) | PDF から抽出した全文テキスト（grep 用） |

## 用語

- **AIO**: AI Overviews。Google 検索結果の上部に表示される AI 生成の概要。転じて「AI Overviews に引用されるための最適化」。
- **LLMO**: Large Language Model Optimization。ChatGPT / Gemini / Claude / Grok / Perplexity などの回答で自社ブランドが言及され、自社ドメインが引用されるための最適化。GEO（Generative Engine Optimization）とほぼ同義。
- **ブランド言及率**: 登録プロンプトのうち、回答文にブランド名が含まれた割合。
- **ドメイン引用率**: 登録プロンプトのうち、回答の参照元 URL に自社ドメインが含まれた割合。
- **SERP**: 検索結果ページ。**SERP フィーチャー**: AI Overviews、強調スニペット、PAA（他の人はこちらも質問）、動画、画像などの特殊枠。
- **テクニカル SEO**: サイト構造・技術要件（ステータス、canonical、速度など）の最適化。**オンページ SEO**: 個別ページのコンテンツ・タグの最適化。

## 注意

- PDF 本体と画面キャプチャは第三者の営業資料のため、リポジトリには含めていません（テキスト抽出のみ `raw/` に保存）。
- 料金・数値は資料作成時点のものです。
- 画面キャプチャから読み取った項目には「推定」と注記しています。
