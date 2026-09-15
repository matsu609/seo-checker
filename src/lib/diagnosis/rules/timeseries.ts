/**
 * GSC 時系列ルール T01〜T15（docs/dev/diagnosis-rules-spec.md §9.2）。
 *
 * 表示回数・クリック・CTR・平均掲載順位の「動き方の組み合わせ」で分ける。
 * T01〜T07 は排他（同時に発火しない）。T08 以降は重ねて発火してよい。
 *
 * 平均掲載順位は「表示回数で重み付けした平均」であって、個々のキーワードの
 * 順位ではない。ここでは必ず「平均」と書き、断定を避ける（§18）。
 */
import { byWeekday, comparable, formatChange, formatNumber, formatPercent, gsc, hasVolume, outlierDays, rule, totalsChange } from "./helpers";
import type { DiagnosisRule, DiagnosisContext } from "../types";
import type { Direction } from "../metrics";

/** T01〜T07 の共通ガード。母数と期間が揃っていなければ何も言わない */
function trendReady(ctx: DiagnosisContext) {
  const g = gsc(ctx);
  if (!g || !hasVolume(ctx, g) || !comparable(ctx)) return null;
  return { g, t: totalsChange(ctx, g) };
}

function line(label: string, dir: Direction, change: ReturnType<typeof totalsChange>["clicks"]): string {
  const word = dir === "up" ? "増加" : dir === "down" ? "減少" : dir === "flat" ? "横ばい" : dir === "new" ? "新規発生" : "小幅な変化";
  return `${label}: ${formatNumber(change.current)}（前期 ${formatNumber(change.previous)}、${formatChange(change)} = ${word}）`;
}

const POSITION_NOTE = "平均掲載順位は表示回数で重み付けした平均で、個々のキーワードの順位ではありません";

/** 組み合わせで 1 件だけ発火させるための表 */
function combo(impressions: Direction, clicks: Direction): (ctx: DiagnosisContext) => ReturnType<DiagnosisRule["evaluate"]> {
  return (ctx) => {
    const ready = trendReady(ctx);
    if (!ready) return null;
    if (ready.t.impressionsDir !== impressions || ready.t.clicksDir !== clicks) return null;
    return {
      evidence: [
        line("表示回数", ready.t.impressionsDir, ready.t.impressions),
        line("クリック", ready.t.clicksDir, ready.t.clicks),
        `CTR: ${formatPercent(ready.t.ctr.current)}（前期 ${formatPercent(ready.t.ctr.previous)}）`,
        `平均掲載順位: ${ready.g.totals.current.position.toFixed(1)}（前期 ${ready.g.totals.previous.position.toFixed(1)}）`,
      ],
      impact: 0.8,
    };
  };
}

