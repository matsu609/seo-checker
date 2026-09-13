/**
 * サイトとの表記ゆれ（NAP 整合。精密診断のみ）。表示だけ。
 *
 * 同じ店舗の情報がサイトと Google で食い違っていると、Google は同じ店だと確信を
 * 持てない。どちらを直すかは店舗の判断なので、両方の値を並べて出す。
 */
import { DataTable, type Column } from "@/components/ui";
import { Advice, SubHeading } from "@/components/free/report-parts";
import { Badge } from "@/components/ui/Badge";
import type { NapFinding, NapResult } from "@/lib/maps/nap";

const STATUS: Record<NapFinding["status"], { label: string; tone: "pass" | "fail" | "neutral" }> = {
  match: { label: "一致", tone: "pass" },
  mismatch: { label: "食い違い", tone: "fail" },
  missing: { label: "見つからない", tone: "neutral" },
};

const COLUMNS: Column<NapFinding>[] = [
  { key: "label", header: "項目", width: "5rem", nowrap: true, render: (r) => <span className="font-bold">{r.label}</span> },
  {
    key: "status",
    header: "判定",
    width: "6.5rem",
    nowrap: true,
    render: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>,
  },
  { key: "google", header: "Google マップ", render: (r) => r.google ?? <span className="text-muted">—</span> },
  {
    key: "site",
    header: "登録サイト",
    render: (r) =>
      r.site ? (
        <>
          {r.site}
          {r.source && <span className="ml-1 text-[11px] text-muted">（{r.source}）</span>}
        </>
      ) : (
        <span className="text-muted">見つかりませんでした</span>
      ),
  },
];

export function NapBlock({ nap, note }: { nap: NapResult | null; note: string | null }) {
  if (!nap) {
    return (
      <>
        <SubHeading className="mt-6">サイトとの表記ゆれ（NAP）</SubHeading>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{note ?? "まだ調べていません。"}</p>
      </>
    );
  }

  return (
    <>
      <SubHeading className="mt-6" note={nap.url}>
        サイトとの表記ゆれ（NAP）
      </SubHeading>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        登録サイトに書かれている店名・住所・電話番号を読み取り、Google マップの登録内容と比べています。
      </p>
      <div className="mt-2">
        <DataTable rows={nap.findings} columns={COLUMNS} rowKey={(r) => r.field} dense stickyHeader={false} minWidth="34rem" />
      </div>
      {nap.mismatches > 0 ? (
        <Advice className="mt-2">
          {nap.mismatches} 件が食い違っています。Google 側とサイト側で表記を揃えてください（番地の全角・半角、ビル名の有無、電話番号のハイフンまで同じにします）。
        </Advice>
      ) : (
        <p className="mt-2 text-[13px] text-muted">食い違いはありませんでした。</p>
      )}
    </>
  );
}
