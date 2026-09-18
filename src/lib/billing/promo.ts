/**
 * 割引コード（お客様コード）の型（純粋。クライアントでも読める）。
 *
 * 割引はスタンダードプラン専用で、次の 10 パターンだけ（利用者の決定 2026-09-18）:
 *   月額の値引き（永続）  … 10,000 / 20,000 / 30,000 / 40,000 / 50,000 円引き（50,000 = 永続無料）
 *   無料期間（30 日）のみ … free
 *   無料期間 + 月額の値引き … 10,000 / 20,000 / 30,000 / 40,000 円引き
 *
 * Stripe の Checkout で相手が入力できるプロモーションコードは 1 つだけで、「無料期間 + 値引き」を
 * 1 つのコードでは渡せない。そこでコードの受け付けをアプリ側に持ち、コードごとに
 * 「Stripe のトライアル日数 + Stripe のクーポン（金額割引・永続）」の組み合わせを決めて Checkout を作る
 * （src/lib/billing/stripe.ts の createCheckoutSession）。クーポンは coupons.ts が Stripe に自動で作る。
 *
 * どのコードがどのパターンかは環境変数 PROMO_CODES で決める（下の parsePromoCodes）。
 * 例: PROMO_CODES="WOLF-A7K2=off10, TANAKA-Q9=free-off20, ZERO-XX=off50"
 * コードは大文字小文字と空白を区別しない。同じパターンに何個でもコードを付けられる（相手ごとに変える）。
 * 公開している画面には「初月無料」と書かない（利用者の指示 2026-09-18）。コードの中身は渡す相手にだけ伝える。
 */
import { PLANS, type PlanId } from "@/lib/plans/catalog";

/** 割引コードが使えるプラン */
export const PROMO_PLAN: PlanId = "standard";
/** 「初月無料」のコードで付ける無料期間（日） */
export const FIRST_MONTH_FREE_DAYS = 30;
/** コード一覧を入れる環境変数 */
export const PROMO_CODES_ENV = "PROMO_CODES";

export interface PromoPattern {
  /** PROMO_CODES に書くパターン名 */
  id: string;
  /** 毎月の値引き額（円。0 = 値引きなし）。永続 */
  amountOff: number;
  /** 最初の 30 日を無料にするか */
  firstMonthFree: boolean;
}

const MONTHLY_OFFS = [10_000, 20_000, 30_000, 40_000, 50_000] as const;
const FREE_OFFS = [10_000, 20_000, 30_000, 40_000] as const;

export const PROMO_PATTERNS: readonly PromoPattern[] = [
  ...MONTHLY_OFFS.map((amountOff) => ({ id: `off${amountOff / 1000}`, amountOff, firstMonthFree: false })),
  { id: "free", amountOff: 0, firstMonthFree: true },
  ...FREE_OFFS.map((amountOff) => ({ id: `free-off${amountOff / 1000}`, amountOff, firstMonthFree: true })),
];

export function patternById(id: string): PromoPattern | null {
  const key = id.trim().toLowerCase();
  return PROMO_PATTERNS.find((p) => p.id === key) ?? null;
}

/** スタンダードの定価（円） */
export function promoPlanPriceYen(): number {
  return PLANS.find((p) => p.id === PROMO_PLAN)?.priceYen ?? 0;
}

