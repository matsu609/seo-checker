/**
 * 信頼の手がかり（E-E-A-T の代理指標）をクロール結果から判定する純関数。
 *
 * 会社情報・問い合わせ・規約類のページがあるか、電話・住所がサイトに書かれて
 * いるか、Organization 系の構造化データと本文の電話番号が一致するか、
 * 記事に著者情報があるか。判定はページ種別（kinds.ts）と AuditPage の
 * 連絡先の項目だけを使う。
 */
import type { AuditPage } from "@/lib/audit/types";
import { classifyPage } from "./kinds";
import type { PageKind, TrustCheck, TrustSignals } from "./types";

const MAX_PHONES = 5;

const PRIVACY_RE = /プライバシー|個人情報|privacy/i;
const TERMS_RE = /利用規約|ご利用条件|terms/i;
const TOKUSHOHO_RE = /特定商取引|特商法|tokusho/i;

export function analyzeTrust(pages: readonly AuditPage[], entryUrl: string): TrustSignals {
  const kinds = new Map<string, PageKind>();
  for (const page of pages) {
    kinds.set(
      page.url,
      classifyPage({ url: page.url, title: page.title, h1: page.h1, published: page.published, jsonLdTypes: page.jsonLd.types }),
    );
  }
  const firstOf = (kind: PageKind, extra?: RegExp): string | null => {
    for (const page of pages) {
      if (kinds.get(page.url) !== kind) continue;
      if (!extra || extra.test(`${page.url} ${page.title ?? ""} ${page.h1.join(" ")}`)) return page.url;
    }
    return null;
  };

  const home = pages.find((p) => p.url === entryUrl) ?? pages[0] ?? null;

  const phones = new Set<string>();
  for (const page of pages) for (const phone of page.phones) if (phones.size < MAX_PHONES) phones.add(phone);

  const orgPage = pages.find((p) => p.organization !== null) ?? null;
  const organization = orgPage?.organization
    ? { url: orgPage.url, ...orgPage.organization }
    : null;
  const schemaTelephone = organization?.telephone ?? null;
  const consistent = schemaTelephone && phones.size > 0 ? phones.has(schemaTelephone) : null;

  const articles = pages.filter((p) => kinds.get(p.url) === "article");
  const withAuthor = articles.filter((p) => p.hasAuthor).length;

  const signals: TrustSignals = {
    pages: {
      company: firstOf("company"),
      contact: firstOf("contact"),
      privacy: firstOf("legal", PRIVACY_RE),
      terms: firstOf("legal", TERMS_RE),
      tokushoho: firstOf("legal", TOKUSHOHO_RE),
    },
    organization,
    nap: {
      phones: [...phones],
      schemaTelephone,
      consistent,
      pagesWithAddress: pages.filter((p) => p.hasPostalAddress).length,
    },
    contact: {
      pagesWithPhone: pages.filter((p) => p.phones.length > 0).length,
      pagesWithEmail: pages.filter((p) => p.hasEmail).length,
      phoneOnHome: home ? home.phones.length > 0 : false,
    },
    author: { articles: articles.length, withAuthor },
    checks: [],
  };
  signals.checks = buildChecks(signals, pages.length);
  return signals;
}

function buildChecks(s: TrustSignals, pageCount: number): TrustCheck[] {
  const checks: TrustCheck[] = [];
  const add = (c: TrustCheck) => checks.push(c);

  add(
    s.pages.company
      ? { id: "company-page", label: "会社・店舗情報のページ", status: "pass", detail: "運営者が分かるページがあります", url: s.pages.company }
      : { id: "company-page", label: "会社・店舗情報のページ", status: "fail", detail: "会社概要・店舗情報にあたるページが見つかりません。誰が運営しているか分からないサイトは、検索エンジンにも利用者にも信頼されにくくなります" },
  );
  add(
    s.pages.contact
      ? { id: "contact-page", label: "問い合わせのページ", status: "pass", detail: "問い合わせ・予約の入口があります", url: s.pages.contact }
      : { id: "contact-page", label: "問い合わせのページ", status: "warn", detail: "問い合わせ・予約のページが見つかりません（電話だけの運用なら問題ありませんが、サイトからの成果を測れません）" },
  );
  add(
    s.pages.privacy
      ? { id: "privacy", label: "プライバシーポリシー", status: "pass", detail: "個人情報の扱いを説明するページがあります", url: s.pages.privacy }
      : { id: "privacy", label: "プライバシーポリシー", status: s.pages.contact ? "fail" : "warn", detail: s.pages.contact ? "問い合わせフォームがあるのにプライバシーポリシーが見つかりません。個人情報を受け取るサイトには必要です" : "プライバシーポリシーのページが見つかりません" },
  );
  add(
    s.pages.tokushoho
      ? { id: "tokushoho", label: "特定商取引法に基づく表記", status: "pass", detail: "販売サイトに必要な表記があります", url: s.pages.tokushoho }
      : { id: "tokushoho", label: "特定商取引法に基づく表記", status: "info", detail: "見つかりません。サイト上で商品やサービスを販売しているなら必要です（販売していなければ不要）" },
  );
  add(
    s.organization
      ? { id: "org-schema", label: "運営者の構造化データ", status: "pass", detail: `${s.organization.type} の構造化データがあります${s.organization.sameAs > 0 ? `（sameAs ${s.organization.sameAs} 件）` : "（sameAs は無し）"}`, url: s.organization.url }
      : { id: "org-schema", label: "運営者の構造化データ", status: "warn", detail: "Organization / LocalBusiness の構造化データが見つかりません。運営者の名前・電話・住所を機械的に伝える手段が無い状態です" },
  );
  if (s.nap.phones.length === 0) {
    add({ id: "phone", label: "電話番号の掲載", status: "warn", detail: "電話番号がどのページにも見つかりません。連絡手段が分からないと信頼を得にくくなります" });
  } else {
    add({
      id: "phone",
      label: "電話番号の掲載",
      status: s.contact.phoneOnHome ? "pass" : "warn",
      detail: s.contact.phoneOnHome
        ? `トップページを含む ${s.contact.pagesWithPhone} ページに電話番号があります`
        : `${s.contact.pagesWithPhone} ページに電話番号がありますが、トップページにはありません`,
    });
  }
  add(
    s.nap.pagesWithAddress > 0
      ? { id: "address", label: "住所の掲載", status: "pass", detail: `${s.nap.pagesWithAddress} ページに住所らしき記述があります` }
      : { id: "address", label: "住所の掲載", status: "warn", detail: "郵便番号や都道府県から始まる住所がどのページにも見つかりません" },
  );
  if (s.nap.consistent !== null) {
    add(
      s.nap.consistent
        ? { id: "nap", label: "構造化データと本文の電話番号", status: "pass", detail: "構造化データの電話番号が本文にも書かれています（一致）" }
        : { id: "nap", label: "構造化データと本文の電話番号", status: "fail", detail: `構造化データの電話番号（${s.nap.schemaTelephone}）が本文のどこにも見つかりません。表記のずれは Google マップや検索の信頼を下げます` },
    );
  }
  if (s.author.articles > 0) {
    const share = s.author.withAuthor / s.author.articles;
    add({
      id: "author",
      label: "記事の著者情報",
      status: share >= 0.8 ? "pass" : share > 0 ? "warn" : "fail",
      detail: `記事 ${s.author.articles} ページのうち ${s.author.withAuthor} ページに著者・監修の表示があります`,
    });
  }
  if (pageCount === 0) return [];
  return checks;
}
