/**
 * 来店客向けアンケート（/r/<slug>）の多言語化。クライアントでも読める純粋なデータと関数。
 *
 * - 対応言語は 5 つ（日本語・英語・中国語 簡体 / 繁体・韓国語）。端末の言語（Accept-Language）で自動判定し、
 *   画面の切替（?lang=）で上書きできる。判定できなければ日本語。
 * - 画面の固定文言（UI）はここの辞書。質問文と選択肢は、業種テンプレートの文言ならここの静的な訳、
 *   店舗が書き換えた文言は AI 訳（サーバーの translate.ts。結果はアンケートに保存して使い回す）。
 * - 回答の選択肢は「表示は訳、送る値は日本語の原文」にする（店舗側の画面・CSV・集計は日本語のまま）。
 */

export const SURVEY_LOCALES = ["ja", "en", "zh-Hans", "zh-Hant", "ko"] as const;
export type SurveyLocale = (typeof SURVEY_LOCALES)[number];
export const DEFAULT_LOCALE: SurveyLocale = "ja";

/** 切替メニューに出す自国語の名前 */
export const LOCALE_NAMES: Record<SurveyLocale, string> = {
  ja: "日本語",
  en: "English",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ko: "한국어",
};

/** 店舗側の画面に出す日本語の名前 */
export const LOCALE_LABELS_JA: Record<SurveyLocale, string> = {
  ja: "日本語",
  en: "英語",
  "zh-Hans": "中国語（簡体）",
  "zh-Hant": "中国語（繁体）",
  ko: "韓国語",
};

/** AI に「この言語で書く」と指示するときの名前 */
export const LOCALE_NAMES_FOR_AI: Record<SurveyLocale, string> = {
  ja: "日本語",
  en: "英語（English）",
  "zh-Hans": "簡体字中国語（简体中文）",
  "zh-Hant": "繁体字中国語（繁體中文。台湾・香港向けの語彙）",
  ko: "韓国語（한국어）",
};

/** `<html lang>` / `<main lang>` に入れる BCP 47 タグ */
export const LOCALE_HTML_LANG: Record<SurveyLocale, string> = {
  ja: "ja",
  en: "en",
  "zh-Hans": "zh-Hans",
  "zh-Hant": "zh-Hant",
  ko: "ko",
};

export function isSurveyLocale(value: unknown): value is SurveyLocale {
  return typeof value === "string" && (SURVEY_LOCALES as readonly string[]).includes(value);
}

/** 1 つの言語タグ（"zh-TW" など）→ 対応言語。合わなければ null */
export function matchLocale(tag: string): SurveyLocale | null {
  const t = tag.trim().toLowerCase();
  if (!t) return null;
  if (t === "ja" || t.startsWith("ja-")) return "ja";
  if (t === "en" || t.startsWith("en-")) return "en";
  if (t === "ko" || t.startsWith("ko-")) return "ko";
  if (t === "zh" || t.startsWith("zh-")) {
    // 繁体: zh-Hant*、zh-TW、zh-HK、zh-MO。それ以外の中国語は簡体
    if (/^zh-(hant|tw|hk|mo)(-|$)/.test(t)) return "zh-Hant";
    return "zh-Hans";
  }
  return null;
}

/** ?lang= の値（画面の切替）→ 対応言語。"zh" のような短い形も受ける */
export function localeFromParam(value: unknown): SurveyLocale | null {
  if (typeof value !== "string") return null;
  if (isSurveyLocale(value)) return value;
  return matchLocale(value);
}

/**
 * Accept-Language（"zh-TW,zh;q=0.9,en;q=0.8"）→ 最も優先度の高い対応言語。
 * 端末の言語設定がそのまま入る（iPhone / Android のブラウザは OS の言語を送る）。
 */
export function localeFromAcceptLanguage(header: string | null | undefined): SurveyLocale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.split(";");
      let q = 1;
      for (const p of params) {
        const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p);
        if (m) q = Number.parseFloat(m[1]!) || 0;
      }
      return { tag: tag.trim(), q, index };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    if (tag === "*") continue;
    const l = matchLocale(tag);
    if (l) return l;
  }
  return null;
}

