/**
 * robots.txt の書式チェック（純関数。ネットワークには出ない）。
 *
 * robots-parser は「壊れた行を黙って読み飛ばす」実装なので、可否の判定だけでは
 * 書き間違いに気づけない。`Dissallow` と書いても、全角スペースが混ざっていても、
 * 最初の `User-agent` より前に `Disallow` を置いても、パーサは何も言わずに
 * 「何も拒否していない robots.txt」として扱う。運用者から見ると「書いたのに効いて
 * いない」状態なので、行単位で読み直して指摘する。
 *
 * 重大度は 3 段階:
 * - error … その行（または全体）が効いていない。採点は fail
 * - warn  … 効いてはいるが意図しない結果になりやすい。採点は warn
 * - info  … 動作に影響しない豆知識。採点はしない（pass のまま details に出す）
 */

/** robots.txt で意味を持つディレクティブ（小文字） */
const KNOWN_DIRECTIVES = [
  "user-agent",
  "allow",
  "disallow",
  "sitemap",
  "crawl-delay",
  "host",
  "clean-param",
] as const;

/** 昔は使われたが、いま主要な検索エンジンが読まないディレクティブ */
const OBSOLETE_DIRECTIVES = ["noindex", "nofollow", "noarchive"] as const;

/** Google が読み込む robots.txt の上限（これを超えた部分は無視される） */
export const ROBOTS_MAX_BYTES = 500 * 1024;

export type RobotsLintSeverity = "error" | "warn" | "info";

export interface RobotsLintIssue {
  /** 1 始まりの行番号。ファイル全体の指摘は 0 */
  line: number;
  severity: RobotsLintSeverity;
  message: string;
}

/** 編集距離（書き間違いか、まったく別の語かの判定に使う） */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i, ...new Array<number>(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 書き間違いらしい既知のディレクティブ名。無ければ null */
function nearestDirective(name: string): string | null {
  let best: { name: string; distance: number } | null = null;
  for (const known of KNOWN_DIRECTIVES) {
    const distance = editDistance(name, known);
    if (best === null || distance < best.distance) best = { name: known, distance };
  }
  if (best === null) return null;
  // 2 文字までの違いなら書き間違いとみなす（dissallow → disallow、useragent → user-agent）
  return best.distance <= 2 ? best.name : null;
}

/**
 * robots.txt を 1 行ずつ読んで、書式の誤りを返す。
 * 可否の判定（どのクローラがどの URL を取れるか）は evaluateRobots の役目で、
 * ここでは「書いたつもりが効いていない」書き方だけを見る。
 */
export function lintRobotsTxt(text: string): RobotsLintIssue[] {
  const issues: RobotsLintIssue[] = [];

  if (text.charCodeAt(0) === 0xfeff) {
    issues.push({
      line: 1,
      severity: "error",
      message:
        "先頭に BOM（画面には見えない制御文字）が入っています。1 行目の User-agent が読み飛ばされることがあります。UTF-8（BOM 無し）で保存し直してください",
    });
  }
  if (text.length > ROBOTS_MAX_BYTES) {
    issues.push({
      line: 0,
      severity: "warn",
      message: `robots.txt が ${Math.round(text.length / 1024)}KB あります。Google が読むのは先頭 500KB までで、それ以降の行は無視されます`,
    });
  }

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let seenUserAgent = false;

  lines.forEach((raw, index) => {
    const line = index + 1;
    const withoutComment = raw.replace(/#.*$/, "");
    if (withoutComment.trim() === "") return;

    if (/[　：]/.test(withoutComment)) {
      issues.push({
        line,
        severity: "error",
        message:
          "全角の空白または全角コロン（：）が入っています。robots.txt は半角しか読まれないため、この行は無視されます",
      });
      return;
    }

    const separator = withoutComment.indexOf(":");
    if (separator < 0) {
      issues.push({
        line,
        severity: "error",
        message: `「${withoutComment.trim()}」は「ディレクティブ: 値」の形になっていません（例: User-agent: *）。この行は無視されます`,
      });
      return;
    }

    const name = withoutComment.slice(0, separator).trim().toLowerCase();
    const value = withoutComment.slice(separator + 1).trim();

    if (name === "sitemap") {
      if (!/^https?:\/\//i.test(value)) {
        issues.push({
          line,
          severity: "error",
          message: `Sitemap には絶対 URL を書きます（例: https://example.com/sitemap.xml）。「${value || "（空）"}」では読まれません`,
        });
      }
      return;
    }

    if (name === "user-agent") {
      seenUserAgent = true;
      if (value === "") {
        issues.push({
          line,
          severity: "error",
          message: "User-agent の値が空です。すべてのクローラを指すなら「User-agent: *」と書きます",
        });
      }
      return;
    }

    if (OBSOLETE_DIRECTIVES.includes(name as (typeof OBSOLETE_DIRECTIVES)[number])) {
      issues.push({
        line,
        severity: "warn",
        message: `robots.txt の ${name} は 2019 年に Google が対応をやめたため効きません。検索結果に出したくないページは、そのページの HTML に meta robots の noindex を書きます`,
      });
      return;
    }

    if (name === "crawl-delay") {
      issues.push({
        line,
        severity: "info",
        message: "Crawl-delay は Google が読まないディレクティブです（Bing などは読みます）。害はありません",
      });
      return;
    }

    if (name === "host" || name === "clean-param") return;

    if (name !== "allow" && name !== "disallow") {
      const nearest = nearestDirective(name);
      issues.push({
        line,
        severity: nearest ? "error" : "warn",
        message: nearest
          ? `「${withoutComment.slice(0, separator).trim()}」は「${nearest}」の書き間違いと思われます。この行は無視されています`
          : `「${withoutComment.slice(0, separator).trim()}」は robots.txt のディレクティブとして認識されません。この行は無視されています`,
      });
      return;
    }

    // ここから Allow / Disallow
    if (!seenUserAgent) {
      issues.push({
        line,
        severity: "error",
        message: `User-agent より前に ${name === "allow" ? "Allow" : "Disallow"} が書かれています。どのクローラにも適用されないため、この行は効いていません`,
      });
      return;
    }
    if (value === "") return; // Disallow:（空）は「すべて許可」の正しい書き方
    if (/^https?:\/\//i.test(value)) {
      issues.push({
        line,
        severity: "error",
        message: `${name === "allow" ? "Allow" : "Disallow"} には絶対 URL ではなくパスを書きます（例: Disallow: /admin/）。この行は効いていません`,
      });
      return;
    }
    if (!value.startsWith("/") && !value.startsWith("*")) {
      issues.push({
        line,
        severity: "error",
        message: `${name === "allow" ? "Allow" : "Disallow"} の値は「/」で始めます（例: Disallow: /${value}）。この行は効いていません`,
      });
      return;
    }
    if (name === "disallow" && /\*?\.(css|js)\b/i.test(value)) {
      issues.push({
        line,
        severity: "error",
        message: `CSS / JavaScript のファイル（${value}）を拒否しています。Google はページを実際に描画して評価するため、これらを止めると見た目が崩れた状態で判定され、順位にも AI 検索の理解にも不利になります`,
      });
    }
  });

  return issues;
}

/** 重大度ごとの件数 */
export function countBySeverity(issues: RobotsLintIssue[]): Record<RobotsLintSeverity, number> {
  const counts: Record<RobotsLintSeverity, number> = { error: 0, warn: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}
