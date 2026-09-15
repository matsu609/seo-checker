/**
 * GSC クエリルール Q01〜Q20（docs/dev/diagnosis-rules-spec.md §9.3）。
 *
 * ここで扱う比率はすべて「一覧に出たクエリの中での比率」。Search Console は
 * 少数のクエリを匿名化して一覧から外すため、サイト全体の比率ではない（§7 / §18）。
 * D04 が同時に発火しているときは、説明でその旨を必ず添える。
 */
import { changeOf, comparable, formatNumber, formatPercent, gsc, rule, sumOf } from "./helpers";
import { queryIntent, QUERY_INTENT_LABELS, type QueryIntent } from "../normalize";
import type { DiagnosisContext, DiagnosisRule, KeyedMetrics } from "../types";

const TOP = 10;

/** 一覧内の比率であることを必ず添える一文 */
function coverageNote(ctx: DiagnosisContext): string {
  const c = ctx.derived.queryCoverage;
  if (c === null) return "この比率は、一覧に出ているクエリの中での比率です";
  return `この比率は、一覧に出ているクエリの中での比率です（クエリ取得率 ${formatPercent(c, 0)}）`;
}

/** 意図で絞ったクエリ。合計は engine が計算済みの derived.byIntent を使う */
function ofIntent(ctx: DiagnosisContext, intent: QueryIntent): { rows: KeyedMetrics[]; clicks: number; impressions: number } {
  const entry = ctx.derived.byIntent.find((x) => x.intent === intent);
  const rows = (ctx.gsc?.queries.current ?? []).filter((r) => queryIntent(r.key) === intent);
  return { rows, clicks: entry?.clicks ?? 0, impressions: entry?.impressions ?? 0 };
}

/** 意図ベースのルールをまとめて作る */
function intentRule(args: {
  id: string;
  intent: QueryIntent;
  name: string;
  severity: DiagnosisRule["severity"];
  fact: string;
  possibleCauses: string[];
  requiredChecks: string[];
  recommendedActions: string[];
  prohibitedConclusions: string[];
  /** この割合以上のクリックがあれば発火 */
  minShare?: number;
}): DiagnosisRule {
  return rule({
    id: args.id,
    category: "query",
    name: args.name,
    severity: args.severity,
    defaultConfidence: "medium",
    fact: args.fact,
    possibleCauses: args.possibleCauses,
    requiredChecks: args.requiredChecks,
    recommendedActions: args.recommendedActions,
    prohibitedConclusions: args.prohibitedConclusions,
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || ctx.derived.queryClicks.current === 0) return null;
      const found = ofIntent(ctx, args.intent);
      if (found.rows.length === 0) return null;
      const share = found.clicks / ctx.derived.queryClicks.current;
      const minShare = args.minShare ?? 0.05;
      if (share < minShare && found.clicks < ctx.thresholds.minimumRuleImpressions / 10) return null;
      const top = [...found.rows].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
      return {
        evidence: [
          `「${QUERY_INTENT_LABELS[args.intent]}」のクエリが ${found.rows.length} 件、クリック ${formatNumber(found.clicks)} 回（一覧内の ${formatPercent(share, 0)}）`,
          `例: ${top.map((r) => `${r.key}（${formatNumber(r.clicks)} クリック / 順位 ${r.position.toFixed(1)}）`).join(" / ")}`,
          coverageNote(ctx),
        ],
        subjects: top.map((r) => r.key),
        impact: Math.min(1, share * 2),
      };
    },
  });
}

