"use client";

/**
 * オンボーディング（仕様書 §10「自社ドメイン、競合、エイリアス登録を必須ステップに」）
 * と、プロンプト・キーワードの登録。
 *
 * エイリアスは参照判定の精度そのものなので、**登録を必須にする**。
 * 指名プロンプトを高精度枠に入れようとしたらサーバーが警告を返す（§2.2）。
 */
import { useState } from "react";
import { Badge, Button, Callout, Card, Field, Input } from "@/components/ui";
import { PRECISION_REPEATS_PER_WEEK, NORMAL_REPEATS_PER_WEEK } from "@/lib/geo/schedule";
import { GEO_MODEL_LABELS, GEO_MODELS, type GeoBrand, type GeoKeyword, type GeoModel, type GeoPrompt } from "@/lib/geo/types";
import { saveSetup, type SetupResponse } from "./client";

export function SetupPanel({ setup, onChanged }: { setup: SetupResponse; onChanged: () => void }) {
  const own = setup.brands.find((b) => b.type === "own") ?? null;
  const competitors = setup.brands.filter((b) => b.type === "competitor");

  return (
    <div className="space-y-6">
      {!own && (
        <Callout tone="warn" title="はじめに自社ブランドを登録してください">
          自社のブランド名・表記ゆれ（カナ / 英字 / 略称）・ドメインが無いと、回答の中で自社が言及されたかを判定できません。定期計測もこの登録が済むまで動きません。
        </Callout>
      )}

      <BrandForm title="自社ブランド" type="own" brand={own} onSaved={onChanged} />

      <Card
        title="競合ブランド"
        description="比較対象のブランドです。自社と同じ基準で参照率・引用率を出し、同じグラフに重ねます。"
      >
        <ul className="mb-4 space-y-2">
          {competitors.map((brand) => (
            <li key={brand.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 text-[13px] last:border-0">
              <span className="font-bold text-ink">{brand.displayName}</span>
              <span className="text-muted">{brand.domains.join(" / ") || "ドメイン未登録"}</span>
              <span className="text-[11px] text-muted">別名 {brand.aliases.length} 件</span>
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                onClick={async () => {
                  await saveSetup({ kind: "delete", target: "brand", id: brand.id });
                  onChanged();
                }}
              >
                削除
              </Button>
            </li>
          ))}
          {competitors.length === 0 && <li className="text-[13px] text-muted">まだ登録がありません。</li>}
        </ul>
        <BrandForm title="競合を追加" type="competitor" brand={null} onSaved={onChanged} compact />
      </Card>

      <PromptForm prompts={setup.prompts} precisionSlots={setup.account.precisionSlots} onChanged={onChanged} />
      <KeywordForm keywords={setup.keywords} onChanged={onChanged} />
    </div>
  );
}

/* ───────────── ブランド ───────────── */

function BrandForm({ title, type, brand, onSaved, compact }: { title: string; type: "own" | "competitor"; brand: GeoBrand | null; onSaved: () => void; compact?: boolean }) {
  const [displayName, setDisplayName] = useState(brand?.displayName ?? "");
  const [aliases, setAliases] = useState((brand?.aliases ?? []).join("\n"));
  const [domains, setDomains] = useState((brand?.domains ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await saveSetup({
        kind: "brand",
        ...(brand ? { id: brand.id } : {}),
        type,
        displayName: displayName.trim(),
        aliases: aliases.split("\n").map((s) => s.trim()).filter(Boolean),
        domains: domains.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      if (!brand) {
        setDisplayName("");
        setAliases("");
        setDomains("");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <>
      {error && <Callout tone="fail" className="mb-3">{error}</Callout>}
      <div className="grid gap-3 @2xl:grid-cols-3">
        <Field label="ブランド名" hint="画面に出る正式名称">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="サンプル工房" />
        </Field>
        <Field label="別名（1 行に 1 つ）" hint="カナ・英字・略称・サービス名。多いほど取りこぼしが減ります">
          <textarea
            className="min-h-[5rem] w-full rounded-sm border border-line bg-panel px-3 py-2 text-[13px] text-ink"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder={"サンプルコウボウ\nSample Kobo\nサンプル"}
          />
        </Field>
        <Field label="ドメイン（1 行に 1 つ）" hint="サブドメインも自社として数えます">
          <textarea
            className="min-h-[5rem] w-full rounded-sm border border-line bg-panel px-3 py-2 text-[13px] text-ink"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder={"sample-kobo.jp"}
          />
        </Field>
      </div>
      <Button className="mt-3" size="sm" loading={busy} disabled={!displayName.trim()} onClick={() => void submit()}>
        {brand ? "保存する" : "追加する"}
      </Button>
    </>
  );

  return compact ? <div className="border-t border-line pt-4">{body}</div> : <Card title={title} description="ここで登録した別名で、回答本文にブランドが出てきたかを判定します（同名の一般名詞を拾わないよう、最後は AI が文脈で確かめます）。">{body}</Card>;
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
      actions={<Badge tone="neutral" icon={false}>高精度枠 {usedSlots} / {precisionSlots}</Badge>}
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
        {GEO_MODELS.filter((m) => m !== "aio").map((model) => (
          <label key={model} className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={models.includes(model)}
              onChange={(e) => setModels((prev) => (e.target.checked ? [...prev, model] : prev.filter((m) => m !== model)))}
            />
            {GEO_MODEL_LABELS[model]}
          </label>
        ))}
      </div>

      <Button className="mt-3" size="sm" loading={busy} disabled={!text.trim() || models.length === 0} onClick={() => void submit()}>
        追加する
      </Button>
    </Card>
  );
}

/* ───────────── キーワード ───────────── */

function KeywordForm({ keywords, onChanged }: { keywords: GeoKeyword[]; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card title="検索キーワード（順位と AI Overviews）" description="Google の検索結果から、順位と AI Overviews の参照リンクを週 1 回取得します。">
      <ul className="mb-4 divide-y divide-line border-y border-line">
        {keywords.map((keyword) => (
          <li key={keyword.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
            <span className="min-w-0 flex-1 text-ink">{keyword.text}</span>
            {keyword.trackRank && <Badge tone="neutral" icon={false}>順位</Badge>}
            {keyword.trackAio && <Badge tone="neutral" icon={false}>AIO</Badge>}
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await saveSetup({ kind: "delete", target: "keyword", id: keyword.id });
                onChanged();
              }}
            >
              削除
            </Button>
          </li>
        ))}
        {keywords.length === 0 && <li className="py-2 text-[13px] text-muted">まだ登録がありません。</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="キーワード" className="min-w-[16rem] flex-1">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="SEO ツール おすすめ" />
        </Field>
        <Button
          size="sm"
          loading={busy}
          disabled={!text.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await saveSetup({ kind: "keyword", text: text.trim(), trackRank: true, trackAio: true });
              setText("");
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          追加する
        </Button>
      </div>
    </Card>
  );
}