export const TIMESERIES_RULES: DiagnosisRule[] = [
  rule({
    id: "T01",
    category: "timeseries",
    name: "表示増・クリック増・CTR 維持",
    severity: "low",
    defaultConfidence: "high",
    fact: "検索での露出が増え、クリックも同じように増えている",
    possibleCauses: ["対象キーワードの順位改善", "ページの追加", "検索需要そのものの増加"],
    requiredChecks: ["増えたクエリが狙っている層のものか", "増えたページが商談につながるページか"],
    recommendedActions: ["伸びているページと同じ作りを他のテーマにも広げる"],
    prohibitedConclusions: ["アクセス増加を売上増加と同一視しない"],
    effort: "small",
    evaluate: combo("up", "up"),
  }),
  rule({
    id: "T02",
    category: "timeseries",
    name: "表示増・クリック横ばい",
    severity: "high",
    defaultConfidence: "high",
    fact: "検索結果に出る回数は増えたが、クリックはほとんど増えていない",
    possibleCauses: ["増えた露出が下位の順位に偏っている", "タイトル・説明文が検索意図と合っていない", "検索結果上の他の要素（AI 概要・広告）に取られている", "対象外の地域・言語での表示が増えた"],
    requiredChecks: ["増えたクエリの平均掲載順位", "そのクエリに紐づくページ", "デバイス別・国別の内訳"],
    recommendedActions: ["表示が多くクリックの少ないクエリの上位 10 件を出し、対応ページの title と説明文を書き直す", "そのクエリで求められている情報が本文にあるか確かめる"],
    prohibitedConclusions: ["露出が増えたことを成果として報告しない", "タイトルの問題と決めつけない（順位・地域の可能性を残す）"],
    effort: "small",
    evaluate: combo("up", "flat"),
  }),
  rule({
    id: "T03",
    category: "timeseries",
    name: "表示増・クリック減少",
    severity: "critical",
    defaultConfidence: "high",
    fact: "露出が増えているのにクリックは減っている",
    possibleCauses: ["主要キーワードの順位が下がり、代わりに関係の薄いクエリで露出が増えた", "検索結果の見え方が変わった", "競合のタイトル・説明文が強くなった"],
    requiredChecks: ["クリックが減ったクエリの順位変化", "増えた露出がどのクエリか", "検索での見え方の変化"],
    recommendedActions: ["クリックが減った上位クエリを特定し、対応ページの内容と順位を確認する"],
    prohibitedConclusions: ["平均掲載順位の変化だけで、すべての検索語の順位が変化したと断定しない"],
    effort: "medium",
    evaluate: combo("up", "down"),
  }),
  rule({
    id: "T04",
    category: "timeseries",
    name: "表示横ばい・クリック増",
    severity: "low",
    defaultConfidence: "high",
    fact: "露出は変わらないが、クリックが増えている",
    possibleCauses: ["順位が上がった", "タイトル・説明文の改善が効いた", "検索結果上の見え方が良くなった"],
    requiredChecks: ["どのページ・どのクエリで増えたか"],
    recommendedActions: ["効いた変更を他のページにも展開する"],
    prohibitedConclusions: ["改善施策との因果関係を、時期の一致だけで断定しない"],
    effort: "small",
    evaluate: combo("flat", "up"),
  }),
  rule({
    id: "T05",
    category: "timeseries",
    name: "表示横ばい・クリック減",
    severity: "high",
    defaultConfidence: "high",
    fact: "露出は変わらないのにクリックが減っている",
    possibleCauses: ["順位が下がった", "検索結果に AI 概要や強調スニペットが増えた", "競合の見出しが強くなった"],
    requiredChecks: ["主要クエリの平均掲載順位の変化", "検索での見え方", "デバイス別の CTR"],
    recommendedActions: ["クリックが落ちたクエリの上位を出し、順位と検索結果の見え方を確認する"],
    prohibitedConclusions: ["CTR の低下をタイトルだけの問題と断定しない"],
    effort: "medium",
    evaluate: combo("flat", "down"),
  }),
  rule({
    id: "T06",
    category: "timeseries",
    name: "表示減・クリック維持",
    severity: "low",
    defaultConfidence: "medium",
    fact: "露出は減ったがクリックは保たれている",
    possibleCauses: ["関係の薄いクエリでの露出が減った（流入の質が上がった）", "低品質なページが整理された"],
    requiredChecks: ["減った露出がどのクエリか", "問い合わせにつながる流入が減っていないか"],
    recommendedActions: ["クリック単位・問い合わせ単位で見て、実害が無いか確かめる"],
    prohibitedConclusions: ["露出の減少をそのまま悪化と読まない"],
    effort: "small",
    evaluate: combo("down", "flat"),
  }),
  rule({
    id: "T07",
    category: "timeseries",
    name: "表示減・クリック減",
    severity: "critical",
    defaultConfidence: "high",
    fact: "露出もクリックも減っている",
    possibleCauses: ["順位の下落", "インデックスからの脱落", "検索需要の季節変動", "サイトの構造変更"],
    requiredChecks: ["インデックス数", "主要ページが検索結果に出ているか", "前年同期のデータ", "サイトの更新履歴"],
    recommendedActions: ["クリックの減少が大きい順にページを出し、そのページがインデックスされているか確認する"],
    prohibitedConclusions: ["前年同期がない状態で季節性を断定しない"],
    effort: "medium",
    evaluate: combo("down", "down"),
  }),

  rule({
    id: "T08",
    category: "timeseries",
    name: "順位改善・クリック横ばい",
    severity: "high",
    defaultConfidence: "medium",
    fact: "平均掲載順位は上がったのに、クリックが増えていない",
    possibleCauses: ["上がったのが検索数の少ないクエリだった", "タイトル・説明文が弱い", "検索意図とページが合っていない"],
    requiredChecks: ["順位が上がったクエリの表示回数", "そのクエリの CTR"],
    recommendedActions: ["順位が上がったクエリのうち表示回数が多いものだけを取り出し、対応ページの見出しを検索意図に寄せる"],
    prohibitedConclusions: ["平均掲載順位の改善を成果として単独で報告しない"],
    effort: "small",
    evaluate: (ctx) => {
      const ready = trendReady(ctx);
      if (!ready) return null;
      const improved = ready.t.positionDiff <= -ctx.thresholds.significantPositionChange;
      if (!improved || ready.t.clicksDir === "up") return null;
      return {
        evidence: [
          `平均掲載順位 ${ready.g.totals.previous.position.toFixed(1)} → ${ready.g.totals.current.position.toFixed(1)}（${Math.abs(ready.t.positionDiff).toFixed(1)} 改善）`,
          line("クリック", ready.t.clicksDir, ready.t.clicks),
          POSITION_NOTE,
        ],
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "T09",
    category: "timeseries",
    name: "順位悪化・表示増",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "平均掲載順位は下がったが、表示回数は増えている",
    possibleCauses: ["新しく下位で表示されるクエリが増え、平均を押し下げている（既存クエリの順位は落ちていない可能性）", "対象範囲の広いページが増えた"],
    requiredChecks: ["主要クエリ個別の順位", "増えたクエリの順位帯"],
    recommendedActions: ["平均ではなく、対策キーワード個別の順位で判断する"],
    prohibitedConclusions: ["平均掲載順位の悪化を、既存キーワードの順位下落と断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const ready = trendReady(ctx);
      if (!ready) return null;
      const worsened = ready.t.positionDiff >= ctx.thresholds.significantPositionChange;
      if (!worsened || ready.t.impressionsDir !== "up") return null;
      return {
        evidence: [
          `平均掲載順位 ${ready.g.totals.previous.position.toFixed(1)} → ${ready.g.totals.current.position.toFixed(1)}（${ready.t.positionDiff.toFixed(1)} 悪化）`,
          line("表示回数", ready.t.impressionsDir, ready.t.impressions),
          POSITION_NOTE,
        ],
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "T10",
    category: "timeseries",
    name: "特定日の急増",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "ある日だけクリックが中央値から大きく跳ね上がっている",
    possibleCauses: ["ニュース・SNS での言及", "展示会やイベント", "広告の出稿", "一時的な検索需要"],
    requiredChecks: ["その日のクエリとページ", "同時期の広報・広告の予定"],
    recommendedActions: ["その日に伸びたページが、継続的に露出できる内容かを見る"],
    prohibitedConclusions: ["一過性の跳ね上がりを平常の成果として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || g.byDate.length < 14) return null;
      const { spikes, median } = outlierDays(g.byDate, ctx.thresholds.abnormalDailyMultiplier, "clicks");
      if (spikes.length === 0) return null;
      return {
        evidence: [
          `日別クリックの中央値は ${formatNumber(median)} 回`,
          ...spikes.slice(0, 3).map((s) => `${s.key}: ${formatNumber(s.clicks)} クリック（中央値の ${(s.clicks / median).toFixed(1)} 倍）`),
        ],
        subjects: spikes.slice(0, 5).map((s) => s.key),
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "T11",
    category: "timeseries",
    name: "特定日の急減",
    severity: "high",
    defaultConfidence: "medium",
    fact: "ある日だけクリックが極端に落ちている",
    possibleCauses: ["サイトの障害・メンテナンス", "インデックスの一時的な問題", "計測の停止", "検索結果の変動"],
    requiredChecks: ["その日のサーバーログ・稼働状況", "その日のインデックス状況", "サイトの更新履歴"],
    recommendedActions: ["落ちた日に公開・変更した内容が無いか確認する"],
    prohibitedConclusions: ["1 日の落ち込みだけで順位下落と断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || g.byDate.length < 14) return null;
      const { drops, median } = outlierDays(g.byDate, ctx.thresholds.abnormalDailyMultiplier, "clicks");
      // 期間の最後の 3 日は、データ確定待ちで下がって見えることがあるので除く
      const tail = new Set(g.byDate.slice(-3).map((d) => d.key));
      const real = drops.filter((d) => !tail.has(d.key));
      if (real.length === 0) return null;
      return {
        evidence: [
          `日別クリックの中央値は ${formatNumber(median)} 回`,
          ...real.slice(0, 3).map((s) => `${s.key}: ${formatNumber(s.clicks)} クリック`),
        ],
        subjects: real.slice(0, 5).map((s) => s.key),
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "T12",
    category: "timeseries",
    name: "週末だけ減少",
    severity: "low",
    defaultConfidence: "high",
    fact: "土日のクリックが平日よりはっきり少ない",
    possibleCauses: ["法人向けのサイトで、平日の業務中に検索されている（正常）"],
    requiredChecks: ["想定している顧客が法人か個人か"],
    recommendedActions: ["平日の数値で比べる。週の区切り方をそろえて前期比を出す"],
    prohibitedConclusions: ["週末の落ち込みを問題として扱わない（BtoB では正常）"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || g.byDate.length < 14) return null;
      const avg = byWeekday(g.byDate, "clicks");
      const weekend = (avg[0] + avg[6]) / 2;
      const weekday = (avg[1] + avg[2] + avg[3] + avg[4] + avg[5]) / 5;
      if (weekday <= 0 || weekend >= weekday * 0.6) return null;
      return {
        evidence: [
          `平日の 1 日あたり平均 ${weekday.toFixed(1)} クリックに対し、土日は ${weekend.toFixed(1)} クリック`,
          `土日は平日の ${formatPercent(weekend / weekday, 0)}`,
        ],
        impact: 0.2,
      };
    },
  }),
];

/**
 * 判定にサイト側の更新履歴が要るルール。
 * 更新日を入力してもらう仕組みができたら実装する（§27 の後半）。
 */
export const TIMESERIES_PENDING = [
  { id: "T13", name: "月末・月初変動", needs: "3 か月以上の日別データ" },
  { id: "T14", name: "更新後に改善", needs: "サイトの更新日（入力）" },
  { id: "T15", name: "更新後に悪化", needs: "サイトの更新日（入力）" },
] as const;
