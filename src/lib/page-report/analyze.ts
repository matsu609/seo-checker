/**
 * ページ最適化レポートの組み立て（純関数）。
 *
 * 入力は「取得済みの HTML」と「オリジン共通のファイル（robots.txt / llms.txt）」だけ。
 * ネットワークには出ないので、HTML 文字列からそのままテストできる。
 * PageSpeed Insights（A3）は取得に時間がかかるため、呼び出し側が結果を渡す。
 */
import type { FetchedText } from "@/lib/analyzer/fetch";
import { notForSearch } from "@/lib/analyzer/page-kind";
import type { SiteFiles } from "@/lib/analyzer/robots";
import type { PsiResult } from "@/lib/psi/types";
import { PAGE_REPORT_THRESHOLDS, SECTION_LABELS, type SectionId } from "./config";
import { KEY_TYPES, measurePage } from "./extract";
import { evaluateAiBots } from "./robots";
import { buildSection, scoreLabelOf, statusFrom, statusOf, totalScore } from "./score";
import type { PageMeasurements, PageReport, ReportRow, ReportSection } from "./types";

const T = PAGE_REPORT_THRESHOLDS;

export interface BuildReportOptions {
  /** ユーザーが入力した URL（リダイレクトされても表示はこちら） */
  requestedUrl?: string;
  psi?: PsiResult | null;
  psiError?: string | null;
  fetchedAt?: string;
}

export function buildPageReport(
  fetched: FetchedText,
  siteFiles: SiteFiles,
  options: BuildReportOptions = {},
): PageReport {
  const m = measurePage(fetched);
  const finalUrl = fetched.finalUrl;
  const origin = safeOrigin(finalUrl) || siteFiles.origin;
  const robots = evaluateAiBots(siteFiles.robotsTxt, finalUrl, `${origin}/robots.txt`);

  const sections: ReportSection[] = [
    buildSection("content", contentRows(m)),
    buildSection("headings", headingRows(m)),
    buildSection("structuredData", structuredDataRows(m)),
    buildSection("head", headRows(m)),
    buildSection("semantic", semanticRows(m)),
    buildSection("internalLinks", linkRows(m)),
    buildSection("robots", robotsRows(m, robots, siteFiles, origin, finalUrl)),
    buildSection("images", imageRows(m)),
  ];

  const score = totalScore(sections);
  const notes: string[] = [];
  if (m.mainTextChars === 0) {
    // 測定不能であることを画面にも明示する（各行の判定だけでは伝わりにくい）
    notes.push(
      "本文を 1 文字も抽出できませんでした。JavaScript でのみ描画されるページの可能性があります。この状態では読みやすさ・見出しの間隔などは評価できず、AI クローラからも同じく空のページとして扱われます。",
    );
  }
  if (!m.readable) {
    notes.push(
      "本文の自動抽出（Readability）が本文を特定できなかったため、ナビゲーション等を除いたページ全体のテキストで評価しています。",
    );
  }
  if (options.requestedUrl && options.requestedUrl !== finalUrl) {
    notes.push(`リダイレクト先の ${finalUrl} を評価しました。`);
  }

  return {
    url: options.requestedUrl ?? finalUrl,
    finalUrl,
    status: fetched.status,
    fetchedAt: options.fetchedAt ?? new Date().toISOString(),
    score,
    scoreLabel: scoreLabelOf(score),
    sections,
    measurements: m,
    robots,
    llmsTxt: {
      present: siteFiles.llmsTxt.present,
      length: siteFiles.llmsTxt.length,
      url: `${origin}/llms.txt`,
    },
    summary: buildSummary(score, sections, m, robots.blocked.search),
    priorities: buildPriorities(sections),
    psi: options.psi ?? null,
    psiError: options.psiError ?? null,
    notes,
  };
}

/* ───────────── 本文抽出・評価 ───────────── */

