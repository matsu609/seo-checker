/**
 * プライバシーポリシー（本文）。表示だけ。
 *
 * 書いてあることは docs/dev/services.md の「データの置き場所」と一致させる。
 * このアプリは自前のデータベースを持たず、パスワードもカード番号も保持しないので、
 * 「集めていないもの」を先に言い切ることで安心感を出す。一方で、外部サービスへの
 * 送信・海外サーバーでの処理・生成 AI への送信・利用者が入力する第三者情報の責任は、
 * 利用者の了承事項として明記する。Google OAuth の審査で必須になる Limited Use の
 * 声明（第 5 条）は文言を変えないこと。
 */
import Link from "next/link";
import { OPERATOR, SERVICE_NAME, TERMS_EFFECTIVE_DATE, TERMS_UPDATED_DATE, operatorLabel } from "@/lib/legal/operator";

const S = SERVICE_NAME;

interface Row {
  cells: string[];
}

interface Section {
  title: string;
  summary: string;
  paragraphs?: string[];
  /** 表（見出し行 + 行） */
  table?: { head: string[]; rows: Row[] };
  /** 表や段落のあとに続ける段落 */
  after?: string[];
  /** 外部リンク */
  links?: { label: string; href: string }[];
}

const PROMISES = [
  "パスワードを見ることはありません。認証は専門の認証基盤（Clerk）が行い、運営者はパスワードを受け取りません。",
  "クレジットカード番号を保持しません。決済は決済代行サービス（Stripe / Clerk Billing）が扱います。",
  "診断結果を運営者が勝手に公開したり、他の利用者に見せたりすることはありません。",
  "集めた情報を広告のターゲティングに使ったり、第三者に販売したりすることはありません。",
  "Google アカウントとの連携は「読み取り専用」の権限だけを求めます。あなたのサイトや店舗情報を書き換えることはできません。",
];

