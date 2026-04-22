"use client";

import Image from "next/image";
import { Copy, Check, QrCode } from "lucide-react";
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSmartWalletAddress } from "@/hooks/useSmartWalletAddress";
import { useToast } from "@/hooks/use-toast";

interface ReceiveModalProps {
  open: boolean;
  onClose: () => void;
}

export function ReceiveModal({ open, onClose }: ReceiveModalProps) {
  const { smartWalletAddress, isLoadingSmartWalletAddress } = useSmartWalletAddress();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(async () => {
    if (!smartWalletAddress) return;
    try {
      await navigator.clipboard.writeText(smartWalletAddress);
      setCopied(true);
      toast({ title: "Address copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied
    }
  }, [smartWalletAddress, toast]);

  const receiveUri = smartWalletAddress
    ? `ethereum:${smartWalletAddress}`
    : null;
  const qrUrl = receiveUri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(receiveUri)}&bgcolor=1a1130&color=ffffff`
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-card border-border/40 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            Receive Tokens
          </DialogTitle>
          <DialogDescription>
            Share your wallet address or let someone scan the QR with any EVM wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {isLoadingSmartWalletAddress ? (
            <div className="h-[200px] w-[200px] rounded-2xl bg-muted/25 animate-pulse" />
          ) : qrUrl ? (
            <div className="rounded-2xl border border-border/40 bg-white p-3">
              <Image
                src={qrUrl}
                alt="Wallet QR Code"
                width={200}
                height={200}
                className="rounded-lg"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex h-[200px] w-[200px] items-center justify-center rounded-2xl border border-dashed border-border/40 bg-muted/10">
              <p className="text-xs text-muted-foreground">No wallet connected</p>
            </div>
          )}

          {smartWalletAddress && (
            <div className="w-full space-y-3">
              <div className="rounded-xl border border-border/40 bg-background/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                  Your Address
                </p>
                <p className="font-mono text-xs text-foreground/80 break-all">
                  {smartWalletAddress}
                </p>
              </div>
              <Button
                onClick={() => void copyAddress()}
                className="w-full gap-2"
                variant="outline"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Address
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
