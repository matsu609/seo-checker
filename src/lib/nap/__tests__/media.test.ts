import { describe, expect, it } from "vitest";
import type { QueryOutcome } from "@/lib/citations/analyze";
import { checkListingPages, checkWebPages, pickWebPages } from "../media";
import type { FetchedPage } from "../site";
import type { NapInput } from "../types";

const input: NapInput = { name: "ウルフ情報", address: "東京都渋谷区神南1-2-3", phone: "03-1234-5678", website: "https://example.co.jp/" };

const outcomes: QueryOutcome[] = [
  {
    id: "phone",
    error: null,
    hits: [
      { url: "https://example.co.jp/", title: "ウルフ情報", snippet: "03-1234-5678", position: 1 },
      { url: "https://loco.yahoo.co.jp/place/x", title: "ウルフ情報 - Yahoo!ロコ", snippet: "03-1234-5678", position: 2 },
      { url: "https://maps.apple.com/place?id=1", title: "ウルフ情報", snippet: "", position: 3 },
      { url: "https://unknown.example/x", title: "無関係", snippet: "何も無い", position: 4 },
      { url: "https://blog.example/post", title: "紹介記事", snippet: "電話 03-1234-5678", position: 5 },
    ],
  },
  { id: "address", error: null, hits: [{ url: "https://www.google.com/maps/place/x", title: "map", snippet: "", position: 1 }] },
];

describe("開くページの選び方", () => {
  it("自社・JS 描画のホスト・手がかりの無い無名サイトは開かない。既知の媒体と電話が出ているページは開く", () => {
    const pages = pickWebPages(input, outcomes);
    expect(pages.map((p) => p.url)).toEqual(["https://loco.yahoo.co.jp/place/x", "https://blog.example/post"]);
    expect(pages[0].label).toMatch(/Yahoo!ロコ/);
    expect(pickWebPages(input, outcomes, new Set(["https://loco.yahoo.co.jp/place/x"])).map((p) => p.url)).toEqual(["https://blog.example/post"]);
  });
});

function fetcher(pages: Record<string, string>) {
  const fetchPage = async (url: string): Promise<FetchedPage> => {
    const html = pages[url];
    if (html === undefined) throw new Error("取得に失敗");
    return { url, finalUrl: url, status: 200, html };
  };
  return fetchPage;
}

describe("掲載ページとウェブのページの確認", () => {
  it("控えた URL を開いて店名・住所・電話・自社サイトのリンクを見る", async () => {
    const fetchPage = fetcher({
      "https://a.jp/x": `<html><body>ウルフ情報 東京都渋谷区神南1-2-3 TEL 03-1234-5678 <a href="https://www.example.co.jp/">公式</a></body></html>`,
    });
    const r = await checkListingPages(input, [{ mediaId: "A", mediaName: "媒体A", url: "https://a.jp/x" }, { mediaId: "B", mediaName: "媒体B", url: "https://b.jp/x" }], fetchPage);
    expect(r[0]).toMatchObject({ kind: "listing", label: "媒体A", error: null });
    expect(r[0].fields.map((f) => f.status)).toEqual(["match", "match", "match", "match"]);
    expect(r[1]).toMatchObject({ kind: "listing", label: "媒体B", error: "取得に失敗" });
  });

  it("締め切りを過ぎた分は開かず、理由を残す", async () => {
    const r = await checkListingPages(input, [{ mediaId: "A", mediaName: "媒体A", url: "https://a.jp/x" }], fetcher({}), Date.now() - 1);
    expect(r[0].error).toMatch(/時間切れ/);
  });

  it("DataForSEO が無ければ検索しない（理由を notes に）。あれば電話・住所の 2 回だけ検索して媒体のページを開く", async () => {
    const off = await checkWebPages(input, new Set(), { web: { configured: () => false, search: async () => [] } });
    expect(off.sources).toEqual([]);
    expect(off.note).toMatch(/DATAFORSEO/);
    const queries: string[] = [];
    const on = await checkWebPages(input, new Set(), {
      web: { configured: () => true, search: async (q) => (queries.push(q), outcomes[0].hits) },
      fetchPage: fetcher({ "https://loco.yahoo.co.jp/place/x": "<html><body>ウルフ情報 03-1234-5678 東京都渋谷区神南1-2-3</body></html>" }),
    });
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('"03-1234-5678"');
    expect(on.searches).toBe(2);
    expect(on.sources.map((s) => [s.label, s.error])).toEqual([
      ["Yahoo!ロコ（Yahoo!プレイス）（loco.yahoo.co.jp）", null],
      ["blog.example", "取得に失敗"],
    ]);
    expect(on.sources[0].fields.map((f) => f.status)).toEqual(["match", "match", "match", "missing"]);
  });

  it("電話も住所も空なら検索しない", async () => {
    const r = await checkWebPages({ ...input, phone: "", address: "" }, new Set(), { web: { configured: () => true, search: async () => [] } });
    expect(r.searches).toBe(0);
    expect(r.note).toMatch(/電話番号と住所が空/);
  });
});
