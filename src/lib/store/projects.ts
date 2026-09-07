/**
 * プロジェクト（自社ドメイン）と競合の定義・ストア。
 * 画面からは hooks.ts の useProjects / useCurrentProject を使う。
 */
import { z } from "zod";
import { createStore, newId } from "./createStore";

export const CompetitorSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** 例: ["example.co.jp", "www.example.co.jp"] */
  domains: z.array(z.string()),
  /** ブランドの表記ゆれ（LLMO の言及判定に使う） */
  brandAliases: z.array(z.string()),
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  domain: z.string(),
  startUrl: z.string(),
  brandAliases: z.array(z.string()),
  competitors: z.array(CompetitorSchema),
  createdAt: z.string(),
});

export const ProjectsSchema = z.array(ProjectSchema);

export type Competitor = z.infer<typeof CompetitorSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export const projectsStore = createStore<Project[]>("projects", ProjectsSchema, []);
export const currentProjectIdStore = createStore<string | null>(
  "currentProjectId",
  z.string().nullable(),
  null,
);

/** ホスト名を正規化する（スキーム・パス・先頭の www. を除く） */
export function normalizeDomain(input: string): string {
  const t = input.trim().toLowerCase();
  if (!t) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(t) ? t : `https://${t}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return t.replace(/^www\./, "").split("/")[0];
  }
}

/** 改行・カンマ区切りの文字列を配列にする（空要素と重複は除く） */
export function splitList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of input.split(/[\n,、]/)) {
    const v = s.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export interface ProjectInput {
  name: string;
  domain: string;
  startUrl?: string;
  brandAliases?: string[];
  competitors?: Array<Omit<Competitor, "id"> & { id?: string }>;
}

export function buildProject(input: ProjectInput, now = new Date()): Project {
  const domain = normalizeDomain(input.domain);
  const startUrl = (input.startUrl ?? "").trim() || (domain ? `https://${domain}/` : "");
  return {
    id: newId(),
    name: input.name.trim() || domain,
    domain,
    startUrl,
    brandAliases: input.brandAliases ?? [],
    competitors: (input.competitors ?? []).map((c) => ({
      id: c.id ?? newId(),
      name: c.name.trim(),
      domains: c.domains.map(normalizeDomain).filter(Boolean),
      brandAliases: c.brandAliases,
    })),
    createdAt: now.toISOString(),
  };
}

export function addProject(input: ProjectInput): Project {
  const project = buildProject(input);
  projectsStore.update((prev) => [...prev, project]);
  if (currentProjectIdStore.get() === null) currentProjectIdStore.set(project.id);
  return project;
}

export function updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): void {
  projectsStore.update((prev) =>
    prev.map((p) =>
      p.id === id
        ? {
            ...p,
            ...patch,
            domain: patch.domain !== undefined ? normalizeDomain(patch.domain) : p.domain,
          }
        : p,
    ),
  );
}

export function removeProject(id: string): void {
  projectsStore.update((prev) => prev.filter((p) => p.id !== id));
  if (currentProjectIdStore.get() === id) {
    const rest = projectsStore.get();
    currentProjectIdStore.set(rest.length > 0 ? rest[0].id : null);
  }
}

/** 現在のプロジェクト。未選択なら先頭、無ければ null */
export function resolveCurrentProject(projects: Project[], currentId: string | null): Project | null {
  if (projects.length === 0) return null;
  return projects.find((p) => p.id === currentId) ?? projects[0];
}
