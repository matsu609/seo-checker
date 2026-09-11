/**
 * サービス資料の中身。無料診断の画面からダウンロードする PDF の元になる。
 *
 * 掲載する内容は機能レジストリ（src/lib/features/registry.ts）と料金プラン
 * （src/lib/plans/catalog.ts）から組み立てる。資料を手書きにすると、機能や
 * 価格を変えたときに資料だけ古いまま残るため。
 *
 * レポート本体と同じ PDF 化の仕組み（html2canvas + jsPDF）に載せるので、
 * 幅は download.ts の RENDER_WIDTH（768px）に合わせて組む。
 */
import { FEATURE_GROUPS } from "@/lib/features/registry";
import { SELLABLE_PLANS, planShortLabel, planPriceLabel } from "@/lib/plans/catalog";

/** 無料診断と設定を除いた、プランに含まれるツールのグループ */
const TOOL_GROUPS = FEATURE_GROUPS.filter((g) => g.id !== "free" && g.id !== "settings");

export interface ServiceGuideProps {
  /** 会社名・サービス名（NEXT_PUBLIC_CONTACT_NAME） */
  contactName?: string;
  /** 問い合わせ先 URL（NEXT_PUBLIC_CONTACT_URL） */
  contactUrl?: string;
  /** 資料の作成日（YYYY-MM-DD） */
  issuedOn: string;
}