const SECTIONS: Section[] = [
  {
    title: "第 1 条（このポリシーについて）",
    summary: `${S} が、どんな情報を、何のために、どこに預けて扱うかを説明します。`,
    paragraphs: [
      `本ポリシーは、運営者が提供するウェブサービス「${S}」（以下「本サービス」）における、利用者の情報の取り扱いを定めるものです。本サービスの利用規約とあわせて適用されます。`,
      "本サービスは事業者（法人・個人事業主）による業務利用を想定しています。本ポリシーで「個人情報」とは、個人情報の保護に関する法律に定める個人情報をいいます。",
    ],
  },
  {
    title: "第 2 条（取得する情報）",
    summary: "取得するのは、ログインに必要な情報、あなたが本サービスに入力した情報、連携を許可した Google のデータ、そして技術的なアクセス記録です。",
    table: {
      head: ["種類", "内容", "保管場所"],
      rows: [
        { cells: ["アカウント情報", "メールアドレス、氏名（任意）、Google でログインした場合はその Google アカウントのメールアドレスとプロフィール名。パスワードは認証基盤がハッシュ化して保管し、運営者は取得しません", "Clerk"] },
        { cells: ["契約・プラン情報", "ご利用中のプラン、契約状況、次回請求日。カード番号等の決済情報は決済代行サービスのみが保持します", "Clerk / Stripe"] },
        { cells: ["Google 連携の設定", "接続を許可した Google アカウント、連携先として選んだ Search Console のサイトと GA4 のプロパティ。アクセス権限（トークン）は認証基盤が保管します", "Clerk"] },
        { cells: ["利用者が入力した情報", "診断対象の URL、キーワード、店舗名、プロジェクトと競合の登録、文章、アップロードした PDF 等", "主にお使いのブラウザ（localStorage）。診断のたびにサーバーへ送信され、処理後は保持しません"] },
        { cells: ["診断結果", "採点、評価、提案、生成した文章。履歴の保存機能を提供する場合は、利用者が保存を選んだものだけを保管します", "保存しない（保存機能を使う場合はデータベース）"] },
        { cells: ["技術情報", "IP アドレス、ブラウザの種類、アクセス日時、エラー記録などのアクセスログ", "Vercel（ホスティング）"] },
      ],
    },
    after: [
      "運営者は、氏名や連絡先を本サービスの機能として利用者に求めることはありません（お問い合わせをいただいた場合を除きます）。",
    ],
  },
  {
    title: "第 3 条（利用目的）",
    summary: "サービスを動かすため、料金をいただくため、問い合わせに答えるため、そして壊れたときに直すためです。",
    paragraphs: [
      "運営者は、取得した情報を次の目的で利用します。(1) 本サービスの提供、本人確認、ログインの維持 (2) 有料プランの請求と契約の管理 (3) お問い合わせへの対応、重要なお知らせの送付 (4) 障害の調査、不正利用の防止、セキュリティの確保 (5) 利用状況の統計的な分析による本サービスの改善（個人を特定しない形で行います） (6) 法令に基づく対応。",
      "上記以外の目的で利用する必要が生じた場合は、あらかじめ利用者に通知し、必要な同意を得ます。",
    ],
  },
  {
    title: "第 4 条（外部サービスへの提供と委託）",
    summary: "本サービスは複数の外部サービスの上で動いています。機能に必要な範囲で、情報がこれらの事業者に渡ります。多くは日本国外のサーバーで処理されます。",
    table: {
      head: ["事業者", "役割", "渡る情報"],
      rows: [
        { cells: ["Clerk（米国）", "ログイン、ユーザー情報と Google 連携の権限の保管、契約管理", "アカウント情報、Google のアクセス権限、プラン情報"] },
        { cells: ["Vercel（米国）", "本サービスのホスティング、アクセスログ", "技術情報、処理中の入力情報"] },
        { cells: ["Google（米国）", "Search Console / Google アナリティクス / Google マップ / PageSpeed Insights の API、ログイン", "連携を許可した範囲のデータの読み取り要求、診断対象の URL・店舗名"] },
        { cells: ["Anthropic（米国）ほか AI 事業者", "生成 AI による総評・提案・文章の作成、LLMO モニタリング", "診断対象ページの本文や集計結果、店舗の公開情報と口コミ、利用者が入力したキーワード・文章"] },
        { cells: ["SerpApi（米国）", "検索結果の取得", "検索キーワード"] },
        { cells: ["Stripe / Clerk Billing（米国）", "有料プランの決済", "決済に必要な情報（運営者は取得しません）"] },
        { cells: ["Supabase（日本リージョンを予定）", "診断履歴の保存機能を提供する場合の保管", "利用者が保存を選んだ診断結果"] },
      ],
    },
    after: [
      "利用者は、上記の事業者が日本国外に所在し、情報が国外のサーバーで処理・保管されることを了承のうえ、本サービスを利用するものとします。各事業者における情報の取り扱いは、各事業者のプライバシーポリシーに従います。",
      "運営者は、法令に基づく場合、人の生命・身体・財産の保護に必要な場合、または利用者の同意がある場合を除き、個人情報を第三者に提供しません。",
    ],
  },
  {
    title: "第 5 条（Google アカウントのデータの取り扱い）",
    summary: "Google 連携で読み取るのは、あなたが許可した Search Console・アナリティクス・ビジネス プロフィールのデータだけで、本サービスの画面に表示するためにしか使いません。",
    paragraphs: [
      "本サービスは、利用者が明示的に許可した場合にのみ Google アカウントに接続し、読み取り専用の権限（Search Console の閲覧、Google アナリティクスの閲覧など）だけを要求します。データの書き換え・削除・投稿を行う権限は要求しません。",
      "Google から取得したデータは、利用者本人に本サービスの画面（検索パフォーマンス、生成 AI 流入分析、サイトレポート、Google マップ・店舗情報など）で表示するためにのみ利用します。他の利用者に見せたり、広告に利用したり、本サービスの機能改善以外の目的で第三者に渡したりすることはありません。",
      "本サービスによる Google API から受け取った情報の使用および他のアプリへの転送は、限定的な使用（Limited Use）の要件を含む Google API サービスのユーザーデータに関するポリシーに準拠します。",
      "連携はいつでも解除できます。本サービスのアカウント設定から Google の接続を外すか、Google アカウントの「セキュリティ」→「サードパーティ製のアプリとサービス」から本サービスのアクセス権を削除してください。解除後、本サービスは新たにデータを取得できなくなります。",
    ],
    links: [
      { label: "Google API サービスのユーザーデータに関するポリシー", href: "https://developers.google.com/terms/api-services-user-data-policy" },
    ],
  },
  {
    title: "第 6 条（生成 AI への送信）",
    summary: "AI が総評や提案を書く機能では、診断対象の情報を AI 事業者に送ります。個人情報を含めないよう設計していますが、あなたが入力した文章に含まれている場合はそのまま送られます。",
    paragraphs: [
      "生成 AI を使う機能（総評、HP 改修提案、FAQ 生成、AI ライティング、LLMO モニタリングなど）では、診断対象ページの本文や集計結果、店舗の公開情報と口コミ、利用者が入力したキーワード・文章を、運営者が契約する AI 事業者の API に送信します。",
      "運営者は、利用者のアカウント情報（メールアドレス等）を AI に送信しません。ただし、利用者が入力した文章や診断対象のページに個人情報が含まれている場合、それらは処理のために送信されます。個人情報を含む内容の入力は利用者の判断と責任で行ってください。",
      "運営者は、送信した内容がモデルの学習に利用されない契約・設定での利用に努めます。各 AI 事業者における保持期間・取り扱いは、各事業者の規約と方針に従います。",
    ],
  },
  {
    title: "第 7 条（Cookie とブラウザへの保存）",
    summary: "使うのはログインを保つための Cookie と、あなたの設定を覚えておくためのブラウザ保存だけです。広告用の追跡は行いません。",
    paragraphs: [
      "本サービスは、ログイン状態の維持と不正アクセスの防止に必要な Cookie（認証基盤が発行するもの、登録時のロボット判定を含む）を使用します。広告配信や行動追跡を目的とした Cookie は使用しません。",
      "プロジェクト・競合の登録、選んだ店舗、画面の設定などは、お使いのブラウザの保存領域（localStorage）に保存されます。これらは運営者のサーバーには送られず、ブラウザのデータを消去すると失われます。設定画面から JSON 形式で書き出し・読み込みができます。",
    ],
  },
  {
    title: "第 8 条（保存期間と削除）",
    summary: "アカウントを消せば、預かっている情報も消えます。診断結果はそもそも保存していません。",
    paragraphs: [
      "アカウント情報、Google 連携の権限と設定、プラン情報は、アカウントが削除されるまで保管します。アカウントを削除すると、認証基盤上の情報は削除され、復元できません。",
      "診断のために送信された入力情報と診断結果は、処理のために一時的に扱うだけで、運営者のサーバーには保存しません（一部は応答を速くするため数分〜数時間の一時的なキャッシュに置かれることがあります）。履歴の保存機能を提供する場合、保存された診断結果は利用者がいつでも削除でき、アカウントの削除時にあわせて削除します。",
      "アクセスログは、障害調査と不正利用の防止のため、ホスティング事業者の定める期間保管したのち削除されます。",
      "法令により保管が義務づけられる情報（取引の記録など）は、当該法令の定める期間保管します。",
    ],
  },
  {
    title: "第 9 条（安全管理）",
    summary: "通信は暗号化し、鍵はサーバーだけが持ちます。外部サービスは、それぞれ専門の事業者の管理下にあります。",
    paragraphs: [
      "運営者は、取得した情報の漏えい・滅失・毀損を防ぐため、通信の暗号化（HTTPS）、API キー等の秘密情報のサーバー側での管理、最小限の権限での外部サービス連携、アクセス制御などの合理的な安全管理措置を講じます。",
      "外部サービスに預けた情報の安全管理は、各事業者がそれぞれの基準で行います。運営者は、信頼できる事業者を選定し、必要な設定を行いますが、各事業者のシステムそのものを管理する立場にはありません。",
      "万一、個人情報の漏えい等が発生した場合、運営者は法令に従い、影響を受ける利用者と関係当局に速やかに通知します。",
    ],
  },
  {
    title: "第 10 条（利用者の権利）",
    summary: "自分の情報の確認・訂正・削除はいつでも求められます。多くはご自身の設定画面から行えます。",
    paragraphs: [
      "利用者は、運営者が保有する自己の個人情報について、開示、訂正、追加、削除、利用停止を請求できます。お問い合わせ先までご連絡ください。本人確認のうえ、法令の定める範囲で速やかに対応します。",
      "アカウント情報の変更・削除、Google 連携の解除は、本サービスのアカウント設定と設定画面からご自身で行えます。",
      "利用者が個人情報の提供や連携を行わない場合、本サービスの一部の機能を利用できないことがあります。",
    ],
  },
  {
    title: "第 11 条（利用者が入力する第三者の情報）",
    summary: "競合サイトや口コミなど、他人の情報を扱う機能があります。その扱いは、法令と各サービスのルールの範囲で、利用者の責任で行ってください。",
    paragraphs: [
      "本サービスには、競合サイトのページ、Google マップ上の公開情報や口コミなど、利用者以外の第三者に関する公開情報を扱う機能があります。これらは公開されている範囲で取得し、利用者本人に表示するためにのみ利用します。",
      "利用者が本サービスに第三者の個人情報を入力・アップロードする場合（顧客リスト、担当者名を含む文章など）、その取得・利用について必要な権限と同意を利用者が有していることを前提とします。これに関して第三者との間で生じた紛争は、利用者の責任と費用で解決するものとします。",
    ],
  },
  {
    title: "第 12 条（改定）",
    summary: "内容が変わるときは、このページを更新してお知らせします。",
    paragraphs: [
      "運営者は、法令の変更や本サービスの機能の変更に応じて、本ポリシーを改定することがあります。改定後のポリシーは、本サービス上に掲載した時点から効力を生じます。重要な変更については、本サービス上の表示またはメールによりお知らせするよう努めます。",
    ],
  },
];

