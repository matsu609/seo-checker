/**
 * 薬機法・景表法の NG 表現辞書（D4）。
 *
 * 辞書の項目ごとに「必ず当たる文」と「当たってはいけない近い文」を持たせ、
 * すべての項目が両方を満たすことを確かめる。
 * 辞書に項目を足したら CASES にも足す（漏れるとこのテストが落ちる）。
 */
import { describe, expect, it } from "vitest";
import { scanYakki, sentenceAt, YAKKI_DICTIONARY, yakkiEntry, MAX_HITS_PER_ENTRY } from "../yakki";

interface Case {
  /** 検出されなければならない文 */
  match: string;
  /** 検出されてはいけない、紛らわしいが正常な文 */
  nearMiss: string;
}

const CASES: Record<string, Case> = {
  naoru: {
    match: "このクリームを塗ればニキビが治ります。",
    nearMiss: "医師の治療を受けている方はご相談ください。",
  },
  chiryou: {
    match: "自宅でアトピーを治療できます。",
    nearMiss: "治療が必要かどうかは医師が判断します。",
  },
  kikimasu: {
    match: "花粉の季節の不快感に効きます。",
    nearMiss: "効き目の感じ方には個人差があります。",
  },
  kouka_ari: {
    match: "シミの改善に効果があります。",
    nearMiss: "効果的な使い方を紹介します。",
  },
  wakagaeri: {
    match: "使い続けると肌が10歳若返ります。",
    nearMiss: "若い世代にも支持されています。",
  },
  anti_aging: {
    match: "アンチエイジングを目的としたケアです。",
    nearMiss: "エイジングケアの基本を解説します。",
  },
  no_side_effect: {
    match: "天然成分なので副作用がありません。",
    nearMiss: "副作用が出た場合は使用を中止してください。",
  },
  sokkou: {
    match: "即効性のある成分を配合しています。",
    nearMiss: "即日発送に対応しています。",
  },
  bannou: {
    match: "これ1本で万能に使えます。",
    nearMiss: "万全の品質管理体制で製造しています。",
  },
  eikyuu: {
    match: "一度のケアで効果が永久に続きます。",
    nearMiss: "永久保存版のチェックリストを用意しました。",
  },
  detox: {
    match: "体内の毒素を排出してデトックスします。",
    nearMiss: "すっきりとした毎日をサポートします。",
  },
  meneki: {
    match: "毎日飲むと免疫力が上がります。",
    nearMiss: "免疫のしくみをわかりやすく解説します。",
  },
  same_medicine: {
    match: "医薬品と同じ効果が期待できます。",
    nearMiss: "医薬品医療機器等法（薬機法）の概要はこちらです。",
  },
  kanarazu: {
    match: "続ければ必ず痩せます。",
    nearMiss: "必ず使用前にパッチテストを行ってください。",
  },
  saibou: {
    match: "肌の細胞を活性化させます。",
    nearMiss: "細胞のはたらきを図で説明します。",
  },
  taishitsu: {
    match: "飲むだけで体質改善ができます。",
    nearMiss: "体質には個人差があるため無理はしないでください。",
  },
  yobou: {
    match: "毎日の摂取で風邪を予防します。",
    nearMiss: "予防接種の記録を確認しておきましょう。",
  },
  number_one: {
    match: "満足度は業界No.1です。",
    nearMiss: "第1章では基礎を解説します。",
  },
  saiyasu: {
    match: "業界最安値でご提供します。",
    nearMiss: "最新の価格は公式サイトをご確認ください。",
  },
};

describe("薬機法辞書", () => {
  it("辞書のすべての項目にテストケースがある", () => {
    expect(Object.keys(CASES).sort()).toEqual(YAKKI_DICTIONARY.map((e) => e.id).sort());
  });

  it("項目ごとに理由と言い換え候補を持つ", () => {
    for (const entry of YAKKI_DICTIONARY) {
      expect(entry.reason.length, entry.id).toBeGreaterThan(0);
      expect(entry.alternatives.length, entry.id).toBeGreaterThan(0);
      expect(entry.pattern.flags.includes("g"), entry.id).toBe(false);
    }
  });

  for (const entry of YAKKI_DICTIONARY) {
    const testCase = CASES[entry.id];
    it(`${entry.id}（${entry.term}）: NG 文を検出する`, () => {
      const hits = scanYakki(testCase.match);
      expect(hits.map((h) => h.entryId)).toContain(entry.id);
      const hit = hits.find((h) => h.entryId === entry.id);
      expect(hit?.sentence).toBe(testCase.match);
      expect(hit?.index).toBeGreaterThanOrEqual(0);
      expect(testCase.match.slice(hit?.index ?? 0, (hit?.index ?? 0) + (hit?.text.length ?? 0))).toBe(hit?.text);
    });

    it(`${entry.id}（${entry.term}）: 紛らわしい正常な文は検出しない`, () => {
      const hits = scanYakki(testCase.nearMiss);
      expect(hits.map((h) => h.entryId)).not.toContain(entry.id);
    });
  }
});

describe("scanYakki", () => {
  it("空文字なら何も返さない", () => {
    expect(scanYakki("")).toEqual([]);
  });

  it("複数の指摘を出現順に並べる", () => {
    const text = "副作用がありません。さらにシミの改善に効果があります。";
    const hits = scanYakki(text);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.map((h) => h.index)).toEqual([...hits.map((h) => h.index)].sort((a, b) => a - b));
    expect(hits[0].entryId).toBe("no_side_effect");
  });

  it("同じ表現が並んでも 1 項目あたりの上限で打ち切る", () => {
    const text = "効果があります。".repeat(MAX_HITS_PER_ENTRY + 10);
    const hits = scanYakki(text).filter((h) => h.entryId === "kouka_ari");
    expect(hits).toHaveLength(MAX_HITS_PER_ENTRY);
  });

  it("辞書を差し替えられる", () => {
    const hits = scanYakki("これは特別な表現です。", [
      {
        id: "custom",
        term: "特別",
        pattern: /特別/,
        category: "最大級・誇大表現",
        severity: "warn",
        reason: "理由",
        alternatives: ["言い換え"],
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].entryId).toBe("custom");
  });
});

describe("sentenceAt", () => {
  it("句点で区切って該当箇所を含む文を返す", () => {
    const text = "1文目です。2文目に効果があります。3文目です。";
    expect(sentenceAt(text, text.indexOf("効果"))).toBe("2文目に効果があります。");
  });

  it("改行も文の区切りとして扱う", () => {
    const text = "見出し\n本文に万能と書いてある";
    expect(sentenceAt(text, text.indexOf("万能"))).toBe("本文に万能と書いてある");
  });
});

describe("yakkiEntry", () => {
  it("ID で辞書を引ける", () => {
    expect(yakkiEntry("naoru")?.term).toBe("治る");
    expect(yakkiEntry("存在しない")).toBeUndefined();
  });
});
