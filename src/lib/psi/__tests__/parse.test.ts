import { describe, expect, it } from "vitest";
import fixture from "./fixtures/psi-mobile.json";
import { buildPsiUrl, psiErrorMessage } from "../client";
import { collectOpportunities, formatCls, formatMs, parsePsi } from "../parse";

const parsed = parsePsi(fixture, { requestedUrl: "https://example.co.jp/", strategy: "mobile", usedApiKey: false });

describe("PageSpeed Insights のパース", () => {
  it("カテゴリのスコアを 0〜100 に直す", () => {
    expect(parsed.categories).toEqual({ performance: 62, accessibility: 88, seo: 100 });
  });

  it("CrUX の実測値を読む（CLS は 100 分の 1 にする）", () => {
    expect(parsed.crux?.lcp).toEqual({ value: 3120, category: "AVERAGE" });
    expect(parsed.crux?.inp).toEqual({ value: 168, category: "FAST" });
    expect(parsed.crux?.cls).toEqual({ value: 0.12, category: "AVERAGE" });
  });

  it("ラボ値（この 1 回の計測）も読む", () => {
    expect(parsed.lab.lcp).toBeCloseTo(3421.5);
    expect(parsed.lab.cls).toBeCloseTo(0.114);
    expect(parsed.lab.fcp).toBe(1180);
    expect(parsed.lab.tbt).toBe(418);
  });

  it("改善項目はスコアの低い順に 5 件まで、情報表示のみの監査は除く", () => {
    const ids = parsed.opportunities.map((o) => o.id);
    expect(ids[0]).toBe("is-crawlable");
    expect(ids[1]).toBe("uses-responsive-images");
    expect(ids).not.toContain("network-requests");
    expect(ids).not.toContain("structured-data");
    expect(ids).not.toContain("canonical");
    expect(parsed.opportunities.length).toBeLessThanOrEqual(5);
  });

  it("URL と取得日時を保持する", () => {
    expect(parsed.finalUrl).toBe("https://example.co.jp/");
    expect(parsed.fetchedAt).toBe("2026-09-06T12:34:56.789Z");
    expect(parsed.strategy).toBe("mobile");
    expect(parsed.usedApiKey).toBe(false);
  });

  it("空のレスポンスでも落ちず、値は null になる", () => {
    const empty = parsePsi({}, { requestedUrl: "https://example.co.jp/", strategy: "desktop", usedApiKey: true });
    expect(empty.categories).toEqual({ performance: null, accessibility: null, seo: null });
    expect(empty.crux).toBeNull();
    expect(empty.lab).toEqual({ lcp: null, cls: null, fcp: null, tbt: null });
    expect(empty.opportunities).toEqual([]);
    expect(empty.requestedUrl).toBe("https://example.co.jp/");
  });

  it("JSON でない値を渡しても落ちない", () => {
    expect(() => parsePsi(null, { requestedUrl: "x", strategy: "mobile", usedApiKey: false })).not.toThrow();
    expect(() => parsePsi("文字列", { requestedUrl: "x", strategy: "mobile", usedApiKey: false })).not.toThrow();
  });

  it("CrUX が無ければ crux は null（ラボ値だけで表示する）", () => {
    const noCrux = parsePsi(
      { lighthouseResult: (fixture as { lighthouseResult: unknown }).lighthouseResult },
      { requestedUrl: "https://example.co.jp/", strategy: "mobile", usedApiKey: false },
    );
    expect(noCrux.crux).toBeNull();
    expect(noCrux.lab.lcp).toBeCloseTo(3421.5);
  });

  it("上位件数は引数で変えられる", () => {
    const audits = (fixture as { lighthouseResult: { audits: Record<string, unknown> } }).lighthouseResult.audits;
    expect(collectOpportunities(audits, 2)).toHaveLength(2);
  });
});

describe("表示の整形", () => {
  it("ミリ秒と秒を使い分ける", () => {
    expect(formatMs(940)).toBe("940 ms");
    expect(formatMs(3421.5)).toBe("3.4 秒");
    expect(formatMs(null)).toBe("—");
  });

  it("CLS は小数第 3 位まで", () => {
    expect(formatCls(0.114)).toBe("0.114");
    expect(formatCls(null)).toBe("—");
  });
});

describe("リクエストの組み立て", () => {
  it("必要なクエリを付ける。キーが無ければ key を付けない", () => {
    const url = new URL(buildPsiUrl("https://example.co.jp/", "mobile"));
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    expect(url.searchParams.get("url")).toBe("https://example.co.jp/");
    expect(url.searchParams.get("strategy")).toBe("mobile");
    expect(url.searchParams.getAll("category")).toEqual(["PERFORMANCE", "ACCESSIBILITY", "SEO"]);
    expect(url.searchParams.get("locale")).toBe("ja");
    expect(url.searchParams.has("key")).toBe(false);
  });

  it("API キーがあれば key を付ける", () => {
    const url = new URL(buildPsiUrl("https://example.co.jp/", "desktop", "SECRET"));
    expect(url.searchParams.get("key")).toBe("SECRET");
    expect(url.searchParams.get("strategy")).toBe("desktop");
  });

  it("429 のメッセージはキーの有無で変わる", () => {
    expect(psiErrorMessage(429, false)).toContain("PAGESPEED_API_KEY");
    expect(psiErrorMessage(429, true)).not.toContain("PAGESPEED_API_KEY");
    expect(psiErrorMessage(403, true)).toContain("API キー");
    expect(psiErrorMessage(418, true)).toContain("HTTP 418");
  });
});
