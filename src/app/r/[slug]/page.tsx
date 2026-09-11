import type { Metadata } from "next";
import { SurveyPage } from "@/components/reviews/SurveyPage";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { getPublicForm, toPublicForm, type PublicReviewForm } from "@/lib/reviews/forms";

/**
 * 来店客向けアンケート（/r/<slug>?c=<QR のコード>）。ログイン不要（src/lib/auth/routes.ts の PUBLIC_PAGE_PREFIXES）。
 * サイドバーもトップバーも出さない（AppShell の isBare）。検索エンジンには載せない。
 * アンケートの定義はサーバーで読んで渡す（1 往復減らす）。以後の送信は /api/r/[slug]/*。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ご来店アンケート",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { c } = await searchParams;
  const code = typeof c === "string" && /^[a-z0-9]{4,8}$/.test(c) ? c : null;

  let form: PublicReviewForm | null = null;
  let error: string | null = null;
  if (!isSupabaseConfigured()) {
    error = "このアンケートは現在準備中です。";
  } else {
    try {
      const found = await getPublicForm(slug);
      form = found ? toPublicForm(found) : null;
      if (!form) error = "このアンケートは見つかりません（終了した可能性があります）。";
    } catch {
      error = "アンケートを読み込めませんでした。しばらくしてからもう一度お試しください。";
    }
  }
  return <SurveyPage slug={slug} code={code} form={form} error={error} />;
}
