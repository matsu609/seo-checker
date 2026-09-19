import { describe, expect, it } from "vitest";
import { CORE_MEDIA_IDS, LISTING_MEDIA, mediaById, mediaOfIntegration, mediaOfTier } from "../media";
import { ListingProfileSchema, type ListingStates } from "../profile";
import {
  bingPlacesCsv,
  buildFiles,
  csvCell,
  hoursOneLine,
  missingRequired,
  publishTargets,
  resultForMedia,
  statesAfterPublish,
  summarizeResults,
  yahooPlaceCsv,
  type PublishResult,
} from "../publish";

const profile = ListingProfileSchema.parse({
  name: "テスト商会, 新宿店",
  nameKana: "テストショウカイ",
  category: "美容室",
  postalCode: "160-0022",
  address: "東京都新宿区新宿1-1-1 テストビル 2F",
  phone: "03-1234-5678",
  website: "https://example.com",
  email: "info@example.com",
  hours: "月曜日: 10:00〜19:00\n日曜日: 定休日",
  shortDescription: "短い説明",
  longDescription: "長い説明",
});

describe("missingRequired", () => {
  it("そろっていれば空", () => {
    expect(missingRequired(profile)).toEqual([]);
  });

  it("足りない項目をラベルで返す", () => {
    expect(missingRequired(ListingProfileSchema.parse({ name: "あ" }))).toEqual(["住所", "電話番号"]);
  });
});

describe("publishTargets", () => {
  it("掲載済みと対象外は送らない", () => {
    const states: ListingStates = {
      GOOGLE_MAPS: { status: "live", url: "", note: "", updatedAt: null },
      BING: { status: "skip", url: "", note: "", updatedAt: null },
    };
    const ids = publishTargets(states).map((m) => m.id);
    expect(ids).not.toContain("GOOGLE_MAPS");
    expect(ids).not.toContain("BING");
    expect(ids).toContain("YAHOO_PLACE");
    expect(ids).toHaveLength(CORE_MEDIA_IDS.length - 2);
  });

  // 利用者の指示 2026-09-19「手順が多くて顧客にやらせるには無理がある」。
  // 既定で 30 媒体を対象にすると、お客様の画面に 27 件の手作業が並ぶ
  it("既定はお客様に出す 7 媒体だけ", () => {
    expect(publishTargets({}).map((m) => m.id).sort()).toEqual([...CORE_MEDIA_IDS].sort());
  });

  it("tier: all で上級の媒体も含める", () => {
    expect(publishTargets({}, { tier: "all" })).toHaveLength(LISTING_MEDIA.length);
  });

  it("mediaIds を渡すとその中だけ（上級の媒体も名指しなら送る）", () => {
    expect(publishTargets({}, { mediaIds: ["YAHOO_PLACE", "BING"] }).map((m) => m.id)).toEqual(["BING", "YAHOO_PLACE"]);
    expect(publishTargets({}, { mediaIds: ["YELP"] }).map((m) => m.id)).toEqual(["YELP"]);
  });
});

