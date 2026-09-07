/** PageSpeed Insights（A3）。client.ts はサーバー専用（fetchText を使う） */
export * from "./types";
export { parsePsi, collectOpportunities, formatCls, formatMs, MAX_OPPORTUNITIES, OPPORTUNITY_SCORE_MAX } from "./parse";
export { fetchPsi, buildPsiUrl, isPagespeedKeyConfigured, psiErrorMessage, type PsiOutcome } from "./client";
