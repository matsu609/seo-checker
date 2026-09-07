"use client";

/**
 * 対象モデルの選択。各プロバイダの「設定済み / 未設定」を必ず見せる
 * （未設定のモデルも選べるが、実行すればその行だけ失敗として記録される）。
 */
import { Badge } from "@/components/ui";
import type { IntegrationStatus } from "@/lib/features/integrations";
import { PROVIDERS_META_LIST } from "@/lib/llmo/providers/meta";
import type { ProviderId } from "@/lib/llmo/types";

export interface ModelPickerProps {
  value: readonly ProviderId[];
  onChange: (models: ProviderId[]) => void;
  status: IntegrationStatus | null;
  disabled?: boolean;
}

export function ModelPicker({ value, onChange, status, disabled = false }: ModelPickerProps) {
  function toggle(id: ProviderId, checked: boolean) {
    const next = PROVIDERS_META_LIST.filter((m) => (m.id === id ? checked : value.includes(m.id))).map((m) => m.id);
    onChange(next);
  }
  return (
    <fieldset className="rounded-sm border border-line p-3">
      <legend className="px-1 text-[13px] font-bold text-ink">対象モデル</legend>
      <ul className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS_META_LIST.map((meta) => {
          const configured = status?.[meta.integration] === true;
          return (
            <li key={meta.id} className="flex items-start gap-2">
              <input
                id={`llmo-model-${meta.id}`}
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-accent"
                checked={value.includes(meta.id)}
                // 未設定のモデルは新たに選べないが、すでに選ばれているものは外せるようにする
                disabled={disabled || (!configured && !value.includes(meta.id))}
                onChange={(e) => toggle(meta.id, e.target.checked)}
              />
              <label htmlFor={`llmo-model-${meta.id}`} className="min-w-0 text-[13px] leading-snug text-ink">
                <span className="mr-1.5 font-bold">{meta.label}</span>
                <Badge tone={configured ? "pass" : "neutral"} icon={false}>
                  {configured ? "設定済み" : "未設定"}
                </Badge>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {meta.searchNote}
                  {!configured && `／${meta.envVar} が必要`}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
