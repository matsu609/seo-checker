"use client";

/**
 * 変更前後の差分表示（D3）。語単位の diff を色分けし、採用 / 破棄を選ばせる。
 * 色は判定色トークン（pass = 追加、fail = 削除）だけを使う。
 */
import { Button, Card, InlineDiff } from "@/components/ui";

export interface DiffViewProps {
  before: string;
  after: string;
  /** 選択範囲だけを書き換えたか */
  selection?: boolean;
  onAccept: () => void;
  onReject: () => void;
  busy?: boolean;
}

export function DiffView({ before, after, selection = false, onAccept, onReject, busy = false }: DiffViewProps) {
  return (
    <Card
      title="変更内容の確認"
      description={
        selection
          ? "選択範囲だけを書き換えました。採用すると本文に反映し、バージョン履歴に 1 版残します。"
          : "本文全体を書き換えました。採用すると本文に反映し、バージョン履歴に 1 版残します。"
      }
      actions={
        <>
          <Button onClick={onAccept} disabled={busy}>
            採用する
          </Button>
          <Button variant="secondary" onClick={onReject} disabled={busy}>
            破棄する
          </Button>
        </>
      }
    >
      <InlineDiff before={before} after={after} />
    </Card>
  );
}
