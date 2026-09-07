import { describe, expect, it } from "vitest";
import {
  ALPHABET,
  buildQueries,
  buildSuggestUrl,
  dedupeKeywords,
  DIGITS,
  expandSuggestions,
  HIRAGANA,
  modifiersOf,
  parseSuggestResponse,
  type SuggestFetcher,
} from "../suggest";

function ok(list: string[]) {
  return { ok: true, status: 200, body: JSON.stringify(["seed", list]) };
}

describe("buildSuggestUrl", () => {
  it("client=firefox / hl=ja / q を付ける", () => {
    const url = new URL(buildSuggestUrl("llmo 対策"));
    expect(url.origin + url.pathname).toBe("https://www.google.com/complete/search");
    expect(url.searchParams.get("client")).toBe("firefox");
    expect(url.searchParams.get("hl")).toBe("ja");
    expect(url.searchParams.get("q")).toBe("llmo 対策");
  });

  it("hl は差し替えられる", () => {
    expect(new URL(buildSuggestUrl("seo", "en")).searchParams.get("hl")).toBe("en");
  });
});

describe("buildQueries / modifiersOf", () => {
  it("種 KW 単体 + 修飾子の分だけ作る", () => {
    expect(HIRAGANA).toHaveLength(46);
    expect(ALPHABET).toHaveLength(26);
    expect(DIGITS).toHaveLength(10);
    expect(modifiersOf(["kana", "alpha", "digit"])).toHaveLength(82);
    const queries = buildQueries("seo 対策", ["kana"]);
    expect(queries).toHaveLength(47);
    expect(queries[0]).toBe("seo 対策");
    expect(queries[1]).toBe("seo 対策 あ");
  });

  it("空の種 KW では何も作らない", () => {
    expect(buildQueries("   ", ["kana"])).toEqual([]);
  });

  it("修飾子なしなら種 KW だけ", () => {
    expect(buildQueries("seo", [])).toEqual(["seo"]);
  });
});

describe("parseSuggestResponse", () => {
  it("素の JSON 配列から候補を取り出す", () => {
    expect(parseSuggestResponse('["llmo",["llmo とは","llmo 対策"]]')).toEqual(["llmo とは", "llmo 対策"]);
  });

  it("JSONP で包まれていても剥がす", () => {
    expect(parseSuggestResponse('window.google.ac.h(["llmo",["llmo とは"]]);')).toEqual(["llmo とは"]);
  });

  it("候補が [文字列, 0, [...]] の形でも読める", () => {
    expect(parseSuggestResponse('["a",[["llmo とは",0,[]],["llmo 費用",0,[]]]]')).toEqual([
      "llmo とは",
      "llmo 費用",
    ]);
  });

  it("連続空白を潰し、空文字は捨てる", () => {
    expect(parseSuggestResponse('["a",["llmo   とは","","  "]]')).toEqual(["llmo とは"]);
  });

  it("HTML やブロックページは null（失敗として数える）", () => {
    expect(parseSuggestResponse("<html>429</html>")).toBeNull();
    expect(parseSuggestResponse("")).toBeNull();
    expect(parseSuggestResponse('{"suggestions":[]}')).toBeNull();
    expect(parseSuggestResponse('["a"]')).toBeNull();
  });
});

describe("dedupeKeywords", () => {
  it("大文字小文字・前後空白・連続空白を同一視して順序を保つ", () => {
    expect(dedupeKeywords(["LLMO とは", " llmo  とは ", "llmo 対策", "llmo とは"])).toEqual([
      "LLMO とは",
      "llmo 対策",
    ]);
  });
});

describe("expandSuggestions", () => {
  it("全クエリを投げて重複除去した候補を返す", async () => {
    const seen: string[] = [];
    const fetcher: SuggestFetcher = async (url) => {
      const q = new URL(url).searchParams.get("q") ?? "";
      seen.push(q);
      return ok([`${q} 結果`, "共通候補"]);
    };
    const result = await expandSuggestions({ seed: "llmo", groups: ["digit"], fetcher, concurrency: 2 });
    expect(result.queries).toBe(11);
    expect(result.succeeded).toBe(11);
    expect(result.failed).toBe(0);
    expect(result.truncated).toBe(false);
    // 11 クエリ分の固有候補 + 共通候補 1 件
    expect(result.keywords).toHaveLength(12);
    expect(result.keywords.filter((k) => k === "共通候補")).toHaveLength(1);
    expect(seen).toHaveLength(11);
  });

  it("連続して失敗すると打ち切り、それまでの部分結果を返す", async () => {
    let call = 0;
    const fetcher: SuggestFetcher = async () => {
      call += 1;
      if (call <= 2) return ok([`候補${call}`]);
      return { ok: false, status: 429, body: "" };
    };
    const result = await expandSuggestions({
      seed: "llmo",
      groups: ["kana"],
      fetcher,
      concurrency: 1,
      failureLimit: 3,
    });
    expect(result.reason).toBe("rate_limit");
    expect(result.truncated).toBe(true);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(3);
    expect(result.keywords).toEqual(["候補1", "候補2"]);
  });

  it("時間の予算を超えたら打ち切る", async () => {
    let clock = 0;
    const fetcher: SuggestFetcher = async () => {
      clock += 400;
      return ok(["候補"]);
    };
    const result = await expandSuggestions({
      seed: "llmo",
      groups: ["kana"],
      fetcher,
      concurrency: 1,
      budgetMs: 1000,
      now: () => clock,
    });
    expect(result.reason).toBe("timeout");
    expect(result.truncated).toBe(true);
    expect(result.succeeded).toBeLessThan(result.queries);
  });

  it("取得件数の上限に達したら打ち切る", async () => {
    let n = 0;
    const fetcher: SuggestFetcher = async () => {
      n += 1;
      return ok([`候補${n}a`, `候補${n}b`, `候補${n}c`]);
    };
    const result = await expandSuggestions({
      seed: "llmo",
      groups: ["kana"],
      fetcher,
      concurrency: 1,
      maxKeywords: 5,
    });
    expect(result.reason).toBe("cap");
    expect(result.keywords).toHaveLength(5);
  });

  it("取得関数が例外を投げても全体は失敗しない", async () => {
    let n = 0;
    const fetcher: SuggestFetcher = async () => {
      n += 1;
      if (n === 1) throw new Error("network");
      return ok(["候補"]);
    };
    const result = await expandSuggestions({ seed: "llmo", groups: [], fetcher, concurrency: 1 });
    expect(result.failed).toBe(1);
    expect(result.keywords).toEqual([]);
  });

  it("中止シグナルが立っていれば何も取りに行かない", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const fetcher: SuggestFetcher = async () => {
      calls += 1;
      return ok(["候補"]);
    };
    const result = await expandSuggestions({
      seed: "llmo",
      groups: ["kana"],
      fetcher,
      signal: controller.signal,
    });
    expect(calls).toBe(0);
    expect(result.reason).toBe("aborted");
  });
});
