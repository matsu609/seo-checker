/**
 * アンケート・QR・回答の保存。
 * 店舗側の問い合わせは user_id で、来店客側の更新は edit_token で必ず絞られていること。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addChannel,
  createForm,
  deleteForm,
  fromFormRow,
  getForm,
  getPublicForm,
  isValidSlug,
  listForms,
  newChannelCode,
  newSlug,
  toPublicForm,
  updateForm,
  writeReviewUrlFor,
} from "../forms";
import { fromResponseRow, insertResponse, listResponses, markReviewClicked, newEditToken, saveDirectMessage, updateResponse } from "../responses";

const FORM_ROW = {
  id: "0b2f0b8e-0000-4000-8000-000000000001",
  user_id: "user_1",
  slug: "abcDEF123456",
  title: "ご来店アンケート",
  store_name: "〇〇食堂",
  place_id: "ChIJxxxxxxxxxx",
  write_review_url: "https://search.google.com/local/writereview?placeid=ChIJxxxxxxxxxx",
  questions: [{ id: "rating01", type: "rating", label: "満足度", options: [], required: true }],
  settings: { industry: "restaurant", tone: "polite", keywords: ["〇〇食堂"], lowRatingMax: 2 },
  active: true,
  created_at: "2026-09-11T00:00:00Z",
  updated_at: "2026-09-11T00:00:00Z",
};

const CHANNEL_ROW = { id: "0b2f0b8e-0000-4000-8000-000000000002", form_id: FORM_ROW.id, code: "abc234", label: "テーブル 3", created_at: "2026-09-11T00:00:00Z" };

const RESPONSE_ROW = {
  id: "0b2f0b8e-0000-4000-8000-000000000003",
  form_id: FORM_ROW.id,
  channel_id: CHANNEL_ROW.id,
  rating: 2,
  answers: { rating01: 2 },
  is_low: true,
  draft: "下書き",
  draft_source: "ai",
  draft_final: null,
  direct_message: null,
  direct_contact: null,
  clicked_review_at: null,
  clicked_direct_at: null,
  status: "open",
  note: null,
  handled_at: null,
  created_at: "2026-09-11T01:00:00Z",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
  fetchMock = vi.fn(async () => Response.json([FORM_ROW]));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const url = (i = 0) => fetchMock.mock.calls[i]![0] as string;
const init = (i = 0) => fetchMock.mock.calls[i]![1] as RequestInit;
const body = (i = 0) => JSON.parse(init(i).body as string) as Record<string, unknown>;

describe("行の変換", () => {
  it("アンケートの行 → 形。設定が壊れていれば例外", () => {
    const form = fromFormRow(FORM_ROW);
    expect(form).toMatchObject({ slug: "abcDEF123456", storeName: "〇〇食堂", settings: { tone: "polite", lowRatingMax: 2 }, active: true });
    expect(() => fromFormRow({ ...FORM_ROW, questions: [] })).toThrow();
    // 来店客に返す形には投稿 URL の実体・キーワード・トーンが入らない
    const pub = toPublicForm(form);
    expect(pub).toEqual({
      slug: "abcDEF123456",
      title: "ご来店アンケート",
      storeName: "〇〇食堂",
      questions: form.questions,
      lowRatingMax: 2,
      hasWriteReviewUrl: true,
    });
    expect(JSON.stringify(pub)).not.toContain("writereview");
  });

  it("回答の行 → 形。知らない状態は open、壊れた回答は空", () => {
    expect(fromResponseRow(RESPONSE_ROW)).toMatchObject({ isLow: true, draftSource: "ai", status: "open", answers: { rating01: 2 } });
    expect(fromResponseRow({ ...RESPONSE_ROW, status: "weird", draft_source: "x", answers: "broken" })).toMatchObject({ status: "open", draftSource: "none", answers: {} });
  });

  it("slug・コード・トークン・投稿 URL", () => {
    expect(isValidSlug(newSlug())).toBe(true);
    expect(newChannelCode()).toMatch(/^[a-z0-9]{6}$/);
    expect(newEditToken()).toMatch(/^[0-9a-f]{32}$/);
    expect(writeReviewUrlFor("ChIJ abc")).toBe("https://search.google.com/local/writereview?placeid=ChIJ%20abc");
    expect(isValidSlug("../x")).toBe(false);
  });
});

describe("店舗側の問い合わせは user_id で絞る", () => {
  it("一覧・1 件・更新・削除", async () => {
    await listForms("user_1");
    expect(url(0)).toContain("review_forms?");
    expect(url(0)).toContain("user_id=eq.user_1");

    await getForm("user_1", FORM_ROW.id);
    expect(url(1)).toContain("user_id=eq.user_1");
    expect(url(1)).toContain(`id=eq.${FORM_ROW.id}`);

    await updateForm("user_1", FORM_ROW.id, { title: "新しい名前", active: false });
    expect(init(2).method).toBe("PATCH");
    expect(url(2)).toContain("user_id=eq.user_1");
    expect(body(2)).toMatchObject({ title: "新しい名前", active: false });
    expect(body(2)).not.toHaveProperty("questions");

    fetchMock.mockResolvedValueOnce(Response.json([{ id: FORM_ROW.id }]));
    await expect(deleteForm("user_1", FORM_ROW.id)).resolves.toBe(true);
    expect(init(3).method).toBe("DELETE");
    expect(url(3)).toContain("user_id=eq.user_1");
  });

  it("作成は user_id と slug を入れる", async () => {
    const form = fromFormRow(FORM_ROW);
    await createForm("user_1", { title: form.title, storeName: form.storeName, placeId: form.placeId, writeReviewUrl: form.writeReviewUrl, questions: form.questions, settings: form.settings }, "slug12345678");
    expect(init().method).toBe("POST");
    expect(body()).toMatchObject({ user_id: "user_1", slug: "slug12345678", active: true });
  });

  it("来店客向けは slug と active で引き、user_id は使わない", async () => {
    await getPublicForm("abcDEF123456");
    expect(url()).toContain("slug=eq.abcDEF123456");
    expect(url()).toContain("active=is.true");
    expect(url()).not.toContain("user_id=eq");
    // 形が不正な slug は問い合わせない
    fetchMock.mockClear();
    await expect(getPublicForm("../etc")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("QR の発行単位", () => {
  it("form_id を付けて登録する", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([CHANNEL_ROW]));
    const ch = await addChannel(FORM_ROW.id, "テーブル 3", "abc234");
    expect(ch.label).toBe("テーブル 3");
    expect(body()).toMatchObject({ form_id: FORM_ROW.id, code: "abc234" });
  });
});

describe("回答", () => {
  it("保存は form_id・edit_token・status=open を入れる", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([RESPONSE_ROW]));
    const token = newEditToken();
    await insertResponse({ formId: FORM_ROW.id, channelId: CHANNEL_ROW.id, rating: 2, answers: { rating01: 2 }, isLow: true, draft: "下書き", draftSource: "ai", editToken: token });
    expect(body()).toMatchObject({ form_id: FORM_ROW.id, edit_token: token, status: "open", is_low: true });
  });

  it("一覧は form_id で絞り、絞り込みを付ける", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([RESPONSE_ROW]));
    await listResponses(FORM_ROW.id, { status: "open", lowOnly: true, channelId: CHANNEL_ROW.id, from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T00:00:00.000Z" });
    expect(url()).toContain(`form_id=eq.${FORM_ROW.id}`);
    expect(url()).toContain("status=eq.open");
    expect(url()).toContain("is_low=is.true");
    expect(url()).toContain(`channel_id=eq.${CHANNEL_ROW.id}`);
    expect(url()).toContain("created_at=gte.");
    expect(url()).toContain("created_at=lt.");
    expect(url()).toContain("order=created_at.desc");
  });

  it("来店客側の更新は id と edit_token の両方で絞る。トークンの形が不正なら問い合わせない", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([RESPONSE_ROW]));
    const token = newEditToken();
    await markReviewClicked(FORM_ROW.id, RESPONSE_ROW.id, token, "投稿した本文");
    expect(init().method).toBe("PATCH");
    expect(url()).toContain(`edit_token=eq.${token}`);
    expect(url()).toContain(`id=eq.${RESPONSE_ROW.id}`);
    expect(body()).toMatchObject({ draft_final: "投稿した本文" });

    fetchMock.mockResolvedValueOnce(Response.json([RESPONSE_ROW]));
    await saveDirectMessage(FORM_ROW.id, RESPONSE_ROW.id, token, "直接伝えたい", null);
    expect(body(1)).toMatchObject({ direct_message: "直接伝えたい", direct_contact: null });

    fetchMock.mockClear();
    await expect(markReviewClicked(FORM_ROW.id, RESPONSE_ROW.id, "bad", null)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("店舗側の更新は form_id で絞り、対応済みにすると handled_at が入る", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([RESPONSE_ROW]));
    await updateResponse(FORM_ROW.id, RESPONSE_ROW.id, { status: "done", note: "電話で謝罪" }, new Date("2026-09-12T00:00:00Z"));
    expect(url()).toContain(`form_id=eq.${FORM_ROW.id}`);
    expect(body()).toEqual({ status: "done", handled_at: "2026-09-12T00:00:00.000Z", note: "電話で謝罪" });
    await expect(updateResponse(FORM_ROW.id, RESPONSE_ROW.id, {})).resolves.toBeNull();
  });
});
