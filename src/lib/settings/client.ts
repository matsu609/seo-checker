"use client";

/**
 * 設定に集約した基本情報をブラウザ側の画面で読むフック。
 * ホームページ・競合は projects ストア、キーワードは rankKeywords ストア、
 * 会社・店舗の基本情報は /api/account/lead（登録時のデータ）から。
 */
import { useMemo } from "react";
import { useLeadProfile } from "@/lib/account/lead-client";
import { rankKeywordsStore } from "@/lib/rank/store";
import { useCurrentProject, useStore } from "@/lib/store/hooks";
import { keywordsForProject, type SharedSettings } from "./shared";

export interface UseSharedSettingsResult extends SharedSettings {
  /** 登録情報（lead）の読み込みが終わったか。ストアは同期的に読めるので待たなくてよい */
  leadLoaded: boolean;
}

export function useSharedSettings(): UseSharedSettingsResult {
  const { project } = useCurrentProject();
  const [rankKeywords] = useStore(rankKeywordsStore);
  const { lead, loaded } = useLeadProfile();
  const keywords = useMemo(() => (project ? keywordsForProject(rankKeywords, project.id) : []), [rankKeywords, project]);
  return { lead, project, keywords, leadLoaded: loaded };
}
