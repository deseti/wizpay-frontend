"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { BatchComposer } from "@/components/dashboard/BatchComposer";
import { ConnectWalletCard } from "@/components/dashboard/ConnectWalletCard";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { PreflightPanel } from "@/components/dashboard/PreflightPanel";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StatusBanners } from "@/components/dashboard/StatusBanners";
import { SuccessModal } from "@/components/dashboard/SuccessModal";
import { TransactionHistory } from "@/components/dashboard/TransactionHistory";
import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { useWizPay } from "@/hooks/wizpay";
import {
  activeFxEngineAddress,
  fxProviderLabel,
  isStableFxMode,
} from "@/lib/fx-config";
import { formatCompactAddress } from "@/lib/wizpay";

function PayrollWorkspace() {
  const wp = useWizPay();
  const { walletAddress } = useActiveWalletAddress();
  const showSuccessModal =
    wp.submitState === "confirmed" && wp.currentBatchNumber === wp.totalBatches;

  return (
    <>
      <div className="animate-fade-up space-y-6 stagger-children">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Payroll / Send
            </h1>
            <p className="text-sm text-muted-foreground/70">
              {isStableFxMode
                ? "Circle-backed payroll runs through Arc W3S approvals and StableFX settlement."
                : `Cross-token payroll now defaults to ${fxProviderLabel} liquidity on Arc.`}
            </p>
          </div>
        </div>

        <Card className="glass-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
              </div>
              {isStableFxMode
                ? "Circle Payroll Flow Enabled"
                : "Adapter Payroll Flow Enabled"}
            </CardTitle>
            <CardDescription>
              {isStableFxMode
                ? "Direct same-token payouts and cross-currency StableFX settlement run through Circle user-controlled wallet flows on Arc Testnet."
                : `Cross-currency payroll now routes through ${fxProviderLabel} on Arc Testnet instead of Circle StableFX by default.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground/75">
            {isStableFxMode ? (
              <>
                <p>
                  Same-currency payroll rows submit direct Circle token transfers on Arc.
                </p>
                <p>
                  Cross-currency payroll rows use Circle StableFX quotes, Permit signing, and FxEscrow settlement.
                </p>
              </>
            ) : (
              <>
                <p>
                  Cross-currency USDC/EURC rows now use the on-chain adapter LP at {formatCompactAddress(activeFxEngineAddress)}.
                </p>
                <p>
                  Same-token payroll rows stay on the direct WizPay path, while swaps route through adapter liquidity instead of Circle RFQ.
                </p>
                <div className="pt-2">
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-primary/20 bg-background/35"
                  >
                    <Link href="/liquidity">Open LP Pool</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <StatsCards
          selectedToken={wp.selectedToken}
          onTokenChange={wp.setSelectedToken}
          isBusy={wp.isBusy}
          currentBalance={wp.currentBalance}
          activeToken={wp.activeToken}
          walletAddress={walletAddress}
          totalRouted={wp.totalRouted}
          historyCount={wp.history.length}
          engineBalances={wp.engineBalances}
          fxEngineData={wp.fxEngineData}
          onClearMessages={() => {
            wp.setStatusMessage(null);
            wp.setErrorMessage(null);
          }}
        />

        <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <BatchComposer
            selectedToken={wp.selectedToken}
            activeToken={wp.activeToken}
            recipients={wp.recipients}
            preparedRecipients={wp.preparedRecipients}
            referenceId={wp.referenceId}
            onReferenceIdChange={wp.setReferenceId}
            errors={wp.errors}
            clearFieldError={wp.clearFieldError}
            batchAmount={wp.batchAmount}
            validRecipientCount={wp.validRecipientCount}
            quoteSummary={wp.quoteSummary}
            rowDiagnostics={wp.rowDiagnostics}
            estimatedGas={wp.estimatedGas}
            isBusy={wp.isBusy}
            insufficientBalance={wp.insufficientBalance}
            updateRecipient={wp.updateRecipient}
            addRecipient={wp.addRecipient}
            removeRecipient={wp.removeRecipient}
            resetComposer={wp.resetComposer}
            setErrorMessage={wp.setErrorMessage}
            importRecipients={wp.importRecipients}
            totalBatches={wp.totalBatches}
            currentBatchNumber={wp.currentBatchNumber}
            smartBatchAvailable={wp.smartBatchAvailable}
            smartBatchRunning={wp.smartBatchRunning}
            smartBatchReason={wp.smartBatchReason}
            smartBatchButtonText={wp.smartBatchButtonText}
            smartBatchHelperText={wp.smartBatchHelperText}
            handleSmartBatchSubmit={wp.handleSmartBatchSubmit}
          />

          <PreflightPanel
            currentAllowance={wp.currentAllowance}
            approvalAmount={wp.approvalAmount}
            activeToken={wp.activeToken}
            feeBps={wp.feeBps}
            rowDiagnostics={wp.rowDiagnostics}
            insufficientBalance={wp.insufficientBalance}
            selectedToken={wp.selectedToken}
          />
        </section>

        <StatusBanners
          statusMessage={wp.statusMessage}
          errorMessage={wp.errorMessage}
          approveTxHash={wp.approveTxHash}
          submitTxHash={wp.submitTxHash}
          submitState={wp.submitState}
          copiedHash={wp.copiedHash}
          copyHash={wp.copyHash}
        />

        <TransactionHistory
          unifiedHistory={wp.unifiedHistory}
          isLoading={wp.historyLoading}
        />
      </div>

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={wp.dismissSuccessModal}
        txHash={wp.submitTxHash}
        approvalTxHash={wp.approveTxHash}
        txHashes={wp.smartBatchSubmissionHashes}
        totalAmount={wp.sessionTotalAmount || wp.batchAmount}
        tokenSymbol={wp.activeToken.symbol}
        decimals={wp.activeToken.decimals}
        recipientCount={wp.sessionTotalRecipients || wp.validRecipientCount}
        isMultiBatch={wp.totalBatches > 1}
        referenceId={wp.referenceId}
        sessionTotalDistributed={wp.sessionTotalDistributed}
      />
    </>
  );
}

export default function DashboardPage() {
  const { authenticated, ready } = useCircleWallet();

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="grid-fade absolute inset-0 opacity-25" />
        <div className="absolute left-[-8%] top-[-12%] h-[28rem] w-[28rem] rounded-full bg-primary/12 blur-[140px] animate-float" />
        <div
          className="absolute bottom-[-15%] right-[-8%] h-[24rem] w-[24rem] rounded-full bg-violet-500/8 blur-[120px]"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-[40%] left-[50%] h-[16rem] w-[16rem] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-[100px]"
          style={{ animationDelay: "4s" }}
        />
      </div>

      {!ready || !authenticated ? (
        <div className="flex h-screen w-full flex-col overflow-y-auto">
          <DashboardHeader />
          <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-8 sm:px-6">
            <ConnectWalletCard />
          </main>
        </div>
      ) : (
        <>
          <DashboardSidebar />

          <div className="flex h-screen w-full flex-1 flex-col overflow-y-auto pb-28 md:pb-6">
            <DashboardHeader />

            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:py-8">
              <PayrollWorkspace />
            </main>
          </div>

          <DashboardBottomNav />
        </>
      )}
    </div>
  );
}
