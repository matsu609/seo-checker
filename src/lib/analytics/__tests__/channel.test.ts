import { describe, expect, it } from "vitest";
import { classify, hostOf } from "../channel";

describe("流入元の分類", () => {
  it("参照元が無ければ direct、自サイトなら internal", () => {
    expect(classify("", "example.jp").channel).toBe("direct");
    expect(classify("www.example.jp", "example.jp").channel).toBe("internal");
    expect(classify("example.jp", "www.example.jp").channel).toBe("internal");
  });

  it("検索エンジン・生成 AI・SNS を名前つきで分ける", () => {
    expect(classify("www.google.com", "example.jp")).toEqual({ channel: "search", source: "Google" });
    expect(classify("search.yahoo.co.jp", "example.jp")).toEqual({ channel: "search", source: "Yahoo! JAPAN" });
    expect(classify("chatgpt.com", "example.jp").channel).toBe("ai");
    expect(classify("chatgpt.com", "example.jp").source.length).toBeGreaterThan(0);
    expect(classify("l.instagram.com", "example.jp")).toEqual({ channel: "social", source: "Instagram" });
    expect(classify("t.co", "example.jp")).toEqual({ channel: "social", source: "X（Twitter）" });
  });

  it("知らないサイトは referral（ホスト名を内訳に）", () => {
    expect(classify("blog.example.com", "example.jp")).toEqual({ channel: "referral", source: "blog.example.com" });
  });

  it("UTM の medium は参照元より優先する（QR や LINE 公式からの流入を拾う）", () => {
    expect(classify("www.google.com", "example.jp", { medium: "cpc", source: "google" })).toEqual({ channel: "ad", source: "google" });
    expect(classify("", "example.jp", { medium: "social", source: "line" })).toEqual({ channel: "social", source: "line" });
    // 参照元が無くても source があればキャンペーン扱い（チラシの QR など）
    expect(classify("", "example.jp", { source: "flyer" })).toEqual({ channel: "referral", source: "flyer" });
  });

  it("hostOf は URL でもホスト名でも同じ結果", () => {
    expect(hostOf("https://www.Google.com/search?q=x")).toBe("google.com");
    expect(hostOf("WWW.example.jp")).toBe("example.jp");
    expect(hostOf("")).toBe("");
  });
});
