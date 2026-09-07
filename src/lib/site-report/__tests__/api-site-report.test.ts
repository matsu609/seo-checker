/**
 * POST /api/site-report の入口だけを確かめる（ネットワークには出ない）。
 * GA4 が未設定の環境で 503 と環境変数名を返すことが degraded-mode の要。
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/site-report/route";

const originalProperty = process.env.GA4_PROPERTY_ID;
const originalAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function request(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost/api/site-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.GA4_PROPERTY_ID;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
});

afterEach(() => {
  if (originalProperty === undefined) delete process.env.GA4_PROPERTY_ID;
  else process.env.GA4_PROPERTY_ID = originalProperty;
  if (originalAccount === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = originalAccount;
});

describe("POST /api/site-report", () => {
  it("GA4 が未設定なら 503 で環境変数名を伝える", async () => {
    const res = await POST(request({ startDate: "2026-08-11", endDate: "2026-09-07" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("GA4_PROPERTY_ID");
    expect(body.error).toContain("GOOGLE_SERVICE_ACCOUNT_JSON");
  });

  it("JSON でなければ 400", async () => {
    const res = await POST(request(null, "{"));
    expect(res.status).toBe(400);
  });

  it("期間が無ければ 422（GA4 は呼ばない）", async () => {
    expect((await POST(request({}))).status).toBe(422);
    expect((await POST(request({ startDate: "2026-09-01" }))).status).toBe(422);
  });

  it("日付の形式が違えば 422", async () => {
    const res = await POST(request({ startDate: "2026/09/01", endDate: "2026-09-07" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("YYYY-MM-DD");
  });

  it("存在しない日付は 422", async () => {
    expect((await POST(request({ startDate: "2026-02-30", endDate: "2026-03-01" }))).status).toBe(422);
  });

  it("開始日が終了日より後なら 422", async () => {
    const res = await POST(request({ startDate: "2026-09-08", endDate: "2026-09-01" }));
    expect(res.status).toBe(422);
  });

  it("期間が 365 日を超えたら 422", async () => {
    const res = await POST(request({ startDate: "2024-01-01", endDate: "2026-01-01" }));
    expect(res.status).toBe(422);
  });

  it("前期は片方だけ指定すると 422", async () => {
    const res = await POST(
      request({ startDate: "2026-08-11", endDate: "2026-09-07", previousStartDate: "2026-07-14" }),
    );
    expect(res.status).toBe(422);
  });

  it("前期の日付が不正でも 422（GA4 は呼ばない）", async () => {
    const res = await POST(
      request({
        startDate: "2026-08-11",
        endDate: "2026-09-07",
        previousStartDate: "2026-07-14",
        previousEndDate: "not-a-date",
      }),
    );
    expect(res.status).toBe(422);
  });

  it("GA4_PROPERTY_ID だけ設定されていても 503（不足分を名指しする）", async () => {
    process.env.GA4_PROPERTY_ID = "123456";
    const res = await POST(request({ startDate: "2026-08-11", endDate: "2026-09-07" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("GOOGLE_SERVICE_ACCOUNT_JSON");
    expect(body.error).not.toContain("GA4_PROPERTY_ID");
  });

  it("サービスアカウント JSON が壊れていれば 503（config エラー）", async () => {
    process.env.GA4_PROPERTY_ID = "123456";
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{ これは JSON ではない";
    const res = await POST(request({ startDate: "2026-08-11", endDate: "2026-09-07" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("GOOGLE_SERVICE_ACCOUNT_JSON");
  });
});
