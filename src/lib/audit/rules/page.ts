/**
 * ページ単位のチェックルール（純関数）。
 *
 * 1 ルール = 1 関数、入力は解析済みの AuditPage とサイト情報だけ。
 * DOM もネットワークもここには出てこないので、HTML の断片から作った
 * AuditPage を渡すだけでテストできる。閾値は config.ts の 1 箇所にある。
 */
import { notForSearch } from "@/lib/analyzer/page-kind";
import { AUDIT_THRESHOLDS } from "../config";
import { fullWidthCount } from "../parse";
import type { AuditContext, AuditPage, Issue, PageRule } from "../types";
import { issue, listUrls, pathOnly } from "./helpers";

const T = AUDIT_THRESHOLDS;

/* ───────────── タイトルタグ ───────────── */

export const ruleTitle: PageRule = (page) => {
  if (!page.title) {
    return [
      issue(
        "TITLE_MISSING",
        "タイトルタグ",
        "error",
        page.url,
        "<title> がない、または空です",
        "<head> に <title>ページ名 | サイト名</title> を追加してください。検索結果と AI の回答の両方で、ページを識別する最初の手がかりになります。",
      ),
    ];
  }
  const chars = fullWidthCount(page.title);
  if (chars < T.titleMinWidth) {
    return [
      issue(
        "TITLE_SHORT",
        "タイトルタグ",
        "warning",
        page.url,
        `title が短すぎます（全角換算 ${chars} 文字 / 目安 ${T.titleMinWidth} 文字以上）：「${page.title}」`,
        `「何のページか + サイト名」の形にして、全角 ${T.titleMinWidth}〜${T.titleMaxWidth} 文字に収めてください。`,
      ),
    ];
  }
  if (chars > T.titleMaxWidth) {
    return [
      issue(
        "TITLE_LONG",
        "タイトルタグ",
        "warning",
        page.url,
        `title が長すぎます（全角換算 ${chars} 文字 / 目安 ${T.titleMaxWidth} 文字以下）`,
        `検索結果では全角 30〜35 文字程度で切れます。重要な語を前半に置き、全角 ${T.titleMaxWidth} 文字以内に収めてください。`,
      ),
    ];
  }
  return [];
};

/* ───────────── メタタグ ───────────── */

export const ruleMetaDescription: PageRule = (page) => {
  if (!page.description) {
    return [
      issue(
        "META_DESC_MISSING",
        "メタタグ",
        "error",
        page.url,
        "meta description がありません",
        `<meta name="description" content="..."> を全角 ${T.descMinWidth}〜${T.descMaxWidth} 文字で追加してください。AI 検索はここをページの要約として参照します。`,
      ),
    ];
  }
  const chars = fullWidthCount(page.description);
  if (chars < T.descMinWidth) {
    return [
      issue(
        "META_DESC_SHORT",
        "メタタグ",
        "warning",
        page.url,
        `meta description が短すぎます（全角換算 ${chars} 文字 / 目安 ${T.descMinWidth} 文字以上）`,
        `ページの要点（誰に・何を・どうする）を全角 ${T.descMinWidth}〜${T.descMaxWidth} 文字で書いてください。`,
      ),
    ];
  }
  if (chars > T.descMaxWidth) {
    return [
      issue(
        "META_DESC_LONG",
        "メタタグ",
        "warning",
        page.url,
        `meta description が長すぎます（全角換算 ${chars} 文字 / 目安 ${T.descMaxWidth} 文字以下）`,
        `検索結果では途中で切れます。全角 ${T.descMaxWidth} 文字以内に要点をまとめてください。`,
      ),
    ];
  }
  return [];
};

/* ───────────── 基本的な設定 ───────────── */

export const ruleMetaRefresh: PageRule = (page) => {
  if (!page.metaRefresh) return [];
  return [
    issue(
      "META_REFRESH",
      "基本的な設定",
      "warning",
      page.url,
      `<meta http-equiv="refresh" content="${page.metaRefresh}"> が設定されています`,
      "meta refresh による転送は検索エンジンに正しく伝わりません。恒久的な移転はサーバー側の 301 リダイレクトに置き換えてください。",
    ),
  ];
};

