/**
 * 掲載（サイテーション）の「一括登録」の中身。クライアントでも読める純粋な関数だけを置く。
 *
 * 媒体ごとの `integration`（media.ts）で、1 回の実行が何をするかが決まる:
 *   api     … サーバーが公式 API に送る（現状 Google ビジネス プロフィールだけ）
 *   file    … 公式の一括入稿に貼るデータ（CSV）をここで組み立てる
 *   manual  … 登録画面の URL と貼り付け用の基本情報を出す
 *   monitor … こちらからは登録できない。元の媒体に載せて反映を待つ
 *
 * 約束（利用者の決定 2026-09-19）:
 *   - ブラウザ自動化でフォームに代理入力しない（各媒体の規約違反・アカウント停止のもと）
 *   - お客様の ID / パスワードは預からない。API は本人が接続したアカウントの権限で送る
 *   - 送れなかった媒体を「送った」と書かない。理由をそのまま画面に出す
 */
import { LISTING_MEDIA, mediaById, tierOf, type ListingMedia, type MediaIntegration } from "./media";
import { parseHoursLine, stateOf, type ListingProfile, type ListingStates } from "./profile";

/** 一括登録に最低限そろっていないといけない項目 */
export const REQUIRED_FIELDS: readonly { key: "name" | "address" | "phone"; label: string }[] = [
  { key: "name", label: "店名" },
  { key: "address", label: "住所" },
  { key: "phone", label: "電話番号" },
];

/** 足りない必須項目のラベル（空配列なら実行できる） */
export function missingRequired(profile: ListingProfile): string[] {
  return REQUIRED_FIELDS.filter((f) => !profile[f.key].trim()).map((f) => f.label);
}

/** どこまでを一括登録の対象にするか */
export interface PublishScope {
  /** 明示した媒体だけに絞る（渡したときは tier を見ない。上級の媒体も名指しなら送る） */
  mediaIds?: readonly string[];
  /** "core" = お客様の画面に出す 7 媒体だけ（既定）。"all" = 上級も含める */
  tier?: "core" | "all";
}

/**
 * 一括登録の対象にする媒体。
 * 「対象外」と「掲載済み」は外す（もう一度送らない）。
 *
 * **既定は core だけ**（利用者の指示 2026-09-19「手順が多くて顧客にやらせるには無理がある」）。
 * 30 媒体を既定にすると、お客様の画面に 27 件の手作業が並ぶ。上級は明示的に選んだときだけ。
 */
export function publishTargets(states: ListingStates, scope: PublishScope = {}): ListingMedia[] {
  const only = scope.mediaIds && scope.mediaIds.length > 0 ? new Set(scope.mediaIds) : null;
  const coreOnly = !only && (scope.tier ?? "core") === "core";
  return LISTING_MEDIA.filter((m) => {
    if (only && !only.has(m.id)) return false;
    if (coreOnly && tierOf(m) !== "core") return false;
    const s = stateOf(states, m.id).status;
    return s !== "skip" && s !== "live";
  });
}

export type PublishOutcome =
  /** 公式 API に送れた（掲載までは媒体の審査を待つ） */
  | "sent"
  /** 入稿ファイルを作った。媒体の画面からアップロードする */
  | "file"
  /** 画面で入力する。登録画面の URL と手順を出した */
  | "manual"
  /** こちらから登録できない。元の媒体の反映を待つ */
  | "monitor"
  /** 送ろうとして失敗した（理由つき） */
  | "failed";

export interface PublishResult {
  mediaId: string;
  mediaName: string;
  integration: MediaIntegration;
  outcome: PublishOutcome;
  /** 画面にそのまま出す 1 文 */
  message: string;
  /** 進むべき画面（manual / file / monitor） */
  url?: string;
  /** file のとき、下の files のどれか */
  fileId?: string;
}

export interface PublishFile {
  id: string;
  /** 画面に出す名前 */
  label: string;
  filename: string;
  /** 使い方（1〜2 文） */
  howTo: string;
  content: string;
}

/** 一括登録のあと、状況を「申請中」に進める媒体（API で送れたものだけ） */
export function statesAfterPublish(states: ListingStates, results: readonly PublishResult[], at: Date): ListingStates {
  const next: ListingStates = { ...states };
  for (const r of results) {
    if (r.outcome !== "sent") continue;
    next[r.mediaId] = { ...stateOf(states, r.mediaId), status: "submitted", updatedAt: at.toISOString() };
  }
  return next;
}

/* ───────────── CSV ───────────── */

