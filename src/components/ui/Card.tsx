import type { ReactNode } from "react";

export interface CardProps {
  /** 見出し（h2 / h3）。番号付き見出しにしたいときは number */
  title?: ReactNode;
  number?: number | string;
  description?: ReactNode;
  /** 見出し右側のボタン等 */
  actions?: ReactNode;
  /** 見出しのレベル（既定 h2） */
  headingLevel?: 2 | 3;
  /** 印刷 / PDF で背景・枠を外すセクションにする（print-card） */
  printCard?: boolean;
  as?: "section" | "div" | "article";
  padding?: "none" | "sm" | "md";
  className?: string;
  children?: ReactNode;
  id?: string;
}

const PADDING = { none: "", sm: "p-4", md: "p-5 md:p-6" } as const;

/**
 * 白いシート（bg-panel + 1px 罫線 + 角丸 2px、影なし）。
 * カードの入れ子はしない。サブブロックは `border border-line rounded-sm` か `bg-surface` の帯だけ。
 */
export function Card({
  title,
  number,
  description,
  actions,
  headingLevel = 2,
  printCard = false,
  as = "section",
  padding = "md",
  className = "",
  children,
  id,
}: CardProps) {
  const Tag = as;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Tag
      id={id}
      className={`${printCard ? "print-card " : ""}rounded-sm border border-line bg-panel ${PADDING[padding]} ${className}`}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <Heading
                className={`flex items-center gap-3 text-ink ${headingLevel === 2 ? "text-lg" : "text-sm"} font-bold`}
              >
                {headingLevel === 2 && <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden />}
                {number !== undefined && <span className="tabular-nums">{number}.</span>}
                <span>{title}</span>
              </Heading>
            )}
            {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
          </div>
          {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
