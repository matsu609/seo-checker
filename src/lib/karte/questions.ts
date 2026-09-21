/**
 * お客様カルテの設問（純粋なデータ。クライアントでも読める）。
 *
 * 利用者の決定 2026-09-21: 「個人開発ならではの差別化は、機能の数ではなく
 * 『お客様のことを分かっていること』で作る。お客様の意見を集める場所をしっかり作り、
 * 今後の機能追加・サービス改善・差別化・LTV 改善の起点にする」。
 *
 * 設問を足すときの決まりごと:
 *   1. **答えの行き先（どの機能の文章が良くなるか）を `usedBy` に必ず書く。**
 *      行き先の無い設問は「答えても何も起きないアンケート」になり、次から書いてもらえない。
 *   2. 画面には `why`（なぜ聞くか）を必ず出す。聞かれる理由が分かると答えの質が上がる。
 *   3. 必須にしない。部分的な回答でも `karteBrief()` はその分だけ文章を良くする。
 *   4. 業種別の設問は 3 問まで。多いと業種を増やすたびに保守が破綻する。
 *
 * 設問 ID は保存したデータのキーなので**変えない**（変えると過去の回答が読めなくなる）。
 */
import { STORE_TYPES, type StoreType } from "@/lib/free/lead";

/** 入力の種類 */
export type KarteQuestionKind = "short" | "long" | "choice";

/** 画面の区切り（この順に出す） */
export const KARTE_SECTIONS = [
  { id: "strength", label: "お店の強みと商品", description: "AI が書く文章が「どこにでもある一般論」にならないための土台です。" },
  { id: "customer", label: "お客様のこと", description: "誰に向けて書くかが決まると、原稿も口コミ返信も刺さる言葉になります。" },
  { id: "rhythm", label: "商売のリズムと競合", description: "季節と競合が分かると、提案する時期と内容が変わります。" },
  { id: "request", label: "ご要望・これまでのご経験", description: "いただいた声をもとに機能を足していきます。ここが一番ありがたい欄です。" },
] as const;

export type KarteSectionId = (typeof KARTE_SECTIONS)[number]["id"];

export interface KarteQuestion {
  /** 保存のキー。**一度決めたら変えない** */
  id: string;
  section: KarteSectionId;
  label: string;
  /** なぜ聞くか（画面に出す） */
  why: string;
  /** 答えを使う機能（画面に出す。行き先の無い設問は作らない） */
  usedBy: readonly string[];
  kind: KarteQuestionKind;
  /** kind: "choice" のとき */
  options?: readonly string[];
  placeholder?: string;
  max: number;
}

