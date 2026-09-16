/**
 * データ品質ルール D01〜D15（docs/dev/diagnosis-rules-spec.md §9.1）。
 *
 * 入口は Google 連携（OAuth）だけなので、CSV を前提にした項目（D06 の
 * ファイル名不一致、D07 の欠損値）は、API で実際に起きることに読み替えて
 * 判定する。読み替えた場合は name に原文を残す。
 *
 * このカテゴリは「診断できるかどうか」を先に言う役目なので、severity は
 * 高めに振ってある。数値の問題ではなく、他のルールの信用度を決める。
 */
import { formatNumber, formatPercent, gsc, indexOf, outlierDays, rule } from "./helpers";
import type { DiagnosisRule } from "../types";

export const QUALITY_RULES: DiagnosisRule[] = [
  rule({
    id: "D01",
    category: "quality",
    name: "分析期間不足",
    severity: "high",
    defaultConfidence: "high",
    fact: "分析している期間が短く、曜日や月内の波の影響を受けやすい",
    possibleCauses: ["連携したばかりでデータが溜まっていない", "対象期間の指定が短い"],
    requiredChecks: ["Search Console のデータ保持期間", "サイトの公開日"],
    recommendedActions: ["28 日以上（できれば 3 か月）貯まってから傾向を判断する"],
    prohibitedConclusions: ["短い期間の増減だけで施策の成否を判断しない"],
    effort: "small",
    evaluate: (ctx) => {
      const d = ctx.derived;
      if (!ctx.gsc || d.daysCurrent === 0 || d.daysCurrent >= ctx.thresholds.minimumAnalysisDays) return null;
      return {
        evidence: [`当期の日数は ${d.daysCurrent} 日で、判定に必要な ${ctx.thresholds.minimumAnalysisDays} 日に届いていません`],
        impact: 0.8,
      };
    },
  }),

  rule({
    id: "D02",
    category: "quality",
    name: "比較期間不一致",
    severity: "high",
    defaultConfidence: "high",
    fact: "当期と前期の日数が違うため、そのまま比べると増減が実態とずれる",
    possibleCauses: ["期間の指定が月単位（28 日と 31 日）", "データの確定待ちで当期が短い"],
    requiredChecks: ["比較している 2 つの期間の開始日と終了日"],
    recommendedActions: ["同じ日数で比べ直す", "日数が違うときは 1 日あたりに直して比べる"],
    prohibitedConclusions: ["日数の違いによる増減を、施策の効果と読まない"],
    effort: "small",
    evaluate: (ctx) => {
      const d = ctx.derived;
      if (!ctx.gsc || d.daysCurrent === 0 || d.daysPrevious === 0 || d.daysCurrent === d.daysPrevious) return null;
      return { evidence: [`当期 ${d.daysCurrent} 日 / 前期 ${d.daysPrevious} 日`], impact: 0.7 };
    },
  }),

  rule({
    id: "D03",
    category: "quality",
    name: "データ量不足",
    severity: "high",
    defaultConfidence: "high",
    fact: "母数が小さく、率（CTR など）の上下が偶然で大きく振れる",
    possibleCauses: ["公開して間もない", "検索需要そのものが小さい", "インデックスされているページが少ない"],
    requiredChecks: ["インデックス数", "対策キーワードの検索需要"],
    recommendedActions: ["率ではなく実数で見る", "母数が増えるまで率の変化を施策の根拠にしない"],
    prohibitedConclusions: ["表示回数が少ないときの CTR の低さを重大な問題として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      const evidence: string[] = [];
      if (g && g.totals.current.impressions < ctx.thresholds.minimumTotalImpressions) {
        evidence.push(`当期の表示回数は ${formatNumber(g.totals.current.impressions)} 回で、判定の目安 ${formatNumber(ctx.thresholds.minimumTotalImpressions)} 回を下回っています`);
      }
      if (ctx.ga4 && ctx.ga4.totals.current.sessions < ctx.thresholds.minimumSessions) {
        evidence.push(`GA4 の全セッションは ${formatNumber(ctx.ga4.totals.current.sessions)} で、判定の目安 ${formatNumber(ctx.thresholds.minimumSessions)} を下回っています`);
      }
      return evidence.length > 0 ? { evidence, impact: 0.7 } : null;
    },
  }),

  rule({
    id: "D04",
    category: "quality",
    name: "クエリ取得率不足",
    severity: "high",
    defaultConfidence: "high",
    fact: "一覧に出ている検索クエリのクリック合計が、サイト全体のクリック数よりかなり少ない",
    possibleCauses: ["Search Console が少数のクエリを匿名化して一覧から外している（仕様）"],
    requiredChecks: ["全体のクリック数", "クエリ一覧のクリック合計"],
    recommendedActions: ["指名／非指名の比率は「一覧に出たクエリの中での比率」として扱う", "ページ別のデータと突き合わせて補う"],
    prohibitedConclusions: ["一覧のクエリ合計をサイト全体の合計とみなさない", "指名検索比率をサイト全体の正確な比率として断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const coverage = ctx.derived.queryCoverage;
      if (!ctx.gsc || coverage === null || coverage >= ctx.thresholds.lowQueryCoverage) return null;
      return {
        evidence: [
          `クエリ一覧のクリック合計 ${formatNumber(ctx.derived.queryClicks.current)} 回 ÷ サイト全体 ${formatNumber(ctx.gsc.totals.current.clicks)} 回 = クエリ取得率 ${formatPercent(coverage, 0)}`,
          `判定の目安（${formatPercent(ctx.thresholds.lowQueryCoverage, 0)}）を下回っています`,
        ],
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "D05",
    category: "quality",
    name: "必須データ不足（原文: 必須ファイル不足）",
    severity: "critical",
    defaultConfidence: "high",
    fact: "診断に必要なデータ元が connected されていないため、判定できない領域がある",
    possibleCauses: ["Search Console / GA4 の連携が済んでいない", "連携先のプロパティを選んでいない"],
    requiredChecks: ["設定画面の Google 連携", "対象サイトの所有権"],
    recommendedActions: ["設定画面から Search Console と GA4 を連携する", "連携先が分析対象のサイトと同じか確かめる"],
    prohibitedConclusions: ["データが無い領域について、問題が無いとも問題があるとも書かない"],
    effort: "small",
    evaluate: (ctx) => {
      const missing: string[] = [];
      if (!ctx.gsc) missing.push("Search Console");
      if (!ctx.ga4) missing.push("GA4");
      if (missing.length === 0) return null;
      return {
        evidence: [`${missing.join(" と ")} のデータがありません`],
        confidence: "high",
        impact: missing.length === 2 ? 1 : 0.6,
      };
    },
  }),

  rule({
    id: "D06",
    category: "quality",
    name: "連携先と分析対象の不一致（原文: ファイル名と内容の不一致）",
    severity: "critical",
    defaultConfidence: "high",
    fact: "連携している Search Console のプロパティが、分析しているサイトと違う",
    possibleCauses: ["複数サイトを持っていて選択を間違えた", "www 有無・http/https 違いのプロパティを選んでいる"],
    requiredChecks: ["設定画面で選んだプロパティ", "分析対象として入力した URL"],
    recommendedActions: ["同じサイトのプロパティを選び直す"],
    prohibitedConclusions: ["別サイトの数値をこのサイトの成果として読まない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      let host: string;
      try {
        host = new URL(ctx.origin).hostname.toLowerCase();
      } catch {
        return null;
      }
      const site = g.siteUrl;
      const matches = site.startsWith("sc-domain:")
        ? host === site.slice("sc-domain:".length).toLowerCase() || host.endsWith(`.${site.slice("sc-domain:".length).toLowerCase()}`)
        : (() => {
            try {
              return new URL(site).hostname.toLowerCase() === host;
            } catch {
              return false;
            }
          })();
      if (matches) return null;
      return { evidence: [`連携先は ${site}、分析対象は ${ctx.origin}`], impact: 1 };
    },
  }),

  rule({
    id: "D07",
    category: "quality",
    name: "数値の不整合（原文: 欠損値）",
    severity: "medium",
    defaultConfidence: "high",
    fact: "ありえない数値の組み合わせが含まれている",
    possibleCauses: ["データの取得中に期間がまたがった", "API 側の一時的な不整合"],
    requiredChecks: ["同じ期間で取り直したときに再現するか"],
    recommendedActions: ["再取得して確認する"],
    prohibitedConclusions: ["不整合のある行を根拠に施策を決めない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const bad = [...g.queries.current, ...g.pages.current].filter((r) => r.clicks > r.impressions || r.impressions < 0 || r.clicks < 0);
      if (bad.length === 0) return null;
      return {
        evidence: [`クリック数が表示回数を上回るなど、整合しない行が ${bad.length} 件あります`],
        subjects: bad.slice(0, 5).map((r) => r.key),
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "D08",
    category: "quality",
    name: "異常値",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "日別の値が中央値から大きく外れている日がある",
    possibleCauses: ["ニュース・展示会・広告などの一時的な露出", "計測やインデックスの一時的な不具合", "自動検索などのノイズ"],
    requiredChecks: ["その日の検索クエリ", "その日のページ", "サイト側の更新履歴"],
    recommendedActions: ["異常値の日を外した平均でも傾向が同じか確かめる"],
    prohibitedConclusions: ["1 日の跳ね上がりを恒常的な成果として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || g.byDate.length < 7) return null;
      const { spikes, drops, median } = outlierDays(g.byDate, ctx.thresholds.abnormalDailyMultiplier, "impressions");
      if (spikes.length === 0 && drops.length === 0) return null;
      const evidence = [`日別の表示回数の中央値は ${formatNumber(median)} 回`];
      if (spikes.length > 0) evidence.push(`中央値の ${ctx.thresholds.abnormalDailyMultiplier} 倍以上の日が ${spikes.length} 日（${spikes.slice(0, 3).map((s) => `${s.key} ${formatNumber(s.impressions)} 回`).join(" / ")}）`);
      if (drops.length > 0) evidence.push(`中央値の 1/${ctx.thresholds.abnormalDailyMultiplier} 以下の日が ${drops.length} 日（${drops.slice(0, 3).map((s) => `${s.key} ${formatNumber(s.impressions)} 回`).join(" / ")}）`);
      return { evidence, impact: 0.4 };
    },
  }),

  rule({
    id: "D09",
    category: "quality",
    name: "タイムゾーン・集計日のずれ",
    severity: "low",
    defaultConfidence: "high",
    fact: "Search Console と GA4 で、集計している期間の終わりが違う",
    possibleCauses: ["Search Console はデータの確定に 2〜3 日かかるため、終了日を後ろにずらしている"],
    requiredChecks: ["両方の期間の開始日・終了日"],
    recommendedActions: ["日別の突き合わせをするときは、同じ日付範囲に切り直す"],
    prohibitedConclusions: ["Search Console のクリック数と GA4 のセッション数の完全一致を求めない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.gsc || !ctx.ga4) return null;
      const a = ctx.gsc.range.current;
      const b = ctx.ga4.range.current;
      if (a.startDate === b.startDate && a.endDate === b.endDate) return null;
      return {
        evidence: [`Search Console は ${a.startDate}〜${a.endDate}、GA4 は ${b.startDate}〜${b.endDate}`],
        impact: 0.2,
      };
    },
  }),

  rule({
    id: "D10",
    category: "quality",
    name: "集計単位の違い",
    severity: "low",
    defaultConfidence: "high",
    fact: "Search Console はクリック（検索結果上の行動）、GA4 はセッション・ユーザーで数えている",
    possibleCauses: ["同じ「訪問」でも数え方が違う（1 クリックが 1 セッションとは限らない）"],
    requiredChecks: ["比べようとしている 2 つの指標の定義"],
    recommendedActions: ["数の一致ではなく、増減の向きが揃っているかで見る"],
    prohibitedConclusions: ["サイト・ページ・ユーザー・セッションを混同しない", "イベント数を問い合わせ人数として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.gsc || !ctx.ga4) return null;
      return {
        evidence: [
          `Search Console のクリック ${formatNumber(ctx.gsc.totals.current.clicks)} 回と、GA4 の自然検索セッション ${formatNumber(ctx.derived.ga4?.organicSessions.current ?? 0)} は別の数え方です`,
        ],
        impact: 0.2,
      };
    },
  }),

  rule({
    id: "D14",
    category: "quality",
    name: "ボット・無関係トラフィックの疑い",
    severity: "medium",
    defaultConfidence: "low",
    fact: "対象としていない国からの表示が多い、または同じクエリが不自然に集中している",
    possibleCauses: ["順位計測ツールやクローラーによる検索", "海外からのスパム的な検索", "実際の海外需要"],
    requiredChecks: ["国別のクリック数（表示だけでクリックが無いか）", "該当クエリの中身", "日別の推移"],
    recommendedActions: ["対象国だけに絞った数値でも傾向が同じか確かめる"],
    prohibitedConclusions: ["海外表示が多いだけで海外需要があると断定しない", "ボットと断定する前にクリックと行動を確認する"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      const share = ctx.derived.foreignImpressionShare;
      if (!g || share === null || share < ctx.thresholds.highForeignImpressionShare) return null;
      const foreign = g.countries.current.filter((c) => c.key.toLowerCase() !== "jpn").slice(0, 3);
      const clicks = foreign.reduce((acc, c) => acc + c.clicks, 0);
      const impressions = foreign.reduce((acc, c) => acc + c.impressions, 0);
      return {
        evidence: [
          `対象外の国からの表示が全体の ${formatPercent(share, 0)}`,
          `上位: ${foreign.map((c) => `${c.key} 表示 ${formatNumber(c.impressions)} / クリック ${formatNumber(c.clicks)}`).join(" / ")}`,
          impressions > 0 ? `その CTR は ${formatPercent(clicks / impressions)}` : "クリックはありません",
        ],
        confidence: clicks === 0 ? "medium" : "low",
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "D15",
    category: "quality",
    name: "期間中の URL 変更・サイト移行の疑い",
    severity: "high",
    defaultConfidence: "low",
    fact: "前期に表示されていた URL の多くが当期に出てこなくなり、代わりに新しい URL が出ている",
    possibleCauses: ["サイトのリニューアルや URL 構造の変更", "CMS の入れ替え", "大量のページ削除"],
    requiredChecks: ["リダイレクトの設定", "サイトマップの更新", "旧 URL のインデックス状況"],
    recommendedActions: ["旧 URL から新 URL への 301 リダイレクトを確認する", "移行前後は数値を単純に比較しない"],
    prohibitedConclusions: ["移行をまたいだ増減を施策の効果として読まない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || g.pages.previous.length < 20) return null;
      const currentIndex = indexOf(g.pages.current);
      const gone = g.pages.previous.filter((p) => p.clicks > 0 && !currentIndex.has(p.key));
      const goneShare = gone.length / g.pages.previous.length;
      const previousIndex = indexOf(g.pages.previous);
      const fresh = g.pages.current.filter((p) => p.clicks > 0 && !previousIndex.has(p.key));
      if (goneShare < 0.4 || fresh.length < 5) return null;
      return {
        evidence: [
          `前期にクリックがあった ${g.pages.previous.length} ページのうち ${gone.length} ページ（${formatPercent(goneShare, 0)}）が当期の一覧に出ていません`,
          `当期にだけ現れたページが ${fresh.length} 件あります`,
        ],
        subjects: gone.slice(0, 5).map((p) => p.key),
        impact: 0.6,
      };
    },
  }),
];

/**
 * GA4 のイベント単位のデータが要るため、いまは判定できないルール。
 * 段階 G4（GA4 の取り込み）で実装する。画面では「判定していない項目」として出す。
 */
export const QUALITY_PENDING = [
  { id: "D11", name: "イベント設定変更", needs: "GA4 のイベント定義の履歴" },
  { id: "D12", name: "タグ未設置ページ", needs: "GA4 のページ別 page_view" },
  { id: "D13", name: "社内アクセス混入", needs: "GA4 の参照元・IP 除外の設定" },
] as const;
