"use client";

/**
 * 表示速度と Core Web Vitals（A3）。
 *
 * PAGESPEED_API_KEY が無くても取得を試みる。取れなかったときはダミーを出さず、
 * 理由（多くは呼び出し上限）と設定方法だけを出す。
 */
import { Donut } from "@/components/charts";
import { Badge, Callout, DataTable, EmptyState, type Column } from "@/components/ui";
import { CRUX_LABELS, type CruxCategory, type PsiAudit, type PsiResult } from "@/lib/psi/types";
import { formatCls, formatMs } from "@/lib/psi/parse";
import { palette } from "@/lib/ui/palette";

const CRUX_TONE: Record<CruxCategory, "pass" | "warn" | "fail" | "info"> = {
  FAST: "pass",
  AVERAGE: "warn",
  SLOW: "fail",
  NONE: "info",
};

const AUDIT_COLUMNS: Column<PsiAudit>[] = [
  {
    key: "title",
    header: "改善項目",
    render: (r) => <span className="font-bold text-ink">{r.title}</span>,
  },
  {
    key: "displayValue",
    header: "計測値",
    width: "8rem",
    nowrap: true,
    render: (r) => <span className="tabular-nums text-muted">{r.displayValue || "—"}</span>,
  },
  {
    key: "score",
    header: "スコア",
    align: "right",
    width: "5rem",
    sortable: true,
    accessor: (r) => r.score,
    render: (r) => <span className="tabular-nums text-ink">{Math.round(r.score * 100)}</span>,
  },
];

function ScoreDonut({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div className="text-center">
        <p className="text-[13px] text-muted">{label}</p>
        <p className="mt-2 text-[13px] text-muted">データなし</p>
      </div>
    );
  }
  return (
    <figure className="text-center">
      <Donut value={value} size={120} thickness={12} sublabel="/100" ariaLabel={`${label} ${value} / 100`} />
      <figcaption className="mt-1 text-[13px] text-ink">{label}</figcaption>
    </figure>
  );
}

function Metric({
  label,
  value,
  category,
  hint,
}: {
  label: string;
  value: string;
  category: CruxCategory | null;
  hint: string;
}) {
  return (
    <div className="rounded-sm border border-line bg-panel px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted">{label}</span>
        {category && <Badge tone={CRUX_TONE[category]}>{CRUX_LABELS[category]}</Badge>}
      </div>
      <p className="mt-1 text-[22px] font-bold leading-none tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

export function PsiPanel({
  psi,
  error,
  requested,
}: {
  psi: PsiResult | null;
  error: string | null;
  /** 取得を要求したか（オフにしているときは案内を変える） */
  requested: boolean;
}) {
  if (!psi) {
    if (!requested) {
      return (
        <EmptyState
          title="表示速度は取得していません"
          description="フォームの「表示速度も測定する」を有効にして再診断すると、PageSpeed Insights の結果を表示します。計測には 30 秒ほどかかります。"
        />
      );
    }
    return (
      <Callout tone="warn" title="表示速度を取得できませんでした">
        {error ?? "PageSpeed Insights から結果を取得できませんでした。"}
        <p className="mt-2 text-[13px]">
          レポートの他の項目は取得済みです。<code className="font-mono">PAGESPEED_API_KEY</code> を
          <code className="font-mono"> .env.local</code> に設定すると、呼び出し上限が緩和され安定して取得できます。
        </p>
      </Callout>
    );
  }

  const crux = psi.crux;
  return (
    <div className="space-y-6">
      <p className="text-[13px] leading-relaxed text-muted">
        PageSpeed Insights（{psi.strategy === "mobile" ? "モバイル" : "デスクトップ"}）の結果です。
        {psi.usedApiKey ? "" : "API キー未設定のため呼び出し上限が厳しく、時間帯によっては取得できないことがあります。"}
      </p>

      <div className="flex flex-wrap items-start justify-center gap-8 @2xl:justify-start">
        <ScoreDonut label="パフォーマンス" value={psi.categories.performance} />
        <ScoreDonut label="アクセシビリティ" value={psi.categories.accessibility} />
        <ScoreDonut label="SEO" value={psi.categories.seo} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">
          Core Web Vitals
          <span className="ml-2 text-[11px] font-normal text-muted">
            {crux ? "実際の利用者から集めた過去 28 日間の値（CrUX）" : "実測データが無いため、この 1 回の計測値（ラボ値）を表示しています"}
          </span>
        </h3>
        <div className="grid gap-3 @2xl:grid-cols-3">
          <Metric
            label="LCP（最大要素の表示）"
            value={crux?.lcp ? formatMs(crux.lcp.value) : formatMs(psi.lab.lcp)}
            category={crux?.lcp?.category ?? null}
            hint="主要な画像や見出しが表示されるまでの時間。2.5 秒以内が目安です。"
          />
          <Metric
            label="INP（操作への応答）"
            value={crux?.inp ? formatMs(crux.inp.value) : "—"}
            category={crux?.inp?.category ?? null}
            hint="クリックなどの操作に画面が反応するまでの時間。200 ミリ秒以内が目安です。"
          />
          <Metric
            label="CLS（表示のずれ）"
            value={crux?.cls ? formatCls(crux.cls.value) : formatCls(psi.lab.cls)}
            category={crux?.cls?.category ?? null}
            hint="読み込み中にレイアウトがずれる量。0.1 以下が目安です。"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">
          改善項目の上位
          <span className="ml-2 text-[11px] font-normal text-muted">
            Lighthouse のスコアが 90 点未満だった項目（低い順）
          </span>
        </h3>
        <DataTable
          rows={psi.opportunities}
          columns={AUDIT_COLUMNS}
          rowKey={(r) => r.id}
          dense
          minWidth="34rem"
          emptyText="スコアが 90 点未満の項目はありませんでした。"
        />
        {psi.opportunities.length > 0 && (
          <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted">
            {psi.opportunities.map((audit) => (
              <li key={audit.id} className="border-l-2 pl-3" style={{ borderColor: palette.line }}>
                <span className="font-bold text-ink">{audit.title}</span>：{stripMarkdownLinks(audit.description)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Lighthouse の説明文は Markdown リンクを含むので、表示用に素のテキストへ直す */
function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
}
