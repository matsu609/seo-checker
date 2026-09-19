import { describe, expect, it } from "vitest";
import { fetchJpRegisteredAt, isJpDomain, isJprsNotFound, parseJprsRegisteredAt } from "../whois-jp";

const GENERIC_JP = `[ JPRS database provides information on network administration. Its use is    ]
Domain Information:
[Domain Name]                   EXAMPLE.JP
[Registrant]                    Example Inc.
[Name Server]                   ns1.example.jp
[Created on]                    2015/03/24
[Expires on]                    2027/03/31
[Status]                        Active
[Last Updated]                  2026/04/01 01:05:00 (JST)`;

const ATTR_JP = `Domain Information: [ドメイン情報]
a. [ドメイン名]                 EXAMPLE.CO.JP
e. [そしきめい]                 かぶしきがいしゃ さんぷる
[登録年月日]                    1999/12/01
[接続年月日]                    2000/01/15
[最終更新]                      2025/12/01 01:01:01 (JST)`;

const ENGLISH_ATTR = `[Registered Date]               2008/05/19
[Connected Date]                2008/05/20`;

describe("JPRS WHOIS の読み取り", () => {
  it("汎用 JP の [Created on]、属性型の [登録年月日]、英語表記の [Registered Date] から登録日を取る", () => {
    expect(parseJprsRegisteredAt(GENERIC_JP)).toBe("2015-03-24T00:00:00.000Z");
    expect(parseJprsRegisteredAt(ATTR_JP)).toBe("1999-12-01T00:00:00.000Z");
    expect(parseJprsRegisteredAt(ENGLISH_ATTR)).toBe("2008-05-19T00:00:00.000Z");
    expect(parseJprsRegisteredAt("nothing here")).toBeNull();
  });

  it("未登録の応答を見分ける", () => {
    expect(isJprsNotFound("No match!!\n")).toBe(true);
    expect(isJprsNotFound(GENERIC_JP)).toBe(false);
  });

  it(".jp 以外には問い合わせない", async () => {
    expect(isJpDomain("example.co.jp")).toBe(true);
    expect(isJpDomain("example.com")).toBe(false);
    const r = await fetchJpRegisteredAt("example.com", { query: async () => GENERIC_JP });
    expect(r.failure).toBe("not-jp");
  });

  it("問い合わせの結果を登録日にし、接続失敗は network（報告書は止めない）", async () => {
    const ok = await fetchJpRegisteredAt("ok-sample.jp", { query: async () => GENERIC_JP });
    expect(ok).toEqual({ registeredAt: "2015-03-24T00:00:00.000Z", failure: null, message: null });
    const missing = await fetchJpRegisteredAt("missing-sample.jp", { query: async () => "No match!!" });
    expect(missing.failure).toBe("not-found");
    const down = await fetchJpRegisteredAt("down-sample.jp", {
      query: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(down.failure).toBe("network");
    expect(down.registeredAt).toBeNull();
  });
});
