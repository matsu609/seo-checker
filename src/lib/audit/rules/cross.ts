/**
 * サイト横断のチェックルール（純関数）。
 *
 * クロールが終わってから、ページの集合とサイト情報だけを見て判定する。
 * ページ単位では分からないもの（重複・孤立・canonical の循環・
 * サイトマップとの差分・サイト共通ファイルの有無）をここに集める。
 */
import { AUDIT_THRESHOLDS, MAX_DETAIL_ITEMS } from "../config";
import { signatureSimilarity } from "../similarity";
import type { AuditContext, AuditPage, CrossRule, Issue } from "../types";
import { issue, listUrls, pathOnly } from "./helpers";
import { resolveCanonical } from "./page";

const T = AUDIT_THRESHOLDS;

/** 同じ値を持つページをまとめる（空値は対象外） */
function groupBy(pages: readonly AuditPage[], pick: (p: AuditPage) => string | null): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const page of pages) {
    const key = pick(page)?.trim();
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(page.url);
    else groups.set(key, [page.url]);
  }
  return groups;
}

/** 重複した title を持つページ */
export const ruleDuplicateTitle: CrossRule = (pages) => {
  const issues: Issue[] = [];
  for (const [title, urls] of groupBy(pages, (p) => p.title)) {
    if (urls.length < 2) continue;
    for (const url of urls) {
      issues.push(
        issue(
          "TITLE_DUPLICATE",
          "タイトルタグ",
          "error",
          url,
          `同じ title「${title}」のページが ${urls.length} 件あります：${listUrls(urls.filter((u) => u !== url))}`,
          "ページごとに内容を表す固有の title を付けてください。同じ title のページは、検索エンジンに区別されず評価が分散します。",
        ),
      );
    }
  }
  return issues;
};

/** 重複した meta description を持つページ */
export const ruleDuplicateDescription: CrossRule = (pages) => {
  const issues: Issue[] = [];
  for (const urls of groupBy(pages, (p) => p.description).values()) {
    if (urls.length < 2) continue;
    for (const url of urls) {
      issues.push(
        issue(
          "META_DESC_DUPLICATE",
          "メタタグ",
          "warning",
          url,
          `同じ meta description のページが ${urls.length} 件あります：${listUrls(urls.filter((u) => u !== url))}`,
          "description はページごとに書き分けてください。使い回すと、検索結果でどのページを選べばよいか伝わりません。",
        ),
      );
    }
  }
  return issues;
};

/**
 * 本文が重複しているページ。
 * まず完全一致（指紋）でまとめ、残りを MinHash 署名の総当たりで比較する。
 */
export const ruleDuplicateContent: CrossRule = (pages, context) => {
  const issues: Issue[] = [];
  const targets = pages.filter((p) => p.mainTextLength >= T.thinContentChars);
  const paired = new Set<string>();

  // 1. 本文が完全に一致するもの
  for (const [, urls] of groupBy(targets, (p) => p.contentHash || null)) {
    if (urls.length < 2) continue;
    for (const url of urls) {
      paired.add(url);
      issues.push(
        issue(
          "CONTENT_DUPLICATE",
          "コンテンツ",
          "error",
          url,
          `本文が完全に一致するページが ${urls.length} 件あります：${listUrls(urls.filter((u) => u !== url))}`,
          "内容が同じページは 1 つに統合し、残りは canonical か 301 リダイレクトで正規 URL にまとめてください。",
        ),
      );
    }
  }

  // 2. ほぼ同じもの（Jaccard 係数の近似が閾値以上）
  const rest = targets.filter((p) => !paired.has(p.url));
  const similar = new Map<string, string[]>();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    const sigA = context.signatures[a.url];
    if (!sigA || sigA.length === 0) continue;
    for (let j = i + 1; j < rest.length; j += 1) {
      const b = rest[j];
      const sigB = context.signatures[b.url];
      if (!sigB || sigB.length === 0) continue;
      if (signatureSimilarity(sigA, sigB) < T.duplicateContentRatio) continue;
      pushPair(similar, a.url, b.url);
      pushPair(similar, b.url, a.url);
    }
  }
  for (const [url, others] of similar) {
    issues.push(
      issue(
        "CONTENT_DUPLICATE",
        "コンテンツ",
        "warning",
        url,
        `本文が ${Math.round(T.duplicateContentRatio * 100)}% 以上一致するページが ${others.length} 件あります：${listUrls(others)}`,
        "似た内容のページは統合するか、それぞれの切り口を明確にして書き分けてください。重複したページは互いに評価を奪い合います。",
      ),
    );
  }
  return issues;
};

