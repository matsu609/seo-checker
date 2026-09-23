/**
 * Stripe の金額（最小単位）を画面に出す形にする。純粋関数（クライアントからも読める）。
 *
 * Stripe の金額は通貨の最小単位で来る（円なら 1 = 1 円、ドルなら 1 = 1 セント）。
 * 小数を持たない通貨を 100 で割ると 50,000 円が 500 円に見えてしまう。
 *
 * 2026-09-23 まで、お客様の画面（StripeBillingCard）と顧客管理（admin/billing.ts）が
 * 別々の「小数を持たない通貨」の一覧を持っていた（片方は 3 通貨だけ）。ここに 1 つにまとめる。
 */

/** 小数を持たない通貨（Stripe の一覧 https://docs.stripe.com/currencies#zero-decimal） */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export interface Money {
  /** 表示用（例 "￥50,000"） */
  label: string;
  /** 通貨の主単位に直した数値（円なら 50000、ドルなら 10.5） */
  value: number;
  currency: string;
}

export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL.has(currency.toUpperCase());
}

/** 最小単位の金額と通貨 → 表示。読めない値は null */
export function moneyFromMinor(amount: unknown, currency: unknown): Money | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const code = typeof currency === "string" && currency ? currency.toUpperCase() : "JPY";
  const digits = isZeroDecimal(code) ? 0 : 2;
  const value = digits === 0 ? amount : amount / 100;
  let label: string;
  try {
    label = new Intl.NumberFormat("ja-JP", { style: "currency", currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    // 知らない通貨コード（壊れた値）で画面ごと落とさない
    label = `${value.toLocaleString("ja-JP")} ${code}`;
  }
  return { label, value, currency: code };
}
