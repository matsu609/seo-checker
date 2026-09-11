/**
 * 口コミ支援（アンケート QR）の質問・設定の形。クライアントでも読める純粋なデータと関数。
 *
 * 店舗が管理画面で作るアンケートの質問（評価スケール / 単一選択 / 複数選択 / 自由記述）と、
 * AI 下書きのトーン・含めたいキーワード・低評価の基準をここで定義する。
 * サーバーの保存（forms.ts）も公開 API（/api/r/[slug]）も同じスキーマで検証する。
 */
import { z } from "zod";

export const MAX_QUESTIONS = 8;
export const MAX_OPTIONS = 8;
export const LABEL_MAX = 120;
export const OPTION_MAX = 40;
export const TEXT_ANSWER_MAX = 500;
export const MAX_KEYWORDS = 5;
export const KEYWORD_MAX = 30;
export const TITLE_MAX = 60;
export const STORE_NAME_MAX = 100;
export const CHANNEL_LABEL_MAX = 30;
export const MAX_CHANNELS = 30;
export const DIRECT_MESSAGE_MAX = 1000;
export const DIRECT_CONTACT_MAX = 100;
export const DRAFT_MAX = 1200;
export const NOTE_MAX = 2000;

export const QUESTION_TYPES = ["rating", "single", "multi", "text"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  rating: "評価（1〜5）",
  single: "選択式（1 つ）",
  multi: "選択式（複数）",
  text: "自由記述",
};

const QUESTION_ID = /^[a-z0-9]{4,12}$/;

export const ReviewQuestionSchema = z.object({
  id: z.string().regex(QUESTION_ID, "質問の ID が正しくありません"),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1, "質問文を入力してください").max(LABEL_MAX),
  /** single / multi の選択肢。他の種類では空 */
  options: z.array(z.string().trim().min(1).max(OPTION_MAX)).max(MAX_OPTIONS).default([]),
  required: z.boolean().default(false),
});
export type ReviewQuestion = z.infer<typeof ReviewQuestionSchema>;

export const TONES = ["polite", "casual", "friendly"] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABELS: Record<Tone, string> = {
  polite: "丁寧（です・ます）",
  casual: "カジュアル（話し言葉）",
  friendly: "親しみやすい（です・ます + 感情）",
};

export const INDUSTRIES = ["restaurant", "salon", "clinic", "other"] as const;
export type Industry = (typeof INDUSTRIES)[number];
export const INDUSTRY_LABELS: Record<Industry, string> = {
  restaurant: "飲食",
  salon: "サロン（美容室・ネイル・エステ）",
  clinic: "クリニック",
  other: "その他",
};

export const ReviewFormSettingsSchema = z.object({
  industry: z.enum(INDUSTRIES).default("other"),
  tone: z.enum(TONES).default("polite"),
  /** AI 下書きに自然に含めたい語（店名・看板メニューなど）。無理には入れない */
  keywords: z.array(z.string().trim().min(1).max(KEYWORD_MAX)).max(MAX_KEYWORDS).default([]),
  /** この値以下の評価を「低評価」として店舗に先に知らせ、「お店に直接伝える」を出す */
  lowRatingMax: z.number().int().min(1).max(4).default(2),
});
export type ReviewFormSettings = z.infer<typeof ReviewFormSettingsSchema>;

export const QuestionsSchema = z
  .array(ReviewQuestionSchema)
  .min(1, "質問を 1 つ以上作ってください")
  .max(MAX_QUESTIONS, `質問は ${MAX_QUESTIONS} 問までです`)
  .superRefine((qs, ctx) => {
    const ids = new Set<string>();
    let ratings = 0;
    qs.forEach((q, i) => {
      if (ids.has(q.id)) ctx.addIssue({ code: "custom", message: "質問の ID が重複しています", path: [i, "id"] });
      ids.add(q.id);
      if (q.type === "rating") ratings += 1;
      if ((q.type === "single" || q.type === "multi") && q.options.length < 2) {
        ctx.addIssue({ code: "custom", message: "選択式の質問には選択肢を 2 つ以上入れてください", path: [i, "options"] });
      }
    });
    if (ratings > 1) ctx.addIssue({ code: "custom", message: "評価（1〜5）の質問は 1 つだけにしてください" });
  });

/** 回答の形（質問 ID → 値）。検証は validateAnswers で質問の定義と突き合わせる */
export type AnswerValue = number | string | string[];
export type Answers = Record<string, AnswerValue>;

export const RawAnswersSchema = z.record(
  z.string().regex(QUESTION_ID),
  z.union([z.number(), z.string().max(TEXT_ANSWER_MAX), z.array(z.string().max(OPTION_MAX)).max(MAX_OPTIONS)]),
);

export interface ValidatedAnswers {
  answers: Answers;
  /** 評価スケールの答え（無ければ null） */
  rating: number | null;
}

/**
 * 回答を質問の定義で検証する。知らない質問 ID は捨て、型が合わなければエラー文を返す。
 * 必須が空ならエラー。純粋関数。
 */
