/**
 * 特定商取引法に基づく表記（本文）。表示だけ。
 *
 * 有料プランをカード決済で売るために必要な表示。事業者名・連絡先は src/lib/legal/operator.ts、
 * 価格は src/lib/plans/catalog.ts から取り、ここに数字を重ねて書かない。
 * 所在地と電話番号は、個人事業のため「請求があれば遅滞なく開示する」運用（消費者庁のガイドラインで認められている）。
 */
import { trialDays } from "@/lib/billing/trial";
import { OPERATOR, SERVICE_NAME, operatorLabel } from "@/lib/legal/operator";
import { LISTED_PLANS, planPriceLabel } from "@/lib/plans/catalog";

interface Row {
  label: string;
  value: string | string[];
}

// 料金表に出しているプランをそのまま並べる（catalog.ts が唯一の定義。値段を書き写さない）
const priceRows = [...LISTED_PLANS]
  .sort((a, b) => a.priceYen - b.priceYen)
  .map((p) =>
    p.priceFrom
      ? // 下限だけを示すプランは、実額の決まり方（個別のお見積り）まで書く。金額を 1 つだけ書くと、
        // その額で申し込めると読めてしまう
        `${p.label}: ${planPriceLabel(p.id)}（税込）。ご依頼の範囲に応じて個別にお見積りし、お申し込み前に金額をご提示します${p.limitNote ? `／${p.limitNote}` : ""}`
      : `${p.label}: ${planPriceLabel(p.id)}（税込）${p.limitNote ? `／${p.limitNote}` : ""}`,
  );
const trial = trialDays();

export const TOKUSHOHO_ROWS: Row[] = [
  { label: "販売事業者", value: operatorLabel(OPERATOR.name) },
  { label: "運営責任者", value: "松下" },
  { label: "所在地", value: "個人事業のため、請求があれば遅滞なく開示します（お問い合わせ先のメールアドレスまでご請求ください）。" },
  { label: "電話番号", value: "請求があれば遅滞なく開示します。お問い合わせはメールで受け付けています。" },
  { label: "お問い合わせ先", value: operatorLabel(OPERATOR.email) },
  { label: "サービス名", value: SERVICE_NAME },
  {
    label: "販売価格",
    value: [...priceRows, "クイック診断（アカウント不要）: 0 円", "割引コードをお持ちの場合は、申し込み画面で入力すると割引後の金額で決済されます。コードをお持ちでない場合は上記の価格です。コードの発行条件はお問い合わせください。"],
  },
  { label: "販売価格以外にお客様が負担する費用", value: "インターネット接続にかかる通信料はお客様のご負担です。" },
  { label: "お支払い方法", value: "クレジットカード（Visa / Mastercard / American Express / JCB。決済は Stripe, Inc. を通じて行います）" },
  {
    label: "お支払い時期",
    value:
      trial > 0
        ? [
            `お申し込み日から ${trial} 日間は無料です。この期間中の料金は発生しません（お申し込み時にクレジットカードのご登録のみ行います）。`,
            `無料期間が終わった日に初回の月額をお支払いいただき、以降は毎月同じ日に自動で決済されます（自動更新）。`,
            "無料期間中に解約された場合、料金は一切発生しません。",
          ]
        : [
            "お申し込み時に初回の月額をお支払いいただき、以降は毎月同じ日に自動で決済されます（自動更新）。",
            "割引コードをお使いの場合は、コードの条件に応じた金額（0 円となる場合を含みます）で初回の請求が立ち、割引の期間が終わった後は上記の月額を毎月同じ日にお支払いいただきます。次回の更新日までに解約された場合、それ以降の料金は発生しません。",
          ],
  },
  { label: "サービスの提供時期", value: trial > 0 ? "お申し込み後、すぐにご利用いただけます（無料期間中もすべての機能をお使いいただけます）。" : "お申し込み（決済）の完了後、すぐにご利用いただけます。" },
  {
    label: "解約・返金について",
    value: [
      "料金プランの画面（お支払い方法の変更・解約）からいつでも解約できます。解約後も、お支払い済みの期間の終わりまではご利用いただけます。",
      "サービスの性質上、お支払い済みの料金の返金（日割りを含む）はいたしません。",
      "二重に決済されるなど当方の誤りによる請求は、全額返金します。",
    ],
  },
  { label: "動作環境", value: "最新の Google Chrome / Safari / Microsoft Edge / Firefox。スマートフォンのブラウザでもご利用いただけます。" },
  { label: "特別な販売条件", value: "料金プランの画面に表示される内容に従います。クーポンコードによる割引は、コードに定めた期間・回数に限ります。" },
];

export function Tokushoho() {
  return (
    <div className="rounded-sm border border-line bg-panel p-5 md:p-6">
      <dl className="divide-y divide-line">
        {TOKUSHOHO_ROWS.map((row) => (
          <div key={row.label} className="grid gap-1 py-3 md:grid-cols-[14rem_1fr] md:gap-4">
            <dt className="text-[13px] font-bold text-ink">{row.label}</dt>
            <dd className="text-[13px] leading-relaxed text-ink">
              {Array.isArray(row.value) ? (
                <ul className="list-disc space-y-1 pl-5">
                  {row.value.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