export function ServiceGuide({ contactName, contactUrl, issuedOn }: ServiceGuideProps) {
  return (
    <div className="bg-surface text-ink" style={{ width: 768 }}>
      {/* 表紙 */}
      <header className="bg-brand px-8 py-10 text-on-brand">
        <p className="text-[12px] tracking-widest text-on-brand-muted">サービス資料</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold">
          AI 検索（AIO）対応の診断と改善
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-on-brand-muted">
          サイトが AI 検索に読まれ、引用される状態になっているかを診断し、
          そのまま使える改修案までご提供します。
        </p>
        <p className="mt-6 text-[12px] text-on-brand-muted">
          {contactName ? `${contactName} ／ ` : ""}
          {issuedOn} 時点
        </p>
      </header>

      <div className="space-y-8 px-8 py-8">
        {/* 課題 */}
        <section>
          <h2 className="border-l-4 border-brand pl-3 text-[18px] font-bold">
            検索は「順位」から「引用」へ
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed">
            AI が答えを組み立てて返す検索が広がり、利用者がサイトを開かずに済む場面が増えています。
            そこで問われるのは「何位か」ではなく、
            <strong className="font-bold">AI に正しく読まれ、答えの根拠として引用されるか</strong>です。
            引用されるには、機械が理解できる形で情報が置かれている必要があります。
          </p>
          <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed">
            <li>・AI クローラがページを読める設定になっているか</li>
            <li>・誰が・何を・いつ・いくらで、が具体的に書かれているか</li>
            <li>・見出しと本文が対応し、構造化データが実態と合っているか</li>
          </ul>
        </section>

        {/* 無料診断 */}
        <section>
          <h2 className="border-l-4 border-brand pl-3 text-[18px] font-bold">
            まずは無料診断から
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed">
            URL を入れるだけで、1 ページまたはサイト全体を採点します。
            ログインも API キーも不要で、結果は報告書として PDF で保存できます。
          </p>
          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
            {[
              ["AI クローラ可否", "20"],
              ["構造化データ", "25"],
              ["メタ情報", "20"],
              ["見出し", "15"],
              ["コンテンツ", "20"],
            ].map(([label, weight]) => (
              <div key={label} className="rounded-sm border border-line bg-panel p-2">
                <div className="text-[18px] font-bold tabular-nums">{weight}</div>
                <div className="mt-0.5 text-[10px] leading-tight text-muted">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            採点はルールベース（生成 AI 不使用）で、同じページなら同じ結果になります。
            表示速度・被リンク・検索順位は含みません。
          </p>
        </section>

        {/* 料金プラン */}
        <section>
          <h2 className="border-l-4 border-brand pl-3 text-[18px] font-bold">料金プラン</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {SELLABLE_PLANS.map((plan) => (
              <div key={plan.id} className="rounded-sm border border-line bg-panel p-3">
                <div className="text-[13px] font-bold">{plan.label}</div>
                <div className="mt-1 text-[16px] font-bold tabular-nums">
                  {planPriceLabel(plan.id)}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{plan.summary}</p>
                <ul className="mt-2 space-y-1 text-[11px] leading-relaxed">
                  {plan.highlights.map((h) => (
                    <li key={h}>・{h}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">表示は月額・税別です。</p>
        </section>

        {/* ツール一覧 */}
        <section>
          <h2 className="border-l-4 border-brand pl-3 text-[18px] font-bold">
            ご提供するツール
          </h2>
          <div className="mt-3 space-y-4">
            {TOOL_GROUPS.map((group) => (
              <div key={group.id}>
                <h3 className="text-[13px] font-bold text-muted">{group.label}</h3>
                <ul className="mt-1.5 space-y-1.5">
                  {group.features.map((f) => (
                    <li key={f.id} className="text-[12px] leading-relaxed">
                      <span className="font-bold">{f.shortLabel}</span>
                      <span className="ml-1.5 rounded-sm border border-line px-1 text-[10px] text-muted">
                        {planShortLabel(f.plan)}
                      </span>
                      <br />
                      <span className="text-muted">{f.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 改修提案 */}
        <section>
          <h2 className="border-l-4 border-brand pl-3 text-[18px] font-bold">
            改修案は「そのまま使える形」で
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed">
            プロプランでは、診断結果をもとに AI が改修案を作ります。
            「〜を検討してください」という助言ではなく、
            <strong className="font-bold">変更前と変更後を並べた、そのまま貼れる文面</strong>でお渡しします。
            対象はタイトル・説明文・見出し・本文・構造化データ・画像の代替テキストです。
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            ページに書かれていない事実（実績数・料金など）を AI が作ることはありません。
            数値を入れる箇所は伏せ字にし、確認していただく形にしています。
            サイトへの反映は運用者が行い、ツールがお客様のサイトを書き換えることはありません。
          </p>
        </section>

        {/* 正直に書く */}
        <section className="rounded-sm border border-line bg-panel p-4">
          <h2 className="text-[14px] font-bold">この診断でわかること・わからないこと</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 text-[12px] leading-relaxed">
            <div>
              <p className="font-bold">わかること</p>
              <ul className="mt-1 space-y-1 text-muted">
                <li>・AI に読まれる状態が整っているか</li>
                <li>・どのページの、どこを直すべきか</li>
                <li>・直した後の具体的な文面</li>
              </ul>
            </div>
            <div>
              <p className="font-bold">わからないこと</p>
              <ul className="mt-1 space-y-1 text-muted">
                <li>・検索順位そのもの</li>
                <li>・実際に AI に引用された回数</li>
                <li>・表示速度・被リンク</li>
              </ul>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            スコアは技術チェック表の達成率です。成果の確認には Search Console の表示回数、
            問い合わせの転換、Core Web Vitals をご利用ください。
          </p>
        </section>

        {/* 連絡先 */}
        {(contactName || contactUrl) && (
          <section className="rounded-sm border border-brand bg-accent-soft p-4">
            <h2 className="text-[14px] font-bold">お問い合わせ</h2>
            <p className="mt-1 text-[13px] leading-relaxed">
              導入のご相談、無料診断の結果についてのご質問は下記まで。
            </p>
            <p className="mt-2 text-[13px] break-all">
              {contactName && <span className="font-bold">{contactName}</span>}
              {contactName && contactUrl && <span className="text-muted"> ／ </span>}
              {contactUrl}
            </p>
          </section>
        )}
      </div>

      <footer className="border-t border-line px-8 py-4">
        <p className="text-[10px] leading-relaxed text-muted">
          本資料の内容は {issuedOn} 時点のものです。掲載順位や成果を保証するものではありません。
        </p>
      </footer>
    </div>
  );
}
