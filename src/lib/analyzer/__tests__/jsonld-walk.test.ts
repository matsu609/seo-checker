import { describe, expect, it } from "vitest";
import { displayWidth as auditDisplayWidth, fullWidthCount as auditFullWidthCount } from "@/lib/audit/parse";
import { displayWidth as reportDisplayWidth, fullWidthCount as reportFullWidthCount } from "@/lib/page-report/extract";
import { stripTypePrefix, typeNamesOf, walkJsonLd } from "../jsonld-walk";
import { displayWidth, fullWidthCount, safeOrigin } from "../text";

/** 2026-09-23 に複製をまとめた共通の道具。出力が以前と同じであることを確かめる */

describe("walkJsonLd", () => {
  it("@graph・入れ子・配列をすべて辿る", () => {
    const seen: string[] = [];
    walkJsonLd(
      { "@graph": [{ "@type": "WebPage", hasPart: { "@type": "FAQPage", mainEntity: [{ "@type": "Question" }] } }] },
      (obj) => {
        if (typeof obj["@type"] === "string") seen.push(obj["@type"]);
      },
    );
    expect(seen).toEqual(["WebPage", "FAQPage", "Question"]);
  });
});

describe("@type の読み方", () => {
  it("接頭辞と URL 形式を素の名前にし、文字列以外は捨てる", () => {
    expect(stripTypePrefix("schema:FAQPage")).toBe("FAQPage");
    expect(stripTypePrefix("https://schema.org/Organization")).toBe("Organization");
    expect(stripTypePrefix("http://schema.org#Dentist")).toBe("Dentist");
    expect(typeNamesOf(["schema:Organization", 3, "Dentist"])).toEqual(["Organization", "Dentist"]);
    expect(typeNamesOf(undefined)).toEqual([]);
  });
});

describe("表示幅", () => {
  it("全角を 2、半角を 1 と数え、全角換算は切り上げ", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("日本語")).toBe(6);
    expect(fullWidthCount("日本a")).toBe(3);
  });

  it("サイト診断とページ診断が同じ関数を使う", () => {
    expect(auditDisplayWidth).toBe(displayWidth);
    expect(reportDisplayWidth).toBe(displayWidth);
    expect(auditFullWidthCount).toBe(fullWidthCount);
    expect(reportFullWidthCount).toBe(fullWidthCount);
  });

  it("safeOrigin は読めない URL で空文字", () => {
    expect(safeOrigin("https://example.test/a?b")).toBe("https://example.test");
    expect(safeOrigin("not a url")).toBe("");
  });
});
