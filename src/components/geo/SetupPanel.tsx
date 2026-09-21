"use client";

/**
 * AI 検索モニタリングの計測対象。
 *
 * 自社ブランド・競合・検索キーワードは設定（/settings）に集約した（利用者の指示 2026-09-19）。
 * ここでは「設定から取り込んだもの」を確認だけできる（編集は設定で）。
 * この画面で登録するのはプロンプトだけ。
 * 指名プロンプトを高精度枠に入れようとしたらサーバーが警告を返す（§2.2）。
 */
import { useState } from "react";
import { Badge, Button, ButtonLink, Callout, Card, Field, Input } from "@/components/ui";
import { SITE_SETTINGS_HREF } from "@/components/site/RegisteredSite";
import { PRECISION_REPEATS_PER_WEEK, NORMAL_REPEATS_PER_WEEK } from "@/lib/geo/schedule";
import { GEO_LLM_MODELS, GEO_MODEL_LABELS, isLiveOnlyModel, type GeoBrand, type GeoKeyword, type GeoModel, type GeoPrompt } from "@/lib/geo/types";
import { saveSetup, type SetupResponse } from "./client";

/** 設定画面のキーワードカードへの直リンク */
const KEYWORDS_SETTINGS_HREF = "/settings#keywords";
const COMPETITORS_SETTINGS_HREF = "/settings#competitors";

export function SetupPanel({ setup, onChanged }: { setup: SetupResponse; onChanged: () => void }) {
  const own = setup.brands.find((b) => b.type === "own") ?? null;
  const competitors = setup.brands.filter((b) => b.type === "competitor");

  return (
    <div className="space-y-6">
      {!own && (
        <Callout tone="warn" title="はじめに設定でホームページを登録してください">
          自社のブランド名・表記ゆれ（カナ / 英字 / 略称）・ドメインは「設定」のホームページから自動で取り込みます。登録が無いと、回答の中で自社が言及されたかを判定できず、定期計測も動きません。
          <div className="mt-3">
            <ButtonLink href={SITE_SETTINGS_HREF} size="sm">
              設定でホームページを登録する
            </ButtonLink>
          </div>
        </Callout>
      )}

      <SharedBrandsCard own={own} competitors={competitors} />
      <PromptForm prompts={setup.prompts} precisionSlots={setup.account.precisionSlots} onChanged={onChanged} />
      <SharedKeywordsCard keywords={setup.keywords} />
    </div>
  );
}

/* ───────────── 設定から取り込んだブランド ───────────── */

function BrandRow({ brand, label }: { brand: GeoBrand; label?: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-line py-2 text-[13px] last:border-0">
      {label && <Badge tone="info" icon={false}>{label}</Badge>}
      <span className="font-bold text-ink">{brand.displayName}</span>
      <span className="text-muted">{brand.domains.join(" / ") || "ドメイン未登録"}</span>
      <span className="text-[11px] text-muted">{brand.aliases.length > 0 ? `別名: ${brand.aliases.join("、")}` : "別名なし"}</span>
    </li>
  );
}

function SharedBrandsCard({ own, competitors }: { own: GeoBrand | null; competitors: GeoBrand[] }) {
  return (
    <Card
      title="自社ブランドと競合（設定から自動で取り込み）"
      description="設定に登録したホームページ（サイト名・ブランドの表記ゆれ・ドメイン）を自社ブランド、競合サイトを競合ブランドとして使います。回答本文に別名が出てきたかで言及を判定するので、表記ゆれは多いほど取りこぼしが減ります。直すときは設定で変えてください（開き直すと反映されます）。"
      actions={
        <ButtonLink href={COMPETITORS_SETTINGS_HREF} size="sm" variant="ghost">
          設定で直す
        </ButtonLink>
      }
    >
      <ul>
        {own && <BrandRow brand={own} label="自社" />}
        {competitors.map((brand) => (
          <BrandRow key={brand.id} brand={brand} label="競合" />
        ))}
        {!own && competitors.length === 0 && <li className="py-2 text-[13px] text-muted">まだ設定にホームページが登録されていません。</li>}
        {own && competitors.length === 0 && <li className="py-2 text-[13px] text-muted">競合は未登録です（設定の「競合サイト」で足せます）。</li>}
      </ul>
    </Card>
  );
}

/* ───────────── 設定から取り込んだキーワード ───────────── */

