/**
 * 料金プランの定義。純粋なデータだけを置く（クライアントからも読める）。
 *
 * 3 段階にする（利用者の決定 2026-09-15）。1 つだけ並べると、お客様が比べる軸が
 * 「買うか買わないか」になる。3 つ並べると軸が「どれを買うか」に変わり、両端を避けて
 * 真ん中が選ばれやすくなる（極端回避性・松竹梅）。上に高い段を置くと、それが基準になって
 * 真ん中が手ごろに見える（アンカリング）。
 *
 *   free     … 未契約。ツールは使えない。クイック診断（/ と /meo）は、こちらが URL を渡した見込み客だけが使う公開ページ
 *   light    … 「ライト」月額 38,000 円。診断と計測だけ。AI が改修案・原稿を作るツールは付かない（= 意図的に物足りない段）
 *   standard … 「スタンダード」月額 50,000 円。本命。ライトのすべて + AI が改修案・原稿まで作る（= AI がコンサルする段）
 *   premium  … 「プレミアム（伴走）」月額 **150,000 円〜**。スタンダードのすべて + 人の作業（月 1 回の報告ミーティング・
 *              レポート代行・優先サポート）。松下の時間が要るので月 3 社まで。
 *              **金額は「〜」付きの下限だけを出し、実額はご要望をうかがってお見積りする**（利用者の決定 2026-09-16）。
 *              定額に見せると、重い案件を 150,000 円で受けざるを得なくなる。下限だけならアンカーとしては同じに働き、
 *              実際の受注では中身に合わせて積める。申し込みはお見積りの依頼から（Stripe には出さない）
 *
 * ライトとスタンダードの差は 12,000 円しかない。ライトを選ぶと 1 領域も欠けないかわりに
 * 「AI が作る 7 つのツール」がまるごと落ちる、という線の引き方にしてある。これは
 * registry.ts の `plan` フィールドの線（読む・測る = light / AI が作る = standard）と同じなので、
 * 「なぜここで切れているのか」をお客様に説明できる。恣意的な値付けにしないための決まりごと。
 *
 * 割引は Stripe のクーポンコードで行う（2026-09-13 の決定のまま）。ただし段を作った以上、
 * 「高いので下げてほしい」にはクーポンではなくライトを案内する。同じ商品を値引きすると定価が崩れる。
 */

export const PLAN_IDS = ["free", "light", "standard", "premium"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** 上位ほど大きい。プランの比較はこの順位で行う */
export const PLAN_RANK: Record<PlanId, number> = { free: 0, light: 1, standard: 2, premium: 3 };

/** 申し込みの方法。stripe = 画面から買える / contact = 問い合わせて枠を確認してから / none = 買うものではない */
export type PlanCheckout = "stripe" | "contact" | "none";

export interface Plan {
  id: PlanId;
  label: string;
  /** 月額（円・税込）。0 は無料。priceFrom が true なら「〜」付きの下限 */
  priceYen: number;
  /** 金額が下限で、実額は個別のお見積りになる（表示に「〜」を付ける） */
  priceFrom?: boolean;
  summary: string;
  highlights: readonly string[];
  /**
   * Clerk Billing（決済の実体は Stripe）のプラン識別子。
   *
   * 形式は `user:<スラッグ>`。Clerk ダッシュボードの「請求する」で作るプランの
   * スラッグを、この id と同じ文字列にしておくこと。
   * ずれると購入しても機能が開かない。plans.test.ts で形式を固定している。
   */
  clerkPlan: string;
  /** 料金表（/plans と紹介サイト）に出すか。false は内部の段階 */
  listed: boolean;
  /** 申し込みの方法 */
  checkout: PlanCheckout;
  /** 料金表で「いちばん選ばれています」を付ける本命。1 つだけ */
  recommended?: boolean;
  /** 枠の制限・お見積りの断り（料金表に小さく出す）。無ければ null */
  limitNote?: string;
  /** 申し込みボタンの代わりに出す問い合わせボタンの文言（checkout: "contact" のとき） */
  contactLabel?: string;
  /** サイドバーの鍵バッジなど、短く出すとき */
  shortLabel: string;
}

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    label: "未契約",
    priceYen: 0,
    summary: "まだお申し込みが済んでいない状態です。診断ツールは有料プランのお申し込み後にご利用いただけます。",
    highlights: [
      "ツールはご利用いただけません（料金プランの画面からお申し込みできます）",
      "初月無料。お申し込み時はカードのご登録だけで、無料期間中に解約すれば料金は発生しません",
    ],
    clerkPlan: "user:free",
    listed: false,
    checkout: "none",
    shortLabel: "無料",
  },
  {
    id: "light",
    label: "ライト",
    priceYen: 38_000,
    summary: "現状を正しく知るための段階。SEO・AIO・MEO の診断と計測がすべて使えます（AI が現状分析と改善案を書く精密診断も含みます）。AI が原稿や改修案そのものを作るツールは含みません。",
    highlights: [
      "SEO: 精密診断（サイト全体の診断 + AI の現状分析と改善案）・ページ診断・順位計測・検索パフォーマンス（推定。Google 連携なしで、その日から数字が出ます）・キーワード調査",
      "AIO: サイテーション（店名・電話・住所がウェブのどこに載っているか、食い違いが無いかのチェック）。基本情報掲載・llms.txt・AI 検索モニタリングはスタンダード",
      "MEO: Google マップの店舗診断、毎週の自動更新と履歴、競合 5 店舗との比較",
      "AI が原稿・改修案そのものを作るツール（7 つ）は含みません。精密診断で「どこをどう直すか」の方針までは出ますが、原稿や HTML の作成はご自身で行っていただく形になります",
      "Google Search Console・Google アナリティクスの設定は不要です（本サービスは使いません。検索の状況はドメインから推定します）",
      "初月無料。お申し込み時はカードのご登録だけで、無料期間中に解約すれば料金は発生しません",
    ],
    clerkPlan: "user:light",
    listed: true,
    checkout: "stripe",
    shortLabel: "有料",
  },
  {
    id: "standard",
    label: "スタンダード",
    priceYen: 50_000,
    summary: "ライトのすべて（精密診断を含む診断と計測）に加えて、AI が改修案・原稿・返信文まで作ります。「どう直すか」の方針で終わらず、直したものが出てくる段階です。",
    highlights: [
      "ライトのすべて（SEO・AIO・MEO の診断と計測）",
      "AIO の土台: 30 媒体への基本情報の一括掲載（NAP）と llms.txt 生成。AI 検索モニタリング（ChatGPT / Gemini / Google AI Overviews で自社が引用・参照される割合を毎週計測し、競合と比較）",
      "SEO: HP 改修提案（直すべき箇所を before → after の形で AI が作成）と AI ライティング・エディター",
      "MEO: 口コミ支援（店内 QR のアンケート）と、口コミへの AI 返信案",
      "ライトとの差は月 12,000 円。AI が作る 7 つのツールがすべて開きます",
      "初月無料。お申し込み時はカードのご登録だけで、無料期間中に解約すれば料金は発生しません",
    ],
    clerkPlan: "user:standard",
    listed: true,
    checkout: "stripe",
    recommended: true,
    shortLabel: "有料",
  },
  {
    id: "premium",
    label: "プレミアム（伴走）",
    priceYen: 150_000,
    priceFrom: true,
    summary: "スタンダードのすべてに加えて、人が伴走します。サイトの規模・店舗数・ご依頼の範囲をうかがったうえで、お見積りをお出しします。",
    highlights: [
      "スタンダードのすべて",
      "月 1 回の報告ミーティング（オンライン）",
      "月次レポートの作成と、改善作業の代行",
      "優先サポート（メール・チャット）",
      "店舗数・対策キーワード数の上限は、ご要望に合わせて設定します",
      "料金は 150,000 円からで、ご依頼の範囲によって変わります。まずはご相談ください",
      "松下が手を動かす枠のため、月 3 社までとさせていただきます",
    ],
    clerkPlan: "user:premium",
    listed: true,
    checkout: "contact",
    limitNote: "月 3 社まで・お見積り",
    contactLabel: "お見積りを依頼する",
    shortLabel: "有料",
  },
] as const;

