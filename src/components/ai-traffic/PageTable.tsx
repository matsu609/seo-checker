"use client";

/**
 * ページ × 流入元 × キーイベントの表（§7.1）。
 *
 * 絞り込み（サービス・キーイベント名・キーイベントのある行だけ）は
 * filterPageRows に任せ、並び替えは DataTable が行う。CSV は表示中の行をそのまま出す。
 */
import { useId, useMemo, useState } from "react";
import { Button, Card, DataTable, EmptyState, Field, Select, type Column } from "@/components/ui";
import { filterPageRows, keyEventCount, sumPageRows } from "@/lib/ai-traffic/aggregate";
import type { AiTrafficPageRow } from "@/lib/ai-traffic/types";
import { csvFileName, downloadCsv, type CsvColumn } from "@/lib/export/csv";
import { fmt, pathOf } from "@/lib/report";

export interface PageTableProps {
  rows: readonly AiTrafficPageRow[];
  /** 実際に取得できたキーイベント名（列と絞り込みに使う） */
  keyEventNames: readonly string[];
  /** 絞り込みに出すサービス名（辞書の並び順） */
  services: readonly string[];
}

const ALL = "";
const OTHER_SERVICE = "（辞書に無い参照元）";

export function PageTable({ rows, keyEventNames, services }: PageTableProps) {
  const id = useId();
  const [service, setService] = useState(ALL);
  const [keyEventName, setKeyEventName] = useState(ALL);
  const [onlyWithKeyEvents, setOnlyWithKeyEvents] = useState(false);

  // 取得し直してキーイベント名が変わったときは「合計」に戻す（effect で state を消さない）
  const activeKeyEvent = keyEventNames.includes(keyEventName) ? keyEventName : ALL;
  const activeService = service !== ALL && services.includes(service) ? service : ALL;

  const visible = useMemo(
    () =>
      filterPageRows(rows, {
        keyEventName: activeKeyEvent || null,
        onlyWithKeyEvents,
        service: activeService || null,
      }),
    [rows, activeKeyEvent, activeService, onlyWithKeyEvents],
  );

  const totals = useMemo(() => sumPageRows(visible, activeKeyEvent || null), [visible, activeKeyEvent]);

  const columns: Column<AiTrafficPageRow>[] = [
    {
      key: "landingPage",
      header: "ランディングページ",
      sortable: true,
      accessor: (r) => r.landingPage,
      render: (r) => <span className="break-all">{pathOf(r.landingPage)}</span>,
    },
    { key: "source", header: "流入元", sortable: true, accessor: (r) => r.source, className: "break-all" },
    {
      key: "service",
      header: "サービス",
      sortable: true,
      accessor: (r) => r.service ?? "",
      render: (r) => r.service ?? <span className="text-muted">{OTHER_SERVICE}</span>,
    },
    {
      key: "sessions",
      header: "セッション数",
      align: "right",
      sortable: true,
      accessor: (r) => r.sessions,
      render: (r) => fmt(r.sessions),
    },
    {
      key: "users",
      header: "ユーザー数",
      align: "right",
      sortable: true,
      accessor: (r) => r.users,
      render: (r) => fmt(r.users),
    },
    {
      key: "keyEvents",
      header: activeKeyEvent ? `キーイベント（${activeKeyEvent}）` : "キーイベント（合計）",
      align: "right",
      sortable: true,
      accessor: (r) => keyEventCount(r, activeKeyEvent || null),
      render: (r) => fmt(keyEventCount(r, activeKeyEvent || null)),
    },
  ];

  const csvColumns: CsvColumn<AiTrafficPageRow>[] = [
    { header: "ランディングページ", value: (r) => r.landingPage },
    { header: "流入元", value: (r) => r.source },
    { header: "サービス", value: (r) => r.service ?? "" },
    { header: "セッション数", value: (r) => r.sessions },
    { header: "ユーザー数", value: (r) => r.users },
    { header: "キーイベント合計", value: (r) => r.keyEvents },
    ...keyEventNames.map((name) => ({
      header: `キーイベント: ${name}`,
      value: (r: AiTrafficPageRow) => keyEventCount(r, name),
    })),
  ];

  return (
    <Card
      title="ページ × 流入元 × キーイベント"
      description="GA4 のランディングページ × 参照元です。同じページでも参照元ごとに別の行になります。"
      actions={
        <Button
          variant="secondary"
          disabled={visible.length === 0}
          onClick={() => downloadCsv(csvFileName("ai-traffic-pages", new Date()), csvColumns, visible)}
        >
          CSV
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="AI 検索からのランディングページがありません"
          description="この期間には、参照元辞書に一致する流入が記録されていませんでした。"
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 @2xl:grid-cols-[1fr_1fr_auto] @2xl:items-end">
            <Field label="サービスで絞り込む" htmlFor={`${id}-service`}>
              <Select id={`${id}-service`} value={activeService} onChange={(e) => setService(e.target.value)}>
                <option value={ALL}>すべて</option>
                {services.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="キーイベントで絞り込む"
              htmlFor={`${id}-event`}
              hint={
                keyEventNames.length === 0
                  ? "上のフォームでイベント名を追加すると、イベント別の件数を取得できます。"
                  : undefined
              }
            >
              <Select
                id={`${id}-event`}
                value={activeKeyEvent}
                disabled={keyEventNames.length === 0}
                onChange={(e) => setKeyEventName(e.target.value)}
              >
                <option value={ALL}>合計</option>
                {keyEventNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="mb-2 inline-flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={onlyWithKeyEvents}
                onChange={(e) => setOnlyWithKeyEvents(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              キーイベントがある行だけ
            </label>
          </div>

          <DataTable
            rows={visible}
            columns={columns}
            rowKey={(row, i) => `${row.landingPage}|${row.source}|${i}`}
            defaultSort={{ key: "sessions", dir: "desc" }}
            minWidth="46rem"
            dense
            caption={`${fmt(visible.length)} 行 ／ セッション ${fmt(totals.sessions)}・ユーザー ${fmt(
              totals.users,
            )}・キーイベント ${fmt(totals.keyEvents)}`}
            emptyText="絞り込み条件に一致する行がありません。"
          />
        </>
      )}
    </Card>
  );
}
