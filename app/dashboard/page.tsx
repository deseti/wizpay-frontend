"use client";

import { usePrivy } from "@privy-io/react-auth";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ConnectWalletCard } from "@/components/dashboard/ConnectWalletCard";
import { OverviewStatsCards } from "@/components/dashboard/overview/StatsCards";
import { PayrollChart } from "@/components/dashboard/overview/PayrollChart";
import { TokenAllocation } from "@/components/dashboard/overview/TokenAllocation";
import { RecentPayrollTable } from "@/components/dashboard/overview/RecentPayrollTable";
import { EmptyState } from "@/components/dashboard/overview/EmptyState";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";

import { usePayrollData } from "@/hooks/usePayrollData";
import { getPayrollCycleLabel } from "@/lib/dashboard-utils";

export default function PayrollOverviewPage() {
  const { authenticated, ready } = usePrivy();

  const {
    totalPayroll,
    uniqueEmployees,
    averagePayment,
    tokensDistributed,
    batchCount,
    monthlyData,
    tokenAllocation,
    employeePayments,
    isLoading,
    isError,
    hasData,
  } = usePayrollData();

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      {/* Background decorations */}
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
        /* Unauthenticated view */
        <div className="flex w-full flex-col h-screen overflow-y-auto">
          <DashboardHeader />
          <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-8 sm:px-6">
            <ConnectWalletCard />
          </main>
        </div>
      ) : (
        /* Authenticated App Layout */
        <>
          {/* Desktop Sidebar */}
          <DashboardSidebar />

          <div className="flex w-full flex-col flex-1 h-screen overflow-y-auto pb-28 md:pb-6">
            <DashboardHeader />

            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:py-8">
              <div className="animate-fade-up space-y-6 stagger-children">
                {/* Page Header */}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                      Payroll Overview
                    </h1>
                    <p className="text-sm text-muted-foreground/70">
                      {getPayrollCycleLabel()}
                    </p>
                  </div>
                </div>

                {/* Error state */}
                {isError && (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
                    Failed to load payroll data from the blockchain. Please
                    check your wallet connection and try again.
                  </div>
                )}

                {/* Stats Cards */}
                <OverviewStatsCards
                  totalPayroll={totalPayroll}
                  uniqueEmployees={uniqueEmployees}
                  tokensDistributed={tokensDistributed}
                  averagePayment={averagePayment}
                  batchCount={batchCount}
                  isLoading={isLoading}
                />

                {/* Charts Section */}
                <section className="flex flex-col gap-6 xl:flex-row">
                  <PayrollChart data={monthlyData} isLoading={isLoading} />
                  <TokenAllocation
                    data={tokenAllocation}
                    isLoading={isLoading}
                  />
                </section>

                {/* Recent Payroll Table or Empty State */}
                {!isLoading && !hasData ? (
                  <EmptyState />
                ) : (
                  <RecentPayrollTable
                    payments={employeePayments}
                    isLoading={isLoading}
                  />
                )}
              </div>
            </main>
          </div>

          {/* Mobile Bottom Nav */}
          <DashboardBottomNav />
        </>
      )}
    </div>
  );
}