function contentRows(m: PageMeasurements): ReportRow[] {
  const noisePercent = Math.round(m.noiseRatio * 1000) / 10;
  return [
    {
      item: "文字数ボリューム",
      status: statusFrom(m.mainTextChars, T.contentGood, T.contentFair),
      content: `本文 ${m.mainTextChars.toLocaleString("ja-JP")} 文字（空白・記号を除く）`,
      note:
        m.mainTextChars >= T.contentGood
          ? `${T.contentGood.toLocaleString("ja-JP")} 文字以上あり、AI が引用できる情報量が確保できています。`
          : `AI 検索に引用されるには ${T.contentGood.toLocaleString("ja-JP")} 文字以上が目安です。誰に・何を・いくらで・どんな手順で、といった具体的な情報を書き足してください。`,
    },
    {
      item: "ノイズ除去率",
      status: statusFrom(m.noiseRatio, T.noiseGood, T.noiseFair, false),
      content: `ページ全体 ${m.rawTextChars.toLocaleString("ja-JP")} 文字のうち本文以外が ${noisePercent}%`,
      note:
        m.noiseRatio <= T.noiseGood
          ? "ヘッダー・フッター・サイドバーに対して本文の比率が高く、主題が読み取りやすい状態です。"
          : "ナビゲーションや関連リンクの割合が高い状態です。本文を厚くするか、共通パーツを減らすと主題が伝わりやすくなります。",
    },
    {
      item: "文の読みやすさ",
      // 本文が 0 文字だと averageSentenceChars は既定値の 0 になる。
      // それを「短くて読みやすい」と読むと、測れていない行を満点で加点してしまう
      status: m.sentences === 0 ? "要改善" : statusFrom(m.averageSentenceChars, T.longSentenceChars, T.longSentenceChars * 1.5, false),
      content:
        m.sentences === 0
          ? "本文が無いため測定できません"
          : `平均文長 ${m.averageSentenceChars} 文字（全 ${m.sentences} 文）`,
      note:
        m.sentences === 0
          ? "本文が抽出できないため評価できません。JavaScript でのみ描画されているページは、AI クローラにも同じく空のページとして読まれます。サーバー側で本文を返してください。"
          : m.averageSentenceChars <= T.longSentenceChars
            ? `1 文 ${T.longSentenceChars} 文字以内に収まっており、要点を抜き出しやすい文章です。`
            : `1 文が長いと、AI が回答に引用する際に要点を切り出しにくくなります。${T.longSentenceChars} 文字を目安に文を分けてください。`,
    },
    {
      item: "見出しの間隔",
      // 見出しが 0 個のときは charsPerHeading が本文文字数（本文も 0 なら 0）になる。
      // 「間隔が短い＝適切」と判定されないよう、測れない場合は要改善にする
      status:
        m.headings.length === 0
          ? "要改善"
          : statusFrom(m.charsPerHeading, T.charsPerHeading, T.charsPerHeading * 2, false),
      content:
        m.headings.length === 0
          ? "見出しがありません"
          : `見出し ${m.headings.length} 個、1 見出しあたり本文 ${m.charsPerHeading} 文字`,
      note:
        m.headings.length === 0
          ? `見出しが無いため、1 見出しあたりの文字数は評価できません。${T.charsPerHeading} 文字ごとに 1 つを目安に h2 を置いてください。`
          : m.charsPerHeading <= T.charsPerHeading
            ? "話題ごとに見出しが置かれており、必要な部分だけを引用しやすい構成です。"
            : `${T.charsPerHeading} 文字ごとに 1 つは見出しを置くと、AI が「どの段落が何の話か」を判断しやすくなります。`,
    },
  ];
}

/* ───────────── 見出し構造 ───────────── */

