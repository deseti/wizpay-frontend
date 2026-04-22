"use client";

import { useRef, useState } from "react";

import {
  AlertCircle,
  Download,
  Loader2,
  Plus,
  Rocket,
  ScanLine,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { getAddress, isAddress } from "viem";

import { RecipientScannerDialog } from "@/components/dashboard/RecipientScannerDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  PreparedRecipient,
  QuoteSummary,
} from "@/lib/types";
import {
  activeFxEngineAddress,
  fxProviderLabel,
  isStableFxMode,
  permit2Address,
} from "@/lib/fx-config";
import {
  formatCompactAddress,
  formatTokenAmount,
  TOKEN_OPTIONS,
  createRecipient,
  type RecipientDraft,
  type TokenSymbol,
} from "@/lib/wizpay";
import { useToast } from "@/hooks/use-toast";
import { useActionGuard } from "@/hooks/useActionGuard";

const RECIPIENT_PREVIEW_LIMIT = 5;
const CSV_TEMPLATE_CONTENT = [
  "address,amount,token",
  "0x1111111111111111111111111111111111111111,100,USDC",
  "0x2222222222222222222222222222222222222222,250.50,EURC",
].join("\n");

interface CsvPreviewRow {
  lineNumber: number;
  address: string;
  amount: string;
  token: string;
  errors: string[];
}

interface CsvPreviewState {
  fileName: string;
  rows: CsvPreviewRow[];
  validRows: RecipientDraft[];
  invalidCount: number;
}

function cleanCsvCell(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "").trim();
}

function buildCsvPreview(
  fileName: string,
  text: string,
  selectedToken: TokenSymbol
): CsvPreviewState | null {
  const cleanText = text.replace(/^\uFEFF/, "");
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const firstLine = lines[0]?.toLowerCase() ?? "";
  const startIndex =
    firstLine.includes("address") ||
    firstLine.includes("wallet") ||
    firstLine.includes("recipient")
      ? 1
      : 0;
  const sampleLine = lines[startIndex] ?? lines[0] ?? "";
  const delimiter = sampleLine.includes(";") ? ";" : ",";
  const rows: CsvPreviewRow[] = [];
  const validRows: RecipientDraft[] = [];
  const seenAddresses = new Set<string>();

  for (let index = startIndex; index < lines.length; index += 1) {
    const [addressRaw = "", amountRaw = "", tokenRaw = ""] = lines[index]
      .split(delimiter)
      .map(cleanCsvCell);
    const errors: string[] = [];
    const normalizedTokenRaw = tokenRaw.toUpperCase();
    const resolvedToken: TokenSymbol =
      normalizedTokenRaw === "EURC"
        ? "EURC"
        : normalizedTokenRaw === "USDC"
          ? "USDC"
          : selectedToken;
    const addressMatch = addressRaw.match(/0x[a-fA-F0-9]{40}/);
    const normalizedAddress =
      addressMatch && isAddress(addressMatch[0])
        ? getAddress(addressMatch[0])
        : null;

    if (!normalizedAddress) {
      errors.push("Wallet address is not valid.");
    }

    if (!amountRaw || Number.isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
      errors.push("Amount must be greater than 0.");
    }

    if (tokenRaw && normalizedTokenRaw !== "USDC" && normalizedTokenRaw !== "EURC") {
      errors.push("Token must be USDC or EURC.");
    }

    if (normalizedAddress) {
      const dedupeKey = normalizedAddress.toLowerCase();

      if (seenAddresses.has(dedupeKey)) {
        errors.push("Duplicate address found in this file.");
      } else {
        seenAddresses.add(dedupeKey);
      }
    }

    rows.push({
      lineNumber: index + 1,
      address: addressRaw,
      amount: amountRaw,
      token: tokenRaw || resolvedToken,
      errors,
    });

    if (errors.length === 0 && normalizedAddress) {
      validRows.push({
        ...createRecipient(resolvedToken),
        address: normalizedAddress,
        amount: amountRaw,
        targetToken: resolvedToken,
      });
    }
  }

  return {
    fileName,
    rows,
    validRows,
    invalidCount: rows.filter((row) => row.errors.length > 0).length,
  };
}

