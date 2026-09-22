#!/usr/bin/env node
/**
 * MEO の 4 タブを撮って、「計測前のイメージ（破線・薄い色）」が出るかを確かめる。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにしてください。デモデータを入れて、
 * 最初からグラフがこう表示される・データがこう集計されると直感的に分かるように。
 * MEO は抜け漏れがないようにタブごとに」。
 *
 * 見たいのは **どのタブでも、まだ数字が無い状態で図が出ているか**。
 * 外部の鍵は要らない（API はすべてこの場で差し替える）。
 *
 *   node scripts/e2e/meo-shot.mjs
 */
import { launch, log, shot, startDevServer } from "./lib.mjs";

const PORT = 3127;
const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

const PLACE_ID = "ChIJsampleplaceid0001";
const STORE = {
  id: "s1",
  placeId: PLACE_ID,
  name: "テスト整体院 港区店",
  role: "own",
  ownPlaceId: "",
  createdAt: "2026-09-01T00:00:00.000Z",
  lastRefreshedAt: null,
};

const FORM = {
  id: "f1",
  slug: "sample-form",
  title: "ご来店アンケート",
  storeName: "テスト整体院 港区店",
  placeId: PLACE_ID,
  writeReviewUrl: null,
  questions: [],
  settings: { industry: "other", tone: "polite", keywords: [], lowRatingMax: 2 },
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const EMPTY_METRICS = {
  total: 0,
  averageRating: null,
  distribution: [0, 0, 0, 0, 0],
  low: 0,
  lowOpen: 0,
  reviewClicks: 0,
  reviewClickRate: null,
  directMessages: 0,
  byChannel: [],
  byWeek: [],
};

/** どのタブでも見たい 3 点（破線 or 薄い帯 + 「実測ではない」の断り） */
async function check(page, label) {
  const text = await page.evaluate(() => document.body.innerText);
  const dashed = await page.locator("path[stroke-dasharray], polyline[stroke-dasharray], line[stroke-dasharray]").count();
  const svg = await page.locator("svg").count();
  const notice = text.includes("実測ではな");
  const badge = text.includes("イメージ");
  log(`${label}: 図 ${svg} 枚 / 破線 ${dashed} 本 / 断り ${notice ? "○" : "×"} / バッジ ${badge ? "○" : "×"}`);
  return { label, svg, dashed, notice, badge };
}

async function main() {
  const server = await startDevServer({ port: PORT });
  const session = await launch({ viewport: { width: 1440, height: 1000 } });
  const files = [];
  const results = [];
  const page = session.page;
  try {
    // ── 共通（連携の状態） ─────────────────────────────
    await page.route("**/api/integrations", (route) => route.fulfill(json({ status: {}, keyExpiry: {} })));
    await page.route("**/api/maps/commentary", (route) => route.fulfill(json({ enabled: false })));

    // ── ① Google マップ（MEO） ───────────────────────
    await page.route("**/api/maps/stores**", (route) => route.fulfill(json({ stores: [STORE], nextRefreshAt: "2026-09-28T20:00:00.000Z" })));
    await page.route("**/api/maps/history?**", (route) => route.fulfill(json({ enabled: true, items: [] })));
    await page.route("**/api/maps/compare**", (route) => route.fulfill(json({ results: [], missing: [] })));
    await page.route("**/api/maps/insights**", (route) => route.fulfill(json({ insights: null, reports: 0, nap: null, napNote: null })));
    await page.route("**/api/maps/rank-history**", (route) =>
      route.fulfill(json({ enabled: true, history: { limit: 20, series: [{ keyword: "港区 整体", points: [] }], dates: [] } })),
    );
    await page.route("**/api/maps/performance**", (route) =>
      // Clerk が無い開発環境の実際の応答に合わせる（not_connected にすると接続ボタンが出て、
      // Clerk が無いので useUser で落ちる = 本番では起きない状態）
      route.fulfill(json({ enabled: false, reason: "auth_disabled", error: null, email: null, month: "2026-09", months: [], summary: null, cached: false })),
    );

    await page.goto(`http://127.0.0.1:${PORT}/tools/maps`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForSelector("text=スコアの推移", { timeout: 90_000 });
    await page.waitForTimeout(1500);
    files.push(await shot(page, "meo-1-maps", { fullPage: true }));
    results.push(await check(page, "① Google マップ"));

    // ── ② 口コミ（集める / アンケート QR） ───────────────
    await page.route("**/api/reviews/forms", (route) => route.fulfill(json({ forms: [FORM], stores: [] })));
    await page.route("**/api/reviews/forms/*", (route) => route.fulfill(json({ form: FORM, channels: [] })));
    await page.route("**/api/reviews/responses**", (route) => route.fulfill(json({ responses: [], channels: [], metrics: EMPTY_METRICS, limit: 500 })));
    await page.route("**/api/replies/status", (route) =>
      route.fulfill(json({ authEnabled: false, connected: false, email: null, hasScope: false, locations: [], locationsError: null, stores: [], aiEnabled: false })),
    );

    await page.goto(`http://127.0.0.1:${PORT}/tools/reviews`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForSelector("text=集計", { timeout: 90_000 });
    await page.waitForTimeout(1500);
    files.push(await shot(page, "meo-2-reviews-collect", { fullPage: true }));
    results.push(await check(page, "② 口コミ（集める）"));

    // ── ③ 口コミ（返す / 返信案） ─────────────────────
    await page.getByRole("tab", { name: /返す/ }).click();
    await page.waitForSelector("text=口コミの状況", { timeout: 60_000 });
    await page.waitForTimeout(1000);
    files.push(await shot(page, "meo-3-reviews-reply", { fullPage: true }));
    results.push(await check(page, "③ 口コミ（返す）"));

    // ── ④ 投稿 ───────────────────────────────────
    await page.route("**/api/posts**", (route) =>
      route.fulfill(
        json({
          enabled: true,
          stores: [{ placeId: PLACE_ID, name: STORE.name }],
          google: { authEnabled: false, connected: false, hasScope: false, email: null },
          aiEnabled: false,
          posts: [],
          nextRunAt: "2026-09-23T20:00:00.000Z",
        }),
      ),
    );
    await page.goto(`http://127.0.0.1:${PORT}/tools/posts`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForSelector("text=投稿の頻度", { timeout: 90_000 });
    await page.waitForTimeout(1500);
    files.push(await shot(page, "meo-4-posts", { fullPage: true }));
    results.push(await check(page, "④ 投稿"));
  } finally {
    await session.close();
    await server.kill();
  }

  const ok = results.every((r) => r.svg > 0 && r.notice && r.badge);
  console.log(JSON.stringify({ ok, results, screenshots: files }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