function pushPair(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * canonical の循環（A → B → A）。
 * canonical を辺とする有向グラフで、たどった先が出発点に戻る経路を探す。
 */
export const ruleCanonicalLoop: CrossRule = (pages) => {
  const canonicalOf = new Map<string, string>();
  for (const page of pages) {
    const target = resolveCanonical(page);
    if (target && target !== page.url) canonicalOf.set(page.url, target);
  }

  const issues: Issue[] = [];
  const reported = new Set<string>();
  for (const start of canonicalOf.keys()) {
    if (reported.has(start)) continue;
    const path: string[] = [start];
    const seen = new Set<string>([start]);
    let current: string | undefined = canonicalOf.get(start);
    while (current && !seen.has(current)) {
      path.push(current);
      seen.add(current);
      current = canonicalOf.get(current);
    }
    if (!current) continue;
    // current が既に通った URL = 閉路。閉路に含まれる URL だけを報告する
    const loopStart = path.indexOf(current);
    if (loopStart < 0) continue;
    const loop = path.slice(loopStart);
    if (loop.length < 2) continue;
    for (const url of loop) {
      if (reported.has(url)) continue;
      reported.add(url);
      issues.push(
        issue(
          "CANONICAL_LOOP",
          "カノニカルタグ",
          "error",
          url,
          `canonical が循環しています：${[...loop, loop[0]].map(pathOnly).join(" → ")}`,
          "どのページが正規かを 1 つに決め、循環している canonical を修正してください。循環していると検索エンジンはすべての canonical を無視します。",
        ),
      );
    }
  }
  return issues;
};

/** 内部リンクが 1 本も向いていないページ（サイトマップにはある） */
export const ruleOrphanPage: CrossRule = (pages, context) => {
  const inDegree = new Map<string, number>();
  for (const page of pages) inDegree.set(page.url, 0);
  for (const page of pages) {
    for (const link of page.internalLinks) {
      if (link === page.url) continue; // 自己リンクは入次数に数えない
      if (inDegree.has(link)) inDegree.set(link, (inDegree.get(link) ?? 0) + 1);
    }
  }
  const issues: Issue[] = [];
  for (const page of pages) {
    if (page.url === context.entryUrl) continue; // 入力 URL は起点なので対象外
    if ((inDegree.get(page.url) ?? 0) > 0) continue;
    issues.push(
      issue(
        "ORPHAN_PAGE",
        "構造",
        "warning",
        page.url,
        "このページへの内部リンクが 1 本もありません（サイトマップまたは入力からのみ到達）",
        "一覧ページ・関連記事・パンくずなどから、このページへのリンクを張ってください。リンクが無いページはクロールされにくく、重要度も低く見積もられます。",
      ),
    );
  }
  return issues;
};

/** robots.txt / sitemap.xml / llms.txt の有無（サイト単位。URL はオリジン） */
export const ruleSiteFiles: CrossRule = (_pages, context) => {
  const issues: Issue[] = [];
  if (!context.robotsExists) {
    issues.push(
      issue(
        "ROBOTS_MISSING",
        "基本的な設定",
        "warning",
        context.origin,
        `${context.origin}/robots.txt が見つかりません`,
        "robots.txt を置き、サイトマップの場所（Sitemap: 行）を書いてください。クローラが最初に読むファイルで、無いと巡回の手がかりが減ります。",
      ),
    );
  }
  if (!context.sitemapFound) {
    issues.push(
      issue(
        "SITEMAP_MISSING",
        "基本的な設定",
        "error",
        context.origin,
        "sitemap.xml が見つかりません（robots.txt の Sitemap 行と定番の場所を確認）",
        "sitemap.xml を生成してサイトのルートに置き、robots.txt に Sitemap: の行を追加してください。新しいページが見つけられるようになります。",
      ),
    );
  }
  if (!context.siteFiles.llmsTxt.present) {
    issues.push(
      issue(
        "LLMS_TXT_MISSING",
        "基本的な設定",
        "warning",
        context.origin,
        `${context.origin}/llms.txt が見つかりません`,
        "llms.txt は、サイトの概要と主要ページの一覧を AI 向けに Markdown で書くファイルです。サイトのルートに置くと、AI がサイト構造を把握しやすくなります。「llms.txt 生成」ツールで作成できます。",
      ),
    );
  } else if (!context.siteFiles.llmsFullTxt.present) {
    // llms.txt があるサイトにだけ、次の一手として案内する（任意設定）
    issues.push(
      issue(
        "LLMS_FULL_TXT_MISSING",
        "基本的な設定",
        "info",
        context.origin,
        `${context.origin}/llms-full.txt がありません（任意）`,
        "llms-full.txt は主要コンテンツの全文を 1 ファイルにまとめたものです（設定は任意）。ドキュメントやサービス説明が多いサイトでは、AI が一度に全体を読めるようになります。",
      ),
    );
  }
  return issues;
};

/**
 * 検証のために追加取得した URL の結果（クロール対象にならなかった URL）。
 * リンク切れの原因になっている URL を、リンク元とは別に 1 件ずつ出す。
 */
export const ruleProbedStatuses: CrossRule = (pages, context) => {
  const crawled = new Set(pages.map((p) => p.url));
  const issues: Issue[] = [];
  for (const [url, probe] of Object.entries(context.probes)) {
    if (crawled.has(url)) continue;
    if (probe.status >= 500) {
      issues.push(
        issue(
          "STATUS_5XX",
          "基本的な設定",
          "error",
          url,
          `サーバーエラーを返しています（HTTP ${probe.status}）`,
          "サーバー側のエラーです。ログを確認して原因を取り除いてください。",
        ),
      );
    } else if (probe.status >= 400) {
      issues.push(
        issue(
          "STATUS_4XX",
          "基本的な設定",
          "error",
          url,
          `ページが見つかりません（HTTP ${probe.status}）`,
          "リンク元を修正するか、移転先へ 301 リダイレクトしてください。",
        ),
      );
    } else if (probe.hops >= 2) {
      issues.push(
        issue(
          "REDIRECT_CHAIN",
          "基本的な設定",
          "warning",
          url,
          `2 ホップ以上のリダイレクトを経由して ${probe.finalUrl} に到達します`,
          "最初の転送で最終 URL へ直接送るようにサーバー設定を見直してください。",
        ),
      );
    }
  }
  return issues;
};

/** サイトマップとクロール結果の差分（情報として出す） */
export const ruleSitemapDiff: CrossRule = (pages, context) => {
  if (!context.sitemapFound || context.sitemapUrls.length === 0) return [];
  const crawled = new Set(pages.map((p) => p.url));
  const sitemap = new Set(context.sitemapUrls);
  const issues: Issue[] = [];

  const dead: string[] = [];
  for (const url of sitemap) {
    const probe = context.probes[url];
    if (probe && probe.status >= 400) dead.push(`${pathOnly(url)}（HTTP ${probe.status}）`);
  }
  if (dead.length > 0) {
    issues.push(
      issue(
        "SITEMAP_MISSING",
        "基本的な設定",
        "warning",
        context.origin,
        `サイトマップに載っているのに取得できない URL が ${dead.length} 件あります：${listUrls(dead)}`,
        "削除したページはサイトマップから外してください。存在しない URL が並んでいると、サイトマップ全体の信頼度が下がります。",
      ),
    );
  }

  const notListed = [...crawled].filter((url) => !sitemap.has(url));
  if (notListed.length > 0) {
    issues.push(
      issue(
        "SITEMAP_MISSING",
        "基本的な設定",
        "info",
        context.origin,
        `サイトマップに載っていないページが ${notListed.length} 件あります：${listUrls(notListed.map(pathOnly), MAX_DETAIL_ITEMS)}`,
        "公開したいページはサイトマップにも載せてください。内部リンクからしか辿れないページは発見が遅れます。",
      ),
    );
  }
  return issues;
};

export const CROSS_RULES: readonly CrossRule[] = [
  ruleDuplicateTitle,
  ruleDuplicateDescription,
  ruleDuplicateContent,
  ruleCanonicalLoop,
  ruleOrphanPage,
  ruleSiteFiles,
  ruleProbedStatuses,
  ruleSitemapDiff,
];

export function runCrossRules(pages: readonly AuditPage[], context: AuditContext): Issue[] {
  return CROSS_RULES.flatMap((rule) => rule(pages, context));
}
