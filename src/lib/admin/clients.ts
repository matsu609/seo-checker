/**
 * マスター画面と代理店画面に出す顧客一覧。サーバー専用。
 *
 * Clerk のユーザー一覧に、Billing の契約情報と機能の個別開放を重ねる。
 * ここでもデータベースは持たない。
 *
 * 契約情報はユーザー 1 人につき 1 回 API を呼ぶ。顧客数が数百のうちは
 * これで足りるが、増えたら一覧と明細を分ける必要がある（PAGE_SIZE で上限を切る）。
 * 1 人分が失敗しても一覧全体は出す（Promise.allSettled）。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { planFromStripeState, stripeStateFromMetadata } from "@/lib/billing/state";
import { defaultPlanFromEnv } from "@/lib/plans/current";
import { overridesFromMetadata, toggleOverride, OVERRIDES_KEY } from "@/lib/plans/overrides";
import { resolveUserPlan, type PlanSource } from "@/lib/plans/resolve";
import type { PlanId } from "@/lib/plans/catalog";
import { summarizeStripeState, summarizeSubscription, type BillingSummary } from "./billing";
import { agencyIdFromMetadata, canAssignAgency, withAgencyId } from "./roles";
import { assignedPromoFromMetadata, patternById, withAssignedPromo } from "@/lib/billing/promo";
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
  emailAddresses: { id: string; emailAddress: string }[];
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
  /** 担当の代理店（Clerk のユーザー ID）。付いていなければ null */
  agencyId: string | null;
  /** 登録フォームの情報（担当者名・会社名・電話・店舗の種類）。無ければ null */
  lead: LeadProfile | null;
  /** 無料診断を使った回数 */
  freeRuns: number;
  /** 設定済みの割引（パターン名。スタンダードの申し込みに付く）。無ければ null */
  promo: string | null;
  /** 契約情報の取得に失敗した理由（画面に出して、金額を空欄と取り違えないようにする） */
  billingError?: string;
}

export interface ClientList {
  rows: ClientRow[];
  /** 無料診断の上限（回数の表示に使う） */
  freeRunLimit: number;
  totalCount: number;
  /** 表示しきれていない人数 */
  truncated: number;
}

function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string {
  const full = [user.lastName, user.firstName].filter(Boolean).join(" ").trim();
  return full || user.username || "";
}

function primaryEmail(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
}): string {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
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
 * ユーザーの一覧に契約情報を重ねて行にする。人数ぶんの API 呼び出しになるので、
 * 呼ぶ前に必ず絞り込んでおくこと。
 */
export async function buildClientRows(users: ClerkUserLike[]): Promise<ClientRow[]> {
  const client = await clerkClient();
  const envDefault = defaultPlanFromEnv();

  const settled = await Promise.allSettled(
    users.map((u) => client.billing.getUserBillingSubscription(u.id)),
  );

  return users.map((user, i) => {
    const result = settled[i];
    // 契約が無いユーザーは 404 で落ちる。これは異常ではないので「契約なし」として扱う
    const subscription = result.status === "fulfilled" ? result.value : null;
    // Stripe 直結の契約があればそれが正（Clerk Billing はドルのみのため使っていない）
    const stripe = stripeStateFromMetadata(user.publicMetadata);
    const billing = stripe ? summarizeStripeState(stripe) : summarizeSubscription(subscription);
    const overrides = overridesFromMetadata(user.publicMetadata);
    const { plan, source } = resolveUserPlan({
      billingPlan: stripe ? planFromStripeState(stripe) : billing.plan,
      metadataPlan: (user.publicMetadata as Record<string, unknown> | null)?.plan,
      envDefault,
    });
    return {
      userId: user.id,
      email: primaryEmail(user),
      name: displayName(user) || leadFromMetadata(user.publicMetadata, user.unsafeMetadata ?? null)?.contactName || "",
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt ?? null,
      plan,
      planSource: source,
      billing,
      overrides,
      agencyId: agencyIdFromMetadata(user.publicMetadata),
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

  const rows = await buildClientRows(users as ClerkUserLike[]);

  return { rows, freeRunLimit: freeRunLimit(), totalCount, truncated: Math.max(0, totalCount - rows.length) };
}

/**
 * 機能の個別開放を 1 件切り替えて、保存後の一覧を返す。
 * 呼び出し側で管理者かどうかを必ず確認すること。
 *
 * publicMetadata は丸ごと置き換わるので、他のキー（plan など）を必ず残す。
 */
export async function toggleClientFeature(
  userId: string,
  featureId: string,
  enabled: boolean,
): Promise<string[]> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as Record<string, unknown>;
  const next = toggleOverride(overridesFromMetadata(metadata), featureId, enabled);
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { ...metadata, [OVERRIDES_KEY]: next },
  });
  return next;
}

/**
 * 登録者の担当代理店を差し替える（null で担当なし）。マスターだけ。
 *
 * 保存後の値を返す。canAssignAgency を通らない組み合わせ（自分自身を担当にする、
 * ユーザー ID の形が違う）はここで止める。
 */
export async function assignClientAgency(
  userId: string,
  agencyId: string | null,
): Promise<string | null> {
  if (!canAssignAgency(userId, agencyId)) {
    throw new Error("この担当の付け方はできません。");
  }
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as Record<string, unknown>;
  await client.users.updateUserMetadata(userId, {
    publicMetadata: withAgencyId(metadata, agencyId),
  });
  return agencyId;
}

/**
 * 顧客の割引を設定・解除する（null で解除）。保存後のパターン名を返す。
 * 呼び出し側で「運用者」か「その顧客の担当代理店」かを必ず確認すること。
 *
 * publicMetadata は丸ごと置き換わるので、他のキー（plan・overrides など）を必ず残す。
 */
export async function assignClientPromo(userId: string, patternId: string | null, by: string): Promise<string | null> {
  if (patternId !== null && !patternById(patternId)) throw new Error("その割引はありません。");
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as Record<string, unknown>;
  await client.users.updateUserMetadata(userId, {
    publicMetadata: withAssignedPromo(metadata, patternId, by),
  });
  return patternId ? (patternById(patternId)?.id ?? null) : null;
}
