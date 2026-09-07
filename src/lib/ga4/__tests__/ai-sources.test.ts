import { describe, expect, it } from "vitest";
import {
  AI_SOURCE_DICTIONARY,
  aiServiceNames,
  aiSourceFilterValues,
  isAiSource,
  matchAiSource,
  normalizeHost,
} from "../ai-sources";

describe("normalizeHost", () => {
  it("スキーム・パス・ポート・www・大文字を落とす", () => {
    expect(normalizeHost("https://Chat.OpenAI.com/c/123?x=1")).toBe("chat.openai.com");
    expect(normalizeHost("  WWW.Perplexity.AI  ")).toBe("perplexity.ai");
    expect(normalizeHost("chatgpt.com:443")).toBe("chatgpt.com");
    expect(normalizeHost("user@claude.ai")).toBe("claude.ai");
    expect(normalizeHost("meta.ai.")).toBe("meta.ai");
    expect(normalizeHost("")).toBe("");
  });
});

describe("matchAiSource", () => {
  it("辞書のホストに完全一致する", () => {
    expect(matchAiSource("chatgpt.com")).toBe("ChatGPT");
    expect(matchAiSource("gemini.google.com")).toBe("Gemini");
    expect(matchAiSource("perplexity.ai")).toBe("Perplexity");
    expect(matchAiSource("claude.ai")).toBe("Claude");
    expect(matchAiSource("copilot.microsoft.com")).toBe("Microsoft Copilot");
    expect(matchAiSource("notebooklm.google.com")).toBe("NotebookLM");
    expect(matchAiSource("chat.mistral.ai")).toBe("Le Chat（Mistral）");
  });

  it("辞書の全エントリが自分自身に一致する", () => {
    for (const entry of AI_SOURCE_DICTIONARY) {
      expect(matchAiSource(entry.host)).toBe(entry.service);
    }
  });

  it("サブドメインにも一致する", () => {
    expect(matchAiSource("cdn.chatgpt.com")).toBe("ChatGPT");
    expect(matchAiSource("a.b.claude.ai")).toBe("Claude");
  });

  it("www の有無を区別しない", () => {
    expect(matchAiSource("www.perplexity.ai")).toBe("Perplexity");
    expect(matchAiSource("www.chatgpt.com")).toBe("ChatGPT");
  });

  it("大文字混じり・URL 形式でも一致する", () => {
    expect(matchAiSource("CHATGPT.COM")).toBe("ChatGPT");
    expect(matchAiSource("https://Gemini.Google.com/app")).toBe("Gemini");
  });

  it("より具体的なホストを優先する", () => {
    // openai.com も chat.openai.com も同じ ChatGPT だが、辞書追加時に取り違えないことを固定する
    expect(matchAiSource("chat.openai.com")).toBe("ChatGPT");
    expect(matchAiSource("platform.openai.com")).toBe("ChatGPT");
  });

  it("辞書に無ければ null", () => {
    expect(matchAiSource("google.com")).toBeNull();
    expect(matchAiSource("(direct)")).toBeNull();
    expect(matchAiSource("notchatgpt.com")).toBeNull();
    expect(matchAiSource("openai.com.evil.example")).toBeNull();
    expect(matchAiSource("")).toBeNull();
    expect(matchAiSource("   ")).toBeNull();
  });

  it("ユーザー追加の辞書を既定より優先する", () => {
    const extras = [
      { host: "ai.example.jp", service: "社内 AI" },
      { host: "chatgpt.com", service: "ChatGPT（社内計測）" },
    ];
    expect(matchAiSource("ai.example.jp", extras)).toBe("社内 AI");
    expect(matchAiSource("www.ai.example.jp", extras)).toBe("社内 AI");
    expect(matchAiSource("chatgpt.com", extras)).toBe("ChatGPT（社内計測）");
    // 追加辞書に無いものは既定辞書で判定する
    expect(matchAiSource("claude.ai", extras)).toBe("Claude");
  });

  it("空のエントリは無視する", () => {
    expect(matchAiSource("claude.ai", [{ host: "  ", service: "壊れた行" }])).toBe("Claude");
    expect(matchAiSource("claude.ai", [{ host: "claude.ai", service: "  " }])).toBe("Claude");
  });

  it("isAiSource は boolean を返す", () => {
    expect(isAiSource("chatgpt.com")).toBe(true);
    expect(isAiSource("yahoo.co.jp")).toBe(false);
  });
});

describe("aiSourceFilterValues / aiServiceNames", () => {
  it("www 付きと無しの両方を重複なく返す", () => {
    const values = aiSourceFilterValues();
    expect(values).toContain("chatgpt.com");
    expect(values).toContain("www.chatgpt.com");
    expect(new Set(values).size).toBe(values.length);
    // 辞書の www.perplexity.ai は正規化して 1 件にまとまる
    expect(values.filter((v) => v === "perplexity.ai")).toHaveLength(1);
  });

  it("追加辞書のホストも含める", () => {
    expect(aiSourceFilterValues([{ host: "ai.example.jp", service: "社内 AI" }])).toContain("ai.example.jp");
  });

  it("サービス名は重複なく辞書順", () => {
    const names = aiServiceNames();
    expect(names[0]).toBe("ChatGPT");
    expect(names.filter((n) => n === "ChatGPT")).toHaveLength(1);
    expect(names).toContain("Grok");
    expect(aiServiceNames([{ host: "ai.example.jp", service: "社内 AI" }])).toContain("社内 AI");
  });
});
