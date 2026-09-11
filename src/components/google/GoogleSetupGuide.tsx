"use client";

/**
 * Search Console / GA4 に「選べるものが 1 つも無い」ときの案内。
 *
 * このツールは読み取り専用の権限しか要求しないので、サイトの登録・所有権の確認・
 * GA4 の作成と計測タグの設置は代行できない。Google 側でやってもらうしかないため、
 * 「選べるサイトがありません」で終わらせず、どこで何をすれば良いかまで出す。
 *
 * Google 側で設定を済ませて戻ってきたときのために、取り直しのボタンも置く。
 */
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import type { GoogleService } from "@/lib/google/scopes";

interface Step {
  text: string;
  href?: string;
  linkLabel?: string;
}

interface Guide {
  title: string;
  lead: string;
  steps: Step[];
  note?: string;
}

const GUIDES: Record<Exclude<GoogleService, "business-profile">, Guide> = {
  "search-console": {
    title: "Search Console に、使えるサイトがありません",
    lead: "このツールは、接続した Google アカウントで所有権が確認済みのサイトだけを読み取れます。サイトの登録と所有権の確認は Google 側での作業になり、このツールからは代行できません。",
    steps: [
      {
        text: "別の Google アカウントで運用中なら、そのアカウントの Search Console で「設定 → ユーザーと権限」から、接続中のアカウントを「制限付き」で追加する",
        href: "https://search.google.com/search-console/users",
        linkLabel: "ユーザーと権限を開く",
      },
      {
        text: "まだ登録していないなら、Search Console でサイトを追加する",
        href: "https://search.google.com/search-console/welcome",
        linkLabel: "Search Console を開く",
      },
      {
        text: "所有権を確認する（DNS レコード、HTML ファイル、Google タグなど）",
        href: "https://support.google.com/webmasters/answer/9008080?hl=ja",
        linkLabel: "確認方法を見る",
      },
      { text: "この画面に戻って「一覧を取り直す」を押す" },
    ],
    note: "登録直後はデータが貯まっていないため、数日は数値が出ないことがあります。詳しい手順は下の「設定手順書」にあります。",
  },
  analytics: {
    title: "GA4 に、使えるプロパティがありません",
    lead: "接続した Google アカウントから見える GA4 プロパティが 1 つもありません。プロパティの作成と計測タグの設置は Google 側とサイト側での作業になり、このツールからは代行できません。",
    steps: [
      {
        text: "別の Google アカウントで運用中なら、そのアカウントの「管理 → プロパティのアクセス管理」から、接続中のアカウントを「閲覧者」で追加する",
        href: "https://support.google.com/analytics/answer/9305587?hl=ja",
        linkLabel: "権限の付け方を見る",
      },
      {
        text: "まだ無いなら、Google アナリティクスでプロパティを作る",
        href: "https://analytics.google.com/",
        linkLabel: "アナリティクスを開く",
      },
      {
        text: "サイトに計測タグを設置してデータ収集を始める",
        href: "https://support.google.com/analytics/answer/10110290?hl=ja",
        linkLabel: "設定方法を見る",
      },
      { text: "この画面に戻って「一覧を取り直す」を押す" },
    ],
    note: "タグを設置してから数値が出るまで 24〜48 時間かかります。詳しい手順は下の「設定手順書」にあります。",
  },
};

export function GoogleSetupGuide({
  service,
  onRefresh,
  refreshing = false,
}: {
  service: Exclude<GoogleService, "business-profile">;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const guide = GUIDES[service];
  return (
    <Callout tone="warn" title={guide.title}>
      <p>{guide.lead}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
        {guide.steps.map((step) => (
          <li key={step.text}>
            {step.text}
            {step.href && (
              <>
                {" "}
                <a
                  href={step.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap underline underline-offset-2 hover:no-underline"
                >
                  {step.linkLabel}
                  <span aria-hidden="true"> ↗</span>
                </a>
              </>
            )}
          </li>
        ))}
      </ol>
      {guide.note && <p className="mt-2 text-[13px]">{guide.note}</p>}
      <Button size="sm" variant="secondary" className="mt-3" onClick={onRefresh} loading={refreshing}>
        一覧を取り直す
      </Button>
    </Callout>
  );
}
