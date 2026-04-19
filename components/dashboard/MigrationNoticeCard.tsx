"use client";

import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function MigrationNoticeCard({
  completed,
  pending,
  title,
  description,
}: {
  completed: string[];
  pending: string[];
  title: string;
  description: string;
}) {
  return (
    <Card className="glass-card border-border/40 overflow-hidden">
      <CardHeader className="border-b border-border/30">
        <CardTitle className="flex items-center gap-2 text-xl">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <AlertTriangle className="h-4.5 w-4.5" />
          </div>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 py-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-300/90">
            <CheckCircle2 className="h-4 w-4" />
            Working now
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {completed.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300/90">
            <Clock3 className="h-4 w-4" />
            Next in migration
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {pending.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
