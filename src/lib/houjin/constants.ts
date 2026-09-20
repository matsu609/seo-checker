/**
 * 法人番号（国税庁・法人番号システム）で、画面とサーバーの両方が使う定数。
 * client.ts はサーバー専用（アプリケーション ID を読む）なので、ここに分ける。
 *
 * 何に使うか（利用者の指示 2026-09-19 → 09-20）:
 *   1. 掲載の NAP の「正」を**登記の商号・本店所在地**と突き合わせる
 *      （Google マップの公開情報より信頼できる出典。表記ゆれを推測でなく登記で確定できる）
 *   2. 法人番号から**法人番号公表サイトと gBizINFO の URL**を作り、構造化データの sameAs に入れる
 *
 * 前提（重要）: **法人番号は法人にしか無い。**個人事業主（当社を含む）は使えない。
 *
 * ⚠ この環境は外向きの取得がネットワークポリシーで塞がれており（2026-09-20 に 403 を確認）、
 * 下の API とサイトの URL を**実物で検証できていない**。実データで最初に動かすときは、
 * 画面の「開いて確認」から各 URL を必ず目視で確かめること。差し替えが要るときはこのファイルだけを直す。
 */

/** 13 桁。先頭 1 桁は検査用数字 */
export const CORPORATE_NUMBER_LENGTH = 13;
export const CORPORATE_NUMBER_RE = /^\d{13}$/;

/** 1 回の検索で画面に出す上限（多すぎると選べない） */
export const SEARCH_LIMIT = 20;

/** 商号で検索するときの最小の長さ（1 文字だと候補が出すぎる） */
export const SEARCH_NAME_MIN = 2;
export const SEARCH_NAME_MAX = 100;
export const SEARCH_ADDRESS_MAX = 100;

/**
 * Web-API のベース URL（Ver.4）。**要検証。**
 * 変わっていたら環境変数 `HOUJIN_BANGOU_API_BASE` で上書きできる。
 */
export const API_BASE_DEFAULT = "https://api.houjin-bangou.nta.go.jp/4";

/**
 * 法人番号の検査用数字（先頭 1 桁）の計算。
 * 国税庁の仕様: 下 12 桁を右から数え、奇数位に 1、偶数位に 2 を掛けて合計し、9 で割った余りを 9 から引く。
 * 打ち間違いを手前で弾くために使う（API を無駄に呼ばない）。
 */
export function isValidCorporateNumber(value: string): boolean {
  if (!CORPORATE_NUMBER_RE.test(value)) return false;
  const digits = value.split("").map(Number);
  const check = digits[0]!;
  const body = digits.slice(1);
  let sum = 0;
  // body[11] が最下位。右から 1 始まりで数える
  for (let i = 0; i < body.length; i += 1) {
    const fromRight = body.length - i;
    sum += body[i]! * (fromRight % 2 === 1 ? 1 : 2);
  }
  return check === 9 - (sum % 9);
}

/**
 * 法人番号公表サイト（国税庁）の個別ページ。**URL の形は要検証。**
 * 検証できるまで、画面では「開いて確認」を促す。
 */
export function houjinBangouUrl(corporateNumber: string): string {
  return `https://www.houjin-bangou.nta.go.jp/henkorireki-johoto.html?selHouzinNo=${corporateNumber}`;
}

/** gBizINFO（経済産業省）の個別ページ。**URL の形は要検証。** */
export function gbizInfoUrl(corporateNumber: string): string {
  return `https://info.gbiz.go.jp/hojin/ichiran?hojinBangou=${corporateNumber}`;
}

/** sameAs に入れる公的な URL（法人番号があるときだけ） */
export function publicRegistryUrls(corporateNumber: string): { label: string; url: string }[] {
  if (!CORPORATE_NUMBER_RE.test(corporateNumber)) return [];
  return [
    { label: "法人番号公表サイト（国税庁）", url: houjinBangouUrl(corporateNumber) },
    { label: "gBizINFO（経済産業省）", url: gbizInfoUrl(corporateNumber) },
  ];
}

/** 登記の種類（API の `process` / `kind` に近い区分。画面に出すラベル） */
export const CORPORATE_KIND_LABELS: Record<string, string> = {
  "101": "国の機関",
  "201": "地方公共団体",
  "301": "株式会社",
  "302": "有限会社",
  "303": "合名会社",
  "304": "合資会社",
  "305": "合同会社",
  "399": "その他の設立登記法人",
  "401": "外国会社等",
  "499": "その他",
};
