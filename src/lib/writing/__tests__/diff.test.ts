/**
 * 語単位の差分（D3）。純関数なのでネットワークには出ない。
 */
import { describe, expect, it } from "vitest";
import { applyDiff, diffStats, diffWords, tokenize } from "../diff";
import type { DiffPart } from "../types";

/** 差分から変更前の全文を復元する（テスト用） */
function before(parts: readonly DiffPart[]): string {
  return parts.filter((p) => p.op !== "insert").map((p) => p.text).join("");
}

describe("tokenize", () => {
  it("英数字はまとめ、日本語は 1 文字ずつに割る", () => {
    expect(tokenize("SEO対策")).toEqual(["SEO", "対", "策"]);
    expect(tokenize("v2 は 3 倍")).toEqual(["v2", " ", "は", " ", "3", " ", "倍"]);
  });

  it("改行は 1 トークン、空文字は空配列", () => {
    expect(tokenize("a\nb")).toEqual(["a", "\n", "b"]);
    expect(tokenize("")).toEqual([]);
  });
});

describe("diffWords", () => {
  it("変更が無ければ equal 1 個", () => {
    const parts = diffWords("同じ文章です。", "同じ文章です。");
    expect(parts).toEqual([{ op: "equal", text: "同じ文章です。" }]);
    expect(diffStats(parts).changed).toBe(false);
  });

  it("挿入を検出する", () => {
    const parts = diffWords("AIO対策の基本", "AIO対策の基本と応用");
    expect(applyDiff(parts)).toBe("AIO対策の基本と応用");
    expect(before(parts)).toBe("AIO対策の基本");
    expect(parts.filter((p) => p.op === "delete")).toHaveLength(0);
    expect(parts.some((p) => p.op === "insert" && p.text === "と応用")).toBe(true);
  });

  it("削除を検出する", () => {
    const parts = diffWords("これは冗長な文章です。", "これは文章です。");
    expect(applyDiff(parts)).toBe("これは文章です。");
    expect(parts.filter((p) => p.op === "insert")).toHaveLength(0);
    expect(parts.some((p) => p.op === "delete" && p.text === "冗長な")).toBe(true);
  });

  it("置換（削除 + 挿入）を検出する", () => {
    const parts = diffWords("価格は安いです。", "価格は手ごろです。");
    expect(applyDiff(parts)).toBe("価格は手ごろです。");
    expect(before(parts)).toBe("価格は安いです。");
    const stats = diffStats(parts);
    expect(stats.added).toBeGreaterThan(0);
    expect(stats.removed).toBeGreaterThan(0);
  });

  it("日本語の文体変換（ですます調 → だ・である調）を語単位で追える", () => {
    const parts = diffWords(
      "AIO対策は重要です。まず構造化データを整えます。",
      "AIO対策は重要である。まず構造化データを整える。",
    );
    expect(applyDiff(parts)).toBe("AIO対策は重要である。まず構造化データを整える。");
    // 冒頭の共通部分は 1 個の equal にまとまる
    expect(parts[0].op).toBe("equal");
    expect(parts[0].text.startsWith("AIO対策は重要で")).toBe(true);
  });

  it("空文字の扱い（両方 / 片方）", () => {
    expect(diffWords("", "")).toEqual([]);
    expect(diffWords("", "新しい本文")).toEqual([{ op: "insert", text: "新しい本文" }]);
    expect(diffWords("消える本文", "")).toEqual([{ op: "delete", text: "消える本文" }]);
  });

  it("改行を含む複数段落でも復元できる", () => {
    const a = "## 見出し\n\n本文が入ります。\n\n- 箇条書き";
    const b = "## 見出し（改訂）\n\n本文が入ります。\n\n- 箇条書き\n- 追加の項目";
    const parts = diffWords(a, b);
    expect(applyDiff(parts)).toBe(b);
    expect(before(parts)).toBe(a);
  });

  it("長すぎる差分は丸ごと置換に落ちる（計算量の保険）", () => {
    const a = "あ".repeat(3_000);
    const b = "い".repeat(3_000);
    const parts = diffWords(a, b);
    expect(applyDiff(parts)).toBe(b);
    expect(before(parts)).toBe(a);
  });
});
