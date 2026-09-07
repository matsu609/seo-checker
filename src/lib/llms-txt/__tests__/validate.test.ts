import { describe, expect, it } from "vitest";
import { applyLinkStatuses, parseLlmsTxt, validateLlmsTxt, MAX_RECOMMENDED_BYTES } from "../validate";

const URL_UNDER_TEST = "https://example.co.jp/llms.txt";

const SAMPLE = `# サンプル工房

> 中小企業向けにウェブサイトの制作と運用支援を行う会社のサイトです。

制作から公開後の運用まで一貫して対応しています。

## 主要コンテンツ
- [サービス一覧](https://example.co.jp/service): 制作プランと運用プラン
- [料金](https://example.co.jp/price): 初期費用と月額の目安

## 会社情報
- [会社概要](https://example.co.jp/company): 設立年・所在地・事業内容
`;

function validate(text: string, found = true, status = 200) {
  return validateLlmsTxt(text, { url: URL_UNDER_TEST, found, status });
}

function levelOf(result: ReturnType<typeof validate>, id: string): string {
  const check = result.checks.find((c) => c.id === id);
  if (!check) throw new Error(`check not found: ${id}`);
  return check.level;
}

describe("llms.txt の読み取り", () => {
  it("見出し・概要・セクション・リンクを取り出す", () => {
    const parsed = parseLlmsTxt(SAMPLE);
    expect(parsed.title).toBe("サンプル工房");
    expect(parsed.summary).toBe("中小企業向けにウェブサイトの制作と運用支援を行う会社のサイトです。");
    expect(parsed.sections).toEqual(["主要コンテンツ", "会社情報"]);
    expect(parsed.links).toHaveLength(3);
    expect(parsed.links[0]).toMatchObject({
      title: "サービス一覧",
      url: "https://example.co.jp/service",
      description: "制作プランと運用プラン",
      section: "主要コンテンツ",
    });
    expect(parsed.links[2].section).toBe("会社情報");
  });

  it("説明の無いリンクも読める", () => {
    const parsed = parseLlmsTxt("# サイト\n\n## 一覧\n- [ページ](https://x.test/a)\n");
    expect(parsed.links[0].description).toBe("");
  });

  it("* の箇条書きも受け付ける", () => {
    const parsed = parseLlmsTxt("# サイト\n* [ページ](https://x.test/a): 説明\n");
    expect(parsed.links).toHaveLength(1);
  });

  it("見出しやリンクが無ければ空になる", () => {
    const parsed = parseLlmsTxt("ただのテキストです。\n");
    expect(parsed.title).toBeNull();
    expect(parsed.summary).toBeNull();
    expect(parsed.links).toEqual([]);
  });
});

describe("llms.txt の検証", () => {
  it("整った llms.txt はすべて問題なしになる", () => {
    const result = validate(SAMPLE);
    expect(result.present).toBe(true);
    expect(result.checks.filter((c) => c.level !== "pass")).toEqual([]);
    expect(result.title).toBe("サンプル工房");
    expect(result.links).toHaveLength(3);
  });

  it("取得できなければ present は false で、確認項目は 1 件だけ", () => {
    const result = validate("", false, 404);
    expect(result.present).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].level).toBe("fail");
    expect(result.checks[0].detail).toContain("404");
  });

  it("中身が空文字なら「無い」として扱う", () => {
    expect(validate("   \n  ", true, 200).present).toBe(false);
  });

  it("# 見出しが無ければ要対応", () => {
    expect(levelOf(validate("> 概要だけ\n- [a](https://x.test/a): 説明\n"), "title")).toBe("fail");
  });

  it("> の概要が無ければ確認", () => {
    expect(levelOf(validate("# サイト\n\n## 一覧\n- [a](https://x.test/a): 説明\n"), "summary")).toBe("warn");
  });

  it("リンクが 1 件も無ければ要対応", () => {
    expect(levelOf(validate("# サイト\n\n> 概要\n"), "links")).toBe("fail");
  });

  it("説明の付いたリンクの割合で判定が変わる", () => {
    const all = "# サイト\n- [a](https://x.test/a): 説明\n- [b](https://x.test/b): 説明\n";
    expect(levelOf(validate(all), "descriptions")).toBe("pass");
    const half = "# サイト\n- [a](https://x.test/a): 説明\n- [b](https://x.test/b)\n";
    expect(levelOf(validate(half), "descriptions")).toBe("warn");
    const none = "# サイト\n- [a](https://x.test/a)\n- [b](https://x.test/b)\n";
    expect(levelOf(validate(none), "descriptions")).toBe("fail");
  });

  it("相対 URL があれば確認", () => {
    expect(levelOf(validate("# サイト\n- [a](/service): 説明\n"), "absolute")).toBe("warn");
    expect(levelOf(validate("# サイト\n- [a](https://x.test/a): 説明\n"), "absolute")).toBe("pass");
  });

  it("大きすぎる・小さすぎるときはサイズを確認にする", () => {
    const huge = `# サイト\n\n> 概要\n\n${"あ".repeat(MAX_RECOMMENDED_BYTES)}\n- [a](https://x.test/a): 説明\n`;
    expect(levelOf(validate(huge), "size")).toBe("warn");
    expect(levelOf(validate("# サイト\n- [a](https://x.test/a): 説明\n"), "size")).toBe("warn");
    expect(levelOf(validate(SAMPLE), "size")).toBe("pass");
  });
});

describe("リンク切れの反映", () => {
  const base = validate(SAMPLE);

  it("すべて到達できれば問題なし", () => {
    const result = applyLinkStatuses(base, {
      "https://example.co.jp/service": 200,
      "https://example.co.jp/price": 200,
      "https://example.co.jp/company": 200,
    });
    expect(result.deadLinks).toBe(0);
    expect(levelOf(result, "dead-links")).toBe("pass");
    expect(result.links.every((l) => l.status === 200)).toBe(true);
  });

  it("4XX と接続不可を数える", () => {
    const result = applyLinkStatuses(base, {
      "https://example.co.jp/service": 200,
      "https://example.co.jp/price": 404,
      "https://example.co.jp/company": 0,
    });
    expect(result.deadLinks).toBe(2);
    expect(levelOf(result, "dead-links")).toBe("fail");
    expect(result.checks.find((c) => c.id === "dead-links")?.detail).toContain("404");
  });

  it("1 件も確認できなければ判定しない", () => {
    const result = applyLinkStatuses(base, {});
    expect(result.deadLinks).toBeNull();
    expect(levelOf(result, "dead-links")).toBe("warn");
  });
});
