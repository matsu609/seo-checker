/**
 * 口コミ支援の投稿先 URL（writeReviewUrl）は https:// だけ（2026-09-23）。
 * 認証が無効な環境（開発・E2E）で、データベースに届く前の入力検査だけを確かめる（ネットワークには出ない）。
 */
import { describe, expect, it } from "vitest";

const BAD = "javascript:alert(document.cookie)";
const FORM_ID = "00000000-0000-4000-8000-000000000000";
const ctx = { params: Promise.resolve({ id: FORM_ID }) };

function req(method: string, body: unknown): Request {
  return new Request("http://localhost/api/reviews/forms", { method, body: JSON.stringify(body) });
}

describe("投稿先 URL は https:// だけ", () => {
  it("作成", async () => {
    const { POST } = await import("@/app/api/reviews/forms/route");
    const res = await POST(req("POST", { title: "t", storeName: "s", writeReviewUrl: BAD }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("https://");
  });

  it("更新", async () => {
    const { PUT } = await import("@/app/api/reviews/forms/[id]/route");
    expect((await PUT(req("PUT", { writeReviewUrl: "data:text/html,<script>1</script>" }), ctx)).status).toBe(400);
  });

  it("QR の発行単位", async () => {
    const { POST } = await import("@/app/api/reviews/forms/[id]/channels/route");
    expect((await POST(req("POST", { storeName: "s", writeReviewUrl: BAD }), ctx)).status).toBe(400);
  });
});
