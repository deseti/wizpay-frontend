"use client";

import { useRef, useState } from "react";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Rocket,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

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
  const { toast } = useToast();
  const canSend = smartBatchAvailable && Boolean(handleSmartBatchSubmit);
  const { isProcessing: isSendGuarded, guard: guardSend } = useActionGuard();

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

      // Strip BOM if present
      const cleanText = text.replace(/^\uFEFF/, "");

      const lines = cleanText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      // Detect and skip header row
      const firstLine = lines[0]?.toLowerCase() ?? "";
      const startIdx =
        firstLine.includes("address") || firstLine.includes("wallet") || firstLine.includes("recipient") ? 1 : 0;

      // Auto-detect delimiter (comma vs semicolon)
      const sampleLine = lines[startIdx] ?? lines[0] ?? "";
      const delimiter = sampleLine.includes(";") ? ";" : ",";

      const rows: RecipientDraft[] = [];
      const warnings: string[] = [];

      // Helper to strip surrounding quotes and whitespace from CSV cells
      const cleanCell = (val: string) => val.trim().replace(/^["']|["']$/g, "").trim();

      const seenAddresses = new Set<string>();

      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map(cleanCell);
        const [address, amount, targetToken] = cols;

        if (!address || !address.startsWith("0x")) {
          warnings.push(`Row ${i + 1}: Invalid address "${address}"`);
          continue;
        }
        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
          warnings.push(`Row ${i + 1}: Invalid amount "${amount}"`);
          continue;
        }

        const normalizedAddress = address.trim().toLowerCase();
        if (seenAddresses.has(normalizedAddress)) {
          setCsvLoading(false);
          setErrorMessage(`CSV Upload Blocked: Duplicate address "${address}" found on row ${i + 1}.`);
          toast({
             title: "Duplicate Found",
             description: `Address ${address} appears multiple times. Please fix and re-upload.`,
             variant: "destructive",
          });
          if (csvInputRef.current) csvInputRef.current.value = "";
          return;
        }
        seenAddresses.add(normalizedAddress);

        const token =
          targetToken?.toUpperCase() === "EURC" ? "EURC" : selectedToken;

        rows.push({
          ...createRecipient(token),
          address: address.trim(),
          amount: amount.trim(),
          targetToken: token,
        });
      }

      setCsvLoading(false);

      if (rows.length === 0) {
        setErrorMessage(
          "CSV import failed: no valid rows found." +
            (warnings.length ? " " + warnings.join("; ") : "")
        );
        toast({
          title: "CSV Import Failed",
          description: `No valid rows found. ${warnings.length} rows had errors.`,
          variant: "destructive",
        });
        if (csvInputRef.current) csvInputRef.current.value = "";
        return;
      }

      importRecipients(rows);

      if (warnings.length > 0) {
        setErrorMessage(`CSV imported ${rows.length} rows. Skipped: ${warnings.join("; ")}`);
        toast({
          title: "CSV Imported with Warnings",
          description: `${rows.length} rows imported, ${warnings.length} rows skipped.`,
        });
      } else {
        toast({
          title: "CSV Uploaded Successfully",
          description: `${rows.length} recipients imported from CSV.`,
        });
      }

      // Reset input AFTER processing so the same file can be re-uploaded
      if (csvInputRef.current) csvInputRef.current.value = "";
    };

    reader.readAsText(file);
  };

  return (
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
                <span className="text-muted-foreground">Gross input</span>
                <span className="font-mono font-medium">
                  {formatTokenAmount(batchAmount, activeToken.decimals)}{" "}
                  {activeToken.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Est. fees</span>
                <span className="font-mono">
                  {formatTokenAmount(
                    quoteSummary.totalFees,
                    activeToken.decimals
                  )}{" "}
                  {activeToken.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Recipients receive
                </span>
                <span className="font-mono">
                  {formatTokenAmount(
                    quoteSummary.totalEstimatedOut,
                    activeToken.decimals
                  )}
                </span>
              </div>
            </div>
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
              {preparedRecipients.map((recipient, index) => {
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
                          className="h-10 bg-background/50 font-mono text-xs border-border/40"
                          aria-invalid={Boolean(
                            errors[`${recipient.id}-address`]
                          )}
                        />
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
                        <p className="font-mono text-sm">
                          {formatTokenAmount(estimatedOut, 6)}{" "}
                          {recipient.targetToken}
                        </p>
                        {diagnostic ? (
                          <p className="text-xs text-amber-300/80">
                            {diagnostic}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/60">
                            Live quote from chain
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
          {preparedRecipients.map((recipient, index) => {
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
                      className="h-11 bg-background/50 font-mono text-xs border-border/40"
                      aria-invalid={Boolean(
                        errors[`${recipient.id}-address`]
                      )}
                    />
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
                      <span className="font-mono text-sm font-medium">
                        {formatTokenAmount(estimatedOut, 6)}{" "}
                        {recipient.targetToken}
                      </span>
                    </div>
                    <p
                      className={`mt-2 text-[11px] ${
                        diagnostic
                          ? "text-amber-300/80"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {diagnostic ??
                        "Quote from live contract reads."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

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
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvUpload}
          />
          <p className="text-[11px] text-muted-foreground/60">
            CSV format: address, amount, token (USDC/EURC)
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
  );
}
