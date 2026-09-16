/**
 * 一次判定の閾値（docs/dev/diagnosis-rules-spec.md §8）。
 *
 * これは「絶対的な良否基準」ではなく、ルールを発火させるかどうかの初期値。
 * BtoB / BtoC / EC / 採用 / メディアで適正値が違うので、サイトの目的ごとの
 * プリセットで上書きする（利用者の決定 2026-09-15 = 定数 + 業種プリセット。
 * 管理画面は運用してから）。
 */
import type { AnalysisGoal } from "@/lib/seo-analysis/sheet/types";

export interface Thresholds {
  /** これ未満の日数なら分析期間不足（D01） */
  minimumAnalysisDays: number;
  /** サイト全体でこれ未満の表示回数ならデータ量不足（D03） */
  minimumTotalImpressions: number;
  /** 個別ルールがこの表示回数未満の行を相手にしない（Q03 など） */
  minimumRuleImpressions: number;
  /** GA4 のセッションがこれ未満ならデータ量不足（D03） */
  minimumSessions: number;

  /** これ以上の増加率を「増加」とみなす */
  majorIncreaseRate: number;
  /** これ以下の増加率を「減少」とみなす */
  majorDecreaseRate: number;
  /** ±これ以内を「横ばい」とみなす */
  flatChangeRange: number;

  /** 平均掲載順位がこれ以上動いたら「変化」とみなす */
  significantPositionChange: number;
  /** 指名検索のクリック比率がこれ以上なら指名依存（Q01） */
  highBrandClickShare: number;
  /** クエリ取得率がこれ未満なら、比率を全体の値として扱わない（D04） */
  lowQueryCoverage: number;

  /** 1〜3 位で CTR がこれ未満なら低 CTR（Q04） */
  lowCtrTop3: number;
  /** 4〜10 位で CTR がこれ未満なら低 CTR（Q05） */
  lowCtrTop10: number;

  /** デバイス間の CTR 差がこの割合を超えたら差ありとみなす（V01） */
  deviceCtrGapRate: number;
  /** エンゲージメント率がこれ未満なら低い（GA4。G4 で使う） */
  lowEngagementRate: number;
  /** フォーム完了率がこれ未満なら低い（GA4。G4 で使う） */
  lowFormCompletionRate: number;

  /** 日別の値が中央値のこの倍数を超えたら異常値（D08 / T10） */
  abnormalDailyMultiplier: number;
  /** トップページのクリック比率がこれ以上なら集中（P01） */
  highHomepageClickShare: number;
  /** 対象外の国の表示比率がこれ以上なら多い（G03） */
  highForeignImpressionShare: number;

  /**
   * 訪問後の流れで「普通はこのくらい」の目安。
   *
   * 段階ごとに水準がまったく違う（訪問のうち問い合わせボタンを押すのは数 % が普通、
   * フォームを開いた人のうち送信するのは半分くらいが普通）ので、素の率を段階どうしで
   * 比べても意味がない。**目安に対してどれだけ足りないか**で「いちばん落ちている段階」を
   * 決めるために使う。絶対的な基準ではなく、業種で変わる。
   */
  funnelReference: {
    /** エンゲージメント率（訪問のうち、読まれた割合） */
    engagement: number;
    /** 訪問のうち、問い合わせ導線を押した割合 */
    cta: number;
    /** 押した人のうち、フォームを開いた割合 */
    formStart: number;
    /** 開いた人のうち、送信した割合 */
    formComplete: number;
  };
}

/** 仕様書 §8 の初期値 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  minimumAnalysisDays: 28,
  minimumTotalImpressions: 500,
  minimumRuleImpressions: 100,
  minimumSessions: 100,

  majorIncreaseRate: 0.2,
  majorDecreaseRate: -0.2,
  flatChangeRange: 0.05,

  significantPositionChange: 2.0,
  highBrandClickShare: 0.6,
  lowQueryCoverage: 0.7,

  lowCtrTop3: 0.03,
  lowCtrTop10: 0.01,

  deviceCtrGapRate: 0.4,
  lowEngagementRate: 0.4,
  lowFormCompletionRate: 0.3,

  abnormalDailyMultiplier: 3.0,
  highHomepageClickShare: 0.6,
  highForeignImpressionShare: 0.2,

  funnelReference: { engagement: 0.55, cta: 0.03, formStart: 0.5, formComplete: 0.4 },
};

/**
 * サイトの目的ごとの上書き。
 *
 * 根拠は「その業態で普通に起きること」をルール違反にしないこと。たとえば
 * BtoB（問い合わせ）は指名検索とトップページ集中が起きやすく、EC は商品ページが
 * 多いのでトップ集中はむしろ異常、メディアはクリック数が桁違いに多い。
 */
const PRESETS: Partial<Record<AnalysisGoal, Partial<Thresholds>>> = {
  // BtoB の問い合わせ。母数が小さく、指名検索・PC 偏重・週末の落ち込みが普通
  inquiry: {
    minimumTotalImpressions: 300,
    minimumRuleImpressions: 50,
    minimumSessions: 50,
    highBrandClickShare: 0.7,
    highHomepageClickShare: 0.7,
    // BtoB は検討期間が長く、1 回の訪問で問い合わせまで進みにくい
    funnelReference: { engagement: 0.55, cta: 0.02, formStart: 0.5, formComplete: 0.4 },
  },
  // EC。商品ページに分散するのが正常なので、トップ集中の基準を厳しく
  ec: {
    highHomepageClickShare: 0.4,
    highBrandClickShare: 0.5,
    lowEngagementRate: 0.45,
    funnelReference: { engagement: 0.6, cta: 0.05, formStart: 0.6, formComplete: 0.5 },
  },
  // 採用。母数が小さく、季節（採用時期）で大きく動く
  recruit: {
    minimumTotalImpressions: 200,
    minimumRuleImpressions: 50,
    minimumSessions: 50,
    highBrandClickShare: 0.75,
  },
  // 来店・予約。地名検索とモバイル偏重が正常
  visit: {
    minimumTotalImpressions: 300,
    minimumRuleImpressions: 50,
    minimumSessions: 50,
    highHomepageClickShare: 0.7,
  },
  // メディア。母数が大きいので最低値を上げ、記事依存を異常としない
  media: {
    minimumTotalImpressions: 2000,
    minimumRuleImpressions: 200,
    minimumSessions: 500,
    highBrandClickShare: 0.4,
    highHomepageClickShare: 0.3,
  },
};

/** 目的に合わせた閾値。上書きが無い目的は既定値のまま */
export function thresholdsForGoal(goal: AnalysisGoal, overrides: Partial<Thresholds> = {}): Thresholds {
  return { ...DEFAULT_THRESHOLDS, ...(PRESETS[goal] ?? {}), ...overrides };
}

/** 再現性のための版（実行記録に保存する。§20） */
export const THRESHOLDS_VERSION = 1;