function headingRows(m: PageMeasurements): ReportRow[] {
  return [
    {
      item: "h1 の数",
      status: m.h1Count === 1 ? "適切" : "要改善",
      content: `h1 が ${m.h1Count} 個`,
      note:
        m.h1Count === 1
          ? "ページの主題が 1 つの h1 で示されています。"
          : m.h1Count === 0
            ? "ページの主題を表す h1 を 1 つ置いてください。AI はまず h1 で「このページは何の話か」を判断します。"
            : "最も重要な 1 つだけを h1 にし、残りは h2 以下へ下げてください。",
    },
    {
      item: "見出しの階層",
      status: m.headingSkips === 0 ? "適切" : m.headingSkips === 1 ? "良好" : "要改善",
      content:
        m.headingSkips === 0 ? "階層の飛びはありません" : `階層が ${m.headingSkips} 箇所で飛んでいます`,
      note:
        m.headingSkips === 0
          ? "h1 → h2 → h3 の順に使われており、話題の大小関係が構造として伝わります。"
          : "h2 の次に h4 が来るような飛びがあります。段階的に使うと、AI が文章の構造を正しく読み取れます。",
    },
    {
      item: "小見出しの数",
      status: statusFrom(m.subHeadings, 2, 1),
      content: `h2・h3 が合計 ${m.subHeadings} 個`,
      note:
        m.subHeadings >= 2
          ? "本文が話題ごとに区切られています。"
          : "本文を話題ごとに区切り、h2（必要なら h3）を付けてください。段落の意味が機械にも伝わります。",
    },
    {
      item: "見出しへの主題語の反映",
      status: statusFrom(m.topicOverlap, 0.3, 0.1),
      content:
        m.title && m.h1Count > 0
          ? `title と h1 の語の重なり ${Math.round(m.topicOverlap * 100)}%`
          : "title または h1 が無いため測定できません",
      note:
        m.topicOverlap >= 0.3
          ? "title と h1 が同じ主題を指しており、ページのテーマが一貫しています。"
          : "title と h1 で使う言葉が離れています。同じ主題語を含めると、検索でも AI でもテーマが明確になります。",
    },
  ];
}

/* ───────────── 構造化データ ───────────── */

function structuredDataRows(m: PageMeasurements): ReportRow[] {
  const { blocks, parseErrors, nodes, types } = m.jsonLd;
  const keyTypes = types.filter((t) => KEY_TYPES.includes(t));
  const missing = nodes.filter((n) => n.missing.length > 0);

  return [
    {
      item: "JSON-LD の有無",
      status: statusOf(types.length > 0),
      content: types.length > 0 ? `${blocks} ブロック / @type: ${types.join(", ")}` : "JSON-LD がありません",
      note:
        types.length > 0
          ? "ページの内容を機械が読める形で示せています。"
          : '<script type="application/ld+json"> を追加し、まずは Organization と WebSite から設定してください。',
    },
    {
      item: "主要タイプの有無",
      status: statusFrom(keyTypes.length, 1, 0.5),
      content:
        keyTypes.length > 0
          ? `主要タイプ: ${keyTypes.join(", ")}`
          : "Article / FAQPage / HowTo / Organization / BreadcrumbList / Product のいずれもありません",
      note:
        keyTypes.length > 0
          ? "AI が引用しやすいタイプが設定されています。"
          : "ページの種類に合うタイプ（記事なら Article、Q&A なら FAQPage）を設定すると、AI が用途を理解しやすくなります。",
    },
    {
      item: "必須プロパティ",
      status: nodes.length === 0 ? "要改善" : missing.length === 0 ? "適切" : "良好",
      content:
        nodes.length === 0
          ? "検証できる JSON-LD がありません"
          : missing.length === 0
            ? `${nodes.length} 件のタイプすべてで必須プロパティがそろっています`
            : missing.map((n) => `${n.type}: ${n.missing.join(" / ")} が不足`).join("、"),
      note:
        missing.length === 0
          ? "リッチリザルトの要件を満たしています。"
          : "不足しているプロパティを補ってください。必須項目が欠けている構造化データは検索エンジンに無視されることがあります。",
    },
    {
      item: "文法の正しさ",
      // JSON-LD が 1 つも無いページを「文法が正しい」と褒めない。
      // 検証していないものを満点にすると、構造化データが無いことの減点を
      // この行で打ち消してしまう（上の「必須プロパティ」と同じ扱いにする）
      status: blocks === 0 ? "要改善" : parseErrors === 0 ? "適切" : "要改善",
      content:
        blocks === 0
          ? "JSON-LD が無いため、文法は検証していません"
          : parseErrors === 0
            ? "JSON として正しく読み取れます"
            : `${parseErrors} ブロックがパースできません`,
      note:
        blocks === 0
          ? "構造化データを追加したら、JSON として読める形式になっているかをこの行で確認できます（この行では減点していません）。"
          : parseErrors === 0
            ? "末尾カンマや引用符の不一致はありません。"
            : "JSON として読めない構造化データは完全に無視されます。末尾カンマ・引用符・コメントの混入を確認してください。",
    },
  ];
}

/* ───────────── Head 情報 ───────────── */

