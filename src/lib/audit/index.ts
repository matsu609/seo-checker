/**
 * A1 サイト診断の入口（サーバー専用）。
 *
 * ブラウザ側は store.ts / diff.ts / types.ts を直接 import すること
 * （この barrel は run.ts 経由で node 専用モジュールを引き込む）。
 */
export * from "./types";
export * from "./config";
export * from "./diff";
export { runAudit, buildResult, applyDepths, collectProbeTargets, countInlinks, redirectIntermediates, type RunAuditOptions } from "./run";
export { buildRuleSummary, generateAuditSummary } from "./summary";
export { parseAuditPage, displayWidth, fullWidthCount, type ParsedPage } from "./parse";
export * from "./rules";
