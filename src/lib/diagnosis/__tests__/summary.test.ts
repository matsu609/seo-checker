/** 読む順番の組み立て（画面と PDF が共有する純関数） */
import { describe, expect, it } from "vitest";
import { buildDiagnosisView, buildFunnel, nextSteps, TOP_COUNT } from "../summary";
import { runDiagnosis, type RunDiagnosisInput } from "../engine";
import { dataset, event, ga4Dataset, metrics, ORIGIN, row, sessions } from "./fixtures";

function run(over: Partial<RunDiagnosisInput> = {}) {
  return runDiagnosis({ origin: ORIGIN, goal: "inquiry", brandTerms: ["サンプル商事"], gsc: dataset(), ga4: ga4Dataset(), ...over });
}

describe("まず手を付けるところ", () => {
  it("優先度の高い順に 3 件だけ先頭に出す", () => {
    const result = run({
      gsc: dataset({
        totals: { current: metrics(286, 7560), previous: metrics(280, 5600) },
        queries: { current: [row("サンプル商事", 240, 400, 1.2), row("看板 製作", 46, 7160, 14)] },
      }),
    });
    const view = buildDiagnosisView(result);
    expect(view.top).toHaveLength(TOP_COUNT);
    expect(view.top).toEqual(result.triggered.slice(0, TOP_COUNT));
  });

  it("残りは重要度で 2 つに分ける", () => {
    const view = buildDiagnosisView(run());
    for (const t of view.important) expect(["critical", "high"]).toContain(t.severity);
    for (const t of view.minor) expect(["medium", "low"]).toContain(t.severity);
    expect(view.top.length + view.important.length + view.minor.length).toBe(run().triggered.length);
  });

  it("重要度ごとの件数を数える", () => {
    const view = buildDiagnosisView(run());
    const sum = view.counts.critical + view.counts.high + view.counts.medium + view.counts.low;
    expect(sum).toBe(run().triggered.length);
  });
});

describe("発火 0 件のときの書き分け", () => {
  it("データが無いだけのときは「診断できていない」", () => {
    const view = buildDiagnosisView(run({ gsc: null, ga4: null }));
    expect(view.emptyReason).toBe("no-data");
  });

  it("本当に何も出なければ「問題が見つからない」", () => {
    const result = { ...run(), triggered: [] };
    expect(buildDiagnosisView(result).emptyReason).toBe("no-issues");
  });

  it("普通に発火していれば null", () => {
    expect(buildDiagnosisView(run()).emptyReason).toBeNull();
  });
});

describe("訪問後の流れ", () => {
  it("素の率ではなく、段階ごとの目安との差でいちばん落ちている区間を決める", () => {
    // CTA クリック率 10%（目安 2% なので good）、フォーム完了率 10%（目安 40% なので悪い）。
    // 素の率で比べると両方 10% で並ぶが、目安と比べれば完了のほうが落ちている
    const result = run({
      ga4: ga4Dataset({ events: [event("contact_click", { sessions: 100 }), event("form_start", { sessions: 80 }), event("generate_lead", { sessions: 8, keyEvents: 8 })] }),
    });
    const funnel = buildFunnel(result.ga4!);
    expect(funnel.worst).not.toBeNull();
    expect(funnel.worst!.from).toBe("フォームを開いた");
    expect(funnel.worst!.to).toBe("送信した");
    expect(funnel.worst!.reference).toBeGreaterThan(funnel.worst!.rate);
  });

  it("どの段階も目安を上回っていれば、落ちている区間は無い", () => {
    const result = run({
      ga4: ga4Dataset({
        channels: { current: [sessions("Organic Search", 1000, { engagedSessions: 800 })] },
        events: [event("contact_click", { sessions: 100 }), event("form_start", { sessions: 90 }), event("generate_lead", { sessions: 60, keyEvents: 60 })],
      }),
    });
    expect(buildFunnel(result.ga4!).worst).toBeNull();
  });

  it("段階ごとの目安を持っている（画面が閾値を知らなくて済む）", () => {
    const funnel = buildFunnel(run().ga4!);
    expect(funnel.steps[0].reference).toBeNull();
    for (const step of funnel.steps.slice(1)) expect(step.reference).toBeGreaterThan(0);
  });

  it("計測していない段階は 0 ではなく null にする", () => {
    const result = run({ ga4: ga4Dataset({ events: [event("page_view")] }) });
    const funnel = buildFunnel(result.ga4!);
    expect(funnel.hasUnmeasured).toBe(true);
    expect(funnel.steps.find((s) => s.label === "送信した")!.value).toBeNull();
    // 訪問と読まれたは計測できている
    expect(funnel.steps[0].value).toBe(1000);
  });

  it("段階は 5 つ", () => {
    expect(buildFunnel(run().ga4!).steps.map((s) => s.label)).toEqual(["訪問した", "読まれた", "問い合わせ導線を押した", "フォームを開いた", "送信した"]);
  });
});

describe("つなぐと分かること", () => {
  it("連携していない側を、利用者の行動として出す", () => {
    const result = run({ gsc: null, ga4: null });
    const steps = nextSteps(result, result.ga4);
    expect(steps[0].action).toContain("Search Console");
    expect(steps[1].action).toContain("GA4");
    // ルール ID（A01〜A10 のような内部の符号）は出さない
    expect(JSON.stringify(steps)).not.toMatch(/[A-Z]\d\d/);
  });

  it("増える判定項目の数は、実装済みのルールから数える", () => {
    const result = run({ gsc: null, ga4: null });
    const steps = nextSteps(result, result.ga4);
    expect(steps[0].count).toBeGreaterThan(50);
    expect(steps[1].count).toBeGreaterThan(30);
  });

  it("両方つながっていて、イベントの割り当てが無ければそれを促す", () => {
    const result = run({ ga4: ga4Dataset({ events: [event("page_view")] }) });
    const actions = nextSteps(result, result.ga4).map((s) => s.action);
    expect(actions.join()).toContain("イベントの割り当て");
  });

  it("一通り揃っていれば、残るのは CRM の話だけ", () => {
    const result = run();
    const steps = nextSteps(result, result.ga4);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toContain("受注");
  });

  it("設定が要るものには設定画面へのリンクを付ける", () => {
    const result = run({ ga4: null });
    const step = nextSteps(result, result.ga4).find((s) => s.action.includes("GA4"))!;
    expect(step.href).toBe("/settings");
  });
});
