#!/usr/bin/env node
/**
 * 無料診断（サイト = `/`、店舗 MEO = `/meo`）だけを、単体で動く Next.js アプリとして
 * 切り出して zip にまとめる。配布用のコピーを作るためのもので、本体は一切変えない。
 *
 *   node scripts/extract-free.mjs [--out <dir>] [--no-zip] [--name <アプリ名>]
 *
 * やっていること:
 *   1. 入口（無料診断のページと、その裏の API）から import をたどって必要なファイルを集める
 *   2. 集めたファイルを出力先へコピーする（パスは本体と同じ）
 *   3. 本体と違う 4 ファイル（layout / AppShell / TopBar / Sidebar）と、
 *      切り出し版だけの追加分を scripts/extract-free/overrides/ から上書きする
 *   4. package.json・README・.env.example・設定ファイルを書く
 *   5. 未解決の import が無いか検査してから zip にする
 *
 * 方針:
 * - 上書きは 4 ファイルだけに閉じる。コピーは「本体と同じ中身」を保ち、差分を追いやすくする。
 * - 本体にしか無い画面（ツール群・設定・ログイン）へのリンクは作らない。
 *   無料 MEO 診断から出ている `/plans`・`/sign-up` は、本体サービスへ送る小さなページに置き換える。
 * - 認証（Clerk）・課金（Stripe）・Supabase・口コミ支援は入れない。無料診断は使っていない。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OVERRIDES = path.join(ROOT, "scripts", "extract-free", "overrides");

/** 入口。ここから import をたどる */
const ENTRIES = [
  "src/app/layout.tsx",
  "src/app/page.tsx", // 無料 SEO・AIO 診断
  "src/app/meo/page.tsx", // 無料 MEO 診断
  "src/app/manifest.ts",
  "src/app/api/analyze/route.ts", // 1 ページの診断
  "src/app/api/site/route.ts", // サイト全体の診断
  "src/app/api/faq/route.ts", // 想定 FAQ の生成（ANTHROPIC_API_KEY があるときだけ）
  "src/app/api/meo/search/route.ts", // 店舗検索
  "src/app/api/meo/report/route.ts", // 店舗の採点
];

/** import ではたどれないもの（アイコン・静的ファイル・設定） */
const STATIC_FILES = [
  "src/app/favicon.ico",
  "src/app/icon.svg",
  "src/app/apple-icon.png",
  "public/icon-192.png",
  "public/icon-512.png",
  "next.config.ts",
  "postcss.config.mjs",
  "vitest.config.mts",
  ".gitignore",
];

/**
 * 本体の設定から、切り出し版に無いものを取り除いてコピーするファイル。
 * （本体の tsconfig / eslint は scripts/extract-free/overrides と dist を除外している）
 */
const REWRITTEN_CONFIGS = {
  "tsconfig.json": (text) => text.replace('"exclude": ["node_modules", "scripts/extract-free/overrides", "dist"]', '"exclude": ["node_modules"]'),
  "eslint.config.mjs": (text) =>
    text.replace(/\n\s*\/\/ 無料診断の切り出し[^\n]*\n\s*"scripts\/extract-free\/overrides\/\*\*",\n\s*"dist\/\*\*",/, ""),
};

/** 切り出し版に入れる依存（本体の package.json からバージョンを引く） */
const DEPENDENCIES = [
  "@anthropic-ai/sdk",
  "@mozilla/readability",
  "cheerio",
  "html2canvas-pro",
  "jspdf",
  "linkedom",
  "next",
  "react",
  "react-dom",
  "robots-parser",
  "zod",
];
const DEV_DEPENDENCIES = [
  "@tailwindcss/postcss",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "eslint",
  "eslint-config-next",
  "tailwindcss",
  "typescript",
  "vitest",
];

const EXTS = [".ts", ".tsx", ".js", ".mjs", ".json", ".css"];

function parseArgs(argv) {
  const opts = { out: null, zip: true, name: "seo-free-checker" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") opts.out = argv[++i];
    else if (argv[i] === "--no-zip") opts.zip = false;
    else if (argv[i] === "--name") opts.name = argv[++i];
    else throw new Error(`不明な引数です: ${argv[i]}`);
  }
  // zip の中のフォルダ名は出力先の名前になる（既定: seo-free-checker/）
  opts.out ??= path.join(ROOT, "dist", opts.name);
  return opts;
}

/** import 指定子をファイルへ解決する。外部パッケージは null */
function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTS) {
    const p = path.join(base, `index${e}`);
    if (fs.existsSync(p)) return p;
  }
  return { missing: base };
}

