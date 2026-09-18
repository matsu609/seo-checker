"use client";

/**
 * D6 llms.txt 生成ウィザード（6 ステップ）。
 *
 * 外部連携は不要。入力は localStorage に保存されるので、途中でリロードしても
 * やり直しにならない。生成そのものは純関数（lib/llms-txt/render.ts）。
 */
import { useCallback, useEffect } from "react";
import { Button, Card } from "@/components/ui";
import { llmsTxtStore, INITIAL_STATE } from "@/lib/llms-txt/store";
import { WIZARD_STEPS, type LlmsTxtState, type StepId } from "@/lib/llms-txt/types";
import { useStore } from "@/lib/store/hooks";
import { useRegisteredSite } from "@/components/site/RegisteredSite";
import { useSharedSettings } from "@/lib/settings/client";
import { StepPages } from "./PagesStep";
import { StepResult } from "./ResultStep";
import { LlmsTxtValidator } from "./Validator";
import { StepAuthors, StepBasics, StepCompany, StepCrawl } from "./WizardSteps";

export function LlmsTxtWizard() {
  const [state, setState] = useStore(llmsTxtStore);
  const site = useRegisteredSite();

  const patch = useCallback(
    (next: Partial<LlmsTxtState>) => setState((prev) => ({ ...prev, ...next })),
    [setState],
  );

  // 対象サイトは設定に登録したホームページ。この画面では URL を聞かない
  // （利用者の指示 2026-09-16）。設定で変えたらここも追従する。
  useEffect(() => {
    if (site.siteUrl && state.siteUrl !== site.siteUrl) patch({ siteUrl: site.siteUrl });
  }, [site.siteUrl, state.siteUrl, patch]);

  // サイト名・会社情報の空欄は設定（サイト名・会社名・所在地・電話）で埋める（利用者の指示 2026-09-19）。
  // 入力済みの値は上書きしない
  const shared = useSharedSettings();
  useEffect(() => {
    const next: Partial<LlmsTxtState> = {};
    if (!state.siteName.trim() && site.registered && site.name) next.siteName = site.name;
    if (!state.companyName.trim() && shared.lead?.company) next.companyName = shared.lead.company;
    if (!state.companyAddress.trim() && shared.lead?.address) next.companyAddress = shared.lead.address;
    if (!state.companyContact.trim() && shared.lead?.phone) next.companyContact = shared.lead.phone;
    if (Object.keys(next).length > 0) patch(next);
  }, [state.siteName, state.companyName, state.companyAddress, state.companyContact, site.registered, site.name, shared.lead, patch]);

  const goTo = useCallback((step: StepId) => patch({ step }), [patch]);
  const current = WIZARD_STEPS.find((s) => s.id === state.step) ?? WIZARD_STEPS[0];
  const isLast = state.step === WIZARD_STEPS[WIZARD_STEPS.length - 1].id;

  return (
    <div className="space-y-6">
      <nav aria-label="ウィザードの手順">
        <ol className="flex flex-wrap gap-2">
          {WIZARD_STEPS.map((step) => {
            const active = step.id === state.step;
            const done = step.id < state.step;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => goTo(step.id)}
                  aria-current={active ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : done
                        ? "border-line bg-panel text-ink"
                        : "border-line bg-surface text-muted"
                  }`}
                >
                  <span className="font-bold tabular-nums">{step.id}</span>
                  <span>
                    <span className="block font-bold">{step.label}</span>
                    <span className="block text-[11px] text-muted">{step.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card
        title={`${current.id}. ${current.label}`}
        description={current.hint}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (confirm("入力内容をすべて消して最初からやり直しますか？")) setState(INITIAL_STATE);
            }}
          >
            入力をリセット
          </Button>
        }
      >
        {state.step === 1 && <StepBasics state={state} patch={patch} />}
        {state.step === 2 && <StepCrawl state={state} patch={patch} />}
        {state.step === 3 && <StepCompany state={state} patch={patch} />}
        {state.step === 4 && <StepPages state={state} patch={patch} />}
        {state.step === 5 && <StepAuthors state={state} patch={patch} />}
        {state.step === 6 && <StepResult state={state} />}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button
            variant="secondary"
            disabled={state.step === 1}
            onClick={() => goTo((state.step - 1) as StepId)}
          >
            前へ
          </Button>
          <p className="text-[12px] text-muted">
            入力内容はこのブラウザに保存されます（サーバーには送信されません）。
          </p>
          <Button disabled={isLast} onClick={() => goTo((state.step + 1) as StepId)}>
            次へ
          </Button>
        </div>
      </Card>

      <LlmsTxtValidator />
    </div>
  );
}
