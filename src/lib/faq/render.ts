import type { FaqItem } from "./schema";

/**
 * 承認済み FAQ から FAQPage の JSON-LD と HTML を組み立てる。
 * サーバー・クライアントどちらでも動く純関数。
 */

export function buildFaqJsonLd(faqs: FaqItem[]): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
  return JSON.stringify(data, null, 2);
}

export function buildFaqScriptTag(faqs: FaqItem[]): string {
  // JSON 内の "</script>" で script が閉じられないようにエスケープする
  const json = buildFaqJsonLd(faqs).replace(/<\//g, "<\\/");
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 貼り付けてそのまま使える FAQ の HTML。
 * details/summary を使い、CSS 無しでも折りたたみとして機能する。
 * クラス名はそのままサイト側の CSS で装飾できるよう固定にしている。
 */
export function buildFaqHtml(faqs: FaqItem[], heading = "よくある質問"): string {
  const items = faqs
    .map(
      (f) => `  <details class="faq-item">
    <summary class="faq-question">${escapeHtml(f.question)}</summary>
    <div class="faq-answer"><p>${escapeHtml(f.answer)}</p></div>
  </details>`,
    )
    .join("\n");
  return `<section class="faq" aria-labelledby="faq-heading">
  <h2 id="faq-heading">${escapeHtml(heading)}</h2>
${items}
</section>`;
}

/** JSON-LD と HTML を 1 つにまとめた、コピペ用の完成形 */
export function buildFaqSnippet(faqs: FaqItem[], heading?: string): string {
  return `${buildFaqScriptTag(faqs)}\n\n${buildFaqHtml(faqs, heading)}`;
}
