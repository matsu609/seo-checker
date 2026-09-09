#!/usr/bin/env node
/**
 * リリース履歴に 1 件足す。main へマージしたあとに実行する。
 *
 *   node scripts/add-release.mjs "入れた内容の 1 行説明"
 *
 * いまチェックアウトしているコミット（HEAD）とその日付をそのまま記録するので、
 * main を早送りしたあとに実行すること。説明を省くと HEAD のコミットメッセージを使う。
 * 件数がそのままバージョン番号になる（別のカウンタは持たない）。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/lib/release/releases.json";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const commit = git("log", "-1", "--format=%h");
const date = git("log", "-1", "--format=%cs");
const summary = process.argv[2]?.trim() || git("log", "-1", "--format=%s");

const data = JSON.parse(readFileSync(FILE, "utf8"));
const releases = Array.isArray(data.releases) ? data.releases : [];

// 同じコミットを二重に記録しない（マージ後に 2 回実行しても増えない）
if (releases.some((r) => r?.commit === commit)) {
  console.log(`r${releases.length}: ${commit} は記録済みです。何もしません。`);
  process.exit(0);
}

releases.push({ commit, date, summary });
writeFileSync(FILE, `${JSON.stringify({ releases }, null, 2)}\n`);
console.log(`r${releases.length} を追加しました: ${commit} ${date} ${summary}`);
console.log(`${FILE} を commit してください。`);
