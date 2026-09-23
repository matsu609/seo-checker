/**
 * 「この人はこの機能を使えるか」の判定（plans/access.ts）と、それを呼ぶ 3 か所がそろっていること。
 *
 *   checkPlanForFeature（ログイン中の API・PlanGate）/ accessAllows（定期処理）/ canUseFeature（サイドバーの鍵）
 *
 * 2026-09-23 まで 3 か所が別々に書かれていて、管理アカウントの扱いが画面だけにあった
 * （API は本人のプランで判定していたので、URL を直接叩けばツールが使えた）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { features, findFeatureById } from "@/lib/features/registry";
import { decideFeatureAccess, featureAllowed, type AccessSubject } from "../access";
import type { PlanId } from "../catalog";

const authMock = vi.fn();
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
  clerkClient: async () => ({ users: { getUser: async () => currentUserMock() } }),
}));

const RANK = findFeatureById("rank")!; // ライト
const FAQ = findFeatureById("faq")!; // スタンダード
const PLANS = findFeatureById("plans")!; // 無料（料金プランの画面）

const subject = (over: Partial<AccessSubject> = {}): AccessSubject => ({ plan: "free", overrides: [], admin: false, agency: false, ...over });

describe("判定の順番", () => {
  it("レジストリに無い機能は塞がない", () => {
    expect(decideFeatureAccess(subject(), null)).toEqual({ ok: true });
  });

  it("プランが足りれば開く。足りなければ plan で断る", () => {
    expect(featureAllowed(subject({ plan: "light" }), RANK)).toBe(true);
    expect(decideFeatureAccess(subject({ plan: "light" }), FAQ)).toEqual({ ok: false, reason: "plan" });
    expect(featureAllowed(subject({ plan: "standard" }), FAQ)).toBe(true);
  });

  it("個別開放はプランが足りなくても開く", () => {
    expect(featureAllowed(subject({ plan: "free", overrides: ["faq"] }), FAQ)).toBe(true);
    expect(featureAllowed(subject({ plan: "free", overrides: ["faq"] }), RANK)).toBe(false);
  });

  it("運用者は契約が無くても全機能", () => {
    expect(featureAllowed(subject({ admin: true }), FAQ)).toBe(true);
    expect(featureAllowed(subject({ admin: true, agency: true }), FAQ)).toBe(true);
  });

  // 2026-09-21 に画面からは消したが、サーバーは本人のプランで判定していた
  it("管理アカウントは、プランや個別開放があってもツールを開かない（無料の画面は開く）", () => {
    expect(decideFeatureAccess(subject({ agency: true, plan: "premium" }), RANK)).toEqual({ ok: false, reason: "manager" });
    expect(decideFeatureAccess(subject({ agency: true, overrides: ["faq"] }), FAQ)).toEqual({ ok: false, reason: "manager" });
    expect(featureAllowed(subject({ agency: true }), PLANS)).toBe(true);
  });

  it("agency を省いた古い呼び出しは管理アカウントでない扱い", () => {
    expect(featureAllowed({ plan: "light", overrides: [], admin: false }, RANK)).toBe(true);
  });
});

function enableAuth() {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  vi.stubEnv("ADMIN_EMAILS", "ops@example.com");
  vi.stubEnv("DEFAULT_PLAN", "free");
}

interface Person {
  plan: PlanId | null;
  overrides: string[];
  admin: boolean;
  agency: boolean;
}

function clerkUser(p: Person) {
  return {
    id: "user_1",
    primaryEmailAddressId: "e1",
    emailAddresses: [{ id: "e1", emailAddress: p.admin ? "ops@example.com" : "c@example.com", verification: { status: "verified" } }],
    firstName: null,
    lastName: null,
    username: null,
    publicMetadata: { ...(p.plan ? { plan: p.plan } : {}), featureOverrides: p.overrides, ...(p.agency ? { role: "agency" } : {}) },
  };
}

describe("3 か所の判定がそろう（ログイン中 / 定期処理 / 画面）", () => {
  beforeEach(() => {
    authMock.mockReset();
    currentUserMock.mockReset();
    enableAuth();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const people: Person[] = [
    { plan: null, overrides: [], admin: false, agency: false },
    { plan: "light", overrides: [], admin: false, agency: false },
    { plan: "standard", overrides: [], admin: false, agency: false },
    { plan: "light", overrides: ["faq", "listings"], admin: false, agency: false },
    { plan: null, overrides: [], admin: true, agency: false },
    { plan: "premium", overrides: ["faq"], admin: false, agency: true },
  ];
  const targets = features.filter((f) => ["rank", "faq", "listings", "karte", "plans", "seo-analysis"].includes(f.id));

  it.each(people.map((p, i) => [i, p] as const))("人 %i", async (_i, person) => {
    const { checkPlanForFeature } = await import("../guard");
    const { accessAllows } = await import("../user");
    const { canUseFeature } = await import("@/lib/store/usePlan");
    authMock.mockResolvedValue({ userId: "user_1" });
    currentUserMock.mockResolvedValue(clerkUser(person));
    const plan: PlanId = person.plan ?? "free";
    for (const f of targets) {
      const server = (await checkPlanForFeature(f.id)) === null;
      const cron = accessAllows({ userId: "user_1", plan, overrides: person.overrides, admin: person.admin, agency: person.agency, email: null, missing: false }, f.id);
      const screen = canUseFeature({ plan, overrides: person.overrides, admin: person.admin, agency: person.agency, openFeedback: 0 }, f.id, f.plan);
      expect({ f: f.id, cron, screen }).toEqual({ f: f.id, cron: server, screen: server });
    }
  });

  it("管理アカウントの API は 403（プランの案内の 402 にしない）", async () => {
    const { requirePlanForFeature } = await import("../guard");
    authMock.mockResolvedValue({ userId: "user_1" });
    currentUserMock.mockResolvedValue(clerkUser({ plan: "premium", overrides: [], admin: false, agency: true }));
    const res = await requirePlanForFeature("rank");
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ code: "manager_account" });
  });

  it("プランが足りなければ 402（今までどおり）", async () => {
    const { requirePlanForFeature } = await import("../guard");
    authMock.mockResolvedValue({ userId: "user_1" });
    currentUserMock.mockResolvedValue(clerkUser({ plan: "light", overrides: [], admin: false, agency: false }));
    const res = await requirePlanForFeature("faq");
    expect(res?.status).toBe(402);
    expect(await res?.json()).toMatchObject({ code: "plan_required", requiredPlan: "standard", currentPlan: "light" });
  });

  it("未確認のメールでは運用者にならない", async () => {
    const { checkPlanForFeature } = await import("../guard");
    authMock.mockResolvedValue({ userId: "user_1" });
    const user = clerkUser({ plan: null, overrides: [], admin: true, agency: false });
    user.emailAddresses[0].verification = { status: "unverified" };
    currentUserMock.mockResolvedValue(user);
    expect(await checkPlanForFeature("rank")).toMatchObject({ reason: "plan" });
  });

  it("Clerk から読めなければ開けない（運用者・個別開放なし）", async () => {
    const { checkPlanForFeature } = await import("../guard");
    authMock.mockResolvedValue({ userId: "user_1" });
    currentUserMock.mockRejectedValue(new Error("down"));
    expect(await checkPlanForFeature("rank")).toMatchObject({ reason: "plan", current: "free" });
  });
});
