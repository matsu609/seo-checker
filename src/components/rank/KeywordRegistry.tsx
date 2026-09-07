"use client";

import { useId, useState } from "react";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { DEVICE_LABELS, addGroup, addKeywords, removeGroup, removeKeyword, updateKeyword, type RankGroup, type RankKeyword } from "@/lib/rank/store";
import { splitList } from "@/lib/store";
import type { SerpDevice } from "@/lib/rank/types";

export interface KeywordRegistryProps {
  projectId: string;
  keywords: readonly RankKeyword[];
  groups: readonly RankGroup[];
}

/**
 * キーワード登録（B1 の入口）。
 * SERPAPI_KEY が無くても使えるよう、計測とは切り離して編集できるようにしてある。
 */
export function KeywordRegistry({ projectId, keywords, groups }: KeywordRegistryProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [device, setDevice] = useState<SerpDevice>("desktop");
  const [location, setLocation] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function submit() {
    const lines = splitList(text);
    if (lines.length === 0) {
      setNotice("キーワードを入力してください。");
      return;
    }
    const added = addKeywords(lines, {
      projectId,
      device,
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(groupId ? { groupId } : {}),
    });
    setText("");
    setNotice(
      added.length === lines.length
        ? `${added.length} 件を登録しました。`
        : `${added.length} 件を登録しました（${lines.length - added.length} 件は登録済みのため省略）。`,
    );
  }

  return (
    <div className="space-y-4">
      <Card title="キーワードを登録する" headingLevel={3} description="改行・カンマ区切りでまとめて登録できます。登録だけなら外部連携は不要です。">
        <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
          <Field label="キーワード" htmlFor={`${id}-kw`} hint="1 行に 1 キーワード。既に登録済みのものは飛ばします。">
            <Textarea
              id={`${id}-kw`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={"AIO 対策\nLLMO とは"}
            />
          </Field>
          <div className="space-y-3">
            <Field label="デバイス" htmlFor={`${id}-device`}>
              <Select id={`${id}-device`} value={device} onChange={(e) => setDevice(e.target.value as SerpDevice)}>
                <option value="desktop">{DEVICE_LABELS.desktop}</option>
                <option value="mobile">{DEVICE_LABELS.mobile}</option>
              </Select>
            </Field>
            <Field label="地域（任意）" htmlFor={`${id}-loc`} hint="例: Tokyo, Japan">
              <Input id={`${id}-loc`} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Tokyo, Japan" />
            </Field>
            <Field label="グループ（任意）" htmlFor={`${id}-group`}>
              <Select id={`${id}-group`} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">なし</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={submit}>登録する</Button>
          {notice && <span className="text-[12px] text-muted">{notice}</span>}
        </div>
      </Card>

      <Card title="グループ" headingLevel={3} description="キーワードをまとめて集計・絞り込みするための箱です。">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="グループ名" htmlFor={`${id}-gname`} className="w-56">
            <Input id={`${id}-gname`} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="注力 KW" />
          </Field>
          <Button
            variant="secondary"
            onClick={() => {
              addGroup(groupName);
              setGroupName("");
            }}
          >
            追加
          </Button>
        </div>
        {groups.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {groups.map((g) => (
              <li key={g.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[12px]">
                {g.name}
                <span className="tabular-nums text-muted">{keywords.filter((k) => k.groupId === g.id).length}</span>
                <button
                  type="button"
                  onClick={() => removeGroup(g.id)}
                  aria-label={`グループ「${g.name}」を削除`}
                  className="ml-1 rounded-sm px-1 text-muted outline-none hover:text-fail focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="登録済みキーワード"
        headingLevel={3}
        description="月間検索数と目標ページは手入力です（検索ボリュームの外部連携は未実装）。"
        actions={<Badge tone="neutral">{keywords.length} 件</Badge>}
      >
        {keywords.length === 0 ? (
          <p className="text-[13px] text-muted">まだ登録がありません。上のフォームから追加してください。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-[13px] text-ink">
              <thead className="bg-panel">
                <tr className="border-b border-line text-[12px] font-bold text-muted">
                  <th scope="col" className="px-2 py-2 text-left">キーワード</th>
                  <th scope="col" className="px-2 py-2 text-left">デバイス</th>
                  <th scope="col" className="px-2 py-2 text-left">グループ</th>
                  <th scope="col" className="px-2 py-2 text-right">月間検索数</th>
                  <th scope="col" className="px-2 py-2 text-left">目標ページ URL</th>
                  <th scope="col" className="px-2 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => (
                  <tr key={k.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2 align-middle">{k.keyword}</td>
                    <td className="px-2 py-2 align-middle text-[12px] text-muted">{DEVICE_LABELS[k.device]}</td>
                    <td className="px-2 py-2 align-middle">
                      <Select
                        aria-label={`${k.keyword} のグループ`}
                        value={k.groupId ?? ""}
                        onChange={(e) => updateKeyword(k.id, { groupId: e.target.value || undefined })}
                        className="h-9 text-[13px]"
                      >
                        <option value="">なし</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <Input
                        aria-label={`${k.keyword} の月間検索数`}
                        inputMode="numeric"
                        value={k.monthlyVolume ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, "");
                          updateKeyword(k.id, { monthlyVolume: v ? Number(v) : null });
                        }}
                        className="h-9 text-right text-[13px]"
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <Input
                        aria-label={`${k.keyword} の目標ページ URL`}
                        value={k.targetUrl ?? ""}
                        onChange={(e) => updateKeyword(k.id, { targetUrl: e.target.value || undefined })}
                        placeholder="https://example.com/page"
                        className="h-9 text-[13px]"
                      />
                    </td>
                    <td className="px-2 py-2 text-right align-middle">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeKeyword(k.id)}
                        aria-label={`${k.keyword} を削除`}
                      >
                        削除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
