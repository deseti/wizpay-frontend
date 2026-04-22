"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ImageUp, Loader2, ScanLine } from "lucide-react";
import { getAddress, isAddress } from "viem";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RecipientScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (address: string) => void;
}

interface Html5QrcodeLike {
  start: (
    cameraConfig: { facingMode: string },
    config: { fps: number; qrbox: number },
    onSuccess: (decodedText: string) => void,
    onError?: (errorMessage: string) => void
  ) => Promise<unknown>;
  stop: () => Promise<unknown>;
  clear: () => Promise<unknown>;
  scanFile: (file: File, showImage?: boolean) => Promise<string>;
}

function normalizeScannedAddress(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  const withoutScheme = trimmed.toLowerCase().startsWith("ethereum:")
    ? trimmed.slice("ethereum:".length)
    : trimmed;
  const withoutQuery = withoutScheme.split("?")[0];
  const match = withoutQuery.match(/0x[a-fA-F0-9]{40}/);

  if (!match || !isAddress(match[0])) {
    return null;
  }

  return getAddress(match[0]);
}

export function RecipientScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: RecipientScannerDialogProps) {
  const scannerElementId = useId().replace(/:/g, "-");
  const scannerRef = useRef<Html5QrcodeLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isStartingScanner, setIsStartingScanner] = useState(false);
  const [isScanningImage, setIsScanningImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;

    if (!scanner) {
      return;
    }

    scannerRef.current = null;

    try {
      await scanner.stop();
    } catch {
      // Scanner may not be fully started yet.
    }

    try {
      await scanner.clear();
    } catch {
      // The preview area may already be cleared.
    }
  }, []);

  const handleDetectedValue = useCallback(
    async (decodedText: string) => {
      const normalized = normalizeScannedAddress(decodedText);

      if (!normalized) {
        setErrorMessage("This QR code does not contain a wallet address.");
        return;
      }

      await stopScanner();
      onDetected(normalized);
      onOpenChange(false);
    },
    [onDetected, onOpenChange, stopScanner]
  );

  const startScanner = useCallback(async () => {
    setErrorMessage(null);
    setIsStartingScanner(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(
        scannerElementId
      ) as unknown as Html5QrcodeLike;

      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        (decodedText) => {
          void handleDetectedValue(decodedText);
        }
      );
    } catch {
      setErrorMessage(
        "Camera scan is not available right now. Try uploading a QR image instead."
      );
    } finally {
      setIsStartingScanner(false);
    }
  }, [handleDetectedValue, scannerElementId]);

  useEffect(() => {
    if (!open) {
      void stopScanner();
      setErrorMessage(null);
      return;
    }

    void startScanner();

    return () => {
      void stopScanner();
    };
  }, [open, startScanner, stopScanner]);

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      setErrorMessage(null);
      setIsScanningImage(true);

      try {
        await stopScanner();

        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(
          scannerElementId
        ) as unknown as Html5QrcodeLike;

        scannerRef.current = scanner;

        const decodedText = await scanner.scanFile(file, true);
        await handleDetectedValue(decodedText);
      } catch {
        setErrorMessage("We could not read a wallet address from that image.");
      } finally {
        event.target.value = "";
        setIsScanningImage(false);
      }
    },
    [handleDetectedValue, scannerElementId, stopScanner]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-lg border-border/40 bg-background/95">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" />
            Scan wallet QR
          </DialogTitle>
          <DialogDescription>
            Point your camera at a wallet QR, or upload a screenshot if the
            camera is not available.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/40">
            <div id={scannerElementId} className="min-h-[260px] w-full" />
          </div>

          {isStartingScanner ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting camera...
            </p>
          ) : null}

          {errorMessage ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-border/40"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanningImage}
            >
              {isScanningImage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageUp className="h-4 w-4" />
              )}
              {isScanningImage ? "Reading image..." : "Upload QR image"}
            </Button>
            <p className="text-xs text-muted-foreground/60">
              Supports plain wallet QR or the standard
              <span className="font-mono"> ethereum:0x...</span> format.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}