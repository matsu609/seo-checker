/**
 * 検索結果のホスト名から「どんなサイトか」を引くための一覧。クライアントでも読める純粋なデータ。
 *
 * ここに無いサイトは「その他」。基本情報掲載の媒体（mediaId）と結びつくものは、
 * 主要媒体の掲載状況（見つかった / 見つからない）にも使う。
 * 上から順に当てるので、同じホストで条件が違うものは具体的な方を先に書く。
 */
import type { CitationSourceKind } from "./types";

export interface KnownSource {
  /** ホスト名の末尾一致（"tabelog.com" は "s.tabelog.com" にも当たる。www. は先に落とす） */
  host: string;
  label: string;
  kind: Exclude<CitationSourceKind, "own" | "other">;
  /** 基本情報掲載の媒体 id（src/lib/listings/media.ts）。無ければ省略 */
  mediaId?: string;
  /** URL のパスがこれで始まるときだけ当てる（google.com の /maps など） */
  pathPrefix?: string;
}

const s = (source: KnownSource): KnownSource => source;

export const KNOWN_SOURCES: readonly KnownSource[] = [
  // ── 基本情報掲載の媒体 ──
  s({ host: "maps.google.com", label: "Google マップ", kind: "map", mediaId: "GOOGLE_MAPS" }),
  s({ host: "maps.app.goo.gl", label: "Google マップ", kind: "map", mediaId: "GOOGLE_MAPS" }),
  s({ host: "google.com", pathPrefix: "/maps", label: "Google マップ", kind: "map", mediaId: "GOOGLE_MAPS" }),
  s({ host: "google.co.jp", pathPrefix: "/maps", label: "Google マップ", kind: "map", mediaId: "GOOGLE_MAPS" }),
  s({ host: "maps.apple.com", label: "Apple マップ", kind: "map", mediaId: "APPLE_MAPS" }),
  s({ host: "bing.com", pathPrefix: "/maps", label: "Bing マップ", kind: "map", mediaId: "BING" }),
  s({ host: "loco.yahoo.co.jp", label: "Yahoo!ロコ（Yahoo!プレイス）", kind: "directory", mediaId: "YAHOO_PLACE" }),
  s({ host: "map.yahoo.co.jp", label: "Yahoo!マップ", kind: "map", mediaId: "YAHOO_PLACE" }),
  s({ host: "foursquare.com", label: "Foursquare", kind: "directory", mediaId: "FOURSQUARE" }),
  s({ host: "facebook.com", label: "Facebook", kind: "sns", mediaId: "FACEBOOK" }),
  s({ host: "instagram.com", label: "Instagram", kind: "sns", mediaId: "FACEBOOK" }),
  s({ host: "yelp.com", label: "Yelp", kind: "review", mediaId: "YELP" }),
  s({ host: "yelp.co.jp", label: "Yelp", kind: "review", mediaId: "YELP" }),
  s({ host: "hotfrog.jp", label: "Hotfrog", kind: "directory", mediaId: "HOTFROG" }),
  s({ host: "hotfrog.com", label: "Hotfrog", kind: "directory", mediaId: "HOTFROG" }),
  s({ host: "showmelocal.com", label: "Showmelocal", kind: "directory", mediaId: "SHOWMELOCAL" }),
  s({ host: "tupalo.com", label: "Tupalo", kind: "directory", mediaId: "TUPALO" }),
  s({ host: "iglobal.co", label: "iGlobal", kind: "directory", mediaId: "I_GLOBAL" }),
  s({ host: "openstreetmap.org", label: "OpenStreetMap", kind: "map", mediaId: "OSM" }),
  s({ host: "wego.here.com", label: "HERE WeGo", kind: "map", mediaId: "NOKIA_HERE" }),
  s({ host: "waze.com", label: "Waze", kind: "map", mediaId: "WAZE" }),
  s({ host: "tomtom.com", label: "TomTom", kind: "map", mediaId: "TOMTOM" }),
  s({ host: "petalmaps.com", label: "Petal マップ", kind: "map", mediaId: "HUAWEI" }),
  // ── 日本の地図・ディレクトリ・予約 ──
  s({ host: "mapion.co.jp", label: "Mapion", kind: "map" }),
  s({ host: "navitime.co.jp", label: "NAVITIME", kind: "map" }),
  s({ host: "its-mo.com", label: "いつもNAVI", kind: "map" }),
  s({ host: "mapfan.com", label: "MapFan", kind: "map" }),
  s({ host: "itp.ne.jp", label: "iタウンページ", kind: "directory" }),
  s({ host: "gnavi.co.jp", label: "ぐるなび", kind: "directory" }),
  s({ host: "hotpepper.jp", label: "ホットペッパー", kind: "directory" }),
  s({ host: "jalan.net", label: "じゃらん", kind: "directory" }),
  s({ host: "ikyu.com", label: "一休", kind: "directory" }),
  s({ host: "rakuten.co.jp", label: "楽天", kind: "directory" }),
  s({ host: "epark.jp", label: "EPARK", kind: "directory" }),
  s({ host: "minimo.jp", label: "minimo", kind: "directory" }),
  s({ host: "byoinnavi.jp", label: "病院なび", kind: "directory" }),
  s({ host: "suumo.jp", label: "SUUMO", kind: "directory" }),
  s({ host: "homes.co.jp", label: "LIFULL HOME'S", kind: "directory" }),
  // ── 口コミ ──
  s({ host: "tabelog.com", label: "食べログ", kind: "review" }),
  s({ host: "retty.me", label: "Retty", kind: "review" }),
  s({ host: "ekiten.jp", label: "エキテン", kind: "review" }),
  s({ host: "tripadvisor.com", label: "トリップアドバイザー", kind: "review" }),
  s({ host: "tripadvisor.jp", label: "トリップアドバイザー", kind: "review" }),
  s({ host: "caloo.jp", label: "Caloo", kind: "review" }),
  s({ host: "kakaku.com", label: "価格.com", kind: "review" }),
  // ── SNS・動画 ──
  s({ host: "x.com", label: "X（Twitter）", kind: "sns" }),
  s({ host: "twitter.com", label: "X（Twitter）", kind: "sns" }),
  s({ host: "tiktok.com", label: "TikTok", kind: "sns" }),
  s({ host: "youtube.com", label: "YouTube", kind: "sns" }),
  s({ host: "line.me", label: "LINE", kind: "sns" }),
  // ── メディア・ブログ ──
  s({ host: "prtimes.jp", label: "PR TIMES", kind: "media" }),
  s({ host: "wikipedia.org", label: "Wikipedia", kind: "media" }),
  s({ host: "news.yahoo.co.jp", label: "Yahoo!ニュース", kind: "media" }),
  s({ host: "note.com", label: "note", kind: "media" }),
  s({ host: "ameblo.jp", label: "アメブロ", kind: "media" }),
];

/**
 * 通常の検索結果に出てくる媒体だけを「主要媒体の掲載状況」に数える。
 * 地図アプリ（Google / Apple / Bing / HERE / TomTom / Waze / OSM / Petal）は登録していても
 * 検索結果にほとんど出ないので、ここで「見つからない」と出すと誤解を招く。掲載状況は基本情報掲載で管理する。
 */
export const SEARCHABLE_MEDIA_IDS: readonly string[] = ["YAHOO_PLACE", "FOURSQUARE", "FACEBOOK", "YELP", "HOTFROG", "SHOWMELOCAL", "TUPALO", "I_GLOBAL"];

/** ホスト名（www. 抜き）とパスから、分かっている媒体を引く。無ければ null */
export function findKnownSource(host: string, path: string): KnownSource | null {
  for (const source of KNOWN_SOURCES) {
    if (host !== source.host && !host.endsWith(`.${source.host}`)) continue;
    if (source.pathPrefix && !path.startsWith(source.pathPrefix)) continue;
    return source;
  }
  return null;
}
