/**
 * 「設定」に集約した基本情報を、各ツールが同じ形で読むための純粋な関数。
 *
 * 利用者の指示（2026-09-19）: SEO・MEO・AIO で同じ基本設定を何度も入力させない。
 * 設定（/settings）に集約し、各ツールは細かい変更だけを持つ。
 *
 * 集約する項目とその置き場所:
 *   - 会社・店舗の基本情報（会社名・担当者名・電話・店舗の種類・所在地・地域） … Clerk の lead（登録時のデータ）
 *   - ホームページ（URL・サイト名・ブランドの表記ゆれ）と競合                     … projects ストア
 *   - 対策キーワード                                                             … rankKeywords ストア（順位計測と共通）
 *
 * ブラウザ側のストアはサーバー（user_stores）にも写しがあるので、ここはブラウザでもサーバーでも
 * 同じ関数で読める（サーバーは src/lib/settings/server.ts が user_stores から組み立てる）。
 */
import { z } from "zod";
import type { LeadProfile } from "@/lib/free/lead";
import { ProjectsSchema, resolveCurrentProject, type Project } from "@/lib/store/projects";

/** ストア名（createStore の第 1 引数と一致させる） */
export const PROJECTS_STORE = "projects";
export const CURRENT_PROJECT_STORE = "currentProjectId";
export const RANK_KEYWORDS_STORE = "rankKeywords";

/** 順位計測のキーワードのうち、ここで使う列だけ（rank/store.ts の RankKeywordSchema と互換） */
const KeywordRowSchema = z.object({ projectId: z.string(), keyword: z.string() }).passthrough();

export interface SharedSettings {
  lead: LeadProfile | null;
  project: Project | null;
  /** 現在のホームページに登録した対策キーワード（重複なし・登録順） */
  keywords: string[];
}

export const EMPTY_SHARED_SETTINGS: SharedSettings = { lead: null, project: null, keywords: [] };

/** user_stores の name → value（またはブラウザの全ストア）から組み立てる */
export function sharedSettingsFromStores(stores: Record<string, unknown>, lead: LeadProfile | null): SharedSettings {
  const projects = ProjectsSchema.safeParse(stores[PROJECTS_STORE]);
  const currentId = z.string().nullable().safeParse(stores[CURRENT_PROJECT_STORE]);
  const project = projects.success ? resolveCurrentProject(projects.data, currentId.success ? currentId.data : null) : null;
  return { lead, project, keywords: project ? keywordsForProject(stores[RANK_KEYWORDS_STORE], project.id) : [] };
}

/** 順位計測のキーワード一覧から、そのホームページのキーワード文字列を重複なしで取り出す */
export function keywordsForProject(rows: unknown, projectId: string): string[] {
  const parsed = z.array(KeywordRowSchema).safeParse(rows);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of parsed.data) {
    if (row.projectId !== projectId) continue;
    const k = row.keyword.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** AI 検索モニタリングなどが使う「ブランド」の形（自社・競合とも同じ） */
export interface BrandSpec {
  displayName: string;
  aliases: string[];
  domains: string[];
}

/** 会社名（屋号）。ホームページのサイト名 → 登録時の会社名 → ドメインの順で決める */
export function businessName(settings: SharedSettings): string {
  return settings.project?.name.trim() || settings.lead?.company.trim() || settings.project?.domain || "";
}

function uniq(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * 自社ブランド。ホームページが未登録なら null（ドメインが無いと引用判定ができない）。
 * 別名にはホームページの表記ゆれに加えて、登録時の会社名がサイト名と違えばそれも足す。
 */
export function ownBrandOf(settings: SharedSettings): BrandSpec | null {
  const project = settings.project;
  if (!project || !project.domain) return null;
  const displayName = businessName(settings);
  const company = settings.lead?.company.trim() ?? "";
  return {
    displayName,
    aliases: uniq([...project.brandAliases, ...(company && company !== displayName ? [company] : [])]),
    domains: uniq([project.domain]),
  };
}

/** 競合ブランド（設定の競合サイトをそのまま）。名前が空のものはドメインを名前にする */
export function competitorBrandsOf(settings: SharedSettings): BrandSpec[] {
  const project = settings.project;
  if (!project) return [];
  const out: BrandSpec[] = [];
  for (const c of project.competitors) {
    const domains = uniq(c.domains);
    const displayName = c.name.trim() || domains[0] || "";
    if (!displayName) continue;
    out.push({ displayName, aliases: uniq(c.brandAliases), domains });
  }
  return out;
}