/** 料金表に出すプラン（安い順。左から段を上げて読ませる。利用者の指示 2026-09-17） */
export const LISTED_PLANS: readonly Plan[] = PLANS.filter((p) => p.listed).sort((a, b) => PLAN_RANK[a.id] - PLAN_RANK[b.id]);

/** 画面から Stripe で買えるプラン（安い順） */
export const STRIPE_PLANS: readonly Plan[] = PLANS.filter((p) => p.checkout === "stripe").sort((a, b) => a.priceYen - b.priceYen);

/** 本命のプラン（料金表で強調し、クイック診断からの導線でも名前を出す） */
export const RECOMMENDED_PLAN: Plan = PLANS.find((p) => p.recommended) ?? PLANS[PLANS.length - 1];

export const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(
  PLANS.map((p) => [p.id, p]),
) as Record<PlanId, Plan>;

export function planLabel(id: PlanId): string {
  return PLAN_BY_ID[id].label;
}

/** 短い表示（鍵バッジ用。「無料」「有料」） */
export function planShortLabel(id: PlanId): string {
  return PLAN_BY_ID[id].shortLabel;
}

/** 価格の表示（「無料」「月額 50,000 円」「月額 150,000 円〜」） */
export function planPriceLabel(id: PlanId): string {
  const plan = PLAN_BY_ID[id];
  if (plan.priceYen === 0) return "無料";
  return `月額 ${plan.priceYen.toLocaleString("ja-JP")} 円${plan.priceFrom ? "〜" : ""}`;
}

/** current が required 以上のプランか */
export function planAllows(current: PlanId, required: PlanId): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[required];
}

/**
 * 旧プラン ID。値は今の ID に読み替える。
 *
 * `pro` は 2026-09-15 までの「オールインワン」＝ 全機能の段階で、いまの `standard` と中身が同じ。
 * Vercel の `DEFAULT_PLAN=pro` や Clerk の publicMetadata に残っていても、そのまま動くようにしておく。
 */
const LEGACY_PLAN_IDS: Record<string, PlanId> = { pro: "standard" };

/** 文字列を PlanId にする。知らない値は null（呼び出し側で既定に倒す） */
export function toPlanId(value: unknown): PlanId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^user:/, "").replace(/^org:/, "");
  if ((PLAN_IDS as readonly string[]).includes(normalized)) return normalized as PlanId;
  return LEGACY_PLAN_IDS[normalized] ?? null;
}

/**
 * required を満たすために必要な、いちばん安い「画面から買える」プラン。
 * プレミアムは問い合わせ枠なので、ここには出てこない。
 */
export function upgradeTarget(required: PlanId): Plan {
  return STRIPE_PLANS.find((p) => planAllows(p.id, required)) ?? PLAN_BY_ID[required];
}
