/**
 * 配信先の一覧: 配信代行の画面にあった 26 媒体をすべて含み、種類（自分で登録 / 自動で反映 / 配信代行のみ）と URL が揃っている。
 */
import { describe, expect, it } from "vitest";
import { AGGREGATOR_SCREEN_CODES, LISTING_MEDIA, MEDIA_KIND_LABELS, mediaById, mediaOfKind, sortedMedia } from "../media";

describe("配信先の一覧", () => {
  it("id は一意で、URL は https、fed は元の媒体が存在する", () => {
    const ids = LISTING_MEDIA.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of LISTING_MEDIA) {
      expect(m.url, m.id).toMatch(/^https:\/\//);
      expect(m.howTo.length, m.id).toBeGreaterThan(10);
      expect(MEDIA_KIND_LABELS[m.kind]).toBeTruthy();
      if (m.kind === "fed") {
        expect(m.fedBy?.length, m.id).toBeGreaterThan(0);
        for (const src of m.fedBy ?? []) expect(mediaById(src)?.kind, `${m.id} ← ${src}`).toBe("self");
      }
    }
  });

  it("配信代行の画面の 26 媒体をすべて含む", () => {
    expect(AGGREGATOR_SCREEN_CODES).toHaveLength(26);
    for (const code of AGGREGATOR_SCREEN_CODES) expect(mediaById(code), code).not.toBeNull();
  });

  it("日本の店舗に必須の 4 つは自分で無料登録できる", () => {
    for (const id of ["GOOGLE_MAPS", "APPLE_MAPS", "BING", "YAHOO_PLACE"]) {
      const m = mediaById(id)!;
      expect(m.kind).toBe("self");
      expect(m.priority).toBe(3);
    }
    expect(mediaById("ACOMPIO")?.kind).toBe("aggregator");
    expect(mediaById("SIRI")?.fedBy).toEqual(["APPLE_MAPS"]);
  });

  it("並びは 自分で登録 → 自動 → 配信代行、その中で重要度の高い順", () => {
    const sorted = sortedMedia();
    expect(sorted[0]!.kind).toBe("self");
    expect(sorted[sorted.length - 1]!.kind).toBe("aggregator");
    const self = mediaOfKind("self");
    expect(self[0]!.priority).toBe(3);
    expect(self.every((m) => m.kind === "self")).toBe(true);
  });
});
