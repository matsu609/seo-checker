/**
 * 収集口（POST /api/t）の入力を検証して、保存する行に変える。純粋関数（I/O なし）。
 * 訪問者 ID の計算は visitor.ts、流入元の分類は channel.ts。
 */
import { z } from "zod";
import { deviceOf } from "./bot";
import { classify, hostOf } from "./channel";
import type { NewEvent } from "./store";
import { visitorId } from "./visitor";

/** 1 回の送信で受け付ける件数の上限（タグは 1 件ずつ送る。まとめ送りへの備え） */
export const MAX_EVENTS = 20;
const PATH_MAX = 512;
const SHORT_MAX = 200;

const short = z.string().max(SHORT_MAX).optional();

const EventSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("pageview"),
    p: z.string().max(PATH_MAX),
    r: z.string().max(2048).optional(),
    h: short,
    u: z.object({ utm_source: short, utm_medium: short, utm_campaign: short }).partial().optional(),
  }),
  z.object({ t: z.literal("leave"), p: z.string().max(PATH_MAX), s: z.number().min(0).max(86_400).optional(), sc: z.number().min(0).max(100).optional() }),
  z.object({ t: z.literal("click"), p: z.string().max(PATH_MAX), k: z.enum(["tel", "mail", "external"]), x: short }),
  z.object({ t: z.literal("form"), p: z.string().max(PATH_MAX) }),
]);

export const CollectBodySchema = z.object({
  site: z.string().min(8).max(64),
  events: z.array(EventSchema).min(1).max(MAX_EVENTS),
});

export type CollectBody = z.infer<typeof CollectBodySchema>;

/** パスだけにする（クエリとハッシュは落とす。個人情報がクエリに載っていても保存しない） */
export function cleanPath(input: string): string {
  const raw = input.split(/[?#]/)[0] ?? "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path.slice(0, PATH_MAX);
}

export interface CollectContext {
  day: string;
  ip: string;
  userAgent: string;
}

export function toRows(body: CollectBody, ctx: CollectContext): NewEvent[] {
  const visitor = visitorId(ctx.day, body.site, ctx.ip, ctx.userAgent);
  const device = deviceOf(ctx.userAgent);
  const base = { site_key: body.site, day: ctx.day, visitor, device, referrer_host: "", channel: "direct" as const, source: "", utm_source: "", utm_medium: "", utm_campaign: "", kind: "", seconds: 0, scroll: 0 };
  return body.events.map((e): NewEvent => {
    const path = cleanPath(e.p);
    switch (e.t) {
      case "pageview": {
        const referrerHost = hostOf(e.r ?? "");
        const utm = { source: e.u?.utm_source ?? "", medium: e.u?.utm_medium ?? "" };
        const c = classify(referrerHost, e.h ?? "", utm);
        return {
          ...base,
          type: "pageview",
          path,
          referrer_host: c.channel === "internal" ? "" : referrerHost,
          channel: c.channel,
          source: c.source,
          utm_source: (e.u?.utm_source ?? "").slice(0, SHORT_MAX),
          utm_medium: (e.u?.utm_medium ?? "").slice(0, SHORT_MAX),
          utm_campaign: (e.u?.utm_campaign ?? "").slice(0, SHORT_MAX),
        };
      }
      case "leave":
        return { ...base, type: "leave", path, seconds: Math.round(e.s ?? 0), scroll: Math.round(e.sc ?? 0) };
      case "click":
        return { ...base, type: "click", path, kind: e.k, source: e.k === "external" ? hostOf(e.x ?? "") : "" };
      case "form":
        return { ...base, type: "form", path, kind: "form" };
    }
  });
}
