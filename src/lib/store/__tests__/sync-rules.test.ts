/**
 * ブラウザ側ストアのサーバー同期の決めごと（sync-rules.ts）。
 * ユーザーが変わったら端末の値を捨てる／初回だけ端末の値を上げる／画面の状態は同期しない。
 */
import { describe, expect, it } from "vitest";
import { hydrationMode, isInitialValue, isSyncedStoreName, LOCAL_ONLY_STORES } from "../sync-rules";

describe("同期するストア", () => {
  it("画面の状態（開いている柱・割引コード）は同期しない", () => {
    expect(LOCAL_ONLY_STORES).toEqual(["sidebarTab", "promoCode"]);
    expect(isSyncedStoreName("sidebarTab")).toBe(false);
    expect(isSyncedStoreName("projects")).toBe(true);
    expect(isSyncedStoreName("rankSnapshots")).toBe(true);
  });

  it("名前の形が違うものは受け付けない（API の入力検証）", () => {
    expect(isSyncedStoreName("")).toBe(false);
    expect(isSyncedStoreName("1abc")).toBe(false);
    expect(isSyncedStoreName("a b")).toBe(false);
    expect(isSyncedStoreName("a".repeat(65))).toBe(false);
  });
});

describe("読み込みの仕方", () => {
  it("この端末で初めて かつ サーバーに何も無い → 端末の値を上げる（移行）", () => {
    expect(hydrationMode({ userId: "user_a", previousOwner: null, serverHasAny: false })).toBe("migrate");
  });

  it("この端末で初めて だが サーバーにデータがある → 端末の値を捨ててサーバーに置き換える", () => {
    expect(hydrationMode({ userId: "user_a", previousOwner: null, serverHasAny: true })).toBe("replace");
  });

  it("前回と違うユーザー（別のお客様・代理ログイン）→ 置き換える", () => {
    expect(hydrationMode({ userId: "user_b", previousOwner: "user_a", serverHasAny: true })).toBe("replace");
    expect(hydrationMode({ userId: "user_b", previousOwner: "user_a", serverHasAny: false })).toBe("replace");
  });

  it("前回と同じユーザー → サーバーの値を入れる。サーバーに無いものは端末のまま", () => {
    expect(hydrationMode({ userId: "user_a", previousOwner: "user_a", serverHasAny: true })).toBe("pull");
    expect(hydrationMode({ userId: "user_a", previousOwner: "user_a", serverHasAny: false })).toBe("pull");
  });

  it("初期値と同じ値は上げない", () => {
    expect(isInitialValue([], [])).toBe(true);
    expect(isInitialValue({ a: 1 }, { a: 1 })).toBe(true);
    expect(isInitialValue([{ id: "x" }], [])).toBe(false);
  });
});
