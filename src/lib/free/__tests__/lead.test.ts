/**
 * 登録情報（担当者名・会社名・電話・店舗の種類）の検証と、Clerk のメタデータからの読み取り。
 */
import { describe, expect, it } from "vitest";
import { LEAD_KEY, leadFromMetadata, LeadProfileSchema, STORE_TYPES } from "../lead";

const LEAD = { contactName: "山田 太郎", company: "〇〇歯科クリニック", phone: "03-1234-5678", storeType: "クリニック・医院・歯科" };
/** 読み取り結果（任意項目の所在地・地域は空文字で補われる） */
const READ = { ...LEAD, address: "", region: "" };

describe("登録情報の検証", () => {
  it("4 項目そろっていれば通り、前後の空白は落とす", () => {
    const r = LeadProfileSchema.safeParse({ ...LEAD, contactName: "  山田 太郎 " });
    expect(r.success).toBe(true);
    expect(r.success && r.data.contactName).toBe("山田 太郎");
  });

  it("空・長すぎ・店舗の種類が選択肢に無い・電話に文字、は通さない", () => {
    expect(LeadProfileSchema.safeParse({ ...LEAD, contactName: "" }).success).toBe(false);
    expect(LeadProfileSchema.safeParse({ ...LEAD, company: "a".repeat(101) }).success).toBe(false);
    expect(LeadProfileSchema.safeParse({ ...LEAD, storeType: "宇宙船" }).success).toBe(false);
    expect(LeadProfileSchema.safeParse({ ...LEAD, phone: "電話はありません" }).success).toBe(false);
    // 全角の数字・ハイフンは通す（入力そのものを保存し、判定はしない）
    expect(LeadProfileSchema.safeParse({ ...LEAD, phone: "０３－１２３４－５６７８" }).success).toBe(true);
  });

  it("所在地・地域は任意。登録フォームの 4 項目だけでも通り、空文字で補われる", () => {
    const r = LeadProfileSchema.safeParse(LEAD);
    expect(r.success && r.data.address).toBe("");
    expect(r.success && r.data.region).toBe("");
    const withExtra = LeadProfileSchema.safeParse({ ...LEAD, address: " 東京都千代田区 1-1 ", region: "千代田区" });
    expect(withExtra.success && withExtra.data.address).toBe("東京都千代田区 1-1");
    expect(LeadProfileSchema.safeParse({ ...LEAD, address: "a".repeat(201) }).success).toBe(false);
  });

  it("店舗の種類には「その他」がある", () => {
    expect(STORE_TYPES).toContain("その他");
    expect(STORE_TYPES).toContain("飲食店");
  });
});

describe("メタデータからの読み取り", () => {
  it("public（直した値）が unsafe（登録時の値）より優先。無ければ null", () => {
    expect(leadFromMetadata(null, null)).toBeNull();
    expect(leadFromMetadata({ [LEAD_KEY]: LEAD }, null)).toEqual(READ);
    expect(leadFromMetadata(null, { [LEAD_KEY]: LEAD })).toEqual(READ);
    expect(leadFromMetadata({ [LEAD_KEY]: { ...LEAD, company: "直した会社名" } }, { [LEAD_KEY]: LEAD })?.company).toBe("直した会社名");
    // 壊れた値は無視して次を見る
    expect(leadFromMetadata({ [LEAD_KEY]: { contactName: "だけ" } }, { [LEAD_KEY]: LEAD })).toEqual(READ);
  });
});
