/**
 * ツールについてのアンケートの設問（純粋なデータ。クライアントでも読める）。
 *
 * **聞く相手は「このツールを使っている事業者」＝ B2B の B**（利用者の指示 2026-09-21）。
 * このサービスには相手の違う「聞く仕組み」が 3 つあるので、混ぜないこと:
 *
 *   ① 来店客アンケート（`src/lib/reviews/`）… 相手は**お客様のお店に来た人（C）**。QR から答える。口コミを増やすための仕組み
 *   ② ご意見・不具合（`src/lib/feedback/`）  … 相手は **B**。**向こうから言いたいときに**送る（受け身）
 *   ③ このアンケート（ここ）                  … 相手は **B**。**こちらから時期を決めて聞く**（能動）。次に作る機能を決める材料
 *
 * お客様カルテ（`src/lib/karte/`）とも別物。カルテは「お店のこと」を聞いて AI の文章を良くするもので、
 * こちらは「ツールのこと」を聞いて**サービスを良くする**もの。カルテの答えは AI に渡るが、
 * アンケートの答えは**運営者しか読まない**（AI には一切渡さない）。
 *
 * 設計の決まりごと:
 *   1. **1 回 4 問まで。**長いと答えてもらえない。聞きたいことは次の回に回す
 *   2. 時期ごとに聞くことを変える（使い始めの迷い → 続ける理由 → やめる理由）
 *   3. 選択肢だけで終わらせない。**自由記述を必ず入れる**（機能の名前は、こちらの語彙では出てこない）
 *   4. 答えない自由を残す（「あとで」で 14 日後に出し直す）
 *
 * 設問 ID は保存したデータのキーなので**変えない**。
 */

export type SurveyQuestionKind = "choice" | "short" | "long";

export interface SurveyQuestion {
  /** 保存のキー。**一度決めたら変えない** */
  id: string;
  label: string;
  /** 補足（画面の小さい文字） */
  hint?: string;
  kind: SurveyQuestionKind;
  options?: readonly string[];
  placeholder?: string;
  max: number;
}

export interface SurveyDefinition {
  id: string;
  label: string;
  /** 画面に出す 1 行（なぜ今これを聞くのか） */
  description: string;
  /** 登録から何日たったら聞くか */
  afterDays: number;
  questions: readonly SurveyQuestion[];
}

/** 1 回の設問数の上限（増やしたくなったら次の回へ） */
export const MAX_QUESTIONS_PER_SURVEY = 4;

export const SURVEYS: readonly SurveyDefinition[] = [
  {
    id: "start-14d",
    label: "使い始めて 2 週間のアンケート",
    description: "最初の 2 週間で迷ったところを教えてください。つまずく場所は、たいてい作った側からは見えていません。",
    afterDays: 14,
    questions: [
      {
        id: "expectation",
        label: "使ってみて、思っていたものと比べてどうでしたか",
        kind: "choice",
        options: ["思っていたより良かった", "思っていたとおり", "少し物足りない", "思っていたものと違った"],
        max: 40,
      },
      {
        id: "used-most",
        label: "いちばんよく開いている画面はどれですか",
        hint: "名前がうろ覚えでも「地図のやつ」で大丈夫です",
        kind: "short",
        placeholder: "例: Google マップの診断",
        max: 120,
      },
      {
        id: "confusing",
        label: "分かりにくかった・迷ったところ",
        hint: "言葉の意味、どこを押せばいいか、数字の読み方など。細かいことほど助かります",
        kind: "long",
        placeholder: "例: 「サイテーション」が何のことか分からなかった",
        max: 500,
      },
      {
        id: "want-now",
        label: "いま、いちばんほしい機能・してほしいこと",
        kind: "long",
        placeholder: "例: 毎月やることを 1 つだけ教えてほしい",
        max: 500,
      },
    ],
  },
  {
    id: "quarter-90d",
    label: "3 か月のアンケート",
    description: "3 か月お使いいただいた時点でのご感想をお聞かせください。続けるか迷われている点があれば、遠慮なく書いてください。",
    afterDays: 90,
    questions: [
      {
        id: "satisfaction",
        label: "いまの満足度",
        kind: "choice",
        options: ["とても満足", "満足", "ふつう", "やや不満", "不満"],
        max: 40,
      },
      {
        id: "recommend",
        label: "同業の知り合いに勧めたいと思いますか",
        kind: "choice",
        options: ["ぜひ勧めたい", "勧めてもよい", "どちらとも言えない", "勧めない"],
        max: 40,
      },
      {
        id: "churn-thought",
        label: "解約を考えたことはありますか。あれば、そのときの理由",
        hint: "正直に書いていただくほど助かります。ここを直せないサービスは続きません",
        kind: "long",
        placeholder: "例: 毎月見ているが、何が良くなったのか分からなかった",
        max: 500,
      },
      {
        id: "one-more",
        label: "あと 1 つだけ機能を足せるとしたら、何がいいですか",
        kind: "long",
        placeholder: "",
        max: 500,
      },
    ],
  },
  {
    id: "year-365d",
    label: "1 年のアンケート",
    description: "1 年お使いいただきありがとうございます。続けてくださっている理由をうかがわせてください。",
    afterDays: 365,
    questions: [
      {
        id: "changed",
        label: "この 1 年で変わったこと",
        hint: "数字でも、体感でも構いません",
        kind: "long",
        placeholder: "例: 予約の電話で「ホームページを見た」と言われることが増えた",
        max: 500,
      },
      {
        id: "why-continue",
        label: "続けてくださっている理由",
        kind: "long",
        placeholder: "",
        max: 500,
      },
      {
        id: "why-quit",
        label: "もしやめるとしたら、何が理由になりそうですか",
        kind: "long",
        placeholder: "",
        max: 500,
      },
      {
        id: "pitch",
        label: "同業の方に紹介するとしたら、どう説明しますか",
        hint: "いただいた言葉を、そのままご案内の文章に使わせていただくことがあります",
        kind: "long",
        placeholder: "",
        max: 500,
      },
    ],
  },
];

export function findSurvey(id: string): SurveyDefinition | null {
  return SURVEYS.find((s) => s.id === id) ?? null;
}

export function findSurveyQuestion(surveyId: string, questionId: string): SurveyQuestion | null {
  return findSurvey(surveyId)?.questions.find((q) => q.id === questionId) ?? null;
}
