#!/usr/bin/env node
/**
 * 無料診断（`/`）の end-to-end スモークテスト。
 *
 * 流れ:
 *   1. ダミーサイト（dummy-site.mjs）と dev サーバー（npx next dev）を起動する
 *   2. `/` を開き、ダミーサイトを「このページ」で診断 → レポートを 1280x900 と 390x844 で撮る
 *   3. 続けて「サイト全体」で診断 → 実行中の進捗パネルと、完成したレポートを両方の幅で撮る
 *   4. レポートに出ている診断ページ数が dummy-site の期待値（--print-expected と同じ）と
 *      一致するか確かめる。画面から読めないときは /api/site の結果で代用する
 *   5. 「PDFでダウンロード」を押して download イベントが発火するか確かめる
 *   6. console.error・ページ例外を集め、結果を 1 行 JSON で標準出力に出して終了する
 *
 * 使い方:
 *   node scripts/e2e/free-smoke.mjs [--dev-port 3101] [--prefix free]
 *                                   [--dummy-port 3199] [--dummy-delay 150]
 *                                   [--dev-url http://127.0.0.1:3000]
 *
 *   --dev-url を渡すと dev サーバーを起動せず、そのURLに対して実行する（再実行が速い）。
 *   --dummy-delay はダミーサイトの応答遅延（ミリ秒）。進捗パネルを撮れるように既定で
 *   少し長め（150ms）にしてある。ダミーサイト単体の既定は 5〜15ms のまま。
 *
 * 標準出力の最終行だけが JSON:
 *   {"ok":true,"screenshots":[…],"diagnosedPages":17,"expectedPages":17,
 *    "consoleErrors":[],"failures":[]}
 * 途中経過はすべて標準エラーに出る。失敗があれば exit 1。
 *
 * 画面のマークアップは並行して書き換えられているため、要素は
 * 「role + 文言 → id → CSS」の順に候補を試す（lib.mjs の firstVisible）。
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import {
  clickFirst,
  collectConsoleErrors,
  firstVisible,
  launch,
  log,
  pageText,
  shot,
  SHOTS_DIR,
  sleep,
  startDevServer,
  startDummySite,
  trackApiCalls,
  waitForApiCall,
} from "./lib.mjs";

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

const TIMEOUTS = {
  devServer: 240_000,
  navigation: 120_000,
  element: 20_000,
  pageDiagnosis: 90_000,
  siteDiagnosis: 180_000,
  api: 180_000,
  pdf: 180_000,
};

/** 診断が終わったことを示す目印（どれか 1 つでも出ればレポートが描かれている） */
const DONE_CANDIDATES = [
  (page) => page.getByRole("button", { name: /PDF/i }),
  (page) => page.getByRole("heading", { name: /総合評価/ }),
  (page) => page.getByText("優先改善"),
  (page) => page.getByText("判定の内訳"),
  (page) => page.getByText("カテゴリ別"),
  (page) => page.getByText("総合スコア"),
];

/**
 * 画面に出たら失敗と判断する文言（API のエラー応答そのもの）。
 * レポート内の「診断できなかったページ」に出る文言と紛れないよう、
 * 完成したレポートが見つかっていないときだけ調べる。
 */
const ERROR_TEXTS = [
  "診断に失敗しました",
  "リクエスト形式が不正です",
  "URLの形式が正しくありません",
  "http / https のURLのみ診断できます",
  "ローカルホストは診断できません",
  "内部ネットワークのアドレスは診断できません",
  "ホスト名を解決できませんでした",
  "サーバーからの応答を読み取れませんでした",
  "診断中に予期しないエラーが発生しました",
];

/** 診断中であることを示す目印（進捗パネルの撮影タイミングに使う） */
const PROGRESS_CANDIDATES = [
  (page) => page.locator('[role="progressbar"]'),
  (page) => page.locator('button:has-text("診断中")'),
  (page) => page.getByText("解析しています"),
  (page) => page.getByText("取得しています"),
  (page) => page.getByText("診断中"),
  (page) => page.locator("[aria-live]"),
];

