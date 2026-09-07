import { describe, expect, it } from "vitest";
import { diffIssues, withCategoryDelta } from "../diff";
import { minHashSignature, shingles, signatureSimilarity, contentFingerprint } from "../similarity";
import { appendSnapshot, historyFor, type AuditSnapshot } from "../store";
import type { Issue } from "../types";

/** 5-gram の種類が多い長文（実際の記事に近い形） */
const LONG_TEXT = [
  "サンプル工房は中小企業のウェブサイト制作と運用支援を行う会社です。",
  "検索エンジンだけでなく生成AIからも引用されるページ作りを重視しています。",
  "制作したサイトの更新作業まで含めて月額の定額でお引き受けしています。",
  "初回のご相談は無料で現状のサイトを診断したうえで改善案をご提示します。",
  "過去三年間で地域の製造業や士業を中心に百二十社の支援実績があります。",
  "公開後の運用では月次のレポートと改善提案をセットでお届けしています。",
  "構造化データの実装やサイトマップの整備など技術的な下地から整えます。",
  "記事の執筆は取材にもとづいて事実関係を確認したうえで進めています。",
  "表示速度の改善では画像の最適化とキャッシュ設定を優先して見直します。",
  "問い合わせフォームの改善だけで月間の反響数が二倍になった例もあります。",
].join("");

function issue(ruleId: string, url: string, detail = "detail"): Issue {
  return { ruleId, category: "タイトルタグ", severity: "error", url, detail, suggestion: "直す" };
}

describe("本文の類似度", () => {
  it("同じ文章の署名は完全に一致する", () => {
    const text = "当社は中小企業のウェブサイト制作と運用支援を行う会社です。".repeat(10);
    expect(signatureSimilarity(minHashSignature(text), minHashSignature(text))).toBe(1);
  });

  it("違う文章の署名はほとんど一致しない", () => {
    const a = "当社は中小企業のウェブサイト制作と運用支援を行う会社です。".repeat(10);
    const b = "採用情報のページです。募集職種と選考の流れを掲載しています。".repeat(10);
    expect(signatureSimilarity(minHashSignature(a), minHashSignature(b))).toBeLessThan(0.3);
  });

  it("末尾に一文足しただけの長文は高い一致率になる（重複判定の閾値 0.8 を超える）", () => {
    const base = LONG_TEXT;
    const similarity = signatureSimilarity(
      minHashSignature(base),
      minHashSignature(`${base}最後に一文だけ足しています。`),
    );
    expect(similarity).toBeGreaterThan(0.8);
  });

  it("同じ文の繰り返しに一文足すと、一致率は下がるが 0 にはならない", () => {
    // 5-gram の種類が少ない文章。最小ハッシュが「最後の n-gram」に潰れていないことの確認
    const base = "制作の進行は要件整理、設計、実装、公開前確認の四段階に分けています。".repeat(20);
    const similarity = signatureSimilarity(
      minHashSignature(base),
      minHashSignature(`${base}最後に一文だけ足す。`),
    );
    expect(similarity).toBeGreaterThan(0.5);
    expect(similarity).toBeLessThan(1);
  });

  it("空文字の署名は空配列で、比較すると 0 になる", () => {
    expect(minHashSignature("")).toEqual([]);
    expect(signatureSimilarity([], minHashSignature("あいうえおかきくけこ"))).toBe(0);
  });

  it("記号と空白を無視して n-gram を作る", () => {
    expect(shingles("あい うえお、かき")).toEqual(["あいうえお", "いうえおか", "うえおかき"]);
    expect(shingles("あい")).toEqual(["あい"]);
  });

  it("指紋は記号の違いを無視し、長さを含む", () => {
    expect(contentFingerprint("あいうえお。")).toBe(contentFingerprint("あい うえお"));
    expect(contentFingerprint("あいうえお")).not.toBe(contentFingerprint("あいうえおか"));
    expect(contentFingerprint("   ")).toBe("");
  });
});

