"use client";

/**
 * 基本情報（店名・電話・住所・サイト）の入力と、MEO の登録店舗からの取り込み。
 * `BasicInfoNotice` と組にして使う（`StorePicker` は その storePicker に渡す）。
 *
 * - 初期値は設定の「会社・店舗の基本情報」（登録時のデータ）。触ったらこの回だけの上書き（edits）を使う
 * - サイトは触るまで設定のホームページ（`useRegisteredSite`）
 * - 「別の店舗で調べる」で、基本情報掲載の保存内容 → Google マップの公開情報 の順に取り込む
 *
 * 2026-09-23 まで、サイテーション（CitationsTool）と NAP チェック（NapTool）に同じ実装があった。
 */
import { useEffect, useState } from "react";
import type { ListingsStoreItem, ListingsStoresResponse } from "@/app/api/listings/stores/route";
import { Field, Select } from "@/components/ui";
import { useSharedSettings } from "@/lib/settings/client";
import type { BasicInfo } from "./BasicInfoNotice";
import { useRegisteredSite } from "./RegisteredSite";

/** 登録店舗 → 基本情報（保存した掲載内容を優先し、無ければ Google マップの公開情報） */
export function formFromStore(item: ListingsStoreItem, fallbackWebsite: string): BasicInfo {
  const p = item.record?.profile;
  const g = item.google;
  return {
    name: p?.name || g?.name || item.name,
    phone: p?.phone || g?.phone || "",
    address: p?.address || g?.address || "",
    website: p?.website || g?.website || fallbackWebsite,
  };
}

function fetchStores(): Promise<ListingsStoresResponse | null> {
  return fetch("/api/listings/stores", { cache: "no-store" })
    .then(async (res) => (res.ok ? ((await res.json()) as ListingsStoresResponse) : null))
    .catch(() => null);
}

export function useStoreProfileForm() {
  const site = useRegisteredSite();
  const shared = useSharedSettings();
  const [edits, setEdits] = useState<BasicInfo | null>(null);
  const form: BasicInfo = edits ?? {
    name: shared.lead?.company ?? "",
    phone: shared.lead?.phone ?? "",
    address: shared.lead?.address ?? "",
    website: "",
  };
  const [websiteTouched, setWebsiteTouched] = useState(false);
  const [stores, setStores] = useState<ListingsStoreItem[]>([]);
  const [storeId, setStoreId] = useState("");

  // MEO の登録店舗（基本情報掲載の保存内容・Google マップの公開情報）。取れなくても画面は動く
  useEffect(() => {
    let alive = true;
    void fetchStores().then((d) => alive && d && setStores(d.stores));
    return () => {
      alive = false;
    };
  }, []);

  const website = websiteTouched || form.website.trim() ? form.website : site.siteUrl;

  function applyStore(placeId: string) {
    setStoreId(placeId);
    const item = stores.find((s) => s.placeId === placeId);
    if (!item) return;
    setEdits(formFromStore(item, site.siteUrl));
    setWebsiteTouched(true);
  }

  /** BasicInfoNotice の onChange */
  function edit(next: BasicInfo) {
    setWebsiteTouched(true);
    setEdits(next);
  }

  /** BasicInfoNotice の onReset（設定の基本情報に戻す） */
  function reset() {
    setEdits(null);
    setWebsiteTouched(false);
    setStoreId("");
  }

  return {
    form,
    /** 調べるサイト（触っていなければ設定のホームページ） */
    website,
    /** この回だけ上書き中か */
    overridden: edits !== null,
    stores,
    storeId,
    applyStore,
    edit,
    reset,
  };
}

/** 「別の店舗で調べる」の選択欄。登録店舗が無ければ出さない（BasicInfoNotice の storePicker に渡す） */
export function StorePicker({
  stores,
  storeId,
  onSelect,
  disabled,
}: {
  stores: readonly ListingsStoreItem[];
  storeId: string;
  onSelect: (placeId: string) => void;
  disabled: boolean;
}) {
  if (stores.length === 0) return null;
  return (
    <Field label="別の店舗で調べる" className="min-w-[14rem]">
      <Select value={storeId} onChange={(e) => onSelect(e.target.value)} disabled={disabled}>
        <option value="">設定の基本情報</option>
        {stores.map((st) => (
          <option key={st.placeId} value={st.placeId}>
            {st.record?.profile.name || st.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
