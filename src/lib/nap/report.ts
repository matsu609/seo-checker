/**
 * 突き合わせの結果 → 「直すべき箇所」の一覧・集計・貼る JSON-LD（純粋関数）。
 *
 * 一致か不一致かをそのまま出す（ごまかさない）。不一致は fail、記載なし・取得できずは warn。
 * 並びは fail → warn、同じ重さなら 自社サイトの構造化データ → 自社サイトのページ → Google マップ → 掲載ページ → ウェブ の順
 * （自分で直せるものが上）。
 */
import { emptyProfile, jsonLdScript } from "@/lib/listings/profile";
import { NAP_FIELD_LABELS, type FieldCheck, type NapCheckResult, type NapField, type NapInput, type NapIssue, type NapSource, type NapSourceKind, type NapSummary } from "./types";

const KIND_ORDER: Record<NapSourceKind, number> = { site_jsonld: 0, site_page: 1, google_maps: 2, listing: 3, web: 4 };

const JSONLD_KEY: Record<NapField, string> = { name: "name", address: "address.streetAddress", phone: "telephone", website: "url" };

/** 不一致を直す場所（媒体の種類ごと） */
function fixAction(kind: NapSourceKind, field: NapField): string {
  switch (kind) {
    case "site_jsonld":
      return `サイトの構造化データ（JSON-LD）の ${JSONLD_KEY[field]} を正の値に直す（下の「サイトに貼る構造化データ」をそのまま貼れます）`;
    case "site_page":
      return "このページの表記を正の値に直す（フッター・会社概要・お問い合わせの表記を 1 つにそろえる）";
    case "google_maps":
      return "Google ビジネス プロフィール（https://business.google.com/）の「プロフィールを編集」で正の値に直す";
    case "listing":
      return "その媒体の管理画面で掲載内容を編集し、正の値に直す（「掲載」タブに管理画面のリンクがあります）";
    case "web":
      return "そのサイトの管理画面か問い合わせ窓口から、正の値への修正を依頼する";
  }
}

/** 記載なしを埋める場所 */
function addAction(kind: NapSourceKind, field: NapField): string {
  switch (kind) {
    case "site_jsonld":
      return `構造化データに ${JSONLD_KEY[field]} を足す（下の「サイトに貼る構造化データ」に入っています）`;
    case "site_page":
      return field === "name" ? "ページに正式な店名を書く（フッターに店名・住所・電話をまとめて置くのが定石）" : `このページに${NAP_FIELD_LABELS[field]}を書く（フッターに店名・住所・電話をまとめて置くのが定石）`;
    case "google_maps":
      return `Google ビジネス プロフィールに${NAP_FIELD_LABELS[field]}を登録する`;
    case "listing":
      return field === "website" ? "媒体の掲載内容に自社サイトの URL を登録する" : `媒体の掲載内容に${NAP_FIELD_LABELS[field]}を登録する（未掲載か、別の表記で書かれています。ページを開いて確かめる）`;
    case "web":
      return `ページを開いて確かめる（${NAP_FIELD_LABELS[field]}が別の表記で書かれているか、載っていない）`;
  }
}

function detailOf(f: FieldCheck): string {
  const found = f.found ? `書かれている値: ${f.found}` : "書かれていません";
  const base = `${found} → 正: ${f.expected}`;
  return f.note ? `${base}（${f.note}）` : base;
}

