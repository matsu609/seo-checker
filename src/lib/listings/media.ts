/**
 * 基本情報掲載（NAP 一括登録）の配信先の一覧。クライアントでも読める純粋なデータ。
 *
 * 店舗の基本情報（店名・住所・電話・サイト・営業時間 = NAP）を、地図アプリ・検索エンジン・
 * ディレクトリに揃えて載せるための「どこに・どうやって」の一覧。
 *
 * 媒体は 3 種類に分ける（無料で一斉登録できる API は存在しないため、正直に区別する）:
 *   self       … 無料で自分（オーナー）が登録できる。登録画面の URL と手順を持つ
 *   fed        … 他の媒体から自動で流れる（Siri ← Apple、カーナビ各社 ← HERE / TomTom など）。
 *                元の媒体に載せれば、数週間〜数か月で反映される。個別の登録はできない
 *   aggregator … 配信代行サービス（Uberall / Yext など。有料）経由でしか載せられない
 *
 * 利用者が見た配信代行の画面（Uberall 系の 26 媒体）をすべて含め、日本で効く媒体を足している。
 *
 * 種類（kind）とは別に、**こちらから登録をどう進められるか**（integration）を持つ。
 * 「一括登録」ボタンが何をできて何をできないかは、すべてこの値で決まる（利用者の指示 2026-09-19）:
 *   api     … 公式 API があり、ボタン 1 つで送れる（現状 Google ビジネス プロフィールだけ）
 *   file    … 公式の一括入稿（シート / CSV）がある。ファイルを作って渡し、媒体の画面からアップロードする
 *   manual  … 公式の窓口は画面入力だけ。基本情報のコピーと手順を出すところまで
 *   monitor … こちらから登録できない（自動で流れる媒体・配信代行専用）。元の媒体に載せて反映を見る
 *
 * 約束（利用者の決定 2026-09-19）: **ブラウザ自動化（RPA・ヘッドレス）でフォームに代理入力しない。**
 * 各媒体の利用規約が禁じており、アカウントの停止につながるため。お客様の ID / パスワードも預からない。
 */

export type MediaKind = "self" | "fed" | "aggregator";
export type MediaRegion = "jp" | "global" | "eu";
export type MediaIntegration = "api" | "file" | "manual" | "monitor";

export interface ListingMedia {
  /** 配信代行の画面と同じコード（例: APPLE_MAPS） */
  id: string;
  name: string;
  kind: MediaKind;
  region: MediaRegion;
  /** self: 登録（オーナー確認）画面。fed / aggregator: 媒体の紹介ページ */
  url: string;
  /** 何をするか（1〜2 文） */
  howTo: string;
  /** fed のとき、元になる媒体の id */
  fedBy?: readonly string[];
  /** 日本の店舗にとっての重要度（並び順にも使う）: 3 = 必須、2 = 推奨、1 = 余裕があれば */
  priority: 1 | 2 | 3;
  /** こちらから登録をどう進められるか（一括登録の動きが決まる） */
  integration: MediaIntegration;
  /** 規約・契約の但し書き（画面にそのまま出す。無ければ省く） */
  tosNote?: string;
}

export const MEDIA_INTEGRATION_LABELS: Record<MediaIntegration, string> = {
  api: "API で送れる",
  file: "入稿ファイルを作れる",
  manual: "画面で入力",
  monitor: "自動反映を待つ",
};

export const MEDIA_INTEGRATION_DESCRIPTIONS: Record<MediaIntegration, string> = {
  api: "「一括登録」ボタンでこのサービスから直接送れます。お客様の Google アカウントを接続し、その権限で送ります（当社が ID / パスワードを預かることはありません）。",
  file: "媒体が用意している一括入稿の形式（シート / CSV）でファイルを作ります。ダウンロードして、媒体の管理画面からアップロードしてください。",
  manual: "その媒体には登録 API も一括入稿もありません。基本情報のコピーと登録画面へのリンクを出すところまでです（規約でフォームの自動入力が禁じられているため、代理入力はしません）。",
  monitor: "個別の登録窓口がありません。元の媒体に載せたあと、反映されたかを見に行って状況を控えます。",
};

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  self: "自分で無料登録",
  fed: "自動で反映（元の媒体に載せる）",
  aggregator: "配信代行（有料）経由のみ",
};

