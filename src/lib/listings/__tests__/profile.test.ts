/**
 * 基本情報: 取り込み・表記ゆれの比較・貼り付け用の文・営業時間の解釈・構造化データ・掲載状況の集計。
 */
import { describe, expect, it } from "vitest";
import { buildSameAs, compareNap, emptyProfile, jsonLdScript, ListingProfileSchema, ListingStateSchema, normalizeForCompare, parseHoursLine, prefillFromGoogle, profileToText, summarizeStates, toJsonLd, type ListingStates } from "../profile";

const GOOGLE = { name: "テスト食堂 駅前店", address: "日本、〒160-0021 東京都新宿区歌舞伎町1-1-1", phone: "03-1234-5678", website: "https://example.com/", hours: ["月曜日: 10時00分～19時00分", "火曜日: 定休日"], category: "食堂" };

describe("取り込みと比較", () => {
  it("Google の公開情報は空欄だけを埋める", () => {
    const p = prefillFromGoogle({ ...emptyProfile(), name: "テスト食堂" }, GOOGLE);
    expect(p.name).toBe("テスト食堂");
    expect(p.address).toContain("歌舞伎町");
    expect(p.phone).toBe("03-1234-5678");
    expect(p.hours).toBe("月曜日: 10時00分～19時00分\n火曜日: 定休日");
    expect(p.category).toBe("食堂");
  });

  it("表記ゆれ: 全角 / 半角・空白・ハイフン・末尾スラッシュは同じ、住所は包含で同じ", () => {
    expect(normalizeForCompare("０３−１２３４ー５６７８")).toBe(normalizeForCompare("03-1234-5678"));
    const same = { ...emptyProfile(), name: "テスト食堂　駅前店", address: "東京都新宿区歌舞伎町1-1-1", phone: "０３-１２３４-５６７８", website: "http://www.example.com" };
    expect(compareNap(same, GOOGLE)).toEqual([]);
    const diff = compareNap({ ...same, phone: "03-9999-0000", name: "テスト食堂 本店" }, GOOGLE);
    expect(diff.map((d) => d.field)).toEqual(["name", "phone"]);
    expect(compareNap(emptyProfile(), GOOGLE)).toEqual([]);
  });

  it("貼り付け用の文は入力した項目だけ", () => {
    const t = profileToText({ ...emptyProfile(), name: "A", phone: "1", longDescription: "説明" });
    expect(t).toBe("店名: A\n電話番号: 1\n説明文:\n説明");
  });
});

