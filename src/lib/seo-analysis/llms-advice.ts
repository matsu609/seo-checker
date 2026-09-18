/**
 * 精密診断の llms.txt カードに出す「追加すべきもの」（純粋。クライアントでも読める）。
 *
 * 有無の判定（collectLlmsTxt）と検証（validateLlmsTxt）の結果に、クロールで分かったサイトの構成
 * （重要度の高いページ・ページ種別）を重ねて、「何を書けばよいか」を具体的な URL つきで出す。
 * 利用者の指示 2026-09-18「精密診断には有無に加えて、どのようなものを追加するべきかも表示する」。
 */
import type { StructurePage, PageKind } from "./types";
import type { SheetLlmsTxt } from "./sheet/types";

export interface LlmsAdviceItem {
  /** 見出し（何を足すか） */
  title: string;
  /** 理由と書き方 */
  detail: string;
  /** 載せるべきページの候補（重要度の高い順） */
  pages?: { url: string; title: string | null }[];
}

export interface LlmsAdviceInput {
  topPages?: readonly StructurePage[];
  kinds?: readonly { kind: PageKind; count: number }[];
  pageCount?: number;
}

/** セクションとして案内すべきページ種別と、既存の llms.txt の見出しがそれを含むと見なす語 */
const SECTION_KINDS: { kind: PageKind; section: string; words: RegExp; why: string }[] = [
  { kind: "service", section: "サービス・商品", words: /サービス|商品|製品|メニュー|料金|service|product|pricing/i, why: "AI が「何をしている会社か」を答える根拠になります" },
  { kind: "company", section: "会社・店舗情報", words: /会社|店舗|概要|about|company|profile|access|アクセス/i, why: "所在地・代表者・沿革は信頼の根拠として引用されやすい情報です" },
  { kind: "contact", section: "お問い合わせ", words: /問い合わせ|contact|予約|申し込み/i, why: "AI が「どこに連絡すればよいか」を案内できます" },
  { kind: "article", section: "記事・お知らせ", words: /記事|ブログ|お知らせ|ニュース|コラム|blog|news|article/i, why: "専門性を示す記事は、AI 検索で引用される入口になります" },
  { kind: "list", section: "一覧・カテゴリ", words: /一覧|カテゴリ|category|list/i, why: "一覧ページを載せると、AI が下層の記事を辿りやすくなります" },
  { kind: "recruit", section: "採用", words: /採用|求人|recruit|career/i, why: "採用の質問に AI が答えるときの根拠になります" },
];

const MAX_PAGES_PER_SECTION = 3;
const MAX_CANDIDATES = 8;
/** これ以上のページ数なら llms-full.txt も勧める */
const FULL_TXT_PAGE_THRESHOLD = 20;

function pagesOfKind(top: readonly StructurePage[], kind: PageKind): { url: string; title: string | null }[] {
  return top
    .filter((p) => p.kind === kind)
    .slice(0, MAX_PAGES_PER_SECTION)
    .map((p) => ({ url: p.url, title: p.title }));
}

function count(kinds: readonly { kind: PageKind; count: number }[] | undefined, kind: PageKind): number {
  return kinds?.find((k) => k.kind === kind)?.count ?? 0;
}

export function llmsAdvice(llms: SheetLlmsTxt, site: LlmsAdviceInput = {}): LlmsAdviceItem[] {
  const top = site.topPages ?? [];
  const items: LlmsAdviceItem[] = [];

  if (!llms.present) {
    items.push({
      title: "1 行目に「# サイト名」、2 行目に「> サイトの目的を 1〜2 文」",
      detail: "AI が最初に読む部分です。誰向けに何を提供しているかを、キャッチコピーではなく事実で書いてください（例: 「東京都世田谷区の歯科医院。矯正・小児歯科・予防歯科に対応」）。",
    });
  }

  // セクション: サイトにその種別のページがあるのに、llms.txt に該当する見出しが無いもの
  for (const s of SECTION_KINDS) {
    const n = count(site.kinds, s.kind);
    const candidates = pagesOfKind(top, s.kind);
    if (n === 0 && candidates.length === 0) continue;
    const covered = llms.present && llms.sections.some((name) => s.words.test(name));
    if (covered) continue;
    items.push({
      title: `「## ${s.section}」のセクションを追加（サイトに ${n || candidates.length} ページあります）`,
      detail: `${s.why}。「- [ページ名](絶対 URL): 1 行の説明」の形で並べてください。`,
      pages: candidates.length > 0 ? candidates : undefined,
    });
  }

  // 中身の検証で落ちた項目（あるときだけ）
  if (llms.present) {
    for (const c of llms.checks) {
      if (c.id === "exists" || c.level === "pass") continue;
      if (c.id === "sections") continue; // 上でセクション単位に具体化している
      items.push({ title: `${c.label}を直す`, detail: c.detail });
    }
  }

  if (!llms.present || items.length === 0 || !llms.present) {
    // 何を載せるかの全体候補（重要度の高い順）。トップと「検索に載せないページ」は除く
    const candidates = top.filter((p) => p.kind !== "home" && p.kind !== "not-for-search" && p.kind !== "legal").slice(0, MAX_CANDIDATES).map((p) => ({ url: p.url, title: p.title }));
    if (candidates.length > 0 && !llms.present) {
      items.push({
        title: "案内に載せるページの候補（内部リンクから見た重要度の高い順）",
        detail: "すべてのページを載せる必要はありません。AI に読んでほしい順に、各ページへ 1 行の説明を添えてください。",
        pages: candidates,
      });
    }
  }

  if (!llms.full.present && (site.pageCount ?? 0) >= FULL_TXT_PAGE_THRESHOLD) {
    items.push({
      title: "llms-full.txt（本文をまとめた大きい方）も検討",
      detail: `ページ数が ${site.pageCount} と多いので、主要ページの本文を 1 ファイルにまとめた llms-full.txt を置くと、AI が一度に全体を読めます（任意）。`,
    });
  }

  if (!llms.present) {
    items.push({
      title: "置き場所と形式",
      detail: "サイトのルート（https://ドメイン/llms.txt）に UTF-8 のテキストとして置き、Content-Type は text/plain で返します。サイドバーの「llms.txt 生成」でサイトを走査すると下書きができます。",
    });
  }

  return items;
}
