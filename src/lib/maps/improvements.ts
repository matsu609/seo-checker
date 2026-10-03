/**
 * MEO 報告書の「優先改善リスト」。純粋関数（生成 AI 不使用）。
 *
 * 項目を並べるだけでは「で、何からやればいいのか」が分からない（利用者の指摘 2026-09-13）。
 * 配点と現状から「直したときに戻ってくる点数」を出し、大きい順に並べる。
 * サイト側の優先改善 TOP3（src/lib/report/summary.ts）と同じ考え方。
 *
 * 未取得（unavailable）の項目はここには出さない。採点の分母に入っておらず、
 * 直しても点数が動かないため。代わりに ownerOnly として別に返し、
 * 「オーナーにしか分からない項目」としてまとめて案内する。
 */
import { urgencyOf, type BlockingRules, type Urgency } from "@/lib/report/urgency";
import { CATEGORY_LABELS, type CategoryId, type ProfileCheck, type ProfileScore } from "./score";

/**
 * MEO で「今すぐ対応」にする項目（お客様が店を見つけられない・連絡できない・
 * プロフィールが止まる原因になるもの）。配点とは別に、性質で決める。
 */
export const MEO_BLOCKING: BlockingRules = {
  // 閉業・臨時休業の表示（マップ上で「閉業」と出る）
  status: ["fail"],
  // Google の警告（不審な口コミ活動・ポリシー違反。放置すると停止の原因）
  consumerAlert: ["fail"],
  // キーワードの詰め込み（ガイドライン違反。停止の原因）
  name: ["warn", "fail"],
  // 住所・電話・営業時間・カテゴリが無いと、見つからない・来店できない
  address: ["fail"],
  phone: ["fail"],
  hours: ["fail"],
  category: ["fail"],
};

export interface MeoImprovement {
  id: string;
  label: string;
  category: CategoryId;
  categoryLabel: string;
  /** いまの状態（"warn" か "fail"） */
  status: "warn" | "fail";
  /** 直したときに戻ってくる点数（測定できた配点の中での実数） */
  gain: number;
  /** 画面に出す "+6 点" の形 */
  gainLabel: string;
  /** 対応の優先度（今すぐ / 要改善 / 後回しで OK。src/lib/report/urgency.ts と同じ 3 段階） */
  urgency: Urgency;
  /** 現状の測定値・理由 */
  detail: string;
  /** やること */
  advice: string;
}

export interface MeoImprovementPlan {
  /** 直すと点数が動く項目（効果の大きい順） */
  items: MeoImprovement[];
  /** いまのスコア（比較用） */
  currentScore: number | null;
  /** 上位 3 件を直したときのスコア（0〜100）。直すものが無ければ現在値と同じ */
  scoreAfterTop3: number | null;
  /** オーナーにしか分からない（= 今回測れなかった）項目 */
  ownerOnly: { id: string; label: string; weight: number }[];
  /** 測れなかった配点の合計 */
  ownerOnlyWeight: number;
}

/** warn は配点の半分、fail は配点まるごとが戻ってくる */
function gainOf(check: ProfileCheck): number {
  if (check.status === "fail") return check.weight;
  if (check.status === "warn") return check.weight / 2;
  return 0;
}

export function buildImprovementPlan(score: ProfileScore): MeoImprovementPlan {
  const measured = score.checks.filter((c) => c.status !== "unavailable");
  const measuredWeight = measured.reduce((sum, c) => sum + c.weight, 0);

  const items = measured
    .filter((c): c is ProfileCheck & { status: "warn" | "fail" } => c.status === "warn" || c.status === "fail")
    .map((c) => {
      const gain = gainOf(c);
      // 測れた配点に対する実点（0〜100 の目盛）。優先度の閾値もこの目盛で見る
      const gainPoints = (gain / (measuredWeight || 1)) * 100;
      return {
        id: c.id,
        label: c.label,
        category: c.category,
        categoryLabel: CATEGORY_LABELS[c.category],
        status: c.status,
        gain,
        // 小数になることがあるので四捨五入して出す
        gainLabel: `+${Math.round(gainPoints)} 点`,
        urgency: urgencyOf({ id: c.id, status: c.status, gain: gainPoints }, MEO_BLOCKING),
        detail: c.detail,
        advice: c.advice ?? "",
      };
    })
    // 効果の大きい順。同点なら要改善（fail）を先に、さらに同じならカテゴリ順
    .sort((a, b) => b.gain - a.gain || (a.status === b.status ? 0 : a.status === "fail" ? -1 : 1));

  const ownerOnly = score.checks
    .filter((c) => c.status === "unavailable")
    .map((c) => ({ id: c.id, label: c.label, weight: c.weight }));

  // 上位 3 件を直したときのスコア。「全部直せば 100 点」は当たり前なので、
  // 現実的に手をつけられる範囲での伸びしろを出す
  const earned = measured.reduce((sum, c) => sum + c.weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  const top3Gain = items.slice(0, 3).reduce((sum, i) => sum + i.gain, 0);

  return {
    items,
    currentScore: score.score,
    scoreAfterTop3: measuredWeight > 0 ? Math.round(((earned + top3Gain) / measuredWeight) * 100) : null,
    ownerOnly,
    ownerOnlyWeight: ownerOnly.reduce((sum, c) => sum + c.weight, 0),
  };
}
