/**
 * 顧客管理の「機能の個別開放」が、画面を本当に開けること（M-1。2026-09-23）。
 *
 * 画面を 1 つにまとめたとき（ページ改善・掲載・順位計測・口コミ）、画面の PlanGate と API は旧 ID のまま残した。
 * 個別開放は画面の ID だけを付けていたので、「ページ改善」にチェックを入れてもサイドバーの鍵が外れるだけで、
 * 画面は page-diagnosis で塞がったままだった。ここでは画面のソースの PlanGate と registry の innerGates を突き合わせる。
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toggleOverrides } from "@/lib/plans/overrides";
import { features, findFeatureById, gateIdsForScreen, overrideScreens } from "../registry";

const APP = join(process.cwd(), "src/app");

/** そのページのソースに書いてある PlanGate の featureId */
function planGatesIn(file: string): string[] {
  if (!existsSync(file)) return [];
  return [...readFileSync(file, "utf8").matchAll(/<PlanGate featureId="([^"]+)"/g)].map((m) => m[1]);
}

describe("画面と、それを塞いでいる機能 ID", () => {
  it("innerGates はレジストリにある ID だけ", () => {
    for (const f of features) {
      for (const g of f.innerGates ?? []) expect(findFeatureById(g), `${f.id} → ${g}`).not.toBeNull();
    }
  });

  it("サイドバーに出る画面の PlanGate は、すべて個別開放のチェックで開けられる", () => {
    const screens = overrideScreens().flatMap((g) => g.screens);
    const covered = new Map(screens.map(({ screen, extras }) => [screen.id, new Set([...gateIdsForScreen(screen.id), ...extras.flatMap((e) => gateIdsForScreen(e.id))])]));
    const tools = readdirSync(join(APP, "tools"));
    let checked = 0;
    for (const f of features.filter((x) => !x.hidden && x.plan !== "free")) {
      const page = f.path.startsWith("/tools/") ? join(APP, "tools", f.path.slice("/tools/".length), "page.tsx") : join(APP, f.path.slice(1), "page.tsx");
      for (const gate of planGatesIn(page)) {
        expect(covered.get(f.id)?.has(gate), `${f.path} の PlanGate ${gate}`).toBe(true);
        checked += 1;
      }
    }
    // 見落とし防止: 実際にいくつもの画面を突き合わせている
    expect(tools.length).toBeGreaterThan(5);
    expect(checked).toBeGreaterThanOrEqual(15);
  });

  it("ページ改善は page-diagnosis もまとめて開き、改修案（スタンダード）は別のチェック", () => {
    expect(gateIdsForScreen("page-improve")).toEqual(["page-improve", "page-diagnosis"]);
    const screen = overrideScreens().flatMap((g) => g.screens).find((s) => s.screen.id === "page-improve");
    expect(screen?.extras.map((e) => e.id)).toEqual(["improvement"]);
  });

  it("順位計測はタブの検索の推定・キーワード調査も、口コミは返信も、掲載の登録は別のチェック", () => {
    expect(gateIdsForScreen("rank")).toEqual(["rank", "search-estimate", "keywords"]);
    expect(gateIdsForScreen("reviews")).toEqual(["reviews", "replies"]);
    expect(gateIdsForScreen("citations")).toEqual(["citations"]);
    expect(overrideScreens().flatMap((g) => g.screens).find((s) => s.screen.id === "citations")?.extras.map((e) => e.id)).toEqual(["listings"]);
  });

  it("お客様カルテも一覧に出る。料金プラン・設定は出さない", () => {
    const ids = overrideScreens().flatMap((g) => g.screens.map((s) => s.screen.id));
    expect(ids).toContain("karte");
    expect(ids).not.toContain("plans");
    expect(ids).not.toContain("settings");
  });

  it("知らない ID は空、innerGates の無い ID はその ID だけ", () => {
    expect(gateIdsForScreen("nope")).toEqual([]);
    expect(gateIdsForScreen("improvement")).toEqual(["improvement"]);
  });
});

describe("まとめて付け外し（保存の形は今までどおり ID の配列）", () => {
  it("画面のゲート ID をまとめて足す・外す。他の ID は触らない", () => {
    const on = toggleOverrides(["faq"], gateIdsForScreen("rank"), true);
    expect(on).toEqual(["faq", "keywords", "rank", "search-estimate"]);
    expect(toggleOverrides(on, gateIdsForScreen("rank"), false)).toEqual(["faq"]);
  });

  // 2026-09-23 より前に画面の ID だけを開けた人も、押し直せば全部そろう
  it("画面の ID だけが入っている古い値からも全部開ける", () => {
    expect(toggleOverrides(["page-improve"], gateIdsForScreen("page-improve"), true)).toEqual(["page-diagnosis", "page-improve"]);
  });
});