function parseArgs(argv) {
  const args = {
    devPort: 3101,
    prefix: "free",
    dummyPort: 3199,
    dummyDelay: 150,
    devUrl: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const eq = raw.indexOf("=");
    const key = eq >= 0 ? raw.slice(0, eq) : raw;
    const inline = eq >= 0 ? raw.slice(eq + 1) : null;
    const value = () => (inline !== null ? inline : argv[++i]);
    switch (key) {
      case "--dev-port":
        args.devPort = Number(value());
        break;
      case "--prefix":
        args.prefix = String(value());
        break;
      case "--dummy-port":
        args.dummyPort = Number(value());
        break;
      case "--dummy-delay":
        args.dummyDelay = Number(value());
        break;
      case "--dev-url":
        args.devUrl = String(value());
        break;
      case "--help":
      case "-h":
        process.stderr.write(
          "使い方: node scripts/e2e/free-smoke.mjs [--dev-port 3101] [--prefix free] " +
            "[--dummy-port 3199] [--dummy-delay 150] [--dev-url http://127.0.0.1:3000]\n",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`不明な引数です: ${raw}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// 画面操作（マークアップが変わっても動くよう、候補を順に試す）
// ---------------------------------------------------------------------------

async function fillUrl(page, value) {
  const input = await firstVisible(
    page,
    [
      (p) => p.locator("#url"),
      (p) => p.getByRole("textbox", { name: /URL/i }),
      (p) => p.locator('input[type="url"]'),
      (p) => p.locator('input[inputmode="url"]'),
      (p) => p.locator('input[placeholder*="example.com"]'),
      (p) => p.locator('form input[type="text"]'),
      (p) => p.getByRole("textbox"),
    ],
    TIMEOUTS.element,
  );
  if (!input) throw new Error("URL の入力欄が見つかりません");
  await input.click();
  await input.fill("");
  await input.fill(value);
  log(`URL を入力: ${value}`);
}

async function selectMode(page, mode) {
  const patterns =
    mode === "site" ? [/サイト全体/, /サイト単位/, /全ページ/] : [/このページ/, /ページ単位/, /1\s*ページ/];
  const candidates = [];
  for (const pattern of patterns) {
    for (const role of ["radio", "tab", "button", "checkbox", "link"]) {
      candidates.push((p) => p.getByRole(role, { name: pattern }));
    }
    candidates.push((p) => p.locator("label").filter({ hasText: pattern }));
  }
  const clicked = await clickFirst(page, candidates, {
    timeoutMs: TIMEOUTS.element,
    label: `診断範囲「${mode}」`,
  });
  if (!clicked) throw new Error(`診断範囲の切り替え（${mode}）が見つかりません`);
  await sleep(200);
}

async function submit(page) {
  const clicked = await clickFirst(
    page,
    [
      (p) => p.getByRole("button", { name: "診断する" }),
      (p) => p.locator('form button[type="submit"]'),
      (p) => p.locator('button[type="submit"]'),
      (p) => p.getByRole("button", { name: /診断/ }),
    ],
    { timeoutMs: TIMEOUTS.element, label: "診断するボタン" },
  );
  if (!clicked) throw new Error("「診断する」ボタンが見つかりません");
}

/** 診断が終わってレポートが描かれるまで待つ */
async function waitForReport(page, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const done = await firstVisible(page, DONE_CANDIDATES, 0);
    if (done) {
      log(`${label}: レポートを検出しました`);
      return true;
    }
    const text = await pageText(page);
    const error = ERROR_TEXTS.find((message) => text.includes(message));
    if (error) throw new Error(`${label}: 画面にエラーが出ました「${error}」`);
    if (Date.now() > deadline) {
      throw new Error(`${label}: ${Math.round(timeoutMs / 1000)} 秒以内にレポートが出ませんでした`);
    }
    await sleep(500);
  }
}

/** 1280x900 と 390x844 の 2 枚を撮る（最後は 1280x900 に戻す） */
async function shootBothViewports(page, baseName) {
  const files = [];
  await page.setViewportSize(DESKTOP);
  await sleep(400);
  files.push(await shot(page, `${baseName}-1280x900`, { fullPage: true }));
  await page.setViewportSize(MOBILE);
  await sleep(500);
  files.push(await shot(page, `${baseName}-390x844`, { fullPage: true }));
  await page.setViewportSize(DESKTOP);
  await sleep(300);
  return files;
}

/**
 * レポートに書かれている「診断ページ数」を読む。
 * 表紙の dl → 本文の文言 の順に試し、見つからなければ null。
 */
async function readDiagnosedPages(page) {
  return page.evaluate(() => {
    const norm = (value) => (value || "").replace(/\s+/g, " ").trim();
    const toNumber = (value) => {
      const found = /(\d[\d,]*)/.exec(value || "");
      return found ? Number(found[1].replace(/,/g, "")) : null;
    };

    // 1. 表紙の dl（dt「診断ページ数」→ 対応する dd）
    for (const dt of Array.from(document.querySelectorAll("dt"))) {
      if (!norm(dt.textContent).includes("診断ページ数")) continue;
      let dd = dt.nextElementSibling;
      while (dd && dd.tagName !== "DD") dd = dd.nextElementSibling;
      if (!dd && dt.parentElement) dd = dt.parentElement.querySelector("dd");
      const value = toNumber(norm(dd && dd.textContent));
      if (value !== null) return { value, source: "dl" };
    }

    const body = document.body;
    const text = norm((body && (body.innerText || body.textContent)) || "");

    // 2. 本文の文言から
    const patterns = [
      [/診断ページ数[^0-9]{0,24}(\d[\d,]*)/, "text:診断ページ数"],
      [/(\d[\d,]*)\s*ページ(?:の)?平均/, "text:平均"],
      [/(\d[\d,]*)\s*ページを診断/, "text:診断"],
      [/診断したページ[^0-9]{0,12}(\d[\d,]*)/, "text:診断したページ"],
    ];
    for (const [pattern, source] of patterns) {
      const found = pattern.exec(text);
      if (found) return { value: Number(found[1].replace(/,/g, "")), source };
    }
    return { value: null, source: null };
  });
}

/**
 * /api/site を直接叩いて診断ページ数を得る（画面から読めなかったときの控え）。
 * 直前に同じ URL を診断していればサーバー側のキャッシュが効いて即座に返る。
 */
async function fetchSiteResult(devUrl, target, timeoutMs) {
  const response = await fetch(new URL("/api/site", devUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: target }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok && !text.includes('"type":"result"')) {
    throw new Error(`/api/site が HTTP ${response.status} を返しました: ${text.slice(0, 200)}`);
  }
  let result = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (parsed && parsed.type === "error") throw new Error(`/api/site のエラー: ${parsed.error}`);
    if (parsed && parsed.type === "result" && parsed.result) result = parsed.result;
    else if (parsed && parsed.result && parsed.result.pages) result = parsed.result;
  }
  if (!result || !Array.isArray(result.pages)) {
    throw new Error("/api/site の応答から結果を取り出せませんでした");
  }
  return {
    count: result.pages.length,
    urls: result.pages.map((page) => page.url),
    failures: (result.failures || []).map((failure) => failure.url),
    discovery: result.discovery,
  };
}

/**
 * PDF 複製で字幅を変える OpenType 機能が切れているか、実際のブラウザで確かめる。
 *
 * html2canvas-pro は DOM で実測した位置に canvas で描くが、canvas の font には
 * font-feature-settings / font-variant-numeric を渡せない。画面側が palt で
 * 字幅を詰めていると、（ ） ・ などの約物が次の文字に重なる。palt を持つ
 * フォント（Hiragino Sans など）のある環境でだけ起きるので、CI では
 * 見た目で気づけない。ここでは計算後のスタイルで契約を確かめる。
 */
async function checkPdfCaptureFont(page) {
  return page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML =
      '<span class="tabular-nums">90</span>' +
      '<div class="pdf-capture"><span class="tabular-nums">90</span><p>（AIO）・robots.txt</p></div>';
    document.body.appendChild(host);
    const screenSpan = host.querySelector("span");
    const capture = host.querySelector(".pdf-capture");
    const capSpan = capture.querySelector("span");
    const capP = capture.querySelector("p");
    const result = {
      screenFeatures: getComputedStyle(screenSpan).fontFeatureSettings,
      screenNumeric: getComputedStyle(screenSpan).fontVariantNumeric,
      captureFeatures: getComputedStyle(capSpan).fontFeatureSettings,
      captureNumeric: getComputedStyle(capSpan).fontVariantNumeric,
      captureParagraphFeatures: getComputedStyle(capP).fontFeatureSettings,
    };
    host.remove();
    return result;
  });
}

/** PDF ボタンを押して download イベントを待つ */
async function downloadPdf(page, prefix) {
  const button = await firstVisible(
    page,
    [
      (p) => p.getByRole("button", { name: /PDFでダウンロード/ }),
      (p) => p.getByRole("button", { name: /PDF/i }),
      (p) => p.locator('button:has-text("PDF")'),
      (p) => p.getByRole("link", { name: /PDF/i }),
    ],
    TIMEOUTS.element,
  );
  if (!button) throw new Error("PDF ダウンロードのボタンが見つかりません");
  await button.scrollIntoViewIfNeeded().catch(() => {});
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: TIMEOUTS.pdf }),
    button.click({ timeout: TIMEOUTS.element }),
  ]);
  await mkdir(SHOTS_DIR, { recursive: true });
  const file = join(SHOTS_DIR, `${prefix}-report.pdf`);
  await download.saveAs(file);
  log(`PDF をダウンロードしました: ${download.suggestedFilename()} → ${file}`);
  return { name: download.suggestedFilename(), file };
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const failures = [];
  const screenshots = [];
  let consoleErrors = [];
  let pdfCaptureFont = null;
  let diagnosedPages = null;
  let expectedPages = null;

  const fail = (message) => {
    failures.push(message);
    log(`NG: ${message}`);
  };

  let site = null;
  let dev = null;
  let browser = null;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    if (browser) await browser.close().catch(() => {});
    if (dev) await dev.kill().catch(() => {});
    if (site) await site.close().catch(() => {});
    log("後始末が終わりました");
  };
  const onSignal = async (signal) => {
    log(`${signal} を受け取りました。停止します`);
    await cleanup();
    process.exit(130);
  };
  process.on("SIGINT", () => void onSignal("SIGINT"));
  process.on("SIGTERM", () => void onSignal("SIGTERM"));

  try {
    // --- 1. ダミーサイトと dev サーバー -------------------------------------
    site = await startDummySite({ port: args.dummyPort, delayMs: args.dummyDelay });
    expectedPages = site.expected.length;
    log(`ダミーサイト: ${site.origin}（診断されるはずのページ ${expectedPages} 件）`);

    if (args.devUrl) {
      dev = { url: args.devUrl.replace(/\/+$/, ""), kill: async () => {} };
      log(`既存の dev サーバーを使います: ${dev.url}`);
    } else {
      dev = await startDevServer({ port: args.devPort, timeoutMs: TIMEOUTS.devServer });
    }

    // --- 2. ブラウザを開く ---------------------------------------------------
    browser = await launch({ viewport: DESKTOP });
    const page = browser.page;
    consoleErrors = collectConsoleErrors(page);
    const apiCalls = trackApiCalls(page);
    page.setDefaultTimeout(TIMEOUTS.element);
    const open = async () => {
      await page.goto(dev.url, { waitUntil: "domcontentloaded", timeout: TIMEOUTS.navigation });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    };
    await open();
    log(`トップページを開きました: ${dev.url}`);

    const target = `${site.origin}/`;

    // --- 3. ページ診断 -------------------------------------------------------
    try {
      await fillUrl(page, target);
      await selectMode(page, "page").catch((err) => {
        // 「このページ」は既定の状態なので、見つからなくても続行する
        log(`注意: ${err.message}（既定のまま続行します）`);
      });
      const submittedAt = Date.now();
      await submit(page);
      const called = await waitForApiCall(apiCalls, "/api/analyze", submittedAt, 20_000);
      if (!called) log("注意: /api/analyze の呼び出しを確認できませんでした");
      await waitForReport(page, TIMEOUTS.pageDiagnosis, "ページ診断");
      screenshots.push(...(await shootBothViewports(page, `${args.prefix}-page`)));
    } catch (err) {
      fail(`ページ診断: ${err instanceof Error ? err.message : String(err)}`);
      screenshots.push(await shot(page, `${args.prefix}-page-error`, { fullPage: true }).catch(() => null));
    }

    // --- 4. サイト診断 -------------------------------------------------------
    let siteReportReady = false;
    try {
      // 直前のページ診断のレポートが残っていると「終わった」と誤判定するので開き直す
      await open();
      await fillUrl(page, target);
      await selectMode(page, "site");
      const submittedAt = Date.now();
      await submit(page);
      const siteCall = await waitForApiCall(apiCalls, "/api/site", submittedAt, 20_000);
      if (!siteCall) {
        const pageCall = await waitForApiCall(apiCalls, "/api/analyze", submittedAt, 0);
        if (pageCall) throw new Error("診断範囲が「サイト全体」に切り替わっていません（/api/analyze が呼ばれました）");
        log("注意: /api/site の呼び出しを確認できませんでした");
      }

      // 進捗パネル（実行中の画面）。終わるのが早いこともあるので待ちは短く
      const progress = await firstVisible(page, PROGRESS_CANDIDATES, 3_000);
      if (!progress) log("注意: 進捗パネルを捕まえられませんでした（診断が早く終わった可能性）");
      screenshots.push(await shot(page, `${args.prefix}-site-progress`, { fullPage: false }));

      await waitForReport(page, TIMEOUTS.siteDiagnosis, "サイト診断");
      siteReportReady = true;
      screenshots.push(...(await shootBothViewports(page, `${args.prefix}-site`)));
    } catch (err) {
      fail(`サイト診断: ${err instanceof Error ? err.message : String(err)}`);
      screenshots.push(await shot(page, `${args.prefix}-site-error`, { fullPage: true }).catch(() => null));
    }

    // --- 5. 診断ページ数の照合 -----------------------------------------------
    if (siteReportReady) {
      try {
        const fromDom = await readDiagnosedPages(page);
        if (fromDom.value !== null) {
          diagnosedPages = fromDom.value;
          log(`レポートの診断ページ数: ${diagnosedPages}（取得元: ${fromDom.source}）`);
        }
        if (diagnosedPages === null || diagnosedPages !== expectedPages) {
          const api = await fetchSiteResult(dev.url, target, TIMEOUTS.api);
          log(`/api/site の診断ページ数: ${api.count}（discovery: ${api.discovery}）`);
          const missing = site.expected.filter((url) => !api.urls.includes(url));
          const extra = api.urls.filter((url) => !site.expected.includes(url));
          if (missing.length) log(`診断されなかった URL: ${missing.join(", ")}`);
          if (extra.length) log(`想定外に診断された URL: ${extra.join(", ")}`);
          if (diagnosedPages === null) {
            diagnosedPages = api.count;
            log("画面から診断ページ数を読めなかったため /api/site の値を使いました");
          }
        }
      } catch (err) {
        fail(`診断ページ数の取得: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (diagnosedPages !== null && diagnosedPages !== expectedPages) {
        fail(`診断ページ数が期待値と違います（レポート ${diagnosedPages} 件 / 期待 ${expectedPages} 件）`);
      }
    }

    // --- 6. PDF 複製のフォント設定 ------------------------------------------
    try {
      pdfCaptureFont = await checkPdfCaptureFont(page);
      if (pdfCaptureFont.screenFeatures !== '"palt"') {
        fail(`画面表示の palt が効いていません（${pdfCaptureFont.screenFeatures}）`);
      }
      if (pdfCaptureFont.captureFeatures !== "normal" || pdfCaptureFont.captureParagraphFeatures !== "normal") {
        fail(
          "PDF 複製の中で font-feature-settings が normal になっていません" +
            `（${pdfCaptureFont.captureFeatures} / ${pdfCaptureFont.captureParagraphFeatures}）。` +
            "palt を持つフォントの環境で、（ ） ・ が隣の文字に重なります",
        );
      }
      if (pdfCaptureFont.captureNumeric !== "normal") {
        fail(`PDF 複製の中で font-variant-numeric が normal になっていません（${pdfCaptureFont.captureNumeric}）`);
      }
    } catch (err) {
      fail(`PDF 複製のフォント設定: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- 7. PDF ダウンロード -------------------------------------------------
    if (siteReportReady) {
      try {
        await downloadPdf(page, args.prefix);
        const text = await pageText(page);
        if (text.includes("PDFを作成できませんでした")) {
          fail("PDF の作成に失敗した旨が画面に出ています");
        }
      } catch (err) {
        fail(`PDF ダウンロード: ${err instanceof Error ? err.message : String(err)}`);
        screenshots.push(await shot(page, `${args.prefix}-pdf-error`, { fullPage: false }).catch(() => null));
      }
    } else {
      fail("サイトレポートが出なかったため PDF ダウンロードは試していません");
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    await cleanup();
  }

  if (consoleErrors.length > 0) {
    fail(`コンソールエラーが ${consoleErrors.length} 件あります（consoleErrors を参照）`);
  }

  const summary = {
    ok: failures.length === 0,
    screenshots: screenshots.filter(Boolean),
    diagnosedPages,
    expectedPages,
    pdfCaptureFont,
    consoleErrors,
    failures,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`, () => process.exit(summary.ok ? 0 : 1));
}

main().catch(async (err) => {
  process.stderr.write(`[free-smoke] 想定外のエラー: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      screenshots: [],
      diagnosedPages: null,
      expectedPages: null,
      consoleErrors: [],
      failures: [err instanceof Error ? err.message : String(err)],
    })}\n`,
    () => process.exit(1),
  );
});
