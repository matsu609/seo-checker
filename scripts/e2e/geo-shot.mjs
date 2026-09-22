#!/usr/bin/env node
/**
 * AI 検索モニタリング（/tools/geo）の画面を撮る。
 *
 * **計測が本番でまだ 1 回も回っていないので、API の応答を差し込んで撮る。**
 * 差し込むのは `/api/geo/setup` と `/api/geo/dashboard` の 2 本だけで、
 * 画面（React の部品・CSS・レイアウト）は本物をそのまま描かせる。
 *
 * 認証は `isAuthEnabled()` が Clerk 未設定なら素通りする作りなので、
 * 鍵を入れずに dev サーバーを起動すればよい。
 *
 *   node scripts/e2e/geo-shot.mjs            … 実測ありの画面
 *   node scripts/e2e/geo-shot.mjs --empty    … 計測前（破線のイメージ）の画面
 */
import { launch, log, shot, startDevServer } from "./lib.mjs";

const EMPTY = process.argv.includes("--empty");
const PORT = 3123;

const BRANDS = [
  { id: "own", type: "own", displayName: "サンプル工房", aliases: ["Sample Kobo"], domains: ["sample-kobo.jp"], aliasesUpdatedAt: null, createdAt: "" },
  { id: "r1", type: "competitor", displayName: "ライバル社", aliases: [], domains: ["rival.co.jp"], aliasesUpdatedAt: null, createdAt: "" },
  { id: "r2", type: "competitor", displayName: "コンペ商会", aliases: [], domains: ["compe.jp"], aliasesUpdatedAt: null, createdAt: "" },
];

const KEYWORDS = ["seo 対策", "seo ツール", "aio 対策", "生成AI 集客"].map((text, i) => ({
  id: `k${i + 1}`, text, normalizedHash: `h${i}`, trackRank: true, trackAio: true, createdAt: "",
}));

const PROMPTS = ["おすすめの SEO ツールは？", "AIO 対策の進め方は？", "サンプル工房の評判は？"].map((text, i) => ({
  id: `p${i + 1}`, text, normalizedHash: `ph${i}`, isBranded: i === 2, precisionMode: i === 0,
  models: ["chatgpt", "gemini", "claude"], tags: i === 2 ? ["指名"] : ["比較"], precisionModeChangedAt: null, createdAt: "",
}));

const SETUP = {
  account: { userId: "u1", creditBalance: 1842, creditResetAt: "2026-10-01T00:00:00Z", runDayOffset: 2, precisionSlots: 5, createdAt: "" },
  brands: BRANDS, prompts: PROMPTS, keywords: KEYWORDS,
  settings: { siteRegistered: true, keywordCount: KEYWORDS.length },
};

const share = (brandId, n, mentions, citations, ciLow, ciHigh, band) => ({
  brandId, n, mentions, citations,
  shareMention: mentions / n, shareCitation: citations / n, ciLow, ciHigh, band,
});

const target = (targetId, label, n, hits, ciLow, ciHigh, band) => ({
  targetId, label, n, hits, rate: hits / n, ciLow, ciHigh, band, spread: ciHigh - ciLow,
  perModel: [
    { model: "chatgpt", n: Math.round(n / 2), hits: Math.round(hits / 2), rate: hits / n },
    { model: "gemini", n: Math.round(n / 2), hits: hits - Math.round(hits / 2), rate: hits / n },
  ],
});

const WEEKS = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"];
const series = (targetId, label, rates) => ({
  targetId, label,
  points: WEEKS.map((weekStart, i) => ({ weekStart, n: rates[i] === null ? 0 : 6, hits: rates[i] === null ? 0 : Math.round(rates[i] * 6), rate: rates[i] })),
  latest: [...rates].reverse().find((r) => r !== null) ?? null,
  totalN: rates.filter((r) => r !== null).length * 6,
});

