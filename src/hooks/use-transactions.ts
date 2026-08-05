import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransactions,
  getTransactionByIdApi,
  createTransactionApi,
  updateTransactionApi,
  deleteTransactionApi,
  CreateTransactionPayload,
  UpdateTransactionPayload,
  BackendTransaction,
} from "@/api/transaction";
import { useAuth } from "@/context/auth-context";
import type { Transaction } from "@/context/finance-context";

export const TRANSACTIONS_QUERY_KEY = ["transactions"];

// Adapter to transform backend transaction to frontend UI structure
export function transformBackendToUI(tx: BackendTransaction): Transaction {
  const parts = tx.description ? tx.description.split(" · ") : [];
  const title = parts[0] || tx.categories?.name || "Transaction";
  // Subtitle fallback to description if there's no " · " divider
  const subtitle = parts.slice(1).join(" · ") || tx.description || "";
  
  return {
    id: tx.id,
    title,
    type: tx.transaction_type,
    amount: Number(tx.amount),
    category: tx.categories?.name || "Others",
    bank: "GTBANK", // Default bank partner
    subtitle,
    date: tx.transaction_date,
  };
}

export function useTransactionsQuery() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEY,
    queryFn: async () => {
      const res = await getTransactions();
      return (res.data.transactions || []).map(transformBackendToUI);
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000, // 2 minutes cache stale time
  });
}

export function useTransactionDetailQuery(id: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await getTransactionByIdApi(id);
      return transformBackendToUI(res.data);
    },
    enabled: isAuthenticated && !!id && !id.startsWith("tx-"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateTransactionPayload) => createTransactionApi(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
    },
  });
}

export function useUpdateTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTransactionPayload }) =>
      updateTransactionApi(id, payload),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...TRANSACTIONS_QUERY_KEY, data.id] });
    },
  });
}

export function useDeleteTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTransactionApi(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...TRANSACTIONS_QUERY_KEY, id] });
    },
  });
}