/** 値引き後の月額（円） */
export function monthlyAfter(pattern: PromoPattern): number {
  return Math.max(0, promoPlanPriceYen() - pattern.amountOff);
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")} 円`;

/** 画面に出す説明（コードを確認した人にだけ見せる。公開ページには出さない） */
export function patternLabel(pattern: PromoPattern): string {
  const after = monthlyAfter(pattern);
  const plan = PLANS.find((p) => p.id === PROMO_PLAN)?.label ?? "スタンダード";
  if (pattern.firstMonthFree) {
    const off = pattern.amountOff > 0 ? ` + 月額 ${yen(pattern.amountOff)}引き` : "";
    return `${plan}: 最初の ${FIRST_MONTH_FREE_DAYS} 日間は無料${off}（${FIRST_MONTH_FREE_DAYS} 日後から毎月 ${yen(after)}）`;
  }
  if (after === 0) return `${plan}: 月額 ${yen(pattern.amountOff)}引き（毎月 0 円・ずっと無料）`;
  return `${plan}: 月額 ${yen(pattern.amountOff)}引き（毎月 ${yen(after)}・ずっと）`;
}

/** コードの正規化（大文字化・空白を除く）。比較と保存はこの形で行う */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * PROMO_CODES を読む。区切りはカンマ・改行（`=` の前後の空白は無視）。`CODE=pattern` の形以外や知らないパターンは無視する。
 * 戻り値のキーは正規化済みのコード。
 */
export function parsePromoCodes(raw: string | undefined): Map<string, PromoPattern> {
  const map = new Map<string, PromoPattern>();
  if (!raw) return map;
  for (const entry of raw.split(/[,\n\r]+/)) {
    const [codePart, patternPart] = entry.split("=").map((part) => part.trim());
    if (!codePart || !patternPart) continue;
    const code = normalizeCode(codePart);
    const pattern = patternById(patternPart);
    if (!code || !pattern) continue;
    map.set(code, pattern);
  }
  return map;
}

/** コードからパターンを引く（無効なら null） */
export function resolvePromoCode(code: string, raw: string | undefined = process.env[PROMO_CODES_ENV]): PromoPattern | null {
  const key = normalizeCode(code);
  if (!key) return null;
  return parsePromoCodes(raw).get(key) ?? null;
}

/** コードが 1 つでも設定してあるか（未設定なら画面に入力欄を出さない） */
export function hasPromoCodes(raw: string | undefined = process.env[PROMO_CODES_ENV]): boolean {
  return parsePromoCodes(raw).size > 0;
}

/* ── 顧客ごとに設定する割引（マスター画面・代理店画面から。利用者の決定 2026-09-18） ──
 *
 * コードを渡す代わりに、運用者か担当の代理店が顧客を選んでパターンを設定する。
 * 保存先は顧客の Clerk publicMetadata.promo（データベースは増やさない）。
 * 設定があれば /plans に「割引が設定されています」と出て、スタンダードの申し込みに自動で付く。
 * コード入力（PROMO_CODES）より優先する。
 */

/** publicMetadata のキー */
export const PROMO_KEY = "promo";

export interface AssignedPromo {
  /** パターン名（PROMO_PATTERNS の id） */
  pattern: string;
  /** 設定した人の Clerk ユーザー ID */
  by: string;
  /** 設定日時（ISO） */
  at: string;
}

function record(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
}

/** publicMetadata から設定済みの割引を読む。形が違う・知らないパターンなら null */
export function assignedPromoFromMetadata(metadata: unknown): AssignedPromo | null {
  const raw = record(metadata)[PROMO_KEY];
  if (!raw || typeof raw !== "object") return null;
  const { pattern, by, at } = raw as Record<string, unknown>;
  if (typeof pattern !== "string" || !patternById(pattern)) return null;
  return { pattern: patternById(pattern)!.id, by: typeof by === "string" ? by : "", at: typeof at === "string" ? at : "" };
}

/** 設定済みの割引のパターン（無ければ null） */
export function assignedPatternFromMetadata(metadata: unknown): PromoPattern | null {
  const assigned = assignedPromoFromMetadata(metadata);
  return assigned ? patternById(assigned.pattern) : null;
}

/**
 * 割引を設定・解除した publicMetadata を作る（純粋）。null で解除。
 * 外すときはキーを消さず null を入れる（Clerk の updateUserMetadata は null を削除として扱う）。
 */
export function withAssignedPromo(metadata: unknown, patternId: string | null, by: string, at = new Date().toISOString()): Record<string, unknown> {
  const pattern = patternId ? patternById(patternId) : null;
  return { ...record(metadata), [PROMO_KEY]: pattern ? ({ pattern: pattern.id, by, at } satisfies AssignedPromo) : null };
}

/** 選択肢に出す短い名前（マスター画面・代理店画面の select 用） */
export function patternShortLabel(pattern: PromoPattern): string {
  const off = pattern.amountOff > 0 ? `月額 ${yen(pattern.amountOff)}引き` : "";
  if (pattern.firstMonthFree) return off ? `30 日無料 + ${off}` : "30 日無料";
  return monthlyAfter(pattern) === 0 ? `${off}（ずっと無料）` : off;
}