function SharedKeywordsCard({ keywords }: { keywords: GeoKeyword[] }) {
  return (
    <Card
      title="検索キーワード（順位と AI Overviews。設定から自動で取り込み）"
      description="設定の「対策キーワード」を使い、Google の検索結果から順位と AI Overviews の参照リンクを週 1 回取得します。足す・消すは設定で行ってください。"
      actions={
        <ButtonLink href={KEYWORDS_SETTINGS_HREF} size="sm" variant="ghost">
          設定で直す
        </ButtonLink>
      }
    >
      <ul className="divide-y divide-line border-y border-line">
        {keywords.map((keyword) => (
          <li key={keyword.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
            <span className="min-w-0 flex-1 text-ink">{keyword.text}</span>
            {keyword.trackRank && <Badge tone="neutral" icon={false}>順位</Badge>}
            {keyword.trackAio && <Badge tone="neutral" icon={false}>AIO</Badge>}
          </li>
        ))}
        {keywords.length === 0 && <li className="py-2 text-[13px] text-muted">まだ登録がありません。設定の「対策キーワード」で登録すると、ここに出ます。</li>}
      </ul>
    </Card>
  );
}

/* ───────────── プロンプト ───────────── */

function PromptForm({ prompts, precisionSlots, onChanged }: { prompts: GeoPrompt[]; precisionSlots: number; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [isBranded, setIsBranded] = useState(false);
  const [precisionMode, setPrecisionMode] = useState(false);
  const [models, setModels] = useState<GeoModel[]>(["chatgpt", "gemini"]);
  const [tags, setTags] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usedSlots = prompts.filter((p) => p.precisionMode).length;

  async function submit() {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const result = await saveSetup({
        kind: "prompt",
        text: text.trim(),
        isBranded,
        precisionMode,
        models,
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setWarning(result.warning ?? null);
      setText("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="計測するプロンプト"
      description={`AI に投げる質問です。通常は週 ${NORMAL_REPEATS_PER_WEEK} 回、高精度枠は週 ${PRECISION_REPEATS_PER_WEEK} 回、週内の別の日に分けて実行します（同じ日にまとめて聞いても、言葉のゆらぎしか見えないため）。`}
      actions={
        <>
          <ButtonLink href="/tools/prompt-expansion" size="sm" variant="ghost">
            プロンプト拡張で候補を作る
          </ButtonLink>
          <Badge tone="neutral" icon={false}>高精度枠 {usedSlots} / {precisionSlots}</Badge>
        </>
      }
    >
      {error && <Callout tone="fail" className="mb-3">{error}</Callout>}
      {warning && <Callout tone="warn" className="mb-3" title="この設定は効果が薄いかもしれません">{warning}</Callout>}

      <ul className="mb-4 divide-y divide-line border-y border-line">
        {prompts.map((prompt) => (
          <li key={prompt.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
            <span className="min-w-0 flex-1 text-ink">{prompt.text}</span>
            {prompt.isBranded && <Badge tone="info" icon={false}>指名</Badge>}
            {prompt.precisionMode && <Badge tone="pass" icon={false}>高精度</Badge>}
            <span className="text-[11px] text-muted">{prompt.models.map((m) => GEO_MODEL_LABELS[m]).join(" / ")}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await saveSetup({ kind: "delete", target: "prompt", id: prompt.id });
                onChanged();
              }}
            >
              削除
            </Button>
          </li>
        ))}
        {prompts.length === 0 && <li className="py-2 text-[13px] text-muted">まだ登録がありません。</li>}
      </ul>

      <div className="grid gap-3 @2xl:grid-cols-2">
        <Field label="プロンプト" hint="例: 世田谷区 ホームページ制作 おすすめ">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="おすすめの SEO ツールは？" />
        </Field>
        <Field label="タグ（カンマ区切り）" hint="集計の切り口。例: 比較, 指名">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="比較" />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px]">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={isBranded} onChange={(e) => setIsBranded(e.target.checked)} />
          ブランド名を含む（指名検索）
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={precisionMode} onChange={(e) => setPrecisionMode(e.target.checked)} />
          高精度枠（週 {PRECISION_REPEATS_PER_WEEK} 回）
        </label>
        {GEO_LLM_MODELS.map((model) => (
          <label key={model} className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={models.includes(model)}
              onChange={(e) => setModels((prev) => (e.target.checked ? [...prev, model] : prev.filter((m) => m !== model)))}
            />
            {GEO_MODEL_LABELS[model]}
            {/* Perplexity は標準キューが無く Live だけなので原価が約 3 倍（判断の経緯 2026-09-21） */}
            {isLiveOnlyModel(model) && <span className="text-[11px] text-muted">（原価 約 3 倍）</span>}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        AI Overviews と AI モード（Google）は、プロンプトではなく設定の「対策キーワード」から週 1 回まとめて測ります。
      </p>

      <Button className="mt-3" size="sm" loading={busy} disabled={!text.trim() || models.length === 0} onClick={() => void submit()}>
        追加する
      </Button>
    </Card>
  );
}
