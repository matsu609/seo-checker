/**
 * シェア・参照率の母集団（2026-09-23）。
 *
 * 以前はプロンプトの回答と、キーワード側の観測（本文の無い順位計測・AI Overviews・AI モード）が
 * 同じ分母に入っていた。順位計測は model = "aio" で保存しているので、モデル別の「AI Overviews」も
 * 順位計測の分だけ n が倍になっていた。
 */
import { describe, expect, it } from "vitest";
import { answerObservations, byModel, keywordAiObservations, promptObservations, shares, type AggregateInput } from "../aggregate";
import { observationKind, observationsQuery } from "../store";

function obs(over: Partial<AggregateInput> = {}): AggregateInput {
  return {
    brandId: "own",
    promptId: "p1",
    keywordId: null,
    tags: [],
    isBranded: false,
    model: "chatgpt",
    kind: "llm",
    executedAt: "2026-09-14T20:00:00Z",
    mentioned: true,
    cited: false,
    domainClasses: [],
    citedDomains: [],
    ...over,
  };
}

const ROWS: AggregateInput[] = [
  obs({ mentioned: true }),
  obs({ mentioned: false, model: "gemini" }),
  // キーワード側: 順位計測（本文が無いので必ず言及なし）・AI Overviews・AI モード
  obs({ promptId: null, keywordId: "k1", kind: "rank", model: "aio", mentioned: false }),
  obs({ promptId: null, keywordId: "k1", kind: "aio", model: "aio", mentioned: true, cited: true }),
  obs({ promptId: null, keywordId: "k1", kind: "ai_mode", model: "ai_mode", mentioned: false }),
  // 今すぐ実行（どのプロンプトにも紐づかない）
  obs({ promptId: null, keywordId: null, kind: "llm", mentioned: true }),
];

describe("ブランドシェアはプロンプトの回答だけで数える（§3.3）", () => {
  it("キーワード側の観測と今すぐ実行を分母に入れない", () => {
    const [own] = shares(promptObservations(ROWS));
    expect(own.n).toBe(2);
    expect(own.shareMention).toBe(0.5);
    // 以前（全部を分母にしていた）は 3 / 6
    expect(shares(ROWS)[0].n).toBe(6);
  });

  it("モデル別の AI Overviews に順位計測を混ぜない（n が倍にならない）", () => {
    const perModel = byModel(answerObservations(ROWS));
    expect(perModel.get("aio")).toHaveLength(1);
    expect(perModel.get("ai_mode")).toHaveLength(1);
    expect(perModel.get("chatgpt")).toHaveLength(1);
    expect(perModel.get("gemini")).toHaveLength(1);
  });

  it("キーワードの引用率は AI Overviews / AI モードだけ", () => {
    expect(keywordAiObservations(ROWS).map((o) => o.kind)).toEqual(["aio", "ai_mode"]);
  });

  it("種類が無い行は、プロンプト → LLM、キーワード → 順位計測（分母に入れない側）とみなす", () => {
    const legacy = [obs({ kind: undefined }), obs({ kind: undefined, promptId: null, keywordId: "k1", model: "aio" })];
    expect(promptObservations(legacy)).toHaveLength(1);
    expect(keywordAiObservations(legacy)).toHaveLength(0);
  });
});

describe("保存形からの種類の読み取り", () => {
  it("計測の種類があればそれを使う", () => {
    expect(observationKind("aio", null, "k1", "aio")).toBe("aio");
    expect(observationKind("rank", null, "k1", "aio")).toBe("rank");
  });

  it("取れなければ、プロンプト → llm、キーワードの AI モード → ai_mode、それ以外のキーワード → rank", () => {
    expect(observationKind(undefined, "p1", null, "chatgpt")).toBe("llm");
    expect(observationKind(undefined, null, null, "chatgpt")).toBe("llm");
    expect(observationKind(undefined, null, "k1", "ai_mode")).toBe("ai_mode");
    expect(observationKind(undefined, null, "k1", "aio")).toBe("rank");
  });
});

describe("観測の期間（月次レポートは月の範囲で引く。G9）", () => {
  it("月の範囲なら 以上 と 未満 の 2 つの条件で引く", () => {
    const q = observationsQuery("user_1", { start: "2026-07-31T15:00:00.000Z", end: "2026-09-30T15:00:00.000Z" });
    expect(q).toContain("&observed_at=gte.2026-07-31T15%3A00%3A00.000Z");
    expect(q).toContain("&observed_at=lt.2026-09-30T15%3A00%3A00.000Z");
    expect(q).toContain("geo_measurements(model,executed_at,kind)");
  });

  it("日数なら今から数える（ダッシュボード）", () => {
    const q = observationsQuery("user_1", 90, new Date("2026-09-23T00:00:00Z"));
    expect(q).toContain("&observed_at=gte.2026-06-25T00%3A00%3A00.000Z");
    expect(q).not.toContain("observed_at=lt.");
  });
});
