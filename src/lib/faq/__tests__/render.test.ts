import { describe, expect, it } from "vitest";
import { buildFaqHtml, buildFaqJsonLd, buildFaqScriptTag } from "../render";

const faqs = [
  { question: "株式会社Wolfの所在地は？", answer: "東京都です。" },
  { question: "<b>タグ</b>は？", answer: 'エスケープ "される" & </script>' },
];

describe("buildFaqJsonLd", () => {
  it("FAQPage の形になっている", () => {
    const data = JSON.parse(buildFaqJsonLd(faqs));
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(2);
    expect(data.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "株式会社Wolfの所在地は？",
      acceptedAnswer: { "@type": "Answer", text: "東京都です。" },
    });
  });

  it("script タグ内で </script> が閉じられないようにする", () => {
    const tag = buildFaqScriptTag(faqs);
    expect(tag.startsWith('<script type="application/ld+json">')).toBe(true);
    // 本物の閉じタグは末尾の 1 つだけ
    expect(tag.match(/<\/script>/g)).toHaveLength(1);
    expect(tag).toContain("<\\/script>");
  });
});

describe("buildFaqHtml", () => {
  it("details/summary で組み、HTML をエスケープする", () => {
    const html = buildFaqHtml(faqs, "FAQ");
    expect(html).toContain("<h2 id=\"faq-heading\">FAQ</h2>");
    expect(html).toContain("&lt;b&gt;タグ&lt;/b&gt;は？");
    expect(html).toContain("&quot;される&quot; &amp; &lt;/script&gt;");
    expect(html.match(/<details class="faq-item">/g)).toHaveLength(2);
  });
});
