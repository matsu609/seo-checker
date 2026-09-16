/**
 * 代理店アカウントと担当の結びつきのテスト。
 *
 * ここを間違えると、代理店に他人のお客様が見えたり、お客様が自分で代理店に化けたりする。
 * 管理者判定（admin.test.ts）と同じく「閉じる方向に倒れているか」を重点的に固定する。
 */
import { describe, expect, it } from "vitest";
import {
  AGENCY_KEY,
  AGENCY_ROLE,
  ROLE_KEY,
  agencyIdFromMetadata,
  canAssignAgency,
  isAgencyMetadata,
  isUserId,
  normalizeEmail,
  withAgencyId,
  withAgencyRole,
} from "../roles";

const AGENCY = "user_2abcDEF123";
const CLIENT = "user_9zzzYYY987";

describe("代理店かどうか", () => {
  it("role が agency のときだけ代理店", () => {
    expect(isAgencyMetadata({ [ROLE_KEY]: AGENCY_ROLE })).toBe(true);
    expect(isAgencyMetadata({ [ROLE_KEY]: "Agency" })).toBe(false);
    expect(isAgencyMetadata({ [ROLE_KEY]: "admin" })).toBe(false);
    expect(isAgencyMetadata({ [ROLE_KEY]: true })).toBe(false);
  });

  it("metadata が無い・壊れているときは代理店でない", () => {
    expect(isAgencyMetadata(null)).toBe(false);
    expect(isAgencyMetadata(undefined)).toBe(false);
    expect(isAgencyMetadata("agency")).toBe(false);
    expect(isAgencyMetadata([AGENCY_ROLE])).toBe(false);
    expect(isAgencyMetadata({})).toBe(false);
  });
});

describe("担当代理店の読み取り", () => {
  it("ユーザー ID の形のときだけ返す", () => {
    expect(agencyIdFromMetadata({ [AGENCY_KEY]: AGENCY })).toBe(AGENCY);
  });

  // 手で入れた値や旧い書き方が「担当」として通らないようにする
  it("形の違う値は担当なし", () => {
    expect(agencyIdFromMetadata({ [AGENCY_KEY]: "" })).toBeNull();
    expect(agencyIdFromMetadata({ [AGENCY_KEY]: "agency@example.com" })).toBeNull();
    expect(agencyIdFromMetadata({ [AGENCY_KEY]: "org_123" })).toBeNull();
    expect(agencyIdFromMetadata({ [AGENCY_KEY]: 123 })).toBeNull();
    expect(agencyIdFromMetadata({ [AGENCY_KEY]: null })).toBeNull();
    expect(agencyIdFromMetadata(null)).toBeNull();
  });

  it("ユーザー ID の形", () => {
    expect(isUserId(AGENCY)).toBe(true);
    expect(isUserId("user_")).toBe(false);
    expect(isUserId("user_abc-def")).toBe(false);
    expect(isUserId(" user_abc")).toBe(false);
    expect(isUserId(null)).toBe(false);
  });
});

describe("publicMetadata の書き換え", () => {
  // publicMetadata は丸ごと置き換わるので、他のキーを落とすとプランや契約が消える
  it("他のキーを残す", () => {
    const before = { plan: "standard", featureOverrides: ["writing"], stripe: { subscriptionId: "sub_1" } };
    expect(withAgencyRole(before, true)).toMatchObject(before);
    expect(withAgencyId(before, AGENCY)).toMatchObject(before);
  });

  it("代理店にする・やめる", () => {
    expect(withAgencyRole({}, true)[ROLE_KEY]).toBe(AGENCY_ROLE);
    // 消すのではなく null を入れる（Clerk が「置き換え」でも「マージ」でも代理店でなくなる）
    expect(withAgencyRole({ [ROLE_KEY]: AGENCY_ROLE }, false)[ROLE_KEY]).toBeNull();
  });

  it("担当を付ける・外す", () => {
    expect(withAgencyId({}, AGENCY)[AGENCY_KEY]).toBe(AGENCY);
    expect(withAgencyId({ [AGENCY_KEY]: AGENCY }, null)[AGENCY_KEY]).toBeNull();
  });

  it("形の違う担当は保存しない", () => {
    expect(withAgencyId({}, "agency@example.com")[AGENCY_KEY]).toBeNull();
    expect(withAgencyId({}, "")[AGENCY_KEY]).toBeNull();
  });
});

describe("担当を付けてよいか", () => {
  it("代理店と登録者が別ならよい", () => {
    expect(canAssignAgency(CLIENT, AGENCY)).toBe(true);
  });

  it("担当なしはいつでもよい", () => {
    expect(canAssignAgency(CLIENT, null)).toBe(true);
  });

  // 自分を自分の担当にすると、代理店画面に自分が並び、誰の担当かも追えなくなる
  it("自分自身は担当にできない", () => {
    expect(canAssignAgency(AGENCY, AGENCY)).toBe(false);
  });

  it("ユーザー ID の形が違えば付けない", () => {
    expect(canAssignAgency(CLIENT, "org_123")).toBe(false);
    expect(canAssignAgency("", AGENCY)).toBe(false);
  });
});

describe("メールアドレスの正規化", () => {
  it("前後の空白を落として小文字にする", () => {
    expect(normalizeEmail("  Agency@Example.COM ")).toBe("agency@example.com");
  });

  it("メールに見えない値は null", () => {
    expect(normalizeEmail("agency")).toBeNull();
    expect(normalizeEmail("agency@example")).toBeNull();
    expect(normalizeEmail("a b@example.com")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});
