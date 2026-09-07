/**
 * プロジェクト（自社 + 競合）→ 判定対象（LlmoEntity）への変換（純関数）。
 * 設定画面で登録した情報をそのまま使い、LLMO 専用の登録画面は作らない。
 */
import type { Project } from "@/lib/store";
import type { LlmoEntity } from "./types";

/**
 * 自社を先頭にした判定対象の一覧。
 * ブランド別名が未登録なら会社名を別名として使う（何も判定できない状態を避ける）。
 */
export function entitiesOfProject(project: Project | null): LlmoEntity[] {
  if (!project) return [];
  const self: LlmoEntity = {
    id: project.id,
    name: project.name || project.domain,
    domains: [project.domain].filter(Boolean),
    brandAliases: project.brandAliases.length > 0 ? project.brandAliases : [project.name].filter(Boolean),
    isSelf: true,
  };
  const competitors = project.competitors.map((c) => ({
    id: c.id,
    name: c.name || c.domains[0] || "競合",
    domains: c.domains.filter(Boolean),
    brandAliases: c.brandAliases.length > 0 ? c.brandAliases : [c.name].filter(Boolean),
  }));
  return [self, ...competitors];
}

/** 判定に使える情報が 1 つも無い会社（画面の注意書き用） */
export function entitiesWithoutSignals(entities: readonly LlmoEntity[]): LlmoEntity[] {
  return entities.filter((e) => e.domains.length === 0 && e.brandAliases.length === 0);
}
