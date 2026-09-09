"use client";

/**
 * GET /api/plan を取得して、いまの利用権限を返す。
 * useIntegrations と同じく、ページ内で 1 回だけ取りに行く。
 *
 * プランだけでなく、運用者が個別開放した機能 ID と管理者かどうかも受け取る。
 * サイドバーの鍵表示は「プランで足りる または 個別開放されている」で決まるため。
 */
import { useEffect, useState } from "react";
import { PLAN_RANK, toPlanId, type PlanId } from "@/lib/plans/catalog";

export interface Access {
  plan: PlanId;
  /** プランとは別に開放されている機能 ID */
  overrides: string[];
  /** マスター画面を出してよいか */
  admin: boolean;
}

let cache: Access | null = null;
let inflight: Promise<Access> | null = null;

export async function fetchAccess(force = false): Promise<Access> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = fetch("/api/plan", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as { plan?: unknown; features?: unknown; admin?: unknown };
        return {
          plan: toPlanId(body.plan) ?? "free",
          overrides: Array.isArray(body.features)
            ? body.features.filter((f): f is string => typeof f === "string")
            : [],
          admin: body.admin === true,
        } satisfies Access;
      })
      .then((access) => {
        cache = access;
        return access;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** 取得前と取得失敗時は null（鍵を出さない = 誤って使えないように見せない） */
export function useAccess(): Access | null {
  const [access, setAccess] = useState<Access | null>(cache);

  useEffect(() => {
    let alive = true;
    fetchAccess()
      .then((a) => {
        if (alive) setAccess(a);
      })
      .catch(() => {
        if (alive) setAccess(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return access;
}

/** 機能が使えるか。取得前は「使える」に倒す（鍵を出さない） */
export function canUseFeature(access: Access | null, featureId: string, required: PlanId): boolean {
  if (!access) return true;
  if (access.overrides.includes(featureId)) return true;
  return PLAN_RANK[access.plan] >= PLAN_RANK[required];
}