/** 全業種に共通の設問 */
export const COMMON_QUESTIONS: readonly KarteQuestion[] = [
  {
    id: "strength",
    section: "strength",
    label: "他店と違う、自慢できることを 3 つまで",
    why: "AI が書く文章の「芯」になります。ここが空だと、どの店にも当てはまる文章しか作れません。",
    usedBy: ["AI ライティング", "HP 改修提案", "口コミへの返信", "Google マップの総評"],
    kind: "long",
    placeholder: "例: 3 代続く自家製ダレ / 個室が 6 部屋ある / 22 時まで子連れ可",
    max: 400,
  },
  {
    id: "flagship",
    section: "strength",
    label: "一番来てほしいお客様に、選んでほしい商品・メニュー・サービス",
    why: "改修提案や原稿が「どこへ誘導するか」を決めます。売りたいものと導線がずれている店はとても多いです。",
    usedBy: ["HP 改修提案", "AI ライティング", "投稿の下書き"],
    kind: "short",
    placeholder: "例: コース料理（5,000 円）、ホワイトニング",
    max: 200,
  },
  {
    id: "price",
    section: "strength",
    label: "主な価格帯",
    why: "価格帯によって、書くべき言葉と競合が変わります（安さを言うのか、質を言うのか）。",
    usedBy: ["AI ライティング", "HP 改修提案"],
    kind: "short",
    placeholder: "例: ランチ 1,200 円前後 / ディナー 5,000 円前後",
    max: 120,
  },
  {
    id: "target",
    section: "customer",
    label: "来てほしいお客様（年代・家族構成・困りごと）",
    why: "原稿と構成案の読み手を決めます。「誰にでも」と書くと、誰にも届かない文章になります。",
    usedBy: ["AI ライティング", "HP 改修提案", "キーワード調査"],
    kind: "long",
    placeholder: "例: 30〜40 代の子育て世帯。週末に家族でゆっくり食事したいが、子連れで入れる店が分からず困っている",
    max: 400,
  },
  {
    id: "mismatch",
    section: "customer",
    label: "逆に、ミスマッチだったお客様（来てもお互いに困る方）",
    why: "「書かないこと」を決めるために使います。集客は増やすだけでなく、合わない方を減らすほど満足度が上がります。",
    usedBy: ["AI ライティング", "HP 改修提案"],
    kind: "long",
    placeholder: "例: 短時間で済ませたい方（1 品ずつ手作りするので提供が遅い）",
    max: 300,
  },
  {
    id: "faq",
    section: "customer",
    label: "お客様によく聞かれる質問（3 つまで）",
    why: "そのまま FAQ・llms.txt・原稿の見出しになります。AI 検索に拾われやすい形でもあります。",
    usedBy: ["FAQ 生成", "llms.txt 生成", "AI ライティング"],
    kind: "long",
    placeholder: "例: 駐車場はありますか / 予約なしでも入れますか / アレルギー対応は可能ですか",
    max: 400,
  },
  {
    id: "season",
    section: "rhythm",
    label: "忙しい時期と、暇な時期",
    why: "提案する時期が変わります。暇な時期の 1 か月前に手を打つのが集客の基本です。",
    usedBy: ["投稿の下書き", "AI ライティング", "月次レポート"],
    kind: "short",
    placeholder: "例: 12 月と 3 月が繁忙期。2 月と 8 月が暇",
    max: 200,
  },
  {
    id: "rival",
    section: "rhythm",
    label: "気になっている競合と、その理由",
    why: "何を比べられているかが分かります。順位や口コミの数字だけでは見えない部分です。",
    usedBy: ["HP 改修提案", "ページ診断", "Google マップの総評"],
    kind: "long",
    placeholder: "例: 駅前の〇〇。うちより後発なのに口コミが多く、インスタが上手い",
    max: 300,
  },
  {
    id: "goal",
    section: "request",
    label: "いま一番増やしたいもの",
    why: "同じ「集客」でも、予約を増やすのと客単価を上げるのでは打ち手が逆になります。",
    usedBy: ["HP 改修提案", "AI ライティング", "月次レポート"],
    kind: "choice",
    options: ["新規のお客様", "予約・問い合わせの数", "リピーター", "客単価", "採用・求人", "その他"],
    max: 40,
  },
  {
    id: "past",
    section: "request",
    label: "これまでホームページ・集客の会社に頼んで、困ったこと・物足りなかったこと",
    why: "同じ思いをしていただかないために聞いています。運営者（担当）が必ず目を通します。",
    usedBy: ["運営者が読みます（AI の文章には使いません）"],
    kind: "long",
    placeholder: "例: 専門用語ばかりで何をされているか分からなかった。報告書が毎月同じ内容だった",
    max: 500,
  },
  {
    id: "wish",
    section: "request",
    label: "このツールに「あったらいいな」と思う機能・してほしいこと",
    why: "**ここが一番ありがたい欄です。**いただいた声を集めて、次に作るものを決めています。",
    usedBy: ["運営者が読みます（次の機能開発の材料）"],
    kind: "long",
    placeholder: "例: スマホで見たときに数字が大きいと嬉しい / 毎月やることを 1 つだけ教えてほしい",
    max: 500,
  },
];

