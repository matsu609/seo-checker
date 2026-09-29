/**
 * お客様に見える文言の「事実」（2026-09-23 に直したもの）がずれ戻らないように固定する。
 * 数字や名前は定義しているところ（catalog.ts・media.ts・quota-rules.ts・seo-analysis/limits.ts）から引いている。
 */
import { describe, expect, it } from "vitest";
import { TOKUSHOHO_ROWS } from "@/components/legal/Tokushoho";
import { FREE_RUN_LIMIT_DEFAULT } from "@/lib/free/quota-rules";
import { LISTING_MEDIA } from "@/lib/listings/media";
import { LISTING_MEDIA_COUNT, PLAN_BY_ID, PLANS } from "@/lib/plans/catalog";
import { DEFAULT_MONTHLY_LIMIT } from "@/lib/seo-analysis/limits";
import { requireFeature } from "../registry";

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

  it("無料診断の回数・精密診断の月の回数・媒体数は定義から", () => {
    expect(requireFeature("free").description).toContain(`${FREE_RUN_LIMIT_DEFAULT} 回まで`);
    expect(requireFeature("free-meo").description).toContain(`${FREE_RUN_LIMIT_DEFAULT} 回まで`);
    expect(requireFeature("seo-analysis").details.join("\n")).toContain(`月 ${DEFAULT_MONTHLY_LIMIT} 回まで`);
    expect(requireFeature("citations").description).toContain(`${LISTING_MEDIA.length} の地図`);
    expect(requireFeature("listings").description).toContain(`${LISTING_MEDIA.length} の地図`);
    expect(PLAN_BY_ID.standard.highlights.join("\n")).toContain(`${LISTING_MEDIA.length} 媒体`);
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
