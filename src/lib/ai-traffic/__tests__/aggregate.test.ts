import { describe, expect, it } from "vitest";
import {
  OTHER_SERVICE_LABEL,
  aggregateTraffic,
  bucketOf,
  filterPageRows,
  formatRatio,
  keyEventCount,
  ratio,
  serviceValues,
  sumPageRows,
  toIsoDate,
  topServices,
  totalsOf,
} from "../aggregate";
import type { AiTrafficDailyRow, AiTrafficPageRow } from "../types";

function row(
  date: string,
  source: string,
  channel: string,
  sessions: number,
  users = sessions,
): AiTrafficDailyRow {
  return { date, source, channel, sessions, users };
}

describe("toIsoDate", () => {
  it("GA4 の YYYYMMDD を ISO にする", () => {
    expect(toIsoDate("20260901")).toBe("2026-09-01");
    expect(toIsoDate("2026-09-01")).toBe("2026-09-01");
  });

  it("読めない値は空文字", () => {
    expect(toIsoDate("(other)")).toBe("");
    expect(toIsoDate("")).toBe("");
    expect(toIsoDate("2026/09/01")).toBe("");
  });
});

/** null を返さない前提の呼び出し（返さないこと自体は別のテストで確かめる） */
function bucket(isoDate: string, granularity: Parameters<typeof bucketOf>[1]) {
  const b = bucketOf(isoDate, granularity);
  if (!b) throw new Error(`bucketOf が null を返しました: ${isoDate}`);
  return b;
}

describe("bucketOf", () => {
  it("日は 1 日 1 バケット", () => {
    expect(bucketOf("20260901", "day")).toEqual({ key: "2026-09-01", label: "9/1" });
  });

  it("週は月曜始まり", () => {
    // 2026-09-07 は月曜
    expect(bucketOf("2026-09-07", "week")).toEqual({ key: "2026-09-07", label: "9/7-9/13" });
    expect(bucketOf("2026-09-13", "week")).toEqual({ key: "2026-09-07", label: "9/7-9/13" });
    // 日曜（2026-09-06）は前の週に入る
    expect(bucket("2026-09-06", "week").key).toBe("2026-08-31");
  });

  it("月をまたぐ週も 1 つのバケットになる", () => {
    // 2026-03-30(月) 〜 2026-04-05(日)
    const monday = bucketOf("2026-03-30", "week");
    const sunday = bucketOf("2026-04-05", "week");
    expect(monday).toEqual({ key: "2026-03-30", label: "3/30-4/5" });
    expect(sunday).toEqual(monday);
    // 翌日（月曜）は次のバケット
    expect(bucket("2026-04-06", "week").key).toBe("2026-04-06");
  });

  it("年をまたぐ週も 1 つのバケットになる", () => {
    // 2025-12-29(月) 〜 2026-01-04(日)
    expect(bucketOf("2026-01-04", "week")).toEqual({ key: "2025-12-29", label: "12/29-1/4" });
  });

  it("月は月初でまとまり、月末・月初が別バケットになる", () => {
    expect(bucketOf("2026-03-31", "month")).toEqual({ key: "2026-03", label: "2026/03" });
    expect(bucketOf("2026-04-01", "month")).toEqual({ key: "2026-04", label: "2026/04" });
  });

  it("読めない日付は null", () => {
    expect(bucketOf("(other)", "day")).toBeNull();
    expect(bucketOf("", "week")).toBeNull();
  });
});

describe("ratio / formatRatio", () => {
  it("分母が 0 なら null（0% と区別する）", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(5, -1)).toBeNull();
    expect(ratio(Number.NaN, 10)).toBeNull();
  });

  it("普通の割合", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(0, 4)).toBe(0);
  });

  it("表示は % で、null は —", () => {
    expect(formatRatio(0.1234)).toBe("12.3%");
    expect(formatRatio(null)).toBe("—");
    expect(formatRatio(0)).toBe("0.0%");
  });
});

