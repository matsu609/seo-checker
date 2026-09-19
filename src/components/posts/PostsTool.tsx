"use client";

/**
 * ビジネス プロフィールへの投稿（最新情報）。
 *
 * 1. 接続: Google ビジネス プロフィールの権限（business.manage。口コミ返信と同じ）があればビジネスを選ぶ
 * 2. 投稿を書く: ネタを 1 行入れて AI に下書きさせ、編集してボタンを選び、Google に送る
 * 3. これまでの投稿: 状態（掲載中 / 処理中 / 非承認）と Google 上の投稿へのリンク、削除
 *
 * 投稿は Google が持つ（このアプリは保存しない）。下書きの材料は掲載タブで決めた基本情報。
 * 投稿の有無と頻度は MEO の診断（投稿カテゴリ）で採点している項目で、ここがその打ち手。
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostsCreateResponse, PostsListResponse } from "@/app/api/posts/route";
import type { PostsDraftResponse } from "@/app/api/posts/draft/route";
import type { PostsStatusResponse } from "@/app/api/posts/status/route";
import { ConnectBusinessButton } from "@/components/replies/ConnectBusinessButton";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { BpLocalPost } from "@/lib/google/business-profile";
import {
  actionNeedsUrl,
  LOCAL_POST_ACTION_LABELS,
  LOCAL_POST_ACTIONS,
  LOCAL_POST_STATE_LABELS,
  LOCAL_POST_SUMMARY_MAX,
  LOCAL_POST_SUMMARY_RECOMMENDED,
  TOPIC_MAX,
  type LocalPostAction,
} from "@/lib/posts/constants";
import { formatDateTime } from "@/lib/report/format";
import { useStore } from "@/lib/store/hooks";
import { postsSettingsStore } from "@/lib/store/posts";

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

const STATE_TONE: Record<string, "pass" | "warn" | "fail" | "neutral"> = { LIVE: "pass", PROCESSING: "warn", REJECTED: "fail" };

export function PostsTool() {
  const [settings, setSettings] = useStore(postsSettingsStore);
  const [status, setStatus] = useState<PostsStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [summary, setSummary] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postMessage, setPostMessage] = useState<string | null>(null);
  const [posts, setPosts] = useState<BpLocalPost[]>([]);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    request<PostsStatusResponse>("/api/posts/status")
      .then((s) => alive && setStatus(s))
      .catch((err) => alive && setStatusError(err instanceof Error ? err.message : "状態を取得できませんでした"));
    return () => {
      alive = false;
    };
  }, []);

  const canPost = Boolean(status?.hasScope && status.locations.length > 0);
  const location = useMemo(() => {
    if (!status || !canPost) return null;
    return status.locations.find((l) => l.name === settings.location) ?? status.locations[0] ?? null;
  }, [status, canPost, settings.location]);
  /** AI の下書きの材料。ビジネスと同じ名前の自社店舗があればそれ、無ければ最初の 1 件 */
  const store = useMemo(() => {
    if (!status || status.stores.length === 0) return null;
    return status.stores.find((s) => s.placeId === settings.placeId) ?? status.stores.find((s) => s.name === location?.title) ?? status.stores[0] ?? null;
  }, [status, settings.placeId, location]);

  const loadPosts = useCallback(async (locationName: string) => {
    setListing(true);
    setListError(null);
    try {
      const page = await request<PostsListResponse>(`/api/posts?locationName=${encodeURIComponent(locationName)}`);
      setPosts(page.posts);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "投稿の一覧を取得できませんでした");
    } finally {
      setListing(false);
    }
  }, []);

  // 選んだビジネスが変わったら取り直す。取得は外部（API）との同期なので effect に置く
  const locationName = location?.name ?? null;
  useEffect(() => {
    let alive = true;
    // 同期的な setState を避けるため、次のマイクロタスクで開始する
    void Promise.resolve().then(() => {
      if (alive && locationName) void loadPosts(locationName);
    });
    return () => {
      alive = false;
    };
  }, [locationName, loadPosts]);

  async function draft() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await request<PostsDraftResponse>("/api/posts/draft", {
        method: "POST",
        body: JSON.stringify({
          storeName: store?.name || location?.title || "",
          category: store?.category ?? "",
          topic,
          description: store?.description ?? "",
          reviews: [],
        }),
      });
      setSummary(res.draft);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "下書きを作れませんでした");
    } finally {
      setDrafting(false);
    }
  }

  async function submit() {
    if (!location) return;
    setPosting(true);
    setPostError(null);
    setPostMessage(null);
    try {
      const res = await request<PostsCreateResponse>("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          locationName: location.name,
          summary,
          action: settings.action,
          url: settings.action && actionNeedsUrl(settings.action) ? settings.actionUrl : "",
          photoUrl,
        }),
      });
      setPostMessage(
        res.post?.state === "LIVE"
          ? "投稿しました。Google 検索とマップの店舗情報に出ます。"
          : "投稿を送りました。Google の審査が終わると掲載されます（数分〜数時間）。",
      );
      setSummary("");
      setTopic("");
      setPhotoUrl("");
      void loadPosts(location.name);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "投稿できませんでした");
    } finally {
      setPosting(false);
    }
  }

  async function remove(postName: string) {
    if (!location) return;
    setListError(null);
    try {
      await request<void>("/api/posts", { method: "DELETE", body: JSON.stringify({ postName }) });
      void loadPosts(location.name);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "削除できませんでした");
    }
  }

  const tooLong = summary.length > LOCAL_POST_SUMMARY_MAX;

  return (
    <div className="space-y-6">
      <Callout tone="info" title="この機能でできること・できないこと">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Google ビジネス プロフィールの<strong>「最新情報」を投稿します</strong>。口コミ返信と同じ権限（ビジネス プロフィールの管理）で送るので、追加の連携は要りません。
          </li>
          <li>
            投稿は <strong>Google の審査を通ってから掲載されます</strong>（多くは数分〜数時間）。非承認のときは理由が Google の管理画面に出ます。
          </li>
          <li>
            イベント・特典の投稿、写真の直接アップロードにはまだ対応していません（写真は公開 URL を指定します）。Instagram・Facebook への同時配信も未対応です。
          </li>
        </ul>
      </Callout>

      <Card
        number={1}
        title="接続"
        description="Google ビジネス プロフィールを接続すると、この画面から投稿できます。口コミへの返信と同じ権限です。"
      >
        {statusError && (
          <Callout tone="fail" className="mb-3">
            {statusError}
          </Callout>
        )}
        {!status && !statusError && <p className="text-[13px] text-muted">状態を確認しています…</p>}
        {status && !status.authEnabled && <Callout tone="info">ログイン（Clerk）が無い環境では Google ビジネス プロフィールを接続できません。</Callout>}
        {status && status.authEnabled && !status.hasScope && (
          <div className="space-y-3">
            <Callout tone="info" title={status.connected ? "ビジネス プロフィールの権限がまだありません" : "Google アカウントが接続されていません"}>
              <p>
                「権限を追加」を押すと Google の確認画面が開きます。<strong>ビジネス プロフィールの管理</strong>の許可を求めるので、そのビジネスのオーナーまたは管理者の
                Google アカウントで許可してください。
              </p>
              <p className="mt-2">
                許可しても投稿できない場合は、Google 側の準備（Business Profile API の利用申請の承認と、Google Cloud での API の有効化）がまだです。
              </p>
            </Callout>
            <ConnectBusinessButton label={status.connected ? "Google にビジネス プロフィールの権限を追加する" : "Google アカウントを接続する"} />
          </div>
        )}
        {status && status.hasScope && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              接続中: <span className="font-bold break-all">{status.email ?? "Google アカウント"}</span>（ビジネス プロフィールの権限あり）
            </p>
            {status.locationsError && (
              <Callout tone="warn" title="ビジネス一覧を取得できませんでした">
                <p>{status.locationsError}</p>
                <p className="mt-1">承認・有効化が済んだら、この画面を開き直してください。</p>
              </Callout>
            )}
            {status.locations.length > 0 && (
              <Field label="投稿するビジネス" htmlFor="posts-location">
                <Select id="posts-location" value={location?.name ?? ""} onChange={(e) => setSettings({ ...settings, location: e.target.value })}>
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
      </Card>

      {canPost && (
        <>
          <Card number={2} title="投稿を書く" description="今回のネタを 1 行入れて下書きを作り、編集してから送ります。読まれるのは最初の 2〜3 行なので、1 行目に用件を書きます。">
            {status?.stores.length === 0 && (
              <Callout tone="info" className="mb-4">
                MEO の「Google マップ」で自社店舗を登録し、「掲載」で基本情報を決めると、AI の下書きが店舗の事実に沿ったものになります。
                <Link href="/tools/listings" className="ml-1 text-accent underline">
                  掲載の画面へ
                </Link>
              </Callout>
            )}
            <div className="space-y-4">
              <Field label="今回のネタ" htmlFor="posts-topic" hint={`新メニュー・季節の案内・休業のお知らせなど。${TOPIC_MAX} 文字まで`}>
                <Input
                  id="posts-topic"
                  value={topic}
                  maxLength={TOPIC_MAX}
                  placeholder="例: 10/1 から秋の限定メニューを始めます。平日夜は予約がおすすめ"
                  onChange={(e) => setTopic(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" onClick={draft} loading={drafting} disabled={!status?.aiEnabled}>
                  AI に下書きを作らせる
                </Button>
                {!status?.aiEnabled && <span className="text-[13px] text-muted">ANTHROPIC_API_KEY が未設定のため、下書きは手で書いてください。</span>}
              </div>
              {draftError && <Callout tone="fail">{draftError}</Callout>}

              <Field
                label="本文"
                htmlFor="posts-summary"
                hint={`${summary.length} / ${LOCAL_POST_SUMMARY_MAX} 文字（${LOCAL_POST_SUMMARY_RECOMMENDED} 文字以内が読まれやすい）`}
              >
                <Textarea id="posts-summary" rows={8} value={summary} maxLength={LOCAL_POST_SUMMARY_MAX} onChange={(e) => setSummary(e.target.value)} />
              </Field>

              <div className="grid gap-4 @lg:grid-cols-2">
                <Field label="ボタン" htmlFor="posts-action" hint="投稿の下に出るボタン。付けないことも選べます">
                  <Select
                    id="posts-action"
                    value={settings.action ?? ""}
                    onChange={(e) => setSettings({ ...settings, action: (e.target.value || null) as LocalPostAction | null })}
                  >
                    <option value="">付けない</option>
                    {LOCAL_POST_ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {LOCAL_POST_ACTION_LABELS[a]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {settings.action && actionNeedsUrl(settings.action) && (
                  <Field label="ボタンのリンク先" htmlFor="posts-action-url" hint="https:// で始まる URL">
                    <Input
                      id="posts-action-url"
                      value={settings.actionUrl}
                      maxLength={500}
                      placeholder="https://example.com/reserve"
                      onChange={(e) => setSettings({ ...settings, actionUrl: e.target.value })}
                    />
                  </Field>
                )}
              </div>

              <Field label="写真の URL（任意）" htmlFor="posts-photo" hint="公開されている画像の URL。Google が取得できる必要があります">
                <Input id="posts-photo" value={photoUrl} maxLength={500} placeholder="https://example.com/photo.jpg" onChange={(e) => setPhotoUrl(e.target.value)} />
              </Field>

              {postError && <Callout tone="fail">{postError}</Callout>}
              {postMessage && <Callout tone="pass">{postMessage}</Callout>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={submit} loading={posting} disabled={!summary.trim() || tooLong}>
                  Google に投稿する
                </Button>
                <span className="text-[13px] text-muted">送る前に内容をご確認ください。投稿したあとの修正は、削除して出し直しになります。</span>
              </div>
            </div>
          </Card>

          <Card
            number={3}
            title="これまでの投稿"
            description="Google が持っている投稿です（このアプリには保存しません）。"
            actions={
              location ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => void loadPosts(location.name)} loading={listing}>
                  更新
                </Button>
              ) : undefined
            }
          >
            {listError && (
              <Callout tone="fail" className="mb-3">
                {listError}
              </Callout>
            )}
            {listing && posts.length === 0 ? (
              <p className="text-[13px] text-muted">読み込んでいます…</p>
            ) : posts.length === 0 ? (
              <EmptyState title="まだ投稿がありません" description="上のカードで最初の投稿を作ってください。週 1 回の更新から始めるのがおすすめです。" />
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {posts.map((p) => (
                  <li key={p.name} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={STATE_TONE[p.state] ?? "neutral"}>{LOCAL_POST_STATE_LABELS[p.state] ?? p.state}</Badge>
                        {p.cta && <span className="text-[12px] text-muted">ボタン: {LOCAL_POST_ACTION_LABELS[p.cta.actionType as LocalPostAction] ?? p.cta.actionType}</span>}
                        {p.createdAt && <span className="text-[12px] text-muted">{formatDateTime(p.createdAt)}</span>}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{p.summary}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.searchUrl && (
                        <ButtonLink href={p.searchUrl} external size="sm" variant="ghost">
                          Google で見る
                        </ButtonLink>
                      )}
                      <Button type="button" size="sm" variant="ghost" onClick={() => void remove(p.name)}>
                        削除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
