/** GA4 のルール（docs/dev/diagnosis-rules-spec.md §10 / §23） */
import { describe, expect, it } from "vitest";
import { runDiagnosis, type RunDiagnosisInput } from "../engine";
import { dataset, event, ga4Dataset, ORIGIN, sessions } from "./fixtures";

function run(over: Partial<RunDiagnosisInput> = {}) {
  return runDiagnosis({
    origin: ORIGIN,
    goal: "inquiry",
    brandTerms: ["サンプル商事"],
    gsc: dataset(),
    ga4: ga4Dataset(),
    ...over,
  });
}

const idsOf = (r: ReturnType<typeof run>) => r.triggered.map((t) => t.id);

describe("問い合わせまでの流れ（K 系）", () => {
  it("K05 フォームを開いた人の完了率が低いと発火する", () => {
    const result = run({
      ga4: ga4Dataset({
        events: [event("contact_click", { sessions: 100 }), event("form_start", { sessions: 80 }), event("generate_lead", { sessions: 8, keyEvents: 8 })],
      }),
    });
    expect(idsOf(result)).toContain("K05");
    const k05 = result.triggered.find((t) => t.id === "K05")!;
    expect(k05.severity).toBe("critical");
    expect(k05.evidence.join()).toContain("10%");
  });

  it("K04 ボタンは押されるがフォームが開かれない", () => {
    const result = run({
      ga4: ga4Dataset({
        events: [event("contact_click", { sessions: 100 }), event("form_start", { sessions: 10 }), event("generate_lead", { sessions: 5, keyEvents: 5 })],
      }),
    });
    expect(idsOf(result)).toContain("K04");
  });

  it("K06 完了イベントが無いと発火する（0 件とは書き分ける）", () => {
    const result = run({ ga4: ga4Dataset({ events: [event("page_view"), event("contact_click", { sessions: 50 })] }) });
    const k06 = result.triggered.find((t) => t.id === "K06");
    expect(k06).toBeDefined();
    expect(k06!.prohibitedConclusions.join()).toContain("問い合わせが 0 件であることと同じに扱わない");
  });

  it("K01 CTA のイベントが無いと発火する", () => {
    const result = run({ ga4: ga4Dataset({ events: [event("page_view")] }) });
    expect(idsOf(result)).toContain("K01");
  });

  it("計測が一通りできていれば K01・K06 は発火しない", () => {
    const ids = idsOf(run());
    expect(ids).not.toContain("K01");
    expect(ids).not.toContain("K06");
  });

  it("K07 完了イベントが 1 セッションで何度も発火していると出る", () => {
    const result = run({
      ga4: ga4Dataset({ events: [event("contact_click", { sessions: 50 }), event("form_start", { sessions: 30 }), event("generate_lead", { count: 60, sessions: 20, keyEvents: 60 })] }),
    });
    expect(idsOf(result)).toContain("K07");
  });

  it("K11 キーイベントがセッションに対して多すぎると出る", () => {
    const result = run({
      ga4: ga4Dataset({ channels: { current: [sessions("Organic Search", 200, { keyEvents: 300 })] } }),
    });
    expect(idsOf(result)).toContain("K11");
  });
});

describe("集客（A 系）", () => {
  it("A03 Direct の比率が高いと、計測漏れの可能性を挙げる", () => {
    const result = run({
      ga4: ga4Dataset({ channels: { current: [sessions("Direct", 700), sessions("Organic Search", 300)] } }),
    });
    const a03 = result.triggered.find((t) => t.id === "A03");
    expect(a03).toBeDefined();
    expect(a03!.possibleCauses.join()).toContain("計測の欠落");
    expect(a03!.prohibitedConclusions.join()).toContain("ブランド力の証拠");
  });

  it("A02 自然検索が減ると発火する", () => {
    const result = run({
      ga4: ga4Dataset({
        channels: { current: [sessions("Organic Search", 300)], previous: [sessions("Organic Search", 600)] },
      }),
    });
    expect(idsOf(result)).toContain("A02");
  });

  it("A09 分類できないチャネルがあると発火する", () => {
    const result = run({
      ga4: ga4Dataset({ channels: { current: [sessions("Organic Search", 600), sessions("Unassigned", 200)] } }),
    });
    expect(idsOf(result)).toContain("A09");
  });
});

