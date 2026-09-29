/**
 * 管理アカウントの追加・解除（admin/agencies.ts）。Clerk はモック。
 *
 *   - 持ち主を探すときは確認済みのメールだけを突き合わせる（未確認のまま他人のアドレスを足した別人を上げない。2026-09-23）
 *   - 書き込みは role のキーだけ（updateUserMetadata は深いマージ。丸ごと送ると他の書き込みを巻き戻す）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserList = vi.fn();
const getUser = vi.fn();
const updateUserMetadata = vi.fn();
const createInvitation = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: { getUserList, getUser, updateUserMetadata },
    invitations: { createInvitation, getInvitationList: vi.fn(async () => ({ data: [] })), revokeInvitation: vi.fn() },
  }),
}));

import { addAgencyByEmail, removeAgency } from "../agencies";

const person = (id: string, email: string, status: string) => ({
  id,
  publicMetadata: { plan: "light", stripe: { subscriptionId: "sub_1" } },
  emailAddresses: [{ id: "e", emailAddress: email, verification: { status } }],
});

beforeEach(() => {
  getUserList.mockReset();
  getUser.mockReset();
  updateUserMetadata.mockReset();
  createInvitation.mockReset();
  createInvitation.mockResolvedValue({ url: "https://accounts.example/invite" });
  vi.stubEnv("ADMIN_EMAILS", "ops@example.com");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("管理アカウントの追加", () => {
  it("確認済みの持ち主が居れば role だけを付ける", async () => {
    getUserList.mockResolvedValue({ data: [person("user_real", "partner@example.com", "verified")] });
    expect(await addAgencyByEmail("partner@example.com")).toEqual({ kind: "promoted", email: "partner@example.com", userId: "user_real" });
    expect(updateUserMetadata).toHaveBeenCalledWith("user_real", { publicMetadata: { role: "agency" } });
  });

  it("未確認のまま同じアドレスを足しただけの別人は上げず、招待に回す", async () => {
    getUserList.mockResolvedValue({ data: [person("user_squatter", "partner@example.com", "unverified")] });
    expect(await addAgencyByEmail("partner@example.com")).toMatchObject({ kind: "invited" });
    expect(updateUserMetadata).not.toHaveBeenCalled();
    expect(createInvitation).toHaveBeenCalled();
  });

  it("解除も role のキーだけ（null = 消す）", async () => {
    getUser.mockResolvedValue(person("user_real", "partner@example.com", "verified"));
    await removeAgency("user_real");
    expect(updateUserMetadata).toHaveBeenCalledWith("user_real", { publicMetadata: { role: null } });
  });
});
