/**
 * 管理アカウントの役割まわりのテスト。
 *
 * ここを間違えると、お客様が自分で管理アカウントに化けたり、管理アカウントどうしで
 * 権限を付け合えたりする。管理者判定（admin.test.ts）と同じく
 * 「閉じる方向に倒れているか」を重点的に固定する。
 */
import { describe, expect, it } from "vitest";
import {
  AGENCY_ROLE,
  ROLE_KEY,
  isAgencyMetadata,
  isManageableClient,
  isUserId,
  normalizeEmail,
  pickAgencyInvitation,
  withAgencyRole,
} from "../roles";

const AGENCY = "user_2abcDEF123";

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

describe("ユーザー ID の形", () => {
  // 招待の引き継ぎ（claimAgencyInvitation）と解除で、渡ってきた ID の形をここで絞る
  it("user_ + 英数字だけを通す", () => {
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
  });

  it("管理アカウントにする・やめる", () => {
    expect(withAgencyRole({}, true)[ROLE_KEY]).toBe(AGENCY_ROLE);
    // 消すのではなく null を入れる（Clerk が「置き換え」でも「マージ」でも管理アカウントでなくなる）
    expect(withAgencyRole({ [ROLE_KEY]: AGENCY_ROLE }, false)[ROLE_KEY]).toBeNull();
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

/**
 * 管理アカウントが触ってよい相手かどうか（2026-09-21 から担当は見ない）。
 * ここが緩むと、管理アカウントどうしで割引や機能開放を付け合えてしまう。
 */
describe("管理アカウントが扱える相手か", () => {
  it("ふつうの登録者はだれでも扱える", () => {
    expect(isManageableClient({})).toBe(true);
    expect(isManageableClient({ plan: "standard" })).toBe(true);
    expect(isManageableClient(null)).toBe(true);
  });

  // 管理アカウントどうしで割引や機能開放を付け合えると、権限の出どころが追えなくなる
  it("相手が管理アカウントなら扱えない", () => {
    expect(isManageableClient({ [ROLE_KEY]: AGENCY_ROLE })).toBe(false);
    expect(isManageableClient({ plan: "standard", [ROLE_KEY]: AGENCY_ROLE })).toBe(false);
  });
});

/**
 * 招待の取りこぼしを拾う判定（r137）。ここが緩むと、他人のアドレス宛の招待で
 * 管理アカウントになれてしまう。確認済みのメールだけ・完全一致だけを通す。
 */
describe("自分あての管理アカウントの招待を選ぶ", () => {
  const agencyInvite = { id: "inv_1", emailAddress: "staff@example.com", publicMetadata: { [ROLE_KEY]: AGENCY_ROLE } };
  const plainInvite = { id: "inv_2", emailAddress: "client@example.com", publicMetadata: {} };

  it("確認済みのメール宛で role が agency のものを拾う", () => {
    expect(pickAgencyInvitation([plainInvite, agencyInvite], ["staff@example.com"])).toBe(agencyInvite);
  });

  it("大文字・前後の空白は無視して突き合わせる", () => {
    expect(pickAgencyInvitation([agencyInvite], ["  Staff@Example.COM "])).toBe(agencyInvite);
  });

  it("宛先が違えば拾わない（部分一致でも拾わない）", () => {
    expect(pickAgencyInvitation([agencyInvite], ["other@example.com"])).toBeNull();
    expect(pickAgencyInvitation([agencyInvite], ["staff@example.com.evil.jp"])).toBeNull();
    expect(pickAgencyInvitation([agencyInvite], ["taff@example.com"])).toBeNull();
  });

  it("管理アカウントの招待でなければ拾わない", () => {
    expect(pickAgencyInvitation([plainInvite], ["client@example.com"])).toBeNull();
  });

  it("確認済みのメールが無ければ拾わない", () => {
    expect(pickAgencyInvitation([agencyInvite], [])).toBeNull();
    expect(pickAgencyInvitation([agencyInvite], ["メールではない値"])).toBeNull();
  });
});
