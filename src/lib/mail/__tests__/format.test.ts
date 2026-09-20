import { describe, expect, it } from "vitest";
import { buildMail, escapeHtml, textToHtml } from "../format";
import { isValidAddress } from "../send";

describe("メールの本文", () => {
  it("件名に接頭辞、本文にリンクと署名", () => {
    const m = buildMail("順位が下がりました", "本文です", { label: "画面で見る", path: "/tools/rank" });
    expect(m.subject).toBe("【SEO Checker】順位が下がりました");
    expect(m.text).toContain("画面で見る: https://app.seo-checker.tokyo/tools/rank");
    expect(m.text).toContain("通知の設定: https://app.seo-checker.tokyo/settings");
    expect(m.html).toContain('<a href="https://app.seo-checker.tokyo/tools/rank">');
  });

  it("HTML はエスケープし、URL だけリンクにする", () => {
    expect(escapeHtml('<b>"x" & y</b>')).toBe("&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
    const html = textToHtml("a <script>\n\nb https://x.jp/?q=1");
    expect(html).toContain("a &lt;script&gt;");
    expect(html).toContain('<a href="https://x.jp/?q=1">https://x.jp/?q=1</a>');
  });

  it("宛先の形", () => {
    expect(isValidAddress("a@b.jp")).toBe(true);
    expect(isValidAddress("a@b")).toBe(false);
    expect(isValidAddress("a@b.jp\nbcc: c@d.jp")).toBe(false);
  });
});
