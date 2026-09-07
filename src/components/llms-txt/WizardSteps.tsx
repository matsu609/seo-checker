"use client";

/**
 * llms.txt ウィザードのうち、入力だけの手順（① ② ③ ⑤）。
 * 状態は親（LlmsTxtWizard）が持ち、ここは表示と onChange だけを担う。
 */
import { Button, Callout, Field, Input, Select, Textarea } from "@/components/ui";
import { newId } from "@/lib/store/createStore";
import type { LlmsTxtState } from "@/lib/llms-txt/types";

export interface StepProps {
  state: LlmsTxtState;
  patch: (next: Partial<LlmsTxtState>) => void;
}

const LANGUAGES = ["日本語", "English", "简体中文", "繁體中文", "한국어", "Español", "Français", "Deutsch"];

/** ① 基本情報 */
export function StepBasics({ state, patch }: StepProps) {
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-bold text-ink">AI クローラのクロール</legend>
        <div className="grid gap-2 @2xl:grid-cols-2">
          {[
            {
              value: true,
              label: "許可する",
              hint: "llms.txt を作り、AI に読ませたい情報を示します。",
            },
            {
              value: false,
              label: "許可しない",
              hint: "robots.txt に貼る Disallow ブロックを生成します。",
            },
          ].map((option) => (
            <label
              key={String(option.value)}
              className={`flex cursor-pointer gap-3 rounded-md border p-3 text-[13px] ${
                state.allowCrawl === option.value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-ink"
              }`}
            >
              <input
                type="radio"
                name="allow-crawl"
                className="mt-0.5 h-4 w-4 accent-accent"
                checked={state.allowCrawl === option.value}
                onChange={() => patch({ allowCrawl: option.value })}
              />
              <span>
                <span className="block font-bold">{option.label}</span>
                <span className="block text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!state.allowCrawl && (
        <Callout tone="warn" title="検索用クローラまで止めると AI 検索に載らなくなります">
          学習用（GPTBot・CCBot など）だけを断り、検索用（OAI-SearchBot・Claude-SearchBot・PerplexityBot）は
          許可するという選び方もできます。生成される robots.txt は用途ごとに分けてあるので、必要なブロックだけを使ってください。
        </Callout>
      )}

      <Field label="トップページの URL" htmlFor="llms-site-url" required hint="ここを起点にページ候補を集めます">
        <Input
          id="llms-site-url"
          value={state.siteUrl}
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.co.jp/"
          onChange={(e) => patch({ siteUrl: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Field label="サイト名" htmlFor="llms-site-name" hint="llms.txt の 1 行目（# 見出し）になります">
          <Input
            id="llms-site-name"
            value={state.siteName}
            placeholder="株式会社サンプル工房"
            onChange={(e) => patch({ siteName: e.target.value })}
          />
        </Field>
        <fieldset>
          <legend className="mb-1 block text-[13px] font-bold text-ink">対応言語</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-line bg-panel p-3">
            {LANGUAGES.map((lang) => (
              <label key={lang} className="flex items-center gap-1.5 text-[13px] text-ink">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={state.languages.includes(lang)}
                  onChange={(e) =>
                    patch({
                      languages: e.target.checked
                        ? [...state.languages, lang]
                        : state.languages.filter((l) => l !== lang),
                    })
                  }
                />
                {lang}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-muted">llms.txt に「対応言語」の 1 行として出力されます。</p>
        </fieldset>
      </div>

      <Field
        label="サイトの概要（1〜2 文）"
        htmlFor="llms-summary"
        hint="llms.txt の「&gt;」行になります。AI が最初に読む部分です"
      >
        <Textarea
          id="llms-summary"
          rows={2}
          value={state.summary}
          placeholder="中小企業向けにウェブサイトの制作と運用支援を行う会社のサイトです。"
          onChange={(e) => patch({ summary: e.target.value })}
        />
      </Field>

      <Field label="補足（任意）" htmlFor="llms-details" hint="対象読者や取り扱い範囲など、段落として出力されます">
        <Textarea
          id="llms-details"
          rows={3}
          value={state.details}
          onChange={(e) => patch({ details: e.target.value })}
        />
      </Field>
    </div>
  );
}

/** ② クロール設定 */
export function StepCrawl({ state, patch }: StepProps) {
  return (
    <div className="space-y-5">
      <p className="text-[13px] leading-relaxed text-muted">
        次の手順で実際にサイトを巡回し、llms.txt に載せる候補を集めます。パスは 1 行に 1 つ、
        <code className="font-mono">/blog</code> のような前方一致か <code className="font-mono">/news/*</code> のような
        ワイルドカードで書きます。
      </p>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <Field label="対象パス（空なら全ページ）" htmlFor="llms-include" hint="1 行に 1 つ。例: /service">
          <Textarea
            id="llms-include"
            rows={5}
            value={state.includePaths}
            placeholder={"/service\n/blog"}
            onChange={(e) => patch({ includePaths: e.target.value })}
          />
        </Field>
        <Field label="除外パス" htmlFor="llms-exclude" hint="検索結果ページや管理画面を外します">
          <Textarea
            id="llms-exclude"
            rows={5}
            value={state.excludePaths}
            onChange={(e) => patch({ excludePaths: e.target.value })}
          />
        </Field>
      </div>
      <Field label="クロールの上限ページ数" htmlFor="llms-limit" hint="多いほど時間がかかります（既定 30）">
        <Select
          id="llms-limit"
          className="max-w-40"
          value={String(state.limit)}
          onChange={(e) => patch({ limit: Number(e.target.value) })}
        >
          {[10, 20, 30, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} ページ
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

/** ③ 会社情報 */
export function StepCompany({ state, patch }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-muted">
        入力した内容は llms.txt の「## 会社情報」として出力されます。空の項目は出力されません。
      </p>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <Field label="名称" htmlFor="llms-company-name">
          <Input
            id="llms-company-name"
            value={state.companyName}
            placeholder="株式会社サンプル工房"
            onChange={(e) => patch({ companyName: e.target.value })}
          />
        </Field>
        <Field label="会社概要ページの URL" htmlFor="llms-company-url">
          <Input
            id="llms-company-url"
            value={state.companyUrl}
            inputMode="url"
            placeholder="https://example.co.jp/company"
            onChange={(e) => patch({ companyUrl: e.target.value })}
          />
        </Field>
      </div>
      <Field label="事業の概要" htmlFor="llms-company-summary">
        <Textarea
          id="llms-company-summary"
          rows={2}
          value={state.companySummary}
          placeholder="中小企業向けのウェブサイト制作と運用支援"
          onChange={(e) => patch({ companySummary: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <Field label="所在地" htmlFor="llms-company-address">
          <Input
            id="llms-company-address"
            value={state.companyAddress}
            placeholder="東京都千代田区サンプル一丁目2番3号"
            onChange={(e) => patch({ companyAddress: e.target.value })}
          />
        </Field>
        <Field label="連絡先" htmlFor="llms-company-contact" hint="電話番号・メールアドレス・問い合わせページなど">
          <Input
            id="llms-company-contact"
            value={state.companyContact}
            placeholder="info@example.co.jp"
            onChange={(e) => patch({ companyContact: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

/** ⑤ 執筆者・RSS */
export function StepAuthors({ state, patch }: StepProps) {
  const update = (id: string, next: Partial<LlmsTxtState["authors"][number]>) =>
    patch({ authors: state.authors.map((a) => (a.id === id ? { ...a, ...next } : a)) });

  return (
    <div className="space-y-5">
      <p className="text-[13px] leading-relaxed text-muted">
        執筆者・RSS・サイトマップは llms.txt の「## Optional」に出力されます。すべて任意です。
      </p>

      <div className="space-y-3">
        {state.authors.map((author) => (
          <div key={author.id} className="grid gap-3 rounded-sm border border-line p-3 @2xl:grid-cols-[1fr_1fr_auto]">
            <Field label="名前" htmlFor={`author-name-${author.id}`}>
              <Input
                id={`author-name-${author.id}`}
                value={author.name}
                onChange={(e) => update(author.id, { name: e.target.value })}
              />
            </Field>
            <Field label="プロフィールの URL" htmlFor={`author-url-${author.id}`}>
              <Input
                id={`author-url-${author.id}`}
                value={author.url}
                inputMode="url"
                onChange={(e) => update(author.id, { url: e.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button
                variant="danger"
                size="md"
                onClick={() => patch({ authors: state.authors.filter((a) => a.id !== author.id) })}
              >
                削除
              </Button>
            </div>
            <Field label="肩書き・担当分野" htmlFor={`author-desc-${author.id}`} className="@2xl:col-span-3">
              <Input
                id={`author-desc-${author.id}`}
                value={author.description}
                placeholder="編集長。SEO と AI 検索の記事を担当"
                onChange={(e) => update(author.id, { description: e.target.value })}
              />
            </Field>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            patch({ authors: [...state.authors, { id: newId(), name: "", url: "", description: "" }] })
          }
        >
          執筆者を追加
        </Button>
      </div>

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Field label="RSS / Atom フィードの URL" htmlFor="llms-rss">
          <Input
            id="llms-rss"
            value={state.rssUrl}
            inputMode="url"
            placeholder="https://example.co.jp/feed.xml"
            onChange={(e) => patch({ rssUrl: e.target.value })}
          />
        </Field>
        <Field label="サイトマップの URL" htmlFor="llms-sitemap">
          <Input
            id="llms-sitemap"
            value={state.sitemapUrl}
            inputMode="url"
            placeholder="https://example.co.jp/sitemap.xml"
            onChange={(e) => patch({ sitemapUrl: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
