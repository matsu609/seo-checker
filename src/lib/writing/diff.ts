/**
 * 語単位の差分（D3 の「採用 / 破棄」表示用）。純関数・クライアントでも使う。
 *
 * 日本語には単語の区切りが無いので、
 *   - 英数字・記号の連なりは 1 語
 *   - 空白の連なりは 1 語
 *   - それ以外（漢字・かな・約物）は 1 文字 1 語
 * として扱う。文字単位よりまとまりがよく、形態素解析の依存も増やさずに済む。
 *
 * 差分は共通の前後を切り落としてから中央だけ LCS を取る。
 * 長文で計算量が爆発しないよう、上限を超えたら「まるごと置換」に落とす。
 */
import type { DiffOp, DiffPart } from "./types";

/** LCS 表を作る上限（トークン数の積）。超えたら置換にフォールバック */
export const MAX_LCS_CELLS = 2_000_000;

const TOKEN_RE = /[A-Za-z0-9_]+(?:['’-][A-Za-z0-9_]+)*|[ \t]+|\r?\n|[\s\S]/gu;

/** 差分の単位に切り分ける（純関数） */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text.match(TOKEN_RE) ?? [];
}

function pushPart(parts: DiffPart[], op: DiffOp, text: string): void {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.op === op) last.text += text;
  else parts.push({ op, text });
}

/** LCS（動的計画法）。呼び出し側でサイズを制限してから使う */
function lcsParts(a: readonly string[], b: readonly string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  // (n+1) x (m+1) の表。行を 1 本ずつ持つより 1 本の配列の方が速い
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[at(i, j)] =
        a[i] === b[j] ? table[at(i + 1, j + 1)] + 1 : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pushPart(parts, "equal", a[i]);
      i += 1;
      j += 1;
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
      pushPart(parts, "delete", a[i]);
      i += 1;
    } else {
      pushPart(parts, "insert", b[j]);
      j += 1;
    }
  }
  while (i < n) {
    pushPart(parts, "delete", a[i]);
    i += 1;
  }
  while (j < m) {
    pushPart(parts, "insert", b[j]);
    j += 1;
  }
  return parts;
}

/**
 * 変更前後の差分を語単位で返す。
 * 同じ内容なら equal 1 個（空文字どうしなら空配列）。
 */
export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ op: "equal", text: before }] : [];
  if (!before) return [{ op: "insert", text: after }];
  if (!after) return [{ op: "delete", text: before }];

  const a = tokenize(before);
  const b = tokenize(after);

  // 共通の先頭 / 末尾を切り落として LCS の対象を小さくする
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail += 1;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const parts: DiffPart[] = [];
  pushPart(parts, "equal", a.slice(0, head).join(""));

  if (midA.length === 0) {
    pushPart(parts, "insert", midB.join(""));
  } else if (midB.length === 0) {
    pushPart(parts, "delete", midA.join(""));
  } else if ((midA.length + 1) * (midB.length + 1) > MAX_LCS_CELLS) {
    // 長すぎる。まるごと置換として扱う（表示は正しいまま、粒度だけ粗くなる）
    pushPart(parts, "delete", midA.join(""));
    pushPart(parts, "insert", midB.join(""));
  } else {
    for (const part of lcsParts(midA, midB)) pushPart(parts, part.op, part.text);
  }

  pushPart(parts, "equal", a.slice(a.length - tail).join(""));
  return parts;
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: boolean;
}

/** 追加・削除された文字数（純関数） */
export function diffStats(parts: readonly DiffPart[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    if (part.op === "insert") added += part.text.length;
    else if (part.op === "delete") removed += part.text.length;
  }
  return { added, removed, changed: added > 0 || removed > 0 };
}

/** 差分から変更後の全文を復元する（採用のときに使う。純関数） */
export function applyDiff(parts: readonly DiffPart[]): string {
  return parts
    .filter((p) => p.op !== "delete")
    .map((p) => p.text)
    .join("");
}