describe("aggregateTraffic", () => {
  const rows: AiTrafficDailyRow[] = [
    // 順不同で渡す（キーで並べ直せることを確認）
    row("20260903", "google", "Organic Search", 50, 40),
    row("20260901", "google", "Organic Search", 100, 80),
    row("20260901", "chatgpt.com", "Referral", 10, 9),
    row("20260901", "www.perplexity.ai", "Referral", 5, 5),
    row("20260901", "(direct)", "Direct", 35, 30),
    row("20260903", "claude.ai", "Referral", 4, 4),
  ];

  it("日ごとに 3 系列と 2 つの率を出す", () => {
    const buckets = aggregateTraffic(rows, { granularity: "day", metric: "sessions" });
    expect(buckets.map((b) => b.key)).toEqual(["2026-09-01", "2026-09-03"]);

    const [d1, d3] = buckets;
    expect(d1.total).toBe(150);
    expect(d1.organic).toBe(100);
    expect(d1.ai).toBe(15);
    expect(d1.other).toBe(35);
    expect(d1.aiRateTotal).toBeCloseTo(15 / 150);
    expect(d1.aiRateOrganic).toBeCloseTo(15 / 100);
    expect(d1.byService).toEqual({ ChatGPT: 10, Perplexity: 5 });

    expect(d3.total).toBe(54);
    expect(d3.ai).toBe(4);
    expect(d3.byService).toEqual({ Claude: 4 });
  });

  it("指標をユーザー数に切り替えられる", () => {
    const [d1] = aggregateTraffic(rows, { granularity: "day", metric: "users" });
    expect(d1.total).toBe(124);
    expect(d1.organic).toBe(80);
    expect(d1.ai).toBe(14);
  });

  it("週・月でまとめられる", () => {
    const weekly = aggregateTraffic(rows, { granularity: "week", metric: "sessions" });
    expect(weekly).toHaveLength(1);
    expect(weekly[0].key).toBe("2026-08-31");
    expect(weekly[0].total).toBe(204);
    expect(weekly[0].ai).toBe(19);

    const monthly = aggregateTraffic(rows, { granularity: "month", metric: "sessions" });
    expect(monthly).toHaveLength(1);
    expect(monthly[0].label).toBe("2026/09");
  });

  it("自然検索が 0 のときは対自然検索の率を null にする", () => {
    const buckets = aggregateTraffic([row("20260901", "chatgpt.com", "Referral", 10)], {
      granularity: "day",
      metric: "sessions",
    });
    expect(buckets[0].aiRateOrganic).toBeNull();
    expect(buckets[0].aiRateTotal).toBe(1);
  });

  it("全部 0 のときは両方の率が null", () => {
    const buckets = aggregateTraffic([row("20260901", "google", "Organic Search", 0)], {
      granularity: "day",
      metric: "sessions",
    });
    expect(buckets[0].total).toBe(0);
    expect(buckets[0].aiRateTotal).toBeNull();
    expect(buckets[0].aiRateOrganic).toBeNull();
  });

  it("自然検索に分類された AI 流入を二重計上しない", () => {
    // GA4 は一部の AI 参照元を Organic Search に入れる。積み上げ（ai + organicOnly + other）が
    // total を超えないことを確かめる
    const buckets = aggregateTraffic(
      [
        row("20260901", "chatgpt.com", "Organic Search", 10),
        row("20260901", "google", "Organic Search", 100),
      ],
      { granularity: "day", metric: "sessions" },
    );
    const [d1] = buckets;
    expect(d1.total).toBe(110);
    expect(d1.organic).toBe(110);
    expect(d1.ai).toBe(10);
    expect(d1.organicAi).toBe(10);
    expect(d1.organicOnly).toBe(100);
    expect(d1.other).toBe(0);
    expect(d1.ai + d1.organicOnly + d1.other).toBe(d1.total);
    expect(totalsOf(buckets).organicAi).toBe(10);
  });

  it("辞書に無い参照元は AI に数えない", () => {
    const buckets = aggregateTraffic(
      [row("20260901", "yahoo.co.jp", "Referral", 20), row("20260901", "chatgpt.com", "Referral", 5)],
      { granularity: "day", metric: "sessions" },
    );
    expect(buckets[0].ai).toBe(5);
    expect(buckets[0].other).toBe(20);
    expect(buckets[0].byService).toEqual({ ChatGPT: 5 });
  });

  it("ユーザー追加の辞書も AI に数える", () => {
    const buckets = aggregateTraffic([row("20260901", "ai.example.jp", "Referral", 7)], {
      granularity: "day",
      metric: "sessions",
      extraSources: [{ host: "ai.example.jp", service: "社内 AI" }],
    });
    expect(buckets[0].ai).toBe(7);
    expect(buckets[0].byService).toEqual({ "社内 AI": 7 });
  });

  it("欠損した指標（NaN・負値）は 0 として扱う", () => {
    const buckets = aggregateTraffic(
      [
        { date: "20260901", source: "chatgpt.com", channel: "Referral", sessions: Number.NaN, users: -3 },
        row("20260901", "google", "Organic Search", 10, 10),
      ],
      { granularity: "day", metric: "sessions" },
    );
    expect(buckets[0].ai).toBe(0);
    expect(buckets[0].total).toBe(10);
  });

  it("日付が読めない行は捨てる", () => {
    expect(aggregateTraffic([row("(other)", "chatgpt.com", "Referral", 5)], { granularity: "day", metric: "sessions" }))
      .toEqual([]);
  });

  it("その他は負にならない（AI が自然検索に含まれる構成でも）", () => {
    // AI 検索が Organic Search に分類されている GA4 設定でも other は 0 で止まる
    const buckets = aggregateTraffic([row("20260901", "chatgpt.com", "Organic Search", 10)], {
      granularity: "day",
      metric: "sessions",
    });
    expect(buckets[0].total).toBe(10);
    expect(buckets[0].organic).toBe(10);
    expect(buckets[0].ai).toBe(10);
    expect(buckets[0].other).toBe(0);
  });

  it("行が無ければ空配列", () => {
    expect(aggregateTraffic([], { granularity: "day", metric: "sessions" })).toEqual([]);
  });
});

