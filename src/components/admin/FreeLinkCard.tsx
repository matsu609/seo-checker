/**
 * マスター画面の「無料診断（固定リンク）」カード（利用者の指示 2026-10-02 → 10-03）。サーバーコンポーネント。
 *
 *   - 営業・代理店に渡す固定リンク `/free`（コピー）。パスワードもトークンも無い（利用者「ばれたら終わりでいい」）
 *   - 今月の診断回数 / 上限と、どこで数えているか（Supabase か、メモリの控えか）
 *   - 今月の記録（いつ・何を・どこから）。不正利用と営業の活動が分かる
 */
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { freeLinkUrl } from "@/lib/free/access";
import { recentFreeRuns } from "@/lib/free/monthly";
import { FREE_RUN_KIND_LABEL, type FreeRunRecord, type FreeRuns } from "@/lib/free/monthly-rules";
import { formatDateTime } from "@/lib/report/format";

export async function FreeLinkCard() {
  const link = freeLinkUrl();
  let runs: FreeRuns | null = null;
  let records: FreeRunRecord[] = [];
  let error: string | null = null;
  try {
    ({ runs, records } = await recentFreeRuns(30));
  } catch (err) {
    error = err instanceof Error ? err.message : "読み込めませんでした";
  }

  return (
    <Card
      title="無料診断（営業・デモ用のリンク）"
      description="パスワードはありません。このリンクを開いた人が 30 日間、サイト・店舗の無料診断を使えます。リンクは固定なので、広まったら月の上限（環境変数 FREE_MONTHLY_LIMIT。既定 50。0 で停止）だけが守りです。"
    >
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-surface p-3">
        <code className="min-w-0 flex-1 break-all text-[12px] text-ink">{link}</code>
        <CopyButton text={link} label="リンクをコピー" />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        使いすぎが見えたら、Vercel の環境変数 <code>FREE_MONTHLY_LIMIT</code> を小さくするか 0 にして Redeploy（0 で無料診断を停止）。
      </p>

      {error ? (
        <Callout tone="fail" className="mt-4">
          今月の回数を読めませんでした: {error}
        </Callout>
      ) : runs ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-sm border border-line bg-surface p-3 @lg:grid-cols-4">
            <div>
              <dt className="text-[11px] text-muted">今月の診断回数</dt>
              <dd className="mt-1 text-[20px] font-bold text-ink tabular-nums">
                {runs.used} <span className="text-[13px] font-normal text-muted">/ {runs.limit} 回</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">残り</dt>
              <dd className={`mt-1 text-[20px] font-bold tabular-nums ${runs.remaining === 0 ? "text-warn" : "text-ink"}`}>{runs.remaining} 回</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">戻る日</dt>
              <dd className="mt-1 text-sm text-ink tabular-nums">{runs.resetsOn}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">記録先</dt>
              <dd className="mt-1 text-sm text-ink">{runs.source === "supabase" ? "Supabase（usage_events）" : "メモリ（控え）"}</dd>
            </div>
          </dl>
          {runs.source === "memory" && (
            <Callout tone="warn" className="mt-3" title="回数は仮の数え方です">
              Supabase の <code>usage_events</code> テーブルが無い（または Supabase が未設定）ため、サーバーのメモリで数えています。デプロイやインスタンスの入れ替えで 0 に戻ります。
              運用メモの #129 の SQL を実行すると、正確に数えて記録が残るようになります。
            </Callout>
          )}
          <h3 className="mt-4 text-[13px] font-bold text-ink">今月の記録（新しい順・最大 30 件）</h3>
          {records.length === 0 ? (
            <p className="mt-1 text-[12px] text-muted">今月はまだ使われていません。</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] text-muted">
                    <th className="py-1 pr-3 font-normal">日時</th>
                    <th className="py-1 pr-3 font-normal">種類</th>
                    <th className="py-1 pr-3 font-normal">診断した URL / 店名</th>
                    <th className="py-1 font-normal">送信元</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={`${r.at}-${i}`} className="border-b border-line/60">
                      <td className="py-1 pr-3 whitespace-nowrap tabular-nums text-ink">{formatDateTime(r.at)}</td>
                      <td className="py-1 pr-3 whitespace-nowrap text-ink">{FREE_RUN_KIND_LABEL[r.kind]}</td>
                      <td className="max-w-md truncate py-1 pr-3 text-ink" title={r.target}>
                        {r.target || "—"}
                      </td>
                      <td className="py-1 whitespace-nowrap text-muted">{r.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Card>
  );
}
