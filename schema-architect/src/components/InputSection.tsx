import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Code2, 
  Zap, 
  Lightbulb, 
  Copy, 
  Check, 
  Settings2, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  Activity, 
  Globe, 
  FileText, 
  FileUp, 
  UploadCloud, 
  CheckCircle2, 
  Trash2, 
  Eye, 
  Sparkles,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InputSectionProps {
  onAnalyze: (data: { 
    type: "html"; 
    value: string; 
    typeOverride?: string; 
    gscIssues?: string;
    contextContent?: string;
    codeContent?: string;
    mode?: "unified" | "split" | "pdf";
    selectedModel?: string;
    optimizationMode?: "speed" | "accuracy";
    pdfBase64?: string;
    pdfFileName?: string;
  }) => void;
  isLoading: boolean;
  isCollapsed?: boolean;
  lastManualDiagnosticDuration?: number | null;
}

const GSC_PRESETS = [
  { value: "missing-price", label: "Missing field 'price' (in 'offers')", text: "Missing field 'price' (in 'offers')" },
  { value: "missing-reviews", label: "Missing field 'review' or 'aggregateRating'", text: "Missing field 'review' (optional) OR Missing field 'aggregateRating' (optional)" },
  { value: "missing-author-name", label: "Missing field 'author' -> 'name'", text: "Missing field 'author' (in 'Article') -> 'name' is required to validate" },
  { value: "missing-video-metadata", label: "Missing 'uploadDate' / 'thumbnailUrl'", text: "Video Object errors: Missing field 'uploadDate' (in 'VideoObject') and Missing field 'thumbnailUrl'" },
  { value: "duplicate-id", label: "Duplicate '@id' found / ID collision", text: "Duplicate '@id' error - multiple entities resolve to the same identifier hash" },
];

const SCHEMA_TYPES = [
  { value: "auto", label: "Auto-Detect (Recommended)" },
  { value: "Book", label: "Book" },
  { value: "Product", label: "Product" },
  { value: "Course", label: "Course" },
  { value: "Event", label: "Event" },
  { value: "LocalBusiness", label: "LocalBusiness" },
  { value: "Article", label: "Article" },
  { value: "Recipe", label: "Recipe" },
  { value: "SoftwareApplication", label: "Software Application" },
  { value: "WebApplication", label: "Web Application" },
  { value: "FAQPage", label: "FAQ Page" },
];

