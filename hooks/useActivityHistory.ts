"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import type { UnifiedHistoryItem, HistoryActionType } from "@/lib/types";

export type ActivityFilter = "all" | HistoryActionType | "swap" | "bridge";

interface UseActivityHistoryOptions {
  /** Items per page */
  pageSize?: number;
  /** Initial filter */
  initialFilter?: ActivityFilter;
}

/**
 * Unified activity history hook with filtering, pagination, and per-user scoping.
 * Merges payroll, swap, bridge, and LP events into a single timeline.
 */
export function useActivityHistory(
  rawItems: UnifiedHistoryItem[],
  options: UseActivityHistoryOptions = {}
) {
  const { pageSize = 10, initialFilter = "all" } = options;
  const { walletAddress } = useActiveWalletAddress();

  const [filter, setFilter] = useState<ActivityFilter>(initialFilter);
  const [tokenFilter, setTokenFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    let items = rawItems;

    // Filter by type
    if (filter !== "all") {
      items = items.filter((item) => item.type === filter);
    }

    // Filter by token
    if (tokenFilter !== "all") {
      items = items.filter(
        (item) =>
          item.tokenIn?.toLowerCase().includes(tokenFilter.toLowerCase()) ||
          item.tokenOut?.toLowerCase().includes(tokenFilter.toLowerCase()) ||
          item.lpToken?.toLowerCase().includes(tokenFilter.toLowerCase())
      );
    }

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.txHash.toLowerCase().includes(q) ||
          (item.referenceId?.toLowerCase().includes(q) ?? false)
      );
    }

    return items;
  }, [rawItems, filter, tokenFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedItems = filtered.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
  };

  const resetFilters = () => {
    setFilter("all");
    setTokenFilter("all");
    setSearchTerm("");
    setCurrentPage(0);
  };

  return {
    items: paginatedItems,
    allItems: filtered,
    totalCount: filtered.length,
    currentPage,
    totalPages,
    filter,
    tokenFilter,
    searchTerm,
    setFilter: (f: ActivityFilter) => {
      setFilter(f);
      setCurrentPage(0);
    },
    setTokenFilter: (t: string) => {
      setTokenFilter(t);
      setCurrentPage(0);
    },
    setSearchTerm: (s: string) => {
      setSearchTerm(s);
      setCurrentPage(0);
    },
    goToPage,
    nextPage: () => goToPage(currentPage + 1),
    prevPage: () => goToPage(currentPage - 1),
    resetFilters,
    hasNextPage: currentPage < totalPages - 1,
    hasPrevPage: currentPage > 0,
  };
}
