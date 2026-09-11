"use client";

/**
 * 口コミへの返信（AI 返信案）。
 *
 * 1. 接続: Google ビジネス プロフィールの権限（business.manage）があればビジネスを選ぶ。
 *    無ければ「権限を追加」ボタンと、承認までの手順。接続前は MEO の登録店舗の公開情報の口コミで代替。
 * 2. 返信の設定: トーン・店舗からの補足・署名（ブラウザに保存）
 * 3. 口コミ一覧: 未返信を先頭に。各口コミで AI 返信案 → 編集 → Google に投稿（接続時）/ コピー（接続前）
 *
 * 口コミと返信は Google が持つ。このアプリは保存しない。
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RepliesDraftResponse } from "@/app/api/replies/draft/route";
import type { RepliesPlacesResponse } from "@/app/api/replies/places/route";
import type { RepliesReplyResponse } from "@/app/api/replies/reply/route";
import type { RepliesReviewsResponse } from "@/app/api/replies/reviews/route";
import type { RepliesStatusResponse } from "@/app/api/replies/status/route";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { BpReview } from "@/lib/google/business-profile";
import { OWNER_NOTE_MAX, REPLY_MAX, SIGNATURE_MAX } from "@/lib/replies/constants";
import { TONE_LABELS, TONES, type Tone } from "@/lib/reviews/questions";
import { formatDateTime } from "@/lib/report/format";
import { useStore } from "@/lib/store/hooks";
import { repliesSettingsStore } from "@/lib/store/replies";
import { ConnectBusinessButton } from "./ConnectBusinessButton";

const GBP_REVIEWS_URL = "https://business.google.com/reviews";

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答
  }
  return `リクエストに失敗しました（HTTP ${res.status}）`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(await errorMessage(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 一覧に出す口コミ（Google ビジネス プロフィール / 公開情報 の両方をこの形に揃える） */
export interface ReviewRow {
  key: string;
  /** Google に投稿できる口コミなら name、公開情報なら null */
  reviewName: string | null;
  reviewer: string;
  rating: number | null;
  text: string;
  date: string | null;
  reply: { comment: string; updatedAt: string | null } | null;
}

export function toRows(reviews: readonly BpReview[]): ReviewRow[] {
  return reviews.map((r) => ({
    key: r.name,
    reviewName: r.name,
    reviewer: r.anonymous ? "匿名の Google ユーザー" : r.reviewer,
    rating: r.rating,
    text: r.comment,
    date: r.createdAt,
    reply: r.reply,
  }));
}

/** 未返信 → 低評価 → 新しい順 */
export function sortRows(rows: readonly ReviewRow[]): ReviewRow[] {
  const byDate = (a: ReviewRow, b: ReviewRow) => ((a.date ?? "") < (b.date ?? "") ? 1 : (a.date ?? "") > (b.date ?? "") ? -1 : 0);
  return [...rows].sort((a, b) => Number(Boolean(a.reply)) - Number(Boolean(b.reply)) || (a.rating ?? 9) - (b.rating ?? 9) || byDate(a, b));
}

type Filter = "unreplied" | "all";