const FULL = {
  account: SETUP.account,
  brands: BRANDS,
  promptCount: PROMPTS.length,
  precisionCount: 1,
  overall: [
    share("own", 216, 49, 31, 0.176, 0.289, "sometimes"),
    share("r2", 216, 34, 12, 0.115, 0.212, "rare"),
    share("r1", 216, 21, 9, 0.065, 0.144, "rare"),
  ],
  perModel: {
    chatgpt: [share("own", 72, 20, 13, 0.186, 0.391, "sometimes"), share("r1", 72, 9, 3, 0.067, 0.223, "rare")],
    gemini: [share("own", 72, 16, 10, 0.142, 0.336, "rare"), share("r2", 72, 14, 5, 0.12, 0.306, "rare")],
    claude: [share("own", 72, 13, 8, 0.109, 0.29, "rare"), share("r1", 72, 6, 2, 0.039, 0.173, "rare")],
  },
  perPrompt: [
    target("p1", "おすすめの SEO ツールは？", 40, 26, 0.499, 0.782, "often"),
    target("p3", "サンプル工房の評判は？", 12, 7, 0.318, 0.833, "often"),
    target("p2", "AIO 対策の進め方は？", 12, 2, 0.047, 0.481, "rare"),
  ],
  perKeyword: [
    target("k1", "seo 対策", 8, 3, 0.137, 0.694, "sometimes"),
    target("k3", "aio 対策", 8, 1, 0.022, 0.474, "rare"),
    target("k2", "seo ツール", 8, 0, 0, 0.324, "none"),
  ],
  trends: {
    weeks: WEEKS,
    keyword: [
      series("k1", "seo 対策", [0.17, 0.33, 0.33, null, 0.5, 0.5, 0.67, 0.5]),
      series("k3", "aio 対策", [0, 0.17, 0.17, null, 0.17, 0.33, 0.33, 0.5]),
      series("k2", "seo ツール", [0.17, 0.17, 0, null, 0, 0.17, 0, 0.17]),
    ],
    prompt: [
      series("p1", "おすすめの SEO ツールは？", [0.33, 0.5, 0.5, 0.67, 0.67, 0.5, 0.83, 0.67]),
      series("p3", "サンプル工房の評判は？", [0.5, 0.5, 0.67, 0.5, 0.5, 0.67, 0.5, 0.67]),
      series("p2", "AIO 対策の進め方は？", [0, 0.17, 0, 0.17, 0.17, 0.17, 0.33, 0.17]),
    ],
  },
  domains: [
    { domain: "rival.co.jp", count: 18, share: 0.28, domainClass: "competitor" },
    { domain: "note.com", count: 14, share: 0.22, domainClass: "third_party" },
    { domain: "sample-kobo.jp", count: 12, share: 0.19, domainClass: "own" },
    { domain: "boxil.jp", count: 11, share: 0.17, domainClass: "third_party" },
    { domain: "compe.jp", count: 9, share: 0.14, domainClass: "competitor" },
  ],
  recent: [
    { measurementId: "m1", text: "おすすめの SEO ツールは？", model: "chatgpt", executedAt: "2026-09-21T20:04:00Z", promptId: "p1", keywordId: null, mentioned: true,
      responseText: "SEO ツールは目的によって選び方が変わります。サイト全体の技術的な課題を洗い出したいなら「サンプル工房」のように診断から改善案まで出るものが向いています。順位計測だけで良ければ専用ツールのほうが安価です。まずは無料診断で現状を把握し、どこがボトルネックかを確かめてから選ぶことをおすすめします。" },
    { measurementId: "m2", text: "AIO 対策の進め方は？", model: "gemini", executedAt: "2026-09-21T20:03:00Z", promptId: "p2", keywordId: null, mentioned: false,
      responseText: "AIO（AI Optimization）対策は、まず構造化データの整備から始めるのが一般的です。次に llms.txt の設置、E-E-A-T を示す著者情報の明記と続きます。" },
    { measurementId: "m3", text: "サンプル工房の評判は？", model: "claude", executedAt: "2026-09-21T20:01:00Z", promptId: "p3", keywordId: null, mentioned: true,
      responseText: "サンプル工房は中小企業向けの SEO 支援サービスとして紹介されることが多いようです。診断レポートの読みやすさを評価する声が見られます。" },
  ],
  outcomes: {
    rows: [
      { keywordId: "k1", keyword: "seo 対策", seoRank: 2, rankMeasured: true, appearance: "present", outcome: "none", lastCheckedAt: "2026-09-21T20:00:00Z" },
      { keywordId: "k4", keyword: "生成AI 集客", seoRank: 6, rankMeasured: true, appearance: "present", outcome: "none", lastCheckedAt: "2026-09-21T20:00:00Z" },
      { keywordId: "k3", keyword: "aio 対策", seoRank: 1, rankMeasured: true, appearance: "present", outcome: "cited", lastCheckedAt: "2026-09-21T20:00:00Z" },
      { keywordId: "k2", keyword: "seo ツール", seoRank: null, rankMeasured: true, appearance: "absent", outcome: "unmeasured", lastCheckedAt: "2026-09-21T20:00:00Z" },
    ],
    appearedCount: 3, citedCount: 1, citedRate: 1 / 3,
    opportunities: [
      { keywordId: "k1", keyword: "seo 対策", seoRank: 2, rankMeasured: true, appearance: "present", outcome: "none", lastCheckedAt: "2026-09-21T20:00:00Z" },
      { keywordId: "k4", keyword: "生成AI 集客", seoRank: 6, rankMeasured: true, appearance: "present", outcome: "none", lastCheckedAt: "2026-09-21T20:00:00Z" },
    ],
  },
  schedule: { nextRunAt: "2026-09-22T20:00:00Z", lastRunAt: "2026-09-21T20:04:00Z", enabled: true },
  filter: { model: "all", tag: "all", days: 28 },
  tags: ["比較", "指名"],
  keywordCount: KEYWORDS.length,
  branded: { ownCitationRate: 0.58, citationMix: { own: 7, competitor: 2, third_party: 9 }, competitorCoMentionRate: 0.33, n: 12 },
  versions: [{ model: "chatgpt", versionFrom: "gpt-4o-2026-05", versionTo: "gpt-4o-2026-09", detectedAt: "2026-09-08T20:00:00Z" }],
  credits: { balance: 1842, spent: 158, byAction: { llm_standard: 108, aio: 25, rank: 20, llm_live: 4, ai_mode: 1 }, forecast: { total: 1620, remaining: 380 } },
  needsReview: 2,
};

