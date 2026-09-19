/**
 * 精密診断の進捗メーター（純粋関数。ブラウザでも読む）。
 *
 * 利用者の指示（2026-09-19）: 「いまどれくらい診断が終わったか」を 1 本のメーターで見せる。
 * 収集（NDJSON の進捗）と AI 分析（出力量と経過時間）を 5 段階に並べ、0〜100 に落とす。
 * 最後の 1% は結果を受け取ってから 100 にする（99 で止まって見えないよう、経過時間でも少しずつ進める）。
 */
import type { CollectStep } from "./collect";

export type DiagnosisStageId = "crawl" | "quick" | "signals" | "sheet" | "analyze";

export interface DiagnosisStage {
  id: DiagnosisStageId;
  label: string;
  /** このステージが占める範囲（開始 %・終了 %） */
  from: number;
  to: number;
}

export const DIAGNOSIS_STAGES: readonly DiagnosisStage[] = [
  { id: "crawl", label: "サイト全体をクロール", from: 0, to: 45 },
  { id: "quick", label: "トップページを採点", from: 45, to: 50 },
  { id: "signals", label: "速度・検索順位・ドメイン・llms.txt を取得", from: 50, to: 70 },
  { id: "sheet", label: "事実シートを保存", from: 70, to: 75 },
  { id: "analyze", label: "AI が現状分析と改善案を書く", from: 75, to: 100 },
];

/** 収集の step → ステージ */
export function stageOfStep(step: CollectStep): DiagnosisStageId {
  switch (step) {
    case "crawl":
      return "crawl";
    case "quick":
      return "quick";
    case "sheet":
      return "sheet";
    default:
      return "signals";
  }
}

export interface ProgressInput {
  phase: "collecting" | "analyzing";
  /** 収集中の最新の step（無ければ開始直後） */
  step?: CollectStep | null;
  /** クロールの進み（fetched / queued） */
  audit?: { fetched: number; queued: number } | null;
  /** クロールの上限ページ数 */
  maxPages: number;
  /** そのステージに入ってからの経過（ms）。速度取得と AI 分析は時間で進める */
  stageElapsedMs: number;
  /** AI 分析の出力文字数（ストリーミングで増える） */
  outputChars?: number;
}

/** 速度・検索・ドメインの取得に見込む時間（PSI 6 ページが遅い） */
export const SIGNALS_EXPECTED_MS = 75_000;
/** AI 分析に見込む時間 */
export const ANALYZE_EXPECTED_MS = 150_000;
/** AI 分析の出力の見込み文字数（JSON 込み。これに達したら時間より先に進める） */
export const ANALYZE_EXPECTED_CHARS = 12_000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** ステージ内の 0〜1 を全体の % に写す */
function within(stage: DiagnosisStage, ratio: number): number {
  return stage.from + (stage.to - stage.from) * clamp(ratio, 0, 1);
}

function stageById(id: DiagnosisStageId): DiagnosisStage {
  return DIAGNOSIS_STAGES.find((s) => s.id === id) ?? DIAGNOSIS_STAGES[0];
}

/** 時間で進めるときの曲線。見込み時間で 85% まで、あとは漸近（止まって見えない） */
export function timeRatio(elapsedMs: number, expectedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const x = elapsedMs / expectedMs;
  if (x <= 1) return 0.85 * x;
  return 0.85 + 0.14 * (1 - Math.exp(-(x - 1)));
}

export interface DiagnosisProgress {
  /** 0〜99（結果が来るまで 100 にはしない） */
  percent: number;
  stage: DiagnosisStageId;
  /** 表示用の 1 行（例: "クロール中 63 / 200 ページ"） */
  detail: string;
}

export function diagnosisProgress(input: ProgressInput): DiagnosisProgress {
  if (input.phase === "analyzing") {
    const stage = stageById("analyze");
    const byTime = timeRatio(input.stageElapsedMs, ANALYZE_EXPECTED_MS);
    const byChars = clamp((input.outputChars ?? 0) / ANALYZE_EXPECTED_CHARS, 0, 0.97);
    const percent = Math.min(99, Math.floor(within(stage, Math.max(byTime, byChars))));
    const sec = Math.floor(input.stageElapsedMs / 1000);
    const detail = input.outputChars ? `AI が書いています（${input.outputChars.toLocaleString("ja-JP")} 文字・${sec} 秒）` : `AI が事実シートを読んでいます（${sec} 秒）`;
    return { percent, stage: "analyze", detail };
  }

  const stageId = input.step ? stageOfStep(input.step) : "crawl";
  const stage = stageById(stageId);
  if (stageId === "crawl") {
    const fetched = input.audit?.fetched ?? 0;
    const queued = input.audit?.queued ?? 0;
    // 分母はまだ見つかっているページ数（上限まで）。見つかるたびに伸びるので、序盤は控えめに進む
    const denom = Math.max(1, Math.min(input.maxPages, fetched + queued));
    const ratio = fetched === 0 ? 0 : Math.min(0.98, fetched / denom);
    return { percent: Math.floor(within(stage, ratio)), stage: stageId, detail: fetched > 0 ? `クロール中 ${fetched} ページ取得（上限 ${input.maxPages}）` : "サイトに接続しています" };
  }
  if (stageId === "quick") return { percent: Math.floor(within(stage, 0.5)), stage: stageId, detail: "トップページを採点しています" };
  if (stageId === "signals") {
    const ratio = timeRatio(input.stageElapsedMs, SIGNALS_EXPECTED_MS);
    return { percent: Math.floor(within(stage, ratio)), stage: stageId, detail: "主要ページの速度・検索順位・ドメインの情報・llms.txt を取得しています" };
  }
  return { percent: Math.floor(within(stage, 0.6)), stage: stageId, detail: "事実シートを組み立てて保存しています" };
}

/** ステージ一覧の表示状態（済み・進行中・これから） */
export function stageStates(current: DiagnosisStageId | null, done: boolean): { stage: DiagnosisStage; state: "done" | "active" | "todo" }[] {
  const idx = current ? DIAGNOSIS_STAGES.findIndex((s) => s.id === current) : -1;
  return DIAGNOSIS_STAGES.map((stage, i) => ({ stage, state: done || i < idx ? "done" : i === idx ? "active" : "todo" }));
}
