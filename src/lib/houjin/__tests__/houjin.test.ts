/**
 * 法人番号: 検査用数字・XML の解析・登記との突き合わせ・クライアントの呼び出しの形。
 *
 * ⚠ 実物の応答はこの環境から取れない（ネットワークポリシーで 403）。
 * ここで固定しているのは「公表仕様どおりの XML が来たら正しく読めること」と
 * 「要素名が違っても全体が壊れないこと」の 2 つ。
 */
import { describe, expect, it, vi } from "vitest";
import { ListingProfileSchema } from "@/lib/listings/profile";
import { fetchByNumber, searchByName } from "../client";
import { gbizInfoUrl, houjinBangouUrl, isValidCorporateNumber, publicRegistryUrls } from "../constants";
import { compareWithRegistry, prefillFromRegistry } from "../compare";
import { formatPostCode, joinAddress, parseCorporations, sortCorporations } from "../parse";

/** 検査用数字が正しい 13 桁（下 12 桁から計算して先頭に付けた） */
function withCheckDigit(body12: string): string {
  const digits = body12.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const fromRight = digits.length - i;
    sum += digits[i]! * (fromRight % 2 === 1 ? 1 : 2);
  }
  return `${9 - (sum % 9)}${body12}`;
}

const NUMBER = withCheckDigit("234567890123");

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<corporations>
  <lastUpdateDate>2026-09-19</lastUpdateDate>
  <count>2</count>
  <corporation>
    <corporateNumber>${NUMBER}</corporateNumber>
    <name>株式会社テスト商会</name>
    <furigana>テストシヨウカイ</furigana>
    <kind>301</kind>
    <prefectureName>東京都</prefectureName>
    <cityName>新宿区</cityName>
    <streetNumber>新宿一丁目1番1号</streetNumber>
    <postCode>1600022</postCode>
    <changeDate>2026-01-01</changeDate>
    <assignmentDate>2015-10-05</assignmentDate>
    <closeDate></closeDate>
    <latest>1</latest>
  </corporation>
  <corporation>
    <corporateNumber>${withCheckDigit("111111111111")}</corporateNumber>
    <name>解散した株式会社テスト</name>
    <kind>301</kind>
    <prefectureName>東京都</prefectureName>
    <cityName>渋谷区</cityName>
    <streetNumber>渋谷二丁目2番2号</streetNumber>
    <closeDate>2024-03-31</closeDate>
    <latest>1</latest>
  </corporation>
