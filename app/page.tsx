"use client";

import { useAccount } from "wagmi";

import { BatchComposer } from "@/components/dashboard/BatchComposer";
import { ConnectWalletCard } from "@/components/dashboard/ConnectWalletCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PreflightPanel } from "@/components/dashboard/PreflightPanel";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StatusBanners } from "@/components/dashboard/StatusBanners";
import { SuccessModal } from "@/components/dashboard/SuccessModal";
import { TransactionHistory } from "@/components/dashboard/TransactionHistory";
import { useWizPay } from "@/lib/use-wizpay";

export default function DashboardPage() {
  const { address: walletAddress, isConnected } = useAccount();
  const wp = useWizPay();

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-fade absolute inset-0 opacity-35" />
        <div className="absolute left-[-10%] top-[-15%] h-[26rem] w-[26rem] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[-10%] h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-[140px]" />
      </div>

      <DashboardHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        {!isConnected ? (
          <ConnectWalletCard />
        ) : (
          <>
            <StatsCards
              selectedToken={wp.selectedToken}
              onTokenChange={(token) => {
                wp.setSelectedToken(token);
                wp.setErrorMessage(null);
                wp.setStatusMessage(null);
              }}
              isBusy={wp.isBusy}
              currentBalance={wp.currentBalance}
              activeToken={wp.activeToken}
              walletAddress={walletAddress}
              totalRouted={wp.totalRouted}
              historyCount={wp.history.length}
              engineBalances={wp.engineBalances}
              fxEngineData={wp.fxEngineData}
              onClearMessages={() => {}}
            />

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
                needsApproval={wp.needsApproval}
                insufficientBalance={wp.insufficientBalance}
                approvalState={wp.approvalState}
                submitState={wp.submitState}
                approvalText={wp.approvalText}
                primaryActionText={wp.primaryActionText}
                approvalAmount={wp.batchAmount}
                updateRecipient={wp.updateRecipient}
                addRecipient={wp.addRecipient}
                removeRecipient={wp.removeRecipient}
                handleApprove={wp.handleApprove}
                handleSubmit={wp.handleSubmit}
                resetComposer={wp.resetComposer}
                setErrorMessage={wp.setErrorMessage}
                importRecipients={wp.importRecipients}
              />

              <PreflightPanel
                currentAllowance={wp.currentAllowance}
                approvalAmount={wp.batchAmount}
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

            <SuccessModal
              isOpen={wp.submitState === "confirmed"}
              onClose={wp.dismissSuccessModal}
              txHash={wp.submitTxHash}
              totalAmount={wp.batchAmount}
              tokenSymbol={wp.selectedToken}
              decimals={wp.activeToken.decimals}
              recipientCount={wp.validRecipientCount}
            />
          </>
        )}
      </main>
    </div>
  );
}