describe("営業時間と構造化データ", () => {
  it("日本語・英語・定休日", () => {
    expect(parseHoursLine("月曜日: 10時00分～19時00分")).toEqual({ "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "10:00", closes: "19:00" });
    expect(parseHoursLine("土: 11:30〜23:00")).toMatchObject({ dayOfWeek: "Saturday", opens: "11:30", closes: "23:00" });
    expect(parseHoursLine("Sun: 9 AM – 5 PM")).toMatchObject({ dayOfWeek: "Sunday", opens: "09:00", closes: "17:00" });
    expect(parseHoursLine("火曜日: 定休日")).toBeNull();
    expect(parseHoursLine("祝日は要問い合わせ")).toBeNull();
  });

  it("LocalBusiness の JSON-LD（</script> は閉じられない）", () => {
    const p = { ...emptyProfile(), name: "テスト食堂", postalCode: "160-0021", address: "東京都新宿区歌舞伎町1-1-1", phone: "03-1234-5678", website: "https://example.com/", hours: "月曜日: 10:00〜19:00\n火曜日: 定休日", shortDescription: "短い</script><b>x" };
    const ld = toJsonLd(p);
    expect(ld).toMatchObject({ "@type": "LocalBusiness", name: "テスト食堂", telephone: "03-1234-5678", address: { "@type": "PostalAddress", postalCode: "160-0021", addressCountry: "JP" } });
    expect((ld.openingHoursSpecification as unknown[]).length).toBe(1);
    const script = jsonLdScript(p);
    expect(script.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(script).not.toContain("</script><b>");
    expect(script).toContain("<\\/script>");
    expect(toJsonLd(emptyProfile())).toEqual({ "@context": "https://schema.org", "@type": "LocalBusiness" });
  });
});

describe("掲載状況", () => {
  it("集計は対象外を除き、自分で登録できる媒体を別に数える", () => {
    const s = summarizeStates({ GOOGLE_MAPS: ListingStateSchema.parse({ status: "live", url: "", note: "", updatedAt: null }), SIRI: ListingStateSchema.parse({ status: "live", url: "", note: "", updatedAt: null }), ACOMPIO: ListingStateSchema.parse({ status: "skip", url: "", note: "", updatedAt: null }), BING: ListingStateSchema.parse({ status: "submitted", url: "", note: "", updatedAt: null }) });
    expect(s.live).toBe(2);
    expect(s.submitted).toBe(1);
    expect(s.selfLive).toBe(1);
    expect(s.total).toBe(s.live + s.submitted + s.todo);
    expect(s.selfTotal).toBeGreaterThan(10);
  });

  it("スキーマは空でも通り、長すぎる値は弾く", () => {
    expect(ListingProfileSchema.parse({})).toEqual(emptyProfile());
    expect(ListingProfileSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });
});

describe("sameAs（構造化データ）", () => {
  const base = ListingProfileSchema.parse({
    name: "テスト商会 新宿店",
    legalName: "株式会社テスト商会",
    corporateNumber: "1234567890123",
    website: "https://example.com",
    phone: "03-1234-5678",
  });
  const states: ListingStates = {
    YAHOO_PLACE: ListingStateSchema.parse({ status: "live", url: "https://loco.yahoo.co.jp/place/1/", note: "", updatedAt: null }),
    // 掲載済みでない媒体の URL は入れない（まだ載っていないものを「同じ会社だ」と言わない）
    EKITEN: ListingStateSchema.parse({ status: "submitted", url: "https://www.ekiten.jp/shop/1/", note: "", updatedAt: null }),
    // 掲載済みでも URL を控えていなければ入れようがない
    BING: ListingStateSchema.parse({ status: "live", url: "", note: "", updatedAt: null }),
  };

  it("法人番号の公的な URL・掲載済みの媒体・利用者の入力を集める", () => {
    const profile = { ...base, socialUrls: "https://www.instagram.com/test/\nhttps://x.com/test" };
    const sameAs = buildSameAs(profile, states);
    expect(sameAs.some((u) => u.includes("houjin-bangou"))).toBe(true);
    expect(sameAs.some((u) => u.includes("gbiz"))).toBe(true);
    expect(sameAs).toContain("https://loco.yahoo.co.jp/place/1/");
    expect(sameAs).toContain("https://www.instagram.com/test/");
    expect(sameAs).toContain("https://x.com/test");
    expect(sameAs).not.toContain("https://www.ekiten.jp/shop/1/");
  });

  // sameAs は「よそにある自分」。自社サイトは url に入るので二重に書かない
  it("自社サイトは入れない", () => {
    expect(buildSameAs({ ...base, socialUrls: "https://example.com/" })).not.toContain("https://example.com/");
  });

  it("同じ URL は 1 つにまとめ、https 以外は捨てる", () => {
    const profile = { ...base, corporateNumber: "", socialUrls: "https://x.com/test\nhttps://x.com/test\nhttp://x.com/old\nただの文字列" };
    expect(buildSameAs(profile)).toEqual(["https://x.com/test"]);
  });

  it("法人番号が無ければ公的な URL は出ない（個人事業主）", () => {
    expect(buildSameAs({ ...base, corporateNumber: "" })).toEqual([]);
  });
});

describe("toJsonLd の追加項目", () => {
  const profile = ListingProfileSchema.parse({
    name: "テスト商会 新宿店",
    legalName: "株式会社テスト商会",
    corporateNumber: "1234567890123",
    website: "https://example.com",
    socialUrls: "https://x.com/test",
  });

  it("legalName・identifier（法人番号）・sameAs を出す", () => {
    const ld = toJsonLd(profile);
    expect(ld.legalName).toBe("株式会社テスト商会");
    expect(ld.identifier).toEqual({ "@type": "PropertyValue", propertyID: "法人番号", value: "1234567890123" });
    expect(ld.sameAs).toContain("https://x.com/test");
  });

  // 同じ名前を 2 回書かない
  it("登記上の商号が店名と同じなら legalName は出さない", () => {
    expect(toJsonLd({ ...profile, name: "株式会社テスト商会" }).legalName).toBeUndefined();
  });

  it("法人番号が無ければ identifier は出さない", () => {
    expect(toJsonLd({ ...profile, corporateNumber: "" }).identifier).toBeUndefined();
  });

  it("sameAs が空なら項目ごと出さない（空配列を書かない）", () => {
    expect(toJsonLd(ListingProfileSchema.parse({ name: "あ" })).sameAs).toBeUndefined();
  });

  // 精密診断（src/lib/analyzer/jsonld.ts）が sameAs 有りと判定できる形であること
  it("LocalBusiness + sameAs なので、自社の診断の sameAs チェックを通る形になる", () => {
    const ld = toJsonLd(profile);
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(Array.isArray(ld.sameAs) && (ld.sameAs as unknown[]).length > 0).toBe(true);
  });
});