export function RepliesTool() {
  const [settings, setSettings] = useStore(repliesSettingsStore);
  const [status, setStatus] = useState<RepliesStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [meta, setMeta] = useState<{ storeName: string; averageRating: number | null; total: number | null; nextPageToken: string | null; reviewsUrl: string | null; generatedAt: string | null }>({
    storeName: "",
    averageRating: null,
    total: null,
    nextPageToken: null,
    reviewsUrl: null,
    generatedAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("unreplied");

  useEffect(() => {
    let alive = true;
    request<RepliesStatusResponse>("/api/replies/status")
      .then((s) => alive && setStatus(s))
      .catch((err) => alive && setStatusError(err instanceof Error ? err.message : "状態を取得できませんでした"));
    return () => {
      alive = false;
    };
  }, []);

  const gbpMode = Boolean(status?.hasScope && status.locations.length > 0);
  const location = useMemo(() => {
    if (!status || !gbpMode) return null;
    return status.locations.find((l) => l.name === settings.location) ?? status.locations[0] ?? null;
  }, [status, gbpMode, settings.location]);
  const store = useMemo(() => {
    if (!status || gbpMode) return null;
    return status.stores.find((s) => s.placeId === settings.placeId) ?? status.stores[0] ?? null;
  }, [status, gbpMode, settings.placeId]);

  const loadGbp = useCallback(async (locationName: string, title: string, pageToken: string | null) => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ location: locationName });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await request<RepliesReviewsResponse>(`/api/replies/reviews?${params.toString()}`);
      setRows((prev) => (pageToken ? [...prev, ...toRows(data.reviews)] : toRows(data.reviews)));
      setMeta({ storeName: title, averageRating: data.averageRating, total: data.totalReviewCount, nextPageToken: data.nextPageToken, reviewsUrl: null, generatedAt: null });
    } catch (err) {
      setListError(err instanceof Error ? err.message : "口コミを取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlaces = useCallback(async (placeId: string) => {
    setLoading(true);
    setListError(null);
    try {
      const data = await request<RepliesPlacesResponse>(`/api/replies/places?placeId=${encodeURIComponent(placeId)}`);
      setRows(
        data.reviews.map((r, i) => ({
          key: `${placeId}-${i}`,
          reviewName: null,
          reviewer: r.author ?? "Google ユーザー",
          rating: r.rating,
          text: r.text,
          date: r.publishedAt,
          reply: null,
        })),
      );
      setMeta({ storeName: data.storeName, averageRating: null, total: null, nextPageToken: null, reviewsUrl: data.reviewsUrl, generatedAt: data.generatedAt });
    } catch (err) {
      setListError(err instanceof Error ? err.message : "口コミを取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  // 選択（ビジネス / 店舗）が変わったら取り直す。取得は外部（API）との同期なので effect に置く
  const locationName = location?.name ?? null;
  const locationTitle = location?.title ?? "";
  const storePlaceId = store?.placeId ?? null;
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (locationName) await loadGbp(locationName, locationTitle, null);
      else if (storePlaceId) await loadPlaces(storePlaceId);
      else if (alive) setRows([]);
    };
    // 同期的な setState を避けるため、次のマイクロタスクで開始する
    void Promise.resolve().then(run);
    return () => {
      alive = false;
    };
  }, [locationName, locationTitle, storePlaceId, loadGbp, loadPlaces]);

  const shown = useMemo(() => sortRows(filter === "unreplied" ? rows.filter((r) => !r.reply) : rows), [rows, filter]);
  const unreplied = rows.filter((r) => !r.reply).length;

  function onReplied(key: string, reply: ReviewRow["reply"]) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, reply } : r)));
  }

  return (
    <div className="space-y-6">
      <Card
        number={1}
        title="接続"
        description="Google ビジネス プロフィールを接続すると、口コミの全件取得と返信の投稿がこの画面で完結します。接続前は、MEO に登録した自社店舗の公開情報の口コミ（最新 5 件）で返信案を作れます。"
      >
        {statusError && (
          <Callout tone="fail" className="mb-3">
            {statusError}
          </Callout>
        )}
        {!status && !statusError && <p className="text-[13px] text-muted">状態を確認しています…</p>}
        {status && !status.authEnabled && (
          <Callout tone="info">ログイン（Clerk）が無い環境では Google ビジネス プロフィールを接続できません。公開情報の口コミで返信案だけ作れます。</Callout>
        )}
        {status && status.authEnabled && !status.hasScope && (
          <div className="space-y-3">
            <Callout tone="info" title={status.connected ? "口コミ返信の権限がまだありません" : "Google アカウントが接続されていません"}>
              <p>
                「権限を追加」を押すと Google の確認画面が開きます。<strong>ビジネス プロフィールの管理</strong>の許可を求めるので、そのビジネスの
                オーナーまたは管理者の Google アカウントで許可してください。
              </p>
              <p className="mt-2">
                許可しても口コミが取れない場合は、Google 側の準備（Business Profile API の利用申請の承認と、Google Cloud での API の有効化）がまだです。
                手順は運用メモの残タスク #5 / #53 にあります。
              </p>
            </Callout>
            <ConnectBusinessButton label={status.connected ? "Google に口コミ返信の権限を追加する" : "Google アカウントを接続する"} />
          </div>
        )}
        {status && status.hasScope && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              接続中: <span className="font-bold break-all">{status.email ?? "Google アカウント"}</span>（口コミ返信の権限あり）
            </p>
            {status.locationsError && (
              <Callout tone="warn" title="ビジネス一覧を取得できませんでした">
                <p>{status.locationsError}</p>
                <p className="mt-1">承認・有効化が済んだら、この画面を開き直してください。それまでは下の公開情報の口コミで返信案を作れます。</p>
              </Callout>
            )}
            {status.locations.length > 0 && (
              <Field label="返信するビジネス" htmlFor="replies-location">
                <Select id="replies-location" value={location?.name ?? ""} onChange={(e) => setSettings({ ...settings, location: e.target.value })}>
                  {status.locations.map((l) => (
                    <option key={l.name} value={l.name}>
                      {l.title}
                      {l.address ? `（${l.address}）` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}
        {status && !gbpMode && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[13px] font-bold text-ink">接続前の代替: 公開情報の口コミ</p>
            {status.stores.length === 0 ? (
              <p className="mt-1 text-[13px] text-muted">
                MEO の「Google マップ」で自社店舗を登録すると、その店舗の口コミ（最新 5 件）がここに出ます。
                <Link href="/tools/maps" className="ml-1 text-accent underline">
                  Google マップの画面へ
                </Link>
              </p>
            ) : (
              <Field label="店舗" htmlFor="replies-store" className="mt-2">
                <Select id="replies-store" value={store?.placeId ?? ""} onChange={(e) => setSettings({ ...settings, placeId: e.target.value })}>
                  {status.stores.map((s) => (
                    <option key={s.placeId} value={s.placeId}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}
      </Card>

      <Card number={2} title="返信の設定" description="AI が返信案を作るときの文体と、返信に含めてよい店舗側の事実（改善済み、連絡手段など）、末尾の署名。このブラウザに保存されます。">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="トーン" htmlFor="replies-tone">
            <Select id="replies-tone" value={settings.tone} onChange={(e) => setSettings({ ...settings, tone: e.target.value as Tone })}>
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {TONE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="署名（任意）" htmlFor="replies-signature" hint="例: 〇〇食堂 店長 山田">
            <Input id="replies-signature" maxLength={SIGNATURE_MAX} value={settings.signature} onChange={(e) => setSettings({ ...settings, signature: e.target.value })} />
          </Field>
          <Field label="店舗からの補足（任意）" htmlFor="replies-note" hint="返信に含めてよい事実。例: 提供の遅れは 9 月から人員を増やして改善済み / ご意見は contact@… へ" className="md:col-span-3">
            <Textarea id="replies-note" rows={2} maxLength={OWNER_NOTE_MAX} value={settings.ownerNote} onChange={(e) => setSettings({ ...settings, ownerNote: e.target.value })} />
          </Field>
        </div>
        {status && !status.aiEnabled && (
          <Callout tone="warn" className="mt-3">
            AI の返信案には <code>ANTHROPIC_API_KEY</code> の設定が必要です（設定画面「外部連携」）。返信の投稿と手書きは使えます。
          </Callout>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          返信は Google マップで公開されます。来店客の氏名や来店日時など個人が特定できることは書かないでください。AI の返信案は必ず内容を確認してから投稿してください。
        </p>
      </Card>

      <Card
        number={3}
        title="口コミ"
        description={
          gbpMode
            ? "未返信の口コミを先頭に表示します。返信案を作って編集し、そのまま Google に投稿できます。"
            : "公開情報で取れる最新 5 件です（毎週の一斉更新で取り直されます）。返信案をコピーして、Google ビジネス プロフィールの口コミ管理画面で返信してください。"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {meta.total !== null && (
              <span className="text-[12px] text-muted">
                全 {meta.total.toLocaleString("ja-JP")} 件
                {meta.averageRating !== null ? ` / 平均 ${meta.averageRating.toFixed(1)}` : ""}
                {` / 未返信 ${unreplied}`}
              </span>
            )}
            {gbpMode && (
              <Select aria-label="表示" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="!h-9 !w-auto text-sm">
                <option value="unreplied">未返信だけ</option>
                <option value="all">すべて</option>
              </Select>
            )}
            {!gbpMode && (
              <ButtonLink href={meta.reviewsUrl ?? GBP_REVIEWS_URL} external size="sm">
                Google で口コミを管理
              </ButtonLink>
            )}
          </div>
        }
      >
        {listError && (
          <Callout tone="fail" className="mb-3">
            {listError}
          </Callout>
        )}
        {!gbpMode && meta.generatedAt && <p className="mb-3 text-[11px] text-muted">取得日時: {formatDateTime(meta.generatedAt)}（{meta.storeName}）</p>}
        {loading && rows.length === 0 ? (
          <p className="text-[13px] text-muted">口コミを読み込んでいます…</p>
        ) : shown.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? "口コミがありません" : "未返信の口コミはありません"}
            description={rows.length === 0 ? (gbpMode ? "このビジネスにはまだ口コミがありません。" : "店舗を選ぶか、MEO の報告書が作られるのを待ってください。") : "「すべて」に切り替えると返信済みの口コミも見られます。"}
          />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {shown.map((r) => (
              <ReviewItem
                key={r.key}
                row={r}
                storeName={meta.storeName || location?.title || store?.name || ""}
                tone={settings.tone}
                ownerNote={settings.ownerNote}
                signature={settings.signature}
                aiEnabled={status?.aiEnabled ?? false}
                canPost={gbpMode}
                manageUrl={meta.reviewsUrl ?? GBP_REVIEWS_URL}
                onReplied={onReplied}
              />
            ))}
          </ul>
        )}
        {gbpMode && meta.nextPageToken && location && (
          <div className="mt-4">
            <Button type="button" variant="secondary" loading={loading} onClick={() => void loadGbp(location.name, location.title, meta.nextPageToken)}>
              さらに読み込む
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-muted">評価なし</span>;
  const tone = rating <= 2 ? "fail" : rating === 3 ? "warn" : "pass";
  return (
    <Badge tone={tone}>
      {"★".repeat(rating)}
      {"☆".repeat(5 - rating)} {rating}
    </Badge>
  );
}

function ReviewItem({
  row,
  storeName,
  tone,
  ownerNote,
  signature,
  aiEnabled,
  canPost,
  manageUrl,
  onReplied,
}: {
  row: ReviewRow;
  storeName: string;
  tone: Tone;
  ownerNote: string;
  signature: string;
  aiEnabled: boolean;
  canPost: boolean;
  manageUrl: string;
  onReplied: (key: string, reply: ReviewRow["reply"]) => void;
}) {
  const [draft, setDraft] = useState(row.reply?.comment ?? "");
  const [editing, setEditing] = useState(!row.reply);
  const [busy, setBusy] = useState<"draft" | "post" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function makeDraft() {
    setBusy("draft");
    setError(null);
    setNotice(null);
    try {
      const data = await request<RepliesDraftResponse>("/api/replies/draft", {
        method: "POST",
        body: JSON.stringify({ storeName, tone, rating: row.rating, text: row.text, author: row.reviewer, ownerNote, signature }),
      });
      setDraft(data.draft);
      setEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "返信案を作れませんでした");
    } finally {
      setBusy(null);
    }
  }

  async function post() {
    if (!row.reviewName) return;
    const text = draft.trim();
    if (!text) {
      setError("返信の本文を入力してください。");
      return;
    }
    if (!window.confirm(`この返信を Google マップに公開します。${row.reply ? "既存の返信は上書きされます。" : ""}よろしいですか？`)) return;
    setBusy("post");
    setError(null);
    try {
      const data = await request<RepliesReplyResponse>("/api/replies/reply", { method: "PUT", body: JSON.stringify({ reviewName: row.reviewName, comment: text }) });
      onReplied(row.key, data.reply);
      setEditing(false);
      setNotice("Google に投稿しました。反映まで数分かかることがあります。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!row.reviewName) return;
    if (!window.confirm("Google マップに公開している返信を削除します。よろしいですか？")) return;
    setBusy("delete");
    setError(null);
    try {
      await request<void>("/api/replies/reply", { method: "DELETE", body: JSON.stringify({ reviewName: row.reviewName }) });
      onReplied(row.key, null);
      setDraft("");
      setEditing(true);
      setNotice("返信を削除しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.trim());
      setNotice("返信案をコピーしました。Google の口コミ管理画面で貼り付けて返信してください。");
    } catch {
      setError("コピーできませんでした。本文を選択してコピーしてください。");
    }
  }

  return (
    <li className="py-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Stars rating={row.rating} />
            <span className="font-bold text-ink">{row.reviewer}</span>
            {row.date && <span className="text-muted">{formatDateTime(row.date)}</span>}
            {row.reply ? <Badge tone="pass">返信済み</Badge> : <Badge tone="warn">未返信</Badge>}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{row.text || <span className="text-muted">（本文なし。評価だけの口コミ）</span>}</p>
          {row.reply && !editing && (
            <div className="mt-3 rounded-sm border border-line bg-surface p-3 text-[13px]">
              <p className="text-[11px] text-muted">オーナーからの返信{row.reply.updatedAt ? `（${formatDateTime(row.reply.updatedAt)}）` : ""}</p>
              <p className="mt-1 whitespace-pre-wrap text-ink">{row.reply.comment}</p>
            </div>
          )}
        </div>
        <div>
          {editing || !row.reply ? (
            <>
              <Textarea aria-label="返信の本文" rows={6} maxLength={REPLY_MAX} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="「AI で返信案を作る」を押すか、ここに直接書いてください" />
              <p className="mt-1 text-right text-[11px] text-muted">
                {draft.length} / {REPLY_MAX}
              </p>
            </>
          ) : null}
          {error && (
            <Callout tone="fail" className="mt-2">
              {error}
            </Callout>
          )}
          {notice && (
            <Callout tone="pass" className="mt-2">
              {notice}
            </Callout>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {(editing || !row.reply) && (
              <Button type="button" size="sm" variant="secondary" onClick={makeDraft} loading={busy === "draft"} disabled={busy !== null || !aiEnabled} title={aiEnabled ? undefined : "ANTHROPIC_API_KEY が未設定です"}>
                AI で返信案を作る
              </Button>
            )}
            {canPost ? (
              <>
                {editing || !row.reply ? (
                  <Button type="button" size="sm" onClick={post} loading={busy === "post"} disabled={busy !== null || !draft.trim()}>
                    {row.reply ? "返信を更新する" : "Google に投稿する"}
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy !== null}>
                    返信を編集
                  </Button>
                )}
                {row.reply && (
                  <Button type="button" size="sm" variant="ghost" onClick={remove} loading={busy === "delete"} disabled={busy !== null}>
                    返信を削除
                  </Button>
                )}
                {editing && row.reply && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(row.reply?.comment ?? ""); }} disabled={busy !== null}>
                    やめる
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button type="button" size="sm" onClick={copy} disabled={!draft.trim()}>
                  返信案をコピー
                </Button>
                <ButtonLink href={manageUrl} external size="sm">
                  Google で返信する
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