function headRows(m: PageMeasurements): ReportRow[] {
  const titleOk = m.title !== null && m.titleChars >= T.titleMin && m.titleChars <= T.titleMax;
  const descOk = m.description !== null && m.descriptionChars >= T.descMin && m.descriptionChars <= T.descMax;
  const ogp = [m.ogTitle, m.ogDescription, m.ogImage].filter(Boolean).length;

  return [
    {
      item: "title",
      status: titleOk ? "適切" : m.title ? "良好" : "要改善",
      content: m.title ? `「${m.title}」（全角換算 ${m.titleChars} 文字）` : "title がありません",
      note: titleOk
        ? "長さも内容も適切です。"
        : m.title
          ? `全角 ${T.titleMin}〜${T.titleMax} 文字に収めると、検索結果で切れずに表示されます。`
          : "<title>ページ名 | サイト名</title> を追加してください。",
    },
    {
      item: "meta description",
      status: descOk ? "適切" : m.description ? "良好" : "要改善",
      content: m.description ? `全角換算 ${m.descriptionChars} 文字` : "meta description がありません",
      note: descOk
        ? "ページの要約として適切な長さです。"
        : m.description
          ? `全角 ${T.descMin}〜${T.descMax} 文字が目安です。`
          : "AI 検索はここをページの要約として参照します。要点を 1〜2 文で書いてください。",
    },
    {
      item: "canonical",
      status: statusOf(Boolean(m.canonical)),
      content: m.canonical ?? "canonical がありません",
      note: m.canonical
        ? "正規 URL が宣言されています。"
        : '<link rel="canonical" href="正式なURL"> を追加してください。同じ内容が複数 URL に分かれると評価が割れます。',
    },
    {
      item: "OGP",
      status: statusFrom(ogp, 3, 2),
      content: `og:title ${m.ogTitle ? "あり" : "なし"} / og:description ${m.ogDescription ? "あり" : "なし"} / og:image ${m.ogImage ? "あり" : "なし"}`,
      note:
        ogp === 3
          ? "SNS 共有時の表示情報がそろっています。AI クローラも要約の補助に参照します。"
          : "og:title・og:description・og:image を <head> に追加してください。",
    },
    {
      item: "言語の宣言",
      status: m.lang ? "適切" : "要改善",
      content: m.lang
        ? `lang="${m.lang}"${m.hreflang.length > 0 ? ` / hreflang ${m.hreflang.length} 件` : ""}`
        : "html の lang 属性がありません",
      note: m.lang
        ? "日本語ページとして正しく扱われます。"
        : '<html lang="ja"> を設定してください。日本語の質問に対して引用されやすくなります。',
    },
    {
      item: "公開日・更新日",
      status: m.publishedAt || m.modifiedAt ? "適切" : "良好",
      content:
        m.publishedAt || m.modifiedAt
          ? `公開 ${m.publishedAt ?? "—"} / 更新 ${m.modifiedAt ?? "—"}`
          : "公開日・更新日が見つかりません",
      note:
        m.publishedAt || m.modifiedAt
          ? "情報がいつ時点のものかが機械にも伝わります。"
          : "article:published_time や JSON-LD の datePublished / dateModified を入れると、情報の新しさを示せます（記事以外では必須ではありません）。",
    },
  ];
}

/* ───────────── セマンティックタグ ───────────── */

