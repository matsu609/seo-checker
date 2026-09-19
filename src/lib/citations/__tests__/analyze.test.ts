/**
 * サイテーションの判定（純関数）。ネットワークには出ない。
 */
import { describe, expect, it } from "vitest";
import { SEARCHABLE_MEDIA_IDS } from "../sources";
import {
  addressCore,
  addressPhrase,
  addressStatus,
  buildQueries,
  buildReport,
  classifyHost,
  hostOf,
  isOwnHost,
  mergeHits,
  ownHostOf,
  phoneCandidates,
  phoneDigits,
  phoneStatus,
  type CitationInput,
} from "@/lib/citations";
import { parseOrganic } from "@/lib/citations/dataforseo";

const INPUT: CitationInput = {
  name: "丸の内歯科クリニック",
  phone: "03-1234-5678",
  address: "〒100-0005 東京都千代田区丸の内1-1-1 パレスビル3F",
  website: "https://www.example.co.jp/",
};

describe("URL とホスト", () => {
  it("www. を落とし、読めない URL は空", () => {
    expect(hostOf("https://www.Example.co.jp/shop")).toBe("example.co.jp");
    expect(hostOf("not a url")).toBe("");
    expect(ownHostOf("example.co.jp")).toBe("example.co.jp");
    expect(ownHostOf("")).toBeNull();
  });

  it("自社サイトはサブドメインも含めて自社", () => {
    expect(isOwnHost("shop.example.co.jp", "example.co.jp")).toBe(true);
    expect(isOwnHost("example.co.jp", "example.co.jp")).toBe(true);
    expect(isOwnHost("example.com", "example.co.jp")).toBe(false);
    expect(isOwnHost("tabelog.com", null)).toBe(false);
  });
});

describe("電話番号", () => {
  it("記号・全角・+81 を吸収する", () => {
    expect(phoneDigits("０３－１２３４－５６７８")).toBe("0312345678");
    expect(phoneDigits("+81 3-1234-5678")).toBe("0312345678");
    expect(phoneDigits("(090) 1234 5678")).toBe("09012345678");
  });

  it("文中から 10〜11 桁の番号だけを拾う（郵便番号・日付は拾わない）", () => {
    const text = "〒100-0005 2026-09-17 営業中。TEL 03-1234-5678 / 090-8765-4321。FAX 03-1234-5679";
    expect(phoneCandidates(text)).toEqual(["0312345678", "09087654321", "0312345679"]);
    expect(phoneCandidates("番号の記載なし")).toEqual([]);
  });

  it("一致 / 別の番号 / 出ていない", () => {
    expect(phoneStatus("TEL: 03-1234-5678", INPUT.phone)).toBe("match");
    expect(phoneStatus("TEL: 03-9999-0000", INPUT.phone)).toBe("mismatch");
    expect(phoneStatus("電話番号は載っていません", INPUT.phone)).toBe("absent");
    // 基本情報に電話が無ければ判定しない
    expect(phoneStatus("TEL: 03-1234-5678", "")).toBe("absent");
  });
});

describe("住所", () => {
  it("郵便番号と建物名を落として番地までにする", () => {
    expect(addressCore(INPUT.address)).toBe("東京都千代田区丸の内1-1-1");
    expect(addressCore("東京都千代田区丸の内1丁目1番1号 パレスビル")).toBe("東京都千代田区丸の内1丁目1番1号");
    // 数字が無い住所はそのまま
    expect(addressCore("東京都千代田区丸の内一丁目")).toBe("東京都千代田区丸の内一丁目");
  });

  it("検索語には都道府県を付けない", () => {
    expect(addressPhrase(INPUT.address)).toBe("千代田区丸の内1-1-1");
    expect(addressPhrase("北海道札幌市中央区北1条西2-3")).toBe("札幌市中央区北1条西2-3");
    expect(addressPhrase("大阪府大阪市北区梅田1-1")).toBe("大阪市北区梅田1-1");
  });

  it("丁目・番地・ハイフンの表記ゆれを吸収して一致を取る", () => {
    expect(addressStatus("所在地: 東京都千代田区丸の内１丁目１番１号 パレスビル", INPUT.address)).toBe("match");
    expect(addressStatus("千代田区丸の内 1-1-1", INPUT.address)).toBe("match");
    expect(addressStatus("千代田区丸の内2-2-2", INPUT.address)).toBe("absent");
    expect(addressStatus("何も書いていない", "")).toBe("absent");
  });
});

describe("検索語", () => {
  it("電話 / 住所 / 店名（自社サイト以外）の 3 本", () => {
    const q = buildQueries(INPUT);
    expect(q.map((x) => x.id)).toEqual(["phone", "address", "name"]);
    expect(q[0]!.q).toBe('"丸の内歯科クリニック" "03-1234-5678"');
    expect(q[1]!.q).toBe('"丸の内歯科クリニック" "千代田区丸の内1-1-1"');
    expect(q[2]!.q).toBe('"丸の内歯科クリニック" -site:example.co.jp');
  });

  it("電話・住所・サイトが空ならその検索は組み立てない", () => {
    const q = buildQueries({ name: "店 \"名\"", phone: "", address: "", website: "" });
    expect(q[0]!.q).toBe("");
    expect(q[1]!.q).toBe("");
    expect(q[2]!.q).toBe('"店 名"');
  });
});

