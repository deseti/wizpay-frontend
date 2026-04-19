"use client";

import { ExternalLink, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { EXPLORER_BASE_URL } from "@/lib/wizpay";

interface TxResultProps {
  txHash: string | null;
  status: "success" | "error" | "pending";
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function TxResult({ txHash, status, title, message, onRetry }: TxResultProps) {
  const [copied, setCopied] = useState(false);

  const copyHash = useCallback(async () => {
    if (!txHash) return;
    await navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [txHash]);

  const explorerUrl = txHash ? `${EXPLORER_BASE_URL}/tx/${txHash}` : null;

  if (status === "error") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 space-y-3">
        <p className="text-sm font-medium text-destructive">
          {title ?? "Transaction failed"}
        </p>
        {message && (
          <p className="text-xs text-destructive/80">{message}</p>
        )}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            Try Again
          </Button>
        )}
      </div>
    );
  }

  if (status === "success" && txHash) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 space-y-2">
        <p className="text-sm font-medium text-emerald-300">
          {title ?? "Transaction confirmed"}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs text-muted-foreground font-mono">
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </code>
          <button
            onClick={() => void copyHash()}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              View on Explorer
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    );
  }

  return null;
}
