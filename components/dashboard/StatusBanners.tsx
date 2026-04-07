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

interface StatusBannersProps {
  statusMessage: string | null;
  errorMessage: string | null;
  approveTxHash: Hex | null;
  submitTxHash: Hex | null;
  submitState: StepState;
  copiedHash: Hex | null;
  copyHash: (hash: Hex | null) => Promise<void>;
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
        <Card className="glass-card border-primary/30">
          <CardContent className="flex items-start gap-3 pt-4">
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Batch status
              </p>
              <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {errorMessage ? (
        <Card className="glass-card border-destructive/40">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                Submission blocked
              </p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {approveTxHash || submitTxHash ? (
        <Card className="glass-card border-border/60">
          <CardHeader>
            <CardTitle>Latest Transactions</CardTitle>
            <CardDescription>
              Approval and batch hashes are linked directly to ArcScan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {approveTxHash ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Approval</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {approveTxHash}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyHash(approveTxHash)}
                    className="gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedHash === approveTxHash ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1"
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
              <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Batch Submit</p>
                    {submitState === "confirmed" ? (
                      <Badge className="gap-1 bg-emerald-500/15 text-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Confirmed
                      </Badge>
                    ) : null}
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {submitTxHash}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyHash(submitTxHash)}
                    className="gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedHash === submitTxHash ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1"
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
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
