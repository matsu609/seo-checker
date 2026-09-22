#!/usr/bin/env node
/**
 * 順位計測（/tools/rank）の画面を撮る。
 *
 * 見たいのは **計測がまだ無いときに破線のイメージが出るか**（利用者の指示 2026-09-22）。
 * 鍵が無くても画面は描けるので、差し込むのは連携の状態だけ。
 * キーワードの登録はブラウザの localStorage に入れて「自分の語で描かれる」ところまで確かめる。
 *
 *   node scripts/e2e/rank-shot.mjs            … 登録あり・計測なし（破線のイメージ）
 *   node scripts/e2e/rank-shot.mjs --empty    … 登録も計測も無い（例の言葉で描く）
 */
import { launch, log, shot, startDevServer } from "./lib.mjs";

const EMPTY = process.argv.includes("--empty");
const PORT = 3126;
const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

const KEYWORDS = [
  { id: "k1", projectId: "p1", keyword: "港区 整体", device: "desktop", createdAt: "2026-09-01T00:00:00.000Z" },
  { id: "k2", projectId: "p1", keyword: "肩こり 整体 港区", device: "desktop", createdAt: "2026-09-01T00:00:00.000Z" },
  { id: "k3", projectId: "p1", keyword: "整体 料金 相場", device: "desktop", createdAt: "2026-09-01T00:00:00.000Z" },
];

async function main() {
  const server = await startDevServer({ port: PORT });
  const session = await launch({ viewport: { width: 1440, height: 1000 } });
  const files = [];
  try {
    await session.page.route("**/api/integrations", (route) =>
      route.fulfill(json({ status: { serpapi: true, anthropic: true }, keyExpiry: {} })),
    );
    await session.page.route("**/api/rank/auto", (route) => route.fulfill(json({ enabled: false, limit: 20, nextRunAt: null, lastRunDate: null })));

    // 先に localStorage を仕込んでから開く（登録済みキーワードがある状態を作る）
    if (!EMPTY) {
      await session.page.addInitScript((keywords) => {
        localStorage.setItem("seo-checker:v1:rankKeywords", JSON.stringify(keywords));
      }, KEYWORDS);
    }

    await session.page.goto(`http://127.0.0.1:${PORT}/tools/rank`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await session.page.waitForSelector("text=順位の推移", { timeout: 60_000 });
    await session.page.waitForTimeout(1500);

    const prefix = EMPTY ? "rank-empty" : "rank";
    files.push(await shot(session.page, `${prefix}-full`, { fullPage: true }));
    files.push(await shot(session.page, `${prefix}-top`, { fullPage: false }));

    const card = session.page.locator("section.bg-panel").filter({ hasText: "順位の推移" }).first();
    const file = `/tmp/seo-checker-e2e/shots/${prefix}-card.png`;
    await card
      .screenshot({ path: file, timeout: 20_000 })
      .then(() => {
        log(`screenshot: ${file}`);
        files.push(file);
      })
      .catch((e) => log(`カードは撮れませんでした: ${e.message.split("\n")[0]}`));

    const text = await session.page.evaluate(() => document.body.innerText);
    const dashed = await session.page.locator('path[stroke-dasharray], polyline[stroke-dasharray]').count();
    log(`破線の本数: ${dashed} / イメージの注記: ${text.includes("実測ではなく") ? "○" : "×"} / 自分の語: ${text.includes("港区 整体") ? "○" : "×"}`);
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