/** 「直すべき箇所」を作る */
export function buildIssues(sources: readonly NapSource[]): NapIssue[] {
  const issues: NapIssue[] = [];
  for (const s of sources) {
    if (s.error) {
      issues.push({
        severity: "warn",
        sourceKind: s.kind,
        source: s.label,
        url: s.url,
        field: null,
        title: `${s.label}を確認できませんでした`,
        detail: s.error,
        action: s.kind === "site_page" || s.kind === "site_jsonld" ? "URL が正しいか、ページが公開されているかを確かめて、もう一度実行する" : "ページを開いて、店名・住所・電話番号が正の値と同じかを目で確かめる",
      });
      continue;
    }
    for (const f of s.fields) {
      if (f.status === "mismatch") {
        issues.push({ severity: "fail", sourceKind: s.kind, source: s.label, url: s.url, field: f.field, title: `${s.label}の${NAP_FIELD_LABELS[f.field]}が違います`, detail: detailOf(f), action: fixAction(s.kind, f.field) });
      } else if (f.status === "missing") {
        // ウェブで見つけたページに自社サイトのリンクが無いのは珍しくない（ディレクトリはリンクを載せないことが多い）ので出さない
        if (s.kind === "web" && f.field === "website") continue;
        issues.push({ severity: "warn", sourceKind: s.kind, source: s.label, url: s.url, field: f.field, title: `${s.label}に${NAP_FIELD_LABELS[f.field]}が書かれていません`, detail: detailOf(f), action: addAction(s.kind, f.field) });
      } else if (f.status === "match" && f.note && s.kind !== "site_page") {
        // 一致だが注意（建物名が抜けている・URL のページが違う）。自社ページの建物名の省略は珍しくないので出さない
        issues.push({ severity: "warn", sourceKind: s.kind, source: s.label, url: s.url, field: f.field, title: `${s.label}の${NAP_FIELD_LABELS[f.field]}は一致（要確認）`, detail: detailOf(f), action: f.field === "address" ? "建物名・階まで正の値と同じにそろえる" : "正の値と同じ URL にそろえる" });
      }
    }
  }
  return issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "fail" ? -1 : 1;
    return KIND_ORDER[a.sourceKind] - KIND_ORDER[b.sourceKind];
  });
}

export function summarize(sources: readonly NapSource[]): NapSummary {
  const checked = sources.filter((s) => !s.error);
  const fields = checked.flatMap((s) => s.fields);
  return {
    sources: checked.length,
    match: fields.filter((f) => f.status === "match").length,
    mismatch: fields.filter((f) => f.status === "mismatch").length,
    missing: fields.filter((f) => f.status === "missing").length,
  };
}

/** サイトに貼る JSON-LD。自社サイトを見ていない（URL 無し）なら null。構造化データが正しく揃っていれば null */
export function buildJsonLdSuggestion(input: NapInput, sources: readonly NapSource[]): string | null {
  if (!input.website.trim()) return null;
  const siteChecked = sources.some((s) => (s.kind === "site_page" || s.kind === "site_jsonld") && !s.error);
  if (!siteChecked) return null;
  const jsonLd = sources.filter((s) => s.kind === "site_jsonld" && !s.error);
  const allGood = jsonLd.length > 0 && jsonLd.every((s) => s.fields.every((f) => f.status === "match" || f.status === "skipped"));
  if (allGood) return null;
  const profile = { ...emptyProfile(), name: input.name.trim(), address: input.address.trim(), phone: input.phone.trim(), website: input.website.trim() };
  const postal = /〒?\s*(\d{3}-?\d{4})/.exec(input.address.normalize("NFKC"));
  if (postal) {
    profile.postalCode = postal[1];
    profile.address = input.address.normalize("NFKC").replace(/〒?\s*\d{3}-?\d{4}\s*/, "").trim();
  }
  return jsonLdScript(profile);
}

/** 自動で読めない媒体（利用者に目で確かめてもらう）。常に添える */
export const MANUAL_CHECK_NOTE =
  "Apple マップ・Yahoo! マップ・Bing の掲載ページは本文が JavaScript で描かれるため自動では読めません。Apple Business Connect / Yahoo!プレイス / Bing Places の管理画面で、店名・住所・電話番号・サイト URL がここの「正」と同じかを目で確かめてください。";

export function buildNapResult(input: NapInput, sources: readonly NapSource[], options: { notes?: readonly string[]; checkedAt?: string } = {}): NapCheckResult {
  const list = [...sources].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const notes = [...(options.notes ?? []).filter((n) => n.trim()), MANUAL_CHECK_NOTE];
  return {
    input,
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    sources: list,
    issues: buildIssues(list),
    summary: summarize(list),
    jsonLdSuggestion: buildJsonLdSuggestion(input, list),
    notes,
  };
}
