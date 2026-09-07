/**
 * チャネル別セッションの集計（§18.2 の積み上げ棒）。
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CHANNEL_SERIES,
  OTHER_CHANNEL_LABEL,
  aggregateChannels,
  channelColor,
  channelLabel,
  channelValues,
  rankChannels,
  topChannels,
} from "../channels";
import type { ChannelDailyRow } from "../types";

const ROWS: ChannelDailyRow[] = [
  { date: "2026-09-01", channel: "Organic Search", sessions: 100, users: 80 },
  { date: "2026-09-01", channel: "Direct", sessions: 40, users: 35 },
  { date: "2026-09-02", channel: "Organic Search", sessions: 120, users: 90 },
  { date: "2026-09-08", channel: "Referral", sessions: 10, users: 9 },
];

describe("aggregateChannels", () => {
  it("日単位ではそのまま、チャネル別に足し上げる", () => {
    const buckets = aggregateChannels(ROWS, { granularity: "day", metric: "sessions" });
    expect(buckets.map((b) => b.key)).toEqual(["2026-09-01", "2026-09-02", "2026-09-08"]);
    expect(buckets[0].byChannel).toEqual({ "Organic Search": 100, Direct: 40 });
    expect(buckets[0].total).toBe(140);
  });

  it("週単位は月曜始まりでまとまる", () => {
    const buckets = aggregateChannels(ROWS, { granularity: "week", metric: "sessions" });
    expect(buckets).toHaveLength(2);
    expect(buckets[0].total).toBe(260);
    expect(buckets[1].total).toBe(10);
  });

  it("指標を切り替えるとユーザー数で集計する", () => {
    const buckets = aggregateChannels(ROWS, { granularity: "month", metric: "users" });
    expect(buckets).toHaveLength(1);
    expect(buckets[0].total).toBe(80 + 35 + 90 + 9);
  });

  it("日付が読めない行は捨て、チャネル名が空なら未割り当てにする", () => {
    const buckets = aggregateChannels(
      [
        { date: "", channel: "Direct", sessions: 5, users: 5 },
        { date: "20260901", channel: "  ", sessions: 7, users: 7 },
      ],
      { granularity: "day", metric: "sessions" },
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].byChannel).toEqual({ Unassigned: 7 });
  });
});

describe("topChannels / channelValues", () => {
  it("多い順に並べ、上限を超えた分は「その他のチャネル」にまとめる", () => {
    const rows: ChannelDailyRow[] = Array.from({ length: MAX_CHANNEL_SERIES + 2 }, (_, i) => ({
      date: "2026-09-01",
      channel: `ch-${i}`,
      sessions: 100 - i,
      users: 0,
    }));
    const buckets = aggregateChannels(rows, { granularity: "day", metric: "sessions" });
    const channels = topChannels(buckets);
    expect(channels).toHaveLength(MAX_CHANNEL_SERIES + 1);
    expect(channels[0]).toBe("ch-0");
    expect(channels.at(-1)).toBe(OTHER_CHANNEL_LABEL);

    const values = channelValues(buckets[0], channels);
    // 「その他」は上位に入らなかった 2 チャネルの合計
    expect(values.at(-1)).toBe(100 - MAX_CHANNEL_SERIES + (100 - MAX_CHANNEL_SERIES - 1));
    expect(values.reduce((a, b) => a + b, 0)).toBe(buckets[0].total);
  });

  it("上限以下ならそのまま", () => {
    const buckets = aggregateChannels(ROWS, { granularity: "day", metric: "sessions" });
    expect(topChannels(buckets)).toEqual(["Organic Search", "Direct", "Referral"]);
    expect(rankChannels(buckets)[0]).toEqual({ channel: "Organic Search", value: 220 });
  });
});

describe("表示", () => {
  it("既定チャネルは日本語、未知のチャネルはそのまま", () => {
    expect(channelLabel("Organic Search")).toBe("自然検索");
    expect(channelLabel("Direct")).toBe("ノーリファラー");
    expect(channelLabel("New Channel")).toBe("New Channel");
    expect(channelLabel("")).toBe("未割り当て");
  });

  it("色は必ず hex を返す", () => {
    expect(channelColor("Organic Search", 0)).toMatch(/^#[0-9a-f]{6}$/);
    expect(channelColor("Direct", 1)).toMatch(/^#[0-9a-f]{6}$/);
    expect(channelColor(OTHER_CHANNEL_LABEL, 9)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
