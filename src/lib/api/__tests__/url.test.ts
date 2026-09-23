/**
 * 口コミの投稿先など「来店客の画面で開くリンク」の検査（2026-09-23）。
 * zod 4 の z.string().url() は javascript: / data: も通すので、https:// だけに絞る。
 */
import { describe, expect, it } from "vitest";
import { httpsUrlSchema, isHttpsUrl, safeHttpsUrl } from "../url";

describe("https:// の URL だけを通す", () => {
  it("https の URL は通す", () => {
    expect(isHttpsUrl("https://search.google.com/local/writereview?placeid=abc")).toBe(true);
    expect(httpsUrlSchema().safeParse(" https://g.page/r/abc/review ").success).toBe(true);
  });

  it("javascript: / data: / http: / 形の崩れた値は通さない", () => {
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>alert(1)</script>", "http://example.com", "https://", "https//example.com", " javascript:alert(1)"]) {
      expect(isHttpsUrl(bad.trim()), bad).toBe(false);
      expect(httpsUrlSchema().safeParse(bad).success, bad).toBe(false);
    }
  });

  it("長すぎる値は通さない", () => {
    expect(httpsUrlSchema().safeParse(`https://example.com/${"a".repeat(500)}`).success).toBe(false);
  });

  it("保存済みの値を来店客に返す前の確認（だめなら null）", () => {
    expect(safeHttpsUrl("https://example.com/r")).toBe("https://example.com/r");
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl(1)).toBeNull();
  });
});
