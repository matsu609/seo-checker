/**
 * 文の数え方（多言語）の回帰テスト。
 *
 * 英語ページが本文を 2 倍にしても「1 / 全 1 文」から動かず、毎回「改善余地」と
 * 報告された件（2026-09-13 利用者報告）の受け入れ条件をそのまま置いている。
 */
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { checkContent, extractContent } from "../content";
import { detectLanguage, documentLanguage, languageLabel } from "../language";
import { extractBlocks, isConcrete, measureSpecificity, splitSentences } from "../sentences";

/** テスト用のページ。main の中に渡した HTML を入れる */
function page(inner: string, lang = "ja"): string {
  return `<html lang="${lang}"><head><title>t</title></head><body><nav>menu menu</nav><main>${inner}</main><footer>foot</footer></body></html>`;
}

function analyze(html: string) {
  const info = extractContent(html, "https://example.com/", cheerio.load(html));
  const check = checkContent(info).find((r) => r.id === "content-specificity");
  return { info, check };
}

describe("言語判定", () => {
  it("lang 属性を最優先する", () => {
    const info = detectLanguage("Hello world", "en-US", null);
    expect(info).toMatchObject({ code: "en", style: "latin", source: "attr" });
  });

  it("lang が無ければ文字種で推定する", () => {
    expect(detectLanguage("これは日本語の文です", null, null)).toMatchObject({
      code: "ja",
      style: "cjk",
      source: "script",
    });
    expect(detectLanguage("This is an English sentence", null, null)).toMatchObject({
      code: "en",
      style: "latin",
    });
  });

  it("日本語ページの中の英語ブロックは英語として扱う（ブロック単位の判定）", () => {
    const doc = documentLanguage("ja", "日本語のページです");
    expect(detectLanguage("We opened a new office in Tokyo.", null, doc).style).toBe("latin");
    expect(detectLanguage("当社は Wolf Inc. の代理店です。", null, doc).style).toBe("cjk");
  });

  it("宣言と推定が一致するときは「推定」と書かない", () => {
    const doc = documentLanguage("en", "");
    expect(languageLabel(detectLanguage("We are a firm.", null, doc))).toBe("英語");
    expect(languageLabel(detectLanguage("これは日本語です。", null, doc))).toBe("日本語（推定）");
  });
});

describe("文の分割（日本語）", () => {
  it("句点・感嘆符・疑問符で切る。末尾の言い切りも 1 文", () => {
    expect(splitSentences("一つ目です。二つ目です。三つ目", "cjk")).toHaveLength(3);
    expect(splitSentences("本当ですか？はい！", "cjk")).toHaveLength(2);
    expect(splitSentences("", "cjk")).toEqual([]);
  });

  it("英語の社名・引用が混じっても分割が壊れない", () => {
    expect(
      splitSentences("当社は Wolf Inc. のパートナーです。設立は 2024 年 11 月 6 日です。", "cjk"),
    ).toEqual([
      "当社は Wolf Inc. のパートナーです。",
      "設立は 2024 年 11 月 6 日です。",
    ]);
  });
});

describe("文の分割（英語）", () => {
  it("ピリオド＋空白／行末で切る", () => {
    expect(splitSentences("We opened in 2019. Our team has 24 people.", "latin")).toEqual([
      "We opened in 2019.",
      "Our team has 24 people.",
    ]);
  });

  it("略語・小数・桁区切り・URL・メール・頭字語では切らない", () => {
    expect(splitSentences("Wolf Inc. is based in Tokyo.", "latin")).toHaveLength(1);
    expect(splitSentences("Mr. Smith leads the U.S. office.", "latin")).toHaveLength(1);
    expect(splitSentences("A.I. tools help, e.g. drafting.", "latin")).toHaveLength(1);
    expect(splitSentences("Prices start at 33,000 yen (about 1.5% of the market).", "latin")).toHaveLength(1);
    expect(splitSentences("Write to info@example.com for details.", "latin")).toHaveLength(1);
    expect(splitSentences("See https://example.com/en/about for details.", "latin")).toHaveLength(1);
    expect(splitSentences("No. 5 is our best seller.", "latin")).toHaveLength(1);
    expect(splitSentences("Co., Ltd. is a common suffix in Japan.", "latin")).toHaveLength(1);
  });

  it("受け入れ条件の 1 文がそのまま 1 文かつ事実を含む文になる", () => {
    const sentence =
      "Wolf Inc. is a Tokyo-based firm founded on November 6, 2024, corporate number 4011001165835.";
    expect(splitSentences(sentence, "latin")).toEqual([sentence]);
    expect(isConcrete(sentence)).toBe(true);
  });
});

