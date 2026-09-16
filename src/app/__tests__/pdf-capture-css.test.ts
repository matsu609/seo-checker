/**
 * PDF 複製で字幅を変える OpenType 機能が無効になっていることを守るテスト。
 *
 * html2canvas-pro は「DOM で実測した各断片の位置」に ctx.fillText で描くが、
 * canvas の font 文字列には font-feature-settings と font-variant-numeric を
 * 渡せない（text-renderer.js の createFontStyle）。DOM 側だけ palt で字幅が
 * 詰まると、（ ） ・ 。 などの約物が次の文字に重なる。Hiragino Sans のように
 * palt を持つフォントでだけ起きるので、CI の環境では見た目では気づけない。
 * ここが消えると iOS / macOS で PDF が壊れるので、宣言の存在を固定する。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");

/** セレクタに対応する宣言ブロックの中身を取り出す（コメントは除去済みの前提） */
function ruleBody(selector: string): string | null {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(",").map((s) => s.trim());
    if (selectors.includes(selector)) return m[2];
  }
  return null;
}

describe("PDF 複製のフォント設定", () => {
  it("画面表示では palt を効かせている", () => {
    const body = ruleBody("body");
    expect(body).not.toBeNull();
    expect(body).toMatch(/font-feature-settings:\s*"palt"/);
  });

  it(".pdf-capture の中では字幅を変える機能を打ち消す", () => {
    // `.pdf-capture, .pdf-capture *` のどちらの側から引いても同じブロックを指す
    const body = ruleBody(".pdf-capture *");
    expect(body, ".pdf-capture * の規則が見つかりません").not.toBeNull();
    expect(body).toMatch(/font-feature-settings:\s*normal\s*!important/);
    expect(body).toMatch(/font-variant-numeric:\s*normal\s*!important/);
    // 子孫にも当てないと tabular-nums ユーティリティが残ってしまう
    expect(ruleBody(".pdf-capture")).not.toBeNull();
  });

  it("font-kerning は触らない（canvas 側も既定で有効なので、切ると逆にずれる）", () => {
    const body = ruleBody(".pdf-capture *") ?? "";
    expect(body).not.toMatch(/font-kerning/);
  });
});

/**
 * PDF は @media print ではなく DOM の複製（.pdf-capture）を画像化して作る。
 * そのため Tailwind の print: 系は PDF に効かない。折りたたみに print:block を
 * 使うと、画面で開かずに PDF を作ったとき中身が丸ごと抜ける。
 * 代わりに .print-expand を使う、という約束をここで固定する。
 */
describe("折りたたみを PDF に出す仕組み", () => {
  it(".pdf-capture の中で .print-expand が開く", () => {
    expect(ruleBody(".pdf-capture .print-expand")).toMatch(/display:\s*block\s*!important/);
  });

  it("印刷（@media print）でも .print-expand が開く", () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const print = stripped.slice(stripped.indexOf("@media print"));
    expect(print).toMatch(/\.print-expand\s*\{[^}]*display:\s*block\s*!important/);
  });

  it("報告書の部品が print: 系の折りたたみを使っていない（PDF で消えるため）", async () => {
    const dir = new URL("../../components/seo-analysis/", import.meta.url);
    const { readdirSync } = await import("node:fs");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
      const text = readFileSync(new URL(file, dir), "utf8");
      if (/print:(block|hidden)/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
