/**
 * ルール数（AUDIT_RULE_COUNT）が実装と合っていることを確かめる（2026-09-29）。
 *
 * 画面や資料の「N ルール」は config.ts の定数から引く。ルールを足したり消したりして定数を
 * 直し忘れると、ここが落ちる。数えるのはルール ID の種類（`issue("ID", …)` と `ruleId: "ID"`）で、
 * 同じ ID をページ単位とサイト横断の両方で出すもの（REDIRECT_CHAIN など）は 1 つに数える。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_RULE_COUNT } from "../config";

const SOURCES = ["rules/page.ts", "rules/cross.ts", "run.ts"];

function ruleIdsIn(source: string): string[] {
  const ids = new Set<string>();
  for (const m of source.matchAll(/\bissue\(\s*"([A-Z][A-Z0-9_]+)"/g)) ids.add(m[1]!);
  for (const m of source.matchAll(/\bruleId:\s*"([A-Z][A-Z0-9_]+)"/g)) ids.add(m[1]!);
  return [...ids];
}

describe("AUDIT_RULE_COUNT", () => {
  it("rules/page.ts・rules/cross.ts・run.ts に出てくるルール ID の種類と一致する", () => {
    const all = new Set<string>();
    for (const file of SOURCES) {
      const source = readFileSync(join(__dirname, "..", file), "utf8");
      for (const id of ruleIdsIn(source)) all.add(id);
    }
    expect([...all].sort()).toHaveLength(AUDIT_RULE_COUNT);
  });
});