describe("ブロック分け", () => {
  it("リスト項目・表のセル・見出しはそれぞれ 1 つのブロックになる", () => {
    const $ = cheerio.load(
      "<body><h2>対応エリア</h2><ul><li>東京都</li><li>神奈川県</li></ul><table><tr><th>設立</th><td>2024 年</td></tr></table></body>",
    );
    const blocks = extractBlocks($);
    expect(blocks.map((b) => b.text)).toEqual(["対応エリア", "東京都", "神奈川県", "設立", "2024 年"]);
    expect(blocks.every((b) => b.standalone)).toBe(true);
  });

  it("要素の lang 属性はブロックに引き継がれる", () => {
    const $ = cheerio.load('<body><div lang="en"><p>Hello there</p></div></body>');
    expect(extractBlocks($)[0].lang).toBe("en");
  });

  it("記号だけのセルは文として数えない", () => {
    const $ = cheerio.load("<body><table><tr><td>—</td><td>3 件</td></tr></table></body>");
    expect(extractBlocks($).map((b) => b.text)).toEqual(["3 件"]);
  });
});

describe("事実を含む文の判定", () => {
  it.each([
    ["全角数字と通貨", "料金は１２，０００円です。"],
    ["英語の通貨", "The plan costs 9,800 yen per month."],
    ["英語の日付", "We were founded on November 6, 2024."],
    ["ISO の日付", "The report was published on 2026-04-18."],
    ["法人格（日本語）", "株式会社ウルフが運営しています。"],
    ["法人格（英語）", "Operated by Wolf Co., Ltd."],
    ["メール", "Contact us at hello@example.com."],
    ["電話", "お電話は 03-1234-5678 まで。"],
    ["割合", "Our retention rate is 98%."],
    ["単位（英語）", "We run 12 stores and employ 240 people."],
    ["単位（日本語）", "全国 12 店舗、スタッフ 240 名です。"],
    ["識別番号", "法人番号は 4011001165835 です。"],
  ])("%s を拾う", (_label, sentence) => {
    expect(isConcrete(sentence)).toBe(true);
  });

  it.each([
    ["抽象的な日本語", "私たちはお客様に価値を提供します。"],
    ["抽象的な英語", "We deliver value to our customers."],
  ])("%s は拾わない", (_label, sentence) => {
    expect(isConcrete(sentence)).toBe(false);
  });
});

