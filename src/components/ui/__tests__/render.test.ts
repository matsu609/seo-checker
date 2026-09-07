import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, FeatureIdChips } from "../Badge";
import { Button } from "../Button";
import { Callout } from "../Callout";
import { Card } from "../Card";
import { DataTable, type Column } from "../DataTable";
import { EmptyState } from "../EmptyState";
import { Field, Input } from "../Field";
import { ProgressBar } from "../ProgressBar";
import { StatCard, StatStrip } from "../StatCard";
import { Tabs } from "../Tabs";

describe("Badge", () => {
  it("判定ピルは枠線 + アイコン + 文言", () => {
    const html = renderToStaticMarkup(createElement(Badge, { tone: "warn" }));
    expect(html).toContain("border-warn");
    expect(html).toContain("bg-warn-soft");
    expect(html).toContain("<svg");
    expect(html).toContain("改善余地");
  });
  it("グレード / 無料 / 機能 ID", () => {
    expect(renderToStaticMarkup(createElement(Badge, { tone: "grade", grade: "B" }))).toContain("text-grade-b");
    expect(renderToStaticMarkup(createElement(Badge, { tone: "free" }, "無料"))).toContain("bg-accent-soft");
    const chips = renderToStaticMarkup(createElement(FeatureIdChips, { ids: ["D1", "D2", "D3", "D4", "D5"], max: 2 }));
    expect(chips).toContain("D1");
    expect(chips).toContain("+3");
    expect(chips).toContain("font-mono");
  });
});

describe("Button / Card / Callout / EmptyState / Field / ProgressBar / Stat", () => {
  it("Button の variant と loading", () => {
    const html = renderToStaticMarkup(createElement(Button, { variant: "danger", loading: true }, "削除"));
    expect(html).toContain("border-fail");
    expect(html).toContain("disabled");
    expect(html).toContain("aria-busy");
    expect(html).toContain("animate-spin");
  });
  it("Card は白いシート + 番号付き h2", () => {
    const html = renderToStaticMarkup(createElement(Card, { title: "総合評価", number: 1, printCard: true }, "本文"));
    expect(html).toContain("print-card");
    expect(html).toContain("border-line");
    expect(html).toContain("1.");
    expect(html).not.toContain("shadow");
  });
  it("Callout / EmptyState", () => {
    expect(renderToStaticMarkup(createElement(Callout, { tone: "fail", title: "失敗" }, "詳細"))).toContain('role="alert"');
    expect(renderToStaticMarkup(createElement(EmptyState, { title: "なし" }))).toContain("なし");
  });
  it("Field は label の for と error", () => {
    // FieldProps は children を必須にしているため、createElement の第 3 引数ではなく
    // props に入れる（第 3 引数は React 19 の型では必須 children を満たさない）
    const html = renderToStaticMarkup(
      // eslint-disable-next-line react/no-children-prop
      createElement(Field, {
        label: "URL",
        htmlFor: "u",
        error: "必須です",
        children: createElement(Input, { id: "u", invalid: true }),
      }),
    );
    expect(html).toContain('for="u"');
    expect(html).toContain("border-fail");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("必須です");
  });
  it("ProgressBar", () => {
    const html = renderToStaticMarkup(createElement(ProgressBar, { value: 12, max: 128, label: "12 / 128 ページ" }));
    expect(html).toContain('aria-valuenow="12"');
    expect(html).toContain("width:9.375%");
    expect(renderToStaticMarkup(createElement(ProgressBar, { indeterminate: true }))).toContain("progress-indeterminate");
  });
  it("StatCard の delta と StatStrip", () => {
    const up = renderToStaticMarkup(createElement(StatCard, { label: "セッション", value: 1200, delta: { value: 5.5, unit: "%" } }));
    expect(up).toContain("+5.5%");
    expect(up).toContain("text-pass");
    const down = renderToStaticMarkup(createElement(StatCard, { label: "直帰率", value: 40, delta: { value: 3, positiveIsGood: false } }));
    expect(down).toContain("text-fail");
    const strip = renderToStaticMarkup(createElement(StatStrip, { items: [{ label: "診断項目", value: 24 }, { label: "合格", value: 12 }] }));
    expect(strip).toContain("grid-cols-2");
  });
});

describe("DataTable / Tabs", () => {
  interface Row {
    kw: string;
    rank: number | null;
  }
  const columns: Column<Row>[] = [
    { key: "kw", header: "キーワード", accessor: (r) => r.kw, sortable: true },
    { key: "rank", header: "順位", accessor: (r) => r.rank, align: "right", sortable: true },
  ];
  const rows: Row[] = [
    { kw: "b", rank: 3 },
    { kw: "a", rank: null },
    { kw: "c", rank: 1 },
  ];
  it("defaultSort で並び、null は末尾", () => {
    const html = renderToStaticMarkup(
      createElement(DataTable<Row>, { rows, columns, rowKey: (r) => r.kw, defaultSort: { key: "rank", dir: "asc" } }),
    );
    const order = [...html.matchAll(/<td[^>]*>([abc])<\/td>/g)].map((m) => m[1]);
    expect(order).toEqual(["c", "b", "a"]);
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain("overflow-x-auto");
  });
  it("空のとき emptyText", () => {
    const html = renderToStaticMarkup(createElement(DataTable<Row>, { rows: [], columns, rowKey: (r) => r.kw }));
    expect(html).toContain("表示できるデータがありません");
  });
  it("Tabs は role=tablist と aria-selected", () => {
    const html = renderToStaticMarkup(
      createElement(Tabs, { tabs: [{ id: "a", label: "A", count: 2 }, { id: "b", label: "B" }], value: "b", onChange: () => {} }),
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain(">2<");
  });
});
