/**
 * いまの FAQ の状態を読む（純関数なのでネットワークには出ない）。
 *
 * ここで守りたいのは 2 つ:
 *   - 構造化データにしか無い FAQ を必ず見つける（Google のガイドライン違反なので見逃せない）
 *   - すでにある質問を取りこぼさない（取りこぼすと AI が同じ質問をもう一度提案する）
 */
import { describe, expect, it } from "vitest";
import { auditFaq, normalizeForMatch } from "../audit";

function status(html: string, id: string) {
  return auditFaq(html).findings.find((f) => f.id === id)?.status;
}

const FAQ_JSONLD = (questions: [string, string][]) =>
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  })}</script>`;

describe("構造化データ", () => {
  it("FAQPage と質問文を取り出す", () => {
    const html = `<html><body>${FAQ_JSONLD([["予約は必要ですか？", "不要です"]])}<h2>よくある質問</h2><details><summary>予約は必要ですか？</summary><p>不要です</p></details></body></html>`;
    const audit = auditFaq(html);
    expect(audit.jsonLd.present).toBe(true);
    expect(audit.jsonLd.questions).toEqual(["予約は必要ですか？"]);
    expect(status(html, "jsonld")).toBe("ok");
  });

  it("@graph の中の FAQPage も見つける", () => {
    const html = `<html><body><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "例" },
        { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "駐車場はありますか？" }] },
      ],
    })}</script><p>駐車場はありますか？ はい、3 台あります。</p></body></html>`;
    const audit = auditFaq(html);
    expect(audit.jsonLd.present).toBe(true);
    expect(audit.jsonLd.questions).toEqual(["駐車場はありますか？"]);
  });

  it("無ければ「足りない」。壊れた JSON は書式の失格として数える", () => {
    const html = "<html><body><h2>サービス</h2><script type=\"application/ld+json\">{壊れている}</script></body></html>";
    expect(status(html, "jsonld")).toBe("fail");
    expect(auditFaq(html).jsonLd.brokenBlocks).toBe(1);
    expect(status(html, "broken")).toBe("fail");
  });
});

describe("画面に見えている FAQ", () => {
  it("質問の形の見出しと details を数える", () => {
    const html = `<html><body><h2>よくあるご質問</h2><h3>Q. 駐車場はありますか</h3><p>あります</p><details><summary>予約は必要ですか？</summary><p>不要です</p></details></body></html>`;
    const audit = auditFaq(html);
    expect(audit.visible.detailsCount).toBe(1);
    expect(audit.visible.questionHeadings).toEqual(["Q. 駐車場はありますか", "予約は必要ですか？"]);
    expect(audit.visible.headings).toEqual(["よくあるご質問"]);
    expect(status(html, "visible")).toBe("ok");
    expect(status(html, "heading")).toBe("ok");
  });

  it("見出しも質問も無ければ「足りない」", () => {
    const html = "<html><body><h1>サービス案内</h1><p>当店は駅から徒歩 5 分です。</p></body></html>";
    expect(status(html, "visible")).toBe("fail");
    expect(status(html, "heading")).toBe("warn");
  });
});

describe("構造化データと画面の一致", () => {
  it("構造化データにしか無い質問を見つける（ガイドライン違反）", () => {
    const html = `<html><body>${FAQ_JSONLD([
      ["予約は必要ですか？", "不要です"],
      ["クレジットカードは使えますか？", "使えます"],
    ])}<h2>よくある質問</h2><details><summary>予約は必要ですか？</summary><p>不要です</p></details></body></html>`;
    const audit = auditFaq(html);
    expect(audit.hiddenQuestions).toEqual(["クレジットカードは使えますか？"]);
    expect(status(html, "match")).toBe("fail");
  });

  it("全角・半角・空白の違いは一致とみなす", () => {
    const html = `<html><body>${FAQ_JSONLD([["ＷＩ-ＦＩ は ありますか？", "あります"]])}<p>Wi-Fiはありますか？ あります。</p></body></html>`;
    expect(auditFaq(html).hiddenQuestions).toEqual([]);
    expect(status(html, "match")).toBe("ok");
  });

  it("構造化データが無いときは比べる対象が無いので「確認」", () => {
    expect(status("<html><body><p>本文</p></body></html>", "match")).toBe("warn");
  });

  it("script の中の文字列を「画面に見えている」と誤認しない", () => {
    // JSON-LD の質問文は script の中にもあるが、それを本文と見なすと食い違いを一生見つけられない
    const html = `<html><body>${FAQ_JSONLD([["領収書は出ますか？", "出ます"]])}<p>本文</p></body></html>`;
    expect(auditFaq(html).hiddenQuestions).toEqual(["領収書は出ますか？"]);
  });
});

describe("すでにある質問", () => {
  it("構造化データと見出しをまとめ、同じ意味のものは 1 件にする", () => {
    const html = `<html><body>${FAQ_JSONLD([["予約は必要ですか？", "不要です"]])}<details><summary>予約は必要ですか？</summary><p>不要です</p></details><h3>駐車場はありますか？</h3></body></html>`;
    expect(auditFaq(html).existingQuestions).toEqual(["予約は必要ですか？", "駐車場はありますか？"]);
  });
});

describe("normalizeForMatch", () => {
  it("全角・空白・大文字小文字を寄せる", () => {
    expect(normalizeForMatch("Ｗｉ-Ｆｉ は 使えますか？")).toBe("wi-fiは使えますか?");
  });
});
