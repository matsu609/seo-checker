/**
 * 薬機法（旧薬事法）・景表法の NG 表現辞書と走査（D4）。
 *
 * 純関数だけを置く（正規表現とその説明）。LLM も通信も使わないので、
 * ANTHROPIC_API_KEY が無い環境でもブラウザ側でそのまま動く。
 * 文脈判定（誤検知の除去）はサーバー専用の yakki-judge.ts が担当する。
 *
 * 辞書の作り方:
 *   - 表現そのものを狙い、周辺の助詞まで含めて「効果があります」と
 *     「効果的な使い方」のような正常な表現を撃たないようにする。
 *   - 1 件ごとに「なぜ NG か（reason）」と「言い換え候補（alternatives）」を持たせ、
 *     指摘一覧からそのまま直せるようにする。
 *   - 辞書に項目を足すときは __tests__/yakki.test.ts の CASES にも
 *     「必ず当たる文」と「当たってはいけない近い文」を足す（テストが強制する）。
 *
 * ※ 本ツールの判定は目安であり、法令上の適合性を保証するものではない。
 */
import type { IssueSeverity } from "./types";

export type YakkiCategory = "医薬品的な効能効果" | "安全性の保証" | "最大級・誇大表現" | "身体の変化";

export interface YakkiEntry {
  id: string;
  /** 画面に出す表現名 */
  term: string;
  pattern: RegExp;
  category: YakkiCategory;
  severity: Extract<IssueSeverity, "fail" | "warn">;
  /** なぜ問題になるか */
  reason: string;
  /** 言い換え候補 */
  alternatives: string[];
}

/**
 * NG 表現辞書。pattern は g フラグを付けずに書く（走査時に付け直す）。
 */