export const ruleViewport: PageRule = (page) =>
  page.hasViewport
    ? []
    : [
        issue(
          "VIEWPORT_MISSING",
          "基本的な設定",
          "error",
          page.url,
          "viewport の meta タグがありません",
          '<meta name="viewport" content="width=device-width, initial-scale=1"> を <head> に追加してください。無いとスマートフォンで文字が極端に小さく表示されます。',
        ),
      ];

export const ruleLang: PageRule = (page) =>
  page.lang
    ? []
    : [
        issue(
          "LANG_MISSING",
          "基本的な設定",
          "warning",
          page.url,
          "<html> に lang 属性がありません",
          '<html lang="ja"> のように言語を宣言してください。AI が日本語ページとして正しく扱い、日本語の質問に対して引用されやすくなります。',
        ),
      ];

export const ruleFavicon: PageRule = (page, context) => {
  if (page.hasFaviconLink || context.faviconExists) return [];
  return [
    issue(
      "FAVICON_MISSING",
      "基本的な設定",
      "info",
      page.url,
      "link[rel=icon] も /favicon.ico もありません",
      "サイトのアイコン（favicon）を用意し、<link rel=\"icon\" href=\"/favicon.ico\"> を追加してください。検索結果やブラウザのタブでサイトを識別しやすくなります。",
    ),
  ];
};

export const ruleUrlShape: PageRule = (page) => {
  const issues: Issue[] = [];
  let parsed: URL | null = null;
  try {
    parsed = new URL(page.url);
  } catch {
    parsed = null;
  }
  if (!parsed) return issues;

  if (/[A-Z]/.test(parsed.pathname)) {
    issues.push(
      issue(
        "URL_UPPERCASE",
        "基本的な設定",
        "warning",
        page.url,
        `URL のパスに大文字が含まれています（${parsed.pathname}）`,
        "URL は小文字に統一してください。大文字と小文字が混在すると、同じ内容が別ページとして扱われることがあります。",
      ),
    );
  }

  const reasons: string[] = [];
  if (page.url.length > T.maxUrlLength) reasons.push(`長さ ${page.url.length} 文字（目安 ${T.maxUrlLength} 文字以下）`);
  if (/\s|%20/.test(parsed.pathname)) reasons.push("空白が含まれる");
  if (/[^\x00-\x7F]/.test(parsed.pathname)) reasons.push("エンコードされていない日本語が含まれる");
  if (parsed.pathname.includes("_")) reasons.push("単語の区切りにアンダースコアを使っている");
  if ([...parsed.searchParams.keys()].length >= 3) reasons.push("クエリパラメータが 3 つ以上ある");
  if (reasons.length > 0) {
    issues.push(
      issue(
        "URL_BAD",
        "基本的な設定",
        "info",
        page.url,
        `URL の形が推奨から外れています（${reasons.join(" / ")}）`,
        "URL は短く、小文字とハイフンだけで構成し、内容が推測できる英単語にすると、人にも AI にも扱いやすくなります。",
      ),
    );
  }
  return issues;
};

export const ruleStatus: PageRule = (page) => {
  if (page.status >= 500) {
    return [
      issue(
        "STATUS_5XX",
        "基本的な設定",
        "error",
        page.url,
        `サーバーエラーを返しています（HTTP ${page.status}）`,
        "サーバー側のエラーです。アプリケーションのログを確認し、原因を取り除いてください。検索エンジンは 5XX が続くとインデックスから削除します。",
      ),
    ];
  }
  if (page.status >= 400) {
    return [
      issue(
        "STATUS_4XX",
        "基本的な設定",
        "error",
        page.url,
        `ページが見つかりません（HTTP ${page.status}）`,
        "削除したページであれば、リンク元の修正か 301 リダイレクトで移転先へ転送してください。",
      ),
    ];
  }
  return [];
};

