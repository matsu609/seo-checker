/**
 * AI クローラごとの robots.txt 判定（docs/reference/04_implementation-guide.md §2.2）。
 *
 * 「学習用」と「検索用」を分けて出すのが要点。学習を断りつつ検索には出したい
 * という選択があり得るため、まとめて「AI をブロックしている」とは書かない。
 */
import robotsParser from "robots-parser";

/** ボットの用途 */
export type BotPurpose = "training" | "search" | "user";

export const PURPOSE_LABELS: Record<BotPurpose, string> = {
  training: "学習用",
  search: "検索用",
  user: "ユーザー操作時",
};

export interface AiBot {
  ua: string;
  vendor: string;
  purpose: BotPurpose;
  /** 何に効くか（画面の補足） */
  note: string;
}

/** 判定対象の User-agent（§2.2 の表） */
export const AI_BOTS: readonly AiBot[] = [
  { ua: "GPTBot", vendor: "OpenAI", purpose: "training", note: "ChatGPT の学習用クロール" },
  { ua: "OAI-SearchBot", vendor: "OpenAI", purpose: "search", note: "ChatGPT 検索に載るために必要" },
  { ua: "ChatGPT-User", vendor: "OpenAI", purpose: "user", note: "利用者がリンクを開いたときの取得" },
  { ua: "ClaudeBot", vendor: "Anthropic", purpose: "training", note: "Claude の学習用クロール" },
  { ua: "Claude-User", vendor: "Anthropic", purpose: "user", note: "利用者の指示による取得" },
  { ua: "Claude-SearchBot", vendor: "Anthropic", purpose: "search", note: "Claude の検索結果に載るために必要" },
  { ua: "anthropic-ai", vendor: "Anthropic", purpose: "training", note: "旧来の表記。互換のため残す" },
  { ua: "Googlebot", vendor: "Google", purpose: "search", note: "AI Overviews はこのクローラで取得する" },
  { ua: "Google-Extended", vendor: "Google", purpose: "training", note: "Gemini の学習可否。AI Overviews には影響しない" },
  { ua: "PerplexityBot", vendor: "Perplexity", purpose: "search", note: "Perplexity の検索インデックス" },
  { ua: "Perplexity-User", vendor: "Perplexity", purpose: "user", note: "利用者の質問に応じた取得" },
  { ua: "Bingbot", vendor: "Microsoft", purpose: "search", note: "Bing / Copilot の検索インデックス" },
  { ua: "CCBot", vendor: "Common Crawl", purpose: "training", note: "多くの LLM が学習に使う公開データセット" },
  { ua: "Bytespider", vendor: "ByteDance", purpose: "training", note: "Doubao などの学習用クロール" },
  { ua: "Applebot-Extended", vendor: "Apple", purpose: "training", note: "Apple Intelligence の学習可否" },
  { ua: "Amazonbot", vendor: "Amazon", purpose: "search", note: "Alexa などの回答に使う取得" },
  { ua: "meta-externalagent", vendor: "Meta", purpose: "training", note: "Meta AI の学習用クロール" },
  { ua: "cohere-ai", vendor: "Cohere", purpose: "training", note: "Cohere の学習用クロール" },
  { ua: "DuckAssistBot", vendor: "DuckDuckGo", purpose: "search", note: "DuckAssist の回答生成" },
  { ua: "YouBot", vendor: "You.com", purpose: "search", note: "You.com の検索インデックス" },
];

export interface BotVerdict extends AiBot {
  /** robots.txt でこの URL の取得が許可されているか */
  allowed: boolean;
  /** 判定の根拠（robots.txt が無い場合など） */
  reason: string;
}

export interface RobotsMatrix {
  exists: boolean;
  bots: BotVerdict[];
  /** 用途ごとの拒否数 */
  blocked: Record<BotPurpose, number>;
  total: Record<BotPurpose, number>;
}

/**
 * robots.txt を UA ごとに評価する。
 * robots.txt が無い場合はすべて許可（クローラの既定の扱いと同じ）。
 */
export function evaluateAiBots(robotsTxt: string | null, pageUrl: string, robotsUrl: string): RobotsMatrix {
  const blocked: Record<BotPurpose, number> = { training: 0, search: 0, user: 0 };
  const total: Record<BotPurpose, number> = { training: 0, search: 0, user: 0 };

  if (robotsTxt === null) {
    const bots = AI_BOTS.map((bot) => ({
      ...bot,
      allowed: true,
      reason: "robots.txt が無いため、すべてのクローラが許可されます",
    }));
    for (const bot of bots) total[bot.purpose] += 1;
    return { exists: false, bots, blocked, total };
  }

  const robots = robotsParser(robotsUrl, robotsTxt);
  const bots: BotVerdict[] = AI_BOTS.map((bot) => {
    // isAllowed が undefined を返すのは URL がホスト外のとき。ここでは許可扱い
    const allowed = robots.isAllowed(pageUrl, bot.ua) !== false;
    const matched = robots.getMatchingLineNumber(pageUrl, bot.ua);
    return {
      ...bot,
      allowed,
      reason: allowed
        ? typeof matched === "number" && matched > 0
          ? `robots.txt の ${matched} 行目で許可`
          : "拒否する記述がないため許可"
        : typeof matched === "number" && matched > 0
          ? `robots.txt の ${matched} 行目の Disallow に一致`
          : "robots.txt の Disallow に一致",
    };
  });

  for (const bot of bots) {
    total[bot.purpose] += 1;
    if (!bot.allowed) blocked[bot.purpose] += 1;
  }
  return { exists: true, bots, blocked, total };
}
