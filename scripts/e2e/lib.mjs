/**
 * E2E スモークテストの共通ヘルパー。
 *
 * - startDummySite()  … ダミーサイト（dummy-site.mjs）をプロセス内に立てる
 * - startDevServer()  … `npx next dev -p PORT` を起動して待つ（ALLOW_PRIVATE_HOSTS=1）
 * - launch()          … /opt/pw-browsers/chromium で Playwright を起動する
 * - collectConsoleErrors() … console.error / ページ例外 / 失敗したリクエストを集める
 * - shot()            … スクリーンショットを scratchpad の shots/ に保存する
 * - waitForText()     … 画面に指定の文字列が出るまで待つ
 *
 * 画面のマークアップは作業中に変わるため、要素の特定は
 * 「role と文言 → id → CSS」の順で候補を試す（firstVisible / clickFirst）。
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export {
  startDummySite,
  expectedPageUrls,
  expectedInfo,
  EXPECTED_PATHS,
  DEFAULT_PORT as DUMMY_SITE_DEFAULT_PORT,
} from "./dummy-site.mjs";

/** リポジトリのルート（scripts/e2e/ の 2 つ上） */
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** スクリーンショットの保存先。E2E_SHOTS_DIR で上書きできる */
export const SHOTS_DIR =
  process.env.E2E_SHOTS_DIR ?? join(tmpdir(), "seo-checker-e2e", "shots");

/** Playwright が使う Chromium。E2E_CHROMIUM で上書きできる */
export const CHROMIUM_PATH = process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 経過時間つきのログ（標準エラーへ。標準出力は最後の JSON 専用にする） */
const startedAt = Date.now();
export function log(message) {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1).padStart(6, " ");
  process.stderr.write(`[${elapsed}s] ${message}\n`);
}

// ---------------------------------------------------------------------------
// dev サーバー
// ---------------------------------------------------------------------------

/** stdout に出る "http://localhost:3101" のような URL を拾う */
const DEV_URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+)/;

/**
 * `npx next dev -p PORT` を起動し、実際に応答するようになるまで待つ。
 *
 * - ALLOW_PRIVATE_HOSTS=1 を付ける（ダミーサイトが 127.0.0.1 のため）
 * - ポートが埋まっていると next が別のポートを選ぶので、出力から実際の URL を拾う
 * - 最初のリクエストでコンパイルが走るため、待ち時間は長めに取る
 *
 * 返り値: { url, port, child, kill(), output() }
 */