describe("受け入れ条件", () => {
  it("純英語ページ（句点ゼロ・50 文以上）は実際の文数と ±10% で一致し、減点されない", () => {
    // 50 文すべてに事実を入れる（比率 100%）
    const sentences = Array.from(
      { length: 50 },
      (_, i) =>
        `Our Tokyo office opened on November ${(i % 28) + 1}, 2024 and now serves ${100 + i} clients.`,
    );
    const html = page(
      `<h1>About Wolf</h1>${sentences.map((s) => `<p>${s}</p>`).join("")}`,
      "en",
    );
    const { info, check } = analyze(html);
    // 見出し 1 つ + 本文 50 文
    expect(info.totalSentences).toBeGreaterThanOrEqual(Math.round(51 * 0.9));
    expect(info.totalSentences).toBeLessThanOrEqual(Math.round(51 * 1.1));
    expect(info.concreteSentences).toBe(50);
    expect(check?.status).toBe("pass");
    expect(check?.evidence).toContain("判定言語 英語");
  });

  it("段落が 1 つだけの英語ページでも、文の数だけ数えられる", () => {
    const body = Array.from(
      { length: 30 },
      (_, i) => `We helped client ${i + 1} grow revenue by ${i + 5}% in 2025.`,
    ).join(" ");
    const { info } = analyze(page(`<h1>Results</h1><p>${body}</p>`, "en"));
    expect(info.totalSentences).toBeGreaterThanOrEqual(30);
  });

  it("箇条書き主体のページ（句読点の無い li が 20 件）は「1 文」にならない", () => {
    const items = Array.from({ length: 20 }, (_, i) => `<li>対応エリア ${i + 1}</li>`).join("");
    const { info, check } = analyze(page(`<h2>対応エリア</h2><ul>${items}</ul>`));
    expect(info.totalSentences).toBeGreaterThanOrEqual(20);
    expect(check?.evidence).not.toContain("全 1 文");
  });

  it("短い本文（3 文）は比率で減点せず、事実を含む文の数で判定する", () => {
    const { info, check } = analyze(
      page("<p>営業は平日 9:00 から 18:00 です。お電話は 03-1234-5678 まで。創業は 1998 年です。</p>"),
    );
    expect(info.totalSentences).toBeLessThan(5);
    expect(check?.status).toBe("pass");
    expect(check?.evidence).toContain("比率では判定せず");
  });

  it("文が少なく事実も無いページは「判定できない（参考）」に留める（fail にしない）", () => {
    const { check } = analyze(page("<p>会社案内</p>"));
    expect(check?.status).toBe("warn");
    expect(check?.label).toContain("判定できない");
  });

  it("比率 100% のページを「やや少ない」と報告しない", () => {
    const html = page(
      `<h1>Wolf</h1><p>Wolf Inc. is a Tokyo-based firm founded on November 6, 2024.</p>`,
      "en",
    );
    const { check } = analyze(html);
    expect(check?.label).not.toContain("やや少ない");
  });

  it("日英混在ページ（日本語本文 + 英語の引用）でも分割が壊れない", () => {
    const html = page(
      `<h2>会社概要</h2><p>当社は 2024 年 11 月 6 日に設立しました。拠点は東京都です。</p>
       <blockquote lang="en">Wolf Inc. is a Tokyo-based firm. It serves 120 clients.</blockquote>
       <p>お問い合わせは 03-1234-5678 まで。</p>`,
    );
    const { info } = analyze(html);
    // 見出し 1 + 日本語 2 + 英語 2 + 日本語 1 = 6 文
    expect(info.totalSentences).toBe(6);
    expect(info.concreteSentences).toBe(4);
  });

  it("既存の日本語ページの判定は変わらない（長いだけで具体情報が無い → 未対応）", () => {
    const { check } = analyze(page(`<p>${"弊社は価値を提供する会社です。".repeat(250)}</p>`));
    expect(check?.status).toBe("fail");
  });

  it("判定根拠（総文数・言語・基準・実例）をレポートに出す", () => {
    const html = page(
      `<h1>Wolf</h1>${Array.from(
        { length: 8 },
        (_, i) => `<p>We served ${i + 1} clients in 2024 and opened ${i + 1} stores.</p>`,
      ).join("")}<p>We deliver value.</p><p>We care about quality.</p>`,
      "en",
    );
    const { check } = analyze(html);
    expect(check?.evidence).toMatch(/全 \d+ 文/);
    expect(check?.evidence).toContain("判定言語 英語");
    expect(check?.evidence).toContain("基準 比率");
    expect(check?.details?.length).toBeGreaterThan(0);
    expect(check?.details?.[0]).toContain("事実を含むと判定した文");
  });
});

describe("measureSpecificity", () => {
  it("文の数がいちばん多い言語を判定言語として返す", () => {
    const blocks = extractBlocks(
      cheerio.load(
        '<body><p lang="en">We have 12 stores. We serve 240 people.</p><p lang="ja">よろしくお願いします。</p></body>',
      ),
    );
    const spec = measureSpecificity(blocks, documentLanguage(null, ""));
    expect(spec.total).toBe(3);
    expect(spec.concrete).toBe(2);
    expect(spec.language.code).toBe("en");
    expect(spec.examples).toHaveLength(2);
  });
});
