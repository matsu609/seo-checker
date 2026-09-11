/**
 * 質問・回答の検証と業種テンプレート。来店客の入力はここで必ず質問の定義と突き合わせる。
 */
import { describe, expect, it } from "vitest";
import {
  answerLines,
  INDUSTRIES,
  isLowRating,
  MAX_QUESTIONS,
  parseKeywords,
  QUESTION_TEMPLATES,
  QuestionsSchema,
  questionsFromTemplate,
  validateAnswers,
  type ReviewQuestion,
} from "../questions";

const QS: ReviewQuestion[] = [
  { id: "rating01", type: "rating", label: "満足度", options: [], required: true },
  { id: "multi001", type: "multi", label: "良かった点", options: ["味", "接客"], required: false },
  { id: "single01", type: "single", label: "誰と", options: ["ひとり", "家族"], required: false },
  { id: "text0001", type: "text", label: "感想", options: [], required: false },
];

describe("質問の定義", () => {
  it("評価の質問は 1 つだけ、選択式には選択肢 2 つ以上、ID は重複しない", () => {
    expect(QuestionsSchema.safeParse(QS).success).toBe(true);
    expect(QuestionsSchema.safeParse([...QS, { ...QS[0], id: "rating02" }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[1], options: ["味"] }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([QS[3], QS[3]]).success).toBe(false);
    expect(QuestionsSchema.safeParse([]).success).toBe(false);
    expect(QuestionsSchema.safeParse(Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) => ({ ...QS[3], id: `text${String(i).padStart(4, "0")}` }))).success).toBe(false);
  });

  it("業種ごとにテンプレートがあり、テンプレートは定義の検証を通る", () => {
    for (const industry of INDUSTRIES) {
      const qs = questionsFromTemplate(industry);
      expect(QuestionsSchema.safeParse(qs).success, industry).toBe(true);
      expect(qs.filter((q) => q.type === "rating")).toHaveLength(1);
      expect(qs.some((q) => q.type === "text"), industry).toBe(true);
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    }
    expect(QUESTION_TEMPLATES.map((t) => t.industry)).toEqual(["restaurant", "salon", "clinic", "other"]);
  });

  it("テンプレートの ID は乱数が同じでも衝突しない", () => {
    const qs = questionsFromTemplate("restaurant", () => 0.5);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });
});

describe("回答の検証", () => {
  it("種類ごとに値を検証し、知らない質問は捨てる", () => {
    const r = validateAnswers(QS, { rating01: 4, multi001: ["味", "味"], single01: "家族", text0001: " とても良かった ", unknown1: "x" });
    expect(r).toEqual({ answers: { rating01: 4, multi001: ["味"], single01: "家族", text0001: "とても良かった" }, rating: 4 });
  });

  it("必須が空ならエラー、型が合わなければエラー", () => {
    expect(validateAnswers(QS, {})).toEqual({ error: "「満足度」は必須です" });
    expect(validateAnswers(QS, { rating01: 6 })).toMatchObject({ error: expect.stringContaining("1〜5") });
    expect(validateAnswers(QS, { rating01: 3, single01: "他人" })).toMatchObject({ error: expect.stringContaining("選択肢") });
    expect(validateAnswers(QS, { rating01: 3, multi001: ["味", "他"] })).toMatchObject({ error: expect.stringContaining("選択肢") });
    expect(validateAnswers(QS, { rating01: 3, text0001: 12 })).toMatchObject({ error: expect.stringContaining("文章") });
  });

  it("評価の質問が無ければ rating は null で、低評価にはならない", () => {
    const r = validateAnswers([QS[3]], { text0001: "普通" });
    expect(r).toEqual({ answers: { text0001: "普通" }, rating: null });
    expect(isLowRating(null, { lowRatingMax: 2 })).toBe(false);
    expect(isLowRating(2, { lowRatingMax: 2 })).toBe(true);
    expect(isLowRating(3, { lowRatingMax: 2 })).toBe(false);
  });

  it("回答を「質問: 答え」の行にする", () => {
    expect(answerLines(QS, { rating01: 5, multi001: ["味", "接客"], text0001: "最高" })).toEqual([
      { label: "満足度", value: "5 / 5" },
      { label: "良かった点", value: "味、接客" },
      { label: "感想", value: "最高" },
    ]);
  });
});

describe("キーワード", () => {
  it("カンマ・読点・改行で区切り、重複と空を除き、上限まで", () => {
    expect(parseKeywords("〇〇食堂, 名物カレー、 名物カレー\n\n定食")).toEqual(["〇〇食堂", "名物カレー", "定食"]);
    expect(parseKeywords("a,b,c,d,e,f,g")).toHaveLength(5);
  });
});