export default function InputSection({ 
  onAnalyze, 
  isLoading, 
  isCollapsed: initialCollapsed = false,
  lastManualDiagnosticDuration
}: InputSectionProps) {
  const [html, setHtml] = useState("");
  const [mode, setMode] = useState<"unified" | "split" | "pdf">("unified");
  const [contextContent, setContextContent] = useState("");
  const [codeContent, setCodeContent] = useState("");
  const [typeOverride, setTypeOverride] = useState("auto");
  const [gscIssuesText, setGscIssuesText] = useState("");
  const [showGsc, setShowGsc] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const [htmlCopied, setHtmlCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [optimizationMode, setOptimizationMode] = useState<"speed" | "accuracy">("speed");

  // PDF Upload State
  const [pdfFile, setPdfFile] = useState<{
    name: string;
    size: string;
    numPages: number;
    text: string;
    base64: string;
  } | null>(null);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [pdfExtractError, setPdfExtractError] = useState<string | null>(null);
  const [showPdfTextPreview, setShowPdfTextPreview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-collapse when a result is present (controlled by prop)
  useEffect(() => {
    setIsCollapsed(initialCollapsed);
  }, [initialCollapsed]);

  const handlePdfUpload = async (file: File) => {
    if (!file || file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfExtractError("Please select a valid PDF file (.pdf)");
      return;
    }

    setIsExtractingPdf(true);
    setPdfExtractError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = e.target?.result as string;
        try {
          const res = await axios.post("/api/extract-pdf", {
            pdfBase64: base64String,
            filename: file.name
          });

          const extractedText = res.data.text || "";
          setPdfFile({
            name: file.name,
            size: (file.size / 1024).toFixed(1) + " KB",
            numPages: res.data.numPages || 1,
            text: extractedText,
            base64: base64String
          });
          setContextContent(extractedText);
          setIsExtractingPdf(false);
        } catch (err: any) {
          console.error("PDF extraction error:", err);
          setPdfExtractError(err.response?.data?.details || err.message || "Failed to extract text from PDF");
          setIsExtractingPdf(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setPdfExtractError("Failed to read file: " + err.message);
      setIsExtractingPdf(false);
    }
  };

  const removePdf = () => {
    setPdfFile(null);
    setContextContent("");
    setPdfExtractError(null);
    setShowPdfTextPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const copyJsonTip = () => {
    const code = `(function() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let output = \`URL: \${window.location.href}\\n\`;
    scripts.forEach((s, i) => {
        output += \`\\n--- Schema Block \${i+1} ---\\n\${s.innerText}\\n\`;
    });
    console.log(output);
    copy(output); // Automatically copies it to your clipboard!
})();`;
    navigator.clipboard.writeText(code);
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  const copyTextTip = () => {
    const code = `(function() {
    const text = document.body.innerText;
    const output = \`URL: \${window.location.href}\\n\\n--- Page Content ---\\n\${text}\`;
    console.log(output);
    copy(output);
})();`;
    navigator.clipboard.writeText(code);
    setTextCopied(true);
    setTimeout(() => setTextCopied(false), 2000);
  };

  const copyHtmlTip = () => {
    const code = `copy(document.documentElement.outerHTML);`;
    navigator.clipboard.writeText(code);
    setHtmlCopied(true);
    setTimeout(() => setHtmlCopied(false), 2000);
  };

  const handleSubmit = () => {
    if (mode === "pdf") {
      onAnalyze({
        type: "html",
        value: "",
        typeOverride: typeOverride === "auto" ? undefined : typeOverride,
        gscIssues: gscIssuesText.trim() || undefined,
        contextContent: contextContent.trim() || (pdfFile ? `--- PDF CONTEXT: ${pdfFile.name} ---\n${pdfFile.text}` : undefined),
        codeContent: codeContent.trim() || undefined,
        mode: "pdf",
        selectedModel: selectedModel,
        optimizationMode: optimizationMode,
        pdfBase64: pdfFile?.base64,
        pdfFileName: pdfFile?.name
      });
    } else if (mode === "split") {
      onAnalyze({
        type: "html",
        value: "",
        typeOverride: typeOverride === "auto" ? undefined : typeOverride,
        gscIssues: gscIssuesText.trim() || undefined,
        contextContent: contextContent.trim() || undefined,
        codeContent: codeContent.trim() || undefined,
        mode: "split",
        selectedModel: selectedModel,
        optimizationMode: optimizationMode
      });
    } else {
      onAnalyze({
        type: "html",
        value: html,
        typeOverride: typeOverride === "auto" ? undefined : typeOverride,
        gscIssues: gscIssuesText.trim() || undefined,
        mode: "unified",
        selectedModel: selectedModel,
        optimizationMode: optimizationMode
      });
    }
  };

  const isSubmitDisabled = isLoading || isExtractingPdf || (
    mode === "unified" ? !html.trim() :
    mode === "split" ? (!contextContent.trim() && !codeContent.trim()) :
    mode === "pdf" ? (!pdfFile && !contextContent.trim() && !codeContent.trim()) : true
  );

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-cloud-dancer via-[#EAE6DF] to-cloud-dancer border-b border-navy/10 transition-all duration-500">
      {/* Decorative elements for a modern look */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-ice-melt/20 rounded-full blur-3xl opacity-60" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-navy/5 rounded-full blur-3xl opacity-60" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10 p-12 lg:p-20 py-8 lg:py-12 space-y-8">
        
        {/* Adaptive Pace Telemetry Card */}
        <div className="p-6 bg-navy text-white rounded-2xl shadow-xl shadow-navy/10 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 transition-all hover:scale-[1.01] duration-300">
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-2xl shrink-0 ${lastManualDiagnosticDuration ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"}`}>
              <Activity className={`w-6 h-6 ${lastManualDiagnosticDuration ? "animate-pulse" : "animate-bounce"}`} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${lastManualDiagnosticDuration ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${lastManualDiagnosticDuration ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                </span>
                <span className="text-[9px] uppercase tracking-widest font-heading font-extrabold text-white/70">
                  {lastManualDiagnosticDuration ? "Adaptive Pace Engine: Calibrated" : "Adaptive Pace Engine: Active Waiting"}
                </span>
              </div>
              <h4 className="text-sm font-heading font-bold tracking-wide">
                {lastManualDiagnosticDuration 
                  ? "Crawl-pacing engine successfully calibrated to your server performance!" 
                  : "Awaiting your first Manual Diagnostic audit to configure adaptive crawl queues."}
              </h4>
              <p className="text-[11px] text-white/70 leading-relaxed max-w-2xl">
                {lastManualDiagnosticDuration 
                  ? "We measured your last manual diagnostic analysis run-time. To prevent Gemini API rate limits in batch crawling, we auto-calculated a dynamic pacing interval (+30s safety buffer) for safe bulk jobs."
                  : "To guarantee robust bulk audits without Gemini API quota exceptions, we track your manual audit run duration and dynamically sync a protective cooldown interval with our sequential crawler."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 bg-white/5 p-4 rounded-xl border border-white/5 w-full md:w-auto justify-around md:justify-start">
            <div className="text-center px-4 border-r border-white/10">
              <span className="text-[9px] uppercase font-bold text-white/40 tracking-wider block mb-1">Last Speed</span>
              <p className="text-lg font-mono font-extrabold text-lemon-icing">
                {lastManualDiagnosticDuration ? `${(lastManualDiagnosticDuration / 1000).toFixed(1)}s` : "Pending"}
              </p>
            </div>
            <div className="text-center px-4">
              <span className="text-[9px] uppercase font-bold text-white/40 tracking-wider block mb-1">Queue Interval</span>
              <p className="text-lg font-mono font-extrabold text-emerald-400">
                {lastManualDiagnosticDuration ? `${((lastManualDiagnosticDuration + 30000) / 1000).toFixed(1)}s` : "Pending"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-0">
          <div className="flex items-center gap-3">
            <div className="bg-navy p-2 rounded-lg shadow-lg shadow-navy/20 text-white animate-pulse">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-3xl font-heading text-navy tracking-tight leading-tight">Diagnostic Input</h2>
              {isCollapsed && (
                <p className="text-[10px] text-navy/60 uppercase tracking-widest font-bold mt-1 max-w-[300px] truncate italic">
                  {mode === "pdf" && pdfFile ? `PDF Active: ${pdfFile.name}` : mode === "split" ? "Split Context & Code Active" : html.trim() ? `Analysis Active: ${html.slice(0, 45)}...` : "Active"}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {!isCollapsed && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 bg-white/60 backdrop-blur-md p-2 px-4 rounded-xl border border-navy/10"
              >
                <div className="flex items-center gap-2 text-navy/60">
                  <Settings2 className="w-4 h-4" />
                  <span className="text-[10px] uppercase font-bold tracking-widest">Type Override</span>
                </div>
                <Select value={typeOverride} onValueChange={setTypeOverride}>
                  <SelectTrigger className="w-[200px] h-9 bg-white border border-navy/10 text-navy font-bold text-xs rounded-lg shadow-inner">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-none shadow-2xl">
                    {SCHEMA_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-xs font-medium focus:bg-ice-melt focus:text-navy">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
            
            <Button 
              variant="ghost" 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-navy hover:bg-navy/5 rounded-xl px-4 h-11 flex items-center gap-2 group font-semibold"
            >
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">
                {isCollapsed ? "Expand Parameters" : "Collapse"}
              </span>
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {!isCollapsed && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                  <div className="lg:col-span-2">
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-1 rounded-2xl shadow-2xl">
                      <div className="bg-white rounded-xl p-6 space-y-6">
                        
                        {/* Mode Selector Tabs */}
                        <div className="grid grid-cols-3 gap-1 bg-gray-100/90 p-1.5 rounded-xl border border-gray-200/60">
                          <button
                            type="button"
                            onClick={() => setMode("unified")}
                            className={`flex items-center justify-center gap-2 text-center py-2.5 text-xs font-bold rounded-lg transition-all ${
                              mode === "unified"
                                ? "bg-navy text-white shadow-md"
                                : "text-navy/65 hover:text-navy hover:bg-gray-200/50"
                            }`}
                          >
                            <Globe className="w-3.5 h-3.5" />
                            <span>Unified (URL / HTML)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode("split")}
                            className={`flex items-center justify-center gap-2 text-center py-2.5 text-xs font-bold rounded-lg transition-all ${
                              mode === "split"
                                ? "bg-navy text-white shadow-md"
                                : "text-navy/65 hover:text-navy hover:bg-gray-200/50"
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Paste Text & Schema</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode("pdf")}
                            className={`flex items-center justify-center gap-2 text-center py-2.5 text-xs font-bold rounded-lg transition-all ${
                              mode === "pdf"
                                ? "bg-navy text-white shadow-md"
                                : "text-navy/65 hover:text-navy hover:bg-gray-200/50"
                            }`}
                          >
                            <FileUp className="w-3.5 h-3.5" />
                            <span>Upload PDF & Schema</span>
                          </button>
                        </div>

                        {/* MODE 1: UNIFIED INPUT */}
                        {mode === "unified" && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between ml-1">
                              <label className="text-xs font-bold uppercase tracking-widest text-navy/40">
                                Target URL, Raw HTML Snippet, or JSON-LD
                              </label>
                              <Tooltip>
                                <TooltipTrigger className="text-navy/40 hover:text-navy transition-colors">
                                  <Info className="w-3.5 h-3.5" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-4 bg-navy text-white border-none rounded-xl shadow-2xl">
                                  <p className="text-xs leading-relaxed">
                                    <span className="font-bold text-ice-melt">Pro Tip:</span> Enter a live URL to automatically trigger our elite crawler proxy (extracting on-page JSON-LD, microdata, FAQs, and interactive tools), or paste full page HTML directly.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <Textarea 
                              placeholder="Paste your URL (e.g. https://example.com/product), full HTML or JSON-LD snippet here..." 
                              value={html}
                              onChange={(e) => setHtml(e.target.value)}
                              className="min-h-[250px] font-mono text-sm rounded-xl border-gray-100 bg-gray-50/50 focus:bg-white focus:border-ice-melt focus:ring-4 focus:ring-ice-melt/10 transition-all resize-none"
                            />
                          </div>
                        )}

                        {/* MODE 2: SPLIT INPUT (TEXT CONTEXT + SCHEMA) */}
                        {mode === "split" && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between ml-1">
                                <label className="text-xs font-bold uppercase tracking-widest text-navy/40 flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-navy/60" />
                                  Page Text Context
                                </label>
                                <div className="flex items-center gap-2">
                                  {contextContent.trim() && (
                                    <span className="text-[10px] font-mono text-gray-400">
                                      {contextContent.length.toLocaleString()} chars
                                    </span>
                                  )}
                                  <Tooltip>
                                    <TooltipTrigger className="text-navy/40 hover:text-navy transition-colors">
                                      <Info className="w-3.5 h-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs p-4 bg-navy text-white border-none rounded-xl shadow-2xl">
                                      <p className="text-xs leading-relaxed">
                                        <span className="font-bold text-ice-melt">Zero-Hallucination Grounding:</span> Paste rendered body copy or page text. The auditor verifies prices, ratings, authors, dates, and tool features directly against this context.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                              <Textarea 
                                placeholder="Paste clean body text copy or rendered text context here..." 
                                value={contextContent}
                                onChange={(e) => setContextContent(e.target.value)}
                                className="min-h-[250px] font-mono text-sm rounded-xl border-gray-100 bg-gray-50/50 focus:bg-white focus:border-ice-melt focus:ring-4 focus:ring-ice-melt/10 transition-all resize-none"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between ml-1">
                                <label className="text-xs font-bold uppercase tracking-widest text-navy/40 flex items-center gap-1.5">
                                  <Code2 className="w-3.5 h-3.5 text-navy/60" />
                                  Present Schema Code
                                </label>
                                <div className="flex items-center gap-2">
                                  {codeContent.trim() && (
                                    <span className="text-[10px] font-mono text-gray-400">
                                      {codeContent.length.toLocaleString()} chars
                                    </span>
                                  )}
                                  <Tooltip>
                                    <TooltipTrigger className="text-navy/40 hover:text-navy transition-colors">
                                      <Info className="w-3.5 h-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs p-4 bg-navy text-white border-none rounded-xl shadow-2xl">
                                      <p className="text-xs leading-relaxed">
                                        <span className="font-bold text-ice-melt">Schema Validation:</span> Paste existing JSON-LD script blocks present on this page to cross-examine and perfect them against the context text.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                              <Textarea 
                                placeholder="Paste present JSON-LD schema scripts here..." 
                                value={codeContent}
                                onChange={(e) => setCodeContent(e.target.value)}
                                className="min-h-[250px] font-mono text-sm rounded-xl border-gray-100 bg-gray-50/50 focus:bg-white focus:border-ice-melt focus:ring-4 focus:ring-ice-melt/10 transition-all resize-none"
                              />
                            </div>
                          </div>
                        )}

                        {/* MODE 3: UPLOAD PDF & SCHEMA */}
                        {mode === "pdf" && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                              
                              {/* Left Column: PDF Dropzone & Context Status */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between ml-1">
                                  <label className="text-xs font-bold uppercase tracking-widest text-navy/40 flex items-center gap-1.5">
                                    <FileUp className="w-3.5 h-3.5 text-navy/60" />
                                    PDF Document Context
                                  </label>
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                    Multimodal Context Grounding
                                  </span>
                                </div>

                                <input 
                                  ref={fileInputRef}
                                  type="file" 
                                  accept=".pdf,application/pdf" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handlePdfUpload(file);
                                  }}
                                />

                                {!pdfFile ? (
                                  <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setIsDragging(false);
                                      const file = e.dataTransfer.files?.[0];
                                      if (file) handlePdfUpload(file);
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`cursor-pointer min-h-[200px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all ${
                                      isDragging 
                                        ? "border-navy bg-navy/5 scale-[0.99]" 
                                        : "border-gray-300 hover:border-navy/50 hover:bg-gray-50/80 bg-gray-50/40"
                                    }`}
                                  >
                                    {isExtractingPdf ? (
                                      <div className="space-y-3 flex flex-col items-center">
                                        <RefreshCw className="w-8 h-8 text-navy animate-spin" />
                                        <div className="space-y-1">
                                          <p className="text-xs font-bold text-navy">Parsing PDF Document...</p>
                                          <p className="text-[11px] text-gray-500">Extracting textual hierarchy, entity nodes & metadata</p>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-3 flex flex-col items-center">
                                        <div className="p-3 bg-navy/5 text-navy rounded-2xl">
                                          <UploadCloud className="w-8 h-8" />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs font-bold text-navy">
                                            Drop your PDF here, or <span className="text-ice-melt underline decoration-2 font-extrabold text-navy">browse</span>
                                          </p>
                                          <p className="text-[11px] text-gray-500">
                                            Supports page print-outs, whitepapers, product specs & documentation (.pdf)
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
                                          <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                          <h4 className="text-xs font-bold text-navy truncate" title={pdfFile.name}>
                                            {pdfFile.name}
                                          </h4>
                                          <p className="text-[10px] text-gray-500 font-mono">
                                            {pdfFile.size} • {pdfFile.numPages} {pdfFile.numPages === 1 ? 'page' : 'pages'} • {pdfFile.text.length.toLocaleString()} chars
                                          </p>
                                        </div>
                                      </div>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={removePdf}
                                        className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0"
                                        title="Remove PDF"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>

                                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() => setShowPdfTextPreview(!showPdfTextPreview)}
                                        className="text-[11px] text-navy/70 hover:text-navy font-bold flex items-center gap-1.5 transition-colors"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>{showPdfTextPreview ? "Hide Extracted Text" : "View/Edit Extracted Text"}</span>
                                      </button>
                                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                        Extracted Successfully
                                      </span>
                                    </div>

                                    {showPdfTextPreview && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        className="pt-2"
                                      >
                                        <Textarea
                                          value={contextContent}
                                          onChange={(e) => setContextContent(e.target.value)}
                                          className="min-h-[140px] text-xs font-mono bg-gray-50/50 rounded-xl"
                                          placeholder="Extracted PDF text..."
                                        />
                                        <p className="text-[9px] text-gray-400 mt-1">
                                          You can edit or add notes to the extracted text above before auditing.
                                        </p>
                                      </motion.div>
                                    )}
                                  </div>
                                )}

                                {pdfExtractError && (
                                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>{pdfExtractError}</span>
                                  </div>
                                )}
                              </div>

                              {/* Right Column: Present Schema Code */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between ml-1">
                                  <label className="text-xs font-bold uppercase tracking-widest text-navy/40 flex items-center gap-1.5">
                                    <Code2 className="w-3.5 h-3.5 text-navy/60" />
                                    Present Schema Code
                                  </label>
                                  <Tooltip>
                                    <TooltipTrigger className="text-navy/40 hover:text-navy transition-colors">
                                      <Info className="w-3.5 h-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs p-4 bg-navy text-white border-none rounded-xl shadow-2xl">
                                      <p className="text-xs leading-relaxed">
                                        <span className="font-bold text-ice-melt">Schema Grounding:</span> Paste your existing or draft JSON-LD snippet here. The AI will audit and perfect it against the facts extracted from your uploaded PDF.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <Textarea 
                                  placeholder="Paste present JSON-LD schema scripts to ground against the PDF (optional or provide snippet)..." 
                                  value={codeContent}
                                  onChange={(e) => setCodeContent(e.target.value)}
                                  className="min-h-[200px] font-mono text-sm rounded-xl border-gray-100 bg-gray-50/50 focus:bg-white focus:border-ice-melt focus:ring-4 focus:ring-ice-melt/10 transition-all resize-none"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Google Search Console Cross-Checker Integration */}
                        <div className="rounded-xl border border-dashed border-navy/20 p-4 space-y-4 bg-sky-50/10">
                          <button
                            type="button"
                            onClick={() => setShowGsc(!showGsc)}
                            className="flex items-center justify-between w-full text-left focus:outline-none"
                          >
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                              <span className="text-xs font-bold uppercase tracking-wider text-navy">
                                Google Search Console Cross-Checker{gscIssuesText.trim() ? " (Active)" : ""}
                              </span>
                            </div>
                            <span className="text-[10px] text-navy/40 font-bold uppercase tracking-widest hover:text-navy transition-colors">
                              {showGsc ? "Hide Targets" : "Configure Targets"}
                            </span>
                          </button>

                          {showGsc && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="space-y-4 pt-2 border-t border-navy/10 overflow-hidden"
                            >
                              <p className="text-[10px] text-gray-500 font-medium leading-relaxed font-sans">
                                Pinpoint and resolve known Search Console / Rich Results Test errors or warnings. Select a preset below or type custom logs.
                              </p>

                              <div className="flex flex-wrap gap-2">
                                {GSC_PRESETS.map((preset) => (
                                  <button
                                    key={preset.value}
                                    type="button"
                                    onClick={() => {
                                      setGscIssuesText((prev) => 
                                        prev ? `${prev}\n- ${preset.text}` : preset.text
                                      );
                                    }}
                                    className="text-[10px] bg-white text-navy font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-ice-melt/10 hover:border-ice-melt/50 transition-all flex items-center gap-1"
                                  >
                                    <span>+</span> {preset.label}
                                  </button>
                                ))}
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-navy/40">
                                  Current GSC Errors / Warning Logs
                                </label>
                                <Textarea
                                  placeholder="E.g., Missing field 'price' (in 'offers'), or paste raw issue message..."
                                  value={gscIssuesText}
                                  onChange={(e) => setGscIssuesText(e.target.value)}
                                  className="min-h-[85px] text-xs font-mono rounded-lg border-gray-200 bg-white"
                                />
                                {gscIssuesText && (
                                  <button
                                    type="button"
                                    onClick={() => setGscIssuesText("")}
                                    className="text-[9px] text-red-500 font-bold uppercase tracking-widest hover:underline"
                                  >
                                    Clear Input
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </div>
                        
                        <Button 
                          onClick={handleSubmit}
                          disabled={isSubmitDisabled}
                          className="w-full h-14 bg-navy hover:bg-navy/90 text-white font-bold uppercase tracking-widest rounded-xl shadow-xl shadow-navy/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {isLoading || isExtractingPdf ? (
                            <span className="flex items-center gap-2">
                              <Zap className="w-4 h-4 animate-pulse" />
                              {isExtractingPdf 
                                ? 'Extracting PDF Content...' 
                                : mode === "pdf" 
                                  ? 'Synthesizing PDF Document & Auditing...' 
                                  : mode === "split" 
                                    ? 'Synthesizing Text & Auditing...' 
                                    : (html.startsWith('http') ? 'Crawling & Analyzing...' : 'Processing...')}
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-lemon-icing" />
                              {mode === "pdf" ? "Audit Schema Against PDF Context" : mode === "split" ? "Audit Schema Against Text Context" : "Audit Snippet"}
                            </span>
                          )}
                        </Button>
                        
                        <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest font-medium">
                          Deep-content inspection powered by {selectedModel === "gemini-3.1-pro-preview" ? "Gemini 3.1 Pro" : selectedModel === "gemini-3.1-flash-lite" ? "Gemini 3.1 Flash Lite" : selectedModel === "gemini-2.5-flash-lite" ? "Gemini 2.5 Flash Lite" : selectedModel === "gemini-2.5-flash" ? "Gemini 2.5 Flash" : "Gemini 3.5 Flash"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Performance & Model Tuning Panel */}
                    <div className="bg-navy text-white p-8 rounded-2xl space-y-6 shadow-xl shadow-navy/20 border border-white/10 transition-all duration-300">
                      <div className="flex items-center gap-3 text-[#FDE9AC]">
                        <div className="bg-white/10 p-2 rounded-lg">
                          <Settings2 className="w-5 h-5 text-[#FDE9AC]" />
                        </div>
                        <h3 className="font-heading font-bold uppercase tracking-wider text-sm text-white">Performance Tuning</h3>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-bold tracking-wider text-white/60 block">
                            Intelligence Engine (Model)
                          </label>
                          <Select value={selectedModel} onValueChange={setSelectedModel}>
                            <SelectTrigger className="w-full h-10 bg-white/10 border border-white/15 text-white font-bold text-xs rounded-lg shadow-inner focus:ring-0">
                              <SelectValue placeholder="Select Model" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-2xl bg-navy text-white">
                              <SelectItem value="gemini-2.5-flash" className="text-xs font-medium focus:bg-white/10 focus:text-white">
                                Gemini 2.5 Flash (Recommended - High Rate Limits)
                              </SelectItem>
                              <SelectItem value="gemini-2.5-flash-lite" className="text-xs font-medium focus:bg-white/10 focus:text-white">
                                Gemini 2.5 Flash Lite (Ultra-Fast)
                              </SelectItem>
                              <SelectItem value="gemini-3.5-flash" className="text-xs font-medium focus:bg-white/10 focus:text-white">
                                Gemini 3.5 Flash
                              </SelectItem>
                              <SelectItem value="gemini-3.1-pro-preview" className="text-xs font-medium focus:bg-white/10 focus:text-white">
                                Gemini 3.1 Pro (Deepest Reasoning)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-white/50 leading-relaxed">
                            Flash Lite is highly optimized for fast latency. Pro delivers maximum depth but is slower.
                          </p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/10">
                          <label className="text-[10px] uppercase font-bold tracking-wider text-white/60 block">
                            Audit Detail Level
                          </label>
                          <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
                            <button
                              type="button"
                              onClick={() => setOptimizationMode("speed")}
                              className={`py-2 text-[10px] uppercase tracking-widest font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                optimizationMode === "speed"
                                  ? "bg-[#FDE9AC] text-navy shadow-md font-bold"
                                  : "text-white/60 hover:text-white hover:bg-white/5"
                              }`}
                            >
                              <Zap className="w-3 h-3" />
                              Fast Audit
                            </button>
                            <button
                              type="button"
                              onClick={() => setOptimizationMode("accuracy")}
                              className={`py-2 text-[10px] uppercase tracking-widest font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                optimizationMode === "accuracy"
                                  ? "bg-[#C1D9F0] text-navy shadow-md font-bold"
                                  : "text-white/60 hover:text-white hover:bg-white/5"
                              }`}
                            >
                              <Activity className="w-3 h-3" />
                              Deep Audit
                            </button>
                          </div>
                          <p className="text-[10px] text-white/50 leading-relaxed">
                            {optimizationMode === "speed" 
                              ? "⚡ Fast Audit: Streamlines output structure and skips secondary pre-flight logs (saves up to 60% latency)." 
                              : "🔍 Deep Audit: Performs exhaustive pre-flight verification & blueprint logging (best for complex validation)."}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/60 backdrop-blur-xl border border-navy/10 p-8 rounded-2xl text-navy space-y-6 shadow-lg shadow-navy/5 font-sans">
                      <div className="flex items-center gap-3 text-navy">
                        <div className="bg-navy/10 p-2 rounded-lg">
                          <Lightbulb className="w-5 h-5 text-navy" />
                        </div>
                        <h3 className="font-heading font-bold uppercase tracking-wider text-sm">Architect's Tip: JSON-LD</h3>
                      </div>
                      
                      <div className="space-y-4">
                        <p className="text-sm font-bold leading-tight">Extract JSON-LD from a live page</p>
                        
                        <div className="space-y-3 text-xs opacity-80 leading-relaxed">
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">01</span>
                            <span>Right Click <span className="text-navy font-medium">Inspect</span> on the target page.</span>
                          </p>
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">02</span>
                            <span>Navigate to the <span className="text-navy font-medium">Console</span> tab.</span>
                          </p>
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">03</span>
                            <span>Paste and execute the following snippet:</span>
                          </p>
                        </div>

                        <div className="relative group/code">
                          <pre className="bg-navy/95 p-4 rounded-xl text-[10px] font-mono text-ice-melt overflow-x-auto border border-white/5 leading-normal">
                            {`(function() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let output = \`URL: \${window.location.href}\\n\`;
    scripts.forEach((s, i) => {
        output += \`\\n--- Schema Block \${i+1} ---\\n\${s.innerText}\\n\`;
    });
    console.log(output);
    copy(output); 
  })();`}
                          </pre>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={copyJsonTip}
                            className="absolute top-2 right-2 h-8 w-8 text-ice-melt hover:bg-white/10 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity"
                          >
                            {jsonCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/60 backdrop-blur-xl border border-navy/10 p-8 rounded-2xl text-navy space-y-6 shadow-lg shadow-navy/5">
                      <div className="flex items-center gap-3 text-navy">
                        <div className="bg-navy/10 p-2 rounded-lg">
                          <Lightbulb className="w-5 h-5 text-navy" />
                        </div>
                        <h3 className="font-heading font-bold uppercase tracking-wider text-sm">Architect's Tip: Rendered DOM</h3>
                      </div>
                      
                      <div className="space-y-4">
                        <p className="text-sm font-bold leading-tight">Extract JavaScript-Hydrated HTML</p>
                        
                        <div className="space-y-3 text-xs opacity-80 leading-relaxed">
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">01</span>
                            <span>For pages using client-side frameworks, Tag Managers (GTM) or dynamically injected elements.</span>
                          </p>
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">02</span>
                            <span><span className="font-bold">Option A (Inspect Element):</span> Right-click the page, select <span className="text-navy font-medium">Inspect</span>. Scroll to the top of the Elements tree, click on the <code className="bg-navy/10 px-1 py-0.5 rounded">&lt;html&gt;</code> tag. Right-click it and select <span className="text-navy font-medium">Copy &gt; Copy outerHTML</span>.</span>
                          </p>
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">03</span>
                            <span><span className="font-bold">Option B (Console - Safest):</span> To copy the entire outerHTML content programmatically without any manual scrolling or clipping, run this error-free command in the browser <span className="text-navy font-medium">Console</span>:</span>
                          </p>
                        </div>

                        <div className="relative group/code">
                          <pre className="bg-navy/95 p-4 rounded-xl text-[10px] font-mono text-ice-melt overflow-x-auto border border-white/5 leading-normal">
                            copy(document.documentElement.outerHTML);
                          </pre>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={copyHtmlTip}
                            className="absolute top-2 right-2 h-8 w-8 text-ice-melt hover:bg-white/10 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity"
                          >
                            {htmlCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                        
                        <p className="text-[10px] text-navy/60 italic leading-tight">
                          * Running this command directly avoids typical copy-paste clipping or syntax error issues.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/60 backdrop-blur-xl border border-navy/10 p-8 rounded-2xl text-navy space-y-6 shadow-lg shadow-navy/5">
                      <div className="flex items-center gap-3 text-navy">
                        <div className="bg-navy/10 p-2 rounded-lg">
                          <Lightbulb className="w-5 h-5 text-navy" />
                        </div>
                        <h3 className="font-heading font-bold uppercase tracking-wider text-sm">Architect's Tip: Context</h3>
                      </div>
                      
                      <div className="space-y-4">
                        <p className="text-sm font-bold leading-tight">Extract clean text for deep context</p>
                        
                        <div className="space-y-3 text-xs opacity-80 leading-relaxed">
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">01</span>
                            <span>Identify high-value pages with <span className="text-navy font-medium">no existing schema</span> or with custom documents (PDFs).</span>
                          </p>
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">02</span>
                            <span>Run this in your browser <span className="text-navy font-medium">Console</span>:</span>
                          </p>
                        </div>

                        <div className="relative group/code">
                          <pre className="bg-navy/95 p-4 rounded-xl text-[10px] font-mono text-ice-melt overflow-x-auto border border-white/5 leading-normal">
                            {`(function() {
    const text = document.body.innerText;
    const output = \`URL: \${window.location.href}\\n\\n--- Page Content ---\\n\${text}\`;
    console.log(output);
    copy(output);
  })();`}
                          </pre>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={copyTextTip}
                            className="absolute top-2 right-2 h-8 w-8 text-ice-melt hover:bg-white/10 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity"
                          >
                            {textCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                        
                        <p className="text-[10px] text-navy/60 italic leading-tight">
                          * Perfect for bootstrapping schema-from-scratch on complex informational pages and documents.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
