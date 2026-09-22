#!/usr/bin/env node
/**
 * NAP チェック（/tools/nap）と 掲載（/tools/citations）の画面を撮る。
 *
 * 利用者の指摘（2026-09-22）「基本情報が設定に登録されているのに、また入力するのは二度手間。
 * 表示されるべき内容は外部サイトの掲載状況」を直したあとの確認用。
 *
 * 差し込むのは `/api/account/lead`（設定の会社・店舗の基本情報）と
 * `/api/listings/stores` だけ。**画面は本物をそのまま描かせる**ので、
 * 「設定から取り込み済みと出ているか」「フォームが主役になっていないか」が見られる。
 * ブラウザ側ストア（ホームページ）は localStorage に直接入れる。
 */
import { launch, log, shot, startDevServer } from "./lib.mjs";

const PORT = 3124;

const LEAD = {
  lead: {
    contactName: "鈴木 一郎",
    company: "サンプル歯科クリニック",
    phone: "03-1234-5678",
    storeType: "クリニック・医院",
    address: "〒100-0005 東京都千代田区丸の内1-1-1 サンプルビル3F",
    region: "東京都千代田区",
  },
};

/**
 * 掲載の記録。**本番は ListingProfileSchema で既定値に落ちる**（fromListingRow）ので
 * 欠けた項目は空文字になる。モックでも同じ形にしておかないと画面が落ちる
 * （2026-09-22 に実際に落として気づいた）。
 */
const profile = (name) => ({
  name,
  nameKana: "サンプルシカクリニック",
  category: "歯科医院",
  postalCode: "100-0005",
  address: "東京都千代田区丸の内1-1-1 サンプルビル3F",
  phone: "03-1234-5678",
  website: "https://sample-dental.jp/",
  email: "",
  hours: "月曜日: 10:00〜19:00\n日曜日: 定休日",
  shortDescription: "丸の内の歯科クリニックです。",
  longDescription: "",
});

const STORES = {
  anthropic: false,
  stores: [
    { placeId: "p1", name: "サンプル歯科クリニック 丸の内", google: null, record: { placeId: "p1", profile: profile("サンプル歯科クリニック 丸の内"), states: {}, updatedAt: "2026-09-20T00:00:00Z" } },
    { placeId: "p2", name: "サンプル歯科クリニック 日本橋", google: null, record: { placeId: "p2", profile: profile("サンプル歯科クリニック 日本橋"), states: {}, updatedAt: "2026-09-20T00:00:00Z" } },
  ],
};

/** ホームページ（projects ストア）をブラウザ側に入れておく */
const PROJECTS = [
  {
    id: "proj-1",
    name: "サンプル歯科クリニック",
    domain: "sample-dental.jp",
    startUrl: "https://sample-dental.jp/",
    brandAliases: ["サンプル歯科"],
    competitors: [],
    createdAt: "2026-09-01T00:00:00Z",
  },
];

const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function main() {
  const server = await startDevServer({ port: PORT });
  const session = await launch({ viewport: { width: 1440, height: 1000 } });
  const files = [];
  try {
    await session.page.route("**/api/account/lead*", (route) => route.fulfill(json(LEAD)));
    await session.page.route("**/api/listings/stores*", (route) => route.fulfill(json(STORES)));
    // ストアの同期 API は空で返す（localStorage の値を消させない）
    await session.page.route("**/api/store*", (route) => route.fulfill(json({ stores: {} })));

    // localStorage は origin ごとなので、一度開いてから入れる
    await session.page.goto(`http://127.0.0.1:${PORT}/tools/nap`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // キーは createStore の KEY_PREFIX 付き（seo-checker:v1:）
    await session.page.evaluate((projects) => {
      const P = "seo-checker:v1:";
      localStorage.setItem(`${P}projects`, JSON.stringify(projects));
      localStorage.setItem(`${P}currentProjectId`, JSON.stringify("proj-1"));
    }, PROJECTS);

    for (const [name, path] of [
      ["nap", "/tools/nap"],
      ["citations", "/tools/citations"],
    ]) {
      await session.page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await session.page.waitForSelector("text=調べる基本情報", { timeout: 60_000 }).catch(() => {});
      await session.page.waitForTimeout(1500);
      files.push(await shot(session.page, `${name}-top`, { fullPage: false }));

      const card = session.page.locator("section.bg-panel").filter({ hasText: "調べる基本情報" }).first();
      const file = `/tmp/seo-checker-e2e/shots/${name}-basic.png`;
      await card
        .screenshot({ path: file, timeout: 20_000 })
        .then(() => {
          log(`screenshot: ${file}`);
          files.push(file);
        })
        .catch((e) => log(`${name}-basic は撮れませんでした: ${e.message.split("\n")[0]}`));

      const text = await session.page.evaluate(() => document.body.innerText);
      log(`${name}: 「設定から取り込み済み」${text.includes("設定から取り込み済み") ? "あり" : "なし"} / 店名「${LEAD.lead.company}」${text.includes("サンプル歯科クリニック") ? "あり" : "なし"}`);
    }
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