export async function startDevServer(options = {}) {
  const {
    port = 3101,
    cwd = REPO_ROOT,
    timeoutMs = 180_000,
    env: extraEnv = {},
    command = process.platform === "win32" ? "npx.cmd" : "npx",
    args = ["next", "dev", "-p", String(port)],
  } = options;

  const chunks = [];
  const record = (buffer) => {
    chunks.push(String(buffer));
    if (chunks.length > 400) chunks.splice(0, chunks.length - 400);
  };
  const output = () => chunks.join("");

  const detached = process.platform !== "win32";
  const child = spawn(command, args, {
    cwd,
    detached,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ALLOW_PRIVATE_HOSTS: "1", BROWSER: "none", ...extraEnv },
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", record);
  child.stderr.on("data", record);

  let exited = false;
  let spawnError = null;
  child.once("exit", () => {
    exited = true;
  });
  // spawn 自体の失敗（npx が無いなど）。放置すると未処理例外になる
  child.once("error", (err) => {
    spawnError = err;
    exited = true;
    record(`spawn error: ${err.message}\n`);
  });

  const kill = async () => {
    if (exited || child.pid === undefined) return;
    try {
      if (detached) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      /* すでに終了している */
    }
    const stopped = await Promise.race([once(child, "exit").then(() => true), sleep(5_000).then(() => false)]);
    if (!stopped) {
      try {
        if (detached) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* すでに終了している */
      }
    }
  };

  const deadline = Date.now() + timeoutMs;
  // dev サーバーには next が案内するホスト名（localhost）でアクセスする。
  // 127.0.0.1 に書き換えると Next が /_next/hmr を cross-origin として弾き、
  // クライアントがハイドレートしなくなる（ダミーサイト側は 127.0.0.1 のままでよい）。
  let url = `http://localhost:${port}`;
  try {
    // 1. 出力に URL が出るのを待つ（出なくても既定の URL で試す）
    while (Date.now() < deadline) {
      if (exited) {
        if (spawnError) throw new Error(`${command} を起動できませんでした: ${spawnError.message}`);
        throw new Error(`next dev が起動前に終了しました（exit ${child.exitCode}）:\n${output().slice(-2000)}`);
      }
      const found = DEV_URL_RE.exec(output());
      if (found) {
        url = found[1].replace("127.0.0.1", "localhost").replace("[::1]", "localhost");
        break;
      }
      await sleep(250);
    }

    // 2. 実際に応答するまで叩く（最初のリクエストでコンパイルが走る）
    let lastError = "応答がありませんでした";
    while (Date.now() < deadline) {
      if (exited) {
        if (spawnError) throw new Error(`${command} を起動できませんでした: ${spawnError.message}`);
        throw new Error(`next dev が終了しました（exit ${child.exitCode}）:\n${output().slice(-2000)}`);
      }
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (res.status < 500) {
          await res.arrayBuffer();
          log(`dev サーバー起動: ${url}（HTTP ${res.status}）`);
          return { url, port: Number(new URL(url).port), child, kill, output };
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      await sleep(500);
    }
    throw new Error(`dev サーバーが ${timeoutMs}ms 以内に応答しませんでした（${lastError}）:\n${output().slice(-2000)}`);
  } catch (err) {
    await kill();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// ブラウザ
// ---------------------------------------------------------------------------

/**
 * Chromium を起動して 1 枚のページを返す。
 * 返り値: { browser, context, page, close() }
 */
export async function launch(options = {}) {
  const {
    viewport = { width: 1280, height: 900 },
    headless = true,
    locale = "ja-JP",
    timezoneId = "Asia/Tokyo",
    ...contextOptions
  } = options;

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport,
    locale,
    timezoneId,
    deviceScaleFactor: 1,
    acceptDownloads: true,
    ...contextOptions,
  });
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

/** 無視してよい既知のノイズ（favicon の 404、React DevTools の案内、HMR など） */
export const IGNORED_CONSOLE_PATTERNS = [
  /favicon\.ico/i,
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /_next\/static\/(webpack|chunks)\/.*hot-update/i,
  /net::ERR_ABORTED/i,
];

/**
 * console.error・ページ内例外・失敗したリクエストを集める。
 * 返り値の配列はその場で書き換わる（呼び出し後に発生した分も入る）。
 */
export function collectConsoleErrors(page, options = {}) {
  const { ignore = IGNORED_CONSOLE_PATTERNS, limit = 50 } = options;
  const errors = [];
  const push = (text) => {
    if (!text) return;
    if (ignore.some((pattern) => pattern.test(text))) return;
    if (errors.length >= limit) return;
    errors.push(text.length > 500 ? `${text.slice(0, 500)}…` : text);
  };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // 「Failed to load resource: …」のような文言には URL が入らないので、
    // どこで起きたかを location() から補う（favicon などの除外にも必要）
    const where = message.location && message.location().url ? ` @ ${message.location().url}` : "";
    push(`console.error: ${message.text()}${where}`);
  });
  page.on("pageerror", (error) => {
    push(`pageerror: ${error && error.message ? error.message : String(error)}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    push(`requestfailed: ${request.url()} (${failure ? failure.errorText : "不明"})`);
  });
  return errors;
}

/**
 * スクリーンショットを保存してパスを返す（ディレクトリは自動で作る）。
 * ページが極端に長いと fullPage の撮影が失敗することがあるため、
 * その場合は表示領域だけを撮り直す。
 */
export async function shot(page, name, options = {}) {
  const { fullPage = true } = options;
  await mkdir(SHOTS_DIR, { recursive: true });
  const file = join(SHOTS_DIR, `${String(name).replace(/[^\w.-]+/g, "-")}.png`);
  try {
    await page.screenshot({ path: file, fullPage, timeout: 120_000 });
  } catch (err) {
    if (!fullPage) throw err;
    log(`fullPage の撮影に失敗したため表示領域だけ撮ります: ${err instanceof Error ? err.message : err}`);
    await page.screenshot({ path: file, fullPage: false, timeout: 60_000 });
  }
  log(`screenshot: ${file}`);
  return file;
}

/**
 * /api/* へのリクエストを記録する。
 * 画面の作りが変わっても「どちらのモードで診断が走ったか」を確かめられる。
 */
export function trackApiCalls(page) {
  const calls = [];
  page.on("request", (request) => {
    try {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/")) calls.push({ pathname, method: request.method(), at: Date.now() });
    } catch {
      /* 相対 URL でない場合は無視 */
    }
  });
  return calls;
}

/** since 以降に pathname への呼び出しが記録されるまで待つ（無ければ null） */
export async function waitForApiCall(calls, pathname, since, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = calls.find((call) => call.pathname === pathname && call.at >= since);
    if (hit) return hit;
    if (Date.now() > deadline) return null;
    await sleep(200);
  }
}

/** 画面のどこかに text が出るまで待つ */
export async function waitForText(page, text, timeoutMs = 30_000) {
  await page.waitForFunction(
    (needle) => {
      const body = document.body;
      if (!body) return false;
      return (body.innerText || body.textContent || "").includes(needle);
    },
    text,
    { timeout: timeoutMs, polling: 250 },
  );
  return text;
}

/** texts のどれかが出るまで待ち、最初に見つかったものを返す */
export async function waitForAnyText(page, texts, timeoutMs = 30_000) {
  const handle = await page.waitForFunction(
    (needles) => {
      const body = document.body;
      if (!body) return null;
      const content = body.innerText || body.textContent || "";
      return needles.find((needle) => content.includes(needle)) ?? null;
    },
    texts,
    { timeout: timeoutMs, polling: 250 },
  );
  const value = await handle.jsonValue();
  await handle.dispose();
  return value;
}

/** 画面のテキスト全体（正規化済み） */
export async function pageText(page) {
  return page.evaluate(() => {
    const body = document.body;
    return ((body && (body.innerText || body.textContent)) || "").replace(/\s+/g, " ").trim();
  });
}

/**
 * 候補の中から最初に見つかった（表示されている）要素を返す。
 * candidates は Locator か、page を受け取って Locator を返す関数。
 */
export async function firstVisible(page, candidates, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const candidate of candidates) {
      let locator;
      try {
        locator = typeof candidate === "function" ? candidate(page) : candidate;
      } catch {
        continue;
      }
      if (!locator) continue;
      const target = locator.first();
      try {
        if ((await target.count()) > 0 && (await target.isVisible())) return target;
      } catch {
        /* 再描画の途中でつかんだ場合は次の候補へ */
      }
    }
    await sleep(200);
  } while (Date.now() < deadline);
  return null;
}

/** firstVisible で見つけた要素をクリックする。見つからなければ null */
export async function clickFirst(page, candidates, options = {}) {
  const { timeoutMs = 10_000, label = "要素" } = options;
  const target = await firstVisible(page, candidates, timeoutMs);
  if (!target) return null;
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ timeout: 10_000 });
  log(`クリック: ${label}`);
  return target;
}