export const MEDIA_KIND_DESCRIPTIONS: Record<MediaKind, string> = {
  self: "オーナー登録は無料です。下の「登録画面を開く」から進み、基本情報をコピーして貼り付けてください。",
  fed: "個別の登録窓口がありません。元の媒体（Apple / HERE / TomTom / OpenStreetMap など）に載せると、数週間〜数か月で自動的に流れます。",
  aggregator: "Uberall や Yext などの配信代行サービス（有料。店舗ごとに月額）を契約したときだけ載せられます。無料の登録窓口はありません。",
};

const m = (media: ListingMedia): ListingMedia => media;

export const LISTING_MEDIA: readonly ListingMedia[] = [
  // ── 日本の店舗にとっての必須（self） ──
  m({ id: "GOOGLE_MAPS", name: "Google マップ（ビジネス プロフィール）", kind: "self", region: "global", priority: 3, url: "https://business.google.com/", howTo: "ビジネス プロフィールでオーナー確認。住所・電話・営業時間・説明文をここと同じ内容にする（MEO の診断と連動）。", integration: "api", tosNote: "Google Business Profile API の利用申請（承認制）が要ります。承認されるまではボタンから送れません。" }),
  m({ id: "APPLE_MAPS", name: "Apple マップ（Apple Business Connect）", kind: "self", region: "global", priority: 3, url: "https://businessconnect.apple.com/", howTo: "Apple ID でサインイン →「場所を追加」→ 店舗を検索して申請。反映すると iPhone のマップと Siri に載る。", integration: "manual", tosNote: "一括連携（Apple Business Connect の API / フィード）は Apple との Third-Party Partner 契約が要ります。当社は未契約のため、画面から登録します。" }),
  m({ id: "BING", name: "Bing（Bing Places for Business）", kind: "self", region: "global", priority: 3, url: "https://www.bingplaces.com/", howTo: "Microsoft アカウントでサインイン。Google ビジネス プロフィールからの取り込み（インポート）が使えるので、先に Google を整える。Copilot / ChatGPT の検索結果にも影響する。", integration: "file", tosNote: "Bing Places は一括インポート用の CSV を受け付けます（Google ビジネス プロフィールからの取り込みも使えます）。" }),
  m({ id: "YAHOO_PLACE", name: "Yahoo!プレイス", kind: "self", region: "jp", priority: 3, url: "https://business-place.yahoo.co.jp/", howTo: "Yahoo! JAPAN ID で登録。Yahoo!検索・Yahoo!マップ・Yahoo!ロコに載る（日本では Google の次に大きい）。", integration: "file", tosNote: "Yahoo!プレイスの API 連携は LINEヤフーとの契約が要ります。当社は未契約のため、一括登録用のシートを作ります。" }),
  // ── 推奨（self） ──
  m({ id: "FOURSQUARE", name: "Foursquare", kind: "self", region: "global", priority: 2, url: "https://business.foursquare.com/", howTo: "「Claim your business」で店舗を検索して申請。Foursquare の場所データは多くのアプリ（Uber の一部、Snapchat、X など）に配信される。", integration: "manual" }),
  m({ id: "NOKIA_HERE", name: "HERE（HERE WeGo）", kind: "self", region: "global", priority: 2, url: "https://wego.here.com/", howTo: "HERE WeGo で店舗を検索 → 無ければ「場所を追加」、あれば「問題を報告」から情報の修正を送る。HERE の地図はカーナビ各社（Audi / BMW / メルセデス / VW / トヨタなど）に使われる。", integration: "manual" }),
  m({ id: "TOMTOM", name: "TomTom", kind: "self", region: "global", priority: 2, url: "https://www.tomtom.com/mapshare/tools/", howTo: "Map Share Reporter で「場所を追加 / 編集」。TomTom の地図はカーナビ各社と Uber の一部地域に使われる。", integration: "manual" }),
  m({ id: "WAZE", name: "Waze", kind: "self", region: "global", priority: 2, url: "https://www.waze.com/editor", howTo: "Waze Map Editor（Google アカウント）で場所を追加。Google ビジネス プロフィールと一致していれば承認されやすい。", integration: "manual" }),
  m({ id: "OSM", name: "OpenStreetMap", kind: "self", region: "global", priority: 2, url: "https://www.openstreetmap.org/", howTo: "アカウントを作って店舗の地点を編集（名前・住所・電話・営業時間・サイト）。Navmii・Petal マップ・Uber・多くのアプリの元データになる。", integration: "manual", tosNote: "OpenStreetMap への自動投稿はコミュニティのルール（自動編集の事前合意）が要ります。手で編集してください。" }),
  m({ id: "FACEBOOK", name: "Facebook ページ / Instagram", kind: "self", region: "global", priority: 2, url: "https://www.facebook.com/pages/create", howTo: "ページの「基本データ」に住所・電話・営業時間・サイトを入れる。Instagram のプロフィールもここと同じ店名・住所にする。", integration: "manual" }),
  m({ id: "YELP", name: "Yelp", kind: "self", region: "global", priority: 2, url: "https://biz.yelp.com/", howTo: "Yelp for Business で店舗を検索して申請。訪日客と Apple マップ（口コミ）に効く。", integration: "manual", tosNote: "Yelp のデータ連携は Yelp Knowledge / パートナー契約が要ります。当社は未契約のため、画面から申請します。" }),
  m({ id: "HUAWEI", name: "HUAWEI Petal マップ", kind: "self", region: "global", priority: 1, url: "https://www.petalmaps.com/", howTo: "Petal マップの店舗情報は主に OpenStreetMap と提携データから作られる。まず OpenStreetMap に載せ、Petal マップ上で「情報を修正」を送る。", integration: "manual" }),
  m({ id: "HOTFROG", name: "Hotfrog", kind: "self", region: "global", priority: 1, url: "https://www.hotfrog.jp/", howTo: "Hotfrog Japan に会社を無料登録（店名・住所・電話・サイト・説明文）。", integration: "manual" }),
  m({ id: "SHOWMELOCAL", name: "Showmelocal", kind: "self", region: "global", priority: 1, url: "https://www.showmelocal.com/", howTo: "「Add your business」から無料登録（英語）。", integration: "manual" }),
  m({ id: "TUPALO", name: "Tupalo", kind: "self", region: "eu", priority: 1, url: "https://www.tupalo.com/", howTo: "「Add a place」から無料登録（英語）。欧州中心のディレクトリ。", integration: "manual" }),
  m({ id: "I_GLOBAL", name: "iGlobal", kind: "self", region: "global", priority: 1, url: "https://www.iglobal.co/", howTo: "「Add your business」から無料登録（英語）。", integration: "manual" }),
  // ── 自動で流れる（fed） ──
  m({ id: "SIRI", name: "Siri", kind: "fed", region: "global", priority: 3, fedBy: ["APPLE_MAPS"], url: "https://businessconnect.apple.com/", howTo: "Apple Business Connect に載せると Siri の検索に反映される。", integration: "monitor" }),
  m({ id: "NAVMII", name: "Navmii", kind: "fed", region: "global", priority: 1, fedBy: ["OSM"], url: "https://www.navmii.com/", howTo: "OpenStreetMap のデータを使うナビアプリ。OSM に載せると反映される。", integration: "monitor" }),
  m({ id: "UBER", name: "Uber", kind: "fed", region: "global", priority: 1, fedBy: ["GOOGLE_MAPS", "FOURSQUARE", "TOMTOM"], url: "https://www.uber.com/", howTo: "配車アプリの目的地検索。Google マップ・Foursquare・TomTom などのデータを使うので、それらに載せる。", integration: "monitor" }),
  m({ id: "WHERE_TO", name: "Where To?", kind: "fed", region: "global", priority: 1, fedBy: ["APPLE_MAPS", "FOURSQUARE", "YELP"], url: "https://wheretoapp.com/", howTo: "iPhone / Apple Watch の周辺検索アプリ。Apple マップ・Foursquare・Yelp のデータを使う。", integration: "monitor" }),
  m({ id: "AUDI", name: "Audi（カーナビ）", kind: "fed", region: "global", priority: 1, fedBy: ["NOKIA_HERE"], url: "https://www.here.com/", howTo: "HERE の地図データを使う。HERE に載せると次の地図更新で反映される。", integration: "monitor" }),
  m({ id: "BMW", name: "BMW（カーナビ）", kind: "fed", region: "global", priority: 1, fedBy: ["NOKIA_HERE"], url: "https://www.here.com/", howTo: "HERE の地図データを使う。", integration: "monitor" }),
  m({ id: "MERCEDES", name: "メルセデス・ベンツ（カーナビ）", kind: "fed", region: "global", priority: 1, fedBy: ["NOKIA_HERE"], url: "https://www.here.com/", howTo: "HERE の地図データを使う。", integration: "monitor" }),
  m({ id: "VW", name: "フォルクスワーゲン（カーナビ）", kind: "fed", region: "global", priority: 1, fedBy: ["NOKIA_HERE"], url: "https://www.here.com/", howTo: "HERE の地図データを使う。", integration: "monitor" }),
  m({ id: "TOYOTA", name: "トヨタ（カーナビ）", kind: "fed", region: "global", priority: 1, fedBy: ["NOKIA_HERE", "TOMTOM"], url: "https://www.here.com/", howTo: "海外向けの地図データは HERE / TomTom。国内のトヨタ純正ナビは別系統（ゼンリン等）で、個別の登録窓口は無い。", integration: "monitor" }),
  m({ id: "FORD", name: "Ford（カーナビ）", kind: "fed", region: "global", priority: 1, fedBy: ["NOKIA_HERE", "TOMTOM"], url: "https://www.here.com/", howTo: "HERE / TomTom の地図データを使う。", integration: "monitor" }),
  m({ id: "GM", name: "GM（カーナビ）", kind: "fed", region: "global", priority: 1, fedBy: ["NOKIA_HERE"], url: "https://www.here.com/", howTo: "HERE の地図データを使う。", integration: "monitor" }),
  m({ id: "FIAT", name: "Fiat（カーナビ）", kind: "fed", region: "global", priority: 1, fedBy: ["TOMTOM"], url: "https://www.tomtom.com/", howTo: "TomTom の地図データを使う。", integration: "monitor" }),
  // ── 配信代行経由のみ（aggregator） ──
  m({ id: "ACOMPIO", name: "Acompio", kind: "aggregator", region: "eu", priority: 1, url: "https://www.acompio.com/", howTo: "欧州のディレクトリ。配信代行の契約先からだけ登録できる。", integration: "monitor", tosNote: "Uberall / Yext などの配信代行（有料）を契約したときだけ載せられます。当社は正規代理店ではありません。" }),
  m({ id: "STADTBRANCHENBUCH", name: "Opendi（Stadtbranchenbuch）", kind: "aggregator", region: "eu", priority: 1, url: "https://www.opendi.com/", howTo: "ドイツ語圏のディレクトリ。配信代行の契約先からだけ登録できる。", integration: "monitor", tosNote: "Uberall / Yext などの配信代行（有料）を契約したときだけ載せられます。当社は正規代理店ではありません。" }),
];

