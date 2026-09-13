/**
 * 無料診断から本サービス（詳細診断）への導線に出す文言。純粋なデータだけを置く。
 *
 * 無料診断（`/` と `/meo`）は本サービスから切り離した集客の入口で、ログイン無しで
 * 誰にでも渡せる URL にしてある（利用者の決定 2026-09-13）。無料で完結させないために、
 * 結果の直後に「無料で分かるのはここまで」「詳細診断で分かること」を必ず出す。
 *
 * 文言をここに集めるのは、無料 2 本（サイト / 店舗）と紹介サイトで言うことをずらさないため。
 * 機能の一覧そのものは registry.ts、価格は catalog.ts が持つ。ここは対比の言い方だけ。
 */

/** 無料診断の URL（ログイン不要。src/lib/auth/routes.ts の PUBLIC_PAGES と一致させる） */
export const FREE_PATHS = { site: "/", meo: "/meo" } as const;
export type FreeKind = keyof typeof FREE_PATHS;

/** 申し込みの入口（カード登録まで一本道にする。ここ以外の入口を増やさない） */
export const SIGN_UP_PATH = "/sign-up";
/** 料金の説明（申し込み前に読む） */
export const PLANS_PATH = "/plans";

export interface UpsellCopy {
  /** 結果の下に出す見出し */
  title: string;
  /** 無料の限界を 1 文で */
  limit: string;
  /** 詳細診断で増えること（3〜5 個。具体的な数字を入れる） */
  points: readonly string[];
  /** ボタンの文言 */
  cta: string;
}

export const UPSELL: Record<FreeKind, UpsellCopy> = {
  site: {
    title: "無料診断で分かるのは「今の状態」までです",
    limit: "無料診断は、公開されている HTML だけを見たルールベースの採点です。実際に何で検索されて何位なのか、AI 検索に引用されているのか、どこを直せば上がるのかまでは分かりません。",
    points: [
      "Search Console と GA4 の実データを取り込み、検索の流入と生成 AI 経由の流入を分けて計測",
      "狙うキーワードの順位を毎週自動で記録し、上下の理由まで追える",
      "ChatGPT などの生成 AI に自社が引用されているかを継続監視（LLMO モニタリング）",
      "AI が改修案を before → after の形で作成。そのまま原稿・llms.txt まで出力",
    ],
    cta: "初月無料で詳細診断をはじめる",
  },
  meo: {
    title: "無料診断で分かるのは「今の状態」までです",
    limit: "無料診断は、Google マップの公開情報 1 店舗ぶんを 1 回だけ採点したものです。競合と比べて何が足りないのか、直したあと順位や流入がどう動いたのかまでは分かりません。",
    points: [
      "採点は 21 項目から 28 項目へ（属性・オーナー写真・写真の解像度・口コミのキーワード・Google の警告）",
      "競合 5 店舗との比較表と、AI による総評",
      "毎週月曜に自動で取り直して推移を記録。直した効果が数字で残る",
      "口コミ支援（店内 QR のアンケートと AI の返信下書き）と、26 媒体への基本情報の一括掲載",
    ],
    cta: "初月無料で詳細診断をはじめる",
  },
};

/** 見込み客に渡す共有リンク（管理画面で案内する用）。origin は末尾のスラッシュを落として渡す */
export function freeShareUrl(origin: string, kind: FreeKind): string {
  const base = origin.replace(/\/+$/, "");
  const path = FREE_PATHS[kind];
  return path === "/" ? `${base}/` : `${base}${path}`;
}
