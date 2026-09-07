/**
 * 本文の重複判定（純関数・ネットワークに出ない）。
 *
 * 完全一致だけでは「テンプレートだけ違う使い回しページ」を拾えないため、
 * 文字 5-gram の MinHash 署名で Jaccard 係数を近似する。総当たりでも
 * 300 ページ × 64 ハッシュなら数百万回の比較で済むので、実装を単純に保つ。
 */

/** MinHash の署名長。長いほど精度が上がるが比較コストも増える */
export const SIGNATURE_SIZE = 64;
/** 文字 n-gram の n */
export const SHINGLE_SIZE = 5;

/** 32bit の FNV-1a。seed を変えて独立なハッシュ関数の族にする */
export function fnv1a(text: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // FNV の素数 16777619 を乗算。32bit に収めるため Math.imul を使う
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 比較用に文字列を均す（空白・記号を落とす） */
export function normalizeForShingles(text: string): string {
  return text.replace(/\s+/gu, "").replace(/[\p{P}\p{S}]/gu, "");
}

/** 文字 n-gram の集合 */
export function shingles(text: string, size = SHINGLE_SIZE): string[] {
  const normalized = normalizeForShingles(text);
  if (normalized.length === 0) return [];
  if (normalized.length <= size) return [normalized];
  const out: string[] = [];
  for (let i = 0; i + size <= normalized.length; i += 1) out.push(normalized.slice(i, i + size));
  return out;
}

/**
 * MinHash 署名。本文が空なら空配列（重複判定の対象外になる）。
 * 署名は数値配列なので JSON にそのまま載る。
 */
export function minHashSignature(text: string, size = SIGNATURE_SIZE): number[] {
  const grams = shingles(text);
  if (grams.length === 0) return [];
  const signature = new Array<number>(size).fill(0xffffffff);
  for (const gram of grams) {
    const base = fnv1a(gram);
    for (let i = 0; i < size; i += 1) {
      // seed を混ぜて i 番目のハッシュ関数を作る（乗算 + 撹拌で十分に散る）。
      // 比較も代入も符号なし 32bit に揃えること。片方でも符号付きのまま比べると
      // 「最小値」ではなく「最後に見た値」が残り、署名が壊れる。
      const mixed = Math.imul(base ^ Math.imul(i, 0x9e3779b9), 0x85ebca6b) >>> 0;
      const h = (mixed ^ i) >>> 0;
      if (h < signature[i]) signature[i] = h;
    }
  }
  return signature;
}

/** 署名どうしの一致率（Jaccard 係数の近似）。長さが違う・空なら 0 */
export function signatureSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] === b[i]) same += 1;
  return same / a.length;
}

/** 完全一致の判定に使う短い指紋 */
export function contentFingerprint(text: string): string {
  const normalized = normalizeForShingles(text);
  if (!normalized) return "";
  // 2 つの seed を並べて 64bit 相当にし、短い文章での衝突を減らす
  const a = fnv1a(normalized).toString(16).padStart(8, "0");
  const b = fnv1a(normalized, 0x01000193).toString(16).padStart(8, "0");
  return `${a}${b}:${normalized.length}`;
}
