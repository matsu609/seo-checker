import type { Metadata } from "next";
import { headers } from "next/headers";
import { SurveyPage } from "@/components/reviews/SurveyPage";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { findChannelByCode, getPublicForm, toPublicForm, type PublicReviewForm } from "@/lib/reviews/forms";
import { resolveSurveyLocale, surveyStrings, type SurveyLocale } from "@/lib/reviews/i18n";
import { translateForm } from "@/lib/reviews/translate";

/**
 * 来店客向けアンケート（/r/<slug>?c=<QR のコード>&lang=<言語>）。ログイン不要（src/lib/auth/routes.ts の PUBLIC_PAGE_PREFIXES）。
 * サイドバーもトップバーも出さない（AppShell の isBare）。検索エンジンには載せない。
 * アンケートの定義はサーバーで読んで渡す（1 往復減らす）。以後の送信は /api/r/[slug]/*。
 *
 * 言語は端末の設定（Accept-Language）で自動判定し、画面の切替（?lang=）で上書きできる（i18n.ts）。
 * 質問文と選択肢は translate.ts で訳す（テンプレートは静的な訳、店舗が書き換えた文言は AI 訳を保存して使い回す）。
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

async function localeOf(searchParams: Props["searchParams"]): Promise<SurveyLocale> {
  const { lang } = await searchParams;
  const h = await headers();
  return resolveSurveyLocale(lang, h.get("accept-language"));
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = await localeOf(searchParams);
  return { title: surveyStrings(locale).pageTitle, robots: { index: false, follow: false } };
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { c } = await searchParams;
  const code = typeof c === "string" && /^[a-z0-9]{4,8}$/.test(c) ? c : null;
  const locale = await localeOf(searchParams);
  const t = surveyStrings(locale);

  let form: PublicReviewForm | null = null;
  let error: string | null = null;
  if (!isSupabaseConfigured()) {
    error = t.preparing;
  } else {
    try {
      const found = await getPublicForm(slug);
      // QR に店舗が紐づいていれば、その店舗名で出す（投稿先も回答時にその店舗になる）
      const channel = found && code ? await findChannelByCode(found.id, code) : null;
      const translation = found ? await translateForm(found, locale) : {};
      form = found ? toPublicForm(found, channel, locale, translation) : null;
      if (!form) error = t.notFound;
    } catch {
      error = t.loadFailed;
    }
  }
  return <SurveyPage slug={slug} code={code} form={form} error={error} locale={locale} />;
}
