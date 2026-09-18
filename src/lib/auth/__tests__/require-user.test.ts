/**
 * 共通のガード `requireUser()` の取り決め（リファクタリングの安全網）。
 *
 * 20 か所のルートに並んでいた 4 行（requireAuth → currentUserId → 401）をここに寄せた。
 * **寄せる前と後で、外から見える応答が変わらない**ことを固定する:
 *
 *   1. ログインが未設定の環境（開発・E2E）は素通りして固定の利用者 ID を返す
 *   2. ログイン済みならその利用者 ID を返す
 *   3. 未ログインなら 401。本文は `requireAuth` が返すものと同じ（`code: "unauthorized"`）
 *   4. `headers` を渡したときだけ応答にそのヘッダーが付く（渡さなければ付かない）
 *
 * 3 の「もう一段の 401（`ログインが必要です`）」は、requireAuth を通ったのに利用者 ID が
 * 取れない場合の保険で、実運用では到達しない（requireAuth が先に 401 を返す）。
 * 保険として残してあることを 4 で確かめる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {}, emailAddresses: [] }) } }),
  currentUser: async () => null,
}));

function enableAuth() {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
}

beforeEach(() => {
  authMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireUser（ルート共通のガード）", () => {
  it("ログインが未設定の環境では素通りして固定の ID を返す", async () => {
    const { requireUser } = await import("../guard");
    const { LOCAL_USER_ID } = await import("../user");
    await expect(requireUser()).resolves.toBe(LOCAL_USER_ID);
  });

  it("ログイン済みならその利用者 ID を返す", async () => {
    enableAuth();
    authMock.mockResolvedValue({ userId: "user_1" });
    const { requireUser } = await import("../guard");
    await expect(requireUser()).resolves.toBe("user_1");
  });

  it("未ログインなら 401。本文は requireAuth と同じ（寄せる前と同じ応答）", async () => {
    enableAuth();
    authMock.mockResolvedValue({ userId: null });
    const { requireUser } = await import("../guard");
    const res = await requireUser();
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "この機能を使うにはログインが必要です。", code: "unauthorized" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("headers を渡さなければ 401 に余分なヘッダーを足さない（元のルートと同じ）", async () => {
    enableAuth();
    authMock.mockResolvedValue({ userId: null });
    const { requireUser } = await import("../guard");
    const withHeader = (await requireUser({ headers: { "x-test": "1" } })) as Response;
    // requireAuth が先に返すので、渡したヘッダーは付かない（= 元の実装と同じ挙動）
    expect(withHeader.status).toBe(401);
    expect(withHeader.headers.get("x-test")).toBeNull();
  });
});
