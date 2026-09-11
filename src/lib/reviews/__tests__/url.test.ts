import { describe, expect, it } from "vitest";
import { contentDisposition, surveyPath } from "../url";

describe("来店客向けの URL", () => {
  it("slug と QR のコードからパスを作る", () => {
    expect(surveyPath("abcDEF123456")).toBe("/r/abcDEF123456");
    expect(surveyPath("abcDEF123456", "q672u5")).toBe("/r/abcDEF123456?c=q672u5");
    expect(surveyPath("abcDEF123456", null)).toBe("/r/abcDEF123456");
  });
});

describe("QR 画像の Content-Disposition", () => {
  it("ダウンロードなら attachment、日本語名は filename* に、ASCII の代替名も付く", () => {
    const d = contentDisposition(true, "QR_駅前店（レジ横）", "qr-abc-q672u5", "svg");
    expect(d.startsWith('attachment; filename="qr-abc-q672u5.svg"; filename*=UTF-8\'\'')).toBe(true);
    expect(decodeURIComponent(d.split("UTF-8''")[1]!)).toBe("QR_駅前店（レジ横）.svg");
  });

  it("プレビューなら inline。ファイル名に使えない文字は _ に", () => {
    const d = contentDisposition(false, 'a/b:c*"d', "qr-x", "png");
    expect(d.startsWith("inline;")).toBe(true);
    expect(decodeURIComponent(d.split("UTF-8''")[1]!)).toBe("a_b_c_d.png");
  });
});
