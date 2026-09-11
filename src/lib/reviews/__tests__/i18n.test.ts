/**
 * 来店客向けアンケートの言語判定と辞書。
 * 端末の言語（Accept-Language）→ 対応言語、?lang= の上書き、テンプレートの静的な訳。
 */
import { describe, expect, it } from "vitest";
import {
  localeFromAcceptLanguage,
  localeFromParam,
  matchLocale,
  resolveSurveyLocale,
  staticTranslation,
  SURVEY_LOCALES,
  SURVEY_STRINGS,
  surveyStrings,
} from "../i18n";
import { QUESTION_TEMPLATES } from "../questions";

describe("言語の判定", () => {
  it("言語タグ → 対応言語（中国語は簡体 / 繁体を地域で分ける）", () => {
    expect(matchLocale("ja-JP")).toBe("ja");
    expect(matchLocale("en-US")).toBe("en");
    expect(matchLocale("ko-KR")).toBe("ko");
    expect(matchLocale("zh-CN")).toBe("zh-Hans");
    expect(matchLocale("zh")).toBe("zh-Hans");
    expect(matchLocale("zh-Hans-SG")).toBe("zh-Hans");
    expect(matchLocale("zh-TW")).toBe("zh-Hant");
    expect(matchLocale("zh-HK")).toBe("zh-Hant");
    expect(matchLocale("zh-Hant-MO")).toBe("zh-Hant");
    expect(matchLocale("fr-FR")).toBeNull();
    expect(matchLocale("")).toBeNull();
  });

  it("Accept-Language は q 値の高い順に見て、最初に対応する言語を返す", () => {
    expect(localeFromAcceptLanguage("zh-TW,zh;q=0.9,en;q=0.8")).toBe("zh-Hant");
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.5,ja;q=0.7")).toBe("ja");
    expect(localeFromAcceptLanguage("de;q=0.9, en-GB;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("*")).toBeNull();
    expect(localeFromAcceptLanguage("fr")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage("")).toBeNull();
  });

  it("?lang= が最優先、無ければ端末の言語、どちらも無ければ日本語", () => {
    expect(localeFromParam("en")).toBe("en");
    expect(localeFromParam("zh")).toBe("zh-Hans");
    expect(localeFromParam("xx")).toBeNull();
    expect(localeFromParam(["en"])).toBeNull();
    expect(resolveSurveyLocale("ko", "en-US")).toBe("ko");
    expect(resolveSurveyLocale(undefined, "en-US,en;q=0.9")).toBe("en");
    expect(resolveSurveyLocale("bad", "fr")).toBe("ja");
    expect(resolveSurveyLocale(undefined, undefined)).toBe("ja");
  });
});

describe("辞書", () => {
  it("すべての言語で同じキーが埋まっている", () => {
    const keys = Object.keys(SURVEY_STRINGS.ja).sort();
    for (const l of SURVEY_LOCALES) {
      expect(Object.keys(SURVEY_STRINGS[l]).sort()).toEqual(keys);
      const t = surveyStrings(l);
      expect(t.ratingLabels).toHaveLength(5);
      expect(t.errorRequired("X")).toContain("X");
      expect(t.errorHttp(500)).toContain("500");
      for (const [k, v] of Object.entries(t)) if (typeof v === "string") expect(v, `${l}.${k}`).not.toBe("");
    }
    expect(surveyStrings("en").postToGoogle).toBe("Post on Google Maps");
  });

  it("業種テンプレートの質問文・選択肢はすべて静的な訳を持つ（AI 不要）", () => {
    for (const tpl of QUESTION_TEMPLATES) {
      for (const q of tpl.questions) {
        for (const l of SURVEY_LOCALES) {
          expect(staticTranslation(q.label, l), `${l}: ${q.label}`).not.toBeNull();
          for (const o of q.options) expect(staticTranslation(o, l), `${l}: ${o}`).not.toBeNull();
        }
      }
    }
    expect(staticTranslation("ご来店アンケート", "ko")).toBe("방문 설문");
    expect(staticTranslation("味", "ja")).toBe("味");
    expect(staticTranslation("店長のおすすめは？", "en")).toBeNull();
  });
});
