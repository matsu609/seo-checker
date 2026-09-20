import { describe, expect, it } from "vitest";
import { pickDue, type RunLike } from "../reanalysis";

const row = (userId: string, origin: string, createdAt: string, status: RunLike["status"] = "analyzed"): RunLike => ({ userId, origin, createdAt, status, input: { url: origin } });

describe("自動再診断の候補", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  it("30 日たった最新の診断が対象。新しいものは対象外", () => {
    const rows = [row("u1", "https://a.jp", "2026-09-01T00:00:00Z"), row("u1", "https://a.jp", "2026-08-01T00:00:00Z"), row("u2", "https://b.jp", "2026-10-10T00:00:00Z")];
    expect(pickDue(rows, now).map((c) => [c.userId, c.origin, c.lastOkAt])).toEqual([["u1", "https://a.jp", "2026-09-01T00:00:00Z"]]);
  });

  it("直近 7 日に失敗の行があれば飛ばす（毎日やり直さない）", () => {
    const rows = [row("u1", "https://a.jp", "2026-10-12T00:00:00Z", "failed"), row("u1", "https://a.jp", "2026-09-01T00:00:00Z")];
    expect(pickDue(rows, now)).toEqual([]);
    const old = [row("u1", "https://a.jp", "2026-10-01T00:00:00Z", "failed"), row("u1", "https://a.jp", "2026-09-01T00:00:00Z")];
    expect(pickDue(old, now)).toHaveLength(1);
  });

  it("失敗しかないサイトは対象外。古い順に並ぶ", () => {
    const rows = [row("u1", "https://a.jp", "2026-08-01T00:00:00Z", "failed"), row("u2", "https://b.jp", "2026-08-15T00:00:00Z"), row("u3", "https://c.jp", "2026-08-10T00:00:00Z")];
    expect(pickDue(rows, now).map((c) => c.userId)).toEqual(["u3", "u2"]);
  });
});