interface BatchComposerProps {
  selectedToken: TokenSymbol;
  activeToken: { symbol: TokenSymbol; decimals: number };
  recipients: RecipientDraft[];
  preparedRecipients: PreparedRecipient[];
  referenceId: string;
  onReferenceIdChange: (value: string) => void;
  errors: Record<string, string>;
  clearFieldError: (key: string) => void;
  batchAmount: bigint;
  validRecipientCount: number;
  quoteSummary: QuoteSummary;
  quoteLoading: boolean;
  quoteRefreshing: boolean;
  rowDiagnostics: (string | null)[];
  estimatedGas: bigint | null;
  isBusy: boolean;
  insufficientBalance: boolean;
  updateRecipient: (id: string, field: keyof Omit<RecipientDraft, "id">, value: string) => void;
  addRecipient: () => void;
  removeRecipient: (id: string) => void;
  resetComposer: () => void;
  setErrorMessage: (msg: string | null) => void;
  importRecipients: (rows: RecipientDraft[]) => void;
  totalBatches: number;
  currentBatchNumber: number;
  smartBatchAvailable?: boolean;
  smartBatchRunning?: boolean;
  smartBatchReason?: string | null;
  smartBatchButtonText?: string | null;
  smartBatchHelperText?: string | null;
  handleSmartBatchSubmit?: () => Promise<void>;
}