export const YAKKI_DICTIONARY: readonly YakkiEntry[] = [
  {
    id: "naoru",
    term: "治る",
    pattern: /治(?:る|ります|りました|れます|りません)/,
    category: "医薬品的な効能効果",
    severity: "fail",
    reason: "化粧品・健康食品で疾病が治ると表現すると、医薬品的な効能効果の標榜になります。",
    alternatives: ["肌をすこやかに保つ", "うるおいを与える", "気になる部分をケアする"],
  },
  {
    id: "chiryou",
    term: "治療できる",
    pattern: /治療(?:でき|出来|が可能|可能|します|しました)/,
    category: "医薬品的な効能効果",
    severity: "fail",
    reason: "治療は医薬品・医療機器の領域です。化粧品や食品では標榜できません。",
    alternatives: ["セルフケアに取り入れる", "医師に相談する目安を示す"],
  },
  {
    id: "kikimasu",
    term: "効きます / 〜に効く",
    pattern: /効き(?:ます|ました)|に(?:よく)?効く/,
    category: "医薬品的な効能効果",
    severity: "fail",
    reason: "特定の症状に「効く」という表現は、医薬品的な効能効果の標榜にあたります。",
    alternatives: ["使用感を具体的に書く", "配合成分とその役割を書く"],
  },
  {
    id: "kouka_ari",
    term: "効果があります",
    pattern: /効果(?:が|は)(?:あり(?:ます|ました)|ある|出ます)/,
    category: "医薬品的な効能効果",
    severity: "fail",
    reason: "身体への効果を断定すると、承認された効能効果の範囲を超えるおそれがあります。",
    alternatives: ["〜を目的とした商品です", "使用感には個人差があります"],
  },
  {
    id: "wakagaeri",
    term: "若返る",
    pattern: /若返(?:る|り|ります|らせ)/,
    category: "身体の変化",
    severity: "fail",
    reason: "老化を巻き戻すという表現は、化粧品の効能効果の範囲を超えます。",
    alternatives: ["年齢に応じたお手入れ", "ハリのある見た目を目指す"],
  },
  {
    id: "anti_aging",
    term: "アンチエイジング",
    pattern: /アンチ[ ・･]?エイジング/,
    category: "身体の変化",
    severity: "warn",
    reason: "老化防止を意味するため、そのままでは標榜できません。",
    alternatives: ["エイジングケア（年齢に応じたお手入れ）"],
  },
  {
    id: "no_side_effect",
    term: "副作用がない",
    pattern: /副作用(?:は|が)?(?:一切|全く|まったく)?(?:あり(?:ません|ませんでした)|ない|なし)/,
    category: "安全性の保証",
    severity: "fail",
    reason: "安全性を保証する表現は、根拠の有無にかかわらず認められません。",
    alternatives: ["体質に合わない場合は使用を中止してください", "パッチテストを推奨します"],
  },
  {
    id: "sokkou",
    term: "即効性",
    pattern: /即効(?:性|的)|速効性/,
    category: "最大級・誇大表現",
    severity: "warn",
    reason: "効果の発現の速さを保証する表現は、誇大広告にあたるおそれがあります。",
    alternatives: ["継続してお使いください", "使用感には個人差があります"],
  },
  {
    id: "bannou",
    term: "万能",
    pattern: /万能/,
    category: "最大級・誇大表現",
    severity: "warn",
    reason: "あらゆる悩みに効くという意味になり、誇大広告にあたります。",
    alternatives: ["こんな場面で使えます", "用途を具体的に書く"],
  },
  {
    id: "eikyuu",
    term: "永久に",
    pattern: /永久(?:に|的)|一生(?:効果|使え)/,
    category: "最大級・誇大表現",
    severity: "warn",
    reason: "効果が永続するという表現は、事実に基づかない保証になります。",
    alternatives: ["継続的なお手入れが必要です", "使用を続けることで実感しやすくなります"],
  },
  {
    id: "detox",
    term: "デトックス",
    pattern: /デトックス|毒素(?:を)?(?:排出|除去)/,
    category: "医薬品的な効能効果",
    severity: "warn",
    reason: "体内の毒素排出という身体機能への作用の標榜になります。",
    alternatives: ["すっきりとした毎日をサポート", "水分補給の習慣づけ"],
  },
  {
    id: "meneki",
    term: "免疫力が上がる",
    pattern: /免疫力(?:が|を)?(?:上が|高ま|高め|アップ|向上)/,
    category: "医薬品的な効能効果",
    severity: "fail",
    reason: "身体の機能を強化するという表現は、医薬品的な効能効果にあたります。",
    alternatives: ["バランスのよい食事の一部として", "生活習慣を整える"],
  },
  {
    id: "same_medicine",
    term: "医薬品と同じ",
    pattern: /(?:医薬品|薬)(?:と)?(?:同じ|同等|並み)/,
    category: "医薬品的な効能効果",
    severity: "fail",
    reason: "医薬品と同等の作用があると誤認させる表現です。",
    alternatives: ["化粧品（医薬部外品）としての役割を書く", "成分名と配合目的を書く"],
  },
  {
    id: "kanarazu",
    term: "必ず / 絶対に効く",
    pattern: /(?:必ず|絶対に?)(?:痩せ|治り|治る|効[きく]|改善)/,
    category: "最大級・誇大表現",
    severity: "fail",
    reason: "効果を保証する断定表現は、誇大広告にあたります。",
    alternatives: ["個人差があります", "続けやすさを重視しています"],
  },
  {
    id: "saibou",
    term: "細胞を活性化",
    pattern: /細胞(?:を)?(?:活性化|再生|修復)/,
    category: "身体の変化",
    severity: "fail",
    reason: "身体の組織そのものへの作用は、化粧品の効能効果の範囲を超えます。",
    alternatives: ["うるおいのある肌環境を整える", "肌をやわらげる"],
  },
  {
    id: "taishitsu",
    term: "体質改善",
    pattern: /体質(?:を)?改善/,
    category: "身体の変化",
    severity: "warn",
    reason: "体質そのものを変えるという表現は、身体機能への作用の標榜になります。",
    alternatives: ["生活習慣を整える", "毎日の食事のバランスを見直す"],
  },
  {
    id: "yobou",
    term: "病気を予防",
    pattern: /(?:病気|がん|癌|感染|風邪|インフルエンザ)(?:を|の)?予防/,
    category: "医薬品的な効能効果",
    severity: "fail",
    reason: "疾病の予防は医薬品の効能効果です。食品・化粧品では標榜できません。",
    alternatives: ["手洗い・うがいなどの習慣とあわせて", "体調管理の一環として"],
  },
  {
    id: "number_one",
    term: "No.1 / 日本一",
    pattern: /\bNo\.?\s?1\b|ナンバーワン|日本一|世界一/i,
    category: "最大級・誇大表現",
    severity: "warn",
    reason: "最大級表現には、調査主体・期間・範囲を明示した客観的な根拠が必要です（景品表示法）。",
    alternatives: ["○○調査（20XX年、対象n=◯）で1位", "当社比で◯%"],
  },
  {
    id: "saiyasu",
    term: "最安 / 最高",
    pattern: /最安値?|業界最(?:安|高)|最高の効果/,
    category: "最大級・誇大表現",
    severity: "warn",
    reason: "価格や品質の最大級表現には、比較対象と時点を示す根拠が必要です（景品表示法）。",
    alternatives: ["◯月時点の当社価格", "他社の同等品と比べた具体的な差"],
  },
];