export function PrivacyPolicy() {
  return (
    <article className="mx-auto w-full max-w-3xl">
      <div className="rounded-sm border border-line bg-panel px-5 py-6 @md:px-8">
        <p className="text-[13px] leading-relaxed text-muted">
          {S} は、あなたのサイトや店舗のデータを扱うサービスです。だからこそ、何を預かり、何を預からないかをはっきり書いておきます。各条の冒頭に「かんたんに言うと」を添えていますが、正式な内容は本文のとおりです。
          利用条件は{" "}
          <Link href="/terms" className="underline underline-offset-2">
            利用規約
          </Link>
          をご覧ください。
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-muted">
          <div>
            <dt className="inline">施行日:</dt> <dd className="inline tabular-nums">{TERMS_EFFECTIVE_DATE}</dd>
          </div>
          <div>
            <dt className="inline">最終更新:</dt> <dd className="inline tabular-nums">{TERMS_UPDATED_DATE}</dd>
          </div>
        </dl>

        <section className="mt-6 rounded-sm border border-accent/40 bg-accent-soft px-4 py-3">
          <h2 className="text-[14px] font-bold text-ink">私たちがしないこと</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink">
            {PROMISES.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        {SECTIONS.map((s) => (
          <section key={s.title} className="mt-8">
            <h2 className="flex items-center gap-2 border-b border-line pb-2 text-[16px] font-bold text-ink">
              <span aria-hidden className="h-4 w-1 shrink-0 bg-brand" />
              {s.title}
            </h2>
            <p className="mt-3 rounded-sm bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink">
              <span className="font-bold">かんたんに言うと:</span> {s.summary}
            </p>
            {s.paragraphs && (
              <ol className="mt-3 list-decimal space-y-2 pl-6 text-[13px] leading-relaxed text-ink">
                {s.paragraphs.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            )}
            {s.table && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-[12px] leading-relaxed">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] font-bold text-muted">
                      {s.table.head.map((h) => (
                        <th key={h} className="px-2 py-1.5">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((r, i) => (
                      <tr key={i} className="border-b border-line align-top">
                        {r.cells.map((c, j) => (
                          <td key={j} className={`px-2 py-2 ${j === 0 ? "whitespace-nowrap font-bold text-ink" : "text-ink"}`}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {s.after && (
              <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink">
                {s.after.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
            {s.links && (
              <ul className="mt-2 text-[12px]">
                {s.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {l.label}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="mt-8">
          <h2 className="flex items-center gap-2 border-b border-line pb-2 text-[16px] font-bold text-ink">
            <span aria-hidden className="h-4 w-1 shrink-0 bg-brand" />
            お問い合わせ・個人情報の取扱事業者
          </h2>
          <dl className="mt-3 text-[13px]">
            <div className="border-b border-line py-2">
              <dt className="text-[11px] text-muted">事業者</dt>
              <dd className="mt-0.5 text-ink">{operatorLabel(OPERATOR.name)}</dd>
            </div>
            {OPERATOR.address && (
              <div className="border-b border-line py-2">
                <dt className="text-[11px] text-muted">所在地</dt>
                <dd className="mt-0.5 text-ink">{OPERATOR.address}</dd>
              </div>
            )}
            <div className="border-b border-line py-2">
              <dt className="text-[11px] text-muted">個人情報に関するお問い合わせ</dt>
              <dd className="mt-0.5 break-all text-ink">
                {OPERATOR.email ? (
                  <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-2">
                    {OPERATOR.email}
                  </a>
                ) : (
                  operatorLabel(null)
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </article>
  );
}