describe("計測（M 系）", () => {
  it("M04 自社ドメインが参照元になっていると発火する", () => {
    const result = run({
      ga4: ga4Dataset({ sources: [sessions("google / organic", 600), sessions("example.com / referral", 40)] }),
    });
    const m04 = result.triggered.find((t) => t.id === "M04");
    expect(m04).toBeDefined();
    expect(m04!.possibleCauses.join()).toContain("クロスドメイン測定");
  });

  it("M07 大文字小文字だけ違う参照元があると発火する", () => {
    const result = run({
      ga4: ga4Dataset({ sources: [sessions("Google / CPC", 100), sessions("google / cpc", 90)] }),
    });
    expect(idsOf(result)).toContain("M07");
  });

  it("M10 共通イベントに当てられないイベントがあると発火する", () => {
    const result = run({ ga4: ga4Dataset({ events: [event("page_view"), event("my_special_thing", { count: 50 })] }) });
    expect(idsOf(result)).toContain("M10");
  });

  it("M03 開始は取れているのに完了が無いと発火する", () => {
    const result = run({ ga4: ga4Dataset({ events: [event("form_start", { sessions: 40 })] }) });
    expect(idsOf(result)).toContain("M03");
  });
});

describe("GA4 が無いとき", () => {
  it("GA4 のルールは 1 件も発火しない", () => {
    const ids = idsOf(run({ ga4: null }));
    for (const prefix of ["A", "L", "E", "K", "M"]) {
      expect(ids.filter((id) => id.startsWith(prefix) && /^\w\d\d$/.test(id))).toEqual([]);
    }
  });

  it("判定していないことに書かれる", () => {
    expect(run({ ga4: null }).limitations.join()).toContain("訪問後の行動");
  });
});

describe("要約（画面と AI に渡す数字）", () => {
  it("段階ごとのセッション数と率を出す", () => {
    const g = run().ga4;
    expect(g).not.toBeNull();
    expect(g!.sessions).toBe(1000);
    expect(g!.ctaSessions).toBe(50);
    expect(g!.formStartSessions).toBe(28);
    expect(g!.formCompleteSessions).toBe(12);
    expect(g!.ctaClickRate).toBeCloseTo(0.05);
    expect(g!.formStartRate).toBeCloseTo(28 / 50);
    expect(g!.formCompletionRate).toBeCloseTo(12 / 28);
  });

  it("エンゲージメント率は engagedSessions ÷ sessions（行ごとの率の平均ではない）", () => {
    expect(run().ga4!.engagementRate).toBeCloseTo(0.6);
  });

  it("自然検索の問い合わせ率はチャネル × イベントから出す", () => {
    expect(run().ga4!.organicConversionRate).toBeCloseTo(8 / 600);
  });

  it("何をどう数えたかを必ず開示する", () => {
    expect(run().ga4!.mappingLines.join()).toContain("generate_lead");
  });

  it("イベントが無い共通イベントは、判定していないこととして書かれる", () => {
    const result = run({ ga4: ga4Dataset({ events: [event("page_view")] }) });
    expect(result.limitations.join()).toContain("問い合わせ完了に当たる GA4 イベントが無い");
  });

  it("設定画面での割り当てが自動判定より優先される", () => {
    const result = run({
      ga4: ga4Dataset({
        events: [event("page_view"), event("my_special_thing", { sessions: 30 })],
        mappingOverrides: { form_complete: ["my_special_thing"] },
      }),
    });
    expect(result.ga4!.formCompleteSessions).toBe(30);
    expect(result.ga4!.mappingLines.join()).toContain("my_special_thing");
  });
});

describe("GSC と GA4 の両方があるとき", () => {
  it("D09 集計期間がずれていたら注記する（本番では GSC が 3 日遅れる）", () => {
    const g = ga4Dataset();
    const shifted = { ...g, range: { ...g.range, current: { startDate: "2026-08-04", endDate: "2026-08-31" } } };
    expect(idsOf(run({ ga4: shifted }))).toContain("D09");
  });

  it("期間が揃っていれば D09 は出ない", () => {
    expect(idsOf(run())).not.toContain("D09");
  });

  it("D10 数え方の違いを注記する", () => {
    expect(idsOf(run())).toContain("D10");
  });
});