/** 辞書 1 件の検出結果 */
export interface YakkiHit {
  entryId: string;
  term: string;
  category: YakkiCategory;
  severity: Extract<IssueSeverity, "fail" | "warn">;
  /** 本文中で一致した文字列 */
  text: string;
  /** 一致位置（本文先頭からの文字数） */
  index: number;
  /** 一致箇所を含む文（指摘一覧に出す） */
  sentence: string;
  reason: string;
  alternatives: string[];
}

/** 1 件あたりの検出上限（同じ表現を何十件も並べない） */
export const MAX_HITS_PER_ENTRY = 20;
/** 全体の検出上限 */
export const MAX_HITS = 200;

const SENTENCE_BOUNDARY = /[。！？!?\n]/;

/** 一致位置を含む文を切り出す（純関数） */
export function sentenceAt(text: string, index: number, maxLength = 160): string {
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (SENTENCE_BOUNDARY.test(text[i])) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length; i += 1) {
    if (SENTENCE_BOUNDARY.test(text[i])) {
      end = i + 1;
      break;
    }
  }
  const sentence = text.slice(start, end).trim();
  return sentence.length > maxLength ? sentence.slice(0, maxLength) : sentence;
}

/**
 * 走査用にテキストを整える。
 *
 * 辞書の正規表現をそのまま本文に当てると、日本語の広告でごく普通に使われる
 * 表記ゆれを取りこぼす。「Ｎｏ．１」「ﾃﾞﾄｯｸｽ」のような全角・半角の違いと、
 * 「効果が あります」「必ず 痩せます」のような語の間の空白がその代表で、
 * 拾えなかった表現は文脈判定の LLM にも渡らないため画面には「指摘なし」と
 * 出てしまう（黙った見落とし）。
 *
 * そこで NFKC で正規化し、さらに空白を落とした文字列に対して走査する。
 * 返す index はこの正規化後の位置で、並べ替えにしか使わない。強調位置は
 * check.ts が findSpan(markdown, sentence) で取り直す。
 */
function normalizeForScan(text: string): { scan: string; normalized: string; origin: number[] } {
  const normalized = text.normalize("NFKC");
  const chars: string[] = [];
  const origin: number[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    if (/\s/.test(normalized[i])) continue;
    chars.push(normalized[i]);
    origin.push(i);
  }
  return { scan: chars.join(""), normalized, origin };
}

/** 本文を辞書で走査する（純関数） */
export function scanYakki(text: string, dictionary: readonly YakkiEntry[] = YAKKI_DICTIONARY): YakkiHit[] {
  const hits: YakkiHit[] = [];
  if (!text) return hits;
  const { scan, normalized, origin } = normalizeForScan(text);
  if (!scan) return hits;
  for (const entry of dictionary) {
    const flags = entry.pattern.flags.includes("g") ? entry.pattern.flags : `${entry.pattern.flags}g`;
    const re = new RegExp(entry.pattern.source, flags);
    let found = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(scan)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      // 文は空白を戻した正規化文字列から切り出す（読める形で画面に出すため）
      const at = origin[match.index] ?? 0;
      hits.push({
        entryId: entry.id,
        term: entry.term,
        category: entry.category,
        severity: entry.severity,
        text: match[0],
        index: match.index,
        sentence: sentenceAt(normalized, at),
        reason: entry.reason,
        alternatives: entry.alternatives,
      });
      found += 1;
      if (found >= MAX_HITS_PER_ENTRY) break;
    }
    if (hits.length >= MAX_HITS) break;
  }
  return hits.sort((a, b) => a.index - b.index).slice(0, MAX_HITS);
}

/** 辞書を ID で引く */
export function yakkiEntry(id: string): YakkiEntry | undefined {
  return YAKKI_DICTIONARY.find((e) => e.id === id);
}
