"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useToast } from "@/context/toast-context";
import { useAuth } from "@/context/auth-context";
import { useCategoriesQuery } from "@/hooks/use-categories";
import {
  useTransactionsQuery,
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
  useDeleteTransactionMutation,
} from "@/hooks/use-transactions";

const DEFAULT_CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Salary",
  "Rent",
  "Entertainment",
  "Healthcare",
  "Investment",
  "Transfer",
  "Airtime",
  "Subscription",
  "Bills & Utilities",
  "Data",
  "POS",
  "Others",
];

export interface Transaction {
  id: string;
  title: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  bank: "KUDA" | "GTBANK" | "OPAY" | "PALMPAY" | "MONIEPOINT";
  subtitle: string;
  date: string; // ISO format string
}

export type TabType = "dashboard" | "transactions" | "import" | "ai-assistant";

interface FinanceContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  transactions: Transaction[];
  addTransaction: (t: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, t: Omit<Transaction, "id">) => void;
  deleteTransaction: (id: string) => void;
  importTransactions: (ts: Omit<Transaction, "id">[]) => Promise<void>;
  resetToDefault: () => void;
  categories: string[];
  
  // Computed metrics
  totalIncome: number;
  totalExpenses: number;
  savingsAmount: number;
  savingsRate: number;
  topCategoryName: string;
  topCategoryAmount: number;
  categoryPercentages: { name: string; amount: number; percentage: number; color: string }[];
  dailyChartData: { day: number; amount: number }[];
  recentActivity: Transaction[];
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated } = useAuth();

  // TanStack Query Hooks for Categories and Transactions
  const { data: categoryData } = useCategoriesQuery();
  const { data: backendTransactions } = useTransactionsQuery();
  const createTxMutation = useCreateTransactionMutation();
  const updateTxMutation = useUpdateTransactionMutation();
  const deleteTxMutation = useDeleteTransactionMutation();

  // Dynamic Categories powered by TanStack Query
  const categories = useMemo(() => {
    if (categoryData && categoryData.length > 0) {
      return categoryData.map((c) => c.name);
    }
    return DEFAULT_CATEGORIES;
  }, [categoryData]);

  // Bind transactions state directly to TanStack Query backend data (no mock data or localStorage)
  const transactions = useMemo(() => {
    return backendTransactions || [];
  }, [backendTransactions]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toast = useToast();

  const addTransaction = React.useCallback(
    (t: Omit<Transaction, "id">) => {
      if (isAuthenticated) {
        const catObj = categoryData?.find(
          (c) => c.name.toLowerCase() === t.category.toLowerCase()
        );
        createTxMutation.mutate({
          amount: t.amount,
          transaction_type: t.type,
          transaction_date: t.date,
          description: t.subtitle ? `${t.title} · ${t.subtitle}` : t.title,
          category_id: catObj ? catObj.id : null,
        });
      }
      toast.success(`Added transaction: ${t.title}`);
    },
    [toast, isAuthenticated, categoryData, createTxMutation]
  );

  const updateTransaction = React.useCallback(
    (id: string, updated: Omit<Transaction, "id">) => {
      if (isAuthenticated && !id.startsWith("tx-")) {
        const catObj = categoryData?.find(
          (c) => c.name.toLowerCase() === updated.category.toLowerCase()
        );
        updateTxMutation.mutate({
          id,
          payload: {
            amount: updated.amount,
            transaction_type: updated.type,
            transaction_date: updated.date,
            description: updated.subtitle ? `${updated.title} · ${updated.subtitle}` : updated.title,
            category_id: catObj ? catObj.id : null,
          },
        });
      }
      toast.success(`Updated transaction: ${updated.title}`);
    },
    [toast, isAuthenticated, categoryData, updateTxMutation]
  );

  const deleteTransaction = React.useCallback(
    (id: string) => {
      let deletedTitle = "";
      const target = transactions.find((t) => t.id === id);
      if (target) deletedTitle = target.title;

      if (isAuthenticated && !id.startsWith("tx-")) {
        deleteTxMutation.mutate(id);
      }
      toast.warning(deletedTitle ? `Deleted transaction: ${deletedTitle}` : "Transaction deleted");
    },
    [toast, isAuthenticated, transactions, deleteTxMutation]
  );

  const importTransactions = React.useCallback(
    async (newTs: Omit<Transaction, "id">[]) => {
      if (!isAuthenticated) {
        toast.error("Please sign in before importing transactions.");
        return;
      }

      try {
        await Promise.all(
          newTs.map((t) => {
            const catObj = categoryData?.find(
              (c) => c.name.toLowerCase() === t.category.toLowerCase()
            );

            return createTxMutation.mutateAsync({
              amount: t.amount,
              transaction_type: t.type,
              transaction_date: t.date,
              description: t.subtitle ? `${t.title} · ${t.subtitle}` : t.title,
              category_id: catObj ? catObj.id : undefined,
            });
          })
        );

        toast.success(`Successfully imported ${newTs.length} transactions`);
      } catch (err) {
        console.error("Failed to import transactions:", err);
        toast.error("Import failed. Please check the CSV and try again.");
        throw new Error("Failed to import transactions.");
      }
    },
    [toast, isAuthenticated, categoryData, createTxMutation]
  );

  const resetToDefault = React.useCallback(() => {
    toast.info("Transactions are synchronized with the server.");
  }, [toast]);

  // Compute stats
  const stats = useMemo(() => {
    const incomeList = transactions.filter((t) => t.type === "income");
    const expenseList = transactions.filter((t) => t.type === "expense");

    const totalIncome = incomeList.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenseList.reduce((sum, t) => sum + t.amount, 0);

    const savingsAmount = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0;

    // Group expenses by category
    const catMap: Record<string, number> = {};
    expenseList.forEach((t) => {
      catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });

    const sortedCats = Object.entries(catMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const topCategoryName = sortedCats[0]?.name || "None";
    const topCategoryAmount = sortedCats[0]?.amount || 0;

    // Map top 5 categories & color palette
    const colors = [
      "#008080", // Teal/Blue-Green (Transfers)
      "#F97316", // Orange (Food & Dining)
      "#22C55E", // Green (Groceries)
      "#3B82F6", // Blue (Subscriptions)
      "#EF4444", // Red/Dark Orange (POS & Cash)
      "#A855F7", // Purple (Transport)
      "#EAB308", // Yellow (Other)
    ];

    const categoryPercentages = sortedCats.slice(0, 5).map((c, i) => ({
      name: c.name,
      amount: c.amount,
      percentage: totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0,
      color: colors[i % colors.length],
    }));

    // Group daily expense trends for May 2026 (days 2 to 28)
    const dailyMap: Record<number, number> = {};
    // Seed days 2 to 28 with 0
    for (let d = 2; d <= 28; d++) {
      dailyMap[d] = 0;
    }

    expenseList.forEach((t) => {
      const date = new Date(t.date);
      if (date.getFullYear() === 2026 && date.getMonth() === 4) { // May
        const day = date.getDate();
        if (day >= 2 && day <= 28) {
          dailyMap[day] += t.amount;
        }
      }
    });

    const dailyChartData = Object.entries(dailyMap)
      .map(([dayStr, amount]) => ({
        day: parseInt(dayStr),
        amount,
      }))
      .sort((a, b) => a.day - b.day);

    // Recent Activity: Sort by date desc
    const recentActivity = [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);

    return {
      totalIncome,
      totalExpenses,
      savingsAmount,
      savingsRate,
      topCategoryName,
      topCategoryAmount,
      categoryPercentages,
      dailyChartData,
      recentActivity,
    };
  }, [transactions]);

  if (!mounted) {
    // Return placeholder states during SSR to avoid mismatch hydration issues
    return (
      <FinanceContext.Provider
        value={{
          activeTab,
          setActiveTab,
          transactions: [],
          addTransaction: () => {},
          updateTransaction: () => {},
          deleteTransaction: () => {},
          importTransactions: async () => {},
          resetToDefault: () => {},
          categories: DEFAULT_CATEGORIES,
          totalIncome: 1036800,
          totalExpenses: 389300,
          savingsAmount: 647500,
          savingsRate: 62.5,
          topCategoryName: "Transfers",
          topCategoryAmount: 65000,
          categoryPercentages: [],
          dailyChartData: [],
          recentActivity: [],
        }}
      >
        <div style={{ visibility: "hidden" }}>{children}</div>
      </FinanceContext.Provider>
    );
  }

  return (
    <FinanceContext.Provider
      value={{
        activeTab,
        setActiveTab,
        transactions,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        importTransactions,
        resetToDefault,
        categories,
        ...stats,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error("useFinance must be used within a FinanceProvider");
  }
  return context;
}
