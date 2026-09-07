/**
 * ページ診断の実行（サーバー専用）。実装ガイド §9.1 のパイプライン。
 *
 * 1. Top10 取得（SerpApi の実測、または Claude の Web 検索による推定）
 * 2. 対象 URL の決定（未指定なら SERP 内の自社ドメイン最上位）
 * 3. Top10 と対象ページの測定（同時 3 本まで・失敗は読み飛ばして記録）
 * 4. 平均 / 中央値 / 差分
 * 5. LLM 分析（ANTHROPIC_API_KEY があるときだけ）
 *
 * 外部呼び出しはすべて引数で差し替えられるようにしてある（テストはネットワークに出ない）。
 */
import type { SerpProvider } from "@/lib/serp/types";
import { analyzeDiagnosis, DIAGNOSIS_MODEL, type DiagnosisAnalyzer } from "./analyze";
import { measureMany, type PageFetcher } from "./measure";
import { estimateTop10, fetchTop10, pickSelfUrl, type SerpEstimator, type Top10Result } from "./serp";
import { buildStats } from "./stats";
import { diagnosisId } from "./store";
import type {
  CompetitorPage,
  DiagnosisDevice,
  DiagnosisResult,
  PageFailure,
  PageMeasurement,
  TargetOrigin,
} from "./types";

export interface RunDiagnosisInput {
  keyword: string;
  url?: string;
  device?: DiagnosisDevice;
  location?: string;
  projectDomain?: string;
  /** SERPAPI_KEY があるときのプロバイダ。null なら推定に回る */
  provider: SerpProvider | null;
  /** ANTHROPIC_API_KEY があるか（推定と分析の可否） */
  anthropicEnabled: boolean;
  signal?: AbortSignal;
  /* 差し替え用（テスト） */
  estimator?: SerpEstimator;
  fetcher?: PageFetcher;
  analyzer?: DiagnosisAnalyzer;
  now?: Date;
}

/** 同じページを 2 度取らないための正規化キー */
function urlKey(url: string): string {
  return url.trim().replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
}

export async function runDiagnosis(input: RunDiagnosisInput): Promise<DiagnosisResult> {
  const keyword = input.keyword.trim();
  const device: DiagnosisDevice = input.device ?? "desktop";
  const now = input.now ?? new Date();
  const notes: string[] = [];

  const serpInput = {
    keyword,
    device,
    ...(input.location ? { location: input.location } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  };

  let top10: Top10Result;
  if (input.provider) {
    top10 = await fetchTop10(input.provider, serpInput);
  } else {
    if (!input.anthropicEnabled) {
      throw new Error("SERPAPI_KEY または ANTHROPIC_API_KEY が必要です");
    }
    top10 = await estimateTop10(serpInput, input.estimator);
    notes.push(
      "SERPAPI_KEY が未設定のため、上位ページの一覧は Claude の Web 検索による推定です。順位の実測値ではありません。",
    );
  }

  // --- 対象 URL の決定 -------------------------------------------------------
  const inputUrl = input.url?.trim();
  let targetUrl: string | null = inputUrl && inputUrl.length > 0 ? inputUrl : null;
  let targetOrigin: TargetOrigin = targetUrl ? "input" : "none";
  if (!targetUrl && input.projectDomain) {
    const found = pickSelfUrl(top10.entries, input.projectDomain);
    if (found) {
      targetUrl = found.url;
      targetOrigin = "serp";
      notes.push(`対象 URL が未指定のため、検索結果で自社ドメインの最上位だった ${found.position} 位の ${found.url} を対象にしました。`);
    }
  }
  if (!targetUrl) {
    notes.push(
      "対象ページがありません（URL 未指定、または検索結果に自社ドメインが見つかりませんでした）。新規記事の作成を前提とした提案になります。",
    );
  }

  // --- 測定 ------------------------------------------------------------------
  const targetKey = targetUrl ? urlKey(targetUrl) : null;
  const targets = top10.entries.map((e) => ({ url: e.url, position: e.position }));
  const selfInTop10 = targetKey ? top10.entries.find((e) => urlKey(e.url) === targetKey) : undefined;
  if (targetUrl && !selfInTop10) targets.push({ url: targetUrl, position: 0 });

  const measured = await measureMany({
    targets,
    fetcher: input.fetcher,
    ...(input.signal ? { signal: input.signal } : {}),
  });

  const byPosition = new Map<number, PageMeasurement>();
  for (const m of measured.measurements) byPosition.set(m.position, m.measurement);

  const competitors: CompetitorPage[] = top10.entries.map((entry) => ({
    position: entry.position,
    title: entry.title,
    url: entry.url,
    ...(entry.snippet ? { snippet: entry.snippet } : {}),
    measurement: byPosition.get(entry.position) ?? null,
  }));

  const self: PageMeasurement | null = selfInTop10
    ? (byPosition.get(selfInTop10.position) ?? null)
    : (byPosition.get(0) ?? null);

  const failures: PageFailure[] = measured.failures.map((f) => (f.position === 0 ? { ...f, position: null } : f));
  if (targetUrl && !self) {
    notes.push("対象ページを取得できなかったため、自社との差分は計算していません。");
  }

  // 自社ページは Top10 平均の母集団から外す（自分と自分を比べない）
  const competitorMeasurements = competitors
    .filter((c) => !(selfInTop10 && c.position === selfInTop10.position))
    .map((c) => c.measurement)
    .filter((m): m is PageMeasurement => m !== null);

  const stats = buildStats(competitorMeasurements, self);

  // --- LLM 分析 --------------------------------------------------------------
  let analysis: DiagnosisResult["analysis"] = null;
  let model: string | null = null;
  if (input.anthropicEnabled) {
    analysis = await analyzeDiagnosis(
      {
        keyword,
        serpSource: top10.source,
        top10: top10.entries,
        competitors,
        self,
        stats,
        relatedQuestions: top10.relatedQuestions.map((q) => q.question),
        features: top10.features,
        ...(input.signal ? { signal: input.signal } : {}),
      },
      input.analyzer,
    );
    model = DIAGNOSIS_MODEL;
  } else {
    notes.push("ANTHROPIC_API_KEY が未設定のため、AI による分析（検索意図・提案）は行っていません。測定値の比較のみ表示しています。");
  }

  return {
    id: diagnosisId(keyword, targetUrl),
    keyword,
    device,
    ...(input.location ? { location: input.location } : {}),
    ...(input.projectDomain ? { projectDomain: input.projectDomain } : {}),
    targetUrl,
    targetOrigin,
    serpSource: top10.source,
    top10: top10.entries,
    features: top10.features,
    relatedQuestions: top10.relatedQuestions,
    aiOverviewPresent: top10.aiOverviewPresent,
    self,
    competitors,
    failures,
    stats,
    analysis,
    model,
    notes,
    createdAt: now.toISOString(),
  };
}