/** 業種ごとの追加設問（3 問まで）。答えは共通の設問と同じ入れ物に入る */
export const INDUSTRY_QUESTIONS: Record<StoreType, readonly KarteQuestion[]> = {
  飲食店: [
    { id: "food-menu", section: "strength", label: "看板メニューと、その価格", why: "原稿と投稿の主役になります。", usedBy: ["AI ライティング", "投稿の下書き"], kind: "short", placeholder: "例: 黒毛和牛のすき焼き 6,800 円", max: 200 },
    { id: "food-seats", section: "strength", label: "席数・個室・貸切の可否", why: "「何人で行けるか」は検索でも口コミでも必ず聞かれます。", usedBy: ["FAQ 生成", "基本情報掲載", "AI ライティング"], kind: "short", placeholder: "例: 32 席、個室 3 部屋、20 名から貸切可", max: 200 },
    { id: "food-reserve", section: "customer", label: "予約の受け方（電話・ネット・不可）", why: "予約への導線が作れているかを改修提案で見ます。", usedBy: ["HP 改修提案", "FAQ 生成"], kind: "short", placeholder: "例: 電話と食べログ。自社サイトからは不可", max: 200 },
  ],
  "クリニック・医院・歯科": [
    { id: "clinic-fields", section: "strength", label: "診療科目と、特に力を入れている治療", why: "医療は「何ができるか」が細かく検索されます。", usedBy: ["AI ライティング", "キーワード調査", "HP 改修提案"], kind: "short", placeholder: "例: 一般歯科・矯正。小児矯正に力を入れている", max: 200 },
    { id: "clinic-jihi", section: "strength", label: "自由診療の主力と価格帯", why: "自由診療は集客の効果が数字で出やすく、優先度が高くなります。", usedBy: ["HP 改修提案", "AI ライティング"], kind: "short", placeholder: "例: インプラント 38 万円、ホワイトニング 2 万円", max: 200 },
    { id: "clinic-wait", section: "customer", label: "予約の受け方と、待ち時間の目安", why: "患者さんの不安の 1 位で、口コミの評価にも直結します。", usedBy: ["FAQ 生成", "口コミへの返信", "HP 改修提案"], kind: "short", placeholder: "例: Web 予約あり。予約時は 10 分以内", max: 200 },
  ],
  "美容サロン・理容": [
    { id: "salon-menu", section: "strength", label: "得意な施術と、平均単価", why: "単価によって狙うキーワードが変わります。", usedBy: ["AI ライティング", "キーワード調査"], kind: "short", placeholder: "例: 縮毛矯正が得意。平均 12,000 円", max: 200 },
    { id: "salon-staff", section: "strength", label: "指名・担当制の有無とスタッフ数", why: "「誰が担当するか」は来店の決め手になり、口コミ返信の書き方も変わります。", usedBy: ["口コミへの返信", "HP 改修提案"], kind: "short", placeholder: "例: 担当制。スタイリスト 3 名", max: 200 },
    { id: "salon-first", section: "customer", label: "初めてのお客様に多い不安・ご質問", why: "初回のハードルを下げる文章を作ります。", usedBy: ["FAQ 生成", "AI ライティング"], kind: "long", placeholder: "例: 施術時間はどれくらいか、しつこい勧誘がないか", max: 300 },
  ],
  "整体・整骨・治療院": [
    { id: "seitai-symptom", section: "strength", label: "得意な症状・お悩み", why: "「肩こり」より「デスクワークの肩こり」のように、具体的なほど検索で勝てます。", usedBy: ["AI ライティング", "キーワード調査", "HP 改修提案"], kind: "short", placeholder: "例: デスクワークの首・肩、産後の骨盤", max: 200 },
    { id: "seitai-hoken", section: "strength", label: "保険と自費の割合・自費の料金", why: "自費の比率で、集めるべきお客様が変わります。", usedBy: ["HP 改修提案", "AI ライティング"], kind: "short", placeholder: "例: 自費 7 割。1 回 6,000 円", max: 200 },
    { id: "seitai-plan", section: "customer", label: "施術の時間と、改善までの回数の目安", why: "通院回数の目安は、来院前に一番知りたいことです。", usedBy: ["FAQ 生成", "AI ライティング"], kind: "short", placeholder: "例: 1 回 40 分。週 1 回で 3 か月が目安", max: 200 },
  ],
  小売店: [
    { id: "shop-items", section: "strength", label: "主力の商品カテゴリと価格帯", why: "扱う商品で狙うキーワードがまったく変わります。", usedBy: ["AI ライティング", "キーワード調査"], kind: "short", placeholder: "例: 国産の生活雑貨。2,000〜8,000 円", max: 200 },
    { id: "shop-ec", section: "strength", label: "ネット販売の有無（ある場合は URL）", why: "実店舗とネットでは、書くべき導線が変わります。", usedBy: ["HP 改修提案", "llms.txt 生成"], kind: "short", placeholder: "例: BASE で販売中", max: 200 },
    { id: "shop-access", section: "customer", label: "駐車場・アクセスでよく聞かれること", why: "来店型の小売で一番多い離脱理由です。", usedBy: ["FAQ 生成", "基本情報掲載"], kind: "short", placeholder: "例: 提携駐車場が 3 台分。店の裏手で分かりにくい", max: 200 },
  ],
  不動産: [
    { id: "estate-main", section: "strength", label: "売買・賃貸・管理のどれが主力か", why: "分野ごとに検索する人がまったく違います。", usedBy: ["AI ライティング", "キーワード調査"], kind: "short", placeholder: "例: 賃貸仲介が 7 割", max: 200 },
    { id: "estate-area", section: "strength", label: "得意なエリアと物件の種類", why: "不動産は地域名の検索が中心です。エリアが決まると戦い方が決まります。", usedBy: ["キーワード調査", "HP 改修提案", "順位計測"], kind: "short", placeholder: "例: 世田谷区の一人暮らし向けワンルーム", max: 200 },
    { id: "estate-online", section: "customer", label: "来店前のオンライン相談・内見の可否", why: "問い合わせのハードルを下げる導線を作ります。", usedBy: ["HP 改修提案", "FAQ 生成"], kind: "short", placeholder: "例: LINE 相談とオンライン内見に対応", max: 200 },
  ],
  "士業・コンサルティング": [
    { id: "pro-fields", section: "strength", label: "取扱分野と、特に得意な分野", why: "士業は「相続に強い」のように分野で選ばれます。", usedBy: ["AI ライティング", "キーワード調査", "HP 改修提案"], kind: "short", placeholder: "例: 相続と事業承継", max: 200 },
    { id: "pro-first", section: "strength", label: "初回相談の費用と形式", why: "問い合わせの直前に必ず確認される項目です。", usedBy: ["FAQ 生成", "HP 改修提案"], kind: "short", placeholder: "例: 初回 60 分無料、オンライン可", max: 200 },
    { id: "pro-client", section: "customer", label: "主なお客様の規模・業種", why: "「個人向け」と「法人向け」では書く文章が別物になります。", usedBy: ["AI ライティング", "キーワード調査"], kind: "short", placeholder: "例: 年商 1〜5 億円の建設業", max: 200 },
  ],
  "教室・スクール": [
    { id: "school-course", section: "strength", label: "コースと対象年齢", why: "対象が決まると、保護者向けか本人向けかが決まります。", usedBy: ["AI ライティング", "キーワード調査"], kind: "short", placeholder: "例: 小学生のプログラミング、3 か月コース", max: 200 },
    { id: "school-fee", section: "strength", label: "月謝・受講料の目安", why: "教室選びで最初に比べられる数字です。", usedBy: ["FAQ 生成", "HP 改修提案"], kind: "short", placeholder: "例: 月 8,800 円（週 1 回・90 分）", max: 200 },
    { id: "school-trial", section: "customer", label: "体験レッスンの有無と内容", why: "入会前の最大の導線です。ここが弱い教室がとても多いです。", usedBy: ["HP 改修提案", "FAQ 生成"], kind: "short", placeholder: "例: 無料体験 1 回（60 分）", max: 200 },
  ],
  "宿泊・観光": [
    { id: "stay-rooms", section: "strength", label: "客室数・タイプと価格帯", why: "宿は「泊まれる人数と予算」で絞り込まれます。", usedBy: ["AI ライティング", "キーワード調査"], kind: "short", placeholder: "例: 全 8 室、1 泊 2 食 18,000 円〜", max: 200 },
    { id: "stay-guest", section: "customer", label: "主な客層（国内・海外、目的）", why: "海外のお客様が多ければ、多言語の口コミ対応が効きます。", usedBy: ["口コミへの返信", "AI ライティング", "口コミ支援"], kind: "short", placeholder: "例: 国内の夫婦旅行が中心。台湾からの個人客も増えている", max: 200 },
    { id: "stay-around", section: "rhythm", label: "周辺の観光資源・アクセス", why: "宿は「その地域で検索する人」に見つけてもらう必要があります。", usedBy: ["AI ライティング", "キーワード調査"], kind: "short", placeholder: "例: 〇〇温泉街まで徒歩 5 分、駅から送迎あり", max: 200 },
  ],
  "建築・リフォーム": [
    { id: "build-work", section: "strength", label: "得意な工事と施工エリア", why: "工事の種類と地域名の組み合わせで検索されます。", usedBy: ["キーワード調査", "AI ライティング", "順位計測"], kind: "short", placeholder: "例: 水回りのリフォーム。横浜市内と川崎市", max: 200 },
    { id: "build-price", section: "strength", label: "平均的な工事金額", why: "金額帯で狙うお客様が変わります。", usedBy: ["AI ライティング", "HP 改修提案"], kind: "short", placeholder: "例: 80〜150 万円（浴室まるごと）", max: 200 },
    { id: "build-after", section: "customer", label: "保証・アフターサービスの内容", why: "高額な買い物ほど、決め手は安心です。", usedBy: ["HP 改修提案", "FAQ 生成"], kind: "short", placeholder: "例: 施工後 10 年保証、年 1 回の点検", max: 200 },
  ],
  その他: [
    { id: "other-service", section: "strength", label: "主なサービス内容と価格帯", why: "何を売っているかが決まらないと、文章の芯が決まりません。", usedBy: ["AI ライティング", "HP 改修提案"], kind: "short", placeholder: "", max: 200 },
    { id: "other-client", section: "customer", label: "主なお客様", why: "読み手が決まると文章が変わります。", usedBy: ["AI ライティング", "キーワード調査"], kind: "short", placeholder: "", max: 200 },
    { id: "other-flow", section: "customer", label: "問い合わせから成約までの流れ", why: "導線のどこで止まっているかを改修提案で見ます。", usedBy: ["HP 改修提案"], kind: "long", placeholder: "", max: 300 },
  ],
};

/** その業種の設問（共通 + 業種別）。業種が未設定なら共通だけ */
export function questionsFor(storeType: StoreType | null | undefined): readonly KarteQuestion[] {
  const extra = storeType && storeType in INDUSTRY_QUESTIONS ? INDUSTRY_QUESTIONS[storeType] : [];
  // 画面の区切りの順に並べる（共通 → 業種別 の順は保ったまま）
  const order = new Map(KARTE_SECTIONS.map((s, i) => [s.id, i]));
  return [...COMMON_QUESTIONS, ...extra].sort((a, b) => (order.get(a.section) ?? 0) - (order.get(b.section) ?? 0));
}

/** 設問 ID → 設問（どの業種のものでも引ける。運営者の集計画面が使う） */
export function findQuestion(id: string): KarteQuestion | null {
  const all = [...COMMON_QUESTIONS, ...STORE_TYPES.flatMap((t) => INDUSTRY_QUESTIONS[t])];
  return all.find((q) => q.id === id) ?? null;
}

/** 運営者だけが読む設問（AI の文章には渡さない） */
export const OPERATOR_ONLY_IDS: readonly string[] = ["past", "wish"];
