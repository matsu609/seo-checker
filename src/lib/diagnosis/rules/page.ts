/**
 * GSC ページルール P01〜P15（docs/dev/diagnosis-rules-spec.md §9.4）。
 *
 * ページの用途は URL のパスから見分ける。日本語サイトでよく使われる語を
 * 並べただけの素朴な判定なので、確度は基本的に「中」以下にする。
 */
import { changeOf, comparable, formatNumber, formatPercent, gsc, indexOf, rule, sumOf } from "./helpers";
import { isHomePath, normalizeUrl } from "../normalize";
import type { DiagnosisRule, KeyedMetrics } from "../types";

const TOP = 10;

type PagePurpose = "home" | "company" | "product" | "news" | "blog" | "contact" | "faq" | "recruit" | "category" | "other";

const PATTERNS: { purpose: PagePurpose; re: RegExp }[] = [
  { purpose: "company", re: /\/(company|about|corporate|profile|overview|greeting|message|kaisha)/i },
  { purpose: "contact", re: /\/(contact|inquiry|toiawase|otoiawase|form|estimate|mitsumori|request)/i },
  { purpose: "faq", re: /\/(faq|qa|question|help|support)/i },
  { purpose: "recruit", re: /\/(recruit|career|job|saiyo|entry)/i },
  { purpose: "news", re: /\/(news|topics|release|info|oshirase|whatsnew)/i },
  { purpose: "blog", re: /\/(blog|column|article|media|magazine|journal|post)/i },
  { purpose: "product", re: /\/(product|service|solution|item|goods|lineup|menu|plan|price|case|works|jirei|jisseki)/i },
];

export function purposeOf(url: string): PagePurpose {
  const n = normalizeUrl(url);
  if (!n) return "other";
  if (isHomePath(n.path)) return "home";
  for (const p of PATTERNS) {
    if (p.re.test(n.path)) return p.purpose;
  }
  // 末尾がスラッシュ無しの 1 階層 = カテゴリーとみなす
  const depth = n.path.split("/").filter(Boolean).length;
  return depth <= 1 ? "category" : "other";
}

function group(rows: readonly KeyedMetrics[], purpose: PagePurpose): KeyedMetrics[] {
  return rows.filter((r) => purposeOf(r.key) === purpose);
}

/** 用途ごとの「クリックが集中している」ルールを作る */
function concentrationRule(args: {
  id: string;
  purpose: PagePurpose;
  name: string;
  severity: DiagnosisRule["severity"];
  share: number;
  fact: string;
  possibleCauses: string[];
  requiredChecks: string[];
  recommendedActions: string[];
  prohibitedConclusions: string[];
}): DiagnosisRule {
  return rule({
    id: args.id,
    category: "page",
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
      if (!g || g.pages.current.length === 0) return null;
      const rows = group(g.pages.current, args.purpose);
      if (rows.length === 0) return null;
      const totalClicks = g.pages.current.reduce((acc, p) => acc + p.clicks, 0);
      if (totalClicks === 0) return null;
      const sum = sumOf(rows);
      const share = sum.clicks / totalClicks;
      if (share < args.share) return null;
      const top = [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
      return {
        evidence: [
          `該当するページ ${rows.length} 件のクリック合計 ${formatNumber(sum.clicks)} 回は、ページ一覧のクリック合計の ${formatPercent(share, 0)}`,
          ...top.map((p) => `${normalizeUrl(p.key)?.path ?? p.key}: クリック ${formatNumber(p.clicks)} / 表示 ${formatNumber(p.impressions)}`),
        ],
        subjects: top.map((p) => p.key),
        impact: Math.min(1, share),
      };
    },
  });
}