function semanticRows(m: PageMeasurements): ReportRow[] {
  const divRatio = m.elementCount > 0 ? m.divCount / m.elementCount : 0;
  const used = Object.entries(m.semantic).filter(([, count]) => count > 0);

  return [
    {
      item: "main 要素",
      status: statusOf(m.semantic.main > 0),
      content: m.semantic.main > 0 ? `main が ${m.semantic.main} 個` : "main がありません",
      note:
        m.semantic.main > 0
          ? "ページの主要部分がどこかを機械に示せています。"
          : "本文全体を <main> で囲むと、AI が本文とナビゲーションを区別できます。",
    },
    {
      item: "article / section",
      status: m.semantic.article > 0 ? "適切" : m.semantic.section > 0 ? "良好" : "要改善",
      content: `article ${m.semantic.article} 個 / section ${m.semantic.section} 個`,
      note:
        m.semantic.article > 0
          ? "独立した内容のまとまりが示されています。"
          : "記事や独立した内容は <article>、話題の区切りは <section> で囲んでください。",
    },
    {
      item: "nav / header / footer",
      status: statusFrom(
        [m.semantic.nav, m.semantic.header, m.semantic.footer].filter((n) => n > 0).length,
        3,
        2,
      ),
      content: `nav ${m.semantic.nav} 個 / header ${m.semantic.header} 個 / footer ${m.semantic.footer} 個`,
      note:
        m.semantic.nav > 0 && m.semantic.header > 0 && m.semantic.footer > 0
          ? "本文以外の共通部分が明示され、本文の抽出精度が上がります。"
          : "ナビゲーション・ヘッダー・フッターを対応する要素で囲むと、本文以外を機械が除外できます。",
    },
    {
      item: "div への依存",
      // body に要素が無いと divRatio が 0 になり「適切」と出てしまうため、測れない場合は要改善
      status: m.elementCount === 0 ? "要改善" : statusFrom(divRatio, 0.4, 0.6, false),
      content:
        m.elementCount === 0
          ? "body に要素がないため測定できません"
          : `全 ${m.elementCount} 要素のうち div が ${m.divCount} 個（${Math.round(divRatio * 100)}%）${
              used.length > 0 ? `／使用中の意味のある要素: ${used.map(([tag]) => tag).join(", ")}` : ""
            }`,
      note:
        m.elementCount === 0
          ? "HTML に中身がありません。JavaScript でのみ描画されている場合、AI クローラにも同じ空のページとして読まれます。"
          : divRatio <= 0.4
            ? "意味のある要素が使われており、構造が読み取れます。"
            : "div の割合が高い状態です。見出し・リスト・表・article などの要素に置き換えると、内容の意味が機械に伝わります。",
    },
  ];
}

/* ───────────── 内部リンク構造 ───────────── */

function linkRows(m: PageMeasurements): ReportRow[] {
  const vagueRatio = m.internalLinks + m.externalLinks > 0
    ? m.vagueAnchors / (m.internalLinks + m.externalLinks)
    : 0;

  return [
    {
      item: "内部リンク数",
      status: statusFrom(m.internalLinks, 10, 3),
      content: `内部リンク ${m.internalLinks} 本 / 外部リンク ${m.externalLinks} 本`,
      note:
        m.internalLinks >= 10
          ? "サイト内の関連ページへ十分に案内できています。"
          : "関連するページへのリンクを増やしてください。リンクはクローラの巡回路であり、ページ同士の関係を伝える手がかりです。",
    },
    {
      item: "本文内のリンク",
      status: statusFrom(m.bodyLinks, T.bodyLinksGood, T.bodyLinksFair),
      content: `本文（main / article）の中に ${m.bodyLinks} 本`,
      note:
        m.bodyLinks >= T.bodyLinksGood
          ? "文脈のある位置からリンクされており、関連性が伝わります。"
          : `ナビゲーション以外に、本文中から関連ページへ ${T.bodyLinksGood} 本以上リンクしてください。`,
    },
    {
      item: "アンカーテキストの具体性",
      // リンクが 0 本だと vagueRatio も 0 になり「具体的で適切」と出てしまう。
      // 測れていない行を満点にしないため、他の行と同じく要改善にする
      status: m.internalLinks + m.externalLinks === 0 ? "要改善" : statusFrom(vagueRatio, 0.1, 0.25, false),
      content:
        m.internalLinks + m.externalLinks === 0
          ? "リンクがありません"
          : `「こちら」など内容の分からないリンクが ${m.vagueAnchors} 本（${Math.round(vagueRatio * 100)}%）`,
      note:
        m.internalLinks + m.externalLinks === 0
          ? "リンクが無いため評価できません。関連ページへのリンクを置き、リンク先の内容が分かる文言を付けてください。"
          : vagueRatio <= 0.1
            ? "リンク先の内容がテキストから分かります。"
            : "「こちら」ではなく「料金プランを見る」のように、リンク先の内容を書いてください。AI はアンカーテキストでリンク先の主題を判断します。",
    },
  ];
}

/* ───────────── robots・llms ───────────── */

