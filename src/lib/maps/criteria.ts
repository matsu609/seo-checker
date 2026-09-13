/**
 * 採点基準の付録に出す内容。表示用の純粋データ。
 *
 * サイト側の報告書には「付録 B 診断方法と採点基準」があるのに、MEO にはなかった
 * （利用者の指摘 2026-09-13）。配点と判定のしきい値を開示すると、同じ点数でも
 * 「何をどう測ったか」が伝わり、改善の根拠になる。
 *
 * しきい値は score.ts / owner-input.ts の定数から組み立てる。数字をここに書き写すと
 * 基準を変えたときに付録だけ古くなるため（criteria.test.ts で定数との一致を固定）。
 */
import { DESCRIPTION_GOOD, POSTS_GOOD, PHOTO_FRESH_DAYS, REPLY_RATE_GOOD } from "./owner-input";
import {
  ATTRIBUTES_GOOD,
  OWNER_PHOTOS_GOOD,
  PHOTO_GOOD,
  PHOTO_MIN_PX,
  RATING_GOOD,
  RATING_OK,
  RECENT_DAYS,
  REVIEW_GOOD,
  REVIEW_SOME,
  REVIEW_TEXT_GOOD_RATIO,
  REVIEW_TEXT_MIN_CHARS,
  SCORE_RULES_VERSION,
  STALE_DAYS,
} from "./score";

export interface CriteriaRow {
  /** score.ts の項目 id と合わせる */
  id: string;
  /** 合格（OK）になる条件 */
  pass: string;
  /** 注意になる条件。無ければ合格か要改善の 2 択 */
  warn?: string;
}

/** 項目ごとの合格ライン。id は score.ts の ProfileCheck.id */
export const CRITERIA: readonly CriteriaRow[] = [
  { id: "status", pass: "「営業中」になっている", warn: "ステータスを取得できない" },
  { id: "name", pass: "正式名称だけ（30 文字以内、記号や宣伝文句を含まない）", warn: "キーワードや記号を含む" },
  { id: "category", pass: "メインカテゴリが設定されている" },
  { id: "extraCategories", pass: "追加カテゴリが 1 つ以上ある", warn: "追加カテゴリが無い" },
  { id: "description", pass: `${DESCRIPTION_GOOD} 文字以上で、対策キーワードを含む`, warn: `${DESCRIPTION_GOOD} 文字未満、または URL・HTML を含む` },
  { id: "openingDate", pass: "開業日が設定されている" },
  { id: "address", pass: "住所が登録されている" },
  { id: "hours", pass: "営業時間が登録されている" },
  { id: "hoursAccuracy", pass: "7 曜日すべてが登録されている", warn: "7 曜日あるが全日が定休日" },
  { id: "menu", pass: "メニュー・サービスが登録されている" },
  { id: "website", pass: "自社サイトが登録されている", warn: "SNS・ポータル（食べログ・ホットペッパー等）だけ" },
  { id: "phone", pass: "電話番号が登録されている" },
  { id: "attributes", pass: `当てはまる属性が ${ATTRIBUTES_GOOD} 個以上`, warn: `1〜${ATTRIBUTES_GOOD - 1} 個` },
  { id: "postFrequency", pass: `直近 4 週間に ${POSTS_GOOD} 件以上（週 1 件以上）`, warn: `1〜${POSTS_GOOD - 1} 件` },
  { id: "postKeywords", pass: "最新の投稿に対策キーワードが入っている" },
  { id: "photos", pass: `${PHOTO_GOOD} 枚以上（Google が返す上限）`, warn: `1〜${PHOTO_GOOD - 1} 枚` },
  { id: "ownerPhotos", pass: `表示される写真のうち ${OWNER_PHOTOS_GOOD} 枚以上がオーナー投稿`, warn: `1〜${OWNER_PHOTOS_GOOD - 1} 枚` },
  { id: "photoQuality", pass: `すべて長辺 ${PHOTO_MIN_PX.toLocaleString("ja-JP")}px 以上`, warn: "低解像度が半数未満" },
  { id: "photoFreshness", pass: `オーナーの最新写真が ${PHOTO_FRESH_DAYS} 日以内`, warn: "1〜3 か月前" },
  { id: "logoCover", pass: "ロゴとカバー写真の両方がある", warn: "どちらか一方だけ" },
  { id: "rating", pass: `平均評価 ${RATING_GOOD.toFixed(1)} 以上`, warn: `${RATING_OK.toFixed(1)} 以上 ${RATING_GOOD.toFixed(1)} 未満` },
  { id: "reviewCount", pass: `${REVIEW_GOOD} 件以上`, warn: `${REVIEW_SOME}〜${REVIEW_GOOD - 1} 件` },
  { id: "reviewReply", pass: "返信文に店舗名・地域名などが入っている" },
  { id: "replyRate", pass: `返信率 ${Math.round(REPLY_RATE_GOOD * 100)}% 以上`, warn: "50% 以上" },
  { id: "recent", pass: `直近の口コミが ${RECENT_DAYS} 日以内`, warn: `${RECENT_DAYS}〜${STALE_DAYS} 日前` },
  { id: "reviewKeywords", pass: "口コミ本文に業種名・対策キーワードが入っている", warn: "含む口コミが無い" },
  {
    id: "reviewText",
    pass: `${REVIEW_TEXT_MIN_CHARS} 文字以上の本文がある口コミが ${Math.round(REVIEW_TEXT_GOOD_RATIO * 100)}% 以上`,
    warn: "30% 以上",
  },
  { id: "consumerAlert", pass: "Google の警告が出ていない" },
];

const BY_ID = new Map(CRITERIA.map((c) => [c.id, c]));

export function criteriaFor(id: string): CriteriaRow | null {
  return BY_ID.get(id) ?? null;
}

/** 付録の前書き。採点の考え方（未取得は分母から外す・v2 で厳しくした）を書く */
export const CRITERIA_NOTE = [
  `採点は公開情報とオーナーの申告から機械的に判定しています（生成 AI は使っていません）。同じ状態なら何度診断しても同じ点数になります。`,
  `合格 = 配点の満点、注意 = 配点の半分、要改善 = 0 点。測れなかった項目は分母から外すので、「測れなかった」ことで点数が下がることはありません。`,
  `採点基準 v${SCORE_RULES_VERSION}（2026-09-13 改定）。上位表示している店舗の実態に合わせ、評価・口コミの新しさ・営業時間の登録・写真・属性のしきい値を引き上げています。`,
] as const;
