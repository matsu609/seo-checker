/**
 * 順位計測（毎週の自動計測）で測る語数の上限。プランごと。
 *
 * ここだけを直せば、定期処理（src/lib/rank/job.ts）・画面の説明（RankTool の「N 語まで」）・
 * 月額費用の試算（src/lib/cost/model.ts）の 3 か所が同時に変わる。
 * クライアントでも読めるように、依存のない小さなファイルに分けてある（auto.ts は zod と store を引く）。
 *
 * 2026-09-21 利用者の決定: スタンダードを 100 語 → **20 語**に下げる（残タスク #121）。
 * 理由: SerpApi は月額プラン制（Starter $25 = 1,000 検索 / Developer $75 = 5,000 検索）で、
 * 100 語 × 週 1 回 = 1 店 月 433 検索。10 店で 4,500 検索になり Developer に乗って 1 店 1,200 円かかっていた。
 * 20 語なら 1 店 月 87 検索で、10 店でも Starter に収まる（1 店 400 円）。
 * ライトはスタンダードより少なく（10 語）、プレミアムは伴走の枠として 50 語（利用者の指示は「20 語」だけなので、
 * 上下の段はプランの順序が崩れないように Claude が置いた値。変えるならここ）。
 * 旧: ライト 30 / スタンダード 100 / プレミアム 300。
 */
import type { PlanId } from "@/lib/plans/catalog";

export const RANK_AUTO_LIMITS: Record<PlanId, number> = { free: 0, light: 10, standard: 20, premium: 50 };