describe("csv", () => {
  it("カンマと引用符を囲んでエスケープする", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe("a b");
    expect(csvCell(" a ")).toBe("a");
  });

  it("営業時間を 1 行にまとめる（定休日は落とす）", () => {
    expect(hoursOneLine(profile)).toBe("月 10:00-19:00");
  });

  it("Yahoo!プレイスの行に店名と住所が入る", () => {
    const csv = yahooPlaceCsv(profile);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"テスト商会, 新宿店"');
    expect(csv).toContain("東京都新宿区新宿1-1-1 テストビル 2F");
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("Bing の行は国を JP で出す", () => {
    const rows = bingPlacesCsv(profile).trimEnd().split("\r\n");
    expect(rows[0]).toContain("Business name");
    expect(rows[1]).toContain("JP");
  });
});

describe("buildFiles", () => {
  it("file の媒体ぶんだけ作る", () => {
    const files = buildFiles(profile, [...LISTING_MEDIA]);
    expect(files.map((f) => f.id).sort()).toEqual(["BING", "YAHOO_PLACE"]);
    expect(files.every((f) => f.content.length > 0)).toBe(true);
  });

  it("対象に入っていなければ作らない", () => {
    expect(buildFiles(profile, [mediaById("GOOGLE_MAPS")!])).toEqual([]);
  });
});

describe("resultForMedia", () => {
  it("api の媒体はサーバーが埋めるので作らない", () => {
    expect(resultForMedia(mediaById("GOOGLE_MAPS")!)).toBeNull();
  });

  it("file は入稿ファイルに紐づく", () => {
    const r = resultForMedia(mediaById("YAHOO_PLACE")!);
    expect(r?.outcome).toBe("file");
    expect(r?.fileId).toBe("YAHOO_PLACE");
  });

  it("manual は手順と登録画面を返す", () => {
    const r = resultForMedia(mediaById("APPLE_MAPS")!);
    expect(r?.outcome).toBe("manual");
    expect(r?.url).toBe("https://businessconnect.apple.com/");
  });

  it("monitor は元の媒体を案内する", () => {
    const r = resultForMedia(mediaById("SIRI")!);
    expect(r?.outcome).toBe("monitor");
    expect(r?.message).toContain("Apple");
  });
});

describe("statesAfterPublish", () => {
  const at = new Date("2026-09-19T00:00:00.000Z");
  const results: PublishResult[] = [
    { mediaId: "GOOGLE_MAPS", mediaName: "g", integration: "api", outcome: "sent", message: "" },
    { mediaId: "YAHOO_PLACE", mediaName: "y", integration: "file", outcome: "file", message: "" },
    { mediaId: "BING", mediaName: "b", integration: "file", outcome: "failed", message: "" },
  ];

  it("送れたものだけ申請中にする", () => {
    const next = statesAfterPublish({}, results, at);
    expect(next.GOOGLE_MAPS?.status).toBe("submitted");
    expect(next.GOOGLE_MAPS?.updatedAt).toBe(at.toISOString());
    expect(next.YAHOO_PLACE).toBeUndefined();
    expect(next.BING).toBeUndefined();
  });

  it("控えた URL とメモは消さない", () => {
    const before: ListingStates = { GOOGLE_MAPS: { status: "todo", url: "https://maps.example", note: "担当: 山田", updatedAt: null } };
    const next = statesAfterPublish(before, results, at);
    expect(next.GOOGLE_MAPS?.url).toBe("https://maps.example");
    expect(next.GOOGLE_MAPS?.note).toBe("担当: 山田");
  });
});

describe("summarizeResults", () => {
  it("結果を数える", () => {
    expect(summarizeResults([{ mediaId: "a", mediaName: "a", integration: "api", outcome: "sent", message: "" }])).toEqual({
      sent: 1, file: 0, manual: 0, monitor: 0, failed: 0,
    });
  });
});

describe("media の integration", () => {
  it("API で送れるのは Google だけ（増えたら publish のサーバー側も足す）", () => {
    expect(mediaOfIntegration("api").map((m) => m.id)).toEqual(["GOOGLE_MAPS"]);
  });

  it("入稿ファイルを作れるのは Yahoo!プレイスと Bing", () => {
    expect(mediaOfIntegration("file").map((m) => m.id).sort()).toEqual(["BING", "YAHOO_PLACE"]);
  });

  it("自動で流れる媒体と配信代行は monitor", () => {
    for (const m of LISTING_MEDIA) {
      if (m.kind === "fed" || m.kind === "aggregator") expect(m.integration).toBe("monitor");
    }
  });

  it("すべての媒体が integration を持つ", () => {
    expect(LISTING_MEDIA.every((m) => ["api", "file", "manual", "monitor"].includes(m.integration))).toBe(true);
  });

  // お客様に出す媒体に monitor（こちらから登録できない媒体）が混ざると、
  // 「できません」だけの行が並んで手順が増えたように見える
  it("お客様に出す媒体は自分で登録できるものだけ", () => {
    for (const m of mediaOfTier("core")) {
      expect(m.kind, m.id).toBe("self");
      expect(m.integration, m.id).not.toBe("monitor");
    }
  });
});
