import { afterEach, describe, expect, it, vi } from "vitest";
import { isCronAuthorized, isCronConfigured } from "../cron";

afterEach(() => vi.unstubAllEnvs());

function req(auth?: string): Request {
  return new Request("https://example.test/api/cron/maps-refresh", { headers: auth ? { authorization: auth } : {} });
}

describe("Cron の認証", () => {
  it("CRON_SECRET が無ければ何が来ても通さない", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronConfigured()).toBe(false);
    expect(isCronAuthorized(req("Bearer "))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });

  it("Bearer が一致したときだけ通す", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect(isCronConfigured()).toBe(true);
    expect(isCronAuthorized(req("Bearer s3cret-value"))).toBe(true);
    expect(isCronAuthorized(req("Bearer s3cret-valu"))).toBe(false);
    expect(isCronAuthorized(req("Bearer s3cret-value1"))).toBe(false);
    expect(isCronAuthorized(req("s3cret-value"))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });
});
