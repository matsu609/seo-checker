/**
 * GET /api/houjin?name=…[&address=…] … 会社名で法人番号を探す（ログイン必須）
 * GET /api/houjin?number=1234567890123 … 法人番号で 1 件
 *
 * 返すのは公表情報（商号・本店所在地・法人番号）と、掲載の基本情報との突き合わせ。
 * 法人番号システム Web-API は無料だが、アプリケーション ID（HOUJIN_BANGOU_APP_ID）が要る。
 * 未設定なら enabled: false を返して画面が案内を出す（エラーにはしない）。
 */
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { fetchByNumber, isHoujinEnabled, searchByName, type HoujinFailure } from "@/lib/houjin/client";
import { SEARCH_ADDRESS_MAX, SEARCH_NAME_MAX, SEARCH_NAME_MIN, publicRegistryUrls } from "@/lib/houjin/constants";
import type { Corporation } from "@/lib/houjin/parse";

export const runtime = "nodejs";
export const maxDuration = 30;

const QuerySchema = z
  .object({
    name: z.string().trim().max(SEARCH_NAME_MAX).default(""),
    address: z.string().trim().max(SEARCH_ADDRESS_MAX).default(""),
    number: z.string().trim().max(20).default(""),
  })
  .refine((v) => v.number.length > 0 || v.name.length >= SEARCH_NAME_MIN, {
    message: `会社名は ${SEARCH_NAME_MIN} 文字以上で入力してください`,
  });

export interface HoujinCandidate extends Corporation {
  /** sameAs に入れる公的な URL（法人番号公表サイト・gBizINFO） */
  registryUrls: { label: string; url: string }[];
}

export interface HoujinSearchResponse {
  /** アプリケーション ID が設定されているか */
  enabled: boolean;
  candidates: HoujinCandidate[];
  total: number | null;
  failure: HoujinFailure | null;
  message: string | null;
}

export async function GET(request: Request) {
  const userId = await requireUser({ feature: "listings" });
  if (userId instanceof Response) return userId;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    name: url.searchParams.get("name") ?? "",
    address: url.searchParams.get("address") ?? "",
    number: url.searchParams.get("number") ?? "",
  });
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  const q = parsed.data;

  const outcome = q.number ? await fetchByNumber(q.number, { signal: request.signal }) : await searchByName(q.name, q.address, { signal: request.signal });
  const body: HoujinSearchResponse = {
    enabled: isHoujinEnabled(),
    candidates: outcome.corporations.map((c) => ({ ...c, registryUrls: publicRegistryUrls(c.corporateNumber) })),
    total: outcome.total,
    failure: outcome.failure,
    message: outcome.message,
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
