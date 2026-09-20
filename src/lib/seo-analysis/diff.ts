/**
 * 精密診断の 2 回分（事実シート）の差分。純粋関数。
 *
 * 「直った / 悪化した」を数字で言えるものだけ比べる。AI の文章は比べない（言い回しが変わるだけで意味が無い）。
 *   - トップページの採点（クイック診断）
 *   - 検出した課題の件数（重大 / 警告）とルールごとの件数（無くなった / 新しく出た）
 *   - 対策キーワードの順位（同じ語だけ）
 *   - 主要ページの PageSpeed の性能スコア（同じ URL だけ）
 *   - ドメインパワー（Ahrefs DR）
 *   - llms.txt の有無
 *   - 信頼の手がかり（会社情報・連絡先などのチェック。同じ ID だけ）
 */
import type { AuditResult } from "@/lib/audit/types";
import type { SeoFactSheet } from "./sheet/types";

export type DiffDirection = "improved" | "worsened" | "same";

export interface DiffItem {
  /** 何の数字か */
  label: string;
  /** 表示用の前回・今回 */
  before: string;
  after: string;
  direction: DiffDirection;
  /** 数字の差（画面の並び替えに使う。無ければ 0） */
  magnitude: number;
  url?: string;
}

export interface SheetDiff {
  /** 比べた 2 回の日時 */
  before: string;
  after: string;
  improved: DiffItem[];
  worsened: DiffItem[];
  same: DiffItem[];
  /** 1 行のまとめ */
  headline: string;
}

function num(label: string, before: number | null | undefined, after: number | null | undefined, options: { higherIsBetter: boolean; unit?: string; url?: string; threshold?: number } = { higherIsBetter: true }): DiffItem | null {
  if (before === null || before === undefined || after === null || after === undefined) return null;
  const unit = options.unit ?? "";
  const delta = after - before;
  const threshold = options.threshold ?? 0;
  const direction: DiffDirection = Math.abs(delta) <= threshold ? "same" : (delta > 0) === options.higherIsBetter ? "improved" : "worsened";
  return { label, before: `${before}${unit}`, after: `${after}${unit}`, direction, magnitude: Math.abs(delta), ...(options.url ? { url: options.url } : {}) };
}

function push(out: SheetDiff, item: DiffItem | null): void {
  if (!item) return;
  out[item.direction === "improved" ? "improved" : item.direction === "worsened" ? "worsened" : "same"].push(item);
}

export function diffSheets(prev: SeoFactSheet, next: SeoFactSheet, audits: { prev: AuditResult | null; next: AuditResult | null } = { prev: null, next: null }): SheetDiff {
  const out: SheetDiff = { before: prev.generatedAt, after: next.generatedAt, improved: [], worsened: [], same: [], headline: "" };

  // トップページの採点
  push(out, num("トップページの採点（クイック診断）", prev.site.quick?.score ?? null, next.site.quick?.score ?? null, { higherIsBetter: true, unit: " 点" }));

  // 課題の件数
  push(out, num("重大な課題", prev.site.bySeverity.error, next.site.bySeverity.error, { higherIsBetter: false, unit: " 件" }));
  push(out, num("警告", prev.site.bySeverity.warning, next.site.bySeverity.warning, { higherIsBetter: false, unit: " 件" }));

  // ルールごと（audit があればそれ、無ければ上位ルール）
  const prevRules = new Map((audits.prev?.byRule ?? prev.site.topRules).map((r) => [r.ruleId, r.count]));
  const nextRules = new Map((audits.next?.byRule ?? next.site.topRules).map((r) => [r.ruleId, r.count]));
  for (const [ruleId, count] of prevRules) {
    const after = nextRules.get(ruleId) ?? 0;
    if (after === 0 && count > 0) out.improved.push({ label: `課題「${ruleId}」が無くなった`, before: `${count} 件`, after: "0 件", direction: "improved", magnitude: count });
  }
  for (const [ruleId, count] of nextRules) {
    if (!prevRules.has(ruleId) && count > 0) out.worsened.push({ label: `課題「${ruleId}」が新しく出た`, before: "0 件", after: `${count} 件`, direction: "worsened", magnitude: count });
  }

  // 順位（同じ語だけ。圏外 = 101 として比べる）
  const prevRank = new Map(prev.search.keywords.map((k) => [k.keyword, k.rank]));
  for (const k of next.search.keywords) {
    if (!prevRank.has(k.keyword)) continue;
    const b = prevRank.get(k.keyword) ?? null;
    const a = k.rank;
    if (b === null && a === null) continue;
    const item = num(`順位「${k.keyword}」`, b ?? 101, a ?? 101, { higherIsBetter: false, unit: " 位" });
    if (item) {
      item.before = b === null ? "圏外" : `${b} 位`;
      item.after = a === null ? "圏外" : `${a} 位`;
      push(out, item);
    }
  }

  // 速度（同じ URL の PSI 性能スコア）
  const prevPsi = new Map(prev.speed.psi.filter((p) => p.result?.categories.performance !== null && p.result?.categories.performance !== undefined).map((p) => [p.url, Math.round(p.result!.categories.performance as number)]));
  for (const p of next.speed.psi) {
    const score = p.result?.categories.performance;
    if (score === null || score === undefined || !prevPsi.has(p.url)) continue;
    push(out, num(`速度「${p.label}」（PageSpeed）`, prevPsi.get(p.url), Math.round(score), { higherIsBetter: true, unit: " 点", url: p.url, threshold: 3 }));
  }

  // ドメインパワー
  push(out, num("Ahrefs DR", prev.domain?.ahrefsDr ?? null, next.domain?.ahrefsDr ?? null, { higherIsBetter: true }));

  // llms.txt
  if (prev.llms && next.llms && prev.llms.present !== next.llms.present) {
    out[next.llms.present ? "improved" : "worsened"].push({ label: "llms.txt", before: prev.llms.present ? "あり" : "なし", after: next.llms.present ? "あり" : "なし", direction: next.llms.present ? "improved" : "worsened", magnitude: 1 });
  }

  // 信頼の手がかり
  const rank = { pass: 2, warn: 1, info: 1, fail: 0 } as const;
  const prevTrust = new Map(prev.site.trust.checks.map((c) => [c.id, c]));
  for (const c of next.site.trust.checks) {
    const b = prevTrust.get(c.id);
    if (!b || b.status === c.status) continue;
    const dir: DiffDirection = rank[c.status] > rank[b.status] ? "improved" : rank[c.status] < rank[b.status] ? "worsened" : "same";
    out[dir === "same" ? "same" : dir].push({ label: `信頼「${c.label}」`, before: b.status, after: c.status, direction: dir, magnitude: 1 });
  }

  out.improved.sort((a, b) => b.magnitude - a.magnitude);
  out.worsened.sort((a, b) => b.magnitude - a.magnitude);
  out.headline =
    out.improved.length === 0 && out.worsened.length === 0
      ? "前回から大きな変化はありません"
      : `前回と比べて、直った点 ${out.improved.length} 件・悪化した点 ${out.worsened.length} 件`;
  return out;
}
