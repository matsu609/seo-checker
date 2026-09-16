"use client";

/**
 * 設定画面の「GA4 イベントの割り当て」（docs/dev/diagnosis-rules-spec.md §5）。
 *
 * 会社ごとに GA4 のイベント名が違うので、内部の 7 つの共通イベントに寄せる。
 * **まず自動で当て、外れた分だけ人が直す**。自動判定の結果も必ず見せる
 * （何をどう数えたか分からないと、出てきた数字を信用できないため）。
 *
 * GA4 を 1 回叩くので、ボタンを押したときだけ読み込む。
 */
import { useState } from "react";
import { Badge, Button, Callout, Card, Select } from "@/components/ui";
import { COMMON_EVENTS, COMMON_EVENT_LABELS, type CommonEvent, type EventMapping } from "@/lib/diagnosis/events";

interface EventRow {
  name: string;
  count: number;
  sessions: number;
  keyEvents: number;
}

interface Loaded {
  propertyId: string;
  days: number;
  events: EventRow[];
  mapping: EventMapping;
  overrides: Partial<EventMapping>;
  unmapped: string[];
}

/** イベント名 → いま割り当てられている共通イベント（無ければ ""） */
function assignmentsOf(loaded: Loaded): Record<string, CommonEvent | ""> {
  const out: Record<string, CommonEvent | ""> = {};
  for (const e of loaded.events) out[e.name] = "";
  for (const common of COMMON_EVENTS) {
    for (const name of loaded.mapping[common]) out[name] = common;
  }
  return out;
}

export function EventMappingCard() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [assigned, setAssigned] = useState<Record<string, CommonEvent | "">>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "pass" | "fail" | "info"; text: string } | null>(null);

  async function load() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/google/events", { cache: "no-store" });
      const json = (await res.json()) as Loaded & { error?: string };
      if (!res.ok) {
        setMessage({ tone: "fail", text: json.error ?? "イベントを読み込めませんでした。" });
        return;
      }
      setLoaded(json);
      setAssigned(assignmentsOf(json));
      if (json.events.length === 0) {
        setMessage({ tone: "info", text: "この期間に記録されたイベントがありません。計測が動いているか確認してください。" });
      }
    } catch {
      setMessage({ tone: "fail", text: "イベントを読み込めませんでした。" });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!loaded) return;
    setBusy(true);
    setMessage(null);
    const mapping: Record<string, string[]> = {};
    for (const common of COMMON_EVENTS) mapping[common] = [];
    for (const [name, common] of Object.entries(assigned)) {
      if (common) mapping[common].push(name);
    }
    try {
      const res = await fetch("/api/google/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage({ tone: "fail", text: json.error ?? "保存できませんでした。" });
        return;
      }
      setMessage({ tone: "pass", text: "保存しました。次回のパワーアップ分析からこの割り当てで数えます。" });
    } catch {
      setMessage({ tone: "fail", text: "保存できませんでした。" });
    } finally {
      setBusy(false);
    }
  }

  const summary = loaded
    ? COMMON_EVENTS.map((common) => ({
        common,
        names: Object.entries(assigned)
          .filter(([, v]) => v === common)
          .map(([name]) => name),
      }))
    : [];

  return (
    <Card
      title="GA4 イベントの割り当て"
      description="問い合わせボタンのクリックやフォームの完了は、会社ごとにイベント名が違います。診断で数えられるよう、GA4 のイベント名を共通の 7 種類に割り当てます。まず自動で当てるので、外れているものだけ直してください。"
      actions={
        <Button size="sm" variant="secondary" onClick={load} disabled={busy}>
          {loaded ? "読み込み直す" : "GA4 のイベントを読み込む"}
        </Button>
      }
    >
      {message && (
        <Callout tone={message.tone} className="mb-3">
          {message.text}
        </Callout>
      )}

      {!loaded ? (
        <p className="text-[13px] text-muted">
          ボタンを押すと、連携中の GA4 プロパティに直近 28 日で記録されたイベント名を読み込みます。割り当てをしなくても、よくあるイベント名（contact_click / generate_lead
          など）は自動で当たります。
        </p>
      ) : (
        <>
          <p className="mb-3 text-[12px] text-muted">
            プロパティ {loaded.propertyId} ／ 直近 {loaded.days} 日 ／ イベント {loaded.events.length} 種類
          </p>

          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-1.5 pr-2 font-medium">イベント名</th>
                  <th className="py-1.5 pr-2 text-right font-medium">回数</th>
                  <th className="py-1.5 pr-2 text-right font-medium">セッション</th>
                  <th className="py-1.5 font-medium">何として数えるか</th>
                </tr>
              </thead>
              <tbody>
                {loaded.events.map((e) => (
                  <tr key={e.name} className="border-b border-line/60">
                    <td className="py-1.5 pr-2">
                      <span className="break-all">{e.name}</span>
                      {e.keyEvents > 0 && (
                        <Badge tone="pass" icon={false} className="ml-1">
                          キーイベント
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{e.count.toLocaleString("ja-JP")}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{e.sessions.toLocaleString("ja-JP")}</td>
                    <td className="py-1.5">
                      <Select
                        aria-label={`${e.name} の割り当て`}
                        value={assigned[e.name] ?? ""}
                        onChange={(ev) => setAssigned({ ...assigned, [e.name]: ev.target.value as CommonEvent | "" })}
                      >
                        <option value="">（使わない）</option>
                        {COMMON_EVENTS.map((common) => (
                          <option key={common} value={common}>
                            {COMMON_EVENT_LABELS[common]}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-3 rounded-lg border border-line bg-surface p-3 text-[12px]">
            <h3 className="font-medium">この設定で数えるもの</h3>
            <ul className="mt-1 space-y-0.5 text-muted">
              {summary.map((s) => (
                <li key={s.common}>
                  {COMMON_EVENT_LABELS[s.common]}: {s.names.length > 0 ? s.names.join(" / ") : "（割り当て無し。この段階は「未計測」と表示されます）"}
                </li>
              ))}
            </ul>
          </div>

          <Button onClick={save} disabled={busy}>
            この割り当てを保存する
          </Button>
        </>
      )}
    </Card>
  );
}
