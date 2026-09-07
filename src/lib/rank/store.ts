/**
 * 順位計測のブラウザ側ストア（localStorage + zod）。
 *
 * サーバーは状態を持たないので、キーワード登録・グループ・計測履歴はすべてここ。
 * SERPAPI_KEY が無い環境でも「登録だけ先に済ませる」ことができるよう、
 * 計測とは独立して読み書きできるようにしてある。
 */
import { z } from "zod";
import { createStore, newId } from "@/lib/store";
import { classifyAio, dateKey, type AioObservation } from "./classify";
import type { RankMeasurement, SerpDevice } from "./types";

export const DEVICES: readonly SerpDevice[] = ["desktop", "mobile"];

export const DEVICE_LABELS: Record<SerpDevice, string> = {
  desktop: "PC",
  mobile: "スマホ",
};

/** 1 キーワードあたりに残す履歴の上限（localStorage の容量を守る） */
export const MAX_SNAPSHOTS_PER_KEYWORD = 180;

const DeviceSchema = z.enum(["desktop", "mobile"]);

export const RankGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

export const RankKeywordSchema = z.object({
  id: z.string().min(1),
  /** プロジェクト（自社ドメイン）ごとに分ける。未選択のときは "" */
  projectId: z.string(),
  keyword: z.string(),
  device: DeviceSchema,
  /** 例: "Tokyo, Japan" */
  location: z.string().optional(),
  /** 狙っているランディングページ */
  targetUrl: z.string().optional(),
  groupId: z.string().optional(),
  /** 月間検索数（外部データが無ければ空欄のまま） */
  monthlyVolume: z.number().nullable().optional(),
  createdAt: z.string(),
});

export const AioReferenceSchema = z.object({
  url: z.string(),
  title: z.string(),
  domain: z.string(),
});

export const AioSnapshotSchema = z.object({
  present: z.boolean(),
  selfCited: z.boolean(),
  competitorCited: z.boolean(),
  references: z.array(AioReferenceSchema),
  /** AIO は出ていたが本文・引用を取得できなかった（未取得。集計の分母から外す） */
  unavailable: z.boolean().optional(),
  citedCompetitors: z.array(z.string()).optional(),
  text: z.string().optional(),
});

export const CompetitorRankSchema = z.object({
  domain: z.string(),
  rank: z.number().nullable(),
  url: z.string().nullable(),
  title: z.string().nullable(),
});