describe("topServices / serviceValues", () => {
  const rows: AiTrafficDailyRow[] = [
    row("20260901", "chatgpt.com", "Referral", 100),
    row("20260901", "gemini.google.com", "Referral", 80),
    row("20260901", "perplexity.ai", "Referral", 60),
    row("20260901", "claude.ai", "Referral", 40),
    row("20260901", "copilot.microsoft.com", "Referral", 20),
    row("20260901", "felo.ai", "Referral", 10),
    row("20260901", "poe.com", "Referral", 5),
  ];
  const buckets = aggregateTraffic(rows, { granularity: "day", metric: "sessions" });

  it("上位 N 件 + その他にまとめる", () => {
    const services = topServices(buckets, 5);
    expect(services).toEqual(["ChatGPT", "Gemini", "Perplexity", "Claude", "Microsoft Copilot", OTHER_SERVICE_LABEL]);
    expect(serviceValues(buckets[0], services)).toEqual([100, 80, 60, 40, 20, 15]);
  });

  it("上限以下ならそのまま", () => {
    const few = aggregateTraffic([row("20260901", "chatgpt.com", "Referral", 3)], {
      granularity: "day",
      metric: "sessions",
    });
    expect(topServices(few, 5)).toEqual(["ChatGPT"]);
    expect(serviceValues(few[0], ["ChatGPT"])).toEqual([3]);
  });

  it("値の無いサービスは 0", () => {
    expect(serviceValues(buckets[0], ["存在しない"])).toEqual([0]);
  });
});

describe("ページ × 流入元 × キーイベント", () => {
  const pages: AiTrafficPageRow[] = [
    {
      landingPage: "/pricing",
      source: "chatgpt.com",
      service: "ChatGPT",
      sessions: 30,
      users: 25,
      keyEvents: 4,
      keyEventsByName: { purchase: 3, contact: 1 },
    },
    {
      landingPage: "/blog/aio",
      source: "perplexity.ai",
      service: "Perplexity",
      sessions: 20,
      users: 18,
      keyEvents: 0,
      keyEventsByName: { purchase: 0, contact: 0 },
    },
    {
      landingPage: "/pricing",
      source: "unknown.example",
      service: null,
      sessions: 5,
      users: 5,
      keyEvents: 2,
      keyEventsByName: { purchase: 0, contact: 2 },
    },
  ];

  it("キーイベント名を指定すればその件数を見る", () => {
    expect(keyEventCount(pages[0])).toBe(4);
    expect(keyEventCount(pages[0], "purchase")).toBe(3);
    expect(keyEventCount(pages[0], "signup")).toBe(0);
  });

  it("キーイベントのある行だけに絞れる", () => {
    expect(filterPageRows(pages, { onlyWithKeyEvents: true }).map((r) => r.landingPage)).toEqual([
      "/pricing",
      "/pricing",
    ]);
    expect(
      filterPageRows(pages, { onlyWithKeyEvents: true, keyEventName: "purchase" }).map((r) => r.source),
    ).toEqual(["chatgpt.com"]);
  });

  it("サービスで絞れる", () => {
    expect(filterPageRows(pages, { service: "Perplexity" })).toHaveLength(1);
    expect(filterPageRows(pages, {})).toHaveLength(3);
  });

  it("合計はキーイベント名に追随する", () => {
    expect(sumPageRows(pages)).toEqual({ sessions: 55, users: 48, keyEvents: 6 });
    expect(sumPageRows(pages, "contact").keyEvents).toBe(3);
    expect(sumPageRows([]).sessions).toBe(0);
  });
});

describe("存在しない日付は取り込まない", () => {
  it("閏年でない 2 月 29 日・31 日の無い月は空文字", () => {
    expect(toIsoDate("20260229")).toBe("");
    expect(toIsoDate("20260231")).toBe("");
    expect(toIsoDate("2026-02-29")).toBe("");
    expect(toIsoDate("20261301")).toBe("");
    expect(toIsoDate("20260900")).toBe("");
  });
  it("実在する日付はそのまま通す（閏年の 2 月 29 日を含む）", () => {
    expect(toIsoDate("20240229")).toBe("2024-02-29");
    expect(toIsoDate("20260901")).toBe("2026-09-01");
    expect(toIsoDate("2026-09-01")).toBe("2026-09-01");
  });
  it("読めない日付の行はバケットに入らない", () => {
    expect(bucketOf("20260229", "day")).toBeNull();
    expect(bucketOf("20260229", "week")).toBeNull();
    expect(bucketOf("20260229", "month")).toBeNull();
  });
});
