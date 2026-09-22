#!/usr/bin/env node
/**
 * ページ改善（/tools/page-improve）の画面を撮る。
 *
 * **SerpApi と Claude の鍵を置かずに見た目を確かめるため、`/api/page-diagnosis` と
 * `/api/improvement` の応答だけ差し込む。**画面（React の部品・CSS・レイアウト）は本物を描かせる。
 *
 *   node scripts/e2e/page-improve-shot.mjs          … 事実 → 改善案まで出た画面
 *   node scripts/e2e/page-improve-shot.mjs --denied … 改善案がプラン不足（402）のときの画面
 */
import { launch, log, shot, startDevServer } from "./lib.mjs";

const DENIED = process.argv.includes("--denied");
const PORT = 3125;

const measurement = (url, chars, images, headings, internal, external) => ({
  url,
  finalUrl: url,
  title: `${url} のタイトル`,
  description: "説明文です",
  charCount: chars,
  images,
  headings: headings.map((text, i) => ({ level: i === 0 ? 1 : 2, text })),
  h1: [headings[0] ?? ""],
  internalLinks: internal,
  externalLinks: external,
  fetchMs: 420,
  jsonLdTypes: ["Article"],
  publishedAt: null,
  modifiedAt: null,
  mainText: "本文です。".repeat(20),
});

const stat = (median, self) => ({
  count: 9,
  average: median,
  median,
  min: median - 100,
  max: median + 100,
  self,
  gap: self === null ? null : self - median,
  ratio: self === null || median === 0 ? null : Number((self / median).toFixed(2)),
});

const DIAGNOSIS = {
  id: "diag-1",
  keyword: "港区 整体",
  device: "desktop",
  projectDomain: "example.co.jp",
  targetUrl: "https://example.co.jp/service/",
  targetOrigin: "serp",
  serpSource: "serpapi",
  top10: Array.from({ length: 10 }, (_, i) => ({
    position: i + 1,
    title: `上位ページ ${i + 1}`,
    url: `https://rival${i + 1}.example.com/`,
    snippet: "検索結果のスニペットです。",
  })),
  features: ["強調スニペット", "関連する質問"],
  relatedQuestions: [{ question: "整体は何回通えばよいですか？" }].map((q) => ({ question: q.question })),
  aiOverviewPresent: true,
  self: measurement("https://example.co.jp/service/", 820, 2, ["整体のご案内", "施術の流れ"], 4, 1),
  competitors: Array.from({ length: 10 }, (_, i) => ({
    position: i + 1,
    title: `上位ページ ${i + 1}`,
    url: `https://rival${i + 1}.example.com/`,
    snippet: "検索結果のスニペットです。",
    measurement: measurement(`https://rival${i + 1}.example.com/`, 3200 + i * 50, 8, ["見出し", "料金", "よくある質問"], 24, 3),
  })),
  failures: [],
  stats: {
    charCount: stat(3200, 820),
    images: stat(8, 2),
    headings: stat(12, 4),
    internalLinks: stat(24, 4),
    externalLinks: stat(3, 1),
    fetchMs: stat(500, 420),
  },
  analysis: {
    summary: "上位ページは料金と所要時間を必ず書いています。",
    title_suggestions: ["港区の整体｜初回 60 分 5,500 円", "港区 整体｜当日予約・土日も営業", "肩こり専門の整体｜港区"],
    description_suggestions: ["港区の整体院です。初回 60 分 5,500 円。", "土日も営業。当日予約に対応しています。"],
    search_intent: "近くで通える整体を探しており、料金・所要時間・予約方法を先に知りたい層です。",
    serp_trend: "上位 10 件のうち 8 件が料金表を持ち、6 件が「よくある質問」を置いています。本文は 3,000 字前後が中心です。",
    technical_issues: [
      { issue: "h2 が 2 つしかない", fix: "施術の流れ・料金・アクセスで見出しを分ける" },
      { issue: "構造化データが Article のみ", fix: "LocalBusiness を足す" },
    ],
    content_proposals: [
      { location: "「施術の流れ」の直後", outline: "料金表（初回・2 回目以降・回数券）", reason: "上位 10 件中 8 件が料金表を持っている" },
      { location: "ページ下部", outline: "よくある質問（予約・所要時間・服装）", reason: "上位 6 件が FAQ を置いている" },
    ],
  },
  model: "claude-opus-5",
  notes: ["対象 URL が未指定のため、検索結果で自社ドメインの最上位だった 7 位のページを対象にしました。"],
  createdAt: new Date().toISOString(),
};