describe("サイトの分類", () => {
  it("自社 → 既知の媒体 → その他 の順", () => {
    expect(classifyHost("shop.example.co.jp", "/", "example.co.jp").kind).toBe("own");
    expect(classifyHost("tabelog.com", "/tokyo/", null)).toEqual({ kind: "review", sourceLabel: "食べログ", mediaId: null });
    expect(classifyHost("loco.yahoo.co.jp", "/place/", null)).toEqual({ kind: "directory", sourceLabel: "Yahoo!ロコ（Yahoo!プレイス）", mediaId: "YAHOO_PLACE" });
    expect(classifyHost("google.com", "/maps/place/x", null).mediaId).toBe("GOOGLE_MAPS");
    // google.com でも /maps 以外は媒体扱いにしない
    expect(classifyHost("google.com", "/search", null).kind).toBe("other");
    expect(classifyHost("unknown-blog.jp", "/", null).kind).toBe("other");
  });
});

describe("集計", () => {
  const outcomes = [
    {
      id: "phone" as const,
      error: null,
      hits: [
        { url: "https://tabelog.com/tokyo/A1/1/", title: "丸の内歯科クリニック - 食べログ", snippet: "TEL 03-1234-5678 東京都千代田区丸の内1-1-1", position: 1 },
        { url: "https://www.example.co.jp/", title: "丸の内歯科クリニック", snippet: "03-1234-5678", position: 2 },
        { url: "https://loco.yahoo.co.jp/place/1/", title: "丸の内歯科クリニック - Yahoo!ロコ", snippet: "電話 03-9999-0000", position: 3 },
      ],
    },
    {
      id: "name" as const,
      error: null,
      hits: [
        { url: "https://tabelog.com/tokyo/A1/1/photos/", title: "写真", snippet: "", position: 5 },
        { url: "https://unknown-blog.jp/post/1", title: "行ってきた", snippet: "丸の内歯科クリニックに行ってきました", position: 1 },
      ],
    },
    { id: "address" as const, error: "DataForSEO の残高または回数制限に達しました", hits: [] },
  ];

  it("1 サイト 1 行にまとめ、自社サイトは最後、複数の検索で見つかったサイトが先", () => {
    const hits = mergeHits(INPUT, outcomes);
    expect(hits.map((h) => h.domain)).toEqual(["tabelog.com", "unknown-blog.jp", "loco.yahoo.co.jp", "example.co.jp"]);
    const tabelog = hits[0]!;
    expect(tabelog.pages).toBe(2);
    expect(tabelog.foundBy).toEqual(["phone", "name"]);
    expect(tabelog.phone).toBe("match");
    expect(tabelog.address).toBe("match");
    expect(tabelog.bestPosition).toBe(1);
    expect(hits[2]!.phone).toBe("mismatch");
    expect(hits[3]!.kind).toBe("own");
  });

  it("報告書: 失敗した検索は理由を持ち、サマリーは自社サイトを除いて数える", () => {
    const report = buildReport(INPUT, buildQueries(INPUT), outcomes, "2026-09-17T00:00:00.000Z");
    expect(report.queries.find((q) => q.id === "address")).toMatchObject({ results: null, error: outcomes[2]!.error });
    expect(report.queries.find((q) => q.id === "phone")).toMatchObject({ results: 3, error: null });
    expect(report.summary).toEqual({ sites: 3, phoneMatch: 1, phoneMismatch: 1, addressMatch: 1, ownFound: true, mediaFound: 1, mediaTotal: SEARCHABLE_MEDIA_IDS.length });
    const yahoo = report.coverage.find((c) => c.mediaId === "YAHOO_PLACE");
    expect(yahoo?.found).toBe(true);
    expect(yahoo?.url).toBe("https://loco.yahoo.co.jp/place/1/");
    expect(report.coverage.find((c) => c.mediaId === "YELP")?.found).toBe(false);
    // 地図アプリは検索結果に出ないので掲載状況に数えない
    expect(report.coverage.map((c) => c.mediaId)).not.toContain("GOOGLE_MAPS");
  });
});

describe("DataForSEO の応答", () => {
  it("organic だけを拾い、順位が無ければ出現順", () => {
    const payload = {
      tasks: [
        {
          status_code: 20000,
          result: [
            {
              items: [
                { type: "paid", url: "https://ad.example/", title: "広告" },
                { type: "organic", rank_absolute: 2, url: "https://tabelog.com/x", title: "食べログ", description: "TEL 03-1234-5678" },
                { type: "organic", url: "https://example.jp/", title: "no rank", description: null },
                { type: "organic", url: "javascript:void(0)", title: "bad" },
              ],
            },
          ],
        },
      ],
    };
    expect(parseOrganic(payload)).toEqual([
      { url: "https://tabelog.com/x", title: "食べログ", snippet: "TEL 03-1234-5678", position: 2 },
      { url: "https://example.jp/", title: "no rank", snippet: "", position: 2 },
    ]);
  });

  it("task が失敗していれば例外、空の結果は空配列", () => {
    expect(() => parseOrganic({ tasks: [{ status_code: 40501, status_message: "Invalid Field" }] })).toThrow(/Invalid Field/);
    expect(parseOrganic({ tasks: [{ status_code: 20000, result: [{ items: [] }] }] })).toEqual([]);
    expect(parseOrganic(null)).toEqual([]);
  });
});