export const QUERY_RULES: DiagnosisRule[] = [
  rule({
    id: "Q01",
    category: "query",
    name: "指名検索依存",
    severity: "high",
    defaultConfidence: "medium",
    fact: "一覧に出たクエリのクリックの多くが、社名・ブランド名を含む検索で占められている",
    possibleCauses: ["既存顧客・名刺交換した相手がサイトを探しているだけ", "商品・サービスの一般名称で上位に出られていない", "新規の需要を拾うページが無い"],
    requiredChecks: ["非指名クエリの数と順位", "クエリ取得率", "商品カテゴリー名での検索順位"],
    recommendedActions: ["主力商品の一般名称（カテゴリー名 + 用途）で 1 ページずつ用意する", "非指名クエリで 11〜20 位のものを優先して強化する"],
    prohibitedConclusions: ["指名検索比率を、クエリ取得率を無視してサイト全体の比率として断定しない", "指名検索が多いこと自体を悪いことと書かない"],
    effort: "large",
    evaluate: (ctx) => {
      const share = ctx.derived.brandClickShare;
      if (!ctx.gsc || share === null || share < ctx.thresholds.highBrandClickShare) return null;
      return {
        evidence: [
          `指名クリック ${formatNumber(ctx.derived.brandClicks.current)} 回 ÷ 一覧のクリック合計 ${formatNumber(ctx.derived.queryClicks.current)} 回 = ${formatPercent(share, 0)}`,
          `判定の目安（${formatPercent(ctx.thresholds.highBrandClickShare, 0)}）を超えています`,
          `指名の判定に使った語: ${ctx.brandTerms.join(" / ") || "（未設定）"}`,
          coverageNote(ctx),
        ],
        confidence: ctx.derived.queryCoverage !== null && ctx.derived.queryCoverage < ctx.thresholds.lowQueryCoverage ? "low" : "medium",
        impact: 0.9,
      };
    },
  }),

  rule({
    id: "Q02",
    category: "query",
    name: "非指名検索の成長",
    severity: "low",
    defaultConfidence: "medium",
    fact: "社名を含まない検索からのクリックが増えている",
    possibleCauses: ["コンテンツの追加や順位改善が効いている", "検索需要そのものの増加"],
    requiredChecks: ["増えたクエリが狙っている顧客層のものか", "そのクエリの着地ページ"],
    recommendedActions: ["伸びているテーマの周辺キーワードにページを広げる"],
    prohibitedConclusions: ["非指名の増加をそのまま問い合わせ増加と読まない"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.gsc || !comparable(ctx)) return null;
      const change = changeOf(ctx.derived.nonBrandClicks.current, ctx.derived.nonBrandClicks.previous);
      if (change.rate === null || change.rate < ctx.thresholds.majorIncreaseRate) return null;
      return {
        evidence: [
          `非指名クリック ${formatNumber(change.previous)} → ${formatNumber(change.current)} 回（${formatPercent(change.rate)}）`,
          coverageNote(ctx),
        ],
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "Q03",
    category: "query",
    name: "高表示・ゼロクリック",
    severity: "high",
    defaultConfidence: "medium",
    fact: "検索結果には表示されているが、クリックが 1 件も無いクエリがある",
    possibleCauses: ["掲載順位が低い", "タイトルの訴求不足", "検索意図との不一致", "商圏外・対象国外での表示", "計測ノイズ"],
    requiredChecks: ["対象ページ", "国", "デバイス", "日付推移"],
    recommendedActions: ["クエリと着地ページの対応を確認する", "title と meta description を、そのクエリで探している人の言葉に合わせる", "対象顧客・用途・導入事例を本文に足す"],
    prohibitedConclusions: ["そのクエリに確実な需要があると断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const zero = g.queries.current.filter((q) => q.impressions >= ctx.thresholds.minimumRuleImpressions && q.clicks === 0);
      if (zero.length === 0) return null;
      const sorted = [...zero].sort((a, b) => b.impressions - a.impressions);
      const total = sumOf(zero);
      return {
        evidence: [
          `表示 ${formatNumber(ctx.thresholds.minimumRuleImpressions)} 回以上でクリック 0 のクエリが ${zero.length} 件（合計表示 ${formatNumber(total.impressions)} 回）`,
          ...sorted.slice(0, 5).map((q) => `${q.key}: 表示 ${formatNumber(q.impressions)} 回 / 平均順位 ${q.position.toFixed(1)}`),
        ],
        subjects: sorted.slice(0, TOP).map((q) => q.key),
        impact: Math.min(1, total.impressions / Math.max(1, g.totals.current.impressions) * 3),
      };
    },
  }),

  rule({
    id: "Q04",
    category: "query",
    name: "1〜3 位・低 CTR",
    severity: "high",
    defaultConfidence: "medium",
    fact: "上位 3 位以内に出ているのに、クリック率が極端に低いクエリがある",
    possibleCauses: ["AI 概要・強調スニペットで答えが完結している", "検索意図と合っていない（調べ物で終わる）", "ブランドの認知が無く選ばれていない", "タイトルが検索語と噛み合っていない"],
    requiredChecks: ["実際の検索結果の見え方", "そのクエリの検索意図", "検索での見え方（リッチリザルト）"],
    recommendedActions: ["上位なのにクリックされていないクエリの title を、検索語+得られる結果の形に書き直す", "説明文に具体（価格帯・対応地域・実績数）を入れる"],
    prohibitedConclusions: ["表示回数が少ないクエリの CTR を重大な問題として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const rows = g.queries.current.filter((q) => q.impressions >= ctx.thresholds.minimumRuleImpressions && q.position <= 3 && q.ctr < ctx.thresholds.lowCtrTop3);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
      return {
        evidence: [
          `平均順位 3 位以内で CTR が ${formatPercent(ctx.thresholds.lowCtrTop3, 0)} 未満のクエリが ${rows.length} 件`,
          ...sorted.slice(0, 5).map((q) => `${q.key}: 順位 ${q.position.toFixed(1)} / 表示 ${formatNumber(q.impressions)} / CTR ${formatPercent(q.ctr)}`),
        ],
        subjects: sorted.slice(0, TOP).map((q) => q.key),
        impact: 0.8,
      };
    },
  }),

  rule({
    id: "Q05",
    category: "query",
    name: "4〜10 位・低 CTR",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "1 ページ目には出ているが、クリック率が低いクエリがある",
    possibleCauses: ["順位が 1 ページ目の下のほう", "タイトルが埋もれている", "上位の競合が強い"],
    requiredChecks: ["同じクエリの上位ページの見出し", "そのクエリの検索意図"],
    recommendedActions: ["順位の底上げ（内部リンク・内容の追加）と、タイトルの書き換えを両方行う"],
    prohibitedConclusions: ["タイトルだけの問題と断定しない（順位の要因を切り分ける）"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const rows = g.queries.current.filter((q) => q.impressions >= ctx.thresholds.minimumRuleImpressions && q.position > 3 && q.position <= 10 && q.ctr < ctx.thresholds.lowCtrTop10);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
      return {
        evidence: [
          `平均順位 4〜10 位で CTR が ${formatPercent(ctx.thresholds.lowCtrTop10, 0)} 未満のクエリが ${rows.length} 件`,
          ...sorted.slice(0, 5).map((q) => `${q.key}: 順位 ${q.position.toFixed(1)} / 表示 ${formatNumber(q.impressions)} / CTR ${formatPercent(q.ctr)}`),
        ],
        subjects: sorted.slice(0, TOP).map((q) => q.key),
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "Q06",
    category: "query",
    name: "11〜20 位・高表示（優先的な改善候補）",
    severity: "high",
    defaultConfidence: "high",
    fact: "2 ページ目に留まっていて、表示回数の多いクエリがある",
    possibleCauses: ["内容は評価されているが、あと一歩足りない", "内部リンクが弱い", "検索意図の網羅が浅い"],
    requiredChecks: ["対応ページの内容と上位ページの差", "そのページへの内部リンク数"],
    recommendedActions: ["このクエリ群を最優先の改善対象にする（1 ページ目に入ると流入が大きく変わる）", "対応ページに不足している項目（価格・事例・比較・手順）を足す"],
    prohibitedConclusions: ["順位が上がることを保証しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const rows = g.queries.current.filter((q) => q.impressions >= ctx.thresholds.minimumRuleImpressions && q.position > 10 && q.position <= 20);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
      const total = sumOf(rows);
      return {
        evidence: [
          `11〜20 位で表示 ${formatNumber(ctx.thresholds.minimumRuleImpressions)} 回以上のクエリが ${rows.length} 件（合計表示 ${formatNumber(total.impressions)} 回 / クリック ${formatNumber(total.clicks)} 回）`,
          ...sorted.slice(0, 5).map((q) => `${q.key}: 順位 ${q.position.toFixed(1)} / 表示 ${formatNumber(q.impressions)}`),
        ],
        subjects: sorted.slice(0, TOP).map((q) => q.key),
        impact: 0.9,
      };
    },
  }),

  rule({
    id: "Q07",
    category: "query",
    name: "21〜50 位・高表示",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "3 ページ目以降だが、表示回数の多いクエリがある",
    possibleCauses: ["そのテーマの専用ページが無い", "1 ページに複数テーマを詰め込んでいる"],
    requiredChecks: ["いまどのページが当たっているか", "そのテーマの検索意図"],
    recommendedActions: ["テーマごとに専用ページを作るか、既存ページの内容を大幅に足す"],
    prohibitedConclusions: ["表示回数だけで検索需要の大きさを断定しない"],
    effort: "large",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const rows = g.queries.current.filter((q) => q.impressions >= ctx.thresholds.minimumRuleImpressions && q.position > 20 && q.position <= 50);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
      return {
        evidence: [
          `21〜50 位で表示 ${formatNumber(ctx.thresholds.minimumRuleImpressions)} 回以上のクエリが ${rows.length} 件`,
          ...sorted.slice(0, 5).map((q) => `${q.key}: 順位 ${q.position.toFixed(1)} / 表示 ${formatNumber(q.impressions)}`),
        ],
        subjects: sorted.slice(0, TOP).map((q) => q.key),
        impact: 0.5,
      };
    },
  }),

  intentRule({
    id: "Q08",
    intent: "price",
    name: "費用・価格クエリ",
    severity: "medium",
    fact: "費用や価格を調べる検索からの流入がある",
    possibleCauses: ["比較検討の段階にいる見込み客がいる"],
    requiredChecks: ["価格ページの有無", "そのクエリの着地ページ"],
    recommendedActions: ["価格の考え方（目安・条件・事例別の実績）を書いたページを用意する"],
    prohibitedConclusions: ["価格クエリの存在だけで購入意欲を断定しない"],
  }),
  intentRule({
    id: "Q09",
    intent: "adopt",
    name: "導入・申し込みクエリ",
    severity: "high",
    fact: "導入・申し込み・依頼といった、行動に近い検索からの流入がある",
    possibleCauses: ["実行段階の顧客候補が来ている"],
    requiredChecks: ["着地ページから問い合わせへの導線", "そのクエリの順位"],
    recommendedActions: ["着地ページの見える位置に問い合わせ導線を置く", "申し込みの流れと必要なものを明記する"],
    prohibitedConclusions: ["行動クエリの流入を、そのまま商談数と読まない"],
  }),
  intentRule({
    id: "Q10",
    intent: "case",
    name: "事例・評判クエリ",
    severity: "medium",
    fact: "事例・実績・評判を調べる検索からの流入がある",
    possibleCauses: ["導入前に他社の実績を確かめている"],
    requiredChecks: ["事例ページの有無と件数"],
    recommendedActions: ["業種・規模・課題別に事例を並べ、数字（期間・効果・費用感）を入れる"],
    prohibitedConclusions: ["事例検索の多さを信頼の証と断定しない（不安の裏返しのこともある）"],
  }),
  intentRule({
    id: "Q11",
    intent: "compare",
    name: "比較クエリ",
    severity: "medium",
    fact: "比較・違い・おすすめといった検索からの流入がある",
    possibleCauses: ["競合や代替手段と並べて検討されている"],
    requiredChecks: ["比較対象として誰が挙がっているか", "自社の強みが書かれているか"],
    recommendedActions: ["選び方の基準を示すページを作る（他社を貶めずに、条件ごとの向き不向きを書く）"],
    prohibitedConclusions: ["比較検索の存在だけで競合に負けていると断定しない"],
  }),
  intentRule({
    id: "Q12",
    intent: "definition",
    name: "「とは」検索中心",
    severity: "medium",
    fact: "言葉の意味を調べる段階の検索が多い",
    possibleCauses: ["認知・情報収集の層が中心で、購入検討層に届いていない"],
    requiredChecks: ["その流入が問い合わせにつながっているか", "検討段階のページの有無"],
    recommendedActions: ["解説ページから、比較・価格・事例のページへ内部リンクを引く"],
    prohibitedConclusions: ["情報収集層の流入を無価値と決めつけない"],
    minShare: 0.2,
  }),
  intentRule({
    id: "Q16",
    intent: "recruit",
    name: "採用検索の混在",
    severity: "medium",
    fact: "求人・採用に関する検索からの流入が混じっている",
    possibleCauses: ["採用ページが検索で強い", "顧客向けの露出と混ざって数値が読めなくなっている"],
    requiredChecks: ["採用クエリのクリック比率", "採用ページの着地数"],
    recommendedActions: ["顧客獲得の数値を見るときは、採用クエリと採用ページを除いて集計する"],
    prohibitedConclusions: ["採用流入を顧客獲得の成果に数えない"],
  }),
  intentRule({
    id: "Q17",
    intent: "support",
    name: "既存顧客のサポート検索の混在",
    severity: "low",
    fact: "ログイン・使い方・解約といった既存顧客向けの検索が混じっている",
    possibleCauses: ["既存顧客がサイトをサポート窓口として使っている"],
    requiredChecks: ["サポート系クエリのクリック比率"],
    recommendedActions: ["新規獲得の数値からサポート系を分けて見る"],
    prohibitedConclusions: ["既存顧客の検索を新規需要に数えない"],
  }),
  intentRule({
    id: "Q18",
    intent: "place",
    name: "地名検索",
    severity: "medium",
    fact: "地名を含む検索からの流入がある",
    possibleCauses: ["商圏内で探されている", "商圏外からの検索が混じっている"],
    requiredChecks: ["その地名が対応可能な地域か", "地域ページの有無"],
    recommendedActions: ["対応地域を明記し、主要な地域ごとに実績を載せる"],
    prohibitedConclusions: ["地名検索の存在だけで、その地域に需要があると断定しない"],
  }),
  intentRule({
    id: "Q20",
    intent: "problem",
    name: "問題・症状クエリ",
    severity: "medium",
    fact: "困りごとや不具合を調べる検索からの流入がある",
    possibleCauses: ["課題を自覚した見込み客が来ている"],
    requiredChecks: ["その課題に対応するページがあるか"],
    recommendedActions: ["症状 → 原因 → 対処 → 依頼の流れで 1 ページにまとめる"],
    prohibitedConclusions: ["困りごと検索をそのまま受注見込みと読まない"],
  }),

  rule({
    id: "Q13",
    category: "query",
    name: "商品・サービス名検索の不足",
    severity: "high",
    defaultConfidence: "low",
    fact: "指名検索が中心で、商品・サービスの一般名称での流入がほとんど無い",
    possibleCauses: ["カテゴリー名でのページが無い", "商品名が社内用語で、検索されている言葉と違う"],
    requiredChecks: ["顧客が実際に使う呼び方", "カテゴリー名での検索順位"],
    recommendedActions: ["顧客の言葉（カテゴリー名 + 用途 + 地域）でページを作る"],
    prohibitedConclusions: ["一般名称での需要の大きさを、このデータだけで断定しない"],
    effort: "large",
    evaluate: (ctx) => {
      const share = ctx.derived.brandClickShare;
      if (!ctx.gsc || share === null || share < ctx.thresholds.highBrandClickShare) return null;
      if (ctx.derived.nonBrandClicks.current > ctx.derived.brandClicks.current * 0.25) return null;
      return {
        evidence: [
          `非指名クリックは ${formatNumber(ctx.derived.nonBrandClicks.current)} 回で、指名 ${formatNumber(ctx.derived.brandClicks.current)} 回の ${formatPercent(ctx.derived.nonBrandClicks.current / Math.max(1, ctx.derived.brandClicks.current), 0)} しかありません`,
          coverageNote(ctx),
        ],
        impact: 0.8,
      };
    },
  }),

  rule({
    id: "Q14",
    category: "query",
    name: "無関係クエリでの表示",
    severity: "medium",
    defaultConfidence: "low",
    fact: "クリックがまったく発生していない表示だけのクエリが、全体の表示回数の多くを占めている",
    possibleCauses: ["ページのテーマと検索意図がずれている", "対象外の地域・言語での表示", "自動検索などのノイズ"],
    requiredChecks: ["該当クエリの中身", "着地ページ", "国別の内訳"],
    recommendedActions: ["ページのテーマを絞る（1 ページ 1 テーマ）", "対象外の露出は無視してよいか判断する"],
    prohibitedConclusions: ["クリックが無いことだけで、そのクエリを不要と決めない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || g.queries.current.length === 0) return null;
      const zero = g.queries.current.filter((q) => q.clicks === 0);
      const zeroImpressions = zero.reduce((acc, q) => acc + q.impressions, 0);
      const allImpressions = g.queries.current.reduce((acc, q) => acc + q.impressions, 0);
      if (allImpressions === 0) return null;
      const share = zeroImpressions / allImpressions;
      if (share < 0.6 || zero.length < 10) return null;
      return {
        evidence: [
          `クリック 0 のクエリが ${zero.length} 件あり、一覧の表示回数の ${formatPercent(share, 0)} を占めています`,
          coverageNote(ctx),
        ],
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "Q15",
    category: "query",
    name: "不自然な反復クエリ",
    severity: "low",
    defaultConfidence: "low",
    fact: "表示回数がほぼ同じで、クリックが 0 のクエリがまとまって並んでいる",
    possibleCauses: ["順位計測ツールによる自動検索", "クローラーやスパム"],
    requiredChecks: ["該当クエリの国とデバイス", "日別の推移（毎日同じ回数か）"],
    recommendedActions: ["該当クエリを除いた数値でも傾向が同じか確かめる"],
    prohibitedConclusions: ["自動検索と断定する前に、実際の検索の可能性を残す"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const zero = g.queries.current.filter((q) => q.clicks === 0 && q.impressions >= 10);
      if (zero.length < 8) return null;
      const counts = new Map<number, string[]>();
      for (const q of zero) {
        const list = counts.get(q.impressions) ?? [];
        list.push(q.key);
        counts.set(q.impressions, list);
      }
      const suspicious = [...counts.entries()].filter(([, keys]) => keys.length >= 5).sort((a, b) => b[1].length - a[1].length);
      if (suspicious.length === 0) return null;
      const [impressions, keys] = suspicious[0];
      return {
        evidence: [
          `表示回数がちょうど ${formatNumber(impressions)} 回でクリック 0 のクエリが ${keys.length} 件、同じ値で並んでいます`,
          `例: ${keys.slice(0, 5).join(" / ")}`,
        ],
        subjects: keys.slice(0, TOP),
        impact: 0.2,
      };
    },
  }),

  rule({
    id: "Q19",
    category: "query",
    name: "競合名での表示",
    severity: "low",
    defaultConfidence: "low",
    fact: "自社のブランド語を含まない企業名らしきクエリで表示されている",
    possibleCauses: ["比較対象として認識されている", "比較記事が当たっている"],
    requiredChecks: ["該当クエリが本当に競合名か", "着地ページの内容"],
    recommendedActions: ["比較検討されている前提で、条件ごとの向き不向きを書いたページを用意する"],
    prohibitedConclusions: ["企業名らしき文字列だけで競合と断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const company = /株式会社|有限会社|合同会社|\(株\)|（株）/;
      const rows = g.queries.current.filter((q) => company.test(q.key) && !ctx.brandTerms.some((t) => q.key.toLowerCase().includes(t)));
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
      return {
        evidence: [
          `自社名を含まない企業名らしきクエリが ${rows.length} 件`,
          ...sorted.slice(0, 3).map((q) => `${q.key}: 表示 ${formatNumber(q.impressions)} / クリック ${formatNumber(q.clicks)}`),
        ],
        subjects: sorted.slice(0, 5).map((q) => q.key),
        impact: 0.2,
      };
    },
  }),
];
