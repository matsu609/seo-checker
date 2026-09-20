/**
 * 法人番号システム Web-API の応答（XML）を読む。純粋関数だけ。
 *
 * ⚠ この環境からは実物の応答を取れない（ネットワークポリシーで 403）。
 * そこで**要素名で引く寛容な読み方**にしてある。名前が違っていた項目だけが空になり、
 * 全体が壊れたりズレたりしない（CSV の列順で読むとズレるのでそれは採らない）。
 * 実データで動かしたときに空の項目があれば、ここの要素名を直す。
 */
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { CORPORATE_KIND_LABELS, CORPORATE_NUMBER_RE } from "./constants";

export interface Corporation {
  corporateNumber: string;
  /** 登記上の商号・名称 */
  name: string;
  furigana: string;
  /** 区分コード（301 = 株式会社 など） */
  kind: string;
  kindLabel: string;
  /** "160-0022"。取れなければ空 */
  postCode: string;
  /** 都道府県 + 市区町村 + 丁目番地をつないだ 1 行 */
  address: string;
  prefectureName: string;
  cityName: string;
  streetNumber: string;
  /** 登記の変更日 / 法人番号の指定日 / 閉鎖日（解散・合併など） */
  changeDate: string | null;
  assignmentDate: string | null;
  closeDate: string | null;
  /** 最新の情報か（過去の履歴も返ることがある） */
  latest: boolean;
}

export interface CorporationsPage {
  corporations: Corporation[];
  /** API が返した件数（絞り込み前の総数） */
  count: number | null;
  lastUpdateDate: string | null;
}

/** "1600022" → "160-0022"。7 桁でなければそのまま */
export function formatPostCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 7 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : value.trim();
}

/** 都道府県 + 市区町村 + 丁目番地（国外の住所があればそれを優先） */
export function joinAddress(parts: { prefectureName: string; cityName: string; streetNumber: string; addressOutside: string }): string {
  const outside = parts.addressOutside.trim();
  if (outside) return outside;
  return `${parts.prefectureName}${parts.cityName}${parts.streetNumber}`.trim();
}

/** <corporation> 1 件を読む。法人番号が 13 桁でなければ null（壊れた行は捨てる） */
function parseCorporation($: cheerio.CheerioAPI, node: AnyNode): Corporation | null {
  const el = $(node);
  const text = (tag: string): string => el.children(tag).first().text().trim();
  const corporateNumber = text("corporateNumber");
  if (!CORPORATE_NUMBER_RE.test(corporateNumber)) return null;
  const kind = text("kind");
  const prefectureName = text("prefectureName");
  const cityName = text("cityName");
  const streetNumber = text("streetNumber");
  const closeDate = text("closeDate");
  return {
    corporateNumber,
    name: text("name"),
    furigana: text("furigana"),
    kind,
    kindLabel: CORPORATE_KIND_LABELS[kind] ?? "",
    postCode: formatPostCode(text("postCode")),
    address: joinAddress({ prefectureName, cityName, streetNumber, addressOutside: text("addressOutside") }),
    prefectureName,
    cityName,
    streetNumber,
    changeDate: text("changeDate") || null,
    assignmentDate: text("assignmentDate") || null,
    closeDate: closeDate || null,
    // latest は "1" が最新。要素が無ければ最新として扱う（履歴を返さない呼び方をしているため）
    latest: text("latest") !== "0",
  };
}

/** 壊れた応答でも落ちない（空の頁を返す） */
export function parseCorporations(xml: string): CorporationsPage {
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(xml, { xml: true });
  } catch {
    return { corporations: [], count: null, lastUpdateDate: null };
  }
  const corporations: Corporation[] = [];
  $("corporation").each((_, node) => {
    const parsed = parseCorporation($, node);
    if (parsed) corporations.push(parsed);
  });
  const countText = $("count").first().text().trim();
  const count = /^\d+$/.test(countText) ? Number(countText) : null;
  return { corporations, count, lastUpdateDate: $("lastUpdateDate").first().text().trim() || null };
}

/**
 * 画面に出す候補。閉鎖した法人と、最新でない履歴は後ろに回す
 * （消えた会社を先頭に出すと選び間違える）。
 */
export function sortCorporations(list: readonly Corporation[]): Corporation[] {
  const rank = (c: Corporation) => (c.closeDate ? 2 : c.latest ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ja"));
}