export function validateAnswers(questions: readonly ReviewQuestion[], raw: Record<string, unknown>): ValidatedAnswers | { error: string } {
  const answers: Answers = {};
  let rating: number | null = null;
  for (const q of questions) {
    const v = raw[q.id];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) return { error: `「${q.label}」は必須です` };
      continue;
    }
    switch (q.type) {
      case "rating": {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) return { error: `「${q.label}」は 1〜5 で答えてください` };
        answers[q.id] = v;
        rating = v;
        break;
      }
      case "single": {
        if (typeof v !== "string" || !q.options.includes(v)) return { error: `「${q.label}」の選択肢が正しくありません` };
        answers[q.id] = v;
        break;
      }
      case "multi": {
        if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && q.options.includes(x))) {
          return { error: `「${q.label}」の選択肢が正しくありません` };
        }
        answers[q.id] = Array.from(new Set(v as string[]));
        break;
      }
      case "text": {
        if (typeof v !== "string") return { error: `「${q.label}」は文章で答えてください` };
        const t = v.trim();
        if (t.length > TEXT_ANSWER_MAX) return { error: `「${q.label}」は ${TEXT_ANSWER_MAX} 文字までです` };
        if (t.length === 0) {
          if (q.required) return { error: `「${q.label}」は必須です` };
          continue;
        }
        answers[q.id] = t;
        break;
      }
    }
  }
  return { answers, rating };
}

/** 評価が「低評価」か（評価の質問が無ければ false） */
export function isLowRating(rating: number | null, settings: Pick<ReviewFormSettings, "lowRatingMax">): boolean {
  return rating !== null && rating <= settings.lowRatingMax;
}

/** 質問 ID（8 文字の英数字）。ブラウザでもサーバーでも使えるよう Math.random ベース */
export function newQuestionId(random: () => number = Math.random): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(random() * chars.length)];
  return out;
}

/** 「店名, 看板メニュー」のような文字列 → キーワード配列（重複・空を除き、上限まで） */
export function parseKeywords(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,、\n]/)) {
    const k = raw.trim().slice(0, KEYWORD_MAX);
    if (k && !out.includes(k)) out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/* ───────────── 業種別テンプレート ───────────── */

export interface QuestionTemplate {
  industry: Industry;
  /** 画面に出す名前 */
  label: string;
  questions: readonly Omit<ReviewQuestion, "id">[];
}

const q = (type: QuestionType, label: string, options: string[] = [], required = false): Omit<ReviewQuestion, "id"> => ({
  type,
  label,
  options,
  required,
});

/**
 * 体験を思い出す順に並べた質問の組。人間が書いた自然な体験の口コミになるよう、
 * 「良かった点」「気になった点」を自由記述で分けて置く。
 */
export const QUESTION_TEMPLATES: readonly QuestionTemplate[] = [
  {
    industry: "restaurant",
    label: "飲食店",
    questions: [
      q("rating", "今日のご来店の満足度を教えてください", [], true),
      q("multi", "特に良かったのはどれですか？", ["味", "量・ボリューム", "価格", "提供の速さ", "接客", "店内の雰囲気", "清潔さ"]),
      q("single", "どなたとご来店されましたか？", ["ひとり", "家族", "友人", "仕事関係", "その他"]),
      q("text", "召し上がったメニューや、良かった点を教えてください"),
      q("text", "気になった点・改善してほしい点があれば教えてください"),
    ],
  },
  {
    industry: "salon",
    label: "サロン（美容室・ネイル・エステ）",
    questions: [
      q("rating", "本日の仕上がりの満足度を教えてください", [], true),
      q("multi", "良かったのはどれですか？", ["仕上がり", "カウンセリング", "施術中の説明", "待ち時間", "店内の雰囲気", "料金"]),
      q("single", "次回もご利用いただけそうですか？", ["ぜひ", "たぶん", "わからない", "いいえ"]),
      q("text", "受けたメニューや、仕上がり・施術で良かった点を教えてください"),
      q("text", "気になった点・次回に向けてのご要望があれば教えてください"),
    ],
  },
  {
    industry: "clinic",
    label: "クリニック",
    questions: [
      q("rating", "本日のご来院の満足度を教えてください", [], true),
      q("multi", "良かったのはどれですか？", ["受付の対応", "説明のわかりやすさ", "待ち時間", "院内の清潔さ", "予約の取りやすさ", "スタッフの対応"]),
      q("single", "ご来院のきっかけは？", ["近所だから", "紹介", "ネットで検索", "口コミを見て", "その他"]),
      q("text", "受診して良かった点を教えてください（症状や治療の内容は書かなくて構いません）"),
      q("text", "気になった点・改善してほしい点があれば教えてください"),
    ],
  },
  {
    industry: "other",
    label: "汎用",
    questions: [
      q("rating", "本日の満足度を教えてください", [], true),
      q("multi", "良かったのはどれですか？", ["サービスの内容", "スタッフの対応", "価格", "待ち時間", "雰囲気", "清潔さ"]),
      q("text", "良かった点を教えてください"),
      q("text", "気になった点・改善してほしい点があれば教えてください"),
    ],
  },
];

export function templateFor(industry: Industry): QuestionTemplate {
  return QUESTION_TEMPLATES.find((t) => t.industry === industry) ?? QUESTION_TEMPLATES[QUESTION_TEMPLATES.length - 1]!;
}

/** テンプレートから質問（ID 付き）を作る */
export function questionsFromTemplate(industry: Industry, random: () => number = Math.random): ReviewQuestion[] {
  const used = new Set<string>();
  return templateFor(industry).questions.map((t, i) => {
    let id = newQuestionId(random);
    // 乱数が偏っても止まらないよう、衝突したら連番で逃がす（質問は最大 8 問）
    if (used.has(id)) id = `${id.slice(0, 6)}${String(i).padStart(2, "0")}`;
    used.add(id);
    return { id, type: t.type, label: t.label, options: [...t.options], required: t.required };
  });
}

/** 回答を「質問文: 答え」の行に（画面・CSV・AI の入力で共用） */
export function answerLines(questions: readonly ReviewQuestion[], answers: Answers): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const q of questions) {
    const v = answers[q.id];
    if (v === undefined) continue;
    const value = Array.isArray(v) ? v.join("、") : typeof v === "number" ? `${v} / 5` : v;
    out.push({ label: q.label, value });
  }
  return out;
}
