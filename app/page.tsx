"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

import { useWizPay } from "@/hooks/wizpay";
import { BatchComposer } from "@/components/dashboard/BatchComposer";
import { ConnectWalletCard } from "@/components/dashboard/ConnectWalletCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PreflightPanel } from "@/components/dashboard/PreflightPanel";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StatusBanners } from "@/components/dashboard/StatusBanners";
import { SuccessModal } from "@/components/dashboard/SuccessModal";
import { TransactionHistory } from "@/components/dashboard/TransactionHistory";
import { BottomNav, type NavTab } from "@/components/dashboard/BottomNav";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { LiquidityScreen } from "@/components/dashboard/LiquidityScreen";
import { FaucetButton } from "@/components/dashboard/FaucetButton";

export default function DashboardPage() {
  const { authenticated, ready } = usePrivy();
  const { address: walletAddress } = useAccount();
  const wp = useWizPay();

  const [activeTab, setActiveTab] = useState<NavTab>("send");

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      {/* Background decorations */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="grid-fade absolute inset-0 opacity-35" />
        <div className="absolute left-[-10%] top-[-15%] h-[26rem] w-[26rem] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[-10%] h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-[140px]" />
      </div>

      {(!ready || !authenticated) ? (
        // Unauthenticated view (no navigation layout)
        <div className="flex w-full flex-col h-screen overflow-y-auto">
          <DashboardHeader />
          <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-12 sm:px-6">
            <ConnectWalletCard />
          </main>
        </div>
      ) : (
        // App Layout (Authenticated)
        <>
          {/* Desktop Sidebar */}
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          
          <div className="flex w-full flex-col flex-1 h-screen overflow-y-auto pb-24 md:pb-6">
            <DashboardHeader />
            
            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
              {activeTab === "send" && (
                <div className="animate-fade-up space-y-6">

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

                  <SuccessModal
                    isOpen={wp.submitState === "confirmed"}
                    onClose={wp.dismissSuccessModal}
                    txHash={wp.submitTxHash}
                    totalAmount={wp.batchAmount}
                    tokenSymbol={wp.selectedToken}
                    decimals={wp.activeToken.decimals}
                    recipientCount={wp.validRecipientCount}
                  />
                </div>
              )}

              {activeTab === "history" && (
                <div className="animate-fade-up">
                  <TransactionHistory
                    unifiedHistory={wp.unifiedHistory}
                    isLoading={wp.historyLoading}
                  />
                </div>
              )}

              {activeTab === "liquidity" && (
                <div className="animate-fade-up">
                  <LiquidityScreen />
                </div>
              )}
            </main>
          </div>

          {/* Mobile Bottom Nav */}
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      )}
    </div>
  );
}
