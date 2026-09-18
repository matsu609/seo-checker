import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/auth/routes";
import { FREE_PATHS, PLANS_PATH, SIGN_UP_PATH, UPSELL, freeShareUrl } from "../upsell";

describe("無料診断からの導線", () => {
  it("無料診断の URL はログイン不要のまま（誰にでも渡せる）", () => {
    for (const path of Object.values(FREE_PATHS)) expect(isPublicPath(path)).toBe(true);
  });

  it("申し込みと料金の入口もログイン前に開ける", () => {
    expect(isPublicPath(SIGN_UP_PATH)).toBe(true);
    // 料金は契約状況を出すのでログインが要る（申し込み後に見る画面）
    expect(isPublicPath(PLANS_PATH)).toBe(false);
  });

  it("サイト・店舗それぞれに、無料の限界と詳細診断の中身が 3 つ以上ある", () => {
    for (const copy of Object.values(UPSELL)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.limit.length).toBeGreaterThan(0);
      expect(copy.points.length).toBeGreaterThanOrEqual(3);
      expect(copy.cta).toContain("精密診断");
      // 初月無料は全員に自動で付けない（クーポンで相手ごとに渡す。2026-09-18）ので、無料診断の導線で約束しない
      expect(copy.cta).not.toContain("初月無料");
    }
  });

  it("共有リンクは origin の末尾のスラッシュを重ねない", () => {
    expect(freeShareUrl("https://app.example.com", "site")).toBe("https://app.example.com/");
    expect(freeShareUrl("https://app.example.com/", "site")).toBe("https://app.example.com/");
    expect(freeShareUrl("https://app.example.com/", "meo")).toBe("https://app.example.com/meo");
  });
});