describe("前回との差分", () => {
  it("新規 / 継続 / 解消に分類する", () => {
    const current = [issue("TITLE_MISSING", "/a"), issue("H1_MISSING", "/b")];
    const previous = [issue("TITLE_MISSING", "/a"), issue("CONTENT_THIN", "/c")];
    const diff = diffIssues(current, previous);
    expect(diff.counts).toEqual({ new: 1, kept: 1, resolved: 1, unchecked: 0 });
    expect(diff.entries.find((e) => e.change === "new")?.ruleId).toBe("H1_MISSING");
    expect(diff.entries.find((e) => e.change === "resolved")?.ruleId).toBe("CONTENT_THIN");
  });

  it("同じルールでも URL が違えば別の課題として数える", () => {
    const diff = diffIssues([issue("TITLE_MISSING", "/a")], [issue("TITLE_MISSING", "/b")]);
    expect(diff.counts).toEqual({ new: 1, kept: 0, resolved: 1, unchecked: 0 });
  });

  it("今回クロールした URL の課題が消えていれば解消として数える", () => {
    const diff = diffIssues([], [issue("TITLE_MISSING", "/a")], new Set(["/a"]));
    expect(diff.counts).toEqual({ new: 0, kept: 0, resolved: 1, unchecked: 0 });
  });

  it("今回クロールしていない URL の課題は解消ではなく未確認にする", () => {
    // 上限ページ数を下げた・取得に失敗したケース。未測定を改善として出さない
    const diff = diffIssues(
      [issue("TITLE_MISSING", "/a")],
      [issue("TITLE_MISSING", "/a"), issue("H1_MISSING", "/b")],
      new Set(["/a"]),
    );
    expect(diff.counts).toEqual({ new: 0, kept: 1, resolved: 0, unchecked: 1 });
    expect(diff.entries.find((e) => e.change === "unchecked")?.url).toBe("/b");
  });

  it("detail が変わっても継続として扱う（件数は変わりやすいため）", () => {
    const diff = diffIssues([issue("TITLE_MISSING", "/a", "今回")], [issue("TITLE_MISSING", "/a", "前回")]);
    expect(diff.counts.kept).toBe(1);
  });

  it("前回が無ければカテゴリの差分を付けない", () => {
    const current = [{ category: "タイトルタグ" as const, count: 3 }];
    expect(withCategoryDelta(current, null)).toEqual([{ category: "タイトルタグ", count: 3 }]);
  });

  it("カテゴリの増減を計算する", () => {
    const rows = withCategoryDelta(
      [
        { category: "タイトルタグ", count: 3 },
        { category: "画像", count: 1 },
      ],
      [
        { category: "タイトルタグ", count: 5 },
        { category: "画像", count: 1 },
      ],
    );
    expect(rows[0]).toEqual({ category: "タイトルタグ", count: 3, prevCount: 5, delta: -2 });
    expect(rows[1].delta).toBe(0);
  });
});

describe("履歴の保存", () => {
  function snapshot(origin: string, at: string): AuditSnapshot {
    return {
      id: `${origin}|${at}`,
      origin,
      startUrl: `${origin}/`,
      crawledAt: at,
      analyzed: 1,
      issueCount: 0,
      bySeverity: { error: 0, warning: 0, info: 0 },
      byCategory: [],
      issues: [],
    };
  }

  it("同じオリジンは上限件数だけ残し、新しい順に並べる", () => {
    let history: AuditSnapshot[] = [];
    for (const day of ["01", "02", "03", "04"]) {
      history = appendSnapshot(history, snapshot("https://a.test", `2026-09-${day}T00:00:00.000Z`), 3);
    }
    expect(history).toHaveLength(3);
    expect(history[0].crawledAt).toContain("09-04");
    expect(history[2].crawledAt).toContain("09-02");
  });

  it("別のオリジンの履歴は消さない", () => {
    let history = appendSnapshot([], snapshot("https://a.test", "2026-09-01T00:00:00.000Z"), 1);
    history = appendSnapshot(history, snapshot("https://b.test", "2026-09-02T00:00:00.000Z"), 1);
    expect(historyFor(history, "https://a.test")).toHaveLength(1);
    expect(historyFor(history, "https://b.test")).toHaveLength(1);
  });

  it("同じ id は置き換える", () => {
    const one = snapshot("https://a.test", "2026-09-01T00:00:00.000Z");
    const history = appendSnapshot([one], { ...one, issueCount: 9 }, 5);
    expect(history).toHaveLength(1);
    expect(history[0].issueCount).toBe(9);
  });
});