function robotsRows(
  m: PageMeasurements,
  robots: ReturnType<typeof evaluateAiBots>,
  siteFiles: SiteFiles,
  origin: string,
  pageUrl: string,
): ReportRow[] {
  const searchBlocked = robots.blocked.search;
  const trainingBlocked = robots.blocked.training;
  // サイト内検索の結果・買い物かご・ログイン後の画面などは、検索に載せない方が正しい。
  // noindex も robots.txt での拒否も「要改善」にはしない（判定は page-kind.ts）。
  // ただしサイト全体が拒否されている（Disallow: /）ときは本物の問題なので、
  // トップページが許可されている場合だけ意図した拒否とみなす。
  const notForSearchPage = notForSearch(pageUrl);
  const intentionalNoindex = m.noindex ? notForSearchPage : null;
  const intendedBlock =
    notForSearchPage !== null &&
    searchBlocked > 0 &&
    evaluateAiBots(siteFiles.robotsTxt, `${origin}/`, `${origin}/robots.txt`).blocked.search === 0
      ? notForSearchPage
      : null;

  return [
    {
      item: "検索用 AI クローラの許可",
      status:
        searchBlocked === 0 || intendedBlock
          ? "適切"
          : searchBlocked < robots.total.search
            ? "良好"
            : "要改善",
      content:
        searchBlocked === 0
          ? `${robots.total.search} 種すべて許可（OAI-SearchBot・Claude-SearchBot・PerplexityBot・Googlebot など）`
          : `${robots.total.search} 種のうち ${searchBlocked} 種を拒否：${robots.bots
              .filter((b) => b.purpose === "search" && !b.allowed)
              .map((b) => b.ua)
              .join(", ")}${intendedBlock ? ` — ${intendedBlock.label}` : ""}`,
      note: intendedBlock
        ? `${intendedBlock.reason}robots.txt で拒否したままで問題ありません（トップページは許可されています）。`
        : searchBlocked === 0
          ? "AI 検索の結果に引用される経路が確保されています。"
          : "検索用クローラを拒否すると、AI 検索の回答に載る機会そのものを失います。robots.txt の Disallow を見直してください。",
    },
    {
      item: "学習用 AI クローラの扱い",
      // 学習を断るのは正当な選択なので、拒否していても「要改善」にはしない
      status: trainingBlocked === 0 ? "適切" : "良好",
      content:
        trainingBlocked === 0
          ? `${robots.total.training} 種すべて許可`
          : `${robots.total.training} 種のうち ${trainingBlocked} 種を拒否：${robots.bots
              .filter((b) => b.purpose === "training" && !b.allowed)
              .map((b) => b.ua)
              .join(", ")}`,
      note:
        trainingBlocked === 0
          ? "学習用クローラも許可しており、モデルの知識に含まれる可能性があります。"
          : "学習用クローラの拒否は方針として妥当な選択です（この判定は減点ではありません）。検索用クローラまで巻き込んで拒否していないかだけ確認してください。",
    },
    {
      item: "llms.txt",
      status: siteFiles.llmsTxt.present ? "適切" : "要改善",
      content: siteFiles.llmsTxt.present
        ? `${origin}/llms.txt（${siteFiles.llmsTxt.length.toLocaleString("ja-JP")} 文字）`
        : `${origin}/llms.txt がありません`,
      note: siteFiles.llmsTxt.present
        ? "サイトの概要と主要ページを AI 向けに示せています。"
        : "サイト名・概要・主要ページの一覧を Markdown で書いた /llms.txt を置くと、AI がサイト構造を理解しやすくなります（このツールの「llms.txt 生成」で作成できます）。",
    },
    {
      item: "meta robots",
      status: !m.noindex || intentionalNoindex ? "適切" : "要改善",
      content: m.noindex
        ? `noindex が指定されています（${m.metaRobots || m.xRobotsTag}）${intentionalNoindex ? ` — ${intentionalNoindex.label}` : ""}`
        : `noindex はありません${m.metaRobots ? `（robots="${m.metaRobots}"）` : ""}`,
      note: !m.noindex
        ? "検索エンジンと AI 検索の両方に登録できる状態です。"
        : intentionalNoindex
          ? `${intentionalNoindex.reason}noindex のままにしておくのが正しい設定です。`
          : "このページは検索にも AI 検索にも登録されません。公開したいページであれば noindex を外してください。",
    },
  ];
}

/* ───────────── 画像 alt ───────────── */

