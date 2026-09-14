/**
 * ページの用途（PageKind）を URL とタイトルから見分ける。
 *
 * 「重要なページなのにリンクが弱い」「記事なのに著者が無い」のような判定の前提。
 * 迷う語は入れず、外れたら "other" にする（誤って会社情報と判定すると、
 * 信頼の判定が実在しない問題を指摘してしまうため）。
 */
import { isHomePage, notForSearch } from "@/lib/analyzer/page-kind";
import type { PageKind } from "./types";

interface KindRule {
  kind: PageKind;
  /** パスの区切り（拡張子は落として比較） */
  segments: readonly string[];
  /** title / h1 に含まれていたら該当 */
  words?: RegExp;
}

const RULES: readonly KindRule[] = [
  {
    kind: "contact",
    segments: ["contact", "contacts", "contact-us", "contactus", "inquiry", "inquiries", "toiawase", "otoiawase", "form", "forms", "reserve", "reservation", "booking"],
    words: /お問い?合わせ|お問合せ|問い合わせ|ご相談|資料請求|ご予約|お申し?込み/,
  },
  {
    kind: "company",
    segments: ["company", "about", "about-us", "aboutus", "corporate", "profile", "overview", "outline", "greeting", "message", "philosophy", "access", "shop", "store", "clinic", "office", "staff", "doctor", "history"],
    words: /会社概要|会社案内|企業情報|企業概要|店舗情報|店舗案内|医院案内|事務所概要|私たちについて|代表挨拶|ご挨拶|アクセス|スタッフ紹介|沿革/,
  },
  {
    kind: "legal",
    segments: ["privacy", "privacy-policy", "privacypolicy", "policy", "policies", "terms", "terms-of-service", "tos", "legal", "tokushoho", "tokusho", "law", "sitemap", "sct", "cookie", "cookies", "disclaimer"],
    words: /プライバシー|個人情報保護|利用規約|特定商取引|免責事項|サイトマップ|クッキー|Cookie/i,
  },
  {
    kind: "recruit",
    segments: ["recruit", "recruitment", "careers", "career", "jobs", "job", "hiring", "employment", "saiyo"],
    words: /採用情報|採用|求人|募集要項|キャリア採用|新卒/,
  },
  {
    kind: "service",
    segments: ["service", "services", "product", "products", "item", "items", "menu", "menus", "plan", "plans", "price", "prices", "pricing", "course", "courses", "feature", "features", "solution", "solutions", "lp", "campaign", "treatment", "treatments"],
    words: /サービス|商品|製品|料金|価格|メニュー|プラン|コース|施術|診療内容|事業内容|ソリューション/,
  },
  {
    kind: "article",
    segments: ["blog", "blogs", "news", "column", "columns", "article", "articles", "post", "posts", "topics", "topic", "case", "cases", "works", "voice", "voices", "interview", "report", "reports", "info", "information", "release", "media", "magazine", "journal", "story", "stories", "faq", "glossary"],
  },
];

const LIST_SEGMENTS = new Set(["category", "categories", "tag", "tags", "archive", "archives", "page", "author", "date", "list"]);
/** /2026/09/ や /2026/ のような日付の階層 */
const DATE_SEGMENT = /^\d{4}$|^\d{1,2}$/;

export interface KindInput {
  url: string;
  title: string | null;
  h1: readonly string[];
  /** 公開日があれば記事寄り */
  published: string | null;
  /** Article 系の JSON-LD があれば記事 */
  jsonLdTypes: readonly string[];
}

const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting", "TechArticle", "Report"]);

export function classifyPage(input: KindInput): PageKind {
  if (isHomePage(input.url)) return "home";
  if (notForSearch(input.url)) return "not-for-search";

  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return "other";
  }
  const segments = url.pathname
    .toLowerCase()
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/\.[a-z0-9]{1,5}$/i, ""));
  const text = `${input.title ?? ""} ${input.h1.join(" ")}`;

  // 一覧（カテゴリ・タグ・ページ送り）は、記事の語より先に見る
  const last = segments[segments.length - 1] ?? "";
  const beforeLast = segments[segments.length - 2] ?? "";
  if (segments.some((s) => LIST_SEGMENTS.has(s)) && (segments.length <= 2 || LIST_SEGMENTS.has(beforeLast) || /^\d+$/.test(last))) {
    return "list";
  }
  if (segments.length >= 1 && segments.every((s) => DATE_SEGMENT.test(s))) return "list";

  for (const rule of RULES) {
    if (segments.some((s) => rule.segments.includes(s))) {
      // /blog のような区切りだけの URL は一覧、その下は記事
      if (rule.kind === "article" && segments.length === 1) return "list";
      return rule.kind;
    }
  }
  for (const rule of RULES) {
    if (rule.words && rule.words.test(text)) return rule.kind;
  }
  if (input.jsonLdTypes.some((t) => ARTICLE_TYPES.has(t))) return "article";
  if (input.published && segments.length >= 1) return "article";
  return "other";
}
