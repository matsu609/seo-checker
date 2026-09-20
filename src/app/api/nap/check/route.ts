/**
 * POST /api/nap/check — 店名・住所・電話番号・サイト URL の 4 つを、各媒体に書かれている値と突き合わせる。
 *
 * 本文: { name, address?, phone?, website? }
 * 応答: NapCheckResult（src/lib/nap/types.ts）
 *
 * 見る媒体（取れないものは error か notes に理由を残し、診断全体は止めない）:
 *   1. 自社サイト（トップ + 会社概要・お問い合わせなど最大 4 ページ。構造化データ JSON-LD も）
 *   2. Google マップ（MEO の保存済み報告書 → 無ければ Places API で検索 + 詳細 1 回）
 *   3. 「掲載」タブで控えた掲載ページの URL
 *   4. ウェブ検索（DataForSEO 2 回）で見つかった媒体のページ（最大 6 件）
 *
 * 外部サイトを最大 15 ページほど開くので、同じ利用者は 1 分に 1 回まで。80 秒で打ち切る。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { NO_STORE } from "@/lib/api/headers";
import { readJson } from "@/lib/api/request";
import { requireUser } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { ADDRESS_MAX, NAME_MAX, PHONE_MAX, URL_MAX } from "@/lib/listings/profile";
import { checkGoogleMaps } from "@/lib/nap/google";
import { checkListingPages, checkWebPages, listListingPages } from "@/lib/nap/media";
import { buildNapResult } from "@/lib/nap/report";
import { checkOwnSite } from "@/lib/nap/site";
import type { NapInput, NapSource } from "@/lib/nap/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const FEATURE_ID = "nap";
const COOLDOWN_MS = 60_000;
const BUDGET_MS = 80_000;
const cooldown = globalCache<number>("nap-cooldown", COOLDOWN_MS, 1000);

const BodySchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  address: z.string().trim().max(ADDRESS_MAX).default(""),
  phone: z.string().trim().max(PHONE_MAX).default(""),
  website: z.string().trim().max(URL_MAX).default(""),
});

export async function POST(request: NextRequest) {
  const userId = await requireUser({ feature: FEATURE_ID });
  if (userId instanceof Response) return userId;

  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "店名を入力してください" }, { status: 422 });
  const input: NapInput = parsed.data;
  if (!input.website && !input.address && !input.phone) {
    return Response.json({ error: "店名のほかに、サイト URL・住所・電話番号のいずれかを入力してください" }, { status: 422 });
  }

  const last = cooldown.get(userId);
  if (last && Date.now() - last < COOLDOWN_MS) {
    return Response.json({ error: "確認は 1 分に 1 回までです。少し待ってからもう一度お試しください" }, { status: 429, headers: NO_STORE });
  }
  cooldown.set(userId, Date.now());

  const deadline = Date.now() + BUDGET_MS;
  const notes: string[] = [];

  // 掲載ページの URL は先に読む（ウェブ検索で同じページを二重に開かないため）
  let listingPages: Awaited<ReturnType<typeof listListingPages>> = [];
  try {
    listingPages = await listListingPages(userId);
  } catch {
    notes.push("「掲載」タブで控えた掲載ページの URL は読めませんでした（Supabase が未設定か、テーブルが無い）");
  }
  const exclude = new Set(listingPages.map((p) => p.url));

  const [site, google, listing, web] = await Promise.all([
    input.website ? checkOwnSite(input, undefined, deadline) : Promise.resolve({ sources: [] as NapSource[], hasJsonLd: false, pagesChecked: 0 }),
    checkGoogleMaps(input, userId),
    checkListingPages(input, listingPages, undefined, deadline),
    checkWebPages(input, exclude, { deadline, signal: request.signal }),
  ]);

  if (!input.website) notes.push("サイト URL が空のため、自社サイト（構造化データ・フッター・会社概要・お問い合わせ）は確認していません");
  if (google.note) notes.push(google.note);
  if (listingPages.length === 0) notes.push("「掲載」タブで控えた掲載ページの URL はありません（掲載済みの媒体に URL を控えると、ここで毎回確認します）");
  if (web.note) notes.push(web.note);

  const sources: NapSource[] = [...site.sources, ...(google.source ? [google.source] : []), ...listing, ...web.sources];
  const result = buildNapResult(input, sources, { notes });
  return Response.json(result, { headers: NO_STORE });
}
