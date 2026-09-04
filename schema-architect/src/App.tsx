import { useState, useEffect } from "react";
import Header from "./components/Header";
import HomePage from "./components/HomePage";
import SinglePageInstructions from "./components/SinglePageInstructions";
import BulkWorkflowBanner from "./components/BulkWorkflowBanner";
import InputSection from "./components/InputSection";
import BatchProcessor, { AuditTask } from "./components/BatchProcessor";
import Dashboard from "./components/Dashboard";
import { auditSchema, AuditResult } from "./services/gemini";
import axios from "axios";
import { 
  Loader2, 
  AlertTriangle, 
  History, 
  X, 
  Search, 
  Database, 
  Info,
  ArrowLeft,
  ArrowRight
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";

interface HistoryItem {
  id: string;
  timestamp: number;
  type: "single" | "batch";
  displayName: string;
  // For single audits
  value?: string;
  result?: AuditResult;
  // For batch audits
  tasks?: AuditTask[];
}

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [batchTasks, setBatchTasks] = useState<AuditTask[]>([]);
  const [activeView, setActiveView] = useState<"home" | "single" | "batch">("home");
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [currentTemplate, setCurrentTemplate] = useState<string>("");
  const [isViewingBatchResult, setIsViewingBatchResult] = useState(false);

  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem("audit_history");
      if (savedHistory) {
        try {
          setHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error("Failed to parse history", e);
        }
      }
    } catch (err) {
      console.warn("localStorage is blocked or restricted in this sandboxed iframe environment.", err);
    }
  }, []);

  const saveToHistory = (item: HistoryItem) => {
    const newHistory = [item, ...history].slice(0, 20); // Keep last 20
    setHistory(newHistory);
    try {
      localStorage.setItem("audit_history", JSON.stringify(newHistory));
    } catch (err) {
      console.warn("localStorage write blocked inside the preview iframe. Falling back to memory state.", err);
    }
  };

  const handleAnalyze = async (data: { 
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
  }) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setIsViewingBatchResult(false);
    setActiveView("single");
    const mode = data.mode || "unified";

    try {
      let contentToAnalyze = data.value;
      let targetUrl = "Direct Snippet Input";

      // Split Mode (Text Context + Code)
      if (mode === "split") {
        targetUrl = "Split Mode: Context + Schema";
        const urlMatch = data.contextContent?.match(/URL:\s*(https?:\/\/[^\s\n]+)/i) || 
                         data.codeContent?.match(/URL:\s*(https?:\/\/[^\s\n]+)/i);
        if (urlMatch && urlMatch[1]) {
          targetUrl = urlMatch[1];
        }
        contentToAnalyze = `--- TEXT CONTEXT ---\n${data.contextContent || ""}\n\n--- PRESENT SCHEMA ---\n${data.codeContent || ""}`;
      } 
      // PDF Mode
      else if (mode === "pdf") {
        targetUrl = data.pdfFileName ? `PDF: ${data.pdfFileName}` : "Uploaded PDF Document";
        contentToAnalyze = `--- PDF DOCUMENT CONTEXT (${data.pdfFileName || "document.pdf"}) ---\n${data.contextContent || ""}\n\n--- PRESENT SCHEMA SNIPPET ---\n${data.codeContent || ""}`;
      }
      // Single URL crawl
      else if (data.value.startsWith("http://") || data.value.startsWith("https://")) {
        targetUrl = data.value;
        const response = await axios.post("/api/extract", { url: data.value });
        contentToAnalyze = response.data.fullContent;
      }

      setCurrentUrl(targetUrl);
      setCurrentTemplate(data.typeOverride && data.typeOverride !== "auto" ? data.typeOverride : "WebPage");

      const auditData = await auditSchema(
        contentToAnalyze, 
        targetUrl, 
        data.typeOverride, 
        data.gscIssues,
        data.contextContent,
        data.codeContent,
        data.selectedModel,
        data.optimizationMode
      );
      setResult(auditData);

      saveToHistory({
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        type: "single",
        displayName: targetUrl,
        value: data.value,
        result: auditData,
      });

    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || "Failed to analyze schema. Please verify input data.";
      if (err.response?.data) {
        if (typeof err.response.data === "object") {
          errMsg = err.response.data.details || err.response.data.error || errMsg;
        } else if (typeof err.response.data === "string") {
          try {
            const parsed = JSON.parse(err.response.data);
            errMsg = parsed.details || parsed.error || errMsg;
          } catch {
            if (err.response.data.includes("Access Denied") || err.response.status === 403) {
              errMsg = "Access Denied (Status 403). The website is actively protected by anti-bot firewalls. Architect's Tip: Open DevTools on the target page, run copy(document.documentElement.outerHTML) in the Console, and paste the code directly.";
            }
          }
        }
      }
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    const isSingle = item.type === "single" || (item as any).type === "html";
    
    if (isSingle && item.result) {
      setResult(item.result);
      setIsViewingBatchResult(false);
      setError(null);
      setShowHistory(false);
      setActiveView("single");
      setBatchTasks([]);
      
      const urlRegex = /^(https?:\/\/[^\s]+)$/;
      if (item.displayName && urlRegex.test(item.displayName)) {
        setCurrentUrl(item.displayName);
      } else {
        setCurrentUrl("Historical Run");
      }
      setCurrentTemplate("WebPage");
    } else if (item.type === "batch" && item.tasks) {
      setBatchTasks(item.tasks);
      setResult(null);
      setError(null);
      setShowHistory(false);
      setActiveView("batch");
    }
  };

  const handleBatchComplete = (tasks: AuditTask[]) => {
    const completedCount = tasks.filter(t => t.status === "completed").length;
    if (completedCount === 0) return;

    setBatchTasks(tasks);

    const templates = Array.from(new Set(tasks.map(t => t.templateName))).join(", ");
    saveToHistory({
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      type: "batch",
      displayName: `Batch Audit: ${completedCount} pages (${templates})`,
      tasks: tasks,
    });
  };

  const handleBackToBatch = () => {
    const currentHasResult = batchTasks.some(t => 
      t.result && JSON.stringify(t.result) === JSON.stringify(result)
    );

    if (!currentHasResult && result) {
      const matchingBatch = history.find(item => 
        item.type === "batch" && 
        item.tasks && 
        item.tasks.some(t => 
          t.result && JSON.stringify(t.result) === JSON.stringify(result)
        )
      );

      if (matchingBatch && matchingBatch.tasks) {
        setBatchTasks(matchingBatch.tasks);
      } else {
        const mostRecentBatch = history.find(item => item.type === "batch" && item.tasks);
        if (mostRecentBatch && mostRecentBatch.tasks) {
          setBatchTasks(mostRecentBatch.tasks);
        }
      }
    } else if (batchTasks.length === 0) {
      const mostRecentBatch = history.find(item => item.type === "batch" && item.tasks);
      if (mostRecentBatch && mostRecentBatch.tasks) {
        setBatchTasks(mostRecentBatch.tasks);
      }
    }
    setIsViewingBatchResult(false);
    setActiveView("batch");
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-cloud-dancer flex flex-col relative font-sans">
        <Header 
          activeView={activeView}
          onNavigate={(view) => setActiveView(view)}
          onToggleHistory={() => setShowHistory(!showHistory)}
          historyCount={history.length}
        />

        {showHistory && (
          <div className="absolute top-18 right-6 md:right-8 z-50 w-80 bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="p-4 bg-navy text-white flex justify-between items-center">
              <h3 className="text-[10px] font-bold uppercase tracking-widest">Audit History</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)} className="h-6 w-6 text-white hover:bg-white/10">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="h-[400px]">
              {history.length === 0 ? (
                <div className="p-12 text-center text-gray-400 text-xs italic">No past runs found.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {history.map((item) => (
                    <button 
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="w-full p-5 text-left hover:bg-cloud-dancer transition-colors group relative cursor-pointer"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] text-gray-400 font-mono">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] font-bold text-navy">
                          {typeof item.result?.healthScore === 'number' ? `${item.result.healthScore}%` : ""}
                          {item.type === "batch" && item.tasks ? `${Math.round(item.tasks.filter(t => t.status === 'completed').length / item.tasks.length * 100)}% Pass` : ""}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-navy truncate pr-4">
                        {item.displayName || (item.value ? `${item.value.slice(0, 30)}...` : "Legacy Audit")}
                      </p>
                      {item.result && (
                        <div className="mt-2 h-0.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-navy transition-all duration-500" style={{ width: `${item.result.healthScore}%` }} />
                        </div>
                      )}
                      {item.type === "batch" && item.tasks && (
                         <div className="mt-2 flex gap-1">
                            {item.tasks.slice(0, 5).map((t, idx) => (
                              <div key={idx} className={`h-1.5 w-4 rounded-full ${t.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'}`} />
                            ))}
                            {item.tasks.length > 5 && <span className="text-[8px] text-gray-400 font-bold">+{item.tasks.length - 5}</span>}
                         </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        <main className="flex-1">
          {/* VIEW 1: HOME PAGE (Minimalist Claude style) */}
          {activeView === "home" && (
            <HomePage 
              onSelectMode={(mode) => setActiveView(mode)}
              recentCount={history.length}
              onOpenHistory={() => setShowHistory(true)}
            />
          )}

          {/* VIEW 2: SINGLE PAGE AUDIT */}
          {activeView === "single" && (
            <div className="w-full">
              {/* Clean Sub-nav Header */}
              <div className="bg-gradient-to-r from-cloud-dancer via-[#E9E6DF] to-cloud-dancer border-b border-navy/10 shadow-sm py-3 px-6 md:px-12">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveView("home")}
                      className="text-xs font-bold text-navy/60 hover:text-navy flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Home</span>
                    </button>
                    <span className="text-navy/20">/</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-navy">
                      Audit a single page
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveView("batch")}
                    className="text-xs text-navy/60 hover:text-navy font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Switch to Bulk Audit</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Instructions + Input Section */}
              <div className="max-w-6xl mx-auto px-6 md:px-12 pt-8 pb-4">
                <SinglePageInstructions />

                <InputSection 
                  onAnalyze={handleAnalyze} 
                  isLoading={isLoading} 
                  isCollapsed={!!result && !isLoading} 
                />
              </div>

              {/* Back to Batch Results Button (when viewing a batch task) */}
              <div className="max-w-7xl mx-auto px-6">
                {result && isViewingBatchResult && (
                  <div className="flex justify-end items-center mb-4">
                    <Button 
                      onClick={handleBackToBatch}
                      size="sm"
                      variant="outline"
                      className="bg-white hover:bg-navy hover:text-white text-navy font-bold text-xs uppercase tracking-wider rounded-lg px-3.5 h-8 border border-navy/20 shadow-sm flex items-center gap-1.5 group transition-all cursor-pointer"
                    >
                       <Database className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                       Back to Batch Results
                    </Button>
                  </div>
                )}
              </div>

              {/* Status and Results */}
              <div className="max-w-7xl mx-auto px-6 py-8">
                {isLoading && (
                  <div className="flex flex-col items-center justify-center py-20 space-y-6 animate-in fade-in zoom-in duration-500">
                    <div className="relative">
                      <div className="w-24 h-24 border-4 border-ice-melt/30 border-t-navy rounded-full animate-spin" />
                      <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-navy" />
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-xl font-heading font-bold text-navy uppercase tracking-widest">Performing Diagnostic</h3>
                      <p className="text-sm text-gray-500 animate-pulse">Running CoT, CoVe, and CoD verification layers...</p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="max-w-4xl mx-auto px-8 animate-in slide-in-from-top-4 duration-500">
                    <Alert variant="destructive" className="rounded-2xl border bg-red-50/50 backdrop-blur-sm border-red-200 shadow-xl p-6">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <AlertTitle className="text-red-900 font-bold uppercase text-xs tracking-widest ml-2">Diagnostic Failure</AlertTitle>
                      <AlertDescription className="text-red-700 mt-2 text-sm leading-relaxed">{error}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {result && !isLoading && (
                  <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
                    <Dashboard 
                      result={result} 
                      url={currentUrl} 
                      templateName={currentTemplate} 
                    />
                  </div>
                )}

                {!result && !isLoading && !error && (
                  <div className="flex flex-col items-center justify-center py-16 space-y-4 animate-in fade-in duration-700">
                    <div className="bg-navy/5 p-8 rounded-full ring-1 ring-navy/10">
                      <Search className="w-10 h-10 text-navy/20" />
                    </div>
                    <div className="text-center max-w-sm">
                      <p className="text-navy/40 font-heading font-bold uppercase tracking-[0.2em] text-xs">Ready for input</p>
                      <p className="text-xs text-navy/40 mt-1 leading-relaxed">
                        Use the instructions above to copy your code or input a live URL.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 3: BULK AUDIT */}
          {activeView === "batch" && (
            <div className="w-full">
              {/* Clean Sub-nav Header */}
              <div className="bg-gradient-to-r from-cloud-dancer via-[#E9E6DF] to-cloud-dancer border-b border-navy/10 shadow-sm py-3 px-6 md:px-12">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveView("home")}
                      className="text-xs font-bold text-navy/60 hover:text-navy flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Home</span>
                    </button>
                    <span className="text-navy/20">/</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-navy">
                      Bulk audit
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveView("single")}
                    className="text-xs text-navy/60 hover:text-navy font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Switch to Single Page</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="max-w-6xl mx-auto px-6 md:px-12 pt-8 pb-16">
                {/* Workflow Tool Banner: Page template identifier */}
                <BulkWorkflowBanner />

                {/* Batch Processor */}
                <BatchProcessor 
                  initialTasks={batchTasks}
                  onBatchProcessed={setBatchTasks} 
                  onBatchComplete={handleBatchComplete}
                  onViewResult={(task, currentTasks) => {
                    setResult(task.result!);
                    setIsViewingBatchResult(true);
                    setCurrentUrl(task.url);
                    setCurrentTemplate(task.templateName);
                    if (currentTasks && currentTasks.length > 0) {
                      setBatchTasks(currentTasks);
                    }
                    setActiveView("single");
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