</corporations>`;

describe("検査用数字", () => {
  it("正しい 13 桁を通し、1 桁変えたものを弾く", () => {
    expect(isValidCorporateNumber(NUMBER)).toBe(true);
    const wrong = `${(Number(NUMBER[0]) + 1) % 10}${NUMBER.slice(1)}`;
    expect(isValidCorporateNumber(wrong)).toBe(false);
  });

  it("桁数が違えば弾く", () => {
    expect(isValidCorporateNumber("123")).toBe(false);
    expect(isValidCorporateNumber("")).toBe(false);
    expect(isValidCorporateNumber("abcdefghijklm")).toBe(false);
  });
});

describe("XML の解析", () => {
  it("商号・所在地・郵便番号・区分を読む", () => {
    const page = parseCorporations(XML);
    expect(page.count).toBe(2);
    expect(page.lastUpdateDate).toBe("2026-09-19");
    const first = page.corporations[0]!;
    expect(first.corporateNumber).toBe(NUMBER);
    expect(first.name).toBe("株式会社テスト商会");
    expect(first.kindLabel).toBe("株式会社");
    expect(first.postCode).toBe("160-0022");
    expect(first.address).toBe("東京都新宿区新宿一丁目1番1号");
    expect(first.closeDate).toBeNull();
  });

  // 要素名が変わっても全体が壊れない（CSV の列順で読むとズレるので XML にした）
  it("知らない要素名の項目だけが空になる", () => {
    const page = parseCorporations(XML.replace(/furigana/g, "kana"));
    expect(page.corporations[0]!.furigana).toBe("");
    expect(page.corporations[0]!.name).toBe("株式会社テスト商会");
  });

  it("法人番号が 13 桁でない行は捨てる", () => {
    const page = parseCorporations(`<corporations><corporation><corporateNumber>123</corporateNumber><name>壊れた</name></corporation></corporations>`);
    expect(page.corporations).toHaveLength(0);
  });

  it("壊れた応答でも落ちない", () => {
    expect(parseCorporations("")).toEqual({ corporations: [], count: null, lastUpdateDate: null });
    expect(parseCorporations("<<<").corporations).toEqual([]);
  });

  it("郵便番号と住所の組み立て", () => {
    expect(formatPostCode("1600022")).toBe("160-0022");
    expect(formatPostCode("あ")).toBe("あ");
    expect(joinAddress({ prefectureName: "東京都", cityName: "新宿区", streetNumber: "1-1", addressOutside: "" })).toBe("東京都新宿区1-1");
    // 国外の住所があればそちらを使う
    expect(joinAddress({ prefectureName: "東京都", cityName: "新宿区", streetNumber: "1-1", addressOutside: "New York" })).toBe("New York");
  });

  // 解散した会社を先頭に出すと選び間違える
  it("閉鎖した法人は後ろに回す", () => {
    const sorted = sortCorporations(parseCorporations(XML).corporations);
    expect(sorted[0]!.closeDate).toBeNull();
    expect(sorted[1]!.closeDate).toBe("2024-03-31");
  });
});

describe("公的な URL", () => {
  it("法人番号があるときだけ 2 本作る", () => {
    const urls = publicRegistryUrls(NUMBER);
    expect(urls).toHaveLength(2);
    expect(urls[0]!.url).toBe(houjinBangouUrl(NUMBER));
    expect(urls[1]!.url).toBe(gbizInfoUrl(NUMBER));
    for (const u of urls) expect(u.url).toContain(NUMBER);
    expect(publicRegistryUrls("")).toEqual([]);
    expect(publicRegistryUrls("123")).toEqual([]);
  });
});

describe("登記との突き合わせ", () => {
  const corporation = parseCorporations(XML).corporations[0]!;

  it("同じなら match", () => {
    const profile = ListingProfileSchema.parse({ name: "株式会社テスト商会", address: "東京都新宿区新宿一丁目1番1号" });
    expect(compareWithRegistry(profile, corporation).map((f) => f.status)).toEqual(["match", "match"]);
  });

  // 店舗名は通称のことがある。住所は本店 ≠ 店舗のことがある。「間違い」と言い切らない
  it("違えば differs で、断定しない文言を出す", () => {
    const profile = ListingProfileSchema.parse({ name: "テスト商会 新宿店", address: "東京都渋谷区渋谷9-9-9" });
    const findings = compareWithRegistry(profile, corporation);
    expect(findings.map((f) => f.status)).toEqual(["differs", "differs"]);
    expect(findings[0]!.message).toContain("通称");
    expect(findings[1]!.message).toContain("店舗が本店と別の場所にあるなら正常");
  });

  it("住所は片方がもう片方を含めば同じと見なす（ビル名・階の有無）", () => {
    const profile = ListingProfileSchema.parse({ name: "株式会社テスト商会", address: "東京都新宿区新宿一丁目1番1号 テストビル 2F" });
    expect(compareWithRegistry(profile, corporation)[1]!.status).toBe("match");
  });

  it("空欄は比べない", () => {
    expect(compareWithRegistry(ListingProfileSchema.parse({}), corporation).map((f) => f.status)).toEqual(["unknown", "unknown"]);
  });

  it("取り込みは空欄だけを埋め、入っている値は上書きしない", () => {
    const profile = ListingProfileSchema.parse({ name: "テスト商会 新宿店" });
    const next = prefillFromRegistry(profile, corporation);
    expect(next.name).toBe("テスト商会 新宿店");
    expect(next.nameKana).toBe("テストシヨウカイ");
    expect(next.postalCode).toBe("160-0022");
    expect(next.address).toBe("東京都新宿区新宿一丁目1番1号");
  });

  it("埋めるものが無ければ同じ参照を返す", () => {
    const profile = ListingProfileSchema.parse({ name: "あ", nameKana: "い", postalCode: "1", address: "う" });
    expect(prefillFromRegistry(profile, corporation)).toBe(profile);
  });
});

describe("クライアント", () => {
  const ok = () => new Response(XML, { status: 200, headers: { "content-type": "application/xml" } });

  it("アプリケーション ID が無ければ呼ばない", async () => {
    const fetchImpl = vi.fn();
    const out = await searchByName("テスト", "", { fetchImpl: fetchImpl as unknown as typeof fetch, appId: "" });
    expect(out.failure).toBe("no-key");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("商号の検索は name エンドポイントに部分一致で送る", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return ok();
    });
    const out = await searchByName("テスト商会", "東京都", { fetchImpl: fetchImpl as unknown as typeof fetch, appId: "APPID", apiBase: "https://api.test/4" });
    expect(calls[0]).toContain("https://api.test/4/name?");
    expect(calls[0]).toContain("id=APPID");
    expect(calls[0]).toContain("mode=2");
    expect(calls[0]).toContain("type=12");
    expect(out.corporations).toHaveLength(2);
    expect(out.total).toBe(2);
  });

  // 打ち間違いで API を呼ばない
  it("検査用数字が合わない法人番号は呼ばずに弾く", async () => {
    const fetchImpl = vi.fn();
    const wrong = `${(Number(NUMBER[0]) + 1) % 10}${NUMBER.slice(1)}`;
    const out = await fetchByNumber(wrong, { fetchImpl: fetchImpl as unknown as typeof fetch, appId: "APPID" });
    expect(out.failure).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("HTTP のエラーは画面に出せる 1 文にする", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));
    const out = await searchByName("拒否される会社", "", { fetchImpl: fetchImpl as unknown as typeof fetch, appId: "APPID", apiBase: "https://api.test/4" });
    expect(out.failure).toBe("upstream");
    expect(out.message).toContain("HOUJIN_BANGOU_APP_ID");
    expect(out.corporations).toEqual([]);
  });

  it("接続できなければ network", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const out = await searchByName("落ちる会社", "", { fetchImpl: fetchImpl as unknown as typeof fetch, appId: "APPID", apiBase: "https://api.test/4" });
    expect(out.failure).toBe("network");
  });
});
