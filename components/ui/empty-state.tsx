"use client";

import { cn } from "@/lib/utils";

interface EmptyStateViewProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyStateView({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateViewProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-card/20 backdrop-blur-sm px-6 py-14 text-center animate-fade-up",
        className
      )}
    >
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 shadow-lg shadow-primary/10">
          {icon}
        </div>
      </div>

      <h3 className="text-lg font-bold tracking-tight text-foreground/90">
        {title}
      </h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground/70">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
