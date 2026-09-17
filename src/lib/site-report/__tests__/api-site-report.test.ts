/**
 * /api/site-report は提供を終了した（利用者の決定 2026-09-17: GA4 は使わない）。
 * 古いクライアントが叩いても実費が出ないよう 410 だけを返すことを固定する。
 */
import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/site-report/route";

describe("/api/site-report（提供終了）", () => {
  it("GET / POST とも 410 で、代わりの画面を案内する", async () => {
    for (const handler of [GET, POST]) {
      const res = await handler();
      expect(res.status).toBe(410);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe("gone");
      expect(body.error).toContain("/tools/search-estimate");
    }
  });
});
