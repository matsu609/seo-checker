/**
 * URL からページの用途を見分ける小さな道具。
 *
 * 採点の前に「この項目はこのページで問うべきか」を決めるために使う。
 * 実在しない問題を指摘すると、利用者は正しい設定をわざわざ壊してしまう
 * （例: サイト内検索の noindex を外す → 中身の薄いページが大量に登録される）。
 * 判定の根拠はこのファイルに集める。
 */

/** サイトのトップページか（/ と /index.* を同じとみなす） */
export function isHomePage(pageUrl: string): boolean {
  try {
    const { pathname } = new URL(pageUrl);
    return pathname === "/" || /^\/index\.[a-z0-9]+$/i.test(pathname);
  } catch {
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────
   noindex が「正しい設定」であるページ

   noindex は間違いとは限らない。サイト内検索の結果・買い物かご・ログイン後の
   画面などは、検索に載せない方が正しい。Google 自身も、サイト内検索の結果を
   検索結果に出さないよう求めている（検索結果の中の検索結果は利用者の役に立たず、
   URL の数だけ中身の薄いページが増えるため）。
   URL から用途が分かるページでは減点しない。
   ───────────────────────────────────────────────────────────── */

export type NoindexKind = "search" | "cart" | "account" | "thanks" | "duplicate";

export interface IntentionalNoindex {
  kind: NoindexKind;
  /** 画面に出す短い名前（例: 「サイト内検索の結果ページ」） */
  label: string;
  /** なぜ noindex のままでよいのか（そのまま備考欄に出す） */
  reason: string;
}

interface NoindexRule extends IntentionalNoindex {
  /** パスの 1 区切りがこれと一致したら該当（拡張子は落として比較する） */
  segments: readonly string[];
  /** クエリにこの名前があれば該当 */
  params?: readonly string[];
}

/**
 * 判定は「その名前が使われていたら、ほぼ確実にその用途」と言える語だけに絞る。
 * 誤って該当と判定すると本物の問題を見逃すため、迷う語（members・tag・category など）は
 * 入れない。なお、この判定を使うのは noindex が実際に設定されているときだけなので、
 * 「サイト側が意図して指定したものを咎めるかどうか」の判断にしかならない。
 */
const NOINDEX_RULES: readonly NoindexRule[] = [
  {
    kind: "search",
    label: "サイト内検索の結果ページ",
    reason:
      "サイト内検索の結果は、検索語の組み合わせの数だけ中身の薄いページが増えます。Google も検索結果ページを検索に登録しないよう求めており、noindex のままにしておくのが正しい設定です。",
    segments: ["search", "searches", "searchresult", "searchresults", "search-result", "search-results", "search_result", "search_results"],
    params: ["s", "q", "query", "keyword", "keywords", "search", "search_word", "searchword"],
  },
  {
    kind: "cart",
    label: "買い物かご・購入手続きのページ",
    reason:
      "買い物かごや購入手続きの画面は、利用者ごとに中身が変わり、検索から直接訪れても意味がありません。検索に登録しないのが通例です。",
    segments: ["cart", "carts", "checkout", "basket", "shopping-cart", "shoppingcart"],
  },
  {
    kind: "account",
    label: "ログイン・会員向けページ",
    reason:
      "ログイン画面や会員専用ページは、検索から集客するページではありません。noindex のままで問題ありません。",
    segments: [
      "login",
      "signin",
      "sign-in",
      "sign_in",
      "logout",
      "signout",
      "sign-out",
      "mypage",
      "my-page",
      "myaccount",
      "my-account",
      "account",
      "accounts",
      "dashboard",
      "admin",
      "wp-admin",
      "wp-login",
    ],
  },
  {
    kind: "thanks",
    label: "送信完了・確認ページ",
    reason:
      "問い合わせの確認・完了画面は、フォームを送った人だけが通る画面です。検索から直接訪れても意味が無いため、noindex のままにします。",
    segments: [
      "thanks",
      "thankyou",
      "thank-you",
      "thank_you",
      "complete",
      "completed",
      "completion",
      "confirm",
      "confirmation",
    ],
  },
  {
    kind: "duplicate",
    label: "印刷用・プレビュー用ページ",
    reason:
      "印刷用やプレビュー用の URL は、本来のページと同じ内容が別の URL で増えたものです。片方だけを検索に載せるため noindex にするのは正しい対処です。",
    segments: ["print", "preview"],
    params: ["print", "preview"],
  },
];

/**
 * noindex が設定されていても咎めるべきでないページか。
 * 該当しなければ null（= 公開したいページに noindex が付いている可能性がある）。
 */
export function intentionalNoindex(pageUrl: string): IntentionalNoindex | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const segments = url.pathname
    .toLowerCase()
    .split("/")
    .filter(Boolean)
    .map(stripExtension);
  const params = new Set([...url.searchParams.keys()].map((k) => k.toLowerCase()));

  for (const rule of NOINDEX_RULES) {
    const hit =
      segments.some((s) => rule.segments.includes(s)) ||
      (rule.params?.some((p) => params.has(p)) ?? false);
    if (hit) return { kind: rule.kind, label: rule.label, reason: rule.reason };
  }
  return null;
}

/** search.html / index.php のような拡張子を落とす（?, # は URL 側で除かれている） */
function stripExtension(segment: string): string {
  return segment.replace(/\.[a-z0-9]{1,5}$/i, "");
}
