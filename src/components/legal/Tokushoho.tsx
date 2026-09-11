/**
 * 特定商取引法に基づく表記（本文）。表示だけ。
 *
 * 有料プランをカード決済で売るために必要な表示。事業者名・連絡先は src/lib/legal/operator.ts、
 * 価格は src/lib/plans/catalog.ts から取り、ここに数字を重ねて書かない。
 * 所在地と電話番号は、個人事業のため「請求があれば遅滞なく開示する」運用（消費者庁のガイドラインで認められている）。
 */
import { OPERATOR, SERVICE_NAME, operatorLabel } from "@/lib/legal/operator";
import { PLAN_BY_ID } from "@/lib/plans/catalog";

interface Row {
  label: string;
  value: string | string[];
}

const pro = PLAN_BY_ID.pro;

export const TOKUSHOHO_ROWS: Row[] = [
  { label: "販売事業者", value: operatorLabel(OPERATOR.name) },
  { label: "運営責任者", value: "松下" },
  { label: "所在地", value: "個人事業のため、請求があれば遅滞なく開示します（お問い合わせ先のメールアドレスまでご請求ください）。" },
  { label: "電話番号", value: "請求があれば遅滞なく開示します。お問い合わせはメールで受け付けています。" },
  { label: "お問い合わせ先", value: operatorLabel(OPERATOR.email) },
  { label: "サービス名", value: SERVICE_NAME },
  {
    label: "販売価格",
    value: [`${pro.label}: 月額 ${pro.priceYen.toLocaleString("ja-JP")} 円（税別。消費税は別途申し受けます）`, "無料診断: 0 円", "個別のお見積もり（機能ごとの割引）はお問い合わせください。"],
  },
  { label: "販売価格以外にお客様が負担する費用", value: "インターネット接続にかかる通信料はお客様のご負担です。" },
  { label: "お支払い方法", value: "クレジットカード（Visa / Mastercard / American Express / JCB。決済は Stripe, Inc. を通じて行います）" },
  { label: "お支払い時期", value: "お申し込み時に初回の月額をお支払いいただき、以降は毎月同じ日に自動で決済されます。" },
  { label: "サービスの提供時期", value: "決済の完了後、すぐにご利用いただけます。" },
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