export const MEDIA_BY_ID: ReadonlyMap<string, ListingMedia> = new Map(LISTING_MEDIA.map((x) => [x.id, x]));

export function mediaById(id: string): ListingMedia | null {
  return MEDIA_BY_ID.get(id) ?? null;
}

/** 表示順: 種類（self → fed → aggregator）→ 重要度が高い順 → 名前 */
const KIND_ORDER: Record<MediaKind, number> = { self: 0, fed: 1, aggregator: 2 };
export function sortedMedia(list: readonly ListingMedia[] = LISTING_MEDIA): ListingMedia[] {
  return [...list].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.priority - a.priority || a.name.localeCompare(b.name, "ja"));
}

export function mediaOfKind(kind: MediaKind): ListingMedia[] {
  return sortedMedia(LISTING_MEDIA.filter((x) => x.kind === kind));
}

export function mediaOfIntegration(integration: MediaIntegration): ListingMedia[] {
  return sortedMedia(LISTING_MEDIA.filter((x) => x.integration === integration));
}

/** 「配信代行の画面」に出ていた 26 媒体のコード（すべてこの一覧に含めていることをテストで固定） */
export const AGGREGATOR_SCREEN_CODES: readonly string[] = [
  "ACOMPIO", "APPLE_MAPS", "AUDI", "BMW", "BING", "FIAT", "FORD", "FOURSQUARE", "GM", "GOOGLE_MAPS", "NOKIA_HERE", "HUAWEI", "HOTFROG",
  "MERCEDES", "NAVMII", "STADTBRANCHENBUCH", "SHOWMELOCAL", "SIRI", "TOMTOM", "TOYOTA", "TUPALO", "UBER", "VW", "WAZE", "WHERE_TO", "I_GLOBAL",
];
