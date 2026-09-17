/**
 * アクセス解析の保存（Supabase の tracking_sites / tracking_events）。サーバー専用。
 *
 * - tracking_sites: 利用者 1 人につき 1 行。key はタグに埋め込む公開 ID（推測できない乱数）
 * - tracking_events: タグから届いたイベント。行は必ず site_key で絞る
 * テーブル定義は docs/dev/OPERATIONS.md の SQL（r89）を参照。
 *
 * PostgREST は 1 回の応答を 1,000 行で切るので、期間の読み出しは offset で繰り返す。
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { globalCache } from "@/lib/cache";
import { DbError, supabaseRest } from "@/lib/db/supabase";
import type { TrackingRow } from "./types";

const SITES = "tracking_sites";
const EVENTS = "tracking_events";
const PAGE = 1000;
/** 1 回の集計で読む上限。店舗サイトの 90 日分なら数千行で足りる */
export const MAX_ROWS = 60_000;
/** 生ログの保持日数。集計はこの範囲でしか出さない */
export const RETENTION_DAYS = 400;

const SiteRowSchema = z.object({ key: z.string().min(1), user_id: z.string().min(1) });

const EventRowSchema = z.object({
  day: z.string(),
  ts: z.string(),
  visitor: z.string(),
  type: z.enum(["pageview", "leave", "click", "form"]),
  path: z.string(),
  referrer_host: z.string(),
  channel: z.enum(["search", "ai", "social", "ad", "referral", "direct", "internal"]),
  source: z.string(),
  utm_source: z.string(),
  utm_medium: z.string(),
  utm_campaign: z.string(),
  device: z.string(),
  kind: z.string(),
  seconds: z.number(),
  scroll: z.number(),
});

const EVENT_COLUMNS = "day,ts,visitor,type,path,referrer_host,channel,source,utm_source,utm_medium,utm_campaign,device,kind,seconds,scroll";

function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/** 公開 ID。20 文字の base64url（120 bit） */
export function newSiteKey(): string {
  return randomBytes(15).toString("base64url");
}

/** 利用者のサイト行を返す。無ければ作る */
export async function ensureSite(userId: string): Promise<{ key: string }> {
  const found = z.array(SiteRowSchema).safeParse(await supabaseRest<unknown>(`${SITES}?select=key,user_id&user_id=${eq(userId)}&limit=1`));
  if (found.success && found.data[0]) return { key: found.data[0].key };
  const key = newSiteKey();
  try {
    await supabaseRest(`${SITES}`, { method: "POST", body: { key, user_id: userId }, prefer: "return=minimal" });
    return { key };
  } catch (err) {
    // 同時に 2 回作られたとき（user_id は unique）はもう一度読む
    if (err instanceof DbError && err.status === 409) {
      const again = z.array(SiteRowSchema).safeParse(await supabaseRest<unknown>(`${SITES}?select=key,user_id&user_id=${eq(userId)}&limit=1`));
      if (again.success && again.data[0]) return { key: again.data[0].key };
    }
    throw err;
  }
}

const siteCache = globalCache<boolean>("trackingSite", 10 * 60 * 1000, 2000);

/** タグの公開 ID が実在するか（収集口で毎回 DB を叩かないよう 10 分キャッシュ） */
export async function siteExists(key: string): Promise<boolean> {
  const cached = siteCache.get(key);
  if (cached !== undefined) return cached;
  const rows = z.array(SiteRowSchema).safeParse(await supabaseRest<unknown>(`${SITES}?select=key,user_id&key=${eq(key)}&limit=1`));
  const exists = rows.success && rows.data.length > 0;
  // 無いキーもキャッシュする（でたらめなキーで DB を叩かれ続けないように）
  siteCache.set(key, exists);
  return exists;
}

export type NewEvent = Omit<TrackingRow, "ts"> & { site_key: string };

export async function insertEvents(rows: readonly NewEvent[]): Promise<void> {
  if (rows.length === 0) return;
  await supabaseRest(EVENTS, { method: "POST", body: rows, prefer: "return=minimal" });
}

/** 期間（両端含む）の行。ts の昇順 */
export async function listEvents(siteKey: string, from: string, to: string): Promise<TrackingRow[]> {
  const out: TrackingRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const raw = await supabaseRest<unknown>(
      `${EVENTS}?select=${EVENT_COLUMNS}&site_key=${eq(siteKey)}&day=gte.${from}&day=lte.${to}&order=ts.asc&limit=${PAGE}&offset=${offset}`,
    );
    const parsed = z.array(EventRowSchema).safeParse(raw);
    if (!parsed.success) throw new DbError("upstream", "アクセス解析の応答を読めませんでした");
    out.push(...parsed.data);
    if (parsed.data.length < PAGE) break;
  }
  return out;
}

/** 最後にイベントが届いた時刻（タグが動いているかの確認用） */
export async function lastEventAt(siteKey: string): Promise<string | null> {
  const raw = await supabaseRest<unknown>(`${EVENTS}?select=ts&site_key=${eq(siteKey)}&order=ts.desc&limit=1`);
  const parsed = z.array(z.object({ ts: z.string() })).safeParse(raw);
  return parsed.success ? (parsed.data[0]?.ts ?? null) : null;
}

/** 保持期間より古い生ログを消す（報告書を開いたときに、そのサイトの分だけ） */
export async function deleteOlderThan(siteKey: string, day: string): Promise<void> {
  await supabaseRest(`${EVENTS}?site_key=${eq(siteKey)}&day=lt.${day}`, { method: "DELETE", prefer: "return=minimal" });
}
