"use client";

import { Inbox, ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
  showCta?: boolean;
}

export function EmptyState({
  title = "No Payroll Data Yet",
  subtitle = "Once you process your first payroll batch, analytics and history will appear here automatically.",
  showCta = true,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-card/30 backdrop-blur-sm px-6 py-16 text-center">
      {/* Icon composition */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 shadow-lg shadow-primary/10">
          <Inbox className="h-9 w-9 text-primary/60" />
        </div>
      </div>

      <h3 className="text-xl font-bold tracking-tight text-foreground/90">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground/70">
        {subtitle}
      </p>

      {showCta && (
        <Link href="/">
          <Button
            className="mt-6 gap-2 glow-btn bg-gradient-to-r from-primary to-violet-500 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110"
            size="lg"
          >
            Go to Payroll
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      )}
    </div>
  );
}
