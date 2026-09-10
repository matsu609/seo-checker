/**
 * 利用規約などに載せる運営者情報。値が未設定（null）の項目は画面で「準備中」と出す。
 *
 * ここだけを直せば規約本文の表記が揃うようにしてある。法人名・連絡先が決まったら埋めること。
 */
export interface OperatorInfo {
  /** 事業者名（法人名または屋号） */
  name: string | null;
  /** 問い合わせ先メールアドレス */
  email: string | null;
  /** 所在地（任意。特定商取引法の表示を別に置くなら省略可） */
  address: string | null;
  /** 第一審の専属的合意管轄裁判所 */
  court: string;
}

export const OPERATOR: OperatorInfo = {
  // 個人事業。屋号 + 代表者名（利用者の指示 2026-09-10）
  name: "SEO 研究所（代表: 松下）",
  // Google OAuth のデベロッパー連絡先とも揃える
  email: "contact@seo-checker.tokyo",
  // 個人事業のため所在地は請求時に開示する（特定商取引法の表示の運用に合わせる）
  address: "請求があれば遅滞なく開示します",
  court: "東京地方裁判所",
};

/** 規約の施行日（YYYY-MM-DD） */
export const TERMS_EFFECTIVE_DATE = "2026-09-10";
/** 規約の最終更新日（YYYY-MM-DD） */
export const TERMS_UPDATED_DATE = "2026-09-10";

/** サービス名（規約本文で使う） */
export const SERVICE_NAME = "SEO Checker";

export function operatorLabel(value: string | null): string {
  return value ?? "準備中";
}
