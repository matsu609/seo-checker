/**
 * Google マップ（ビジネス プロフィールの公開情報）の NAP を確かめる（サーバー専用）。
 *
 * 1. MEO に登録した自社店舗の保存済み報告書に、入力と同じ店があればそれを使う（API を呼ばない）
 * 2. 無ければ Places API で「店名 + 住所」を検索し、最上位の候補の詳細を取る
 *    （詳細は Enterprise + Atmosphere 区分。1 回の確認で 1 店舗ぶんだけ）
 *
 * API キーが無ければ null を返し、呼び出し側が notes に書く。
 */
import { getPlace, isPlacesConfigured, PlacesError, searchPlaces } from "@/lib/maps/client";
import { latestReports } from "@/lib/maps/history";
import { listStores } from "@/lib/maps/stores";
import type { PlaceDetail } from "@/lib/maps/types";
import { compareAddress, compareName, comparePhone, compareWebsite, normalizeName, phoneDigits, stripCorporate } from "./compare";
import type { FieldCheck, NapInput, NapSource } from "./types";

export interface GoogleLookup {
  /** 保存済みの報告書（自社店舗）から。無ければ null */
  saved: (userId: string) => Promise<Pick<PlaceDetail, "id" | "name" | "address" | "phone" | "website" | "mapsUrl">[]>;
  search: (query: string) => Promise<{ id: string; name: string; address: string | null }[]>;
  detail: (placeId: string) => Promise<Pick<PlaceDetail, "id" | "name" | "address" | "phone" | "website" | "mapsUrl">>;
  configured: () => boolean;
}

export const defaultGoogleLookup: GoogleLookup = {
  saved: async (userId) => {
    const own = (await listStores(userId)).filter((s) => s.role === "own");
    if (own.length === 0) return [];
    const reports = await latestReports(userId, own.map((s) => s.placeId));
    return [...reports.values()].map((e) => e.report.detail);
  },
  // 使うのは id・名前・住所だけなので、評価・件数を取らない安い区分で探す（Enterprise → Pro。2026-09-23）
  search: async (query) => (await searchPlaces(query, 3, { fields: "basic" })).map((p) => ({ id: p.id, name: p.name, address: p.address })),
  detail: (placeId) => getPlace(placeId),
  configured: isPlacesConfigured,
};

/** 入力の店名と同じ店か（法人格・空白の違いは無視。片方が他方を含めば同じとみなす） */
export function sameBusiness(inputName: string, candidateName: string): boolean {
  const a = normalizeName(inputName);
  const b = normalizeName(candidateName);
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = stripCorporate(inputName);
  const cb = stripCorporate(candidateName);
  return ca.length >= 2 && cb.length >= 2 && (ca.includes(cb) || cb.includes(ca));
}

export function checkGoogleDetail(input: NapInput, d: Pick<PlaceDetail, "id" | "name" | "address" | "phone" | "website" | "mapsUrl">): NapSource {
  const fields: FieldCheck[] = [
    compareName(input.name, d.name ? [d.name] : []),
    compareAddress(input.address, d.address ? [d.address] : []),
    comparePhone(input.phone, d.phone ? [phoneDigits(d.phone)] : []),
    compareWebsite(input.website, d.website ? [d.website] : []),
  ];
  return { kind: "google_maps", label: `Google マップ（${d.name}）`, url: d.mapsUrl ?? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(d.id)}`, fields, error: null };
}

export interface GoogleCheckResult {
  source: NapSource | null;
  /** 飛ばした・失敗した理由（notes に出す）。成功なら null */
  note: string | null;
}

export async function checkGoogleMaps(input: NapInput, userId: string, lookup: GoogleLookup = defaultGoogleLookup): Promise<GoogleCheckResult> {
  // 1. 保存済みの報告書
  try {
    const saved = await lookup.saved(userId);
    const hit = saved.find((d) => sameBusiness(input.name, d.name));
    if (hit) return { source: checkGoogleDetail(input, hit), note: null };
  } catch {
    // 報告書が読めなくても API で探せる
  }
  if (!lookup.configured()) {
    return { source: null, note: "Google マップは確認していません（GOOGLE_PLACES_API_KEY が未設定）。MEO の登録店舗に診断済みの店舗があれば、その保存内容で確認します" };
  }
  // 2. Places API
  const query = [input.name, input.address].filter((s) => s.trim()).join(" ");
  try {
    const candidates = await lookup.search(query);
    const best = candidates.find((c) => sameBusiness(input.name, c.name)) ?? null;
    if (!best) {
      const seen = candidates.length > 0 ? `（見つかったのは: ${candidates.map((c) => c.name).slice(0, 3).join(" / ")}）` : "";
      return {
        source: { kind: "google_maps", label: "Google マップ", url: null, fields: [], error: `入力した店名の店舗が Google マップで見つかりませんでした${seen}` },
        note: null,
      };
    }
    const detail = await lookup.detail(best.id);
    return { source: checkGoogleDetail(input, detail), note: null };
  } catch (err) {
    const message = err instanceof PlacesError ? err.message : "Google マップの確認中にエラーが発生しました";
    return { source: { kind: "google_maps", label: "Google マップ", url: null, fields: [], error: message }, note: null };
  }
}