/** 画面の言語を決める: ?lang= → Accept-Language → 日本語 */
export function resolveSurveyLocale(param: unknown, acceptLanguage: string | null | undefined): SurveyLocale {
  return localeFromParam(param) ?? localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/* ───────────── 画面の固定文言 ───────────── */

export interface SurveyStrings {
  pageTitle: string;
  eyebrow: string;
  fallbackTitle: string;
  languageLabel: string;
  intro: string;
  questionPrefix: string;
  required: string;
  ratingLabels: [string, string, string, string, string];
  textPlaceholder: string;
  submit: string;
  sending: string;
  footer: string;
  privacy: string;
  errorRequired: (label: string) => string;
  errorAtLeastOne: string;
  errorSendFailed: string;
  errorHttp: (status: number) => string;
  cannotShow: string;
  notFound: string;
  loadFailed: string;
  preparing: string;
  doneTitle: string;
  doneBody: string;
  draftTitle: string;
  draftHintAi: string;
  draftHintFallback: string;
  draftAria: string;
  postToGoogle: string;
  tellStore: string;
  copied: string;
  notCopied: string;
  afterClick: string;
  disclaimer: string;
  directTitle: string;
  directHint: string;
  directMessage: string;
  directContact: string;
  directContactHint: string;
  directRequired: string;
  send: string;
  back: string;
  directSentTitle: string;
  directSentBody: string;
}

const JA: SurveyStrings = {
  pageTitle: "ご来店アンケート",
  eyebrow: "ご来店アンケート",
  fallbackTitle: "アンケート",
  languageLabel: "言語",
  intro: "本日はご来店ありがとうございます。1 分ほどのアンケートにご協力ください。いただいた内容はお店に届きます。",
  questionPrefix: "Q",
  required: "必須",
  ratingLabels: ["不満", "やや不満", "ふつう", "満足", "とても満足"],
  textPlaceholder: "思い出したことを、そのままの言葉で",
  submit: "送信する",
  sending: "送信しています…",
  footer: "この画面は SEO 研究所が提供するアンケートです。回答は店舗に届き、店舗の改善に使われます。",
  privacy: "プライバシーポリシー",
  errorRequired: (label) => `「${label}」に答えてください。`,
  errorAtLeastOne: "1 つ以上の質問に答えてください。",
  errorSendFailed: "送信に失敗しました",
  errorHttp: (status) => `送信に失敗しました（HTTP ${status}）`,
  cannotShow: "アンケートを表示できません",
  notFound: "このアンケートは見つかりません（終了した可能性があります）。",
  loadFailed: "アンケートを読み込めませんでした。しばらくしてからもう一度お試しください。",
  preparing: "このアンケートは現在準備中です。",
  doneTitle: "店舗にフィードバックを送信しました",
  doneBody: "ご協力ありがとうございます。いただいた内容はお店に届きました。",
  draftTitle: "口コミの下書き",
  draftHintAi: "ご回答をもとに下書きを作りました。内容はご自身の体験に合わせて自由に書き換えてください。そのまま使うこともできます。",
  draftHintFallback: "ご回答の文章をそのまま並べています。自由に書き換えてお使いください。",
  draftAria: "口コミの下書き",
  postToGoogle: "Google マップに投稿する",
  tellStore: "お店に直接伝える",
  copied: "下書きをコピーしました。",
  notCopied: "下書きは上の欄にあります。",
  afterClick: "Google マップの投稿画面が開くので、本文を貼り付けて、ご自身の判断で投稿してください。投稿するかどうかはご自由です。",
  disclaimer: "口コミの投稿は任意です。投稿の有無で特典や扱いが変わることはありません。投稿される場合は、実際の体験にもとづく内容にしてください。",
  directTitle: "お店に直接伝える",
  directHint: "ここに書いた内容は公開されず、お店にだけ届きます。",
  directMessage: "お伝えしたい内容",
  directContact: "連絡先（任意）",
  directContactHint: "お店から返事が必要な場合だけ、メールアドレスか電話番号を入力してください",
  directRequired: "お伝えしたい内容を入力してください。",
  send: "送信する",
  back: "戻る",
  directSentTitle: "お店に送信しました",
  directSentBody: "ご意見をありがとうございます。お店が確認し、改善に活かします。",
};

const EN: SurveyStrings = {
  pageTitle: "Customer survey",
  eyebrow: "Customer survey",
  fallbackTitle: "Survey",
  languageLabel: "Language",
  intro: "Thank you for visiting us today. This survey takes about a minute. Your answers go straight to the business.",
  questionPrefix: "Q",
  required: "Required",
  ratingLabels: ["Poor", "Fair", "Okay", "Good", "Excellent"],
  textPlaceholder: "In your own words, whatever comes to mind",
  submit: "Send",
  sending: "Sending…",
  footer: "This survey is provided by SEO Kenkyujo. Your answers are delivered to the business and used to improve its service.",
  privacy: "Privacy policy",
  errorRequired: (label) => `Please answer “${label}”.`,
  errorAtLeastOne: "Please answer at least one question.",
  errorSendFailed: "Sending failed",
  errorHttp: (status) => `Sending failed (HTTP ${status})`,
  cannotShow: "This survey can’t be shown",
  notFound: "This survey was not found (it may have ended).",
  loadFailed: "The survey could not be loaded. Please try again in a moment.",
  preparing: "This survey is not ready yet.",
  doneTitle: "Your feedback was sent to the business",
  doneBody: "Thank you. Your answers have been delivered to the business.",
  draftTitle: "Review draft",
  draftHintAi: "We wrote a draft from your answers. Feel free to edit it to match your own experience, or use it as is.",
  draftHintFallback: "This is your written answers as you typed them. Edit freely.",
  draftAria: "Review draft",
  postToGoogle: "Post on Google Maps",
  tellStore: "Tell the business directly",
  copied: "The draft was copied.",
  notCopied: "The draft is in the box above.",
  afterClick: "The Google Maps review screen will open. Paste the text and decide for yourself whether to post. Posting is entirely optional.",
  disclaimer: "Posting a review is optional. Whether you post or not does not change any offer or treatment. If you post, please describe your actual experience.",
  directTitle: "Tell the business directly",
  directHint: "What you write here is not published. Only the business will see it.",
  directMessage: "Your message",
  directContact: "Contact (optional)",
  directContactHint: "Only if you want a reply: an email address or phone number",
  directRequired: "Please enter your message.",
  send: "Send",
  back: "Back",
  directSentTitle: "Sent to the business",
  directSentBody: "Thank you for your feedback. The business will read it and use it to improve.",
};

const ZH_HANS: SurveyStrings = {
  pageTitle: "到店问卷",
  eyebrow: "到店问卷",
  fallbackTitle: "问卷",
  languageLabel: "语言",
  intro: "感谢您今天光临。问卷大约需要 1 分钟，您的回答会直接送达店铺。",
  questionPrefix: "Q",
  required: "必填",
  ratingLabels: ["不满意", "不太满意", "一般", "满意", "非常满意"],
  textPlaceholder: "想到什么就写什么，用您自己的话",
  submit: "提交",
  sending: "正在提交…",
  footer: "本问卷由 SEO 研究所提供。您的回答将送达店铺，用于改进服务。",
  privacy: "隐私政策",
  errorRequired: (label) => `请回答「${label}」。`,
  errorAtLeastOne: "请至少回答一个问题。",
  errorSendFailed: "提交失败",
  errorHttp: (status) => `提交失败（HTTP ${status}）`,
  cannotShow: "无法显示问卷",
  notFound: "找不到此问卷（可能已经结束）。",
  loadFailed: "问卷加载失败，请稍后再试。",
  preparing: "此问卷尚在准备中。",
  doneTitle: "您的反馈已发送给店铺",
  doneBody: "感谢您的配合，您的回答已送达店铺。",
  draftTitle: "评价草稿",
  draftHintAi: "我们根据您的回答写了一份草稿。请按您的真实体验自由修改，也可以直接使用。",
  draftHintFallback: "这里按原样列出了您填写的内容，请自由修改后使用。",
  draftAria: "评价草稿",
  postToGoogle: "发布到 Google 地图",
  tellStore: "直接告诉店铺",
  copied: "草稿已复制。",
  notCopied: "草稿在上方的输入框里。",
  afterClick: "接下来会打开 Google 地图的评价页面。请粘贴正文，并由您自行决定是否发布。是否发布完全自愿。",
  disclaimer: "发布评价完全自愿。是否发布不会影响任何优惠或待遇。如需发布，请根据您的真实体验撰写。",
  directTitle: "直接告诉店铺",
  directHint: "此处的内容不会公开，只有店铺能看到。",
  directMessage: "想告诉店铺的内容",
  directContact: "联系方式（可选）",
  directContactHint: "仅在需要店铺回复时填写邮箱或电话",
  directRequired: "请输入想告诉店铺的内容。",
  send: "发送",
  back: "返回",
  directSentTitle: "已发送给店铺",
  directSentBody: "感谢您的意见。店铺会确认并用于改进。",
};

const ZH_HANT: SurveyStrings = {
  pageTitle: "來店問卷",
  eyebrow: "來店問卷",
  fallbackTitle: "問卷",
  languageLabel: "語言",
  intro: "感謝您今天光臨。問卷大約需要 1 分鐘，您的回答會直接送達店家。",
  questionPrefix: "Q",
  required: "必填",
  ratingLabels: ["不滿意", "不太滿意", "普通", "滿意", "非常滿意"],
  textPlaceholder: "想到什麼就寫什麼，用您自己的話",
  submit: "送出",
  sending: "正在送出…",
  footer: "本問卷由 SEO 研究所提供。您的回答將送達店家，用於改善服務。",
  privacy: "隱私權政策",
  errorRequired: (label) => `請回答「${label}」。`,
  errorAtLeastOne: "請至少回答一個問題。",
  errorSendFailed: "送出失敗",
  errorHttp: (status) => `送出失敗（HTTP ${status}）`,
  cannotShow: "無法顯示問卷",
  notFound: "找不到此問卷（可能已經結束）。",
  loadFailed: "問卷載入失敗，請稍後再試。",
  preparing: "此問卷尚在準備中。",
  doneTitle: "您的意見已送達店家",
  doneBody: "感謝您的協助，您的回答已送達店家。",
  draftTitle: "評論草稿",
  draftHintAi: "我們根據您的回答寫了一份草稿。請依您的真實體驗自由修改，也可以直接使用。",
  draftHintFallback: "這裡照原樣列出了您填寫的內容，請自由修改後使用。",
  draftAria: "評論草稿",
  postToGoogle: "發布到 Google 地圖",
  tellStore: "直接告訴店家",
  copied: "草稿已複製。",
  notCopied: "草稿在上方的輸入框裡。",
  afterClick: "接下來會開啟 Google 地圖的評論頁面。請貼上內容，並由您自行決定是否發布。是否發布完全自願。",
  disclaimer: "發布評論完全自願。是否發布不會影響任何優惠或待遇。如要發布，請依您的真實體驗撰寫。",
  directTitle: "直接告訴店家",
  directHint: "此處的內容不會公開，只有店家能看到。",
  directMessage: "想告訴店家的內容",
  directContact: "聯絡方式（選填）",
  directContactHint: "僅在需要店家回覆時填寫電子郵件或電話",
  directRequired: "請輸入想告訴店家的內容。",
  send: "送出",
  back: "返回",
  directSentTitle: "已送出給店家",
  directSentBody: "感謝您的意見。店家會確認並用於改善。",
};

const KO: SurveyStrings = {
  pageTitle: "방문 설문",
  eyebrow: "방문 설문",
  fallbackTitle: "설문",
  languageLabel: "언어",
  intro: "오늘 방문해 주셔서 감사합니다. 1분 정도의 설문에 협조해 주세요. 답변은 매장에 전달됩니다.",
  questionPrefix: "Q",
  required: "필수",
  ratingLabels: ["불만", "약간 불만", "보통", "만족", "매우 만족"],
  textPlaceholder: "떠오르는 대로, 자신의 말로 적어 주세요",
  submit: "보내기",
  sending: "보내는 중…",
  footer: "이 설문은 SEO 연구소가 제공합니다. 답변은 매장에 전달되어 서비스 개선에 사용됩니다.",
  privacy: "개인정보 처리방침",
  errorRequired: (label) => `「${label}」에 답해 주세요.`,
  errorAtLeastOne: "질문에 하나 이상 답해 주세요.",
  errorSendFailed: "전송에 실패했습니다",
  errorHttp: (status) => `전송에 실패했습니다 (HTTP ${status})`,
  cannotShow: "설문을 표시할 수 없습니다",
  notFound: "이 설문을 찾을 수 없습니다 (종료되었을 수 있습니다).",
  loadFailed: "설문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  preparing: "이 설문은 아직 준비 중입니다.",
  doneTitle: "매장에 피드백을 보냈습니다",
  doneBody: "협조해 주셔서 감사합니다. 답변이 매장에 전달되었습니다.",
  draftTitle: "리뷰 초안",
  draftHintAi: "답변을 바탕으로 초안을 작성했습니다. 실제 경험에 맞게 자유롭게 고쳐 쓰셔도 되고, 그대로 사용하셔도 됩니다.",
  draftHintFallback: "작성하신 답변을 그대로 나열했습니다. 자유롭게 고쳐서 사용해 주세요.",
  draftAria: "리뷰 초안",
  postToGoogle: "Google 지도에 게시하기",
  tellStore: "매장에 직접 전하기",
  copied: "초안을 복사했습니다.",
  notCopied: "초안은 위 입력란에 있습니다.",
  afterClick: "Google 지도의 리뷰 작성 화면이 열립니다. 본문을 붙여넣고 게시 여부는 직접 판단해 주세요. 게시는 자유입니다.",
  disclaimer: "리뷰 게시는 선택 사항입니다. 게시 여부에 따라 혜택이나 대우가 달라지지 않습니다. 게시하실 경우 실제 경험에 근거해 작성해 주세요.",
  directTitle: "매장에 직접 전하기",
  directHint: "여기에 적은 내용은 공개되지 않고 매장에만 전달됩니다.",
  directMessage: "전하고 싶은 내용",
  directContact: "연락처 (선택)",
  directContactHint: "매장의 답변이 필요한 경우에만 이메일 주소나 전화번호를 입력해 주세요",
  directRequired: "전하고 싶은 내용을 입력해 주세요.",
  send: "보내기",
  back: "뒤로",
  directSentTitle: "매장에 보냈습니다",
  directSentBody: "의견 감사합니다. 매장에서 확인하고 개선에 활용하겠습니다.",
};

export const SURVEY_STRINGS: Record<SurveyLocale, SurveyStrings> = { ja: JA, en: EN, "zh-Hans": ZH_HANS, "zh-Hant": ZH_HANT, ko: KO };

export function surveyStrings(locale: SurveyLocale): SurveyStrings {
  return SURVEY_STRINGS[locale] ?? JA;
}

/* ───────────── 業種テンプレートの文言の静的な訳 ───────────── */

type Translated = Record<Exclude<SurveyLocale, "ja">, string>;

/** 日本語の原文 → 各言語（質問文と選択肢。questions.ts のテンプレートと一致させる） */
const STATIC: Record<string, Translated> = {
  // 飲食
  "今日のご来店の満足度を教えてください": { en: "How satisfied were you with your visit today?", "zh-Hans": "请为今天的到店体验打分", "zh-Hant": "請為今天的來店體驗評分", ko: "오늘 방문은 얼마나 만족하셨나요?" },
  "特に良かったのはどれですか？": { en: "What did you like most?", "zh-Hans": "您最满意的是哪些方面？", "zh-Hant": "您最滿意的是哪些方面？", ko: "특히 좋았던 점은 무엇인가요?" },
  "味": { en: "Taste", "zh-Hans": "味道", "zh-Hant": "味道", ko: "맛" },
  "量・ボリューム": { en: "Portion size", "zh-Hans": "分量", "zh-Hant": "份量", ko: "양" },
  "価格": { en: "Price", "zh-Hans": "价格", "zh-Hant": "價格", ko: "가격" },
  "提供の速さ": { en: "Speed of service", "zh-Hans": "上菜速度", "zh-Hant": "上菜速度", ko: "제공 속도" },
  "接客": { en: "Staff service", "zh-Hans": "服务态度", "zh-Hant": "服務態度", ko: "접객" },
  "店内の雰囲気": { en: "Atmosphere", "zh-Hans": "店内氛围", "zh-Hant": "店內氣氛", ko: "매장 분위기" },
  "清潔さ": { en: "Cleanliness", "zh-Hans": "整洁度", "zh-Hant": "整潔度", ko: "청결" },
  "どなたとご来店されましたか？": { en: "Who did you come with?", "zh-Hans": "您和谁一起来的？", "zh-Hant": "您和誰一起來的？", ko: "누구와 함께 방문하셨나요?" },
  "ひとり": { en: "Alone", "zh-Hans": "一个人", "zh-Hant": "一個人", ko: "혼자" },
  "家族": { en: "Family", "zh-Hans": "家人", "zh-Hant": "家人", ko: "가족" },
  "友人": { en: "Friends", "zh-Hans": "朋友", "zh-Hant": "朋友", ko: "친구" },
  "仕事関係": { en: "Colleagues / business", "zh-Hans": "同事・工作伙伴", "zh-Hant": "同事・工作夥伴", ko: "직장 동료" },
  "その他": { en: "Other", "zh-Hans": "其他", "zh-Hant": "其他", ko: "기타" },
  "召し上がったメニューや、良かった点を教えてください": { en: "What did you order, and what did you like?", "zh-Hans": "请告诉我们您点的菜品和满意之处", "zh-Hant": "請告訴我們您點的餐點和滿意之處", ko: "드신 메뉴와 좋았던 점을 알려 주세요" },
  "気になった点・改善してほしい点があれば教えてください": { en: "Anything that bothered you or could be improved?", "zh-Hans": "如有不满意或希望改进的地方，请告诉我们", "zh-Hant": "如有不滿意或希望改進的地方，請告訴我們", ko: "아쉬웠던 점이나 개선했으면 하는 점이 있으면 알려 주세요" },
  // サロン
  "本日の仕上がりの満足度を教えてください": { en: "How satisfied are you with today’s result?", "zh-Hans": "请为今天的完成效果打分", "zh-Hant": "請為今天的完成效果評分", ko: "오늘의 마무리 결과는 얼마나 만족하셨나요?" },
  "良かったのはどれですか？": { en: "What did you like?", "zh-Hans": "您满意的是哪些方面？", "zh-Hant": "您滿意的是哪些方面？", ko: "좋았던 점은 무엇인가요?" },
  "仕上がり": { en: "Result", "zh-Hans": "完成效果", "zh-Hant": "完成效果", ko: "마무리 결과" },
  "カウンセリング": { en: "Consultation", "zh-Hans": "咨询沟通", "zh-Hant": "諮詢溝通", ko: "상담" },
  "施術中の説明": { en: "Explanations during the service", "zh-Hans": "过程中的说明", "zh-Hant": "過程中的說明", ko: "시술 중 설명" },
  "待ち時間": { en: "Waiting time", "zh-Hans": "等待时间", "zh-Hant": "等候時間", ko: "대기 시간" },
  "料金": { en: "Price", "zh-Hans": "价格", "zh-Hant": "價格", ko: "요금" },
  "次回もご利用いただけそうですか？": { en: "Would you come again?", "zh-Hans": "下次还会再来吗？", "zh-Hant": "下次還會再來嗎？", ko: "다음에도 이용하실 것 같나요?" },
  "ぜひ": { en: "Definitely", "zh-Hans": "一定会", "zh-Hant": "一定會", ko: "꼭" },
  "たぶん": { en: "Probably", "zh-Hans": "可能会", "zh-Hant": "可能會", ko: "아마도" },
  "わからない": { en: "Not sure", "zh-Hans": "不确定", "zh-Hant": "不確定", ko: "모르겠다" },
  "いいえ": { en: "No", "zh-Hans": "不会", "zh-Hant": "不會", ko: "아니요" },
  "受けたメニューや、仕上がり・施術で良かった点を教えてください": { en: "Which service did you have, and what did you like about the result or the treatment?", "zh-Hans": "请告诉我们您做的项目，以及效果或服务中满意的地方", "zh-Hant": "請告訴我們您做的項目，以及效果或服務中滿意的地方", ko: "받으신 메뉴와 결과・시술에서 좋았던 점을 알려 주세요" },
  "気になった点・次回に向けてのご要望があれば教えてください": { en: "Anything that bothered you, or requests for next time?", "zh-Hans": "如有不满意的地方或对下次的期望，请告诉我们", "zh-Hant": "如有不滿意的地方或對下次的期望，請告訴我們", ko: "아쉬웠던 점이나 다음을 위한 요청이 있으면 알려 주세요" },
  // クリニック
  "本日のご来院の満足度を教えてください": { en: "How satisfied were you with today’s visit?", "zh-Hans": "请为今天的就诊体验打分", "zh-Hant": "請為今天的就診體驗評分", ko: "오늘 내원은 얼마나 만족하셨나요?" },
  "受付の対応": { en: "Reception", "zh-Hans": "前台接待", "zh-Hant": "櫃檯接待", ko: "접수 응대" },
  "説明のわかりやすさ": { en: "Clear explanations", "zh-Hans": "说明是否清楚", "zh-Hant": "說明是否清楚", ko: "설명의 이해하기 쉬움" },
  "院内の清潔さ": { en: "Cleanliness", "zh-Hans": "院内整洁度", "zh-Hant": "院內整潔度", ko: "원내 청결" },
  "予約の取りやすさ": { en: "Ease of booking", "zh-Hans": "预约方便程度", "zh-Hant": "預約方便程度", ko: "예약의 편리함" },
  "スタッフの対応": { en: "Staff", "zh-Hans": "工作人员的应对", "zh-Hant": "工作人員的應對", ko: "직원 응대" },
  "ご来院のきっかけは？": { en: "How did you find us?", "zh-Hans": "您是如何知道本院的？", "zh-Hant": "您是如何知道本院的？", ko: "내원하게 된 계기는?" },
  "近所だから": { en: "Nearby", "zh-Hans": "离得近", "zh-Hant": "離得近", ko: "가까워서" },
  "紹介": { en: "Referral", "zh-Hans": "他人介绍", "zh-Hant": "他人介紹", ko: "소개" },
  "ネットで検索": { en: "Web search", "zh-Hans": "网上搜索", "zh-Hant": "網路搜尋", ko: "인터넷 검색" },
  "口コミを見て": { en: "Reviews", "zh-Hans": "看了评价", "zh-Hant": "看了評論", ko: "리뷰를 보고" },
  "受診して良かった点を教えてください（症状や治療の内容は書かなくて構いません）": { en: "What was good about your visit? (No need to describe symptoms or treatment)", "zh-Hans": "请告诉我们就诊中满意的地方（无需写症状或治疗内容）", "zh-Hant": "請告訴我們就診中滿意的地方（無需寫症狀或治療內容）", ko: "진료에서 좋았던 점을 알려 주세요 (증상이나 치료 내용은 쓰지 않으셔도 됩니다)" },
  // 汎用
  "本日の満足度を教えてください": { en: "How satisfied were you today?", "zh-Hans": "请为今天的体验打分", "zh-Hant": "請為今天的體驗評分", ko: "오늘은 얼마나 만족하셨나요?" },
  "サービスの内容": { en: "Service", "zh-Hans": "服务内容", "zh-Hant": "服務內容", ko: "서비스 내용" },
  "雰囲気": { en: "Atmosphere", "zh-Hans": "氛围", "zh-Hant": "氣氛", ko: "분위기" },
  "良かった点を教えてください": { en: "What did you like?", "zh-Hans": "请告诉我们满意的地方", "zh-Hant": "請告訴我們滿意的地方", ko: "좋았던 점을 알려 주세요" },
  // 作成時の既定のアンケート名
  "ご来店アンケート": { en: "Customer survey", "zh-Hans": "到店问卷", "zh-Hant": "來店問卷", ko: "방문 설문" },
};

/** テンプレートの文言なら訳を返す。店舗が書き換えた文言なら null（AI 訳の対象） */
export function staticTranslation(text: string, locale: SurveyLocale): string | null {
  if (locale === "ja") return text;
  return STATIC[text.trim()]?.[locale] ?? null;
}
