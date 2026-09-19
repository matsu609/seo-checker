export * from "./types";
export { parseCruxRecord, parseCruxHistory, statusOf, trendOf, formatCrux, cwvVerdict, type CwvVerdict } from "./parse";
export {
  fetchCruxRecord,
  fetchCruxHistory,
  fetchCruxWithFallback,
  isCruxEnabled,
  cruxApiKey,
  CRUX_ENDPOINT,
  CRUX_HISTORY_ENDPOINT,
  type CruxTarget,
  type CruxFormFactor,
} from "./client";
