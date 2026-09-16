/**
 * イベント名の共通化（docs/dev/diagnosis-rules-spec.md §5）。純関数。
 *
 * GA4 のイベント名は会社ごとにバラバラ（`contact_click` / `inquiry_button` /
 * `お問い合わせクリック`）なので、システム内部では 7 つの共通イベントに寄せる。
 *
 * 利用者に一から入力させないため、**まず自動で当てる**。GA4 から取ったイベント名を
 * 既知の語で照合し、当たらなかったものだけ設定画面で選び直してもらう。
 * 自動判定の結果は必ず画面に出す（どのイベントを何として数えたかが分からないと、
 * 出てきた数字を信用できないため）。
 */

export const COMMON_EVENTS = ["primary_cta", "form_start", "form_complete", "document_download", "phone_action", "email_action", "external_action"] as const;

export type CommonEvent = (typeof COMMON_EVENTS)[number];

export const COMMON_EVENT_LABELS: Record<CommonEvent, string> = {
  primary_cta: "主要な問い合わせ導線のクリック",
  form_start: "問い合わせフォームの入力開始",
  form_complete: "問い合わせフォームの完了",
  document_download: "資料・カタログのダウンロード",
  phone_action: "電話番号のクリック",
  email_action: "メールリンクのクリック",
  external_action: "外部予約・外部問い合わせへの遷移",
};

/**
 * 自動判定の規則。**上から順に照合し、最初に当たったものを採用する**。
 * 順番に意味があるので注意: `form_complete` は `form_start` より先に見る
 * （`contact_form_submit` を「開始」と取り違えないため）。
 */
const PATTERNS: { event: CommonEvent; re: RegExp }[] = [
  // 完了系。generate_lead は GA4 の推奨イベント
  { event: "form_complete", re: /^(generate_lead|purchase|sign_up)$/i },
  { event: "form_complete", re: /(form.?(submit|complete|success|sent|thanks)|(submit|complete|success|thanks).?form|contact.?complete|inquiry.?complete|送信完了|完了)/i },
  // 開始系
  { event: "form_start", re: /((form|contact|inquiry|enquiry|entry|estimate|quote)[_.\- ]?(start|begin|open)|(start|begin|open)[_.\- ]?(form|contact|inquiry)|入力開始|フォーム開始)/i },
  // 資料ダウンロード
  { event: "document_download", re: /(download|catalog|catalogue|whitepaper|brochure|spec.?sheet|document|資料|カタログ|ダウンロード)/i },
  // 電話
  { event: "phone_action", re: /(^|[_-])(tel|phone|call)([_-]|$)|電話/i },
  // メール
  { event: "email_action", re: /(mailto|e?mail.?click|click.?e?mail|メール)/i },
  // 外部遷移・予約
  { event: "external_action", re: /(outbound|external.?link|booking|reserve|reservation|calendar|予約|外部)/i },
  // CTA。最後に置く（contact / inquiry を含む語が上で拾われたあとの残り）
  { event: "primary_cta", re: /(contact|inquiry|enquiry|request|quote|estimate|demo|consult|cta|問い合わせ|問合せ|相談|見積)/i },
];

/** 共通イベント → 実際の GA4 イベント名（複数可） */
export type EventMapping = Record<CommonEvent, string[]>;

export function emptyMapping(): EventMapping {
  return { primary_cta: [], form_start: [], form_complete: [], document_download: [], phone_action: [], email_action: [], external_action: [] };
}

/** 1 つのイベント名を共通イベントに当てる。当たらなければ null */
export function guessCommonEvent(name: string): CommonEvent | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // GA4 が自動収集するイベントは、問い合わせ導線ではないので除く
  if (AUTO_EVENTS.has(trimmed)) return null;
  for (const p of PATTERNS) {
    if (p.re.test(trimmed)) return p.event;
  }
  return null;
}

/** GA4 が自動で集めるイベント（拡張計測イベントを含む）。共通イベントには当てない */
const AUTO_EVENTS = new Set([
  "page_view",
  "session_start",
  "first_visit",
  "user_engagement",
  "scroll",
  "click",
  "view_search_results",
  "video_start",
  "video_progress",
  "video_complete",
  "form_start_autotrack",
]);

/**
 * イベント名の一覧から対応表を作る。
 * `overrides` があればそれを優先する（設定画面で人が直した分）。
 */
export function buildEventMapping(names: readonly string[], overrides?: Partial<EventMapping>): EventMapping {
  const mapping = emptyMapping();
  const claimed = new Set<string>();

  // 人が指定した分を先に確定させる（自動判定より強い）
  for (const event of COMMON_EVENTS) {
    for (const name of overrides?.[event] ?? []) {
      const trimmed = name.trim();
      if (!trimmed || claimed.has(trimmed)) continue;
      mapping[event].push(trimmed);
      claimed.add(trimmed);
    }
  }

  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || claimed.has(trimmed)) continue;
    const guess = guessCommonEvent(trimmed);
    if (!guess) continue;
    mapping[guess].push(trimmed);
    claimed.add(trimmed);
  }
  return mapping;
}

/** 対応表に載らなかったイベント名（画面で「未分類」として出す） */
export function unmappedEvents(names: readonly string[], mapping: EventMapping): string[] {
  const claimed = new Set(COMMON_EVENTS.flatMap((e) => mapping[e]));
  return names.filter((n) => n.trim() && !claimed.has(n.trim()) && !AUTO_EVENTS.has(n.trim()));
}

/** この共通イベントに当てはまるか */
export function isMapped(mapping: EventMapping, event: CommonEvent, name: string): boolean {
  return mapping[event].includes(name.trim());
}

/** 自動判定の結果を画面・レポートで説明するための 1 行 */
export function describeMapping(mapping: EventMapping): string[] {
  return COMMON_EVENTS.filter((e) => mapping[e].length > 0).map((e) => `${COMMON_EVENT_LABELS[e]} = ${mapping[e].join(" / ")}`);
}