/** 1 ファイルが書いている import / require / 動的 import の指定子 */
function importsOf(file) {
  const code = fs.readFileSync(file, "utf8");
  const specs = [];
  for (const re of [
    /(?:^|[^\w.])(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    let m;
    while ((m = re.exec(code))) specs.push(m[1]);
  }
  return specs;
}

/** 入口から import をたどって、必要なファイル（リポジトリ相対）を集める */
function collect(entries) {
  const seen = new Set();
  const missing = [];
  const walk = (file) => {
    const rel = path.relative(ROOT, file);
    if (seen.has(rel)) return;
    seen.add(rel);
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) return;
    for (const spec of importsOf(file)) {
      const r = resolveImport(spec, file);
      if (r === null) continue; // 外部パッケージ
      if (typeof r === "object") {
        missing.push(`${rel} -> ${spec}`);
        continue;
      }
      walk(r);
    }
  };
  entries.forEach((e) => walk(path.join(ROOT, e)));
  return { files: [...seen].sort(), missing };
}

/** コピーしたファイルの隣にあるテスト（と fixtures）を拾う */
function collectTests(files) {
  const dirs = new Set(files.filter((f) => f.startsWith("src/")).map((f) => path.dirname(f)));
  const out = [];
  for (const dir of dirs) {
    const testDir = path.join(ROOT, dir, "__tests__");
    if (!fs.existsSync(testDir)) continue;
    for (const entry of fs.readdirSync(testDir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      out.push(path.relative(ROOT, path.join(entry.parentPath, entry.name)));
    }
  }
  return out.sort();
}

function copy(rel, outDir) {
  const to = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), to);
}

/** 出力先の中でその import が解決できるか */
function resolvesInOutput(spec, file, outDir) {
  let base;
  if (spec.startsWith("@/")) base = path.join(outDir, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(file), spec);
  else return true; // 外部パッケージ
  return (
    (fs.existsSync(base) && fs.statSync(base).isFile()) ||
    EXTS.some((e) => fs.existsSync(base + e)) ||
    EXTS.some((e) => fs.existsSync(path.join(base, `index${e}`)))
  );
}

function outputFiles(outDir, pattern) {
  return fs
    .readdirSync(outDir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && pattern.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));
}

/**
 * 切り出さなかったコードを参照しているテストを落とす
 * （__tests__ ごとコピーするので、同じフォルダの別機能のテストが混ざる）。
 * 残ったテストが 0 件になった __tests__ は、fixtures ごと消す。
 */
function pruneTests(outDir) {
  let dropped = 0;
  for (const file of outputFiles(outDir, /\.test\.tsx?$/)) {
    if (importsOf(file).every((s) => resolvesInOutput(s, file, outDir))) continue;
    fs.rmSync(file);
    dropped++;
  }
  for (const dir of new Set(
    outputFiles(outDir, /\./)
      .map((f) => path.dirname(f))
      .filter((d) => path.basename(d) === "__tests__" || path.basename(path.dirname(d)) === "__tests__"),
  )) {
    const testDir = path.basename(dir) === "__tests__" ? dir : path.dirname(dir);
    if (!fs.existsSync(testDir)) continue;
    const hasTest = outputFiles(testDir, /\.test\.tsx?$/).length > 0;
    if (!hasTest) fs.rmSync(testDir, { recursive: true, force: true });
  }
  return dropped;
}

/**
 * 上書き後に、どこからも import されなくなったファイルを消す。
 * （本体の layout / TopBar が使っていたログイン周りが、たどった時点では付いてくるため）
 * 入口は app の page / layout / route / manifest と、残ったテスト。
 */
function pruneUnreachable(outDir) {
  const roots = [
    ...outputFiles(outDir, /^(page|layout|route|manifest|not-found|error)\.tsx?$/).filter((f) =>
      f.startsWith(path.join(outDir, "src", "app")),
    ),
    ...outputFiles(outDir, /\.test\.tsx?$/),
  ];
  const reachable = new Set();
  const walk = (file) => {
    if (reachable.has(file)) return;
    reachable.add(file);
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) return;
    for (const spec of importsOf(file)) {
      let base;
      if (spec.startsWith("@/")) base = path.join(outDir, "src", spec.slice(2));
      else if (spec.startsWith(".")) base = path.resolve(path.dirname(file), spec);
      else continue;
      const hit =
        (fs.existsSync(base) && fs.statSync(base).isFile() && base) ||
        EXTS.map((e) => base + e).find((p) => fs.existsSync(p)) ||
        EXTS.map((e) => path.join(base, `index${e}`)).find((p) => fs.existsSync(p));
      if (hit) walk(hit);
    }
  };
  roots.forEach(walk);

  const dropped = [];
  for (const file of outputFiles(outDir, /\.(ts|tsx)$/)) {
    if (!file.startsWith(path.join(outDir, "src"))) continue;
    if (reachable.has(file)) continue;
    fs.rmSync(file);
    dropped.push(path.relative(outDir, file));
  }
  // 空になったフォルダを片付ける
  for (let i = 0; i < 3; i++) {
    for (const dir of fs.readdirSync(outDir, { withFileTypes: true, recursive: true })) {
      if (!dir.isDirectory()) continue;
      const full = path.join(dir.parentPath, dir.name);
      if (fs.existsSync(full) && fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    }
  }
  return dropped;
}

