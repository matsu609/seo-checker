import { describe, expect, it } from "vitest";
import { wrapFocusTarget } from "../useFocusTrap";

describe("wrapFocusTarget", () => {
  const nodes = ["first", "middle", "last"];

  it("最後で Tab → 最初へ、最初で Shift+Tab → 最後へ", () => {
    expect(wrapFocusTarget(nodes, "last", false)).toBe("first");
    expect(wrapFocusTarget(nodes, "first", true)).toBe("last");
  });

  it("端でなければ何もしない（ブラウザの既定の移動に任せる）", () => {
    expect(wrapFocusTarget(nodes, "middle", false)).toBeNull();
    expect(wrapFocusTarget(nodes, "middle", true)).toBeNull();
    expect(wrapFocusTarget(nodes, "first", false)).toBeNull();
    expect(wrapFocusTarget(nodes, "last", true)).toBeNull();
    expect(wrapFocusTarget(nodes, null, false)).toBeNull();
  });

  it("フォーカスできる要素が無ければ何もしない・1 つならその要素に留める", () => {
    expect(wrapFocusTarget([], null, false)).toBeNull();
    expect(wrapFocusTarget(["only"], "only", false)).toBe("only");
    expect(wrapFocusTarget(["only"], "only", true)).toBe("only");
  });
});
