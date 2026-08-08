"use client";

import React, { useState, useRef } from "react";
import { useFinance, Transaction } from "@/context/finance-context";
import { useUploadMutation } from "@/hooks/use-uploads";
import { useQueryClient } from "@tanstack/react-query";
import { TRANSACTIONS_QUERY_KEY } from "@/hooks/use-transactions";
import { useToast } from "@/context/toast-context";
import { 
  Upload, 
  Check, 
  Landmark, 
  FileText,
  Loader2,
  AlertCircle
} from "lucide-react";
import { motion } from "framer-motion";

export default function ImportCsvView() {
  const { setActiveTab } = useFinance();
  const toast = useToast();
  const queryClient = useQueryClient();
  const uploadMutation = useUploadMutation();

  const [selectedSource, setSelectedSource] = useState<Transaction["bank"]>("GTBANK");
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sources: { id: Transaction["bank"]; name: string; color: string }[] = [
    { id: "GTBANK", name: "GTBank", color: "bg-[#ff5722]" },
    { id: "OPAY", name: "Opay", color: "bg-[#00bfa5]" },
    { id: "PALMPAY", name: "PalmPay", color: "bg-[#a855f7]" },
    { id: "KUDA", name: "Kuda", color: "bg-[#d500f9]" },
    { id: "MONIEPOINT", name: "Moniepoint", color: "bg-[#0284c7]" },
  ];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    if (selectedFile.type !== "text/csv" && !selectedFile.name.endsWith(".csv")) {
      toast.error("Please upload a valid CSV file.");
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const response = await uploadMutation.mutateAsync(selectedFile);
      
      // Invalidate queries so transactions and analytics update immediately
      await queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["analytics"] });
      await queryClient.invalidateQueries({ queryKey: ["insights"] });

      const count = response?.data?.upload?.totalTransactions ?? 0;
      const skipped = response?.data?.upload?.skippedDuplicates ?? 0;

      let msg = `Successfully imported ${count} transaction${count !== 1 ? "s" : ""}!`;
      if (skipped > 0) {
        msg += ` (${skipped} duplicate${skipped !== 1 ? "s" : ""} skipped)`;
      }

      toast.success(msg);
      setActiveTab("transactions");
    } catch (error: any) {
      const apiMsg =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to process CSV file.";
      setErrorMessage(apiMsg);
      toast.error(apiMsg);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const triggerFileSelect = () => {
    if (!isImporting) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="px-4 py-4 md:px-10 md:py-6 max-w-6xl mx-auto space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-6"
      >
        {/* Header Text */}
        <div className="space-y-1">
          <span className="text-xs font-black text-slate-400">Automatic Import</span>
          <h2 className="text-3xl font-black tracking-tight text-slate-950">
            Import a bank statement
          </h2>
          <p className="text-sm font-semibold text-slate-500 max-w-2xl leading-relaxed">
            Upload your CSV bank statement. Kolo will automatically detect columns, parse transactions, validate, deduplicate, and categorize everything for you.
          </p>
        </div>

        {/* Bank Partner Selector */}
        <div className="space-y-3">
          <span className="block text-[11px] font-black text-slate-900 uppercase tracking-wider">
            Choose source / bank
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
            {sources.map((source) => {
              const isSelected = selectedSource === source.id;
              return (
                <div
                  key={source.id}
                  onClick={() => setSelectedSource(source.id)}
                  className={`relative flex flex-col justify-between p-5 rounded-2xl border bg-white cursor-pointer transition-all h-28 ${
                    isSelected
                      ? "border-slate-950 border-1.5 shadow-sm ring-1 ring-slate-950/5"
                      : "border-slate-200 hover:border-slate-350 hover:bg-slate-50/20"
                  }`}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full text-white shrink-0 ${source.color}`}>
                    <Landmark className="h-4.5 w-4.5" />
                  </div>

                  <span className="text-xs font-extrabold text-slate-900 mt-auto">
                    {source.name}
                  </span>

                  {isSelected && (
                    <div className="absolute top-3.5 right-3.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-1.5 border-emerald-500 bg-white text-emerald-500 shadow-sm">
                      <Check className="h-2.5 w-2.5 stroke-[3.5]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-rose-800 text-xs font-semibold">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-rose-950 mb-0.5">Import Validation Failed</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Drop Zone Box */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center min-h-[280px] transition-all ${
            isImporting
              ? "border-emerald-300 bg-emerald-50/20 cursor-wait"
              : "border-slate-200 hover:border-slate-350 bg-slate-50/25 hover:bg-slate-50/50 cursor-pointer"
          }`}
        >
          {isImporting ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
              <div className="text-center space-y-1">
                <span className="text-sm font-extrabold text-slate-900 block">
                  Processing CSV Automatically...
                </span>
                <span className="text-xs text-slate-500 font-semibold block">
                  Detecting columns, normalizing amounts, and categorizing transactions with AI
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-kolo-green text-kolo-dark shadow-sm">
                <Upload className="h-6 w-6 stroke-[3]" />
              </div>

              <span className="text-sm font-extrabold text-slate-900 mt-5">
                Drop your {sources.find((s) => s.id === selectedSource)?.name} CSV here
              </span>
              <span className="text-xs text-slate-400 font-semibold mt-1">
                or click to browse · max 10MB
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerFileSelect();
                }}
                disabled={isImporting}
                className="bg-slate-950 hover:bg-slate-800 text-white rounded-full px-5 py-2.5 text-xs font-black mt-5 flex items-center gap-2 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Choose file</span>
              </button>
            </>
          )}
        </div>

        {/* Automated Importer Banner Info */}
        <div className="rounded-3xl bg-slate-50 border border-slate-100 p-5 flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-950">Automatic Pipeline Active</span>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Kolo automatically recognizes transaction dates, descriptions, amounts, and separate debit/credit columns for GTBank, Kuda, Opay, PalmPay, Moniepoint, and generic statement formats without manual column mapping.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
