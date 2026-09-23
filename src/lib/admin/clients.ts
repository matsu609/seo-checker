/**
 * 顧客管理（/clients）に出す顧客一覧。サーバー専用。
 *
 * Clerk のユーザー一覧に、Stripe の契約情報（publicMetadata.stripe）と機能の個別開放を重ねる。
 * ここでもデータベースは持たない。
 *
 * 契約情報はユーザー一覧に載っている publicMetadata から読むので、人数ぶんの API 呼び出しは無い。
 * 2026-09-23 まで Clerk Billing の契約を 1 人ずつ引いていた（getUserBillingSubscription）が、
 * Clerk Billing は使っていない（ドルのみ）ので全員「契約なし」で返っていただけだった。外した。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { stripeStateFromMetadata } from "@/lib/billing/state";
import { defaultPlanFromEnv } from "@/lib/plans/current";
import { overridesFromMetadata, toggleOverride, OVERRIDES_KEY } from "@/lib/plans/overrides";
import { resolvePlanFromMetadata, type PlanSource } from "@/lib/plans/resolve";
import type { PlanId } from "@/lib/plans/catalog";
import { summarizeBilling, type BillingSummary } from "./billing";
import { adminEmails } from "./config";
import { displayName, isOperatorUser, primaryEmail } from "./identity";
import { isAgencyMetadata } from "./roles";

import { assignedPromoFromMetadata, assignedPromoPatch, patternById } from "@/lib/billing/promo";
import { leadFromMetadata, type LeadProfile } from "@/lib/free/lead";
import { freeRunLimit } from "@/lib/free/quota";
import { freeRunsFromMetadata } from "@/lib/free/quota-rules";

/** 1 回に読む人数。Clerk の上限は 500 */
export const PAGE_SIZE = 100;

/**
 * Clerk をなめる最大人数（PAGE_SIZE × 5）。
 *
 * Clerk の Backend API には publicMetadata で絞る条件が無いので、代理店の一覧と
 * 「その代理店の担当分」はこちらで読んでから絞る。数千人規模になったら
 * 担当の関係を Supabase に持たせて絞り込みを DB 側に移すこと（README に記載）。
 */
export const MAX_SCAN = PAGE_SIZE * 5;

/** Clerk のユーザーのうち、この画面で使う部分だけ（テストしやすくするため型を絞る） */
export interface ClerkUserLike {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  primaryEmailAddressId: string | null;
  /** verification は確認済みかどうかの判定（運用者を一覧から外す）に使う */
  emailAddresses: { id: string; emailAddress: string; verification?: { status?: string | null } | null }[];
  publicMetadata: unknown;
  /** 登録フォームが載せた登録情報（lead）。古い行には無い */
  unsafeMetadata?: unknown;
  /** 無料診断の回数（サーバーだけが書く）。古い行には無い */
  privateMetadata?: unknown;
  createdAt: number;
  lastActiveAt: number | null;
}

export interface ClientRow {
  userId: string;
  email: string;
  name: string;
  createdAt: number;
  lastActiveAt: number | null;
  plan: PlanId;
  planSource: PlanSource;
  billing: BillingSummary;
  /** プランとは別に開放している機能 ID */
  overrides: string[];
  /** 登録フォームの情報（担当者名・会社名・電話・店舗の種類）。無ければ null */
  lead: LeadProfile | null;
  /** 無料診断を使った回数 */
  freeRuns: number;
  /** 設定済みの割引（パターン名。スタンダードの申し込みに付く）。無ければ null */
  promo: string | null;
}

export interface ClientList {
  rows: ClientRow[];
  /** 無料診断の上限（回数の表示に使う） */
  freeRunLimit: number;
  totalCount: number;
  /** 表示しきれていない人数 */
  truncated: number;
}

/**
 * Clerk のユーザーを新しい順に読む。MAX_SCAN で必ず打ち切る。
 *
 * 代理店の一覧と担当分の絞り込みで使う。契約情報は引かないので、
 * この関数自体は人数ぶんの API 呼び出しにはならない。
 */
