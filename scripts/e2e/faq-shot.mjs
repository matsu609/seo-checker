#!/usr/bin/env node
/**
 * FAQ 提案（/tools/faq）の画面を撮る。
 *
 * **AI の鍵を置かずに見た目を確かめるため、`/api/faq/propose` の応答だけ差し込む。**
 * 画面（React の部品・CSS・レイアウト）は本物をそのまま描かせる。
 * 認証は `isAuthEnabled()` が Clerk 未設定なら素通りする作りなので、鍵を入れずに dev サーバーを起動すればよい。
 *
 *   node scripts/e2e/faq-shot.mjs           … 確認 → 提案 → 貼る内容まで出た画面
 *   node scripts/e2e/faq-shot.mjs --audit   … 「いまの FAQ を確かめる」だけを押した画面
 */
import { launch, log, shot, startDevServer } from "./lib.mjs";

const AUDIT_ONLY = process.argv.includes("--audit");
const PORT = 3124;

const AUDIT = {
  jsonLd: { present: false, questions: [], brokenBlocks: 0 },
  visible: { headings: [], detailsCount: 0, questionHeadings: ["施術は何分かかりますか？"] },
  hiddenQuestions: [],
  existingQuestions: ["施術は何分かかりますか？"],
  findings: [
    {
      id: "jsonld",
      label: "FAQ の構造化データ（FAQPage）",
      status: "fail",
      detail: "FAQPage が入っていません。検索エンジンと AI は、どこからどこまでが質問と答えの対なのかを本文から推測することになります",
    },
    {
      id: "visible",
      label: "画面に見えている FAQ",
      status: "ok",
      detail: "質問の形をした見出し 1 件、折りたたみ（details）0 件が見つかりました",
    },
    {
      id: "heading",
      label: "「よくある質問」の見出し",
      status: "warn",
      detail: "「よくある質問」などの見出しが見当たりません。質問が本文に散らばっていると、AI はまとめて読み取れません",
    },
    { id: "match", label: "構造化データと画面の一致", status: "warn", detail: "構造化データが無いため、比べる対象がありません" },
    { id: "broken", label: "構造化データの書式", status: "ok", detail: "構造化データはすべて JSON として読めました" },
  ],
};

const PROPOSALS = {
  summary: [
    "FAQ の構造化データが無く、質問も 1 件しか見えていません。AI が引用できる形になっていない状態です。",
    "ページ本文に根拠がある質問を先に、根拠が無い（お客様に確認が要る）ものを後ろに並べました。",
  ],
  proposals: [
    {
      question: "予約は必要ですか？",
      answer: "ご予約は不要です。営業時間内であれば直接ご来店いただけます。混み合う土日は、お電話いただくとお待たせせずにご案内できます。",
      basis: "page",
      why: "来店前にいちばん多く聞かれる質問で、AI もこの形の文をそのまま引用します。",
      priority: "high",
      askCustomer: "",
    },
    {
      question: "施術は 1 回どれくらい時間がかかりますか？",
      answer: "1 回の施術は約 40 分です。初回はカウンセリングを含めて 60 分ほどお時間をいただいています。",
      basis: "page",
      why: "所要時間は予定を立てるために必ず調べられる項目です。",
      priority: "high",
      askCustomer: "",
    },
    {
      question: "子ども連れでも通えますか？",
      answer: "お子さま連れでもご利用いただけます。ベビーカーのまま入れる入口があり、施術中はスタッフがお預かりします。",
      basis: "karte",
      why: "カルテに書かれた強みで、ページには載っていない情報です。",
      priority: "medium",
      askCustomer: "",
    },
    {
      question: "駐車場はありますか？",
      answer: "",
      basis: "needs-check",
      why: "車で来店する方が多い業種で、無いと分かるだけでも離脱を減らせます。",
      priority: "medium",
      askCustomer: "駐車場の有無と台数、提携駐車場があればその場所を教えてください。",
    },
  ],
};

const RESULT = {
  url: "https://example.co.jp/",
  finalUrl: "https://example.co.jp/",
  fetchedAt: new Date().toISOString(),
  title: "サンプル整体院｜港区の整体",
  audit: AUDIT,
  proposals: AUDIT_ONLY ? null : PROPOSALS,
  usage: AUDIT_ONLY ? null : { inputTokens: 4200, outputTokens: 1100 },
};

const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function main() {
  const server = await startDevServer({ port: PORT });
  const session = await launch({ viewport: { width: 1440, height: 1000 } });
  const files = [];
  try {
    await session.page.route("**/api/faq/propose*", (route) => route.fulfill(json({ result: RESULT, cached: false })));

    await session.page.goto(`http://127.0.0.1:${PORT}/tools/faq`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await session.page.waitForSelector("text=対象ページ", { timeout: 60_000 });
    const prefix = AUDIT_ONLY ? "faq-audit" : "faq";
    files.push(await shot(session.page, `${prefix}-before`, { fullPage: true }));

    // ホームページが未登録でも、ページ欄に URL を直接入れれば動く
    await session.page.fill("#faq-page", "https://example.co.jp/");
    await session.page.click(AUDIT_ONLY ? "text=いまの FAQ を確かめる" : "text=FAQ 案を作る");
    await session.page.waitForSelector("text=いまの FAQ の状態", { timeout: 30_000 });
    await session.page.waitForTimeout(1200);

    files.push(await shot(session.page, `${prefix}-full`, { fullPage: true }));
    files.push(await shot(session.page, `${prefix}-top`, { fullPage: false }));

    // カード単位でも撮る（全体図だと小さくて読めない）
    for (const [name, heading] of [
      ["audit", "いまの FAQ の状態"],
      ["proposals", "入れるべき FAQ"],
      ["snippet", "ページに貼る内容"],
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
    log(`本文の長さ: ${text.length} 文字 / 「書き換えません」${text.includes("書き換えません") ? "あり" : "なし"}`);
    log(`「要確認」${text.includes("要確認") ? "あり" : "なし"} / 「FAQPage」${text.includes("FAQPage") ? "あり" : "なし"}`);
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
