"use client";

import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  className?: string;
  lines?: number;
}

export function SkeletonCard({ className, lines = 3 }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl border border-border/40 p-5 space-y-4",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-muted/30 animate-pulse" />
        <div className="h-4 w-24 rounded bg-muted/25 animate-pulse" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-muted/20 animate-pulse"
          style={{ width: `${75 - i * 12}%`, animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

interface SkeletonRowProps {
  columns?: number;
}

export function SkeletonRow({ columns = 5 }: SkeletonRowProps) {
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-border/20 last:border-0">
      {Array.from({ length: columns }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-muted/20 animate-pulse flex-1"
          style={{ maxWidth: i === 0 ? "8rem" : "6rem", animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

export function SkeletonBalance() {
  return (
    <div className="space-y-2">
      <div className="h-8 w-32 rounded bg-muted/25 animate-pulse" />
      <div className="h-3 w-20 rounded bg-muted/15 animate-pulse" />
    </div>
  );
}