export const ruleRedirect: PageRule = (page, context) => {
  if (page.finalUrl === page.url) return [];
  const probe = context.probes[page.url];
  const hops = probe?.hops ?? 1;
  const issues: Issue[] = [
    issue(
      "REDIRECT_3XX",
      "基本的な設定",
      "warning",
      page.url,
      `${page.finalUrl} へリダイレクトされます`,
      "リンクやサイトマップの記載を、転送先の URL に直接書き換えてください。転送が挟まるとクロールの効率が落ちます。",
    ),
  ];
  if (hops >= 2) {
    issues.push(
      issue(
        "REDIRECT_CHAIN",
        "基本的な設定",
        "warning",
        page.url,
        `2 ホップ以上のリダイレクトを経由して ${page.finalUrl} に到達します`,
        "http → https → 正規 URL のように転送が連なっています。最初の転送で最終 URL へ直接送るようにサーバー設定を見直してください。",
      ),
    );
  }
  return issues;
};

export const ruleNoindex: PageRule = (page) => {
  const noindex = page.metaRobots.includes("noindex") || page.xRobotsTag.includes("noindex");
  if (!noindex) return [];
  const source = page.metaRobots.includes("noindex") ? `meta robots="${page.metaRobots}"` : `X-Robots-Tag: ${page.xRobotsTag}`;
  // サイト内検索の結果・買い物かご・ログイン後の画面などは、検索に載せない方が正しい。
  // 事実として残すが警告にはしない（判定は page-kind.ts）
  const intentional = notForSearch(page.url);
  if (intentional) {
    return [
      issue(
        "NOINDEX",
        "基本的な設定",
        "info",
        page.url,
        `${intentional.label}のため、検索結果に出さない指定があります（${source}）`,
        `${intentional.reason}noindex のままで対応は不要です。`,
      ),
    ];
  }
  return [
    issue(
      "NOINDEX",
      "基本的な設定",
      "warning",
      page.url,
      `検索結果に出さない指定があります（${source}）`,
      "公開したいページであれば noindex を外してください。意図的な指定（会員専用ページなど）であれば対応は不要です。",
    ),
  ];
};

export const ruleRobotsBlocked: PageRule = (page, ctx) => {
  if (page.robotsAllowed) return [];
  // サイト内検索の結果ページなどを robots.txt で止めるのも定石。ただしサイト全体が
  // 拒否されている（Disallow: /）ときは本物の問題なので、トップページが許可されて
  // いる場合だけ意図した拒否とみなす（判定は page-kind.ts）
  const intentional = ctx.rootRobotsAllowed ? notForSearch(page.url) : null;
  if (intentional) {
    return [
      issue(
        "ROBOTS_BLOCKED",
        "基本的な設定",
        "info",
        page.url,
        `${intentional.label}のため、robots.txt でクロールが拒否されています`,
        `${intentional.reason}robots.txt で拒否したままで対応は不要です。`,
      ),
    ];
  }
  return [
    issue(
      "ROBOTS_BLOCKED",
      "基本的な設定",
      "error",
      page.url,
      "robots.txt でクロールが拒否されています",
      "robots.txt の Disallow がこの URL に当たっています。公開したいページであれば対象から外してください。robots.txt で拒否したページは検索にも AI 検索にも載りません。",
    ),
  ];
};

export const ruleDepth: PageRule = (page) => {
  if (page.depth === null || page.depth <= T.maxDepth) return [];
  return [
    issue(
      "DEPTH_TOO_DEEP",
      "構造",
      "info",
      page.url,
      `トップから ${page.depth} クリックの深さにあります（目安 ${T.maxDepth} クリック以内）`,
      "重要なページほど浅い階層に置き、一覧ページやパンくずから直接たどれるようにしてください。深いページはクロールされにくくなります。",
    ),
  ];
};

/* ───────────── 見出しタグ ───────────── */

export const ruleH1: PageRule = (page) => {
  if (page.h1.length === 0) {
    return [
      issue(
        "H1_MISSING",
        "見出しタグ",
        "error",
        page.url,
        "h1 見出しがありません",
        "ページの主題を表す h1 を 1 つ置いてください。AI はまず h1 で「このページは何の話か」を判断します。",
      ),
    ];
  }
  if (page.h1.length >= 2) {
    return [
      issue(
        "H1_MULTIPLE",
        "見出しタグ",
        "warning",
        page.url,
        `h1 が ${page.h1.length} 個あります：${page.h1.map((t) => `「${t}」`).join(" ")}`,
        "最も重要な 1 つだけを h1 にし、残りは h2 以下へ下げてください。h1 が複数あると主題が分散して伝わります。",
      ),
    ];
  }
  return [];
};

