import Link from "next/link";

export interface MissingIntegration {
  key: string;
  envVar: string;
  description: string;
}

export interface SetupNoticeProps {
  missing: MissingIntegration[];
  /** true なら「いずれか 1 つ」で動く */
  anyOf?: boolean;
  title?: string;
  className?: string;
}

/**
 * 外部連携が未設定のときの案内。何を .env.local に書けばよいかを示す。
 * ダミーデータで動いているように見せない（呼び出し側は設定済みの部分だけ動かす）。
 */
export function SetupNotice({ missing, anyOf = false, title, className = "" }: SetupNoticeProps) {
  if (missing.length === 0) return null;
  const envLines = Array.from(new Set(missing.map((m) => m.envVar)));
  return (
    <div
      role="note"
      className={`no-print rounded-sm border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink ${className}`}
    >
      <p className="font-bold">
        {title ??
          (anyOf
            ? "この機能を使うには、次のいずれか 1 つの外部連携が必要です"
            : "この機能を使うには外部連携の設定が必要です")}
      </p>
      <ul className="mt-2 space-y-1">
        {missing.map((m) => (
          <li key={`${m.key}:${m.envVar}`} className="flex flex-wrap gap-x-2">
            <code className="rounded-sm border border-line bg-panel px-1 font-mono text-[12px] text-ink">{m.envVar}</code>
            <span className="text-muted">{m.description}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-muted">
        プロジェクト直下の <code className="font-mono text-[12px]">.env.local</code> に次の行を追加し、開発サーバーを再起動してください。
        キーはサーバーだけが読み、ブラウザには渡りません。
      </p>
      <pre className="mt-2 overflow-x-auto rounded-sm border border-line bg-panel p-3 font-mono text-[12px] leading-relaxed text-ink">
        {envLines.map((v) => `${v}=`).join("\n")}
      </pre>
      <p className="mt-3">
        <Link href="/settings" className="font-bold text-accent underline-offset-2 hover:underline">
          設定画面で連携状況を確認する
        </Link>
      </p>
    </div>
  );
}
