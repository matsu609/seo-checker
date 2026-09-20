/**
 * ご意見・不具合の報告（フィードバック）の型と純粋な関数。サーバー・ブラウザ共用。
 *
 * 利用者の指示（2026-09-20）: 各ユーザーから運営者へ「困りごと・バグ・要望」を集めやすくする。
 * ログイン済みのツールの中から送ってもらい、誰が・どの画面で・どの版で、を自動で付ける
 * （メールだと本人が書かない限り分からず、不具合の再現に時間がかかる）。
 *
 * 保存先は Supabase の `feedback` テーブル（SQL は docs/dev/OPERATIONS.md）。
 * 運営者の返答は同じ行の `reply` に書き、利用者は設定画面の「ご意見の履歴」で読む
 * （メール送信サービスなしで返事が届く）。
 */
import { z } from "zod";

/** 種類。画面の選択肢の順 */
export const FEEDBACK_KINDS = ["bug", "request", "question", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "不具合の報告",
  request: "こうしてほしい（要望）",
  question: "使い方の質問",
  other: "その他のご意見",
};

/** 運営者側の対応状態（口コミ支援の回答と同じ 3 段階） */
export const FEEDBACK_STATUSES = ["open", "in_progress", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  done: "対応済み",
};

export const FEEDBACK_BODY_MAX = 2000;
export const FEEDBACK_REPLY_MAX = 2000;
/** 開いていた画面のパス（ブラウザから送る）。長すぎる値は捨てる */
export const FEEDBACK_PATH_MAX = 300;
/** 1 人が 1 日に送れる件数（荒らしと連打の抑止。まともな利用でここに当たることはない） */
export const FEEDBACK_DAILY_LIMIT = 20;

/** 利用者が送る本文（POST /api/feedback） */
export const FeedbackInputSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  body: z.string().trim().min(1, "内容を入力してください").max(FEEDBACK_BODY_MAX, `内容は ${FEEDBACK_BODY_MAX} 文字までです`),
  /** 送信時に開いていた画面（`/tools/rank` など）。ブラウザが付ける。無ければ空 */
  path: z.string().trim().max(FEEDBACK_PATH_MAX).optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

/** 運営者の更新（PATCH /api/admin/feedback）。どちらか一方だけでもよい */
export const FeedbackUpdateSchema = z
  .object({
    status: z.enum(FEEDBACK_STATUSES).optional(),
    reply: z.string().trim().max(FEEDBACK_REPLY_MAX, `返答は ${FEEDBACK_REPLY_MAX} 文字までです`).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.reply !== undefined, { message: "変更する項目がありません" });
export type FeedbackUpdate = z.infer<typeof FeedbackUpdateSchema>;

/** 1 件の記録。運営者向けと本人向けで同じ形（本人には email などを返さなくてもよいが、自分の値なので害はない） */
export interface FeedbackRecord {
  id: string;
  userId: string;
  /** 送信時点のメール（Clerk から。認証なしの環境では空） */
  email: string;
  /** 送信時点の表示名（会社名 or 担当者名。無ければ空） */
  name: string;
  kind: FeedbackKind;
  body: string;
  /** 送信時に開いていた画面のパス */
  path: string;
  /** 送信時点のプラン名 */
  plan: string;
  userAgent: string;
  /** 動いていたコミット（短縮 SHA。分からなければ空） */
  commit: string;
  /** 動いていたリリース番号（rNN の NN。分からなければ 0） */
  release: number;
  status: FeedbackStatus;
  /** 運営者の返答（無ければ null） */
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** テーブルの列。select と insert で同じ並びを使う */
export const FEEDBACK_COLUMNS =
  "id,user_id,email,name,kind,body,path,plan,user_agent,commit,release,status,reply,replied_at,created_at,updated_at";

export const FeedbackRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  kind: z.string(),
  body: z.string(),
  path: z.string().nullable(),
  plan: z.string().nullable(),
  user_agent: z.string().nullable(),
  commit: z.string().nullable(),
  release: z.number().nullable(),
  status: z.string(),
  reply: z.string().nullable(),
  replied_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
});
export type FeedbackRow = z.infer<typeof FeedbackRowSchema>;

function isKind(v: string): v is FeedbackKind {
  return (FEEDBACK_KINDS as readonly string[]).includes(v);
}
function isStatus(v: string): v is FeedbackStatus {
  return (FEEDBACK_STATUSES as readonly string[]).includes(v);
}

/** 行 → 記録。想定外の値は既定に落とす（保存したのは自分のサーバーなので画面は止めない） */
export function fromFeedbackRow(row: FeedbackRow): FeedbackRecord {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email ?? "",
    name: row.name ?? "",
    kind: isKind(row.kind) ? row.kind : "other",
    body: row.body,
    path: row.path ?? "",
    plan: row.plan ?? "",
    userAgent: row.user_agent ?? "",
    commit: row.commit ?? "",
    release: typeof row.release === "number" && Number.isFinite(row.release) ? row.release : 0,
    status: isStatus(row.status) ? row.status : "open",
    reply: row.reply && row.reply.trim().length > 0 ? row.reply : null,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

/**
 * ブラウザの User-Agent を人が読める短い名前にする（一覧に出す用。判定は雑でよい）。
 * 例: "Chrome / Windows"、"Safari / iPhone"
 */
export function describeUserAgent(ua: string): string {
  if (!ua) return "";
  const os = /iPhone|iPod/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua) && !/Chromium/.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  return [browser, os].filter(Boolean).join(" / ");
}

/** 一覧の並び替え用: 未対応 → 対応中 → 対応済み、同じ状態なら新しい順 */
export function compareFeedback(a: FeedbackRecord, b: FeedbackRecord): number {
  const rank = (s: FeedbackStatus) => FEEDBACK_STATUSES.indexOf(s);
  const d = rank(a.status) - rank(b.status);
  if (d !== 0) return d;
  return b.createdAt.localeCompare(a.createdAt);
}
