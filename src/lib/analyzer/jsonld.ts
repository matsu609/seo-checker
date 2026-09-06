import * as cheerio from "cheerio";
import { check, optionalCheck } from "./check";
import type { CheckResult } from "./types";

export interface JsonLdInfo {
  /** script タグの数 */
  blocks: number;
  /** パースに失敗したブロック数 */
  parseErrors: number;
  /** 出現したすべての @type（重複なし） */
  types: string[];
  /** Organization 系に sameAs があるか */
  hasSameAs: boolean;
  /** WebSite に SearchAction（potentialAction）があるか */
  hasSearchAction: boolean;
}

const ORG_TYPES = new Set([
  "Organization",
  "LocalBusiness",
  "Corporation",
  "Person",
  "Store",
  "Restaurant",
  "MedicalBusiness",
  "ProfessionalService",
  "EducationalOrganization",
  "GovernmentOrganization",
  "NGO",
]);

const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting", "TechArticle"]);

/**
 * JSON-LD を抽出して @type を再帰的に集める。
 * `@graph` 配列・入れ子・複数 script タグ・配列の @type をすべて吸収する。
 */
export function extractJsonLd($: cheerio.CheerioAPI): JsonLdInfo {
  const info: JsonLdInfo = {
    blocks: 0,
    parseErrors: 0,
    types: [],
    hasSameAs: false,
    hasSearchAction: false,
  };
  const types = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    info.blocks += 1;
    const raw = $(el).text();
    if (!raw.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      // 末尾カンマなど軽微な壊れ方は救済しない。エラーとして記録する
      info.parseErrors += 1;
      return;
    }
    walk(data, (node) => {
      const t = node["@type"];
      const nodeTypes = Array.isArray(t) ? t : t ? [t] : [];
      for (const name of nodeTypes) {
        if (typeof name === "string") types.add(stripPrefix(name));
      }
      const localTypes = nodeTypes.map((n) => (typeof n === "string" ? stripPrefix(n) : ""));
      if (localTypes.some((n) => ORG_TYPES.has(n)) && hasNonEmpty(node["sameAs"])) {
        info.hasSameAs = true;
      }
      if (localTypes.includes("WebSite") && node["potentialAction"]) {
        walk(node["potentialAction"], (action) => {
          const at = action["@type"];
          if (at === "SearchAction" || (Array.isArray(at) && at.includes("SearchAction"))) {
            info.hasSearchAction = true;
          }
        });
      }
    });
  });

  info.types = [...types];
  return info;
}

/** schema:Organization のような接頭辞や URL 形式の @type を素の名前にする */
function stripPrefix(name: string): string {
  const last = name.split(/[/#:]/).pop();
  return last || name;
}

function hasNonEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === "string" && v.length > 0;
}

type JsonObject = Record<string, unknown>;

function walk(node: unknown, visit: (obj: JsonObject) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as JsonObject;
    visit(obj);
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") walk(value, visit);
    }
  }
}

