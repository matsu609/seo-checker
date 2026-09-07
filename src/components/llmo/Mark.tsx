/**
 * ○ / × の印と、会社 × モデル × {ブランド, ドメイン} の比較表。
 * 色だけに頼らないよう記号と読み上げラベルを必ず付ける。
 */
import { Fragment } from "react";
import { Badge } from "@/components/ui";
import type { MatrixRow } from "@/lib/llmo/aggregate";
import { PROVIDERS_META } from "@/lib/llmo/providers/meta";
import type { ProviderId } from "@/lib/llmo/types";

export function Mark({ value }: { value: boolean | null }) {
  if (value === null) {
    return (
      <span className="text-muted" aria-label="データなし">
        —
      </span>
    );
  }
  return value ? (
    <span className="font-bold text-pass" aria-label="あり">
      ○
    </span>
  ) : (
    <span className="text-muted" aria-label="なし">
      ×
    </span>
  );
}

export interface MarkMatrixProps {
  providers: readonly ProviderId[];
  rows: readonly MatrixRow[];
}

/** 競合比較（会社 × モデル）。1 モデルにつき「ブランド」「ドメイン」の 2 列 */
export function MarkMatrix({ providers, rows }: MarkMatrixProps) {
  if (providers.length === 0 || rows.length === 0) {
    return <p className="text-[13px] text-muted">比較できる結果がまだありません。</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] text-ink" style={{ minWidth: `${18 + providers.length * 10}rem` }}>
        <thead className="bg-panel">
          <tr className="border-b border-line text-[12px] font-bold text-muted">
            <th scope="col" rowSpan={2} className="px-2 py-2 text-left align-bottom">
              会社
            </th>
            {providers.map((p) => (
              <th key={p} scope="colgroup" colSpan={2} className="border-l border-line px-2 py-2 text-center">
                {PROVIDERS_META[p].label}
              </th>
            ))}
          </tr>
          <tr className="border-b border-line text-[11px] font-bold text-muted">
            {providers.map((p) => (
              <Fragment key={p}>
                <th scope="col" className="border-l border-line px-2 py-1 text-center font-bold">
                  ブランド
                </th>
                <th scope="col" className="px-2 py-1 text-center font-bold">
                  ドメイン
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.entityId} className="border-b border-line last:border-0">
              <th scope="row" className="px-2 py-2 text-left font-normal">
                <span className={row.isSelf ? "font-bold text-ink" : ""}>{row.name}</span>
                {row.isSelf && (
                  <Badge tone="free" className="ml-1.5">
                    自社
                  </Badge>
                )}
              </th>
              {row.cells.map((cell) => (
                <Fragment key={cell.providerId}>
                  <td className="border-l border-line px-2 py-2 text-center">
                    <Mark value={cell.calls === 0 ? null : cell.brand} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Mark value={cell.calls === 0 ? null : cell.domain} />
                  </td>
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
