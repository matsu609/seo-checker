import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** データが無いときの帯。ダミーを出さず、次に何をすればよいかだけ書く */
export function EmptyState({ title, description, action, icon, className = "" }: EmptyStateProps) {
  return (
    <div className={`rounded-sm border border-dashed border-line bg-surface px-4 py-8 text-center ${className}`}>
      {icon && <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center text-muted">{icon}</div>}
      <p className="text-sm font-bold text-ink">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
