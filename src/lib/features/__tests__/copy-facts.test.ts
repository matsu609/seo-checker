/**
 * お客様に見える文言の「事実」（2026-09-23 に直したもの）がずれ戻らないように固定する。
 * 数字や名前は定義しているところ（catalog.ts・media.ts・seo-analysis/limits.ts）から引いている。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOKUSHOHO_ROWS } from "@/components/legal/Tokushoho";
import { FREE_MONTHLY_LIMIT_DEFAULT } from "@/lib/free/monthly-rules";
import { LISTING_MEDIA } from "@/lib/listings/media";
import { LISTING_MEDIA_COUNT, PLAN_BY_ID, PLANS } from "@/lib/plans/catalog";
import { DEFAULT_MONTHLY_LIMIT } from "@/lib/seo-analysis/limits";
import { AUDIT_RULE_COUNT, requireFeature } from "../registry";

describe("文言の事実", () => {
  it("料金プランの画面の説明は、いまのプランの数と名前（「プロ」は 2026-09-15 に引退）", () => {
    const d = requireFeature("plans").description;
    expect(d).toContain(`${PLANS.length} つの状態`);
    for (const p of PLANS) expect(d).toContain(p.label);
    expect(d).not.toContain("プロ");
  });

  // 媒体の一覧はブラウザに配らないので、数だけを catalog.ts に持っている。一覧を増減したらここが落ちる
  it("掲載先の数は媒体の一覧と同じ", () => {
    expect(LISTING_MEDIA_COUNT).toBe(LISTING_MEDIA.length);
  });

  // 2026-10-03 から無料診断は固定リンク（/free）だけ。月の上限は定義（monthly-rules.ts）から
  it("クイック診断の説明は固定リンクで、月の上限は定義から", () => {
    for (const id of ["free", "free-meo"] as const) {
      expect(requireFeature(id).description).toContain("/free");
      expect(requireFeature(id).description).toContain(`月 ${FREE_MONTHLY_LIMIT_DEFAULT} 回まで`);
      expect(requireFeature(id).description).not.toContain("メールアドレスごと");
    }
  });

  it("精密診断の月の回数・媒体数は定義から", () => {
    expect(requireFeature("seo-analysis").details.join("\n")).toContain(`月 ${DEFAULT_MONTHLY_LIMIT} 回まで`);
    expect(requireFeature("citations").description).toContain(`${LISTING_MEDIA.length} の地図`);
    expect(requireFeature("listings").description).toContain(`${LISTING_MEDIA.length} の地図`);
    expect(PLAN_BY_ID.standard.highlights.join("\n")).toContain(`${LISTING_MEDIA.length} 媒体`);
  });

  // ルール数はルールの側から import できない（サーバー専用のコードがクライアントに混ざる）ので、
  // ソースを読んで ID を数える。ルールを足したら AUDIT_RULE_COUNT も直す（2026-09-29 まで「48」のままだった）
  it("サイト診断のルール数は src/lib/audit のルール ID の数と同じ", () => {
    const dir = join(process.cwd(), "src/lib/audit");
    const sources = ["rules/page.ts", "rules/cross.ts", "run.ts"].map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    const ids = new Set<string>();
    for (const m of sources.matchAll(/(?:issue\(\s*|ruleId:\s*)"([A-Z0-9_]+)"/g)) ids.add(m[1]);
    expect(ids.size).toBe(AUDIT_RULE_COUNT);
    expect(requireFeature("seo-analysis").description).toContain(`${AUDIT_RULE_COUNT} ルール`);
    expect(requireFeature("seo-analysis").details.join("\n")).toContain(`${AUDIT_RULE_COUNT} ルール`);
  });

  // 2026-09-18 から無料診断にはアカウント登録が要る（特商法の表記が「アカウント不要」のままだった）
  it("特商法の表記に「アカウント不要」と書かない", () => {
    const price = TOKUSHOHO_ROWS.find((r) => r.label === "販売価格");
    const text = Array.isArray(price?.value) ? price.value.join("\n") : (price?.value ?? "");
    expect(text).toContain("クイック診断");
    expect(text).not.toContain("アカウント不要");
    expect(text).toContain("アカウント登録");
  });
});
