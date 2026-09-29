/**
 * Clerk のユーザーから連絡先・表示名・運用者かどうかを読む（admin/identity.ts）。
 * 2026-09-23 まで 5 か所に書き写されていて、1 か所だけ未確認のメールも運用者として数えていた。
 */
import { describe, expect, it } from "vitest";
import { displayName, hasVerifiedEmail, isOperatorUser, primaryEmail, verifiedEmails } from "../identity";

const verified = { status: "verified" };
const unverified = { status: "unverified" };

describe("連絡先と表示名", () => {
  it("主メール → 最初のメール → null", () => {
    const emails = [
      { id: "a", emailAddress: "first@example.com" },
      { id: "b", emailAddress: "main@example.com" },
    ];
    expect(primaryEmail({ primaryEmailAddressId: "b", emailAddresses: emails })).toBe("main@example.com");
    expect(primaryEmail({ primaryEmailAddressId: "zzz", emailAddresses: emails })).toBe("first@example.com");
    expect(primaryEmail({ primaryEmailAddressId: null, emailAddresses: [] })).toBeNull();
  });

  it("「姓 名」→ ユーザー名 → 空", () => {
    expect(displayName({ lastName: "山田", firstName: "太郎", username: "yamada" })).toBe("山田 太郎");
    expect(displayName({ lastName: null, firstName: "太郎", username: null })).toBe("太郎");
    expect(displayName({ lastName: null, firstName: null, username: "yamada" })).toBe("yamada");
    expect(displayName({ lastName: null, firstName: null, username: null })).toBe("");
  });
});

describe("運用者かどうか（確認済みのメールだけ）", () => {
  const allowed = ["ops@example.com"];

  it("確認済みのメールが ADMIN_EMAILS にあれば運用者", () => {
    expect(isOperatorUser({ emailAddresses: [{ emailAddress: "OPS@example.com", verification: verified }] }, allowed)).toBe(true);
  });

  // 誰でも自分のアカウントに運用者のアドレスを「未確認のまま」足せる
  it("未確認のメールは数えない", () => {
    expect(isOperatorUser({ emailAddresses: [{ emailAddress: "ops@example.com", verification: unverified }] }, allowed)).toBe(false);
    expect(isOperatorUser({ emailAddresses: [{ emailAddress: "ops@example.com", verification: null }] }, allowed)).toBe(false);
    expect(isOperatorUser({ emailAddresses: [{ emailAddress: "ops@example.com" }] }, allowed)).toBe(false);
  });

  it("ADMIN_EMAILS が空なら誰も運用者でない", () => {
    expect(isOperatorUser({ emailAddresses: [{ emailAddress: "ops@example.com", verification: verified }] }, [])).toBe(false);
  });

  it("確認済みのメールの一覧と、完全一致の確認", () => {
    const user = {
      emailAddresses: [
        { emailAddress: "a@example.com", verification: verified },
        { emailAddress: "partner@example.com", verification: unverified },
      ],
    };
    expect(verifiedEmails(user)).toEqual(["a@example.com"]);
    expect(hasVerifiedEmail(user, " A@example.com ")).toBe(true);
    // 管理アカウントにする相手を探すとき、未確認で足しただけの別人を拾わない
    expect(hasVerifiedEmail(user, "partner@example.com")).toBe(false);
    expect(hasVerifiedEmail(user, "")).toBe(false);
  });
});