export function checkStructuredData($: cheerio.CheerioAPI): CheckResult[] {
  const info = extractJsonLd($);
  const has = (...names: string[]) => names.some((n) => info.types.includes(n));
  const results: CheckResult[] = [];

  const hasAny = info.types.length > 0;
  results.push(
    check({
      id: "jsonld-exists",
      category: "structuredData",
      status: hasAny ? "pass" : "fail",
      weight: 3,
      label: hasAny ? "構造化データ（JSON-LD）がある" : "構造化データ（JSON-LD）がない",
      evidence: hasAny
        ? `検出した @type: ${info.types.join(", ")}`
        : info.blocks > 0
          ? `script タグは ${info.blocks} 個ありますが有効な @type がありません`
          : undefined,
      advice:
        "構造化データ（JSON-LD）は、ページの内容を「これは会社情報」「これはFAQ」と機械が読める形で伝える仕組みです。<head> 内に <script type=\"application/ld+json\"> を置き、まずは Organization と WebSite から設定してください。",
    }),
  );

  if (info.parseErrors > 0) {
    results.push(
      check({
        id: "jsonld-parse-error",
        category: "structuredData",
        status: "fail",
        weight: 2,
        label: "JSON-LD に文法エラーがある",
        evidence: `${info.parseErrors} 個の JSON-LD ブロックがパースできません`,
        advice:
          "JSON として読めない JSON-LD は無視されます。末尾カンマ、引用符の不一致、コメントの混入などがないか、Google のリッチリザルトテストや JSON バリデータで確認してください。",
      }),
    );
  }

  const hasOrg = [...ORG_TYPES].some((t) => info.types.includes(t));
  results.push(
    check({
      id: "jsonld-organization",
      category: "structuredData",
      status: hasOrg ? "pass" : "warn",
      weight: 2,
      label: hasOrg
        ? "運営者(Organization)の構造化データがある"
        : "運営者(Organization)の構造化データがない",
      advice:
        "Organization（または LocalBusiness / Person）の構造化データは、「このサイトを運営しているのは誰か」を AI に伝えます。name・url・logo・sameAs（公式SNS）を含めて設定すると、AI が運営者を正しく認識し、信頼性の判断材料になります。",
    }),
  );

  results.push(
    check({
      id: "jsonld-website",
      category: "structuredData",
      status: has("WebSite") ? "pass" : "warn",
      weight: 1,
      label: has("WebSite") ? "WebSite 構造化データがある" : "WebSite 構造化データがない",
      advice:
        "WebSite の構造化データは、サイト名と URL を明示します。サイト名が検索結果や AI の回答で正しく表示されやすくなります。",
    }),
  );

  results.push(
    optionalCheck({
      id: "jsonld-search-action",
      category: "structuredData",
      present: info.hasSearchAction,
      label: info.hasSearchAction
        ? "サイト内検索（SearchAction）の構造化データがある"
        : "サイト内検索（SearchAction）の構造化データがない",
      advice:
        "SearchAction は、サイト内検索の使い方を AI に伝える構造化データです（設定は任意）。これがあると、AI が「このサイト内でこう検索できる」と理解し、利用者を目的の情報へ案内しやすくなります。サイト内検索の機能がある場合に設定すると効果的です。",
    }),
  );

  results.push(
    check({
      id: "jsonld-breadcrumb",
      category: "structuredData",
      status: has("BreadcrumbList") ? "pass" : "warn",
      weight: 1,
      label: has("BreadcrumbList")
        ? "パンくず(BreadcrumbList)構造化データがある"
        : "パンくず(BreadcrumbList)構造化データがない",
      advice:
        "BreadcrumbList は、このページがサイトのどの階層にあるかを伝えます。トップ > サービス > 詳細 のような位置関係が AI に伝わり、ページの文脈を理解しやすくなります。",
    }),
  );

  results.push(
    check({
      id: "jsonld-faq",
      category: "structuredData",
      status: has("FAQPage") ? "pass" : "warn",
      weight: 2,
      label: has("FAQPage") ? "FAQPage 構造化データがある" : "FAQPage 構造化データがない",
      advice:
        "FAQPage の構造化データは、よくある質問と回答を、AI が「これは質問と回答」と認識できる形で伝えるデータです。これがあると、あなたのFAQがそのままAI検索の回答に引用されやすくなり、露出が増えます。このツールのFAQ生成機能を使えば、質問と回答を承認するだけで自動的に作成・設置できます。",
    }),
  );

  results.push(
    check({
      id: "jsonld-sameas",
      category: "structuredData",
      status: info.hasSameAs ? "pass" : hasOrg ? "warn" : "fail",
      weight: 1,
      label: info.hasSameAs
        ? "sameAs(公式SNS/Wikipedia等)が設定されている"
        : "sameAs(公式SNS/Wikipedia等)が設定されていない",
      advice:
        "sameAs は、Organization に公式SNS・Wikipedia・法人番号公表サイトなどの URL を並べる項目です。AI が「この会社は本物で、他の情報源とも一致する」と確認できるため、同名の別会社との混同を防ぎ、信頼性が上がります。",
    }),
  );

  const hasArticle = [...ARTICLE_TYPES].some((t) => info.types.includes(t));
  results.push(
    optionalCheck({
      id: "jsonld-article",
      category: "structuredData",
      present: hasArticle,
      label: hasArticle ? "記事（Article）構造化データがある" : "記事（Article）構造化データがない",
      advice:
        "Article（記事）の構造化データは、そのページがニュースやブログなどの記事であることを、著者や公開日とともに AI に伝えるデータです（設定は任意）。記事ページがある場合に設定すると、AI が記事として正しく認識しやすくなります。",
    }),
  );

  results.push(
    optionalCheck({
      id: "jsonld-product",
      category: "structuredData",
      present: has("Product"),
      label: has("Product") ? "製品（Product）構造化データがある" : "製品（Product）構造化データがない",
      advice:
        "Product（製品）の構造化データは、商品名・価格・在庫などの商品情報を AI に正確に伝えるデータです（設定は任意）。商品ページがある場合に設定すると、商品情報が AI に正しく伝わり、検索や AI の回答で扱われやすくなります。",
    }),
  );

  return results;
}
