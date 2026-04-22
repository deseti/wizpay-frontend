"use client";

import { QrCode } from "lucide-react";

import { BatchComposer } from "@/components/dashboard/BatchComposer";
import { PreflightPanel } from "@/components/dashboard/PreflightPanel";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StatusBanners } from "@/components/dashboard/StatusBanners";
import { SuccessModal } from "@/components/dashboard/SuccessModal";
import { TransactionHistory } from "@/components/dashboard/TransactionHistory";
import { DashboardAppFrame } from "@/components/dashboard/DashboardAppFrame";
import { ReceiveModal } from "@/components/dashboard/ReceiveModal";
import { Button } from "@/components/ui/button";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { useWizPay } from "@/hooks/wizpay";
import { useState } from "react";

function SendWorkspace() {
  const wp = useWizPay();
  const { walletAddress } = useActiveWalletAddress();
  const [showReceive, setShowReceive] = useState(false);
  const showSuccessModal =
    wp.submitState === "confirmed" && wp.currentBatchNumber === wp.totalBatches;

  return (
    <>
      <div className="animate-fade-up space-y-6 stagger-children">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Send
            </h1>
            <p className="text-sm text-muted-foreground/70">
              Send tokens to one or many recipients. Upload CSV for batch payments.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReceive(true)}
              className="gap-1.5 border-border/40"
            >
              <QrCode className="h-3.5 w-3.5" />
              Receive
            </Button>
          </div>
        </div>

        <StatsCards
          selectedToken={wp.selectedToken}
          onTokenChange={wp.setSelectedToken}
          isBusy={wp.isBusy}
          currentBalance={wp.currentBalance}
          balanceLoading={wp.balanceLoading}
          activeToken={wp.activeToken}
          walletAddress={walletAddress}
          totalRouted={wp.totalRouted}
          historyCount={wp.history.length}
          engineBalances={wp.engineBalances}
          fxEngineData={wp.fxEngineData}
          engineLoading={wp.engineLoading}
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
            quoteLoading={wp.quoteLoading}
            quoteRefreshing={wp.quoteRefreshing}
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
            allowanceLoading={wp.allowanceLoading}
            feeLoading={wp.feeLoading}
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

      <ReceiveModal open={showReceive} onClose={() => setShowReceive(false)} />
    </>
  );
}

export default function SendPage() {
  return (
    <DashboardAppFrame>
      <SendWorkspace />
    </DashboardAppFrame>
  );
}
