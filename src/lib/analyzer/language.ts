/**
 * ブロック単位の言語判定。
 *
 * 文の区切り方も、具体情報の探し方も言語で変わる。以前は本文全体を句点（。）で
 * 割っていたため、句点を持たない言語のページは本文まるごとが 1 文として数えられ、
 * どれだけ書き足しても「1 / 全 1 文」のまま動かなかった。
 *
 * 判定の順番は「`lang` 属性 → 文字種」。属性は書いた人の宣言なので最優先し、
 * 無ければ、かな・漢字が占める割合から推定する。1 ページに日本語と英語が
 * 混在することは珍しくないので（英語版ページ・英語の引用・社名）、判定は
 * ページ単位ではなくブロック単位で行う。
 */

/**
 * 文の区切り方の系統。
 * - `cjk`  … 句点（。！？）で区切る。日本語・中国語
 * - `latin` … ピリオド（. ! ?）＋空白／行末で区切る。英語など
 *
 * 韓国語もピリオドで区切るため `latin` に入れる（ハングルは空白で分かち書きする）。
 */
export type SentenceStyle = "cjk" | "latin";

export interface LanguageInfo {
  /** BCP 47 の主要部分（"ja" / "en" / "zh" …）。推定できなければ "und" */
  code: string;
  style: SentenceStyle;
  /** "attr" = lang 属性から / "script" = 文字種から推定 / "default" = どちらも無く既定 */
  source: "attr" | "script" | "default";
}

const JA_LABELS: Record<string, string> = {
  ja: "日本語",
  en: "英語",
  zh: "中国語",
  ko: "韓国語",
  fr: "フランス語",
  de: "ドイツ語",
  es: "スペイン語",
  pt: "ポルトガル語",
  it: "イタリア語",
  th: "タイ語",
  vi: "ベトナム語",
  id: "インドネシア語",
  ru: "ロシア語",
};

/** 句点で区切る言語。これ以外はピリオドで区切る */
const CJK_LANGUAGES = new Set(["ja", "zh", "yue", "lzh"]);

/** 日本語・中国語の文字（かな・漢字）。ラテン文字と比べて割合を見る */
const CJK_CHARS = "ぁ-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿々〆ヶ";
const RE_CJK = new RegExp(`[${CJK_CHARS}]`, "gu");
const RE_CJK_CHAR = new RegExp(`[${CJK_CHARS}]`, "u");
/** かな。1 文字でもあれば日本語と見なせる強い手がかり */
const RE_KANA = /[ぁ-ゟ゠-ヿ]/u;
/** ラテン文字（アクセント付きを含む） */
const RE_LATIN = /[A-Za-zÀ-ɏ]/gu;
/** ハングル */
const RE_HANGUL = /[가-힯ᄀ-ᇿ]/u;

/** かな・漢字がこの割合以上なら、かなが無くても日本語（中国語）とみなす */
const CJK_RATIO = 0.3;

/** `lang="ja-JP"` → "ja"。空文字や不正な値は null */
export function primarySubtag(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const code = lang.trim().toLowerCase().split(/[-_]/)[0];
  if (!code || !/^[a-z]{2,3}$/.test(code)) return null;
  return code;
}

export function styleOf(code: string): SentenceStyle {
  return CJK_LANGUAGES.has(code) ? "cjk" : "latin";
}

/** 画面に出す言語名（"英語（推定）" のように使う） */
export function languageLabel(info: LanguageInfo): string {
  const name = JA_LABELS[info.code] ?? (info.code === "und" ? "不明" : info.code);
  if (info.source === "attr") return name;
  if (info.source === "script") return `${name}（推定）`;
  return `${name}（既定）`;
}

/** 1 文字が日本語・中国語の文字（かな・漢字）か。文の切れ目の判定にも使う */
export function isCjkChar(ch: string): boolean {
  return RE_CJK_CHAR.test(ch);
}

/** 文字種から言語を推定する。判定できなければ null */
export function detectByScript(text: string): LanguageInfo | null {
  const cjk = text.match(RE_CJK)?.length ?? 0;
  const latin = text.match(RE_LATIN)?.length ?? 0;
  if (cjk === 0 && latin === 0) return null;
  if (RE_KANA.test(text)) return { code: "ja", style: "cjk", source: "script" };
  if (cjk > 0 && cjk / (cjk + latin) >= CJK_RATIO) {
    // かなが無く漢字だけなら中国語の可能性もあるが、区切り方（。）は同じ
    return { code: "ja", style: "cjk", source: "script" };
  }
  if (RE_HANGUL.test(text)) return { code: "ko", style: "latin", source: "script" };
  if (latin > 0) return { code: "en", style: "latin", source: "script" };
  return null;
}

/**
 * ブロック 1 つの言語を決める。
 *
 * @param text      ブロックの文字列
 * @param langAttr  そのブロック（または最も近い祖先）の lang 属性
 * @param fallback  ページ全体の言語（`<html lang>` か、本文から推定したもの）
 */
export function detectLanguage(
  text: string,
  langAttr?: string | null,
  fallback?: LanguageInfo | null,
): LanguageInfo {
  const attr = primarySubtag(langAttr);
  if (attr) return { code: attr, style: styleOf(attr), source: "attr" };
  const script = detectByScript(text);
  // 文字種での推定がページの宣言（<html lang>）と同じなら、宣言の方を採用する
  // （「英語（推定）」ではなく「英語」とレポートに書けるようにする）
  if (script) return fallback && fallback.code === script.code ? fallback : script;
  if (fallback) return fallback;
  return { code: "und", style: "cjk", source: "default" };
}

/**
 * ページ全体の言語。`<html lang>` があればそれ、無ければ本文の文字種から推定する。
 * ブロックごとの判定が付かなかったときの受け皿。
 */
export function documentLanguage(htmlLang: string | null | undefined, text: string): LanguageInfo {
  const attr = primarySubtag(htmlLang);
  if (attr) return { code: attr, style: styleOf(attr), source: "attr" };
  return detectByScript(text) ?? { code: "und", style: "cjk", source: "default" };
}
