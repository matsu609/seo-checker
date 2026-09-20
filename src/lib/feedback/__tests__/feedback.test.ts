/**
 * ご意見・不具合の報告: 入力の検証、行 → 記録の変換、UA の短縮、並び順。
 */
import { describe, expect, it } from "vitest";
import {
  compareFeedback,
  describeUserAgent,
  FEEDBACK_BODY_MAX,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  FeedbackInputSchema,
  FeedbackUpdateSchema,
  fromFeedbackRow,
  type FeedbackRecord,
  type FeedbackRow,
} from "../types";

const ROW: FeedbackRow = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user_1",
  email: "a@example.com",
  name: "テスト商店",
  kind: "bug",
  body: "PDF が出ません",
  path: "/tools/rank",
  plan: "standard",
  user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  commit: "abc1234",
  release: 126,
  status: "open",
  reply: null,
  replied_at: null,
  created_at: "2026-09-20T01:00:00.000Z",
  updated_at: "2026-09-20T01:00:00.000Z",
};

describe("入力の検証", () => {
  it("種類と本文は必須、本文は上限あり、path は任意", () => {
    expect(FeedbackInputSchema.safeParse({ kind: "bug", body: " 直して ", path: "/tools/rank" }).data).toEqual({
      kind: "bug",
      body: "直して",
      path: "/tools/rank",
    });
    expect(FeedbackInputSchema.safeParse({ kind: "bug", body: "   " }).success).toBe(false);
    expect(FeedbackInputSchema.safeParse({ kind: "spam", body: "x" }).success).toBe(false);
    expect(FeedbackInputSchema.safeParse({ kind: "other", body: "x".repeat(FEEDBACK_BODY_MAX + 1) }).success).toBe(false);
    expect(FeedbackInputSchema.safeParse({ kind: "other", body: "x".repeat(FEEDBACK_BODY_MAX) }).success).toBe(true);
  });

  it("運営者の更新は status か reply のどちらかが要る", () => {
    expect(FeedbackUpdateSchema.safeParse({}).success).toBe(false);
    expect(FeedbackUpdateSchema.safeParse({ status: "done" }).success).toBe(true);
    expect(FeedbackUpdateSchema.safeParse({ reply: null }).success).toBe(true);
    expect(FeedbackUpdateSchema.safeParse({ status: "closed" }).success).toBe(false);
  });

  it("種類と状態のラベルがそろっている", () => {
    for (const k of FEEDBACK_KINDS) expect(FEEDBACK_KIND_LABELS[k]).toBeTruthy();
    for (const s of FEEDBACK_STATUSES) expect(FEEDBACK_STATUS_LABELS[s]).toBeTruthy();
  });
});

describe("行 → 記録", () => {
  it("そのまま写す", () => {
    const r = fromFeedbackRow(ROW);
    expect(r.kind).toBe("bug");
    expect(r.status).toBe("open");
    expect(r.release).toBe(126);
    expect(r.reply).toBeNull();
    expect(r.updatedAt).toBe(ROW.updated_at);
  });

  it("想定外の値は既定に落とし、null は空にする", () => {
    const r = fromFeedbackRow({ ...ROW, kind: "??", status: "??", email: null, name: null, path: null, plan: null, user_agent: null, commit: null, release: null, reply: "  ", updated_at: null });
    expect(r.kind).toBe("other");
    expect(r.status).toBe("open");
    expect(r.email).toBe("");
    expect(r.path).toBe("");
    expect(r.release).toBe(0);
    expect(r.reply).toBeNull();
    expect(r.updatedAt).toBe(ROW.created_at);
  });
});

describe("User-Agent の短縮", () => {
  it("ブラウザと OS を出す", () => {
    expect(describeUserAgent(ROW.user_agent!)).toBe("Chrome / Windows");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe(
      "Safari / iPhone",
    );
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe("Chrome / Android");
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")).toBe("Edge / Windows");
    expect(describeUserAgent("")).toBe("");
  });
});

describe("並び順", () => {
  it("未対応 → 対応中 → 対応済み、同じ状態なら新しい順", () => {
    const mk = (status: FeedbackRecord["status"], createdAt: string): FeedbackRecord => ({ ...fromFeedbackRow(ROW), status, createdAt });
    const rows = [mk("done", "2026-09-20"), mk("open", "2026-09-18"), mk("in_progress", "2026-09-19"), mk("open", "2026-09-19")];
    const sorted = [...rows].sort(compareFeedback);
    expect(sorted.map((r) => `${r.status}@${r.createdAt}`)).toEqual(["open@2026-09-19", "open@2026-09-18", "in_progress@2026-09-19", "done@2026-09-20"]);
  });
});
