"use client";

import React, { useState, useRef } from "react";
import { useFinance, Transaction } from "@/context/finance-context";
import Papa from "papaparse";
import { 
  Upload, 
  Check, 
  ArrowRight, 
  Landmark, 
  FileText, 
  ChevronLeft
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ImportCsvView() {
  const { importTransactions, setActiveTab } = useFinance();
  
  // Wizard States
  const [selectedSource, setSelectedSource] = useState<Transaction["bank"]>("GTBANK");
  const [file, setFile] = useState<File | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  
  // Mapping configuration states
  const [titleCol, setTitleCol] = useState("");
  const [subtitleCol, setSubtitleCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  
  // Mapping configuration states
  const [categoryCol, setCategoryCol] = useState("");
  const [bankCol, setBankCol] = useState("");
  const [dateCol, setDateCol] = useState("");
  const [typeCol, setTypeCol] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sources: { id: Transaction["bank"]; name: string; color: string }[] = [
    { id: "GTBANK", name: "GTBank", color: "bg-[#ff5722]" },
    { id: "OPAY", name: "Opay", color: "bg-[#00bfa5]" },
    { id: "PALMPAY", name: "PalmPay", color: "bg-[#a855f7]" },
    { id: "KUDA", name: "Kuda", color: "bg-[#d500f9]" },
    { id: "MONIEPOINT", name: "Moniepoint", color: "bg-[#0284c7]" },
  ];

  // Drag & Drop Handlers
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

  const processFile = (selectedFile: File) => {
    if (selectedFile.type !== "text/csv" && !selectedFile.name.endsWith(".csv")) {
      alert("Please upload a valid CSV file.");
      return;
    }

    setFile(selectedFile);
    const headerCounts = new Map<string, number>();
    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header, index) => {
        const cleaned = header.trim() || `Column_${index + 1}`;
        const count = headerCounts.get(cleaned) || 0;
        headerCounts.set(cleaned, count + 1);
        return count > 0 ? `${cleaned}_${count}` : cleaned;
      },
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = Object.keys(results.data[0]);
          setParsedHeaders(headers);
          setParsedData(results.data);
          
          // Auto-map headers
          autoMapHeaders(headers);
        } else {
          alert("CSV file seems to be empty.");
          setFile(null);
        }
      },
      error: (error) => {
        alert("Failed to parse CSV: " + error.message);
        setFile(null);
      }
    });
  };

  // Auto-mapping logic
  const autoMapHeaders = (headers: string[]) => {
    const findHeader = (aliases: string[]) => {
      return headers.find(h => aliases.some(alias => h.toLowerCase().includes(alias.toLowerCase()))) || "";
    };

    setTitleCol(findHeader(["title", "vendor", "merchant", "name", "description"]));
    setSubtitleCol(findHeader(["subtitle", "details", "memo", "narration"]));
    setAmountCol(findHeader(["amount", "value", "price", "cost"]));
    setCategoryCol(findHeader(["category", "sector", "type_tag"]));
    setBankCol(findHeader(["bank", "account", "institution"]));
    setDateCol(findHeader(["date", "time", "timestamp", "created"]));
    setTypeCol(findHeader(["type", "flow", "direction"]));
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleBackToStep1 = () => {
    setFile(null);
    setParsedHeaders([]);
    setParsedData([]);
  };

  // Import parsed data to context
  const handleImport = async () => {
    if (!titleCol || !amountCol) {
      alert("Please map at least Title/Vendor and Amount columns.");
      return;
    }

    const mappedTransactions: Omit<Transaction, "id">[] = parsedData.map((row) => {
      const amountVal = Math.abs(Number(row[amountCol]?.toString().replace(/[^\d.]/g, "")) || 0);
      
      // Determine direction flow
      let typeVal: "income" | "expense" = "expense";
      if (typeCol && row[typeCol]) {
        const tStr = String(row[typeCol]).toLowerCase();
        if (tStr.includes("in") || tStr.includes("credit") || tStr.includes("plus") || tStr.includes("income")) {
          typeVal = "income";
        }
      } else if (String(row[categoryCol] || "").toLowerCase() === "income") {
        typeVal = "income";
      }

      // Bank normalize: Use column value if mapped, otherwise use the selected bank source from Step 1
      let bankVal: Transaction["bank"] = selectedSource;
      if (bankCol && row[bankCol]) {
        const bStr = row[bankCol].toUpperCase();
        if (bStr.includes("KUDA")) bankVal = "KUDA";
        else if (bStr.includes("OPAY")) bankVal = "OPAY";
        else if (bStr.includes("PALM")) bankVal = "PALMPAY";
        else if (bStr.includes("MONIE")) bankVal = "MONIEPOINT";
        else if (bStr.includes("GTB")) bankVal = "GTBANK";
      }

      // Date normalize
      let dateVal = new Date().toISOString();
      if (dateCol && row[dateCol]) {
        const parsedDate = new Date(row[dateCol]);
        if (!isNaN(parsedDate.getTime())) {
          dateVal = parsedDate.toISOString();
        }
      }

      const catVal = row[categoryCol] || (typeVal === "income" ? "Income" : "Other");

      return {
        title: row[titleCol] || "Untitled Transaction",
        subtitle: row[subtitleCol] || `${catVal} · Imported`,
        amount: amountVal,
        type: typeVal,
        category: catVal,
        bank: bankVal,
        date: dateVal,
      };
    });

    try {
      setIsImporting(true);
      await importTransactions(mappedTransactions);
      setActiveTab("transactions");
    } catch {
      // Toast notification is handled by importTransactions
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="px-4 py-4 md:px-10 md:py-6 max-w-6xl mx-auto space-y-6">
      
      {/* Invisible File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {!file ? (
          /* ================= STEP 1 OF 2 ================= */
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Header Text */}
            <div className="space-y-1">
              <span className="text-xs font-black text-slate-400">Step 1 of 2</span>
              <h2 className="text-3xl font-black tracking-tight text-slate-950">Import a statement</h2>
              <p className="text-sm font-semibold text-slate-500 max-w-2xl leading-relaxed">
                Download a CSV statement from your bank or wallet app and drop it in. Kolo will categorise everything automatically.
              </p>
            </div>

            {/* Choose Source Selector */}
            <div className="space-y-3">
              <span className="block text-[11px] font-black text-slate-900 uppercase tracking-wider">Choose source</span>
              
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
                      {/* Logo badge circular */}
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-white shrink-0 ${source.color}`}>
                        <Landmark className="h-4.5 w-4.5" />
                      </div>

                      {/* Name tag */}
                      <span className="text-xs font-extrabold text-slate-900 mt-auto">{source.name}</span>

                      {/* Selected green checkmark */}
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

            {/* Drop Zone Box */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={triggerFileSelect}
              className="border-2 border-dashed border-slate-200 hover:border-slate-350 bg-slate-50/25 hover:bg-slate-50/50 rounded-3xl p-10 flex flex-col items-center justify-center min-h-[280px] cursor-pointer transition-all"
            >
              {/* Green Rounded Square Upload Icon */}
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-kolo-green text-kolo-dark shadow-sm">
                <Upload className="h-6 w-6 stroke-[3]" />
              </div>

              {/* Text indicators */}
              <span className="text-sm font-extrabold text-slate-900 mt-5">
                Drop your {sources.find(s => s.id === selectedSource)?.name} CSV here
              </span>
              <span className="text-xs text-slate-400 font-semibold mt-1">
                or click to browse · max 10MB
              </span>

              {/* Choose File Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerFileSelect();
                }}
                className="bg-slate-950 hover:bg-slate-800 text-white rounded-full px-5 py-2.5 text-xs font-black mt-5 flex items-center gap-2 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Choose file</span>
              </button>
            </div>

            {/* Expected Columns banner info */}
            <div className="rounded-3xl bg-slate-50 border border-slate-100 p-5 flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-950">Expected columns</span>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                date, narration, amount, type — Kolo auto-maps common bank formats including GTBank, Kuda and Moniepoint.
              </p>
            </div>
          </motion.div>
        ) : (
          /* ================= STEP 2 OF 2 ================= */
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Back to Step 1 Button */}
            <button
              onClick={handleBackToStep1}
              className="flex items-center gap-1 text-xs text-slate-550 font-bold hover:text-slate-850 transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
              <span>Back to upload</span>
            </button>

            {/* Header Text */}
            <div className="space-y-1">
              <span className="text-xs font-black text-slate-400">Step 2 of 2</span>
              <h2 className="text-3xl font-black tracking-tight text-slate-950">Map columns & import</h2>
              <p className="text-sm font-semibold text-slate-500 max-w-2xl leading-relaxed">
                Map your CSV columns to the appropriate fields. Kolo will process and import these transactions.
              </p>
            </div>

            {/* Main Columns Container */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Mapping Dropdowns Panel */}
              <div className="lg:col-span-1 rounded-3xl bg-white border border-slate-100 p-6 shadow-sm space-y-4 h-fit">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Field Mapping</h3>
                  <span className="text-[10px] bg-slate-100 rounded-full px-2 py-0.5 text-slate-650 font-bold">
                    File: {file.name.slice(0, 15)}...
                  </span>
                </div>

                <div className="space-y-3.5 text-xs font-semibold text-slate-650">
                  {/* Title */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 font-bold">Title / Vendor (Required)</label>
                    <select
                      value={titleCol}
                      onChange={(e) => setTitleCol(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none bg-white font-bold text-slate-700 focus:border-slate-400 cursor-pointer"
                    >
                      <option value="">-- Select Column --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Amount */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 font-bold">Amount (Required)</label>
                    <select
                      value={amountCol}
                      onChange={(e) => setAmountCol(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none bg-white font-bold text-slate-700 focus:border-slate-400 cursor-pointer"
                    >
                      <option value="">-- Select Column --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Subtitle */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 font-bold">Description / Subtitle</label>
                    <select
                      value={subtitleCol}
                      onChange={(e) => setSubtitleCol(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none bg-white font-bold text-slate-700 focus:border-slate-400 cursor-pointer"
                    >
                      <option value="">-- Select Column (Optional) --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 font-bold">Category</label>
                    <select
                      value={categoryCol}
                      onChange={(e) => setCategoryCol(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none bg-white font-bold text-slate-700 focus:border-slate-400 cursor-pointer"
                    >
                      <option value="">-- Select Column (Optional) --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Bank */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 font-bold">Bank Partner</label>
                    <select
                      value={bankCol}
                      onChange={(e) => setBankCol(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none bg-white font-bold text-slate-700 focus:border-slate-400 cursor-pointer"
                    >
                      <option value="">-- Select Column (Optional) --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 font-bold">Transaction Date</label>
                    <select
                      value={dateCol}
                      onChange={(e) => setDateCol(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none bg-white font-bold text-slate-700 focus:border-slate-400 cursor-pointer"
                    >
                      <option value="">-- Select Column (Optional) --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Flow Type */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 font-bold">Flow Direction (Income/Expense)</label>
                    <select
                      value={typeCol}
                      onChange={(e) => setTypeCol(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none bg-white font-bold text-slate-700 focus:border-slate-400 cursor-pointer"
                    >
                      <option value="">-- Select Column (Optional) --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleImport}
                    disabled={!titleCol || !amountCol || isImporting}
                    className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-3.5 text-center text-xs font-black transition-all mt-4 cursor-pointer active:scale-95 ${
                      titleCol && amountCol && !isImporting
                        ? "bg-slate-950 text-white hover:bg-slate-800 shadow-sm"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <span>{isImporting ? "Importing..." : `Import ${parsedData.length} records`}</span>
                    <ArrowRight size={14} className="stroke-[3]" />
                  </button>
                </div>
              </div>

              {/* Data Preview Table Panel */}
              <div className="lg:col-span-2 rounded-3xl bg-white border border-slate-100 p-4 sm:p-6 shadow-sm flex flex-col h-[400px] sm:h-[560px]">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2">Statement Data Preview</h3>
                <p className="text-[11px] sm:text-xs text-slate-400 font-semibold mb-4 sm:mb-5">Preview parsed row data contents from the CSV file.</p>

                <div className="flex-1 overflow-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-left border-collapse text-[11px] text-slate-650">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 font-bold uppercase tracking-wider text-slate-400 sticky top-0">
                        {parsedHeaders.map((h) => (
                          <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {parsedData.slice(0, 15).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-55/10 transition-colors">
                          {parsedHeaders.map((h) => (
                            <td key={h} className="px-4 py-2.5 whitespace-nowrap truncate max-w-[150px]" title={row[h]}>
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {parsedData.length > 15 && (
                        <tr>
                          <td colSpan={parsedHeaders.length} className="px-4 py-3 text-center text-slate-400 bg-slate-50/20 italic font-semibold">
                            Showing first 15 of {parsedData.length} records.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