export const ruleHeadingSkip: PageRule = (page) => {
  if (page.headingSkips === 0) return [];
  return [
    issue(
      "HEADING_SKIP",
      "見出しタグ",
      "warning",
      page.url,
      `見出しの階層が ${page.headingSkips} 箇所で飛んでいます（h2 の次に h4 など）`,
      "h1 → h2 → h3 の順に段階的に使ってください。階層が飛ぶと、AI が話題の大小関係を読み取れません。",
    ),
  ];
};

/* ───────────── コンテンツ ───────────── */

export const ruleContentThin: PageRule = (page) => {
  if (page.mainTextLength >= T.thinContentChars) return [];
  return [
    issue(
      "CONTENT_THIN",
      "コンテンツ",
      "error",
      page.url,
      `本文が ${page.mainTextLength} 文字しかありません（目安 ${T.thinContentChars} 文字以上）`,
      "ページの目的に沿った説明を書き足してください。情報量が少ないページは検索でも AI 検索でも引用されません。",
    ),
  ];
};

export const ruleContentRatio: PageRule = (page) => {
  if (page.textRatio >= T.lowTextRatio) return [];
  const percent = Math.round(page.textRatio * 1000) / 10;
  return [
    issue(
      "CONTENT_LOW_RATIO",
      "コンテンツ",
      "warning",
      page.url,
      `テキストと HTML の比が ${percent}% です（目安 ${T.lowTextRatio * 100}% 以上）`,
      "本文に対して HTML（装飾・スクリプト）が多すぎます。本文を増やすか、不要なマークアップを整理してください。",
    ),
  ];
};

/* ───────────── 画像 ───────────── */

export const ruleImageAlt: PageRule = (page) => {
  if (page.imagesWithoutAlt === 0) return [];
  return [
    issue(
      "IMG_ALT_MISSING",
      "画像",
      "error",
      page.url,
      `alt 属性のない画像が ${page.imagesWithoutAlt} 枚あります（全 ${page.images} 枚）`,
      'すべての img に alt を書いてください。装飾目的の画像は alt="" と明示します。AI は画像そのものではなく alt から内容を読み取ります。',
    ),
  ];
};

export const ruleImageTitle: PageRule = (page) => {
  if (page.images === 0 || page.imagesWithoutTitle === 0) return [];
  return [
    issue(
      "IMG_TITLE_MISSING",
      "画像",
      "info",
      page.url,
      `title 属性のない画像が ${page.imagesWithoutTitle} 枚あります（全 ${page.images} 枚）`,
      "title 属性は補足説明で、必須ではありません（alt が優先）。マウスを乗せたときの説明が必要な画像にだけ付けてください。",
    ),
  ];
};

/* ───────────── カノニカルタグ ───────────── */

export const ruleCanonicalMissing: PageRule = (page) =>
  page.canonical
    ? []
    : [
        issue(
          "CANONICAL_MISSING",
          "カノニカルタグ",
          "info",
          page.url,
          "canonical が設定されていません",
          '<link rel="canonical" href="正式なURL"> を追加してください。www の有無やパラメータ違いで同じ内容が複数 URL に分かれると、評価が分散します。',
        ),
      ];

export const ruleCanonicalBroken: PageRule = (page, context) => {
  if (!page.canonical) return [];
  const target = resolveCanonical(page);
  if (!target) return [];
  const probe = context.probes[target];
  if (!probe || probe.status < 400) return [];
  return [
    issue(
      "CANONICAL_BROKEN",
      "カノニカルタグ",
      "error",
      page.url,
      `canonical の指す ${target} が HTTP ${probe.status} です`,
      "canonical は必ず 200 を返す URL を指す必要があります。存在しない URL を指すと、このページ自体が評価されなくなります。",
    ),
  ];
};

