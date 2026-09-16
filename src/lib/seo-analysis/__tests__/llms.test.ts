import { describe, expect, it } from "vitest";
import { collectLlmsTxt, looksLikeHtml } from "../llms";

const ORIGIN = "https://example.com";

const GOOD = `# サンプル工房

> 東京都世田谷区のウェブ制作会社です。中小企業のサイト制作と運用を請け負います。

## 主要コンテンツ

- [サービス](https://example.com/service): 制作プランと運用プランの内容と料金
- [制作実績](https://example.com/works): 業種別の事例と公開後の数値

## 会社情報

- [会社概要](https://example.com/company): 所在地・代表者・沿革
`;

/** fetchText のふりをする。パスごとに応答を決める */
function fakeFetch(map: Record<string, { ok?: boolean; status?: number; contentType?: string; body?: string } | "throw">) {
  return async (url: string) => {
    const path = new URL(url).pathname;
    const hit = map[path];
    if (hit === "throw") throw new Error("network");
    if (!hit) return { ok: false, status: 404, contentType: "text/plain", body: "" };
    return { ok: hit.ok ?? true, status: hit.status ?? 200, contentType: hit.contentType ?? "text/plain", body: hit.body ?? "" };
  };
}

describe("HTML の取り違え防止", () => {
  it("HTML が返ってきたらテキストファイルとみなさない", () => {
    expect(looksLikeHtml({ contentType: "text/html; charset=utf-8", body: "x" })).toBe(true);
    expect(looksLikeHtml({ contentType: "text/plain", body: "<!DOCTYPE html>\n<html>" })).toBe(true);
    expect(looksLikeHtml({ contentType: "text/plain", body: "# サイト名" })).toBe(false);
  });
});

describe("llms.txt の評価", () => {
  it("整った llms.txt は「あり」で、中身の判定も合格になる", async () => {
    const llms = await collectLlmsTxt(ORIGIN, {
      fetchImpl: fakeFetch({ "/llms.txt": { body: GOOD }, "/llms-full.txt": { body: "本文".repeat(100) } }),
    });
    expect(llms.present).toBe(true);
    expect(llms.url).toBe(`${ORIGIN}/llms.txt`);
    expect(llms.title).toBe("サンプル工房");
    expect(llms.summary).toContain("世田谷区");
    expect(llms.sections).toEqual(["主要コンテンツ", "会社情報"]);
    expect(llms.linkCount).toBe(3);
    expect(llms.describedLinks).toBe(3);
    expect(llms.checks.find((c) => c.id === "links")?.level).toBe("pass");
    expect(llms.checks.find((c) => c.id === "absolute")?.level).toBe("pass");
    expect(llms.full.present).toBe(true);
  });

  it("無ければ「なし」になり、中身の判定は出ない", async () => {
    const llms = await collectLlmsTxt(ORIGIN, { fetchImpl: fakeFetch({}) });
    expect(llms.present).toBe(false);
    expect(llms.status).toBe(404);
    expect(llms.linkCount).toBe(0);
    expect(llms.full.present).toBe(false);
    // 「有無」の 1 項目だけが残る
    expect(llms.checks.map((c) => c.id)).toEqual(["exists"]);
  });

  it("404 ページが 200 で HTML を返すサイトでも「なし」と判定する", async () => {
    const llms = await collectLlmsTxt(ORIGIN, {
      fetchImpl: fakeFetch({ "/llms.txt": { contentType: "text/html", body: "<!DOCTYPE html><html><body>404</body></html>" } }),
    });
    expect(llms.present).toBe(false);
  });

  it("中身が薄いときは注意・未対応が付く", async () => {
    const llms = await collectLlmsTxt(ORIGIN, {
      fetchImpl: fakeFetch({ "/llms.txt": { body: "サイトの説明です。リンクはまだありません。" } }),
    });
    expect(llms.present).toBe(true);
    expect(llms.checks.find((c) => c.id === "title")?.level).toBe("fail");
    expect(llms.checks.find((c) => c.id === "links")?.level).toBe("fail");
    expect(llms.checks.find((c) => c.id === "size")?.level).toBe("warn");
  });

  it("取得が失敗しても例外にせず「なし」で返す（報告書を止めない）", async () => {
    const llms = await collectLlmsTxt(ORIGIN, { fetchImpl: fakeFetch({ "/llms.txt": "throw", "/llms-full.txt": "throw" }) });
    expect(llms.present).toBe(false);
    expect(llms.status).toBe(0);
  });

  it("llms-full.txt だけあるときも取り違えない", async () => {
    const llms = await collectLlmsTxt(ORIGIN, { fetchImpl: fakeFetch({ "/llms-full.txt": { body: "本文".repeat(50) } }) });
    expect(llms.present).toBe(false);
    expect(llms.full.present).toBe(true);
  });
});
