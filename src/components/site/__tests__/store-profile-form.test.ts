import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ListingsStoreItem } from "@/app/api/listings/stores/route";
import { StorePicker, formFromStore } from "../useStoreProfileForm";

function store(over: { name?: string; google?: Partial<NonNullable<ListingsStoreItem["google"]>> | null; profile?: Record<string, string> | null }): ListingsStoreItem {
  return {
    placeId: "p1",
    name: over.name ?? "登録名",
    google: over.google === null || over.google === undefined ? null : ({ name: "", address: null, phone: null, website: null, ...over.google } as ListingsStoreItem["google"]),
    record: over.profile ? ({ profile: over.profile } as unknown as ListingsStoreItem["record"]) : null,
  };
}

describe("formFromStore", () => {
  it("保存した掲載内容を優先する", () => {
    const item = store({
      profile: { name: "掲載の店名", phone: "03-1111-1111", address: "掲載の住所", website: "https://a.example/" },
      google: { name: "Google の店名", phone: "03-2222-2222", address: "Google の住所", website: "https://b.example/" },
    });
    expect(formFromStore(item, "https://fallback.example/")).toEqual({
      name: "掲載の店名",
      phone: "03-1111-1111",
      address: "掲載の住所",
      website: "https://a.example/",
    });
  });

  it("掲載内容が空なら Google マップ、それも無ければ登録名・空欄・設定のホームページ", () => {
    expect(formFromStore(store({ google: { name: "Google の店名", phone: "03-2222-2222", address: null, website: null } }), "https://fallback.example/")).toEqual({
      name: "Google の店名",
      phone: "03-2222-2222",
      address: "",
      website: "https://fallback.example/",
    });
    expect(formFromStore(store({ google: null }), "")).toEqual({ name: "登録名", phone: "", address: "", website: "" });
  });
});

describe("StorePicker", () => {
  it("登録店舗が無ければ何も出さない", () => {
    expect(renderToStaticMarkup(createElement(StorePicker, { stores: [], storeId: "", onSelect: () => {}, disabled: false }))).toBe("");
  });

  it("先頭は「設定の基本情報」、店舗は掲載の店名（無ければ登録名）", () => {
    const html = renderToStaticMarkup(
      createElement(StorePicker, { stores: [store({ profile: { name: "掲載の店名" } }), { ...store({}), placeId: "p2" }], storeId: "", onSelect: () => {}, disabled: false }),
    );
    expect(html).toContain("別の店舗で調べる");
    expect(html).toContain("設定の基本情報");
    expect(html).toContain("掲載の店名");
    expect(html).toContain("登録名");
  });
});