const IMPROVEMENT = {
  url: DIAGNOSIS.targetUrl,
  finalUrl: DIAGNOSIS.targetUrl,
  fetchedAt: new Date().toISOString(),
  report: {
    url: DIAGNOSIS.targetUrl,
    finalUrl: DIAGNOSIS.targetUrl,
    status: 200,
    fetchedAt: new Date().toISOString(),
    score: 58,
    scoreLabel: "改善の余地あり",
    sections: [],
    measurements: {},
    robots: {},
    llmsTxt: { present: false, length: 0, url: "https://example.co.jp/llms.txt" },
    summary: [],
    priorities: [],
    psi: null,
    psiError: null,
    notes: [],
  },
  plan: {
    summary: [
      "上位 10 件と比べて、料金と所要時間がページに書かれていないのが最大の差です。",
      "文字数は上位の 4 分の 1 ですが、増やすこと自体より料金表と FAQ を足すのが先です。",
      "タイトルに地域と価格帯を入れると、検索結果での比較に乗れます。",
    ],
    proposals: [
      {
        area: "body",
        headline: "料金表を「施術の流れ」の直後に置く",
        why: "上位 10 件のうち 8 件が料金表を持っており、比較検討の段階で離脱している可能性が高いためです。",
        before: "施術は丁寧に行います。詳しくはお問い合わせください。",
        after: "【料金】初回 60 分 〇〇円（カウンセリング込み）／ 2 回目以降 40 分 〇〇円 ／ 回数券 5 回 〇〇円",
        impact: "料金を調べている方がページ内で判断できるようになります。",
        priority: "high",
        effort: "small",
      },
      {
        area: "title",
        headline: "タイトルに地域と初回価格を入れる",
        why: "上位ページのタイトルは地域と価格を含む型が中心で、クリックの比較に乗れていないためです。",
        before: "整体のご案内",
        after: "港区の整体｜初回 60 分 〇〇円・土日も営業",
        impact: "検索結果での比較に乗り、クリック率が上がる余地があります。",
        priority: "high",
        effort: "small",
      },
      {
        area: "heading",
        headline: "見出しを「流れ・料金・アクセス・よくある質問」に分ける",
        why: "見出しが 2 つしかなく、AI がページの構成を読み取りにくいためです。",
        before: "整体のご案内 / 施術の流れ",
        after: "整体のご案内 / 施術の流れ / 料金 / アクセス / よくある質問",
        impact: "検索エンジンと AI がページの範囲を把握しやすくなります。",
        priority: "medium",
        effort: "small",
      },
    ],
  },
  usage: { inputTokens: 12000, outputTokens: 2200 },
};

const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

async function main() {
  const server = await startDevServer({ port: PORT });
  const session = await launch({ viewport: { width: 1440, height: 1000 } });
  const files = [];
  try {
    // 鍵が無い環境ではボタンが押せないので、連携の状態も差し込む（見た目の確認が目的）
    await session.page.route("**/api/integrations", (route) =>
      route.fulfill(json({ status: { serpapi: true, anthropic: true }, keyExpiry: {} })),
    );
    await session.page.route("**/api/page-diagnosis", (route) => route.fulfill(json({ result: DIAGNOSIS })));
    await session.page.route("**/api/improvement", (route) =>
      route.fulfill(
        DENIED
          ? json({ error: "この機能は「スタンダード」（月額 50,000 円）からご利用いただけます。" }, 402)
          : json({ result: IMPROVEMENT }),
      ),
    );

    await session.page.goto(`http://127.0.0.1:${PORT}/tools/page-improve`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await session.page.waitForSelector("text=対策キーワードを入れて実行する", { timeout: 60_000 });
    const prefix = DENIED ? "improve-denied" : "improve";
    files.push(await shot(session.page, `${prefix}-before`, { fullPage: true }));

    await session.page.fill("input[placeholder='対策キーワード']", "港区 整体");
    await session.page.click("text=競合と比べて改善案を作る");
    await session.page.waitForSelector("text=上位 10 件と比べた結果（事実）", { timeout: 60_000 });
    await session.page.waitForTimeout(1500);

    files.push(await shot(session.page, `${prefix}-full`, { fullPage: true }));
    files.push(await shot(session.page, `${prefix}-top`, { fullPage: false }));

    for (const [name, heading] of [
      ["facts", "上位 10 件と比べた結果（事実）"],
      ["proposals", "改善案"],
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
    log(`本文 ${text.length} 文字 / 事実:${text.includes("上位 10 件の中央値") ? "○" : "×"} 改善案:${text.includes("料金表を") ? "○" : "×"} 詳細:${text.includes("詳しく見る") ? "○" : "×"}`);
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
