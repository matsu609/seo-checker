/**
 * 代理店アカウントの追加・解除と、代理店から見える登録者の一覧。サーバー専用。
 *
 * 保存先は Clerk の publicMetadata（src/lib/admin/roles.ts）。データベースは持たない。
 *
 * Clerk の Backend API には publicMetadata で絞る条件が無いので、
 * 「代理店の一覧」も「その代理店の担当分」も、ユーザーを読んでからこちらで絞る。
 * 読む人数は MAX_SCAN で必ず打ち切る（src/lib/admin/clients.ts）。
 * 数千人規模になったら、担当の関係だけ Supabase に持たせて絞り込みを DB に移すこと。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { adminEmails, isAdminEmail } from "./config";
import {
  buildClientRows,
  listUsers,
  type ClerkUserLike,
  type ClientRow,
} from "./clients";
import { agencyIdFromMetadata, isAgencyMetadata, isUserId, withAgencyRole } from "./roles";

export interface AgencyRow {
  userId: string;
  email: string;
  name: string;
  createdAt: number;
  /** この代理店が担当している登録者の数 */
  clientCount: number;
}

/** 代理店を追加したときの結果。招待はまだ登録されていない相手に送る */
export type AddAgencyResult =
  | { kind: "promoted"; email: string; userId: string }
  | { kind: "invited"; email: string };

function displayName(user: ClerkUserLike): string {
  const full = [user.lastName, user.firstName].filter(Boolean).join(" ").trim();
  return full || user.username || "";
}

function primaryEmail(user: ClerkUserLike): string {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
}

/**
 * 代理店アカウントの一覧（新しい順）。担当している登録者の数も数える。
 * マスター画面と、担当の割り当て欄の選択肢に使う。
 */
export async function loadAgencies(): Promise<AgencyRow[]> {
  const { users } = await listUsers();

  const counts = new Map<string, number>();
  for (const user of users) {
    const agencyId = agencyIdFromMetadata(user.publicMetadata);
    if (agencyId) counts.set(agencyId, (counts.get(agencyId) ?? 0) + 1);
  }

  return users
    .filter((u) => isAgencyMetadata(u.publicMetadata))
    .map((user) => ({
      userId: user.id,
      email: primaryEmail(user),
      name: displayName(user),
      createdAt: user.createdAt,
      clientCount: counts.get(user.id) ?? 0,
    }));
}

/**
 * そのメールアドレスちょうどの持ち主を探す。
 *
 * Clerk の `emailAddress` 絞り込みは**部分一致**なので、そのまま先頭の 1 件を採ると
 * 別人（`a@example.com` で探して `aa@example.com` が返る）を代理店にしてしまう。
 * 候補を多めに取って、こちらで完全一致だけを拾う。
 */
async function findUserByExactEmail(email: string) {
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ emailAddress: [email], limit: 20 });
  return (
    data.find((u) =>
      u.emailAddresses.some((e) => e.emailAddress.trim().toLowerCase() === email),
    ) ?? null
  );
}

/**
 * メールアドレスを代理店にする。マスターだけ。
 *
 * すでに登録済みのアカウントなら role を付けるだけ。まだ居なければ Clerk の招待を送り、
 * 相手が登録した時点で role が付くようにする（招待の publicMetadata は、
 * 登録完了時にそのままユーザーの publicMetadata に入る）。
 *
 * 運用者（ADMIN_EMAILS）は代理店にしない。マスターは全登録者が見える立場なので、
 * 代理店の役割を重ねる意味が無く、解除のときに権限の出どころが分からなくなる。
 */
export async function addAgencyByEmail(email: string): Promise<AddAgencyResult> {
  if (isAdminEmail(email, adminEmails())) {
    throw new Error("運用者のアドレスは代理店にできません。");
  }

  const client = await clerkClient();
  const user = await findUserByExactEmail(email);

  if (user) {
    const metadata = (user.publicMetadata ?? {}) as Record<string, unknown>;
    await client.users.updateUserMetadata(user.id, {
      publicMetadata: withAgencyRole(metadata, true),
    });
    return { kind: "promoted", email, userId: user.id };
  }

  await client.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: withAgencyRole(null, true),
    // すでに招待済みのアドレスに送り直せるようにする（招待メールが届かなかったとき）
    ignoreExisting: true,
    notify: true,
  });
  return { kind: "invited", email };
}

/**
 * 代理店を解除する（role を外す）。マスターだけ。
 *
 * 担当の割り当て（登録者側の agencyId）は消さない。解除した時点で代理店画面は
 * 開けなくなるので見えなくなり、付け直したいときは同じ相手を代理店に戻せば
 * 担当がそのまま戻る。数百件の書き換えを走らせない、という判断でもある。
 */
export async function removeAgency(userId: string): Promise<void> {
  if (!isUserId(userId)) throw new Error("ユーザー ID の形が正しくありません。");
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const metadata = (user.publicMetadata ?? {}) as Record<string, unknown>;
  await client.users.updateUserMetadata(userId, {
    publicMetadata: withAgencyRole(metadata, false),
  });
}

/**
 * その代理店が担当している登録者の一覧。代理店画面に出す。
 *
 * 契約情報を引くのは絞り込んだあとだけ（人数ぶんの API 呼び出しになるため）。
 * 代理店自身は結果に含めない（担当に自分を入れられない作りだが、念のため落とす）。
 */
export async function loadAgencyClients(agencyId: string): Promise<ClientRow[]> {
  if (!isUserId(agencyId)) return [];
  const { users } = await listUsers();
  const mine = users.filter(
    (u) => u.id !== agencyId && agencyIdFromMetadata(u.publicMetadata) === agencyId,
  );
  return buildClientRows(mine);
}