export const PAGE_RULES: DiagnosisRule[] = [
  concentrationRule({
    id: "P01",
    purpose: "home",
    name: "トップページへの集中",
    severity: "high",
    share: 0.6,
    fact: "検索からのクリックの多くがトップページに集まっている",
    possibleCauses: ["指名検索が中心", "下層ページが検索で評価されていない", "各サービスの専用ページが無い"],
    requiredChecks: ["指名検索の比率", "下層ページのインデックス状況", "サービスごとのページの有無"],
    recommendedActions: ["主力サービスごとに、検索されている言葉で 1 ページずつ用意する", "トップから各サービスページへの内部リンクを本文中に置く"],
    prohibitedConclusions: ["トップ集中を、そのままサイトの出来の悪さと断定しない（指名中心なら自然）"],
  }),
  concentrationRule({
    id: "P02",
    purpose: "company",
    name: "会社情報への集中",
    severity: "medium",
    share: 0.25,
    fact: "会社概要など企業情報のページにクリックが集まっている",
    possibleCauses: ["企業の存在確認が目的の訪問が中心", "商品・サービスのページが検索に出ていない"],
    requiredChecks: ["会社情報に着地したあとの動き", "サービスページの検索順位"],
    recommendedActions: ["会社情報ページから主力サービスへの導線を置く"],
    prohibitedConclusions: ["企業情報の閲覧を、そのまま購入検討と読まない"],
  }),
  concentrationRule({
    id: "P06",
    purpose: "news",
    name: "ニュース・お知らせへの依存",
    severity: "medium",
    share: 0.3,
    fact: "お知らせ・ニュース記事にクリックが集まっている",
    possibleCauses: ["一時的な話題で流入している", "商品ページが検索で弱い"],
    requiredChecks: ["ニュースからサービスページへ移動しているか", "流入の持続性"],
    recommendedActions: ["記事の末尾に、関連するサービスページへの導線を置く"],
    prohibitedConclusions: ["ニュース流入の多さを恒常的な集客力と読まない"],
  }),
  concentrationRule({
    id: "P07",
    purpose: "blog",
    name: "ブログ・記事への依存",
    severity: "medium",
    share: 0.4,
    fact: "ブログ・コラム記事にクリックが集まっている",
    possibleCauses: ["情報収集層が中心", "商談につながるページへの導線が弱い"],
    requiredChecks: ["記事からサービス・問い合わせページへの遷移", "記事の検索意図"],
    recommendedActions: ["記事ごとに、次に見るべきサービスページを 1 つ決めて本文中でリンクする"],
    prohibitedConclusions: ["記事流入の多さを、そのまま見込み客の多さと読まない"],
  }),
  concentrationRule({
    id: "P13",
    purpose: "category",
    name: "カテゴリーページへの集中",
    severity: "low",
    share: 0.4,
    fact: "一覧・カテゴリーのページにクリックが集まっている",
    possibleCauses: ["個別ページが検索で評価されていない", "一覧ページのほうが内容が厚い"],
    requiredChecks: ["個別ページの検索順位", "一覧と個別の役割分担"],
    recommendedActions: ["個別ページに固有の情報（仕様・事例・価格）を足す"],
    prohibitedConclusions: ["一覧と個別が競合していると、URL の形だけで断定しない"],
  }),

  rule({
    id: "P03",
    category: "page",
    name: "主要ページの露出不足",
    severity: "high",
    defaultConfidence: "medium",
    fact: "商品・サービスのページが、検索結果にほとんど出ていない",
    possibleCauses: ["インデックスされていない", "内容が薄い", "内部リンクが少ない", "検索されている言葉と本文の言葉が違う"],
    requiredChecks: ["該当ページのインデックス状況", "そのページへの内部リンク数", "対策キーワードの実際の検索語"],
    recommendedActions: ["サービスページ 1 つにつき、狙う検索語を 1 つ決めて title と見出しに入れる", "トップと関連記事から本文中リンクを引く"],
    prohibitedConclusions: ["露出が無いことだけで、需要が無いと断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || g.pages.current.length === 0) return null;
      const product = group(g.pages.current, "product");
      const totalImpressions = g.pages.current.reduce((acc, p) => acc + p.impressions, 0);
      if (totalImpressions === 0) return null;
      const sum = sumOf(product);
      const share = sum.impressions / totalImpressions;
      if (product.length === 0) {
        return { evidence: ["商品・サービスらしき URL のページが、検索結果に出たページの一覧に 1 件もありません"], confidence: "low", impact: 0.8 };
      }
      if (share >= 0.15) return null;
      return {
        evidence: [
          `商品・サービスらしきページ ${product.length} 件の表示回数は ${formatNumber(sum.impressions)} 回で、全体の ${formatPercent(share, 0)}`,
        ],
        subjects: product.slice(0, 5).map((p) => p.key),
        impact: 0.8,
      };
    },
  }),

  rule({
    id: "P04",
    category: "page",
    name: "主要ページの高表示・低 CTR",
    severity: "high",
    defaultConfidence: "medium",
    fact: "商品・サービスのページは表示されているが、クリック率が低い",
    possibleCauses: ["検索結果での訴求が弱い", "順位が低い", "検索意図と合っていない"],
    requiredChecks: ["そのページに紐づくクエリ", "平均掲載順位", "実際の検索結果の見え方"],
    recommendedActions: ["表示回数の多い順に、title を「検索語 + 具体的な価値」に書き直す", "説明文に対応地域・実績数・価格の目安を入れる"],
    prohibitedConclusions: ["CTR の低さをタイトルだけの問題と断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const rows = group(g.pages.current, "product").filter((p) => p.impressions >= ctx.thresholds.minimumRuleImpressions && p.ctr < ctx.thresholds.lowCtrTop10);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
      return {
        evidence: [
          `表示 ${formatNumber(ctx.thresholds.minimumRuleImpressions)} 回以上で CTR が ${formatPercent(ctx.thresholds.lowCtrTop10, 0)} 未満の商品・サービスページが ${rows.length} 件`,
          ...sorted.slice(0, 5).map((p) => `${normalizeUrl(p.key)?.path ?? p.key}: 表示 ${formatNumber(p.impressions)} / CTR ${formatPercent(p.ctr)} / 順位 ${p.position.toFixed(1)}`),
        ],
        subjects: sorted.slice(0, TOP).map((p) => p.key),
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "P05",
    category: "page",
    name: "上位表示ページの低 CTR",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "平均掲載順位が高いのに、クリック率が低いページがある",
    possibleCauses: ["紐づくクエリが調べ物で終わるもの", "検索結果で答えが完結している", "タイトルが検索語と噛み合っていない"],
    requiredChecks: ["そのページに紐づくクエリ", "検索での見え方"],
    recommendedActions: ["そのページで実際に拾えているクエリを確認し、title をそれに合わせる"],
    prohibitedConclusions: ["表示回数が少ないページの CTR を問題として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const rows = g.pages.current.filter((p) => p.impressions >= ctx.thresholds.minimumRuleImpressions && p.position <= 5 && p.ctr < ctx.thresholds.lowCtrTop3);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
      return {
        evidence: [
          `平均順位 5 位以内で CTR が ${formatPercent(ctx.thresholds.lowCtrTop3, 0)} 未満のページが ${rows.length} 件`,
          ...sorted.slice(0, 5).map((p) => `${normalizeUrl(p.key)?.path ?? p.key}: 順位 ${p.position.toFixed(1)} / 表示 ${formatNumber(p.impressions)} / CTR ${formatPercent(p.ctr)}`),
        ],
        subjects: sorted.slice(0, TOP).map((p) => p.key),
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "P08",
    category: "page",
    name: "問い合わせページの高表示",
    severity: "low",
    defaultConfidence: "low",
    fact: "問い合わせ・見積もりのページが検索結果に多く出ている",
    possibleCauses: ["社名 + 問い合わせで探されている", "意図しないクエリで出ている"],
    requiredChecks: ["そのページに紐づくクエリ"],
    recommendedActions: ["問い合わせページに、何を相談できるかと回答までの流れを書く"],
    prohibitedConclusions: ["問い合わせページの露出を、そのまま問い合わせ意欲と読まない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const rows = group(g.pages.current, "contact").filter((p) => p.impressions >= ctx.thresholds.minimumRuleImpressions);
      if (rows.length === 0) return null;
      return {
        evidence: rows.slice(0, 3).map((p) => `${normalizeUrl(p.key)?.path ?? p.key}: 表示 ${formatNumber(p.impressions)} / クリック ${formatNumber(p.clicks)} / CTR ${formatPercent(p.ctr)}`),
        subjects: rows.slice(0, 5).map((p) => p.key),
        impact: 0.2,
      };
    },
  }),

  rule({
    id: "P09",
    category: "page",
    name: "FAQ の高表示",
    severity: "low",
    defaultConfidence: "medium",
    fact: "よくある質問のページが検索結果に多く出ている",
    possibleCauses: ["疑問を持った段階の人が来ている", "質問の答えが検索結果で完結している"],
    requiredChecks: ["FAQ からサービス・問い合わせページへの移動"],
    recommendedActions: ["各質問の答えの末尾に、関連するサービスページへのリンクを置く"],
    prohibitedConclusions: ["FAQ の露出を、そのまま購入検討と読まない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const rows = group(g.pages.current, "faq").filter((p) => p.impressions >= ctx.thresholds.minimumRuleImpressions);
      if (rows.length === 0) return null;
      return {
        evidence: rows.slice(0, 3).map((p) => `${normalizeUrl(p.key)?.path ?? p.key}: 表示 ${formatNumber(p.impressions)} / クリック ${formatNumber(p.clicks)}`),
        subjects: rows.slice(0, 5).map((p) => p.key),
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "P11",
    category: "page",
    name: "前期に出ていたページの消失",
    severity: "high",
    defaultConfidence: "medium",
    fact: "前期にクリックがあったページが、当期の検索結果に出ていない",
    possibleCauses: ["ページの削除や URL 変更", "noindex の設定", "インデックスからの脱落", "順位の大幅な下落"],
    requiredChecks: ["該当 URL が今も存在するか", "301 リダイレクトの設定", "インデックス状況"],
    recommendedActions: ["消えたページのうちクリックが多かったものを優先して、URL の生死とリダイレクトを確認する"],
    prohibitedConclusions: ["一覧に出ないことだけで、インデックスから消えたと断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || !comparable(ctx)) return null;
      const currentIndex = indexOf(g.pages.current);
      const gone = g.pages.previous.filter((p) => p.clicks >= 5 && !currentIndex.has(p.key)).sort((a, b) => b.clicks - a.clicks);
      if (gone.length === 0) return null;
      return {
        evidence: [
          `前期に 5 クリック以上あったのに、当期の一覧に出ていないページが ${gone.length} 件`,
          ...gone.slice(0, 5).map((p) => `${normalizeUrl(p.key)?.path ?? p.key}: 前期 ${formatNumber(p.clicks)} クリック`),
        ],
        subjects: gone.slice(0, TOP).map((p) => p.key),
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "P12",
    category: "page",
    name: "PDF だけが表示されている",
    severity: "medium",
    defaultConfidence: "high",
    fact: "検索結果に PDF が出ていて、同じ内容の HTML ページが見当たらない",
    possibleCauses: ["カタログや仕様書を PDF のまま置いている", "HTML の説明ページが無い"],
    requiredChecks: ["その PDF の内容に対応する HTML ページがあるか"],
    recommendedActions: ["PDF の内容を HTML ページにも起こし、PDF はダウンロード用として併置する"],
    prohibitedConclusions: ["PDF の露出を、そのまま資料請求の意欲と読まない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const pdfs = g.pages.current.filter((p) => normalizeUrl(p.key)?.extension === "pdf" && p.impressions >= 10);
      if (pdfs.length === 0) return null;
      const sorted = [...pdfs].sort((a, b) => b.impressions - a.impressions);
      return {
        evidence: [
          `検索結果に出ている PDF が ${pdfs.length} 件`,
          ...sorted.slice(0, 3).map((p) => `${normalizeUrl(p.key)?.path ?? p.key}: 表示 ${formatNumber(p.impressions)} / クリック ${formatNumber(p.clicks)}`),
        ],
        subjects: sorted.slice(0, 5).map((p) => p.key),
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "P14",
    category: "page",
    name: "同じテーマの URL が複数ある（カニバリ候補）",
    severity: "medium",
    defaultConfidence: "low",
    fact: "パスの最後が同じで、別の階層にある URL が複数、同じように表示されている",
    possibleCauses: ["似た内容のページが分かれている", "カテゴリーと個別ページが競合している", "canonical が効いていない"],
    requiredChecks: ["両方のページに紐づくクエリが同じか", "canonical の指定", "内容の違い"],
    recommendedActions: ["同じクエリで競合しているなら、片方に統合するか canonical を指定する"],
    prohibitedConclusions: ["URL が似ているだけで重複コンテンツ・カニバリゼーションと断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const groups = new Map<string, KeyedMetrics[]>();
      for (const p of g.pages.current) {
        if (p.impressions < 10) continue;
        const n = normalizeUrl(p.key);
        if (!n || isHomePath(n.path)) continue;
        const slug = (n.path.split("/").filter(Boolean).pop() ?? "").replace(/\.(html?|php)$/i, "");
        if (slug.length < 3) continue;
        const list = groups.get(slug) ?? [];
        list.push(p);
        groups.set(slug, list);
      }
      const dupes = [...groups.entries()].filter(([, rows]) => rows.length >= 2);
      if (dupes.length === 0) return null;
      return {
        evidence: dupes.slice(0, 3).map(([slug, rows]) => `「${slug}」: ${rows.map((r) => `${normalizeUrl(r.key)?.path ?? r.key}（表示 ${formatNumber(r.impressions)}）`).join(" と ")}`),
        subjects: dupes.slice(0, 5).flatMap(([, rows]) => rows.map((r) => r.key)),
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "P15",
    category: "page",
    name: "クリック増・順位悪化のページ",
    severity: "low",
    defaultConfidence: "medium",
    fact: "クリックは増えているのに、そのページの平均掲載順位は下がっている",
    possibleCauses: ["より多くのクエリで（下位に）表示されるようになった", "検索需要そのものが増えた"],
    requiredChecks: ["そのページに紐づくクエリの増減"],
    recommendedActions: ["主要クエリ個別の順位で判断する"],
    prohibitedConclusions: ["ページの平均順位の悪化を、主要キーワードの下落と断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || !comparable(ctx)) return null;
      const previous = indexOf(g.pages.previous);
      const hits = g.pages.current.filter((p) => {
        const before = previous.get(p.key);
        if (!before || before.clicks < 5) return false;
        const change = changeOf(p.clicks, before.clicks);
        return change.rate !== null && change.rate >= ctx.thresholds.majorIncreaseRate && p.position - before.position >= ctx.thresholds.significantPositionChange;
      });
      if (hits.length === 0) return null;
      return {
        evidence: hits.slice(0, 3).map((p) => {
          const before = previous.get(p.key)!;
          return `${normalizeUrl(p.key)?.path ?? p.key}: クリック ${formatNumber(before.clicks)} → ${formatNumber(p.clicks)}、平均順位 ${before.position.toFixed(1)} → ${p.position.toFixed(1)}`;
        }),
        subjects: hits.slice(0, 5).map((p) => p.key),
        impact: 0.2,
      };
    },
  }),
];

/** URL Inspection API が要るルール（E′ の未実装部分。§27 の後半） */
export const PAGE_PENDING = [{ id: "P10", name: "新規ページの表示ゼロ", needs: "URL Inspection API（インデックス状況）" }] as const;
