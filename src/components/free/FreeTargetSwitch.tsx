import Link from "next/link";
import { FREE_FEATURE, FREE_MEO_FEATURE } from "@/lib/features/registry";

/**
 * 無料診断の対象切り替え（サイト / 店舗）。2 つのページを行き来するリンク。
 * 入力欄が違う（URL と店名）ので同じフォームにはせず、ページを分けている。
 */
export function FreeTargetSwitch({ current }: { current: "site" | "meo" }) {
  const items = [
    { key: "site" as const, href: FREE_FEATURE.path, label: "サイトを診断（SEO・AIO）", hint: "URL を入れる" },
    { key: "meo" as const, href: FREE_MEO_FEATURE.path, label: "店舗を診断（MEO）", hint: "店名を入れる" },
  ];
  return (
    <nav aria-label="診断の対象" className="mt-3 grid gap-2 sm:grid-cols-2">
      {items.map((it) => {
        const selected = it.key === current;
        return (
          <Link
            key={it.key}
            href={it.href}
            aria-current={selected ? "page" : undefined}
            className={`rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-ink hover:bg-surface"
            }`}
          >
            <span className="block text-[13px] font-bold">{it.label}</span>
            <span className={`mt-0.5 block text-[11px] ${selected ? "text-accent" : "text-muted"}`}>{it.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
