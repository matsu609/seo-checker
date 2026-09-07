"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Store } from "./createStore";
import {
  addProject,
  currentProjectIdStore,
  projectsStore,
  removeProject,
  resolveCurrentProject,
  updateProject,
  type Project,
  type ProjectInput,
} from "./projects";

/**
 * ストアを購読する。SSR / ハイドレーション中は initial を返し、
 * マウント後に localStorage の値へ切り替わる（useSyncExternalStore）。
 */
export function useStore<T>(store: Store<T>): [T, (value: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(store.subscribe, store.get, () => store.initial);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (typeof next === "function") store.update(next as (prev: T) => T);
      else store.set(next);
    },
    [store],
  );
  return [value, set];
}

export interface UseProjectsResult {
  projects: Project[];
  add: (input: ProjectInput) => Project;
  update: (id: string, patch: Partial<Omit<Project, "id" | "createdAt">>) => void;
  remove: (id: string) => void;
}

export function useProjects(): UseProjectsResult {
  const [projects] = useStore(projectsStore);
  return { projects, add: addProject, update: updateProject, remove: removeProject };
}

export interface UseCurrentProjectResult {
  project: Project | null;
  projects: Project[];
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
}

export function useCurrentProject(): UseCurrentProjectResult {
  const [projects] = useStore(projectsStore);
  const [currentProjectId, setCurrentProjectId] = useStore(currentProjectIdStore);
  return {
    project: resolveCurrentProject(projects, currentProjectId),
    projects,
    currentProjectId,
    setCurrentProjectId: (id) => setCurrentProjectId(id),
  };
}