export function BatchComposer({
  selectedToken,
  activeToken,
  recipients,
  preparedRecipients,
  referenceId,
  onReferenceIdChange,
  errors,
  clearFieldError,
  batchAmount,
  validRecipientCount,
  quoteSummary,
  quoteLoading,
  quoteRefreshing,
  rowDiagnostics,
  estimatedGas,
  isBusy,
  insufficientBalance,
  updateRecipient,
  addRecipient,
  removeRecipient,
  resetComposer,
  setErrorMessage,
  importRecipients,
  totalBatches,
  currentBatchNumber,
  smartBatchAvailable = false,
  smartBatchRunning = false,
  smartBatchReason,
  smartBatchButtonText,
  smartBatchHelperText,
  handleSmartBatchSubmit,
}: BatchComposerProps) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewState | null>(null);
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const [scannerRecipientId, setScannerRecipientId] = useState<string | null>(
    null
  );
  const { toast } = useToast();
  const canSend = smartBatchAvailable && Boolean(handleSmartBatchSubmit);
  const { isProcessing: isSendGuarded, guard: guardSend } = useActionGuard();
  const visibleRecipients = preparedRecipients.slice(0, RECIPIENT_PREVIEW_LIMIT);
  const hiddenRecipientsCount = Math.max(
    0,
    preparedRecipients.length - RECIPIENT_PREVIEW_LIMIT
  );

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE_CONTENT], {
      type: "text/csv;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = "wizpay-recipients-template.csv";
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const handleScannedAddress = (address: string) => {
    if (!scannerRecipientId) {
      return;
    }

    updateRecipient(scannerRecipientId, "address", address);
    clearFieldError(`${scannerRecipientId}-address`);
    setErrorMessage(null);
    setScannerRecipientId(null);
    toast({
      title: "Address added",
      description: "The scanned wallet address was filled in for you.",
    });
  };

  const handleConfirmCsvImport = () => {
    if (!csvPreview || csvPreview.validRows.length === 0) {
      return;
    }

    importRecipients(csvPreview.validRows);
    setCsvPreview(null);

    if (csvPreview.invalidCount > 0) {
      setErrorMessage(
        `Imported ${csvPreview.validRows.length} valid rows. ${csvPreview.invalidCount} rows still need fixes in the source file.`
      );
      toast({
        title: "Imported with review notes",
        description: `${csvPreview.validRows.length} rows were added. ${csvPreview.invalidCount} rows were skipped.`,
      });
      return;
    }

    setErrorMessage(null);
    toast({
      title: "CSV imported",
      description: `${csvPreview.validRows.length} recipients are ready to send.`,
    });
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvLoading(true);

    const reader = new FileReader();

    reader.onerror = () => {
      setCsvLoading(false);
      toast({
        title: "CSV Upload Failed",
        description: "Could not read the file. Please check it is a valid .csv file.",
        variant: "destructive",
      });
      // Reset input so the same file can be re-uploaded
      if (csvInputRef.current) csvInputRef.current.value = "";
    };

    reader.onload = (event) => {
      const text = event.target?.result as string;

      if (!text || !text.trim()) {
        setCsvLoading(false);
        toast({
          title: "CSV Upload Failed",
          description: "The file appears to be empty.",
          variant: "destructive",
        });
        if (csvInputRef.current) csvInputRef.current.value = "";
        return;
      }

      const preview = buildCsvPreview(file.name, text, selectedToken);
      setCsvLoading(false);

      if (!preview || preview.rows.length === 0) {
        toast({
          title: "CSV Import Failed",
          description: "No rows were found in the file.",
          variant: "destructive",
        });
        if (csvInputRef.current) csvInputRef.current.value = "";
        return;
      }

      setCsvPreview(preview);

      if (preview.validRows.length === 0) {
        toast({
          title: "CSV needs review",
          description: "No valid rows yet. Review the row errors before importing.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "CSV ready to review",
          description: `${preview.rows.length} rows parsed. Review before importing.`,
        });
      }

      if (csvInputRef.current) csvInputRef.current.value = "";
    };

    reader.readAsText(file);
  };

  return (
    <>
      <Card className="glass-card border-border/40">
      <CardHeader className="soft-divider border-b border-border/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-lg">
              {isStableFxMode
                ? "Official Circle StableFX Payroll"
                : "StableFX Adapter V2 Payroll"}
            </CardTitle>
            <CardDescription>
              {isStableFxMode
                ? "Circle quote, Permit2 signature, and FxEscrow settlement for cross-currency rows. Same-token rows use direct Circle transfers on Arc."
                : "Send one input token, let each recipient choose USDC or EURC, and route cross-currency rows through the on-chain StableFX adapter pool."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {totalBatches > 1 && (
              <Badge variant="default" className="font-mono text-[11px] bg-primary text-primary-foreground">
                Batch {currentBatchNumber} of {totalBatches}
              </Badge>
            )}
            <Badge variant="outline" className="font-mono text-[11px] border-primary/20 text-primary/70 bg-primary/5">
              {`${fxProviderLabel}: ${formatCompactAddress(activeFxEngineAddress)}`}
            </Badge>
            {isStableFxMode ? (
              <Badge variant="outline" className="font-mono text-[11px] border-sky-500/20 text-sky-300/80 bg-sky-500/5">
                Permit2: {formatCompactAddress(permit2Address)}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-emerald-500/20 text-emerald-300/80 bg-emerald-500/5">
              {validRecipientCount}/{recipients.length} valid
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {/* Reference ID + Draft Summary */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-1.5">
            <label
              htmlFor="referenceId"
              className="text-sm font-medium text-foreground"
            >
              Reference ID or Memo
            </label>
            <Input
              id="referenceId"
              placeholder="PAYROLL-APR-2026"
              value={referenceId}
              onChange={(event) => {
                onReferenceIdChange(event.target.value);
                clearFieldError("referenceId");
                setErrorMessage(null);
              }}
              disabled={isBusy}
              className="h-11 bg-background/50 border-border/40"
              aria-invalid={Boolean(errors.referenceId)}
            />
            {errors.referenceId ? (
              <p className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {errors.referenceId}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/70">
                This memo is stored on-chain in the batch event.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold">
              Draft Summary
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Recipients</span>
                <span className="font-mono font-medium">
                  {preparedRecipients.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total amount</span>
                <span className="font-mono font-medium">
                  {formatTokenAmount(batchAmount, activeToken.decimals)}{" "}
                  {activeToken.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated receive</span>
                {quoteLoading ? (
                  <Skeleton className="h-4 w-24 bg-muted/20" />
                ) : (
                  <span className="font-mono">
                    {formatTokenAmount(
                      quoteSummary.totalEstimatedOut,
                      activeToken.decimals
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Est. fees</span>
                {quoteLoading ? (
                  <Skeleton className="h-4 w-24 bg-muted/20" />
                ) : (
                  <span className="font-mono">
                    {formatTokenAmount(
                      quoteSummary.totalFees,
                      activeToken.decimals
                    )}{" "}
                    {activeToken.symbol}
                  </span>
                )}
              </div>
            </div>
            {quoteRefreshing ? (
              <p className="mt-3 text-[11px] text-muted-foreground/60">
                Updating quotes in the background...
              </p>
            ) : null}
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden rounded-2xl border border-border/40 overflow-hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/30">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Wallet Address</TableHead>
                <TableHead className="w-40">Target Token</TableHead>
                <TableHead className="w-40">You Send</TableHead>
                <TableHead className="w-40">They Receive</TableHead>
                <TableHead className="w-28">Route</TableHead>
                <TableHead className="w-16 text-right"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRecipients.map((recipient, index) => {
                const estimatedOut =
                  quoteSummary.estimatedAmountsOut[index] ?? 0n;
                const diagnostic = rowDiagnostics[index];
                const routeIsDirect =
                  recipient.targetToken === selectedToken;

                return (
                  <TableRow key={recipient.id} className="align-top border-border/20 hover:bg-primary/3 transition-colors">
                    <TableCell className="pt-3 font-mono text-xs text-muted-foreground/60">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-start gap-2">
                          <Input
                            placeholder="0x..."
                            value={recipient.address}
                            onChange={(event) =>
                              updateRecipient(
                                recipient.id,
                                "address",
                                event.target.value
                              )
                            }
                            disabled={isBusy}
                            className="h-10 flex-1 bg-background/50 font-mono text-xs border-border/40"
                            aria-invalid={Boolean(
                              errors[`${recipient.id}-address`]
                            )}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setScannerRecipientId(recipient.id)}
                            disabled={isBusy}
                            aria-label={`Scan QR for recipient ${index + 1}`}
                            className="mt-0.5 border-border/40"
                          >
                            <ScanLine className="h-4 w-4" />
                          </Button>
                        </div>
                        {errors[`${recipient.id}-address`] ? (
                          <p className="text-xs text-destructive">
                            {errors[`${recipient.id}-address`]}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={recipient.targetToken}
                        onValueChange={(value) =>
                          updateRecipient(
                            recipient.id,
                            "targetToken",
                            value
                          )
                        }
                        disabled={isBusy}
                      >
                        <SelectTrigger className="h-10 bg-background/50 border-border/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TOKEN_OPTIONS.map((token) => (
                            <SelectItem
                              key={`${recipient.id}-${token.symbol}`}
                              value={token.symbol}
                            >
                              {token.symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.000001"
                          placeholder="0.00"
                          value={recipient.amount}
                          onChange={(event) =>
                            updateRecipient(
                              recipient.id,
                              "amount",
                              event.target.value
                            )
                          }
                          disabled={isBusy}
                          className="h-10 bg-background/50 tabular-nums border-border/40"
                          aria-invalid={Boolean(
                            errors[`${recipient.id}-amount`]
                          )}
                        />
                        {errors[`${recipient.id}-amount`] ? (
                          <p className="text-xs text-destructive">
                            {errors[`${recipient.id}-amount`]}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {quoteLoading ? (
                          <Skeleton className="h-4 w-24 bg-muted/20" />
                        ) : (
                          <p className="font-mono text-sm">
                            {formatTokenAmount(estimatedOut, 6)}{" "}
                            {recipient.targetToken}
                          </p>
                        )}
                        {diagnostic ? (
                          <p className="text-xs text-amber-300/80">
                            {diagnostic}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/60">
                            {quoteLoading
                              ? "Loading quote..."
                              : quoteRefreshing
                                ? "Refreshing quote..."
                                : "Live quote from chain"}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={routeIsDirect ? "border-emerald-500/20 text-emerald-300/80 bg-emerald-500/5" : "border-amber-500/20 text-amber-300/80 bg-amber-500/5"}>
                        {routeIsDirect ? "Direct" : "Swap"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeRecipient(recipient.id)}
                        disabled={recipients.length === 1 || isBusy}
                        aria-label={`Remove recipient ${index + 1}`}
                        className="hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {visibleRecipients.map((recipient, index) => {
            const estimatedOut =
              quoteSummary.estimatedAmountsOut[index] ?? 0n;
            const diagnostic = rowDiagnostics[index];

            return (
              <Card
                key={recipient.id}
                className="surface-panel border border-border/40"
                size="sm"
              >
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm">
                        Recipient {index + 1}
                      </CardTitle>
                      <CardDescription>
                        {recipient.targetToken === selectedToken
                          ? "Direct payout"
                          : "FX swap payout"}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeRecipient(recipient.id)}
                      disabled={recipients.length === 1 || isBusy}
                      aria-label={`Remove recipient ${index + 1}`}
                      className="hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Wallet Address
                    </label>
                    <div className="flex items-start gap-2">
                      <Input
                        placeholder="0x..."
                        value={recipient.address}
                        onChange={(event) =>
                          updateRecipient(
                            recipient.id,
                            "address",
                            event.target.value
                          )
                        }
                        disabled={isBusy}
                        className="h-11 flex-1 bg-background/50 font-mono text-xs border-border/40"
                        aria-invalid={Boolean(
                          errors[`${recipient.id}-address`]
                        )}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setScannerRecipientId(recipient.id)}
                        disabled={isBusy}
                        aria-label={`Scan QR for recipient ${index + 1}`}
                        className="mt-1 border-border/40"
                      >
                        <ScanLine className="h-4 w-4" />
                      </Button>
                    </div>
                    {errors[`${recipient.id}-address`] ? (
                      <p className="text-xs text-destructive">
                        {errors[`${recipient.id}-address`]}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        Target Token
                      </label>
                      <Select
                        value={recipient.targetToken}
                        onValueChange={(value) =>
                          updateRecipient(
                            recipient.id,
                            "targetToken",
                            value
                          )
                        }
                        disabled={isBusy}
                      >
                        <SelectTrigger className="h-11 bg-background/50 border-border/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TOKEN_OPTIONS.map((token) => (
                            <SelectItem
                              key={`${recipient.id}-mobile-${token.symbol}`}
                              value={token.symbol}
                            >
                              {token.symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        You Send
                      </label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.000001"
                        placeholder="0.00"
                        value={recipient.amount}
                        onChange={(event) =>
                          updateRecipient(
                            recipient.id,
                            "amount",
                            event.target.value
                          )
                        }
                        disabled={isBusy}
                        className="h-11 bg-background/50 tabular-nums border-border/40"
                        aria-invalid={Boolean(
                          errors[`${recipient.id}-amount`]
                        )}
                      />
                      {errors[`${recipient.id}-amount`] ? (
                        <p className="text-xs text-destructive">
                          {errors[`${recipient.id}-amount`]}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-background/35 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground/60">
                        They Receive
                      </span>
                      {quoteLoading ? (
                        <Skeleton className="h-4 w-24 bg-muted/20" />
                      ) : (
                        <span className="font-mono text-sm font-medium">
                          {formatTokenAmount(estimatedOut, 6)}{" "}
                          {recipient.targetToken}
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-2 text-[11px] ${
                        diagnostic
                          ? "text-amber-300/80"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {diagnostic ??
                        (quoteLoading
                          ? "Loading quote..."
                          : quoteRefreshing
                            ? "Refreshing quote..."
                            : "Quote from live contract reads.")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {hiddenRecipientsCount > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border/40 bg-background/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Users className="h-4 w-4 text-primary" />
                +{hiddenRecipientsCount} more recipients
              </p>
              <p className="text-[11px] text-muted-foreground/65">
                The composer shows the first {RECIPIENT_PREVIEW_LIMIT} rows so
                the page stays light. Open the full list to review everyone.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-border/40"
              onClick={() => setShowAllRecipients(true)}
            >
              View all recipients
            </Button>
          </div>
        ) : null}

        {/* Add recipient + CSV upload */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={addRecipient}
            disabled={recipients.length >= 50 || isBusy}
            className="h-10 gap-2 bg-background/40 border-border/40 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Recipient
          </Button>
          <Button
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            disabled={isBusy || csvLoading}
            className="h-10 gap-2 bg-background/40 border-border/40 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all"
          >
            {csvLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {csvLoading ? "Parsing..." : "Upload CSV"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadTemplate}
            disabled={isBusy}
            className="h-10 gap-2 bg-background/40 border-border/40 hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all"
          >
            <Download className="h-4 w-4" />
            Download Template CSV
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvUpload}
          />
          <p className="text-[11px] text-muted-foreground/60">
            Use address, amount, token. You will review every row before it is imported.
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between border-border/30">
        <div className="space-y-1 text-sm">
          <p className="font-semibold">
            Gross batch:{" "}
            {formatTokenAmount(batchAmount, activeToken.decimals)}{" "}
            {activeToken.symbol}
          </p>
          <p className="text-muted-foreground/70 text-xs">
            {isStableFxMode
              ? "Settlement path: Circle StableFX RFQ + Permit2 + FxEscrow"
              : `Settlement path: WizPay + ${fxProviderLabel} LP at ${formatCompactAddress(activeFxEngineAddress)}${estimatedGas ? ` · Est. gas: ${estimatedGas.toLocaleString("en-US")}` : ""}`}
          </p>
          {smartBatchAvailable ? (
            <p className="text-xs text-muted-foreground/70">
              {smartBatchHelperText ??
                "Click Send once to run approval and every required payroll batch automatically. Circle may still ask you to confirm each transaction."}
            </p>
          ) : smartBatchReason ? (
            <p className="text-xs text-amber-300/80">
              {smartBatchReason}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={resetComposer}
            disabled={isBusy}
            className="h-11 bg-background/40 border-border/40 hover:border-primary/20"
          >
            Reset
          </Button>
          <Button
            onClick={() => {
              void guardSend(() => handleSmartBatchSubmit?.() ?? Promise.resolve());
            }}
            disabled={
              isBusy ||
              smartBatchRunning ||
              insufficientBalance ||
              !canSend ||
              isSendGuarded
            }
            className="h-11 gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:brightness-110 shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.97]"
          >
            {smartBatchRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            {smartBatchButtonText ?? "Send"}
          </Button>
        </div>
      </CardFooter>
      </Card>

      <Dialog open={showAllRecipients} onOpenChange={setShowAllRecipients}>
        <DialogContent className="glass-card max-w-4xl border-border/40 bg-background/95 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>All recipients</DialogTitle>
            <DialogDescription>
              Review the full batch here. The main composer only renders the
              first {RECIPIENT_PREVIEW_LIMIT} rows to keep the page responsive.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 px-6 md:grid-cols-3">
            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
                Total recipients
              </p>
              <p className="mt-2 text-2xl font-semibold">{preparedRecipients.length}</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                {validRecipientCount} ready to route
              </p>
            </div>
            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
                Total amount
              </p>
              <p className="mt-2 text-2xl font-semibold font-mono">
                {formatTokenAmount(batchAmount, activeToken.decimals)} {activeToken.symbol}
              </p>
            </div>
            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
                Estimated receive
              </p>
              {quoteLoading ? (
                <Skeleton className="mt-3 h-6 w-32 bg-muted/20" />
              ) : (
                <p className="mt-2 text-2xl font-semibold font-mono">
                  {formatTokenAmount(quoteSummary.totalEstimatedOut, activeToken.decimals)}
                </p>
              )}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
            <div className="space-y-3">
              {preparedRecipients.map((recipient, index) => {
                const estimatedOut = quoteSummary.estimatedAmountsOut[index] ?? 0n;
                const diagnostic = rowDiagnostics[index];
                const routeIsDirect = recipient.targetToken === selectedToken;

                return (
                  <div
                    key={`review-${recipient.id}`}
                    className="rounded-2xl border border-border/40 bg-background/30 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
                          Recipient {index + 1}
                        </p>
                        <p className="font-mono text-xs break-all text-foreground/80">
                          {recipient.address || "Address not set"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={routeIsDirect ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300/80" : "border-amber-500/20 bg-amber-500/5 text-amber-300/80"}
                      >
                        {routeIsDirect ? "Direct" : "Swap"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                          You send
                        </p>
                        <p className="mt-1 font-mono text-sm text-foreground/80">
                          {recipient.amount || "-"} {activeToken.symbol}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                          They receive
                        </p>
                        {quoteLoading ? (
                          <Skeleton className="mt-2 h-4 w-24 bg-muted/20" />
                        ) : (
                          <p className="mt-1 font-mono text-sm text-foreground/80">
                            {formatTokenAmount(estimatedOut, 6)} {recipient.targetToken}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                          Token
                        </p>
                        <p className="mt-1 text-sm text-foreground/80">{recipient.targetToken}</p>
                      </div>
                    </div>

                    {diagnostic ? (
                      <p className="mt-3 text-xs text-amber-300/80">{diagnostic}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(csvPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setCsvPreview(null);
          }
        }}
      >
        <DialogContent className="glass-card max-w-4xl border-border/40 bg-background/95 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Review CSV import</DialogTitle>
            <DialogDescription>
              {csvPreview
                ? `${csvPreview.fileName} · ${csvPreview.rows.length} rows found. Only valid rows will be imported.`
                : "Review the file before importing recipients."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 px-6 md:grid-cols-3">
            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
                Rows found
              </p>
              <p className="mt-2 text-2xl font-semibold">{csvPreview?.rows.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/70">
                Ready to import
              </p>
              <p className="mt-2 text-2xl font-semibold text-emerald-100">
                {csvPreview?.validRows.length ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-amber-200/70">
                Need attention
              </p>
              <p className="mt-2 text-2xl font-semibold text-amber-100">
                {csvPreview?.invalidCount ?? 0}
              </p>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
            <div className="space-y-3">
              {csvPreview?.rows.map((row) => (
                <div
                  key={`${row.lineNumber}-${row.address}-${row.amount}`}
                  className="rounded-2xl border border-border/40 bg-background/30 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
                        Line {row.lineNumber}
                      </p>
                      <p className="font-mono text-xs break-all text-foreground/80">
                        {row.address || "No address provided"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={row.errors.length === 0 ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300/80" : "border-amber-500/20 bg-amber-500/5 text-amber-300/80"}
                    >
                      {row.errors.length === 0 ? "Ready" : "Needs review"}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                        Amount
                      </p>
                      <p className="mt-1 font-mono text-sm text-foreground/80">{row.amount || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                        Token
                      </p>
                      <p className="mt-1 text-sm text-foreground/80">{row.token || selectedToken}</p>
                    </div>
                  </div>

                  {row.errors.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {row.errors.map((error) => (
                        <p key={`${row.lineNumber}-${error}`} className="text-xs text-amber-300/80">
                          {error}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="px-6" showCloseButton>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadTemplate}
            >
              Download Template
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCsvImport}
              disabled={isBusy || !csvPreview?.validRows.length}
            >
              Import {csvPreview?.validRows.length ?? 0} recipients
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecipientScannerDialog
        open={Boolean(scannerRecipientId)}
        onOpenChange={(open) => {
          if (!open) {
            setScannerRecipientId(null);
          }
        }}
        onDetected={handleScannedAddress}
      />
    </>
  );
}