export const ruleCanonicalConflict: PageRule = (page) => {
  const issues: Issue[] = [];
  if (page.canonicalCount >= 2) {
    issues.push(
      issue(
        "CANONICAL_CONFLICT",
        "カノニカルタグ",
        "error",
        page.url,
        `canonical が ${page.canonicalCount} 個あります`,
        "canonical は 1 ページに 1 つだけです。複数あると検索エンジンはすべて無視します。",
      ),
    );
    return issues;
  }
  const canonical = resolveCanonical(page);
  if (canonical && page.ogUrl) {
    const og = safeResolve(page.ogUrl, page.finalUrl);
    if (og && og !== canonical) {
      issues.push(
        issue(
          "CANONICAL_CONFLICT",
          "カノニカルタグ",
          "warning",
          page.url,
          `canonical（${canonical}）と og:url（${og}）が食い違っています`,
          "canonical と og:url は同じ正規 URL を指すよう揃えてください。食い違うと、共有時と検索時で別ページ扱いになることがあります。",
        ),
      );
    }
  }
  return issues;
};

/* ───────────── セキュリティ ───────────── */

export const ruleHttpPage: PageRule = (page) => {
  if (!page.finalUrl.startsWith("http://")) return [];
  return [
    issue(
      "HTTP_PAGE",
      "セキュリティ",
      "error",
      page.url,
      "https ではなく http で配信されています",
      "サーバーに SSL 証明書を設定し、http へのアクセスを https へ 301 リダイレクトしてください。ブラウザは http のページに「保護されていない通信」と表示します。",
    ),
  ];
};

export const ruleMixedContent: PageRule = (page) => {
  if (page.mixedContent.length === 0) return [];
  return [
    issue(
      "MIXED_CONTENT",
      "セキュリティ",
      "error",
      page.url,
      `https のページに http のリソースが ${page.mixedContent.length} 件あります：${listUrls(page.mixedContent)}`,
      "画像・CSS・JavaScript の参照先を https に書き換えてください。ブラウザが読み込みを遮断し、表示が崩れることがあります。",
    ),
  ];
};

/* ───────────── パフォーマンス ───────────── */

export const ruleCompression: PageRule = (page) => {
  if (page.bytes < T.compressionMinBytes) return [];
  const encoding = page.contentEncoding?.toLowerCase() ?? "";
  if (/gzip|br|deflate|zstd/.test(encoding)) return [];
  return [
    issue(
      "NOT_COMPRESSED",
      "パフォーマンス",
      "warning",
      page.url,
      `HTML が圧縮されていません（${Math.round(page.bytes / 1024)} KB、Content-Encoding: ${page.contentEncoding ?? "なし"}）`,
      "サーバーで gzip または Brotli 圧縮を有効にしてください。HTML は多くの場合 1/4 程度まで小さくなり、表示が速くなります。",
    ),
  ];
};

export const rulePageSize: PageRule = (page) => {
  if (page.bytes <= T.maxPageBytes) return [];
  return [
    issue(
      "PAGE_TOO_LARGE",
      "パフォーマンス",
      "warning",
      page.url,
      `HTML が ${Math.round(page.bytes / 1024)} KB あります（目安 ${Math.round(T.maxPageBytes / 1024)} KB 以下）`,
      "1 ページに詰め込みすぎです。ページを分割するか、インラインの CSS / JavaScript を外部ファイルに切り出してください。",
    ),
  ];
};

export const ruleSlowTtfb: PageRule = (page) => {
  if (page.loadMs === null || page.loadMs <= T.slowTtfbMs) return [];
  return [
    issue(
      "SLOW_TTFB",
      "パフォーマンス",
      page.loadMs > T.slowLoadMs ? "warning" : "info",
      page.url,
      `サーバーの応答が遅めです（HTML の取得に ${page.loadMs} ms / 目安 ${T.slowTtfbMs} ms 以下）`,
      "サーバー側のキャッシュ、データベースの問い合わせ、外部 API の呼び出しを見直してください。応答時間は表示速度の下限になります。",
    ),
  ];
};

export const ruleSlowLoad: PageRule = (page) => {
  if (page.loadMs === null || page.loadMs <= T.slowLoadMs) return [];
  return [
    issue(
      "SLOW_LOAD",
      "パフォーマンス",
      "error",
      page.url,
      `HTML の取得に ${page.loadMs} ms かかりました（目安 ${T.slowLoadMs} ms 以下）`,
      "サーバー応答と HTML の転送だけで 3 秒を超えています。表示速度の改善は、まずここから着手してください。",
    ),
  ];
};