function imageRows(m: PageMeasurements): ReportRow[] {
  if (m.images === 0) {
    return [
      {
        item: "alt 充足率",
        // 画像が無いページで減点しない（配点が実質的にずれるのを避ける）
        status: "適切",
        content: "画像がありません",
        note: "画像を追加する場合は、装飾以外のすべてに alt を付けてください。",
      },
    ];
  }
  return [
    {
      item: "alt 充足率",
      status: statusFrom(m.altCoverage, T.altGood, T.altFair),
      content: `画像 ${m.images} 枚のうち alt あり ${m.imagesWithAlt} 枚（${Math.round(m.altCoverage * 100)}%）`,
      note:
        m.altCoverage >= T.altGood
          ? "ほぼすべての画像に代替テキストがあります。"
          : 'alt の無い画像に説明を付けてください。装飾目的の画像は alt="" と明示します。',
    },
    {
      item: "説明的な alt",
      status: statusFrom(m.imagesWithDescriptiveAlt / m.images, 0.7, 0.4),
      content: `6 文字以上の alt がある画像 ${m.imagesWithDescriptiveAlt} 枚 / ${m.images} 枚`,
      note:
        m.imagesWithDescriptiveAlt / m.images >= 0.7
          ? "画像の内容が文字だけでも伝わります。"
          : "「画像」「写真」のような alt ではなく、何が写っているかを短く書いてください。AI は alt から画像の内容を読み取ります。",
    },
  ];
}

/* ───────────── 総評と優先対応 ───────────── */

function buildSummary(
  score: number,
  sections: readonly ReportSection[],
  m: PageMeasurements,
  searchBlocked: number,
): string[] {
  const sorted = [...sections].sort((a, b) => b.ratio - a.ratio);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const improvable = sections.flatMap((s) => s.rows.filter((r) => r.status === "要改善")).length;

  const lines: string[] = [
    `AI フレンドリー度は 100 点満点中 ${score} 点（${scoreLabelOf(score)}）です。最も評価が高いのは「${best.label}」（${best.points} / ${best.weight} 点）でした。`,
  ];

  if (improvable === 0) {
    lines.push("要改善と判定された項目はありません。現状の構成を保ちつつ、本文の更新頻度を上げていくとさらに引用されやすくなります。");
  } else {
    lines.push(
      `改善余地が最も大きいのは「${worst.label}」（${worst.points} / ${worst.weight} 点）で、全体では ${improvable} 項目が「要改善」です。`,
    );
  }

  if (searchBlocked > 0) {
    lines.push(
      `robots.txt で検索用 AI クローラを ${searchBlocked} 種拒否しています。ここを解放しない限り、他の改善は AI 検索の結果に反映されません。`,
    );
  } else if (m.mainTextChars < T.contentGood) {
    lines.push(
      `本文が ${m.mainTextChars.toLocaleString("ja-JP")} 文字と少なめです。まず情報量を ${T.contentGood.toLocaleString("ja-JP")} 文字以上に増やすことが、引用されるための近道です。`,
    );
  } else {
    lines.push("AI クローラのアクセスと本文量は確保できています。構造（見出し・構造化データ）を整えると、引用時の精度が上がります。");
  }

  return lines;
}

/** 「配点 × 落とした割合」が大きいセクションから 3 件 */
function buildPriorities(sections: readonly ReportSection[]): PageReport["priorities"] {
  return sections
    .map((section) => ({ section, loss: section.weight * (1 - section.ratio) }))
    .filter((entry) => entry.loss > 0)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .map(({ section, loss }) => {
      // 減点している行を代表にする。「要改善」が無くても「良好」で減点している
      // ことがあるので、そこまで見てから最後に先頭行へ落とす。
      // ここを rows[0] に直接落とすと、満点の「適切」な行を改善提案として
      // 出してしまう（合格している内容が「対応すると +N 点」と表示される）。
      const worstRow =
        section.rows.find((r) => r.status === "要改善") ??
        section.rows.find((r) => r.status === "良好") ??
        section.rows[0];
      return {
        title: `${SECTION_LABELS[section.id]}：${worstRow?.item ?? "全体"}`,
        why: `${worstRow?.note ?? ""}（対応すると最大 +${Math.round(loss * 10) / 10} 点）`,
        section: section.id as SectionId,
      };
    });
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
