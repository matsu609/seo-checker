"use client";

/**
 * Google ビジネス プロフィールの投稿（AI 下書き → 承認して予約 → 毎日 5:00 の定期処理が投稿）。
 *
 * 投稿の本文は Google マップで公開されるので、AI の下書きは必ず人が読んで「承認して予約」を押す
 * （自動投稿はしない。承認したものだけを予定時刻に送る）。
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostsResponse } from "@/app/api/posts/route";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { fromLocalInput, sortPosts, toLocalInput, validatePost } from "@/lib/posts/schedule";
import {
  CTA_LABELS,
  CTA_TYPES,
  DRAFT_COUNT_MAX,
  POST_STATUS_LABELS,
  POST_SUMMARY_MAX,
  POST_TITLE_MAX,
  POST_TOPIC_LABELS,
  POST_TOPICS,
  type CtaType,
  type GbpPost,
  type PostInput,
  type PostTopic,
} from "@/lib/posts/types";
import { formatDateTime } from "@/lib/report/format";
import { WEEKDAY_LABELS_JA } from "@/lib/time/jst";
import { CadenceCard } from "./CadenceCard";

const STATUS_TONE: Record<GbpPost["status"], "pass" | "info" | "warn" | "fail" | "neutral"> = { draft: "neutral", scheduled: "info", publishing: "info", published: "pass", failed: "fail", cancelled: "neutral" };

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // JSON でない
  }
  return `HTTP ${res.status}`;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(await readError(res));
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

function fetchPosts(pid: string): Promise<PostsResponse> {
  return call<PostsResponse>(`/api/posts${pid ? `?placeId=${encodeURIComponent(pid)}` : ""}`);
}

export function PostsTool() {
  const [data, setData] = useState<PostsResponse | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [count, setCount] = useState(4);
  const [theme, setTheme] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [hour, setHour] = useState(10);

  const load = useCallback(async (pid: string) => {
    try {
      const body = await fetchPosts(pid);
      setData(body);
      setError(null);
      if (!pid && body.stores[0]) setPlaceId(body.stores[0].placeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込めませんでした");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchPosts(placeId)
      .then((body) => {
        if (!alive) return;
        setData(body);
        setError(null);
        if (!placeId && body.stores[0]) setPlaceId(body.stores[0].placeId);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "読み込めませんでした");
      });
    return () => {
      alive = false;
    };
  }, [placeId]);

  const posts = useMemo(() => sortPosts((data?.posts ?? []).filter((p) => !placeId || p.placeId === placeId)), [data, placeId]);
  const store = data?.stores.find((s) => s.placeId === placeId) ?? null;
  const googleReady = data ? data.google.authEnabled && data.google.connected && data.google.hasScope : false;

  async function makeDrafts() {
    if (!placeId) return;
    setDrafting(true);
    setError(null);
    try {
      await call("/api/posts/draft", { method: "POST", body: JSON.stringify({ placeId, count, theme, weekday, hour }) });
      await load(placeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "下書きを作れませんでした");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-6">
      {data && data.stores.length === 0 && (
        <Callout tone="info" title="自社の店舗が未登録です">
          <Link href="/tools/maps" className="font-bold text-accent underline-offset-2 hover:underline">
            マップ診断
          </Link>
          で自社の店舗を登録すると、その店舗の投稿を作れます。
        </Callout>
      )}
      {data && data.google.authEnabled && !googleReady && (
        <Callout tone="warn" title="Google ビジネス プロフィールがまだ接続されていません">
          下書きと予約はできますが、投稿するには
          <Link href="/tools/reviews" className="mx-1 font-bold text-accent underline-offset-2 hover:underline">
            口コミの画面
          </Link>
          の「Google に口コミ返信の権限を追加する」で店舗の管理者アカウントを接続してください（投稿も同じ権限 business.manage で送ります）。
          Business Profile API の利用申請が承認されるまでは、送信が「失敗」（403）として残ります。
        </Callout>
      )}

      <Card
        number={1}
        title="下書きを作る"
        description="店舗の情報（店名・カテゴリ・地域）と対策キーワード、季節から AI が本文を書きます。週 1 本の予定日時を付けて「下書き」で保存するので、読んでから「承認して予約」を押してください。"
        actions={
          <Button onClick={() => void makeDrafts()} loading={drafting} disabled={!placeId || !data?.aiEnabled || !data?.enabled} title={!data?.aiEnabled ? "ANTHROPIC_API_KEY が未設定です" : undefined}>
            AI で {count} 本の下書きを作る
          </Button>
        }
      >
        {error && (
          <Callout tone="fail" className="mb-4">
            {error}
          </Callout>
        )}
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="店舗" htmlFor="posts-store">
            <Select id="posts-store" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
              {(data?.stores ?? []).map((s) => (
                <option key={s.placeId} value={s.placeId}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="本数" htmlFor="posts-count">
            <Select id="posts-count" value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: DRAFT_COUNT_MAX }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} 本（{n} 週分）
                </option>
              ))}
            </Select>
          </Field>
          <Field label="投稿する曜日" htmlFor="posts-weekday">
            <Select id="posts-weekday" value={String(weekday)} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAY_LABELS_JA.map((l, i) => (
                <option key={i} value={i}>
                  {l}曜
                </option>
              ))}
            </Select>
          </Field>
          <Field label="時刻" htmlFor="posts-hour">
            <Select id="posts-hour" value={String(hour)} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="話題の指定（任意）" htmlFor="posts-theme" hint="例: 10 月は七五三の撮影プランを案内したい。特典は無し" className="mt-3">
          <Textarea id="posts-theme" rows={2} value={theme} onChange={(e) => setTheme(e.target.value.slice(0, 500))} />
        </Field>
        <p className="mt-2 text-[11px] text-muted">
          予約した投稿は毎日 5:00 の定期処理が予定時刻を過ぎた分を送ります{data?.nextRunAt ? `（次回 ${formatDateTime(data.nextRunAt)}）` : ""}。急ぐときは各投稿の「今すぐ投稿」。
        </p>
      </Card>

      {/* 一覧の前に「週 1 回を続けられているか」の図を出す（利用者の指示 2026-09-22） */}
      <CadenceCard number={2} posts={posts} storeName={store?.name ?? null} />

      <Card number={3} title={`投稿の一覧${store ? `（${store.name}）` : ""}`} description="予約が近い順。本文を直してから「承認して予約」。投稿済みは編集できません。">
        {posts.length === 0 && <EmptyState title="投稿はまだありません" description="上の「AI で下書きを作る」か、手で作る場合は下書きを 1 本作ってください。" />}
        <ul className="divide-y divide-line border-y border-line">
          {posts.map((p) => (
            <PostRow key={p.id} post={p} googleReady={googleReady} onChanged={() => void load(placeId)} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PostRow({ post, googleReady, onChanged }: { post: GbpPost; googleReady: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(post.status === "draft" || post.status === "failed");
  const [form, setForm] = useState<PostInput>({
    topicType: post.topicType,
    title: post.title,
    summary: post.summary,
    ctaType: post.ctaType,
    ctaUrl: post.ctaUrl,
    eventStart: post.eventStart,
    eventEnd: post.eventEnd,
    scheduledAt: post.scheduledAt,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // 送信中（2026-09-23 追加）は中身を変えられない。取り消しだけ出す
  const editable = post.status !== "published" && post.status !== "publishing";
  const errors = validatePost(form);

  async function patch(action?: "schedule" | "draft" | "cancel") {
    setBusy(action ?? "save");
    setMessage(null);
    try {
      await call(`/api/posts/${encodeURIComponent(post.id)}`, { method: "PATCH", body: JSON.stringify({ ...form, ...(action ? { action } : {}) }) });
      setMessage(action === "schedule" ? "予約しました" : action === "cancel" ? "取り消しました" : "保存しました");
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(null);
    }
  }

  async function publishNow() {
    if (!window.confirm("いま Google に投稿します。投稿は Google マップで公開されます。よろしいですか？")) return;
    setBusy("publish");
    setMessage(null);
    try {
      await call(`/api/posts/${encodeURIComponent(post.id)}`, { method: "PATCH", body: JSON.stringify(form) });
      const res = await fetch(`/api/posts/${encodeURIComponent(post.id)}/publish`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      setMessage(body.message ?? body.error ?? (res.ok ? "投稿しました" : `HTTP ${res.status}`));
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "投稿できませんでした");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("この投稿を削除します。よろしいですか？")) return;
    setBusy("delete");
    try {
      await call(`/api/posts/${encodeURIComponent(post.id)}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "削除できませんでした");
      setBusy(null);
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={STATUS_TONE[post.status]} icon={false}>
          {POST_STATUS_LABELS[post.status]}
        </Badge>
        <span className="text-[12px] text-muted">{POST_TOPIC_LABELS[post.topicType]}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{post.title || post.summary.slice(0, 60) || "（本文なし）"}</span>
        <span className="text-[12px] tabular-nums text-muted">
          {post.status === "published" && post.publishedAt ? `投稿 ${formatDateTime(post.publishedAt)}` : post.scheduledAt ? `予定 ${formatDateTime(post.scheduledAt)}` : "予定なし"}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "閉じる" : editable ? "編集" : "本文"}
        </Button>
      </div>
      {post.error && post.status === "failed" && <p className="mt-1 text-[12px] text-fail">失敗の理由: {post.error}</p>}
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="種類" htmlFor={`pt-topic-${post.id}`}>
              <Select id={`pt-topic-${post.id}`} value={form.topicType} disabled={!editable} onChange={(e) => setForm({ ...form, topicType: e.target.value as PostTopic })}>
                {POST_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {POST_TOPIC_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`題名（イベント・クーポン。${POST_TITLE_MAX} 文字まで）`} htmlFor={`pt-title-${post.id}`}>
              <Input id={`pt-title-${post.id}`} maxLength={POST_TITLE_MAX} value={form.title} disabled={!editable} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="予約日時" htmlFor={`pt-at-${post.id}`}>
              <Input id={`pt-at-${post.id}`} type="datetime-local" value={toLocalInput(form.scheduledAt)} disabled={!editable} onChange={(e) => setForm({ ...form, scheduledAt: fromLocalInput(e.target.value) })} />
            </Field>
          </div>
          <Field label={`本文（${form.summary.length} / ${POST_SUMMARY_MAX} 文字）`} htmlFor={`pt-summary-${post.id}`}>
            <Textarea id={`pt-summary-${post.id}`} rows={6} maxLength={POST_SUMMARY_MAX} value={form.summary} disabled={!editable} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="ボタン" htmlFor={`pt-cta-${post.id}`}>
              <Select id={`pt-cta-${post.id}`} value={form.ctaType} disabled={!editable} onChange={(e) => setForm({ ...form, ctaType: e.target.value as CtaType })}>
                {CTA_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {CTA_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ボタンのリンク先" htmlFor={`pt-url-${post.id}`}>
              <Input id={`pt-url-${post.id}`} inputMode="url" placeholder="https://" value={form.ctaUrl} disabled={!editable || form.ctaType === "NONE" || form.ctaType === "CALL"} onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })} />
            </Field>
            <Field label="開始日（イベント・クーポン）" htmlFor={`pt-start-${post.id}`}>
              <Input id={`pt-start-${post.id}`} type="date" value={form.eventStart ?? ""} disabled={!editable || form.topicType === "STANDARD"} onChange={(e) => setForm({ ...form, eventStart: e.target.value || null })} />
            </Field>
            <Field label="終了日" htmlFor={`pt-end-${post.id}`}>
              <Input id={`pt-end-${post.id}`} type="date" value={form.eventEnd ?? ""} disabled={!editable || form.topicType === "STANDARD"} onChange={(e) => setForm({ ...form, eventEnd: e.target.value || null })} />
            </Field>
          </div>
          {editable && errors.length > 0 && <p className="text-[12px] text-warn">{errors.join("。")}</p>}
          {message && <p className="text-[12px] text-ink">{message}</p>}
          {post.status === "publishing" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => void patch("cancel")} loading={busy === "cancel"} disabled={busy !== null}>
                取り消し
              </Button>
            </div>
          )}
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void patch()} loading={busy === "save"} disabled={busy !== null}>
                保存
              </Button>
              {post.status !== "scheduled" && (
                <Button size="sm" onClick={() => void patch("schedule")} loading={busy === "schedule"} disabled={busy !== null || errors.length > 0 || !form.scheduledAt}>
                  承認して予約
                </Button>
              )}
              {post.status === "scheduled" && (
                <Button size="sm" variant="secondary" onClick={() => void patch("draft")} loading={busy === "draft"} disabled={busy !== null}>
                  下書きに戻す
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => void publishNow()} loading={busy === "publish"} disabled={busy !== null || errors.length > 0 || !googleReady} title={!googleReady ? "Google ビジネス プロフィールを接続してください" : undefined}>
                今すぐ投稿
              </Button>
              {post.status !== "cancelled" && (
                <Button size="sm" variant="ghost" onClick={() => void patch("cancel")} loading={busy === "cancel"} disabled={busy !== null}>
                  取り消し
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={() => void remove()} loading={busy === "delete"} disabled={busy !== null}>
                削除
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