export async function listUsers(max = MAX_SCAN): Promise<{ users: ClerkUserLike[]; totalCount: number }> {
  const client = await clerkClient();
  const users: ClerkUserLike[] = [];
  let totalCount = 0;

  for (let offset = 0; offset < max; offset += PAGE_SIZE) {
    const page = await client.users.getUserList({
      limit: Math.min(PAGE_SIZE, max - offset),
      offset,
      orderBy: "-created_at",
    });
    totalCount = page.totalCount;
    users.push(...(page.data as ClerkUserLike[]));
    if (users.length >= totalCount || page.data.length === 0) break;
  }

  return { users, totalCount };
}

/**
 * ユーザーの一覧に契約情報を重ねて行にする（純粋。Clerk には問い合わせない）。
 * プランの決め方はログイン中の本人・定期処理と同じ resolvePlanFromMetadata（plans/resolve.ts）。
 */
export function buildClientRows(users: ClerkUserLike[], envDefault: PlanId | null = defaultPlanFromEnv()): ClientRow[] {
  return users.map((user) => {
    const billing = summarizeBilling(stripeStateFromMetadata(user.publicMetadata));
    const overrides = overridesFromMetadata(user.publicMetadata);
    const { plan, source } = resolvePlanFromMetadata(user.publicMetadata, envDefault);
    return {
      userId: user.id,
      email: primaryEmail(user) ?? "",
      name: displayName(user) || leadFromMetadata(user.publicMetadata, user.unsafeMetadata ?? null)?.contactName || "",
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt ?? null,
      plan,
      planSource: source,
      billing,
      overrides,
      lead: leadFromMetadata(user.publicMetadata, user.unsafeMetadata ?? null),
      freeRuns: freeRunsFromMetadata(user.privateMetadata ?? null),
      promo: assignedPromoFromMetadata(user.publicMetadata)?.pattern ?? null,
    };
  });
}

export async function loadClients(limit = PAGE_SIZE): Promise<ClientList> {
  const client = await clerkClient();
  const { data: users, totalCount } = await client.users.getUserList({
    limit,
    orderBy: "-created_at",
  });

  // 運用者（マスター）と管理アカウントは顧客ではない（お金を払って使う人ではなく、対応する側）。
  // 一覧に混ぜると契約状況が空の行が並んで紛らわしいので外す（利用者の指示 2026-09-21）。
  // 運用者の判定は確認済みのメールだけ（2026-09-23 まで未確認のメールも数えていたので、
  // 運用者のアドレスを未確認のまま足したお客様が一覧から消えていた）
  const all = users as ClerkUserLike[];
  const admins = adminEmails();
  const customers = all.filter((u) => !isAgencyMetadata(u.publicMetadata) && !isOperatorUser(u, admins));
  const rows = buildClientRows(customers);
  // 総数からも外す。全体をなめていない（limit で切っている）ので、外した分だけ引く
  const total = Math.max(0, totalCount - (all.length - customers.length));

  return { rows, freeRunLimit: freeRunLimit(), totalCount: total, truncated: Math.max(0, total - rows.length) };
}

/**
 * 機能の個別開放を 1 件切り替えて、保存後の一覧を返す。
 * 呼び出し側で requireClientAccess を必ず通すこと。
 *
 * Clerk の updateUserMetadata は深いマージなので、変える featureOverrides だけを送る（配列は丸ごと置き換わる）。
 * 2026-09-23 まで publicMetadata を丸ごと送っていて、読んでから書くまでの間に入った Stripe の Webhook の
 * 書き込み（契約状態）を古い値で巻き戻すおそれがあった。
 */
export async function toggleClientFeature(
  userId: string,
  featureId: string,
  enabled: boolean,
): Promise<string[]> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const next = toggleOverride(overridesFromMetadata(user.publicMetadata), featureId, enabled);
  await client.users.updateUserMetadata(userId, { publicMetadata: { [OVERRIDES_KEY]: next } });
  return next;
}

/**
 * 顧客の割引を設定・解除する（null で解除）。保存後のパターン名を返す。
 * 呼び出し側で requireClientAccess を必ず通すこと。変える promo のキーだけを送る（深いマージ）。
 */
export async function assignClientPromo(userId: string, patternId: string | null, by: string): Promise<string | null> {
  if (patternId !== null && !patternById(patternId)) throw new Error("その割引はありません。");
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: assignedPromoPatch(patternId, by) });
  return patternId ? (patternById(patternId)?.id ?? null) : null;
}
