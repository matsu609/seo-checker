"use client";

import { useId, useState } from "react";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, Select, StatStrip } from "@/components/ui";
import { aioClassHint, aioClassLabel, classifyAio, dateKey } from "@/lib/rank/classify";
import { shortPath } from "@/lib/rank/rows";
import { DEVICE_LABELS, addKeyword, saveSnapshots, toSnapshot, type RankKeyword } from "@/lib/rank/store";
import type { RankMeasureResponse, RankMeasurement, SerpDevice } from "@/lib/rank/types";
import { SERP_FEATURE_LABELS, type SerpFeature } from "@/lib/serp/types";
import { useToolRun } from "@/lib/tools/run";
import { AioCell, RankCell } from "./RankTable";

export interface RealtimePanelProps {
  projectId: string;
  projectDomain: string;
  competitorDomains: readonly string[];
  serpEnabled: boolean;
  keywords: readonly RankKeyword[];
}

/**
 * リアルタイム計測（B2）。登録済みかどうかに関わらず、その場で 1 キーワードを計測する。
 * 結果は登録済みキーワードと一致したときだけ履歴に保存する。
 */
export function RealtimePanel({ projectId, projectDomain, competitorDomains, serpEnabled, keywords }: RealtimePanelProps) {
  const id = useId();
  const [keyword, setKeyword] = useState("");
  const [device, setDevice] = useState<SerpDevice>("desktop");
  const [location, setLocation] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const { state, run, cancel } = useToolRun<RankMeasureResponse>();

  const disabled = !serpEnabled || !projectDomain;
  const result = state.phase === "done" ? state.data.results[0] : null;
  const measurement = result?.ok ? (result as { ok: true } & RankMeasurement) : null;

  async function measure() {
    setSaved(null);
    const q = keyword.trim();
    if (!q) return;
    const data = await run("/api/rank/measure", {
      keywords: [{ keyword: q, device, ...(location.trim() ? { location: location.trim() } : {}) }],
      projectDomain,
      competitorDomains: [...competitorDomains],
      includeAioText: true,
    });
    const item = data?.results[0];
    if (!item?.ok) return;
    // 登録済みキーワードなら履歴にも残す（未登録なら表示だけ）
    const registered = keywords.find((k) => k.keyword === item.keyword && k.device === item.device);
    if (registered) {
      saveSnapshots([toSnapshot(registered.id, item, dateKey())]);
      setSaved("登録済みキーワードのため、今日の履歴に保存しました。");
    }
  }

  function register() {
    if (!measurement) return;
    const created = addKeyword({
      projectId,
      keyword: measurement.keyword,
      device: measurement.device,
      ...(measurement.location ? { location: measurement.location } : {}),
    });
    if (created) {
      saveSnapshots([toSnapshot(created.id, measurement, dateKey())]);
      setSaved("キーワードを登録し、今日の履歴に保存しました。");
    } else {
      setSaved("すでに登録されているキーワードです。");
    }
  }

  const alreadyRegistered =
    measurement !== null && keywords.some((k) => k.keyword === measurement.keyword && k.device === measurement.device);

  return (
    <div className="space-y-4">
      <Card
        title="リアルタイム計測"
        headingLevel={3}
        description="いま検索して、自社の順位・ランディングページ・AI Overviews の引用状況をその場で確認します。"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_10rem_12rem]">
          <Field label="キーワード" htmlFor={`${id}-kw`} required>
            <Input
              id={`${id}-kw`}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="AIO 対策"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !disabled) void measure();
              }}
            />
          </Field>
          <Field label="デバイス" htmlFor={`${id}-device`}>
            <Select id={`${id}-device`} value={device} onChange={(e) => setDevice(e.target.value as SerpDevice)}>
              <option value="desktop">{DEVICE_LABELS.desktop}</option>
              <option value="mobile">{DEVICE_LABELS.mobile}</option>
            </Select>
          </Field>
          <Field label="地域（任意）" htmlFor={`${id}-loc`}>
            <Input id={`${id}-loc`} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Tokyo, Japan" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void measure()}
            loading={state.phase === "running"}
            disabled={disabled || !keyword.trim()}
            title={
              !serpEnabled
                ? "SERPAPI_KEY が未設定のため計測できません"
                : !projectDomain
                  ? "自社ドメインを設定してください"
                  : undefined
            }
          >
            いま計測する
          </Button>
          {state.phase === "running" && (
            <Button variant="secondary" onClick={cancel}>
              中止
            </Button>
          )}
          {saved && <span className="text-[12px] text-muted">{saved}</span>}
        </div>
        {!serpEnabled && (
          <p className="mt-3 text-[12px] text-muted">
            SERPAPI_KEY が未設定のため計測はできません。キーワードの登録と過去の履歴の閲覧は利用できます。
          </p>
        )}
      </Card>

      {state.phase === "error" && <Callout tone="fail" title="計測できませんでした">{state.message}</Callout>}
      {result && !result.ok && (
        <Callout tone="fail" title="計測できませんでした">
          {result.error}
        </Callout>
      )}

      {measurement && (
        <Card
          title={`「${measurement.keyword}」の検索結果`}
          headingLevel={3}
          description={`${DEVICE_LABELS[measurement.device]}${measurement.location ? ` / ${measurement.location}` : ""} ・ 取得 ${new Date(measurement.fetchedAt).toLocaleString("ja-JP")}`}
          actions={
            !alreadyRegistered ? (
              <Button variant="secondary" size="sm" onClick={register}>
                キーワードに登録
              </Button>
            ) : (
              <Badge tone="neutral">登録済み</Badge>
            )
          }
        >
          <StatStrip
            items={[
              { label: "自社順位", value: measurement.rank ?? "圏外" },
              { label: "AI による概要", value: measurement.aiOverview.present ? "表示あり" : "表示なし" },
              {
                label: "AIO での自社引用",
                value: measurement.aiOverview.present ? (measurement.aiOverview.selfCited ? "あり" : "なし") : "—",
              },
              { label: "引用サイト数", value: measurement.aiOverview.references.length },
            ]}
          />

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-bold text-ink">自社のランディングページ</h4>
              {measurement.url ? (
                <p className="mt-1 text-[13px]">
                  <a
                    href={measurement.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-accent underline-offset-2 hover:underline"
                  >
                    {measurement.url}
                  </a>
                  {measurement.title && <span className="mt-1 block text-[12px] text-muted">{measurement.title}</span>}
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-muted">上位 100 件に自社ドメインは含まれていません（圏外）。</p>
              )}

              <h4 className="mt-4 text-sm font-bold text-ink">競合の順位</h4>
              {measurement.competitors.length === 0 ? (
                <p className="mt-1 text-[13px] text-muted">競合ドメインが登録されていません（設定画面で登録できます）。</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {measurement.competitors.map((c) => (
                    <li key={c.domain} className="flex items-center justify-between gap-2 border-b border-line py-1 text-[13px] last:border-0">
                      <span className="break-all">{c.domain}</span>
                      <RankCell rank={c.rank} />
                    </li>
                  ))}
                </ul>
              )}

              <h4 className="mt-4 text-sm font-bold text-ink">検索結果に出ていた要素</h4>
              <ul className="mt-1 flex flex-wrap gap-1">
                {measurement.features.length === 0 ? (
                  <li className="text-[13px] text-muted">—</li>
                ) : (
                  measurement.features.map((f) => (
                    <li key={f}>
                      <Badge tone="neutral">{SERP_FEATURE_LABELS[f as SerpFeature] ?? f}</Badge>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div>
              <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
                AI による概要
                <AioCell aioClass={classifyAio(measurement.aiOverview)} />
              </h4>
              <p className="mt-1 text-[12px] text-muted">
                {aioClassHint(classifyAio(measurement.aiOverview))}（
                {aioClassLabel(classifyAio(measurement.aiOverview))}）
              </p>
              {measurement.aiOverview.text ? (
                <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-ink">
                  {measurement.aiOverview.text}
                </p>
              ) : measurement.aiOverview.unavailable ? (
                <p className="mt-2 text-[13px] text-muted">
                  AI による概要は表示されていましたが、本文・引用元を取得できませんでした（未取得）。
                </p>
              ) : (
                <p className="mt-2 text-[13px] text-muted">AI による概要は表示されませんでした。</p>
              )}
              {measurement.aiOverview.references.length > 0 && (
                <>
                  <h4 className="mt-4 text-sm font-bold text-ink">引用サイト</h4>
                  <ol className="mt-1 space-y-1 text-[13px]">
                    {measurement.aiOverview.references.map((r, i) => (
                      <li key={r.url} className="border-b border-line py-1 last:border-0">
                        <span className="mr-1 text-[11px] text-muted tabular-nums">{i + 1}.</span>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-accent underline-offset-2 hover:underline"
                        >
                          {r.title}
                        </a>
                        <span className="ml-1 text-[11px] text-muted">{r.domain || shortPath(r.url)}</span>
                        {projectDomain && (r.domain === projectDomain || r.domain.endsWith(`.${projectDomain}`)) && (
                          <Badge tone="pass" className="ml-1">
                            自社
                          </Badge>
                        )}
                        {measurement.aiOverview.citedCompetitors?.some(
                          (d) => r.domain === d || r.domain.endsWith(`.${d}`),
                        ) && (
                          <Badge tone="warn" className="ml-1">
                            競合
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {state.phase === "idle" && (
        <EmptyState
          title="まだ計測していません"
          description="キーワードを入力して「いま計測する」を押すと、その時点の検索結果を取得します。結果は登録済みキーワードのときだけ履歴に残ります。"
        />
      )}
    </div>
  );
}
