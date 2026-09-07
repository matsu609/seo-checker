/** A2 / A3 ページ最適化レポート。すべて純関数（取得は Route Handler 側で行う） */
export * from "./config";
export * from "./types";
export * from "./robots";
export { buildPageReport, type BuildReportOptions } from "./analyze";
export { buildSection, statusFrom, statusOf, scoreLabelOf, totalScore } from "./score";
export { measurePage, extractJsonLdNodes, bigramOverlap, splitSentences, fullWidthCount, KEY_TYPES, REQUIRED_PROPERTIES, SEMANTIC_TAGS, VAGUE_ANCHORS } from "./extract";
