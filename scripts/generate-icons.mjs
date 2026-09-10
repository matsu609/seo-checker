#!/usr/bin/env node
/**
 * src/app/icon.svg から、各サイズの PNG と favicon.ico を作り直す。
 *
 *   node scripts/generate-icons.mjs
 *
 * アイコンの形を変えたときだけ実行する（生成物はリポジトリに入れてある）。
 * 紹介サイト（marketing/）はビルドが別系統でアプリのアイコンを参照できないため、
 * ここから同じ元データでコピーを書き出す。手でコピーすると片方だけ古くなる。
 * ICO には PNG をそのまま埋め込む形式を使う（16/32/48 の 3 枚）。
 * sharp は Next.js が持っているものをそのまま使う。
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("src/app/icon.svg");
const png = (size) => sharp(svg, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// PWA / iOS 用
for (const [file, size] of [
  ["src/app/apple-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  // 紹介サイト（Cloudflare Workers が配信する marketing/public）
  ["marketing/public/apple-icon.png", 180],
]) {
  writeFileSync(file, await png(size));
  console.log(file, size);
}

// favicon.ico（16/32/48 の 3 枚を束ねる）
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);          // reserved
header.writeUInt16LE(1, 2);          // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = images.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0); // width
  e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1); // height
  e.writeUInt8(0, 2);                // パレット無し
  e.writeUInt8(0, 3);                // reserved
  e.writeUInt16LE(1, 4);             // color planes
  e.writeUInt16LE(32, 6);            // bits per pixel
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
const ico = Buffer.concat([header, ...entries, ...images]);
for (const file of ["src/app/favicon.ico", "marketing/public/favicon.ico"]) {
  writeFileSync(file, ico);
  console.log(file, sizes.join("/"));
}

// 紹介サイトは Next.js の /icon.svg を使えないので、元の SVG もコピーする
writeFileSync("marketing/public/icon.svg", svg);
console.log("marketing/public/icon.svg");
