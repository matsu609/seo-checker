import { describe, expect, it } from "vitest";
import { buildIssues, buildJsonLdSuggestion, buildNapResult, MANUAL_CHECK_NOTE, summarize } from "../report";
import type { NapInput, NapSource } from "../types";

const input: NapInput = { name: "株式会社ウルフ情報", address: "〒150-0041 東京都渋谷区神南1-2-3 ウルフビル4F", phone: "03-1234-5678", website: "https://example.co.jp/" };

const jsonLd: NapSource = {
  kind: "site_jsonld",
  label: "構造化データ（LocalBusiness）",
  url: "https://example.co.jp/",
  fields: [
    { field: "name", status: "match", expected: input.name, found: input.name },
    { field: "address", status: "mismatch", expected: input.address, found: "東京都渋谷区神南1-2-3 別ビル2F", note: "番地までは一致。建物名・階が違います" },
    { field: "phone", status: "missing", expected: input.phone, found: null },
    { field: "website", status: "match", expected: input.website, found: input.website },
  ],
  error: null,
};
const top: NapSource = {
  kind: "site_page",
  label: "トップページ",
  url: "https://example.co.jp/",
  fields: [
    { field: "name", status: "match", expected: input.name, found: input.name },
    { field: "address", status: "match", expected: input.address, found: "東京都渋谷区神南1-2-3", note: "番地までは一致。建物名・階が書かれていません" },
    { field: "phone", status: "match", expected: input.phone, found: "03-1234-5678" },
    { field: "website", status: "skipped", expected: input.website, found: null },
  ],
  error: null,
};
const google: NapSource = {
  kind: "google_maps",
  label: "Google マップ（ウルフ情報）",
  url: "https://maps.google.com/?cid=1",
  fields: [
    { field: "name", status: "mismatch", expected: input.name, found: "ウルフ情報", note: "法人格（株式会社など）の有無が違います" },
    { field: "address", status: "match", expected: input.address, found: input.address },
    { field: "phone", status: "match", expected: input.phone, found: "03-1234-5678" },
    { field: "website", status: "missing", expected: input.website, found: null },
  ],
  error: null,
};
const web: NapSource = {
  kind: "web",
  label: "Yahoo!ロコ（loco.yahoo.co.jp）",
  url: "https://loco.yahoo.co.jp/place/x",
  fields: [
    { field: "name", status: "match", expected: input.name, found: input.name },
    { field: "address", status: "match", expected: input.address, found: input.address },
    { field: "phone", status: "match", expected: input.phone, found: "03-1234-5678" },
    { field: "website", status: "missing", expected: input.website, found: null },
  ],
  error: null,
};
const failed: NapSource = { kind: "listing", label: "Yelp", url: "https://yelp.com/biz/x", fields: [], error: "ページを取得できませんでした（HTTP 404）" };

describe("直すべき箇所", () => {
  it("不一致が上、次に要確認。同じ重さなら自分で直せる媒体が上", () => {
    const issues = buildIssues([web, failed, google, top, jsonLd]);
    expect(issues.map((i) => [i.severity, i.sourceKind, i.field])).toEqual([
      ["fail", "site_jsonld", "address"],
      ["fail", "google_maps", "name"],
      ["warn", "site_jsonld", "phone"],
      ["warn", "google_maps", "website"],
      ["warn", "listing", null],
    ]);
  });

  it("文面: 書かれている値 → 正、直し方に JSON-LD のキー名", () => {
    const [addr] = buildIssues([jsonLd]);
    expect(addr.title).toBe("構造化データ（LocalBusiness）の住所が違います");
    expect(addr.detail).toBe("書かれている値: 東京都渋谷区神南1-2-3 別ビル2F → 正: 〒150-0041 東京都渋谷区神南1-2-3 ウルフビル4F（番地までは一致。建物名・階が違います）");
    expect(addr.action).toMatch(/address\.streetAddress/);
    const phone = buildIssues([jsonLd]).find((i) => i.field === "phone");
    expect(phone?.severity).toBe("warn");
    expect(phone?.action).toMatch(/telephone/);
  });

  it("ウェブで見つけたページの「サイト URL 記載なし」と、自社ページの建物名の省略は出さない。取得できずは要確認", () => {
    expect(buildIssues([web])).toEqual([]);
    expect(buildIssues([top])).toEqual([]);
    const [f] = buildIssues([failed]);
    expect(f).toMatchObject({ severity: "warn", field: null, title: "Yelpを確認できませんでした", detail: "ページを取得できませんでした（HTTP 404）" });
  });
});

describe("集計と結果", () => {
  it("取得できなかった媒体は数えない。skipped は数えない", () => {
    expect(summarize([jsonLd, top, google, web, failed])).toEqual({ sources: 4, match: 10, mismatch: 2, missing: 3 });
  });

  it("JSON-LD の提案: 構造化データがずれていれば出す（〒 は postalCode に分ける）。正しければ出さない。サイトを見ていなければ出さない", () => {
    const s = buildJsonLdSuggestion(input, [jsonLd, top]);
    expect(s).toContain('"@type": "LocalBusiness"');
    expect(s).toContain('"postalCode": "150-0041"');
    expect(s).toContain('"streetAddress": "東京都渋谷区神南1-2-3 ウルフビル4F"');
    expect(s).toContain('"telephone": "03-1234-5678"');
    const good: NapSource = { ...jsonLd, fields: jsonLd.fields.map((f) => ({ ...f, status: "match" as const })) };
    expect(buildJsonLdSuggestion(input, [good, top])).toBeNull();
    // 構造化データが無いサイトには出す
    expect(buildJsonLdSuggestion(input, [top])).not.toBeNull();
    expect(buildJsonLdSuggestion({ ...input, website: "" }, [google])).toBeNull();
    expect(buildJsonLdSuggestion(input, [google])).toBeNull();
  });

  it("結果は媒体の順に並べ、注意書きに手で確かめる媒体を必ず添える", () => {
    const r = buildNapResult(input, [web, google, top, jsonLd], { notes: ["  ", "Google マップは確認していません"], checkedAt: "2026-09-20T12:00:00.000Z" });
    expect(r.sources.map((s) => s.kind)).toEqual(["site_jsonld", "site_page", "google_maps", "web"]);
    expect(r.checkedAt).toBe("2026-09-20T12:00:00.000Z");
    expect(r.notes).toEqual(["Google マップは確認していません", MANUAL_CHECK_NOTE]);
    expect(r.summary.sources).toBe(4);
    expect(r.issues.length).toBeGreaterThan(0);
  });
});
