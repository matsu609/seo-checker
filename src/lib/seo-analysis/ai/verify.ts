/**
 * AI の出力の検証（純関数）。
 *
 * 1. 本文中の数値が事実シートに存在するか（無い数字は「作った数字」の疑い）
 * 2. 引用した事実 ID が facts に存在するか
 *
 * 数値は 4 以上か小数を含むものだけを見る（「3 つの理由」のような数え言葉を
 * 誤検出しないため）。年（1990〜2100）と、事実の値・補足に含まれる数字は通す。
 */
import type { Fact } from "../sheet/types";

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.normalize("NFKC").matchAll(NUMBER_RE)) {
    const raw = m[0].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (!raw.includes(".") && n < 4) continue;
    if (Number.isInteger(n) && n >= 1990 && n <= 2100) continue;
    out.push(raw);
  }
  return out;
}

/** 事実シートに現れるすべての数値（正規化済み） */
export function factNumbers(facts: readonly Fact[]): Set<string> {
  const set = new Set<string>();
  for (const f of facts) {
    for (const text of [f.value, f.note ?? "", f.label]) {
      for (const m of text.normalize("NFKC").matchAll(NUMBER_RE)) {
        const raw = m[0].replace(/,/g, "");
        set.add(raw);
        // 2.8 秒 → 2800 のような単位換算、80% → 0.8 も許す
        const n = Number(raw);
        if (Number.isFinite(n)) {
          set.add(String(n));
          set.add(String(Math.round(n * 1000)));
          set.add(String(n / 100));
          set.add(String(Math.round(n * 100)));
        }
      }
    }
  }
  return set;
}

/** 本文の数値のうち事実シートに無いもの（重複なし） */
export function unverifiedNumbers(texts: readonly string[], facts: readonly Fact[]): string[] {
  const known = factNumbers(facts);
  const out = new Set<string>();
  for (const text of texts) {
    for (const raw of numbersIn(text)) {
      if (known.has(raw) || known.has(String(Number(raw)))) continue;
      out.add(raw);
    }
  }
  return [...out];
}

/** 引用された ID のうち facts に無いもの */
export function unknownFactIds(ids: readonly string[], facts: readonly Fact[]): string[] {
  const known = new Set(facts.map((f) => f.id));
  return [...new Set(ids.filter((id) => !known.has(id)))];
}
