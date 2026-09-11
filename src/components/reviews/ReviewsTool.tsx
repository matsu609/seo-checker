"use client";

/**
 * 口コミ支援（アンケート QR）。
 *
 * 1. アンケートを選ぶ / 作る（業種テンプレート。MEO の登録店舗があれば Google の投稿先を引く）
 * 2. アンケートの設定（質問・AI 下書き・低評価の基準）
 * 3. QR コードの発行（店舗ごと・置き場所ごと。店舗を紐づけると来店客の画面と投稿先がその店舗になる）
 * 4. 集計
 * 5. 回答一覧（低評価を先頭に。対応メモ）
 *
 * データはすべてサーバー（Supabase）。画面は API を叩いて表示するだけ。
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ReviewsChannelResponse } from "@/app/api/reviews/forms/[id]/channels/route";
import type { ReviewsFormResponse } from "@/app/api/reviews/forms/[id]/route";
import type { ReviewsFormCreateResponse, ReviewsFormsResponse, ReviewsStoreOption } from "@/app/api/reviews/forms/route";
import type { ReviewsResponseUpdateResponse } from "@/app/api/reviews/responses/[id]/route";
import type { ReviewsResponsesResponse } from "@/app/api/reviews/responses/route";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Field";
import type { ReviewChannel, ReviewForm } from "@/lib/reviews/forms";
import type { ReviewMetrics } from "@/lib/reviews/metrics";
import { INDUSTRIES, INDUSTRY_LABELS, STORE_NAME_MAX, TITLE_MAX, type Industry } from "@/lib/reviews/questions";
import type { ResponseStatus, ReviewResponse } from "@/lib/reviews/responses";
import { ChannelsCard, type NewChannelInput } from "./ChannelsCard";
import { FormEditor } from "./FormEditor";
import { MetricsCard } from "./MetricsCard";
import { EMPTY_FILTER, ResponsesCard, type ResponsesFilter } from "./ResponsesCard";

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

interface FormsState {
  forms: ReviewForm[];
  stores: ReviewsStoreOption[];
  loading: boolean;
  error: string | null;
}

interface DetailState {
  channels: ReviewChannel[];
  responses: ReviewResponse[];
  metrics: ReviewMetrics | null;
  limit: number;
  loading: boolean;
  error: string | null;
}

const EMPTY_DETAIL: DetailState = { channels: [], responses: [], metrics: null, limit: 0, loading: false, error: null };

export function ReviewsTool() {
  const [forms, setForms] = useState<FormsState>({ forms: [], stores: [], loading: true, error: null });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>(EMPTY_DETAIL);
  const [filter, setFilter] = useState<ResponsesFilter>(EMPTY_FILTER);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("ご来店アンケート");
  const [newStore, setNewStore] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [newIndustry, setNewIndustry] = useState<Industry>("restaurant");
  const [createError, setCreateError] = useState<string | null>(null);

  const current = forms.forms.find((f) => f.id === currentId) ?? forms.forms[0] ?? null;

  const loadForms = useCallback(async () => {
    setForms((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await request<ReviewsFormsResponse>("/api/reviews/forms");
      setForms({ forms: data.forms, stores: data.stores, loading: false, error: null });
    } catch (err) {
      setForms((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "読み込みに失敗しました" }));
    }
  }, []);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  const loadDetail = useCallback(async (formId: string, f: ResponsesFilter) => {
    setDetail((d) => ({ ...d, loading: true, error: null }));
    const params = new URLSearchParams({ formId });
    if (f.status) params.set("status", f.status);
    if (f.lowOnly) params.set("low", "1");
    if (f.channelId) params.set("channel", f.channelId);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    try {
      const [formRes, respRes] = await Promise.all([
        request<ReviewsFormResponse>(`/api/reviews/forms/${formId}`),
        request<ReviewsResponsesResponse>(`/api/reviews/responses?${params.toString()}`),
      ]);
      setDetail({ channels: formRes.channels, responses: respRes.responses, metrics: respRes.metrics, limit: respRes.limit, loading: false, error: null });
    } catch (err) {
      setDetail((d) => ({ ...d, loading: false, error: err instanceof Error ? err.message : "読み込みに失敗しました" }));
    }
  }, []);

  useEffect(() => {
    if (!current) {
      setDetail(EMPTY_DETAIL);
      return;
    }
    void loadDetail(current.id, filter);
  }, [current?.id, filter, loadDetail]); // eslint-disable-line react-hooks/exhaustive-deps -- current の中身ではなく id で判定する

  function replaceForm(form: ReviewForm) {
    setForms((s) => ({ ...s, forms: s.forms.map((f) => (f.id === form.id ? form : f)) }));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    const storeName = newStore.trim();
    if (!title || !storeName) {
      setCreateError("アンケートの名前と店名を入力してください。");
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const body: { title: string; storeName: string; industry: Industry; placeId?: string } = { title, storeName, industry: newIndustry };
      if (newPlace.trim()) body.placeId = newPlace.trim();
      const data = await request<ReviewsFormCreateResponse>("/api/reviews/forms", { method: "POST", body: JSON.stringify(body) });
      setForms((s) => ({ ...s, forms: [...s.forms, data.form] }));
      setCurrentId(data.form.id);
      setNewStore("");
      setNewPlace("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setCreating(false);
    }
  }

  const onSaveForm: React.ComponentProps<typeof FormEditor>["onSave"] = async (patch) => {
    if (!current) return;
    const data = await request<ReviewsFormResponse>(`/api/reviews/forms/${current.id}`, { method: "PUT", body: JSON.stringify(patch) });
    replaceForm(data.form);
    setDetail((d) => ({ ...d, channels: data.channels }));
  };

  async function onDeleteForm() {
    if (!current) return;
    await request<void>(`/api/reviews/forms/${current.id}`, { method: "DELETE" });
    setForms((s) => ({ ...s, forms: s.forms.filter((f) => f.id !== current.id) }));
    setCurrentId(null);
  }

  async function onAddChannel(input: NewChannelInput) {
    if (!current) return;
    const data = await request<ReviewsChannelResponse>(`/api/reviews/forms/${current.id}/channels`, { method: "POST", body: JSON.stringify(input) });
    setDetail((d) => ({ ...d, channels: [...d.channels, ...data.channels] }));
  }

  async function onBulkChannels() {
    if (!current) return;
    const data = await request<ReviewsChannelResponse>(`/api/reviews/forms/${current.id}/channels`, { method: "POST", body: JSON.stringify({ bulk: "stores" }) });
    setDetail((d) => ({ ...d, channels: [...d.channels, ...data.channels] }));
  }

  async function onRemoveChannel(channelId: string) {
    if (!current) return;
    await request<void>(`/api/reviews/forms/${current.id}/channels?channel=${channelId}`, { method: "DELETE" });
    setDetail((d) => ({ ...d, channels: d.channels.filter((c) => c.id !== channelId) }));
  }

  async function onUpdateResponse(id: string, patch: { status?: ResponseStatus; note?: string | null }) {
    const data = await request<ReviewsResponseUpdateResponse>(`/api/reviews/responses/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setDetail((d) => ({ ...d, responses: d.responses.map((r) => (r.id === id ? data.response : r)) }));
    if (current) void loadDetail(current.id, filter);
  }

  async function onDeleteResponse(id: string) {
    await request<void>(`/api/reviews/responses/${id}`, { method: "DELETE" });
    if (current) void loadDetail(current.id, filter);
  }

  const filtered = Boolean(filter.status || filter.lowOnly || filter.channelId || filter.from || filter.to);
  const lowOpen = detail.metrics?.lowOpen ?? 0;

  return (
    <div className="space-y-6">
      <Callout tone="info" title="この機能の約束ごと（Google のポリシーと景品表示法に沿うため）">
        <ul className="list-disc space-y-1 pl-5">
          <li>「Google マップに投稿する」ボタンは、評価の高低に関わらず全員に同じように出ます。低評価の方には「お店に直接伝える」が並んで出ます（隠しません）。</li>
          <li>下書きは来店客が必ず確認・編集できる状態で提示されます。店舗が投稿文を固定したり、投稿を強制したりする機能はありません。</li>
          <li>口コミの投稿を条件にした特典（割引・無料提供など）は付けないでください。謝礼を出す場合は「アンケートへの回答」に対するものとして切り分け、投稿とは無関係であることを明示してください。</li>
          <li>「含めたい語」は下書きの参考です。回答の内容と自然につながるときだけ使われ、無理には入りません。</li>
        </ul>
      </Callout>
      <Card
        number={1}
        title="アンケート"
        description="アンケート（質問と AI の設定）を作ります。複数店舗で同じ質問を使うなら 1 つ作り、「3. QR コード」で店舗ごとの QR を発行してください。店舗ごとに質問を変えたいときはアンケートを分けます。"
      >
        {forms.error && (
          <Callout tone="fail" className="mb-4">
            {forms.error}
          </Callout>
        )}
        {forms.forms.length > 0 && (
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <Field label="表示するアンケート" htmlFor="form-select">
              <Select id="form-select" value={current?.id ?? ""} onChange={(e) => setCurrentId(e.target.value)}>
                {forms.forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.storeName} — {f.title}
                    {f.active ? "" : "（停止中）"}
                  </option>
                ))}
              </Select>
            </Field>
            {lowOpen > 0 && (
              <div className="flex items-end pb-1">
                <Callout tone="warn" className="py-2">
                  未対応の低評価が {lowOpen} 件あります。「5. 回答一覧」で確認してください。
                </Callout>
              </div>
            )}
          </div>
        )}
        <form onSubmit={onCreate} className="rounded-sm border border-line bg-surface p-4">
          <p className="text-sm font-bold text-ink">{forms.forms.length === 0 ? "最初のアンケートを作る" : "新しいアンケートを作る"}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Field label="アンケートの名前" htmlFor="new-title">
              <Input id="new-title" maxLength={TITLE_MAX} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </Field>
            <Field label="店名" htmlFor="new-store">
              <Input id="new-store" maxLength={STORE_NAME_MAX} value={newStore} onChange={(e) => setNewStore(e.target.value)} placeholder="例: 〇〇食堂 駅前店" />
            </Field>
            <Field label="業種（質問テンプレート）" htmlFor="new-industry">
              <Select id="new-industry" value={newIndustry} onChange={(e) => setNewIndustry(e.target.value as Industry)}>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {INDUSTRY_LABELS[i]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Google マップの店舗（任意）"
              htmlFor="new-place"
              hint={forms.stores.length > 0 ? "MEO に登録した自社店舗から選ぶか、Place ID を入力" : "Place ID を入力（MEO に自社店舗を登録すると選べます）"}
            >
              {forms.stores.length > 0 ? (
                <Select
                  id="new-place"
                  value={newPlace}
                  onChange={(e) => {
                    setNewPlace(e.target.value);
                    const s = forms.stores.find((x) => x.placeId === e.target.value);
                    if (s && !newStore.trim()) setNewStore(s.name);
                  }}
                >
                  <option value="">選ばない</option>
                  {forms.stores.map((s) => (
                    <option key={s.placeId} value={s.placeId}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input id="new-place" value={newPlace} onChange={(e) => setNewPlace(e.target.value)} placeholder="ChIJ…" />
              )}
            </Field>
          </div>
          {createError && (
            <Callout tone="fail" className="mt-3">
              {createError}
            </Callout>
          )}
          <div className="mt-3">
            <Button type="submit" loading={creating} disabled={forms.loading}>
              作成する
            </Button>
          </div>
        </form>
        {forms.forms.length === 0 && !forms.loading && !forms.error && (
          <EmptyState className="mt-4" title="アンケートはまだありません" description="上のフォームから作ると、質問の編集・QR の発行・回答の確認ができるようになります。" />
        )}
      </Card>

      {current && (
        <>
          <FormEditor number={2} form={current} onSave={onSaveForm} onDelete={onDeleteForm} />
          <ChannelsCard number={3} form={current} channels={detail.channels} stores={forms.stores} onAdd={onAddChannel} onBulkFromStores={onBulkChannels} onRemove={onRemoveChannel} />
          {detail.metrics && <MetricsCard number={4} metrics={detail.metrics} limit={detail.limit} filtered={filtered} />}
          <ResponsesCard
            number={5}
            form={current}
            channels={detail.channels}
            responses={detail.responses}
            loading={detail.loading}
            error={detail.error}
            filter={filter}
            onFilterChange={setFilter}
            onUpdate={onUpdateResponse}
            onDelete={onDeleteResponse}
          />
        </>
      )}
    </div>
  );
}
