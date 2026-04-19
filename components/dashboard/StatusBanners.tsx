"use client";

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { Hex } from "viem";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StepState } from "@/lib/types";
import { EXPLORER_BASE_URL } from "@/lib/wizpay";

function txLink(hash: Hex) {
  return `${EXPLORER_BASE_URL}/tx/${hash}`;
}

function isExplorerHash(value: string): value is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

interface StatusBannersProps {
  statusMessage: string | null;
  errorMessage: string | null;
  approveTxHash: Hex | null;
  submitTxHash: string | null;
  submitState: StepState;
  copiedHash: string | null;
  copyHash: (hash: string | null) => Promise<void>;
}

export function StatusBanners({
  statusMessage,
  errorMessage,
  approveTxHash,
  submitTxHash,
  submitState,
  copiedHash,
  copyHash,
}: StatusBannersProps) {
  return (
    <>
      {statusMessage ? (
        <Card className="glass-card border-primary/25 animate-fade-up">
          <CardContent className="flex items-start gap-3 pt-4">
            <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Batch status
              </p>
              <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {errorMessage ? (
        <Card className="glass-card border-destructive/30 animate-fade-up">
          <CardContent className="flex items-start gap-3 pt-4">
            <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive/15">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">
                Submission blocked
              </p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {approveTxHash || submitTxHash ? (
        <Card className="glass-card border-border/40 animate-fade-up">
          <CardHeader>
            <CardTitle>Latest Transactions</CardTitle>
            <CardDescription>
              Approval hashes and the latest settlement reference.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {approveTxHash ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-background/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Approval</p>
                  <p className="break-all font-mono text-xs text-muted-foreground/70">
                    {approveTxHash}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyHash(approveTxHash)}
                    className="gap-1 border-border/40 hover:border-primary/20"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedHash === approveTxHash ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1 border-border/40 hover:border-primary/20"
                  >
                    <a
                      href={txLink(approveTxHash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      ArcScan
                    </a>
                  </Button>
                </div>
              </div>
            ) : null}

            {submitTxHash ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-background/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {isExplorerHash(submitTxHash)
                        ? "Batch Submit"
                        : "Circle Reference"}
                    </p>
                    {submitState === "confirmed" ? (
                      <Badge className="gap-1 bg-emerald-500/15 text-emerald-300 border-emerald-500/25">
                        <CheckCircle2 className="h-3 w-3" />
                        {isExplorerHash(submitTxHash) ? "Confirmed" : "Settled"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground/70">
                    {submitTxHash}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyHash(submitTxHash)}
                    className="gap-1 border-border/40 hover:border-primary/20"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedHash === submitTxHash ? "Copied" : "Copy"}
                  </Button>
                  {isExplorerHash(submitTxHash) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="gap-1 border-border/40 hover:border-primary/20"
                    >
                      <a
                        href={txLink(submitTxHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        ArcScan
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
