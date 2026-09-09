/**
 * Google ビジネス プロフィールの充実度を採点する。純粋関数（生成 AI 不使用）。
 *
 * MEO（マップ検索での露出）で効くとされる基本項目を、取れた範囲でチェックする。
 * 無料診断と同じく「測れなかった」は fail ではなく、その旨を detail に書く。
 * 重みの合計は 100。pass = 満点、warn = 半分、fail = 0。
 */
import type { PlaceDetail } from "./types";

export type CheckStatus = "pass" | "warn" | "fail";

export interface ProfileCheck {
  id: string;
  label: string;
  status: CheckStatus;
  weight: number;
  /** 測定値・理由 */
  detail: string;
  /** 改善のヒント（pass のときは省略） */
  advice?: string;
}

export interface ProfileScore {
  /** 0〜100 */
  score: number;
  checks: ProfileCheck[];
}

/** 写真の枚数の目安。Google が返す photos は上限があるため 10 以上は「十分」とみなす */
export const PHOTO_GOOD = 10;
export const REVIEW_GOOD = 30;
export const REVIEW_SOME = 10;
export const RATING_GOOD = 4.3;
export const RATING_OK = 4.0;
/** 直近の口コミがこの日数以内なら活発とみなす */
export const RECENT_DAYS = 90;
export const STALE_DAYS = 365;

const FACTOR: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

function daysBetween(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** 最新の口コミが何日前か。無ければ null */
export function latestReviewAgeDays(place: PlaceDetail, now = new Date()): number | null {
  let best: number | null = null;
  for (const r of place.reviews) {
    if (!r.publishedAt) continue;
    const d = daysBetween(r.publishedAt, now);
    if (d === null) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

export function scoreProfile(place: PlaceDetail, now = new Date()): ProfileScore {
  const checks: ProfileCheck[] = [];

  checks.push({
    id: "status",
    label: "営業ステータス",
    weight: 10,
    ...(place.status === "OPERATIONAL"
      ? { status: "pass", detail: "営業中として登録されています" }
      : place.status === "UNKNOWN"
        ? { status: "warn", detail: "ステータスを取得できませんでした" }
        : {
            status: "fail",
            detail: place.status === "CLOSED_TEMPORARILY" ? "臨時休業になっています" : "閉業になっています",
            advice: "営業しているなら、ビジネス プロフィールでステータスを「営業中」に戻してください",
          }),
  });

  checks.push({
    id: "category",
    label: "カテゴリ",
    weight: 10,
    ...(place.category
      ? { status: "pass", detail: place.category }
      : { status: "fail", detail: "カテゴリが設定されていません", advice: "業種に最も近いカテゴリを 1 つ設定してください" }),
  });

  checks.push({
    id: "address",
    label: "住所",
    weight: 5,
    ...(place.address
      ? { status: "pass", detail: place.address }
      : { status: "fail", detail: "住所が登録されていません", advice: "住所を登録して所有権を確認してください" }),
  });

  checks.push({
    id: "phone",
    label: "電話番号",
    weight: 10,
    ...(place.phone
      ? { status: "pass", detail: place.phone }
      : { status: "fail", detail: "電話番号が登録されていません", advice: "マップからの電話問い合わせを受けるため、電話番号を登録してください" }),
  });

  checks.push({
    id: "website",
    label: "ウェブサイト",
    weight: 10,
    ...(place.website
      ? { status: "pass", detail: place.website }
      : { status: "fail", detail: "ウェブサイトが登録されていません", advice: "自社サイトの URL を登録すると、マップから自社サイトへ誘導できます" }),
  });

  checks.push({
    id: "hours",
    label: "営業時間",
    weight: 10,
    ...(place.hours.length > 0
      ? { status: "pass", detail: `${place.hours.length} 曜日分が登録されています` }
      : { status: "fail", detail: "営業時間が登録されていません", advice: "曜日ごとの営業時間を登録してください。「営業中」の表示に直結します" }),
  });

  checks.push({
    id: "photos",
    label: "写真",
    weight: 10,
    ...(place.photoCount >= PHOTO_GOOD
      ? { status: "pass", detail: `${place.photoCount} 枚以上` }
      : place.photoCount > 0
        ? { status: "warn", detail: `${place.photoCount} 枚`, advice: `外観・内観・商品などを ${PHOTO_GOOD} 枚以上載せると、比較されたときに選ばれやすくなります` }
        : { status: "fail", detail: "写真がありません", advice: "外観・内観・商品の写真を追加してください" }),
  });

  const count = place.ratingCount;
  checks.push({
    id: "reviews",
    label: "口コミの件数",
    weight: 15,
    ...(count === null
      ? { status: "warn", detail: "件数を取得できませんでした" }
      : count >= REVIEW_GOOD
        ? { status: "pass", detail: `${count} 件` }
        : count >= REVIEW_SOME
          ? { status: "warn", detail: `${count} 件`, advice: `来店客に口コミを依頼し、${REVIEW_GOOD} 件以上を目指してください` }
          : { status: "fail", detail: `${count} 件`, advice: "口コミが少ないと比較で不利です。来店客への依頼を仕組みにしてください" }),
  });

  const rating = place.rating;
  checks.push({
    id: "rating",
    label: "評価",
    weight: 10,
    ...(rating === null
      ? { status: "warn", detail: "評価がまだありません" }
      : rating >= RATING_GOOD
        ? { status: "pass", detail: rating.toFixed(1) }
        : rating >= RATING_OK
          ? { status: "warn", detail: rating.toFixed(1), advice: "低評価の口コミに丁寧に返信し、原因を改善してください" }
          : { status: "fail", detail: rating.toFixed(1), advice: "評価が 4.0 を下回っています。指摘の多い点から改善してください" }),
  });

  const age = latestReviewAgeDays(place, now);
  checks.push({
    id: "recent",
    label: "口コミの新しさ",
    weight: 5,
    ...(age === null
      ? { status: "warn", detail: "口コミの日付を取得できませんでした" }
      : age <= RECENT_DAYS
        ? { status: "pass", detail: `最新は ${age} 日前` }
        : age <= STALE_DAYS
          ? { status: "warn", detail: `最新は ${age} 日前`, advice: "最近の口コミが無いと活動していない印象になります。継続して依頼してください" }
          : { status: "fail", detail: `最新は ${age} 日前`, advice: "1 年以上口コミがありません。来店客への依頼を再開してください" }),
  });

  checks.push({
    id: "description",
    label: "紹介文",
    weight: 5,
    ...(place.description
      ? { status: "pass", detail: "Google 上に紹介文があります" }
      : {
          status: "warn",
          detail: "Google 上の紹介文がありません",
          advice: "ビジネス プロフィールの「ビジネス情報 → 説明」を埋めてください（この項目はオーナー入力の説明文と別で、Google が生成する紹介文の有無です）",
        }),
  });

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + c.weight * FACTOR[c.status], 0);
  return { score: Math.round((earned / total) * 100), checks };
}
