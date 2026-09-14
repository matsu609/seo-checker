import { describe, expect, it } from "vitest";
import { ORIGIN, html, pageFrom } from "@/lib/audit/__tests__/fixtures";
import { analyzeTrust } from "../trust";

const page = (path: string, body: string, head = "", title = path) =>
  pageFrom(html({ head: `<title>${title}</title>${head}`, body }), { url: `${ORIGIN}${path}`, finalUrl: `${ORIGIN}${path}` });

const status = (checks: { id: string; status: string }[], id: string) => checks.find((c) => c.id === id)?.status;

describe("信頼の手がかり", () => {
  it("会社情報・問い合わせ・規約・構造化データ・電話・住所がそろっていれば pass", () => {
    const org = `<script type="application/ld+json">{"@type":"LocalBusiness","name":"x","telephone":"03-1234-5678","address":"東京都千代田区"}</script>`;
    const pages = [
      page("/", `<main><p>TEL 03-1234-5678 〒100-0001 東京都千代田区丸の内</p></main>`, org),
      page("/company", `<main><h1>会社概要</h1><p>東京都千代田区丸の内 1-1</p></main>`),
      page("/contact", `<main><h1>お問い合わせ</h1><form></form></main>`),
      page("/privacy", `<main><h1>プライバシーポリシー</h1></main>`),
      page("/legal/tokushoho", `<main><h1>特定商取引法に基づく表記</h1></main>`),
      page("/blog/post-1", `<main><h1>記事</h1><p class="author">松下</p></main>`),
    ];
    const t = analyzeTrust(pages, `${ORIGIN}/`);
    expect(t.pages).toEqual({
      company: `${ORIGIN}/company`,
      contact: `${ORIGIN}/contact`,
      privacy: `${ORIGIN}/privacy`,
      terms: null,
      tokushoho: `${ORIGIN}/legal/tokushoho`,
    });
    expect(t.organization).toMatchObject({ url: `${ORIGIN}/`, type: "LocalBusiness", telephone: "0312345678", hasAddress: true });
    expect(t.nap).toMatchObject({ phones: ["0312345678"], schemaTelephone: "0312345678", consistent: true, pagesWithAddress: 2 });
    expect(t.contact).toEqual({ pagesWithPhone: 1, pagesWithEmail: 0, phoneOnHome: true });
    expect(t.author).toEqual({ articles: 1, withAuthor: 1 });
    for (const id of ["company-page", "contact-page", "privacy", "tokushoho", "org-schema", "phone", "address", "nap", "author"]) {
      expect(status(t.checks, id), id).toBe("pass");
    }
  });

  it("フォームがあるのにプライバシーポリシーが無ければ fail、電話の不一致も fail", () => {
    const org = `<script type="application/ld+json">{"@type":"Organization","name":"x","telephone":"03-9999-9999"}</script>`;
    const pages = [
      page("/", `<main><p>TEL 03-1234-5678</p></main>`, org),
      page("/contact", `<main><h1>お問い合わせ</h1></main>`),
      page("/blog/post-1", `<main><h1>記事</h1></main>`),
      page("/blog/post-2", `<main><h1>記事 2</h1></main>`),
    ];
    const t = analyzeTrust(pages, `${ORIGIN}/`);
    expect(status(t.checks, "company-page")).toBe("fail");
    expect(status(t.checks, "privacy")).toBe("fail");
    expect(status(t.checks, "tokushoho")).toBe("info");
    expect(status(t.checks, "nap")).toBe("fail");
    expect(status(t.checks, "address")).toBe("warn");
    expect(status(t.checks, "author")).toBe("fail");
    expect(t.nap.consistent).toBe(false);
  });

  it("電話も構造化データも無ければ nap の判定は出さない、記事が無ければ著者の判定も出さない", () => {
    const t = analyzeTrust([page("/", `<main>本文</main>`)], `${ORIGIN}/`);
    expect(t.nap.consistent).toBeNull();
    expect(t.checks.map((c) => c.id)).not.toContain("nap");
    expect(t.checks.map((c) => c.id)).not.toContain("author");
    expect(status(t.checks, "phone")).toBe("warn");
  });

  it("ページが無ければ判定は空", () => {
    expect(analyzeTrust([], `${ORIGIN}/`).checks).toEqual([]);
  });
});
