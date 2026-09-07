/**
 * POST /api/ai-traffic の入口（ネットワークには出ない）。
 * GA4 未設定で 503 と環境変数名を返すこと、入力検証が効くことを確かめる。
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ai-traffic/route";

const KEYS = ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

/** 形だけ整ったサービスアカウント（署名はしないので鍵の中身は使われない） */
const ACCOUNT_JSON = JSON.stringify({
  client_email: "test@example.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\\nMIIB\\n-----END PRIVATE KEY-----\\n",
});

function request(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost/api/ai-traffic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

function configured(): void {
  process.env.GA4_PROPERTY_ID = "123456789";
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = ACCOUNT_JSON;
}

const RANGE = { startDate: "2026-08-01", endDate: "2026-08-28" };

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    const v = original[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/ai-traffic", () => {
  it("GA4 が未設定なら 503 で 2 つの環境変数名を伝える", async () => {
    const res = await POST(request(RANGE));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("GA4_PROPERTY_ID");
    expect(body.error).toContain("GOOGLE_SERVICE_ACCOUNT_JSON");
  });

  it("プロパティ ID だけあればサービスアカウント JSON を求める", async () => {
    process.env.GA4_PROPERTY_ID = "123456789";
    const res = await POST(request(RANGE));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("GOOGLE_SERVICE_ACCOUNT_JSON");
    expect(body.error).not.toContain("GA4_PROPERTY_ID");
  });

  it("JSON でなければ 400", async () => {
    configured();
    const res = await POST(request(null, "{"));
    expect(res.status).toBe(400);
  });

  it("期間が欠けていれば 422", async () => {
    configured();
    expect((await POST(request({}))).status).toBe(422);
    expect((await POST(request({ startDate: "2026-08-01" }))).status).toBe(422);
  });

  it("YYYY-MM-DD でない日付は 422", async () => {
    configured();
    expect((await POST(request({ startDate: "2026/08/01", endDate: "2026-08-28" }))).status).toBe(422);
    expect((await POST(request({ startDate: "2026-08-01", endDate: "2026-02-30" }))).status).toBe(422);
  });

  it("終了日が開始日より前なら 422", async () => {
    configured();
    const res = await POST(request({ startDate: "2026-08-28", endDate: "2026-08-01" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("終了日");
  });

  it("期間が上限を超えたら 422", async () => {
    configured();
    const res = await POST(request({ startDate: "2024-01-01", endDate: "2026-01-01" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("366");
  });

  it("プロパティ ID が数字でなければ 422", async () => {
    configured();
    const res = await POST(request({ ...RANGE, propertyId: "properties/abc" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("プロパティ ID");
  });

  it("キーイベント名が多すぎれば 422", async () => {
    configured();
    const res = await POST(request({ ...RANGE, keyEventNames: ["a", "b", "c", "d", "e", "f"] }));
    expect(res.status).toBe(422);
  });

  it("サービスアカウント JSON が壊れていれば 503（設定の問題として返す）", async () => {
    process.env.GA4_PROPERTY_ID = "123456789";
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{ not json";
    const res = await POST(request(RANGE));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("GOOGLE_SERVICE_ACCOUNT_JSON");
  });
});