/** 出力先の中で解決できない import が無いか確かめる */
function verify(outDir) {
  const problems = [];
  for (const file of outputFiles(outDir, /\.(ts|tsx|mjs)$/)) {
    for (const spec of importsOf(file)) {
      if (!resolvesInOutput(spec, file, outDir)) problems.push(`${path.relative(outDir, file)} -> ${spec}`);
    }
  }
  return problems;
}

function pickDeps(all, names) {
  const out = {};
  for (const n of names.sort()) {
    if (!all[n]) throw new Error(`本体の package.json に ${n} がありません`);
    out[n] = all[n];
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  const { files, missing } = collect(ENTRIES);
  if (missing.length) {
    console.error("解決できない import があります:\n  " + missing.join("\n  "));
    process.exit(1);
  }
  const tests = collectTests(files);

  // 出力先を作り直す
  fs.rmSync(opts.out, { recursive: true, force: true });
  fs.mkdirSync(opts.out, { recursive: true });

  for (const rel of [...files.filter((f) => f !== "package.json"), ...tests, ...STATIC_FILES]) copy(rel, opts.out);

  for (const [rel, rewrite] of Object.entries(REWRITTEN_CONFIGS)) {
    const before = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const after = rewrite(before);
    if (after === before) throw new Error(`${rel} の書き換えが効いていません（本体側の記述が変わった可能性）`);
    fs.writeFileSync(path.join(opts.out, rel), after);
  }

  // 上書き・追加（scripts/extract-free/overrides/src/** → src/**、overrides/files/** → ルート）
  const overrideSrc = path.join(OVERRIDES, "src");
  for (const entry of fs.readdirSync(overrideSrc, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const from = path.join(entry.parentPath, entry.name);
    const rel = path.join("src", path.relative(overrideSrc, from));
    fs.mkdirSync(path.dirname(path.join(opts.out, rel)), { recursive: true });
    fs.copyFileSync(from, path.join(opts.out, rel));
  }
  const overrideFiles = path.join(OVERRIDES, "files");
  for (const name of fs.readdirSync(overrideFiles)) {
    fs.copyFileSync(path.join(overrideFiles, name), path.join(opts.out, name));
  }

  // package.json（本体からバージョンだけ引き継ぐ）
  const outPkg = {
    name: opts.name,
    version: pkg.version,
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "eslint",
      typecheck: "tsc --noEmit",
      test: "vitest run",
    },
    dependencies: pickDeps(pkg.dependencies, DEPENDENCIES),
    devDependencies: pickDeps(pkg.devDependencies, DEV_DEPENDENCIES),
  };
  fs.writeFileSync(path.join(opts.out, "package.json"), JSON.stringify(outPkg, null, 2) + "\n");

  const droppedTests = pruneTests(opts.out);
  const droppedFiles = pruneUnreachable(opts.out);

  const problems = verify(opts.out);
  if (problems.length) {
    console.error("切り出したコードに解決できない import が残っています:\n  " + problems.join("\n  "));
    process.exit(1);
  }

  const counted = fs
    .readdirSync(opts.out, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile()).length;
  console.log(
    `切り出し先: ${path.relative(ROOT, opts.out)}（${counted} ファイル。` +
      `切り出さない機能のテスト ${droppedTests} 件は除外）`,
  );
  if (droppedFiles.length) console.log(`上書きで使われなくなったファイルを削除: ${droppedFiles.join(", ")}`);

  if (opts.zip) {
    const zipPath = `${opts.out}.zip`;
    fs.rmSync(zipPath, { force: true });
    // 動作確認のために出力先で npm install した場合でも、生成物は zip に入れない
    const base = path.basename(opts.out);
    const exclude = [`${base}/node_modules/*`, `${base}/.next/*`, `${base}/*.tsbuildinfo`];
    execFileSync("zip", ["-rq", zipPath, base, "-x", ...exclude], { cwd: path.dirname(opts.out) });
    const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
    console.log(`zip: ${path.relative(ROOT, zipPath)}（${mb} MB）`);
  }
}

main();
