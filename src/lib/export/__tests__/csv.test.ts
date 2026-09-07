import { describe, expect, it } from "vitest";
import { csvCell, csvFileName, toCsv } from "../csv";

describe("csvCell", () => {
  it("区切り・引用符・改行を含む値を引用符で囲む", () => {
    expect(csvCell("あ")).toBe("あ");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("空の値は空欄", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(false)).toBe("false");
  });
  it("数式として解釈される先頭文字を無効化する", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("+81")).toBe("'+81");
    expect(csvCell("@x")).toBe("'@x");
  });
});

describe("toCsv", () => {
  it("見出し行と本文を CRLF でつなぐ", () => {
    const rows = [{ a: 1, b: "x,y" }];
    const csv = toCsv(
      [
        { header: "A", value: (r: (typeof rows)[number]) => r.a },
        { header: "B", value: (r: (typeof rows)[number]) => r.b },
      ],
      rows,
    );
    expect(csv).toBe('A,B\r\n1,"x,y"');
  });
  it("行が無くても見出しは出す", () => {
    expect(toCsv([{ header: "A", value: () => "" }], [])).toBe("A");
  });
});

describe("csvFileName", () => {
  it("ASCII だけにして日付を付ける", () => {
    expect(csvFileName("順位計測")).toBe("export.csv");
    expect(csvFileName("rank_example.com")).toBe("rank_example.com.csv");
    expect(csvFileName("rank", new Date("2026-09-07T00:00:00Z"))).toMatch(/^rank_2026090[67]\.csv$/);
  });
});
