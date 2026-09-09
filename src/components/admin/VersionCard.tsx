/**
 * マスター画面のバージョン表示（サーバーコンポーネント）。
 *
 * バージョンは main へのマージ回数。releases.json の件数がそのまま版数になる。
 * 記録されたコミットと、実際にデプロイされているコミットを並べて出すので、
 * 「マージしたのに本番に出ていない」がここで分かる。
 */
import { Card } from "@/components/ui/Card";
import { buildInfo } from "@/lib/release/build";
import { currentRelease, recentReleases, releaseCount, releaseLabel } from "@/lib/release/catalog";
import pkg from "../../../package.json";

const ENV_LABELS: Record<string, string> = {
  production: "本番",
  preview: "プレビュー",
  development: "開発",
};

export function VersionCard() {
  const release = currentRelease();
  const build = buildInfo();
  const history = recentReleases(5);

  return (
    <Card
      title="バージョン"
      description="main へマージするたびに 1 つ上がります。"
      className="mb-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-[32px] leading-none font-bold text-ink tabular-nums">
          {releaseLabel(releaseCount())}
        </span>
        <span className="text-[13px] text-muted">
          アプリ v{process.env.NEXT_PUBLIC_APP_VERSION || pkg.version}
        </span>
        {build.environment && (
          <span className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-muted">
            {ENV_LABELS[build.environment] ?? build.environment}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 @lg:grid-cols-3">
        <div>
          <dt className="text-[11px] text-muted">反映日</dt>
          <dd className="mt-0.5 text-sm text-ink tabular-nums">{release?.date ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">リリース時点のコミット</dt>
          <dd className="mt-0.5 font-mono text-sm text-ink">{release?.commit ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">動いているコミット</dt>
          <dd className="mt-0.5 font-mono text-sm text-ink">
            {build.commit ?? "—"}
            {build.branch && <span className="ml-1.5 font-sans text-[11px] text-muted">{build.branch}</span>}
          </dd>
        </div>
      </dl>

      {history.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[11px] text-muted">最近のリリース</p>
          <ul className="mt-1.5 space-y-1">
            {history.map((r) => (
              <li key={r.commit} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                <span className="font-mono font-bold text-ink tabular-nums">{releaseLabel(r.number)}</span>
                <span className="text-muted tabular-nums">{r.date}</span>
                <span className="min-w-0 text-ink">{r.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
