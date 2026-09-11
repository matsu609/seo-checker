/**
 * マスター画面に出す顧客一覧。サーバー専用。
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

/** 1 回に読む人数。Clerk の上限は 500 */
export const PAGE_SIZE = 100;

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
  /** 契約情報の取得に失敗した理由（画面に出して、金額を空欄と取り違えないようにする） */
  billingError?: string;
}

export interface ClientList {
  rows: ClientRow[];
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

export async function loadClients(limit = PAGE_SIZE): Promise<ClientList> {
  const client = await clerkClient();
  const { data: users, totalCount } = await client.users.getUserList({
    limit,
    orderBy: "-created_at",
  });

  const envDefault = defaultPlanFromEnv();

  const settled = await Promise.allSettled(
    users.map((u) => client.billing.getUserBillingSubscription(u.id)),
  );

  const rows: ClientRow[] = users.map((user, i) => {
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
      name: displayName(user),
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt ?? null,
      plan,
      planSource: source,
      billing,
      overrides,
    };
  });

  return { rows, totalCount, truncated: Math.max(0, totalCount - rows.length) };
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