/* ───────────── 構造 ───────────── */

export const ruleIframe: PageRule = (page) => {
  if (page.iframes === 0) return [];
  return [
    issue(
      "IFRAME_PRESENT",
      "構造",
      "info",
      page.url,
      `iframe が ${page.iframes} 個あります`,
      "iframe の中身はこのページの内容として評価されません。本文として読ませたい情報は、iframe ではなくページ本体に書いてください。",
    ),
  ];
};

export const ruleDeprecatedTag: PageRule = (page) => {
  if (page.deprecatedTags.length === 0) return [];
  return [
    issue(
      "DEPRECATED_TAG",
      "構造",
      "warning",
      page.url,
      `廃止されたタグを使っています：${page.deprecatedTags.map((t) => `<${t}>`).join(" ")}`,
      "HTML5 で廃止されたタグです。見た目の指定は CSS に、意味のあるマークアップは適切な要素（strong / s / abbr など）に置き換えてください。",
    ),
  ];
};

export const ruleStructuredData: PageRule = (page) => {
  const { blocks, parseErrors, withoutType } = page.jsonLd;
  if (blocks === 0) return [];
  if (parseErrors > 0) {
    return [
      issue(
        "STRUCTURED_DATA_INVALID",
        "構造",
        "error",
        page.url,
        `JSON-LD が ${parseErrors} 件パースできません（全 ${blocks} 件）`,
        "末尾カンマ・引用符の不一致・コメントの混入がないか確認してください。JSON として読めない構造化データは完全に無視されます。",
      ),
    ];
  }
  if (withoutType > 0) {
    return [
      issue(
        "STRUCTURED_DATA_INVALID",
        "構造",
        "warning",
        page.url,
        `JSON-LD に @type がありません（全 ${blocks} 件）`,
        '"@type": "Organization" のように、そのデータが何を表すかを示す @type を必ず書いてください。@type が無いデータは解釈されません。',
      ),
    ];
  }
  return [];
};

export const ruleBrokenInternalLinks: PageRule = (page, context) => {
  const broken: string[] = [];
  for (const link of page.internalLinks) {
    const probe = context.probes[link];
    if (probe && probe.status >= 400) broken.push(`${pathOnly(link)}（HTTP ${probe.status}）`);
  }
  if (broken.length === 0) return [];
  return [
    issue(
      "LINK_BROKEN_INTERNAL",
      "構造",
      "error",
      page.url,
      `リンク切れが ${broken.length} 件あります：${listUrls(broken)}`,
      "リンク先を修正するか、移転先へ 301 リダイレクトしてください。リンク切れは利用者の離脱とクロールの無駄につながります。",
    ),
  ];
};

/** canonical を絶対 URL に直す（相対指定のサイトがあるため） */
export function resolveCanonical(page: AuditPage): string | null {
  if (!page.canonical) return null;
  return safeResolve(page.canonical, page.finalUrl);
}

function safeResolve(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** 実行順（画面のカテゴリ順に近づけてある） */
export const PAGE_RULES: readonly PageRule[] = [
  ruleTitle,
  ruleMetaDescription,
  ruleContentThin,
  ruleContentRatio,
  ruleH1,
  ruleHeadingSkip,
  ruleImageAlt,
  ruleImageTitle,
  ruleCanonicalMissing,
  ruleCanonicalBroken,
  ruleCanonicalConflict,
  ruleMetaRefresh,
  ruleViewport,
  ruleLang,
  ruleFavicon,
  ruleUrlShape,
  ruleStatus,
  ruleRedirect,
  ruleNoindex,
  ruleRobotsBlocked,
  ruleHttpPage,
  ruleMixedContent,
  ruleCompression,
  rulePageSize,
  ruleSlowTtfb,
  ruleSlowLoad,
  ruleIframe,
  ruleDeprecatedTag,
  ruleStructuredData,
  ruleBrokenInternalLinks,
  ruleDepth,
];

/** ページ 1 枚に全ルールを適用する */
export function runPageRules(page: AuditPage, context: AuditContext): Issue[] {
  return PAGE_RULES.flatMap((rule) => rule(page, context));
}
