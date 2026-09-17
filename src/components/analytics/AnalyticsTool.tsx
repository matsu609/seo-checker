/**
 * アクセス解析（自前の計測タグ）の画面は取り下げた（利用者の決定 2026-09-17:
 * お客様がタグを貼る作業が要る = ツール内で完結しないので提供しない）。
 * `/tools/analytics` は「検索パフォーマンス（推定）」へ転送するので、この部品はどこからも使われない。
 * `src/lib/analytics/` と一緒に、削除は利用者の許可を得てから（docs/dev/OPERATIONS.md #105）。
 */
export function AnalyticsTool() {
  return null;
}
