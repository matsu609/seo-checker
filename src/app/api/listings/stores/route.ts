/**
 * GET /api/listings/stores … 基本情報掲載の対象店舗（MEO の自社店舗）と、保存済みの基本情報・掲載状況。
 *
 * 応答: { stores: [{ placeId, name, google, record }], anthropic }
 *   google … 保存済みの MEO 報告書から取った Google マップの公開情報（無ければ null）。取り込みと表記ゆれの比較に使う
 *   record … 保存済みの基本情報と掲載状況（無ければ null）
 */
import { dbErrorResponse } from "@/lib/db/supabase";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { NO_STORE, requireListingsUser } from "@/lib/listings/api";
import { listListings, type ListingRecord } from "@/lib/listings/store";
import { latestReports } from "@/lib/maps/history";
import { listStores } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface ListingsGoogleInfo {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string[];
  category: string | null;
  /** 口コミ本文の抜粋（AI の説明文の参考。最大 5 件） */
  reviews: string[];
  mapsUrl: string | null;
  generatedAt: string;
}

export interface ListingsStoreItem {
  placeId: string;
  name: string;
  google: ListingsGoogleInfo | null;
  record: ListingRecord | null;
}

export interface ListingsStoresResponse {
  stores: ListingsStoreItem[];
  anthropic: boolean;
}

export async function GET() {
  const userId = await requireListingsUser();
  if (userId instanceof Response) return userId;
  try {
    const own = (await listStores(userId)).filter((s) => s.role === "own");
    let records = new Map<string, ListingRecord>();
    try {
      records = new Map((await listListings(userId)).map((r) => [r.placeId, r]));
    } catch (err) {
      // テーブルが無い（SQL 未実行）: 保存はできないが、一覧と登録案内は出す
      console.error("[listings] 基本情報の読み込みに失敗（listing_profiles の SQL が未実行の可能性）", err);
    }
    let reports = new Map<string, Awaited<ReturnType<typeof latestReports>> extends Map<string, infer V> ? V : never>();
    try {
      reports = await latestReports(userId, own.map((s) => s.placeId));
    } catch {
      // 報告書が無くても使える（Google からの取り込みだけできない）
    }
    const stores: ListingsStoreItem[] = own.map((s) => {
      const entry = reports.get(s.placeId);
      const d = entry?.report.detail;
      return {
        placeId: s.placeId,
        name: s.name,
        google: d
          ? {
              name: d.name,
              address: d.address,
              phone: d.phone,
              website: d.website,
              hours: d.hours,
              category: d.category,
              reviews: d.reviews.map((r) => r.text).filter((t) => t.trim()).slice(0, 5),
              mapsUrl: d.mapsUrl,
              generatedAt: entry.report.generatedAt,
            }
          : null,
        record: records.get(s.placeId) ?? null,
      };
    });
    const body: ListingsStoresResponse = { stores, anthropic: isAnthropicEnabled() };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