export const RankSnapshotSchema = z.object({
  keywordId: z.string().min(1),
  /** YYYY-MM-DD */
  takenOn: z.string(),
  /** 取得時刻（同じ日に取り直したときの表示用） */
  measuredAt: z.string(),
  rank: z.number().nullable(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  competitors: z.array(CompetitorRankSchema),
  aiOverview: AioSnapshotSchema,
  features: z.array(z.string()),
});

export type RankGroup = z.infer<typeof RankGroupSchema>;
export type RankKeyword = z.infer<typeof RankKeywordSchema>;
export type RankSnapshot = z.infer<typeof RankSnapshotSchema>;

export const rankGroupsStore = createStore<RankGroup[]>("rankGroups", z.array(RankGroupSchema), []);
export const rankKeywordsStore = createStore<RankKeyword[]>("rankKeywords", z.array(RankKeywordSchema), []);
export const rankSnapshotsStore = createStore<RankSnapshot[]>("rankSnapshots", z.array(RankSnapshotSchema), []);

export interface RankKeywordInput {
  projectId: string;
  keyword: string;
  device?: SerpDevice;
  location?: string;
  targetUrl?: string;
  groupId?: string;
  monthlyVolume?: number | null;
}

/** 入力からキーワードを 1 件作る（保存はしない。テストしやすいよう分けてある） */
export function buildKeyword(input: RankKeywordInput, now = new Date()): RankKeyword {
  return {
    id: newId(),
    projectId: input.projectId,
    keyword: input.keyword.trim(),
    device: input.device ?? "desktop",
    ...(input.location?.trim() ? { location: input.location.trim() } : {}),
    ...(input.targetUrl?.trim() ? { targetUrl: input.targetUrl.trim() } : {}),
    ...(input.groupId ? { groupId: input.groupId } : {}),
    ...(input.monthlyVolume === undefined ? {} : { monthlyVolume: input.monthlyVolume }),
    createdAt: now.toISOString(),
  };
}

/** 同じプロジェクト内でキーワード + デバイスが重複していないか */
export function isDuplicateKeyword(
  keywords: readonly RankKeyword[],
  projectId: string,
  keyword: string,
  device: SerpDevice,
): boolean {
  const k = keyword.trim();
  return keywords.some((x) => x.projectId === projectId && x.keyword === k && x.device === device);
}

export function addKeyword(input: RankKeywordInput): RankKeyword | null {
  const keyword = input.keyword.trim();
  if (!keyword) return null;
  const device = input.device ?? "desktop";
  if (isDuplicateKeyword(rankKeywordsStore.get(), input.projectId, keyword, device)) return null;
  const created = buildKeyword({ ...input, keyword, device });
  rankKeywordsStore.update((prev) => [...prev, created]);
  return created;
}

/** 改行・カンマ区切りのまとめ登録。登録できたものだけを返す */
export function addKeywords(lines: readonly string[], base: Omit<RankKeywordInput, "keyword">): RankKeyword[] {
  const out: RankKeyword[] = [];
  for (const line of lines) {
    const created = addKeyword({ ...base, keyword: line });
    if (created) out.push(created);
  }
  return out;
}

export function updateKeyword(id: string, patch: Partial<Omit<RankKeyword, "id" | "createdAt">>): void {
  rankKeywordsStore.update((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
}

export function removeKeyword(id: string): void {
  rankKeywordsStore.update((prev) => prev.filter((k) => k.id !== id));
  rankSnapshotsStore.update((prev) => prev.filter((s) => s.keywordId !== id));
}

export function addGroup(name: string): RankGroup | null {
  const n = name.trim();
  if (!n) return null;
  const existing = rankGroupsStore.get().find((g) => g.name === n);
  if (existing) return existing;
  const group: RankGroup = { id: newId(), name: n };
  rankGroupsStore.update((prev) => [...prev, group]);
  return group;
}

export function removeGroup(id: string): void {
  rankGroupsStore.update((prev) => prev.filter((g) => g.id !== id));
  rankKeywordsStore.update((prev) =>
    prev.map((k) => {
      if (k.groupId !== id) return k;
      const next = { ...k };
      delete next.groupId;
      return next;
    }),
  );
}

/** 計測結果 -> 保存するスナップショット */
export function toSnapshot(keywordId: string, m: RankMeasurement, takenOn = dateKey()): RankSnapshot {
  return {
    keywordId,
    takenOn,
    measuredAt: m.fetchedAt,
    rank: m.rank,
    url: m.url,
    title: m.title,
    competitors: m.competitors,
    aiOverview: {
      present: m.aiOverview.present,
      selfCited: m.aiOverview.selfCited,
      competitorCited: m.aiOverview.competitorCited,
      references: m.aiOverview.references,
      ...(m.aiOverview.citedCompetitors ? { citedCompetitors: m.aiOverview.citedCompetitors } : {}),
      ...(m.aiOverview.text ? { text: m.aiOverview.text } : {}),
    },
    features: [...m.features],
  };
}

/**
 * スナップショットを追加する（同じキーワード・同じ日は後勝ちで置き換え）。
 *
 * 1 キーワードあたり MAX_SNAPSHOTS_PER_KEYWORD 件を超えたら古い順に捨てる。
 * AIO 本文は 1 件で数千文字あり、履歴の分だけ localStorage を食うので
 * 最新の 1 件だけ残す（過去の本文が要る分析は AIO 頻出トピック側が持つ）。
 */
export function mergeSnapshots(
  prev: readonly RankSnapshot[],
  incoming: readonly RankSnapshot[],
): RankSnapshot[] {
  const map = new Map<string, RankSnapshot>();
  for (const s of prev) map.set(`${s.keywordId} ${s.takenOn}`, s);
  for (const s of incoming) map.set(`${s.keywordId} ${s.takenOn}`, s);
  const byKeyword = new Map<string, RankSnapshot[]>();
  for (const s of map.values()) {
    const list = byKeyword.get(s.keywordId) ?? [];
    list.push(s);
    byKeyword.set(s.keywordId, list);
  }
  const out: RankSnapshot[] = [];
  for (const list of byKeyword.values()) {
    list.sort((a, b) => a.takenOn.localeCompare(b.takenOn));
    const kept = list.slice(-MAX_SNAPSHOTS_PER_KEYWORD);
    kept.forEach((s, i) => {
      if (i === kept.length - 1 || !s.aiOverview.text) return;
      const aio = { ...s.aiOverview };
      delete aio.text;
      kept[i] = { ...s, aiOverview: aio };
    });
    out.push(...kept);
  }
  return out.sort((a, b) => a.takenOn.localeCompare(b.takenOn) || a.keywordId.localeCompare(b.keywordId));
}

export function saveSnapshots(incoming: readonly RankSnapshot[]): void {
  if (incoming.length === 0) return;
  rankSnapshotsStore.update((prev) => mergeSnapshots(prev, incoming));
}

/** キーワードごとの履歴（古い順） */
export function snapshotsFor(snapshots: readonly RankSnapshot[], keywordId: string): RankSnapshot[] {
  return snapshots
    .filter((s) => s.keywordId === keywordId)
    .sort((a, b) => a.takenOn.localeCompare(b.takenOn));
}

/**
 * 5 区分の時系列に渡す形へ変換する。
 * 取得できなかった観測（classifyAio が null）は落とし、その日は「未取得」として
 * 分母から外れるようにする（実装ガイド §5.1）。
 */
export function toObservations(snapshots: readonly RankSnapshot[]): AioObservation[] {
  const out: AioObservation[] = [];
  for (const s of snapshots) {
    const aioClass = classifyAio(s.aiOverview);
    if (!aioClass) continue;
    out.push({ keywordId: s.keywordId, takenOn: s.takenOn, aioClass });
  }
  return out;
}

/** プロジェクト・グループでの絞り込み */
export function filterKeywords(
  keywords: readonly RankKeyword[],
  options: { projectId?: string | null; groupId?: string | null } = {},
): RankKeyword[] {
  return keywords.filter((k) => {
    if (options.projectId && k.projectId !== options.projectId) return false;
    if (options.groupId && k.groupId !== options.groupId) return false;
    return true;
  });
}