/** 計測前（破線のイメージが出る状態） */
const EMPTY_DASH = {
  ...FULL,
  promptCount: 0,
  overall: [], perModel: {}, perPrompt: [], perKeyword: [],
  trends: { weeks: WEEKS, keyword: [], prompt: [] },
  domains: [], recent: [],
  outcomes: { rows: [], appearedCount: 0, citedCount: 0, citedRate: null, opportunities: [] },
  schedule: { nextRunAt: "2026-09-22T20:00:00Z", lastRunAt: null, enabled: true },
  branded: null, versions: [],
  credits: { balance: 2000, spent: 0, byAction: {}, forecast: { total: 1620, remaining: 380 } },
  needsReview: 0,
};

const CRAWLERS = {
  origin: "https://sample-kobo.jp",
  checkedAt: "2026-09-22T08:30:00Z",
  exists: true,
  blocked: { training: 2, search: 1, user: 0 },
  bots: [
    { ua: "OAI-SearchBot", vendor: "OpenAI", purpose: "search", note: "ChatGPT 検索に載るために必要", allowed: true, reason: "" },
    { ua: "Googlebot", vendor: "Google", purpose: "search", note: "AI Overviews はこのクローラで取得する", allowed: true, reason: "" },
    { ua: "Claude-SearchBot", vendor: "Anthropic", purpose: "search", note: "Claude の検索結果に載るために必要", allowed: true, reason: "" },
    { ua: "PerplexityBot", vendor: "Perplexity", purpose: "search", note: "Perplexity の検索インデックス", allowed: false, reason: "Disallow: /" },
    { ua: "ChatGPT-User", vendor: "OpenAI", purpose: "user", note: "利用者がリンクを開いたときの取得", allowed: true, reason: "" },
    { ua: "GPTBot", vendor: "OpenAI", purpose: "training", note: "ChatGPT の学習用クロール", allowed: false, reason: "Disallow: /" },
    { ua: "CCBot", vendor: "Common Crawl", purpose: "training", note: "多くの LLM が学習に使う公開データセット", allowed: false, reason: "Disallow: /" },
    { ua: "Google-Extended", vendor: "Google", purpose: "training", note: "Gemini の学習可否。AI Overviews には影響しない", allowed: true, reason: "" },
  ],
};

const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function main() {
  const server = await startDevServer({ port: PORT });
  const session = await launch({ viewport: { width: 1440, height: 1000 } });
  const files = [];
  try {
    await session.page.route("**/api/geo/setup*", (route) => route.fulfill(json(SETUP)));
    await session.page.route("**/api/geo/dashboard*", (route) => route.fulfill(json(EMPTY ? EMPTY_DASH : FULL)));
    await session.page.route("**/api/geo/crawlers*", (route) => route.fulfill(json(CRAWLERS)));

    await session.page.goto(`http://127.0.0.1:${PORT}/tools/geo`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await session.page.waitForSelector("text=自動実行スケジュール", { timeout: 60_000 }).catch(() => {});
    await session.page.waitForTimeout(2500);

    const prefix = EMPTY ? "geo-empty" : "geo";
    files.push(await shot(session.page, `${prefix}-full`, { fullPage: true }));
    files.push(await shot(session.page, `${prefix}-top`, { fullPage: false }));

    // カード単位でも撮る（全体図だと小さくて読めないため）。
    // Card は <section class="... bg-panel ..."> なので、見出しから一番近い section を取る
    for (const [name, heading] of [
      ["visibility", "キーワードごとの推移（週ごと）"],
      ["aio", "キーワードごとの AI 出現と引用"],
      ["crawler", "AI クローラーの受け入れ状態"],
      ["positioning", "競合とのブランドシェア"],
    ]) {
      const card = session.page.locator("section.bg-panel").filter({ hasText: heading }).first();
      const file = `/tmp/seo-checker-e2e/shots/${prefix}-card-${name}.png`;
      await card
        .screenshot({ path: file, timeout: 20_000 })
        .then(() => {
          log(`screenshot: ${file}`);
          files.push(file);
        })
        .catch((e) => log(`${name} は撮れませんでした: ${e.message.split("\n")[0]}`));
    }

    const text = await session.page.evaluate(() => document.body.innerText);
    log(`本文の長さ: ${text.length} 文字 / 「ビジビリティ分析」${text.includes("ビジビリティ分析") ? "あり" : "なし"}`);
  } finally {
    await session.close();
    await server.kill();
  }
  console.log(JSON.stringify({ ok: true, screenshots: files }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
