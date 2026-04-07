"use client";

import {
  AlertCircle,
  Loader2,
  Plus,
  Rocket,
  ShieldCheck,
  Trash2,
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
import { WIZPAY_ADDRESS } from "@/constants/addresses";
import type { PreparedRecipient, QuoteSummary, StepState } from "@/lib/types";
import {
  formatCompactAddress,
  formatTokenAmount,
  TOKEN_OPTIONS,
  type RecipientDraft,
  type TokenSymbol,
} from "@/lib/wizpay";

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
  needsApproval: boolean;
  insufficientBalance: boolean;
  approvalState: StepState;
  submitState: StepState;
  approvalText: string;
  primaryActionText: string;
  approvalAmount: bigint;
  updateRecipient: (id: string, field: keyof Omit<RecipientDraft, "id">, value: string) => void;
  addRecipient: () => void;
  removeRecipient: (id: string) => void;
  handleApprove: () => Promise<void>;
  handleSubmit: () => Promise<void>;
  resetComposer: () => void;
  setErrorMessage: (msg: string | null) => void;
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
  needsApproval,
  insufficientBalance,
  approvalState,
  submitState,
  approvalText,
  primaryActionText,
  approvalAmount,
  updateRecipient,
  addRecipient,
  removeRecipient,
  handleApprove,
  handleSubmit,
  resetComposer,
  setErrorMessage,
}: BatchComposerProps) {
  return (
    <Card className="glass-card border-border/60">
      <CardHeader className="soft-divider border-b border-border/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle>Cross-Token Batch Payroll</CardTitle>
            <CardDescription>
              Send one input token, let each recipient choose USDC or EURC, and
              block submission automatically if simulation predicts a revert.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {formatCompactAddress(WIZPAY_ADDRESS)}
            </Badge>
            <Badge variant="outline">
              {validRecipientCount}/{recipients.length} rows valid
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
              className="h-11 bg-background/70"
              aria-invalid={Boolean(errors.referenceId)}
            />
            {errors.referenceId ? (
              <p className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {errors.referenceId}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This memo is stored on-chain in the batch event history.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Draft Summary
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Gross input</span>
                <span className="font-mono">
                  {formatTokenAmount(batchAmount, activeToken.decimals)}{" "}
                  {activeToken.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated fees</span>
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
        <div className="hidden rounded-2xl border border-border/60 md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
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
                  <TableRow key={recipient.id} className="align-top">
                    <TableCell className="pt-3 font-mono text-xs text-muted-foreground">
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
                          className="h-10 bg-background/70 font-mono text-xs"
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
                        <SelectTrigger className="h-10 bg-background/70">
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
                          className="h-10 bg-background/70 tabular-nums"
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
                          <p className="text-xs text-amber-300">
                            {diagnostic}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Fee-aware quote refreshed live from chain
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
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
                className="surface-panel border border-border/60"
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
                      className="h-11 bg-background/70 font-mono text-xs"
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
                        <SelectTrigger className="h-11 bg-background/70">
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
                        className="h-11 bg-background/70 tabular-nums"
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

                  <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        They Receive
                      </span>
                      <span className="font-mono text-sm">
                        {formatTokenAmount(estimatedOut, 6)}{" "}
                        {recipient.targetToken}
                      </span>
                    </div>
                    <p
                      className={`mt-2 text-xs ${
                        diagnostic
                          ? "text-amber-300"
                          : "text-muted-foreground"
                      }`}
                    >
                      {diagnostic ??
                        "Quote is calculated from live contract reads."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Add recipient */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={addRecipient}
            disabled={recipients.length >= 50 || isBusy}
            className="h-10 gap-2 bg-background/60"
          >
            <Plus className="h-4 w-4" />
            Add Recipient
          </Button>
          <p className="text-sm text-muted-foreground">
            Mixed payout example: send {selectedToken}, settle each row as USDC
            or EURC in the same on-chain batch.
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            Gross batch:{" "}
            {formatTokenAmount(batchAmount, activeToken.decimals)}{" "}
            {activeToken.symbol}
          </p>
          <p className="text-muted-foreground">
            Estimated gas:{" "}
            {estimatedGas
              ? estimatedGas.toLocaleString("en-US")
              : "Run simulation"}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={resetComposer}
            disabled={isBusy}
            className="h-11 bg-background/60"
          >
            Reset
          </Button>
          <Button
            variant="outline"
            onClick={handleApprove}
            disabled={
              isBusy ||
              insufficientBalance ||
              approvalAmount === 0n ||
              !needsApproval
            }
            className="h-11 gap-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
          >
            {approvalState === "signing" ||
            approvalState === "confirming" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {approvalText}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isBusy || needsApproval || insufficientBalance}
            className="h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitState === "simulating" ||
            submitState === "wallet" ||
            submitState === "confirming" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            {primaryActionText}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
