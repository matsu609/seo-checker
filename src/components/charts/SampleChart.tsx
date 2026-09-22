/**
 * 「計測前のイメージ」の共通の枠（利用者の指示 2026-09-22
 * 「デモデータを入れて、最初からグラフがこう表示される・データがこう集計されると
 * 直感的に分かるようにしてください。サービスの使い始めでも」）。
 *
 * 空の画面を出すと、お客様は**何が出るようになるのか分からないまま離れる**。
 * かといって見本を実測と取り違えられるのは、もっとよくない。
 * そこで**どの画面でも同じ 4 点セット**で出す:
 *   ①図の線・棒を破線にする（描く側の責任）
 *   ②カードの右上に「イメージ」のバッジ（`SampleBadge`）
 *   ③図の上の帯で「これは実測ではありません」と言う
 *   ④図の下で「いつ実線に変わるか」を書く
 *
 * この枠を 1 か所に置いてあるので、画面が増えても言い回しがそろう。
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";

export interface SampleChartProps {
  /** 帯の見出し。既定「これは実測ではなく、グラフのイメージです」 */
  title?: string;
  /** 帯の本文（いまどういう状態で、何をすると数字が入るか） */
  lead: ReactNode;
  /** 破線で描いたグラフ */
  children: ReactNode;
  /** 図の下の注記（いつ実線に変わるか・縦軸が何か） */
  note: ReactNode;
  className?: string;
}

const DEFAULT_TITLE = "これは実測ではなく、グラフのイメージです";

export function SampleChart({ title = DEFAULT_TITLE, lead, children, note, className = "" }: SampleChartProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <Callout tone="info" title={title}>
        <p className="leading-relaxed">{lead}</p>
      </Callout>
      {children}
      <p className="text-[11px] leading-relaxed text-muted">
        <strong className="font-bold">破線・薄い色はイメージで、実際に計測した値ではありません。</strong> {note}
      </p>
    </div>
  );
}

/** カードの右上に置く「イメージ」の印。`actions` に渡す */
export function SampleBadge({ label = "イメージ（まだ計測していません）" }: { label?: string }) {
  return (
    <Badge tone="info" icon={false}>
      {label}
    </Badge>
  );
}
