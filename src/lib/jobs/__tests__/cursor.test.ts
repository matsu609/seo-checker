import { describe, expect, it } from "vitest";
import { cursorFromRun, RESUME_KEY, startFromCursor } from "../cursor";

const users = [{ id: "u3" }, { id: "u1" }, { id: "u4" }, { id: "u2" }];
const ids = (list: readonly { id: string }[]) => list.map((u) => u.id);

describe("前回たどり着けなかった人から始める（2026-09-23）", () => {
  it("cursor が無ければ ID の順", () => {
    expect(ids(startFromCursor(users, (u) => u.id, null))).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("cursor の人から始めて一周する", () => {
    expect(ids(startFromCursor(users, (u) => u.id, "u3"))).toEqual(["u3", "u4", "u1", "u2"]);
  });

  it("cursor の人がいなくなっていたら、その次の人から", () => {
    expect(ids(startFromCursor(users, (u) => u.id, "u25"))).toEqual(["u3", "u4", "u1", "u2"]);
    // 最後より後ろなら先頭から
    expect(ids(startFromCursor(users, (u) => u.id, "u9"))).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("続きがあるのは時間切れ（aborted）で終わった回だけ", () => {
    expect(cursorFromRun({ status: "aborted", summary: { [RESUME_KEY]: "u3" } })).toBe("u3");
    expect(cursorFromRun({ status: "ok", summary: { [RESUME_KEY]: "u3" } })).toBeNull();
    expect(cursorFromRun({ status: "aborted", summary: {} })).toBeNull();
    expect(cursorFromRun(null)).toBeNull();
  });
});
