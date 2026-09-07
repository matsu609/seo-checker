/**
 * サイト診断の閾値。
 *
 * 1 箇所にまとめてあるのは、運用しながら調整するため（yoriai / User Insight の
 * 数値をそのまま採ったものと、日本語ページ向けに変えたものが混ざっている）。
 * ルールはこのオブジェクトだけを参照し、数値をコードに直接書かない。
 */
export const AUDIT_THRESHOLDS = {
  /** title の全角換算文字数 */
  titleMinWidth: 10,
  titleMaxWidth: 40,
  /** meta description の全角換算文字数 */
  descMinWidth: 50,
  descMaxWidth: 120,
  /** 本文が薄いと判断する文字数 */
  thinContentChars: 300,
  /** テキスト / HTML の比がこれ未満なら「本文が少ない」 */
  lowTextRatio: 0.1,
  /** 本文の重複と見なす一致率（0〜1） */
  duplicateContentRatio: 0.8,
  /** 入力 URL からのクリック数がこれを超えると深すぎる */
  maxDepth: 4,
  /** URL の長さ */
  maxUrlLength: 100,
  /** Content-Encoding を見る対象になる最小バイト数 */
  compressionMinBytes: 10 * 1024,
  /** HTML のバイト数がこれを超えると大きすぎる */
  maxPageBytes: 1024 * 1024,
  /** 取得時間（TTFB 相当）がこれを超えると遅い */
  slowTtfbMs: 800,
  /** 取得完了までがこれを超えると遅い */
  slowLoadMs: 3000,
} as const;

/** クロール後に追加で取得して確認する URL 数の上限（リンク切れ・canonical 先） */
export const MAX_PROBE_URLS = 80;
/** 取得時間を実測するページ数の上限 */
export const MAX_TIMED_PAGES = 10;
/** 検証・計測時の同時取得数 */
export const VERIFY_CONCURRENCY = 4;
/** 検証・計測 1 件あたりのタイムアウト */
export const VERIFY_TIMEOUT_MS = 8_000;
/** 1 ルール 1 ページあたり、詳細に載せる URL の最大数 */
export const MAX_DETAIL_ITEMS = 5;

/** HTML5 で廃止された（使うべきでない）タグ */
export const DEPRECATED_TAGS = [
  "font",
  "center",
  "marquee",
  "blink",
  "frame",
  "frameset",
  "applet",
  "big",
  "strike",
  "tt",
  "acronym",
  "basefont",
  "dir",
] as const;

/** 履歴として残す診断回数（オリジンごと） */
export const HISTORY_LIMIT = 5;
