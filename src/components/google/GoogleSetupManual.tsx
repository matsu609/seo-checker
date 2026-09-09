/**
 * 設定画面の「Google 連携」に常に置く手順書（折りたたみ）。
 *
 * このツールは読み取り専用の権限しか要求しないので、サイトの登録・所有権の確認・
 * GA4 の作成・閲覧権限の付与は、すべてお客様が Google 側で行う必要がある。
 * 実際には「別の Google アカウント（会社の共有アカウントや制作会社）で運用している」
 * ケースが多く、その場合は登録ではなく「接続したアカウントに権限を付ける」だけで済む。
 * GoogleSetupGuide（一覧が空のときの短い案内）とは別に、接続前から読める形で
 * 全体の流れを載せる。
 *
 * 文言だけの部品。状態は持たない。
 */

interface Step {
  text: string;
  href?: string;
  linkLabel?: string;
}

interface Section {
  heading: string;
  lead?: string;
  /** 見出し付きの手順の束。状況によって片方だけ読めばよいときに使う */
  groups: { title?: string; steps: Step[]; note?: string }[];
}

const SECTIONS: Section[] = [
  {
    heading: "1. Google アカウントを接続する",
    groups: [
      {
        steps: [
          {
            text: "この画面の「Google アカウントを接続する」を押します。ログインに Google を使った方は「接続し直す」を押してください。",
          },
          {
            text: "Google の許可画面で「Google アナリティクスのデータの参照」と「確認済みサイトの Search Console データの表示」の両方にチェックが入っていることを確認し、「続行」を押します。片方を外すと、その機能だけ使えません。",
          },
          {
            text: "「このアプリは Google で確認されていません」と表示された場合は「詳細」→「（アプリ名）に移動」で進めます。Google の審査手続き中に出る表示で、要求しているのは読み取りの権限だけです。",
          },
        ],
        note: "ログイン画面の「Google で続ける」だけでは、Search Console と GA4 の権限は付きません。必ずこの画面から接続してください。",
      },
    ],
  },
  {
    heading: "2. Search Console のサイトを見られるようにする",
    lead: "接続した Google アカウントで「所有権が確認済み」のサイトだけが選べます。状況に合うほうを読んでください。",
    groups: [
      {
        title: "別の Google アカウント（会社の共有アカウント、制作会社など）ですでに運用している場合",
        steps: [
          { text: "そのアカウントで Search Console を開き、対象のサイトを選びます。" },
          {
            text: "「設定」→「ユーザーと権限」→「ユーザーを追加」を開きます。",
            href: "https://search.google.com/search-console/users",
            linkLabel: "ユーザーと権限を開く",
          },
          {
            text: "この画面に「接続中」と表示されているメールアドレスを入力し、権限は「制限付き」で追加します（読み取りには十分です）。",
          },
          { text: "この画面に戻って「一覧を取り直す」を押します。" },
        ],
      },
      {
        title: "まだ Search Console に登録していない場合",
        steps: [
          {
            text: "接続したアカウントで Search Console を開き、プロパティを追加します。「ドメイン」タイプを選ぶと、www の有無や http / https の違いをまとめて 1 つで扱えます。",
            href: "https://search.google.com/search-console/welcome",
            linkLabel: "Search Console を開く",
          },
          {
            text: "所有権を確認します。ドメインの DNS 管理画面に TXT レコードを 1 件追加する方法が最も確実です。",
            href: "https://support.google.com/webmasters/answer/9008080?hl=ja",
            linkLabel: "確認方法を見る",
          },
          { text: "確認が通ったら、この画面に戻って「一覧を取り直す」を押します。" },
        ],
        note: "登録直後はデータが貯まっていないため、数値が出るまで数日かかります。",
      },
    ],
  },
  {
    heading: "3. GA4 のプロパティを見られるようにする",
    lead: "接続した Google アカウントに「閲覧者」以上の権限があるプロパティだけが選べます。",
    groups: [
      {
        title: "別の Google アカウントですでに運用している場合",
        steps: [
          { text: "そのアカウントで Google アナリティクスを開き、対象のプロパティを選びます。" },
          {
            text: "左下の「管理」（歯車）→ プロパティ列の「プロパティのアクセス管理」→ 右上の「＋」→「ユーザーを追加」を開きます。",
            href: "https://support.google.com/analytics/answer/9305587?hl=ja",
            linkLabel: "権限の付け方を見る",
          },
          {
            text: "この画面に「接続中」と表示されているメールアドレスを入力し、役割は「閲覧者」で追加します。",
          },
          { text: "この画面に戻って「一覧を取り直す」を押します。" },
        ],
      },
      {
        title: "まだ GA4 のプロパティが無い場合",
        steps: [
          {
            text: "接続したアカウントで Google アナリティクスを開き、プロパティを作成します。",
            href: "https://analytics.google.com/",
            linkLabel: "アナリティクスを開く",
          },
          {
            text: "発行される計測タグ（G- で始まる ID）をサイトの全ページに設置します。WordPress ならプラグイン、静的サイトなら head 内に貼り付けます。",
            href: "https://support.google.com/analytics/answer/10110290?hl=ja",
            linkLabel: "設置方法を見る",
          },
          { text: "データが流れ始めたら、この画面に戻って「一覧を取り直す」を押します。" },
        ],
        note: "タグを設置してから数値が出るまで、24〜48 時間かかります。",
      },
    ],
  },
  {
    heading: "4. 反映されないとき",
    groups: [
      {
        steps: [
          { text: "権限を付けた直後は反映に数分かかることがあります。少し待って「一覧を取り直す」を押してください。" },
          { text: "「権限が足りません」と出る場合は「接続し直す」を押し、許可画面で両方にチェックを入れてください。" },
          {
            text: "許可画面で別の Google アカウントを選んでしまった場合は、右上のアカウントメニュー →「アカウントを管理」→「接続済みアカウント」から Google を外し、もう一度接続してください。",
          },
          { text: "Search Console で所有権が未確認のサイトは「（所有権が未確認）」と表示され、選べません。先に所有権を確認してください。" },
        ],
      },
    ],
  },
];

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5">
      {steps.map((step) => (
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
  );
}

export function GoogleSetupManual({ className = "" }: { className?: string }) {
  return (
    <details className={`rounded-sm border border-line ${className}`}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-ink">
        設定手順書を開く（Search Console / GA4 の登録と権限付与）
      </summary>
      <div className="space-y-6 border-t border-line px-4 py-4 text-[13px] leading-relaxed text-ink">
        <p className="text-muted">
          このツールは読み取り専用の権限だけを要求します。サイトの登録・所有権の確認・GA4
          の作成・閲覧権限の付与は Google 側での作業になり、このツールからは代行できません。
          接続してからデータが出るまでに必要な作業を順にまとめています。
        </p>

        {SECTIONS.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h4 className="text-sm font-bold text-ink">{section.heading}</h4>
            {section.lead && <p className="text-muted">{section.lead}</p>}
            {section.groups.map((group, i) => (
              <div key={group.title ?? i} className={group.title ? "rounded-sm border border-line p-3" : ""}>
                {group.title && <p className="mb-2 font-bold">{group.title}</p>}
                <StepList steps={group.steps} />
                {group.note && <p className="mt-2 text-muted">{group.note}</p>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}
