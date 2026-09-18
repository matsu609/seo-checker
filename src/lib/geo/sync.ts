/**
 * AI 検索モニタリングのブランド（自社・競合）と検索キーワードを、設定（/settings）から同期する。
 *
 * 利用者の指示（2026-09-19）: ブランド・競合・キーワードは設定に 1 回入れれば全ツールが使う。
 * AI 検索モニタリングは Cron がサーバーだけで動くので geo_brands / geo_keywords の行が要る。
 * そこで「設定 → geo テーブル」の一方向同期にし、画面と Cron の直前に必ず通す。
 * プロンプト（geo_prompts）はこの機能だけのものなので同期の対象外。
 *
 * 決めごと:
 *   - 設定にホームページが無い（= 自社ブランドを作れない）ときは何もしない（既存の行も消さない）
 *   - 競合は表示名で突き合わせる。設定から消えた競合は geo からも消す
 *   - キーワードは文字列で突き合わせる。設定に無いものは geo からも消す
 *     （順位 / AIO を測るかの印は geo 側の行に残るので、同期で上書きしない）
 */
import { competitorBrandsOf, ownBrandOf, type BrandSpec, type SharedSettings } from "@/lib/settings/shared";
import { normalizedHash } from "./normalize";
import { deleteBrand, deleteKeyword, listBrands, listKeywords, saveBrand, saveKeyword } from "./store";
import type { GeoBrand, GeoKeyword } from "./types";

export interface GeoSyncPlan {
  create: { type: "own" | "competitor"; spec: BrandSpec }[];
  update: { id: string; type: "own" | "competitor"; spec: BrandSpec }[];
  remove: string[];
  keywordsCreate: string[];
  keywordsRemove: string[];
}

export const EMPTY_PLAN: GeoSyncPlan = { create: [], update: [], remove: [], keywordsCreate: [], keywordsRemove: [] };

function key(s: string): string {
  return s.trim().toLowerCase();
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameBrand(brand: GeoBrand, spec: BrandSpec): boolean {
  return brand.displayName === spec.displayName && sameList(brand.aliases, spec.aliases) && sameList(brand.domains, spec.domains);
}

/** 設定と geo の現状から、何を作り・直し・消すかを決める（純粋） */
export function planGeoSync(settings: SharedSettings, brands: readonly GeoBrand[], keywords: readonly GeoKeyword[]): GeoSyncPlan {
  const own = ownBrandOf(settings);
  if (!own) return EMPTY_PLAN;

  const plan: GeoSyncPlan = { create: [], update: [], remove: [], keywordsCreate: [], keywordsRemove: [] };

  // 自社: 1 件だけ。無ければ作る、あれば違うときだけ直す。2 件以上あれば 2 件目以降は消す
  const owns = brands.filter((b) => b.type === "own");
  if (owns.length === 0) plan.create.push({ type: "own", spec: own });
  else {
    if (!sameBrand(owns[0], own)) plan.update.push({ id: owns[0].id, type: "own", spec: own });
    for (const extra of owns.slice(1)) plan.remove.push(extra.id);
  }

  // 競合: 表示名で突き合わせ
  const wanted = competitorBrandsOf(settings);
  const existing = brands.filter((b) => b.type === "competitor");
  const matched = new Set<string>();
  for (const spec of wanted) {
    const hit = existing.find((b) => !matched.has(b.id) && key(b.displayName) === key(spec.displayName));
    if (!hit) {
      plan.create.push({ type: "competitor", spec });
      continue;
    }
    matched.add(hit.id);
    if (!sameBrand(hit, spec)) plan.update.push({ id: hit.id, type: "competitor", spec });
  }
  for (const b of existing) if (!matched.has(b.id)) plan.remove.push(b.id);

  // キーワード: 文字列で突き合わせ
  const wantedKeys = new Map(settings.keywords.map((k) => [key(k), k] as const));
  const seen = new Set<string>();
  for (const k of keywords) {
    const id = key(k.text);
    if (wantedKeys.has(id) && !seen.has(id)) seen.add(id);
    else plan.keywordsRemove.push(k.id);
  }
  for (const [id, text] of wantedKeys) if (!seen.has(id)) plan.keywordsCreate.push(text);

  return plan;
}

export function isEmptyPlan(plan: GeoSyncPlan): boolean {
  return plan.create.length === 0 && plan.update.length === 0 && plan.remove.length === 0 && plan.keywordsCreate.length === 0 && plan.keywordsRemove.length === 0;
}

/** 設定を geo テーブルに反映して、反映後のブランドとキーワードを返す */
export async function syncGeoFromSettings(userId: string, settings: SharedSettings): Promise<{ brands: GeoBrand[]; keywords: GeoKeyword[]; changed: boolean }> {
  const [brands, keywords] = await Promise.all([listBrands(userId), listKeywords(userId)]);
  const plan = planGeoSync(settings, brands, keywords);
  if (isEmptyPlan(plan)) return { brands, keywords, changed: false };

  for (const id of plan.remove) await deleteBrand(userId, id);
  for (const u of plan.update) await saveBrand(userId, { type: u.type, ...u.spec }, u.id);
  for (const c of plan.create) await saveBrand(userId, { type: c.type, ...c.spec });
  for (const id of plan.keywordsRemove) await deleteKeyword(userId, id);
  for (const text of plan.keywordsCreate) {
    await saveKeyword(userId, { text, normalizedHash: await normalizedHash(text), trackRank: true, trackAio: true });
  }
  const [nextBrands, nextKeywords] = await Promise.all([listBrands(userId), listKeywords(userId)]);
  return { brands: nextBrands, keywords: nextKeywords, changed: true };
}
