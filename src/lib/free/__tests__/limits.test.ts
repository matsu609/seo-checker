import { describe, expect, it } from "vitest";
import { FREE_SITE_MAX_PAGES, freeSiteMaxPages, truncationNote } from "../limits";

describe("クイック診断のページ数上限", () => {
  it("未設定なら既定の 10 ページ", () => {
    expect(freeSiteMaxPages(undefined)).toBe(FREE_SITE_MAX_PAGES);
    expect(freeSiteMaxPages("")).toBe(FREE_SITE_MAX_PAGES);
    expect(freeSiteMaxPages("あ")).toBe(FREE_SITE_MAX_PAGES);
    expect(freeSiteMaxPages("0")).toBe(FREE_SITE_MAX_PAGES);
  });

  it("環境変数で変えられるが 50 を超えない", () => {
    expect(freeSiteMaxPages("20")).toBe(20);
    expect(freeSiteMaxPages("500")).toBe(50);
  });
});

describe("打ち切りの案内", () => {
  it("上限で打ち切り、まだ残りがあるときだけ出す", () => {
    const note = truncationNote({ discovered: 128, analyzed: 10, truncated: { reason: "max-pages" } });
    expect(note).toContain("128");
    expect(note).toContain("10");
    expect(note).toContain("118");
    expect(note).toContain("精密診断");
  });

  it("全部診断できたときは出さない", () => {
    expect(truncationNote({ discovered: 10, analyzed: 10, truncated: null })).toBeNull();
    expect(truncationNote({ discovered: 4, analyzed: 4 })).toBeNull();
    expect(truncationNote(null)).toBeNull();
  });

  it("時間切れで止まったときは「残りは精密診断で」と言わない", () => {
    expect(truncationNote({ discovered: 128, analyzed: 8, truncated: { reason: "time-budget" } })).toBeNull();
  });
});