/** カンマ・引用符・改行を含む値を CSV の 1 セルにする */
export function csvCell(value: string): string {
  const v = value.replace(/\r?\n/g, " ").trim();
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvLines(rows: readonly (readonly string[])[]): string {
  // Excel が UTF-8 と分かるよう BOM を付ける（日本語の媒体のシートに貼るため）
  return `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** 「月曜日: 10:00〜19:00」の並び → 1 行の営業時間（入稿シート用） */
export function hoursOneLine(profile: ListingProfile): string {
  const specs = profile.hours.split(/\r?\n/).map(parseHoursLine).filter((x) => x !== null);
  const DAY_JA: Record<string, string> = { Monday: "月", Tuesday: "火", Wednesday: "水", Thursday: "木", Friday: "金", Saturday: "土", Sunday: "日" };
  return specs.map((s) => `${DAY_JA[s.dayOfWeek] ?? s.dayOfWeek} ${s.opens}-${s.closes}`).join(" / ");
}

/**
 * Yahoo!プレイスの一括登録シートに貼るデータ。
 * 列の名前と並びは Yahoo! 側のテンプレートが正なので、画面では「公式テンプレートに貼る」と案内する。
 */
export function yahooPlaceCsv(profile: ListingProfile): string {
  const header = ["店舗名", "店舗名かな", "郵便番号", "住所", "電話番号", "業種", "URL", "営業時間", "紹介文"];
  const row = [
    profile.name,
    profile.nameKana,
    profile.postalCode,
    profile.address,
    profile.phone,
    profile.category,
    profile.website,
    hoursOneLine(profile),
    profile.longDescription || profile.shortDescription,
  ];
  return csvLines([header, row]);
}

/** Bing Places の一括インポート（Bulk upload）に貼るデータ */
export function bingPlacesCsv(profile: ListingProfile): string {
  const header = [
    "Store ID", "Business name", "Address line 1", "City", "State", "Zip", "Country",
    "Phone", "Business email", "Website", "Categories", "Business description", "Hours of operation",
  ];
  const row = [
    "1",
    profile.name,
    profile.address,
    "",
    "",
    profile.postalCode,
    "JP",
    profile.phone,
    profile.email,
    profile.website,
    profile.category,
    profile.longDescription || profile.shortDescription,
    hoursOneLine(profile),
  ];
  return csvLines([header, row]);
}

const FILE_BUILDERS: Record<string, { label: string; filename: string; howTo: string; build: (p: ListingProfile) => string }> = {
  YAHOO_PLACE: {
    label: "Yahoo!プレイス 入稿データ",
    filename: "yahoo-place.csv",
    howTo: "Yahoo!プレイスの管理画面から一括登録のテンプレートをダウンロードし、この内容を列に合わせて貼り付けてアップロードしてください。",
    build: yahooPlaceCsv,
  },
  BING: {
    label: "Bing Places 入稿データ",
    filename: "bing-places.csv",
    howTo: "Bing Places の管理画面「Bulk upload」からテンプレートをダウンロードし、この内容を列に合わせて貼り付けてアップロードしてください。Google ビジネス プロフィールからの取り込みでも構いません。",
    build: bingPlacesCsv,
  },
};

/** file の媒体ぶんの入稿ファイル（作れないものは飛ばす） */
export function buildFiles(profile: ListingProfile, targets: readonly ListingMedia[]): PublishFile[] {
  const out: PublishFile[] = [];
  for (const m of targets) {
    if (m.integration !== "file") continue;
    const b = FILE_BUILDERS[m.id];
    if (!b) continue;
    out.push({ id: m.id, label: b.label, filename: b.filename, howTo: b.howTo, content: b.build(profile) });
  }
  return out;
}

/**
 * API 以外の媒体の結果（サーバーでも画面でも同じ文面になるよう純粋関数にする）。
 * API の媒体はサーバーが実際に送った結果で埋めるので、ここでは作らない。
 */
export function resultForMedia(media: ListingMedia): PublishResult | null {
  if (media.integration === "api") return null;
  if (media.integration === "file") {
    const has = Boolean(FILE_BUILDERS[media.id]);
    return {
      mediaId: media.id,
      mediaName: media.name,
      integration: "file",
      outcome: has ? "file" : "manual",
      message: has ? "入稿データを作りました。媒体の管理画面からアップロードしてください。" : media.howTo,
      url: media.url,
      fileId: has ? media.id : undefined,
    };
  }
  if (media.integration === "manual") {
    return { mediaId: media.id, mediaName: media.name, integration: "manual", outcome: "manual", message: media.howTo, url: media.url };
  }
  const from = (media.fedBy ?? []).map((id) => mediaById(id)?.name ?? id);
  return {
    mediaId: media.id,
    mediaName: media.name,
    integration: "monitor",
    outcome: "monitor",
    message: from.length > 0 ? `${from.join("・")}に載せると自動で反映されます。反映を見て状況を控えてください。` : media.howTo,
    url: media.url,
  };
}

/** 結果の集計（画面の見出しに出す） */
export function summarizeResults(results: readonly PublishResult[]): Record<PublishOutcome, number> {
  const out: Record<PublishOutcome, number> = { sent: 0, file: 0, manual: 0, monitor: 0, failed: 0 };
  for (const r of results) out[r.outcome] += 1;
  return out;
}
