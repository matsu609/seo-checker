/**
 * 既存 llms.txt の検証（純関数・ネットワークに出ない）。
 *
 * llmstxt.org の形（# サイト名 / > 概要 / ## セクション / - [title](url): 説明）
 * にどれだけ沿っているかを見る。リンク切れの確認だけは取得が要るので、
 * 呼び出し側（Route Handler）が status を埋める。
 */
import type { CheckLevel, LlmsLink, ValidationCheck, ValidationResult } from "./types";

/** 大きすぎる llms.txt は AI が読み切れない（llms-full.txt に分けるべき） */
export const MAX_RECOMMENDED_BYTES = 100 * 1024;
/** 小さすぎると情報が足りない */
export const MIN_RECOMMENDED_CHARS = 100;

/** "- [タイトル](URL): 説明" 形式の行 */
const LINK_LINE = /^\s*[-*]\s*\[([^\]]*)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/;

function check(id: string, label: string, level: CheckLevel, detail: string): ValidationCheck {
  return { id, label, level, detail };
}

/** Markdown を行ごとに読んで、見出し・概要・リンクを取り出す */
export function parseLlmsTxt(text: string): {
  title: string | null;
  summary: string | null;
  sections: string[];
  links: LlmsLink[];
} {
  let title: string | null = null;
  let summary: string | null = null;
  const sections: string[] = [];
  const links: LlmsLink[] = [];
  let currentSection = "";

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1 && title === null) {
      title = h1[1].trim();
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      currentSection = h2[1].trim();
      sections.push(currentSection);
      continue;
    }
    const quote = /^>\s*(.*)$/.exec(line);
    if (quote && summary === null && quote[1].trim()) {
      summary = quote[1].trim();
      continue;
    }
    const link = LINK_LINE.exec(line);
    if (link) {
      links.push({
        title: link[1].trim(),
        url: link[2].trim(),
        description: (link[3] ?? "").trim(),
        section: currentSection,
        status: null,
      });
    }
  }

  return { title, summary, sections, links };
}

export interface ValidateOptions {
  url: string;
  /** 取得できたか。false なら present: false の結果になる */
  found: boolean;
  status: number;
}

/** 中身を検査してチェック項目の一覧を返す */
export function validateLlmsTxt(text: string, options: ValidateOptions): ValidationResult {
  const raw = text ?? "";
  const trimmed = raw.trim();
  const bytes = Buffer.byteLength(raw, "utf8");
  const parsed = parseLlmsTxt(raw);

  if (!options.found || trimmed.length === 0) {
    return {
      url: options.url,
      present: false,
      status: options.status,
      length: 0,
      bytes: 0,
      checks: [
        check(
          "exists",
          "ファイルの有無",
          "fail",
          `${options.url} を取得できませんでした（HTTP ${options.status || "接続失敗"}）。サイトのルートに llms.txt を置いてください。`,
        ),
      ],
      links: [],
      sections: [],
      title: null,
      summary: null,
      deadLinks: null,
      raw: "",
    };
  }

  const checks: ValidationCheck[] = [
    check("exists", "ファイルの有無", "pass", `${options.url} を取得できました（HTTP ${options.status}）`),
    check(
      "size",
      "サイズ",
      bytes > MAX_RECOMMENDED_BYTES ? "warn" : trimmed.length < MIN_RECOMMENDED_CHARS ? "warn" : "pass",
      bytes > MAX_RECOMMENDED_BYTES
        ? `${Math.round(bytes / 1024)} KB あります。llms.txt は目次として簡潔に保ち、本文全体は llms-full.txt に分けてください。`
        : trimmed.length < MIN_RECOMMENDED_CHARS
          ? `${trimmed.length} 文字しかありません。サイト概要と主要ページの一覧を追加してください。`
          : `${trimmed.length} 文字 / ${Math.round((bytes / 1024) * 10) / 10} KB`,
    ),
    check(
      "title",
      "サイト名（# 見出し）",
      parsed.title ? "pass" : "fail",
      parsed.title ? `「${parsed.title}」` : "1 行目に「# サイト名」の見出しがありません。",
    ),
    check(
      "summary",
      "概要（> 引用）",
      parsed.summary ? "pass" : "warn",
      parsed.summary
        ? `「${parsed.summary}」`
        : "「> 1〜2 文の概要」がありません。AI が最初に読む部分なので、サイトの目的を 1 文で書いてください。",
    ),
    check(
      "sections",
      "セクション（## 見出し）",
      parsed.sections.length > 0 ? "pass" : "warn",
      parsed.sections.length > 0
        ? `${parsed.sections.length} 件: ${parsed.sections.join(" / ")}`
        : "「## 主要コンテンツ」のような見出しがありません。用途ごとにページを分けて並べてください。",
    ),
    check(
      "links",
      "リンクの記法",
      parsed.links.length > 0 ? "pass" : "fail",
      parsed.links.length > 0
        ? `${parsed.links.length} 件のリンクを検出しました`
        : "「- [タイトル](URL): 説明」形式のリンクがありません。",
    ),
    check(
      "descriptions",
      "リンクの説明",
      describeRatio(parsed.links),
      parsed.links.length === 0
        ? "リンクがないため評価できません。"
        : `${parsed.links.filter((l) => l.description).length} / ${parsed.links.length} 件に説明が付いています`,
    ),
    check(
      "absolute",
      "絶対 URL",
      parsed.links.every((l) => /^https?:\/\//i.test(l.url)) ? "pass" : "warn",
      parsed.links.every((l) => /^https?:\/\//i.test(l.url))
        ? "すべてのリンクが絶対 URL です"
        : `相対 URL が ${parsed.links.filter((l) => !/^https?:\/\//i.test(l.url)).length} 件あります。llms.txt は単体で読まれるため、絶対 URL で書いてください。`,
    ),
  ];

  return {
    url: options.url,
    present: true,
    status: options.status,
    length: trimmed.length,
    bytes,
    checks,
    links: parsed.links,
    sections: parsed.sections,
    title: parsed.title,
    summary: parsed.summary,
    deadLinks: null,
    raw,
  };
}

function describeRatio(links: readonly LlmsLink[]): CheckLevel {
  if (links.length === 0) return "warn";
  const withDescription = links.filter((l) => l.description).length;
  const ratio = withDescription / links.length;
  return ratio >= 0.9 ? "pass" : ratio >= 0.5 ? "warn" : "fail";
}

/**
 * リンクの取得結果をチェック項目に反映する。
 * status が埋まったリンクだけを数える（未検証は判定しない）。
 */
export function applyLinkStatuses(result: ValidationResult, statuses: Record<string, number>): ValidationResult {
  const links = result.links.map((link) => ({ ...link, status: statuses[link.url] ?? null }));
  const checked = links.filter((l) => l.status !== null);
  const dead = checked.filter((l) => (l.status ?? 0) >= 400 || l.status === 0);
  const checks = [
    ...result.checks,
    check(
      "dead-links",
      "リンク切れ",
      checked.length === 0 ? "warn" : dead.length === 0 ? "pass" : "fail",
      checked.length === 0
        ? "リンク先を確認できませんでした。"
        : dead.length === 0
          ? `${checked.length} 件すべてが到達できました`
          : `${dead.length} 件が到達できません: ${dead.map((l) => `${l.url}（HTTP ${l.status || "接続失敗"}）`).join(" / ")}`,
    ),
  ];
  return { ...result, links, checks, deadLinks: checked.length === 0 ? null : dead.length };
}
