/**
 * POST /api/listings/publish … 掲載（サイテーション）の一括登録。
 *
 * 保存済みの基本情報を、媒体の `integration`（src/lib/listings/media.ts）ごとに:
 *   api     … Google ビジネス プロフィールへ送る（ログイン中のお客様が接続した Google の権限で）
 *   file    … 入稿データ（CSV）を作って返す
 *   manual  … 登録画面の URL と手順を返す
 *   monitor … 元の媒体に載せて反映を待つ、と返す
 *
 * ブラウザ自動化による代理入力はしない（各媒体の規約違反）。送れなかったものは理由をそのまま返す。
 *
 * 本文: { placeId, mediaIds? }
 * 応答: { results, files, record }
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { GoogleLinkError } from "@/lib/google/errors";
import { findLocationByPlaceId, updateLocationNap } from "@/lib/google/business-profile";
import { badRequest, NO_STORE, PLACE_ID, readJson, requireListingsUser } from "@/lib/listings/api";
import { mediaById } from "@/lib/listings/media";
import { parseHoursText } from "@/lib/listings/profile";
import {
  buildFiles,
  missingRequired,
  publishTargets,
  resultForMedia,
  statesAfterPublish,
  type PublishFile,
  type PublishResult,
} from "@/lib/listings/publish";
import { getListing, putListing, type ListingRecord } from "@/lib/listings/store";
import { listStores } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません"),
  /** 省略時は「対象外」「掲載済み」以外のすべて */
  mediaIds: z.array(z.string().max(64)).max(60).optional(),
});

export interface ListingsPublishResponse {
  results: PublishResult[];
  files: PublishFile[];
  record: ListingRecord;
}

/** Google へ送った結果（例外は投げず、画面に出せる 1 文にする） */
async function sendToGoogle(placeId: string, record: ListingRecord): Promise<PublishResult> {
  const media = mediaById("GOOGLE_MAPS")!;
  const base = { mediaId: media.id, mediaName: media.name, integration: media.integration, url: media.url } as const;
  try {
    const location = await findLocationByPlaceId(placeId);
    if (!location) {
      return {
        ...base,
        outcome: "failed",
        message: "接続した Google アカウントの中に、この店舗のビジネス プロフィールが見つかりませんでした。その店舗の管理者アカウントで接続し直してください。",
      };
    }
    // 読めない行が 1 つでもあれば営業時間は送らない（丸ごと置き換えなので、読めなかった曜日が「休業」になる）
    const parsedHours = parseHoursText(record.profile.hours);
    const hoursReadable = parsedHours.unreadable.length === 0;
    const hours = hoursReadable ? parsedHours.specs.map((h) => ({ dayOfWeek: h.dayOfWeek, opens: h.opens, closes: h.closes })) : [];
    const sent = await updateLocationNap(location.name, {
      title: record.profile.name,
      phone: record.profile.phone,
      website: record.profile.website,
      description: record.profile.longDescription || record.profile.shortDescription,
      hours,
    });
    if (!sent) return { ...base, outcome: "failed", message: "送る内容がありませんでした（店名・電話・サイト・説明文・営業時間がすべて空です）。" };
    return {
      ...base,
      outcome: "sent",
      message: hoursReadable
        ? "店名・電話・サイト・説明文・営業時間を送りました。住所は送っていません（書き換えると再審査になるため、ビジネス プロフィールで直してください）。反映まで数分〜数日かかります。"
        : `店名・電話・サイト・説明文を送りました。営業時間は読み取れない行（「${parsedHours.unreadable[0]}」）があったため送っていません（一部の曜日が休業になるのを防ぐため）。住所も送っていません。反映まで数分〜数日かかります。`,
    };
  } catch (err) {
    if (err instanceof GoogleLinkError) return { ...base, outcome: "failed", message: err.message };
    console.error("[listings/publish] Google への送信に失敗", err);
    return { ...base, outcome: "failed", message: "Google への送信に失敗しました。時間をおいて再度お試しください。" };
  }
}

export async function POST(request: Request) {
  const userId = await requireListingsUser();
  if (userId instanceof Response) return userId;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const { placeId, mediaIds } = parsed.data;

  try {
    const own = (await listStores(userId)).some((s) => s.role === "own" && s.placeId === placeId);
    if (!own) return Response.json({ error: "その店舗は MEO の自社店舗に登録されていません" }, { status: 404 });
    const record = await getListing(userId, placeId);
    if (!record) return badRequest("先に基本情報を保存してください");
    const missing = missingRequired(record.profile);
    if (missing.length > 0) return badRequest(`${missing.join("・")}を入力して保存してから実行してください`);

    const targets = publishTargets(record.states, mediaIds);
    if (targets.length === 0) return badRequest("送る先がありません（すべて掲載済み、または対象外です）");

    const results: PublishResult[] = [];
    for (const m of targets) {
      if (m.integration === "api") {
        // API があるのは Google だけ。増えたらここに足す
        results.push(m.id === "GOOGLE_MAPS" ? await sendToGoogle(placeId, record) : { mediaId: m.id, mediaName: m.name, integration: m.integration, outcome: "manual", message: m.howTo, url: m.url });
        continue;
      }
      const r = resultForMedia(m);
      if (r) results.push(r);
    }
    const files = buildFiles(record.profile, targets);
    const states = statesAfterPublish(record.states, results, new Date());
    const saved = results.some((r) => r.outcome === "sent") ? await putListing(userId, placeId, record.profile, states) : record;

    const body: ListingsPublishResponse = { results, files, record: saved };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
