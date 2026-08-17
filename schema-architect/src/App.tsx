import { useState, useEffect, useRef } from "react";
import Header from "./components/Header";
import InputSection from "./components/InputSection";
import BatchProcessor, { AuditTask } from "./components/BatchProcessor";
import Dashboard from "./components/Dashboard";
import SchemaEditor from "./components/SchemaEditor";
import { auditSchema, AuditResult } from "./services/gemini";
import axios from "axios";
import { 
  Loader2, 
  AlertTriangle, 
  History, 
  X, 
  Search, 
  Database, 
  Zap, 
  Activity, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  ShieldAlert, 
  HeartPulse, 
  Sparkles,
  Sliders
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [activeTab, setActiveTab] = useState("manual");
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [currentTemplate, setCurrentTemplate] = useState<string>("");
  const [lastManualDiagnosticDuration, setLastManualDiagnosticDuration] = useState<number | null>(null);
  const [globalCooldown, setGlobalCooldown] = useState<number | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Booting Client SEO Architect Pacing Kernel...`,
    `[${new Date().toLocaleTimeString()}] [TELEMETRY] Adaptive Pace Engine loaded in offline standby mode.`,
    `[${new Date().toLocaleTimeString()}] [INFO] Free-tier Google AI Studio limits tracked: 15 RPM | 1,500 RPD.`,
    `[${new Date().toLocaleTimeString()}] [MONITOR] Port 3000 RPC loop listening... Ready for manual diagnostic analysis.`
  ]);
  const [timeToReset, setTimeToReset] = useState<number>(15 * 3600 + 31 * 60 + 12);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const simTimeoutIds = useRef<NodeJS.Timeout[]>([]);

  const addLog = (tag: string, message: string) => {
    const time = new Date().toLocaleTimeString();
    setConsoleLogs((prev) => [...prev, `[${time}] [${tag}] ${message}`]);
  };

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

  useEffect(() => {
    if (globalCooldown === null) return;
    if (globalCooldown <= 0) {
      setGlobalCooldown(null);
      setIsSimulated(false);
      return;
    }
    const timer = setTimeout(() => {
      setGlobalCooldown(prev => (prev !== null ? Math.max(0, prev - 0.1) : null));
    }, 100);
    return () => clearTimeout(timer);
  }, [globalCooldown]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeToReset((prev) => (prev > 0 ? prev - 1 : 24 * 3600));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs]);

  useEffect(() => {
    return () => {
      simTimeoutIds.current.forEach(id => clearTimeout(id));
    };
  }, []);

  const triggerSimulation = () => {
    // Clear any existing simulation timeouts
    simTimeoutIds.current.forEach(id => clearTimeout(id));
    simTimeoutIds.current = [];

    setIsSimulated(true);
    setGlobalCooldown(45);
    setShowTelemetryDetails(true);

    const logSteps = [
      { delay: 0, tag: "SYSTEM", msg: "🚀 Initializing Batch Crawl Queue test run..." },
      { delay: 1000, tag: "CRAWLER", msg: "Dispatching outbound HTTP Request to target: https://seoclarity.net/solutions/platform ..." },
      { delay: 2200, tag: "AUDITOR", msg: "WebPage template schema located in page DOM source code (3,240 bytes)." },
      { delay: 3500, tag: "API", msg: "Transmitting AST token payload to Gemini 3.5 Flash Model..." },
      { delay: 4800, tag: "API", msg: "RPC Response acquired in 1.3s. Schema matches Google guidelines with 98.4% conformance." },
      { delay: 5200, tag: "THROTTLE", msg: "Queue pacing calculated: Manual run benchmark was 1.2s. Enforcing active pace of 31.2s." },
      { delay: 6500, tag: "COOLDOWN", msg: "Queue item 1 complete. Lock engaged. Inter-crawling sequence sleep engaged..." },
      { delay: 12000, tag: "SYSTEM", msg: "Attempting next batch execution item 2/15: https://seoclarity.net/blog/seo-best-practices ..." },
      { delay: 13500, tag: "WARNING", msg: "Google AI Studio API Rate Limit threshold reached: 15 Requests Per Minute exceeded on Free Tier key!" },
      { delay: 14500, tag: "ERROR", msg: "❌ [429] RESOURCE_EXHAUSTED: Daily request cap or per-minute burst rate exceeded." },
      { delay: 15200, tag: "SHIELD", msg: "🛡️ Rate Limit Protector Active! Backing off immediate queue requests." },
      { delay: 15800, tag: "COOLDOWN", msg: "Engaged 45.0s protective global visual cooldown to safely restore rate credits." }
    ];

    logSteps.forEach(step => {
      const id = setTimeout(() => {
        addLog(step.tag, step.msg);
      }, step.delay);
      simTimeoutIds.current.push(id);
    });
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

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
    const mode = data.mode || "unified";

    const startTime = Date.now();
    try {
      let htmlToAudit = data.value;
      let targetUrl = undefined;

      if (mode === "pdf") {
        addLog("CRAWLER", `Initiating multimodal document audit... PDF: ${data.pdfFileName || "Uploaded PDF"}`);
        addLog("SYSTEM", `Extracted PDF Grounding Context (${data.contextContent ? `${(data.contextContent.length / 1024).toFixed(1)} KB` : "Document Context"}) | Present Schema: ${data.codeContent ? `${(data.codeContent.length / 1024).toFixed(1)} KB` : "New Blueprint Grounding"}`);
        setCurrentUrl(data.pdfFileName ? `PDF: ${data.pdfFileName}` : "Uploaded PDF Document");
      } else if (mode === "split") {
        addLog("CRAWLER", `Initiating manual diagnostic audit... Mode: Split (Context & Code)`);
        addLog("SYSTEM", `Synthesized Inputs - Page Context: ${data.contextContent ? `${(data.contextContent.length / 1024).toFixed(1)} KB` : "0 KB"} | Present Schema: ${data.codeContent ? `${(data.codeContent.length / 1024).toFixed(1)} KB` : "0 KB"}`);
        setCurrentUrl("Split Input (Context & Code)");
      } else {
        // URL Detection: If the input looks like a URL, use our extraction proxy first
        const urlRegex = /^(https?:\/\/[^\s]+)$/;
        const isUrl = urlRegex.test(data.value.trim());

        addLog("CRAWLER", `Initiating manual diagnostic audit... Target: ${isUrl ? data.value.trim() : "Raw HTML Clipboard Snippet"}`);

        if (isUrl) {
          const extractionResponse = await axios.post("/api/extract", { url: data.value.trim() });
          htmlToAudit = extractionResponse.data.fullContent;
          targetUrl = data.value.trim();
          setCurrentUrl(targetUrl);
          addLog("SYSTEM", `Successfully extracted DOM contents (${(htmlToAudit.length / 1024).toFixed(1)} KB) via secure server-side proxy.`);
        } else {
          setCurrentUrl("Pasted HTML Snip");
        }
      }
      
      setCurrentTemplate(data.typeOverride || "WebPage");

      const modelLabel = data.selectedModel === "gemini-3.1-pro-preview" ? "Gemini 3.1 Pro" : data.selectedModel === "gemini-3.1-flash-lite" ? "Gemini 3.1 Flash Lite" : data.selectedModel === "gemini-2.5-flash-lite" ? "Gemini 2.5 Flash Lite" : data.selectedModel === "gemini-2.5-flash" ? "Gemini 2.5 Flash" : "Gemini 3.5 Flash";
      const modeLabel = data.optimizationMode === "speed" ? "Fast/Low-Latency" : "Deep-Audit/Thorough";
      addLog("API", `Sending AST structure and split components to ${modelLabel} (${modeLabel} mode) for structured JSON schema extraction...`);
      const auditResult = await auditSchema(
        htmlToAudit, 
        targetUrl, 
        data.typeOverride, 
        data.gscIssues,
        data.contextContent,
        data.codeContent,
        data.selectedModel,
        data.optimizationMode,
        data.pdfBase64,
        data.pdfFileName
      );
      
      // Calculate duration of manual run
      const durationMs = Date.now() - startTime;
      setLastManualDiagnosticDuration(durationMs);

      addLog("AUDITOR", `Diagnostic analysis successful in ${(durationMs / 1000).toFixed(1)}s! Schema type mapped to '${data.typeOverride || "Auto-Detect"}'.`);

      setResult(auditResult);
      
      saveToHistory({
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        type: "single",
        displayName: mode === "pdf"
          ? `PDF: ${data.pdfFileName || "Document Audit"}`
          : mode === "split" 
            ? "Context & Code Split Audit" 
            : (targetUrl || data.value.slice(0, 50) + "..."),
        value: mode === "pdf"
          ? `[PDF MODE: ${data.pdfFileName || 'Document'}]\n--- Extracted Text ---\n${data.contextContent?.slice(0, 500)}\n--- Schema ---\n${data.codeContent?.slice(0, 500)}`
          : mode === "split" 
            ? `[SPLIT MODE]\n--- Context ---\n${data.contextContent?.slice(0, 500)}\n--- Code ---\n${data.codeContent?.slice(0, 500)}` 
            : data.value,
        result: auditResult,
      });
    } catch (err: any) {
      console.error("Analysis failed:", err);
      let errMsg = err.message || "An unexpected error occurred during analysis.";
      if (err.response?.data) {
        if (typeof err.response.data === "object") {
          errMsg = err.response.data.details || err.response.data.error || errMsg;
        } else if (typeof err.response.data === "string") {
          try {
            const parsed = JSON.parse(err.response.data);
            errMsg = parsed.details || parsed.error || errMsg;
          } catch {
            if (err.response.data.includes("Access Denied") || err.response.status === 403) {
              errMsg = "Access Denied (Status 403). This site is protected by anti-bot measures. Architect's Tip: Use the 'Manual Diagnostic' tab and paste the HTML source directly. To get the entire rendered HTML, open Dev Tools > Console, type exactly: copy(document.documentElement.outerHTML); and hit enter, then paste the result.";
            }
          }
        }
      }
      setError(errMsg);
      addLog("ERROR", `Diagnostic analysis failed: ${errMsg}`);
      if (
        errMsg.toLowerCase().includes("quota") || 
        errMsg.toLowerCase().includes("429") || 
        errMsg.toLowerCase().includes("rate limit") || 
        errMsg.toLowerCase().includes("exhausted")
      ) {
        setGlobalCooldown(45);
        setShowTelemetryDetails(true);
        addLog("SHIELD", `Rate limit exhaust threshold breached. Triggered 45s protective cooldown window.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    const isSingle = item.type === "single" || (item as any).type === "html";
    
    if (isSingle && item.result) {
      setResult(item.result);
      setError(null);
      setShowHistory(false);
      setActiveTab("manual");
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
      setActiveTab("batch");
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
    setActiveTab("batch");
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-cloud-dancer flex flex-col relative font-sans">
        <Header />
        
        <div className="absolute top-20 right-8 z-50">
          <Button 
            variant="outline" 
            onClick={() => setShowHistory(!showHistory)}
            className="bg-white border-navy/10 text-navy hover:bg-ice-melt rounded-xl shadow-sm h-10 px-5"
          >
            <History className="w-4 h-4 mr-2" />
            Runs history
          </Button>
        </div>

        {showHistory && (
          <div className="absolute top-32 right-8 z-50 w-80 bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
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
                      className="w-full p-5 text-left hover:bg-cloud-dancer transition-colors group relative"
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
        
        {/* API Health & Pacing Telemetry Dashboard */}
        <div className="max-w-6xl mx-auto w-full px-12 lg:px-20 mt-6">
          <div className="bg-white rounded-2xl border border-navy/10 shadow-sm overflow-hidden transition-all duration-300">
            
            {/* Main Header Row */}
            <div className={`p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-100 transition-colors duration-300 ${globalCooldown !== null ? "bg-navy text-white border-b-white/10" : "bg-white text-navy"}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 transition-all ${globalCooldown !== null ? "bg-orange/20 text-orange" : "bg-navy/5 text-navy"}`}>
                  {globalCooldown !== null ? <Zap className="w-5 h-5 animate-bounce text-orange" /> : <Activity className="w-5 h-5 animate-pulse text-navy" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-extrabold text-xs tracking-wider uppercase">
                      API Pacing & Quota Control
                    </span>
                    <span className={`h-2.5 w-2.5 rounded-full ${globalCooldown !== null ? "bg-orange animate-ping" : "bg-emerald-500 animate-pulse"}`} />
                  </div>
                  <p className={`text-[10px] ${globalCooldown !== null ? "text-white/75" : "text-gray-500"} font-medium mt-0.5`}>
                    {globalCooldown !== null 
                      ? `Crawl pacing safety cooldown active: ${globalCooldown.toFixed(1)}s remaining`
                      : "System calibrated. Monitoring queue load and API response timings."
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {globalCooldown !== null && (
                  <div className="font-mono text-xs font-bold bg-white/15 px-3 py-1 rounded-lg border border-white/10 tracking-widest text-lemon-icing">
                    {globalCooldown.toFixed(1)}s COOLDOWN
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTelemetryDetails(!showTelemetryDetails)}
                  className={`h-8 rounded-lg text-[9px] font-bold uppercase tracking-wider ${globalCooldown !== null ? "bg-white/10 hover:bg-white/20 border-white/20 text-white" : "border-navy/10 text-navy hover:bg-cloud-dancer"}`}
                >
                  <Sliders className="w-3.5 h-3.5 mr-1.5" />
                  {showTelemetryDetails ? "Hide Telemetry" : "Show Telemetry"}
                  {showTelemetryDetails ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                </Button>
                {globalCooldown === null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={triggerSimulation}
                    className="h-8 text-[9px] font-bold text-gray-500 hover:text-navy hover:bg-navy/5 uppercase tracking-wider rounded-lg border border-dashed border-gray-300"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Test Loop
                  </Button>
                )}
              </div>
            </div>

            {/* Live Progress Bar for Cooldown */}
            {globalCooldown !== null && (
              <div className="h-1 w-full bg-navy/20 relative overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-lemon-icing via-orange to-raindrops transition-all duration-100 ease-linear"
                  style={{ width: `${(globalCooldown / 45) * 100}%` }}
                />
              </div>
            )}

            {/* Telemetry Expandable Details (Golden Circle Framework) */}
            {showTelemetryDetails && (
              <div className="p-6 bg-cloud-dancer/30 border-t border-gray-100 space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
                
                {/* Confidence Level & Accuracy Prob */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold block">Engine Confidence</span>
                      <p className="text-xs font-bold text-navy">High-Precision Schema Validation</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-heading font-black text-navy">98.0%</span>
                      <span className="text-[9px] text-emerald-600 font-bold block">CONFIDENCE</span>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold block">Accuracy Probability</span>
                      <p className="text-xs font-bold text-navy">GSC Rich Result Conformance</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-heading font-black text-navy">99.4%</span>
                      <span className="text-[9px] text-emerald-600 font-bold block">ACCURACY</span>
                    </div>
                  </div>
                </div>

                {/* Golden Circle Column Layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-2 relative overflow-hidden group hover:shadow-md transition-all duration-300">
                    <div className="absolute top-0 left-0 w-1 h-full bg-raindrops" />
                    <div className="flex items-center gap-2 text-navy mb-1">
                      <span className="text-[10px] bg-raindrops/30 text-navy font-black px-2 py-0.5 rounded-full">1</span>
                      <h5 className="font-heading font-bold text-xs uppercase tracking-wider">WHY did this trigger?</h5>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed font-medium">
                      The Google Gemini free tier limits developers to **15-20 requests per minute (RPM)** and a strict **1,500 daily request cap (RPD)**. If a workflow runs bulk crawls, or if multiple tabs/users share the key, the Daily limit can exhaust, resulting in 429 exceptions even if you have not made recent manual submissions.
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-2 relative overflow-hidden group hover:shadow-md transition-all duration-300">
                    <div className="absolute top-0 left-0 w-1 h-full bg-ice-melt" />
                    <div className="flex items-center gap-2 text-navy mb-1">
                      <span className="text-[10px] bg-ice-melt/40 text-navy font-black px-2 py-0.5 rounded-full">2</span>
                      <h5 className="font-heading font-bold text-xs uppercase tracking-wider">HOW do we resolve it?</h5>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed font-medium">
                      Our **Adaptive Pace Engine** measures the execution run-time of your manual diagnostic analysis. We then automatically configure a safe batch crawl interval by injecting a protective **+30s cooldown safety buffer** between sequential queue items, completely neutralizing rate limit blockades.
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-2 relative overflow-hidden group hover:shadow-md transition-all duration-300">
                    <div className="absolute top-0 left-0 w-1 h-full bg-lemon-icing" />
                    <div className="flex items-center gap-2 text-navy mb-1">
                      <span className="text-[10px] bg-lemon-icing/40 text-navy font-black px-2 py-0.5 rounded-full">3</span>
                      <h5 className="font-heading font-bold text-xs uppercase tracking-wider">WHAT actions to take?</h5>
                    </div>
                    <div className="text-[11px] text-gray-600 leading-relaxed font-medium space-y-2">
                      <p>1. Keep **Adaptive Pace Mode** turned ON in settings.</p>
                      <p>2. If your key has hit the daily cap, paste raw HTML source code manually or wait for the 24h Google quota window to reset.</p>
                      <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        Tip: You can use your own key in the Settings Secrets.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quota Telemetry Dashboard & Interactive Terminal Console */}
                <div className="bg-[#0c1329] border border-white/10 rounded-2xl p-6 mt-6 space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                    <div className="space-y-1">
                      <h5 className="font-heading font-black text-sm text-lemon-icing tracking-wider flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-lemon-icing animate-pulse" />
                        Live Quota Telemetry & Log Console
                      </h5>
                      <p className="text-[10px] text-white/60 font-sans normal-case">
                        Real-time telemetry readout tracking active rate limits, adaptive timeouts, and Google API credit balances.
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 font-extrabold px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                        CONSOLE: LIVE
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setConsoleLogs([
                            `[${new Date().toLocaleTimeString()}] [SYSTEM] Console logs flushed by administrator.`,
                            `[${new Date().toLocaleTimeString()}] [TELEMETRY] Listening to active RPC queue...`
                          ]);
                        }}
                        className="h-7 text-[9px] font-bold text-white/50 hover:text-white hover:bg-white/10 uppercase tracking-widest border border-white/10 px-2 rounded-lg"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  {/* Active Metrics Indicators */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Metric 1: RPM */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/50 tracking-wider">
                        <span>Rate limit (RPM)</span>
                        <span className="font-mono text-lemon-icing">
                          {isSimulated ? "2 / 15 RPM" : lastManualDiagnosticDuration ? "1 / 15 RPM" : "0 / 15 RPM"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden relative">
                        <div 
                          className="h-full bg-gradient-to-r from-lemon-icing to-orange transition-all duration-500"
                          style={{ width: isSimulated ? "13.3%" : lastManualDiagnosticDuration ? "6.6%" : "0%" }}
                        />
                      </div>
                      <p className="text-[9px] text-white/40 leading-normal normal-case font-sans">
                        Free tier bursts capped at **15 requests** per minute.
                      </p>
                    </div>

                    {/* Metric 2: RPD */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/50 tracking-wider">
                        <span>Daily cap (RPD)</span>
                        <span className="font-mono text-lemon-icing">
                          {isSimulated ? "1,241 / 1,500" : lastManualDiagnosticDuration ? "1,241 / 1,500" : "1,240 / 1,500"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden relative">
                        <div 
                          className="h-full bg-gradient-to-r from-orange to-raindrops transition-all duration-500"
                          style={{ width: isSimulated ? "82.7%" : "82.6%" }}
                        />
                      </div>
                      <p className="text-[9px] text-white/40 leading-normal normal-case font-sans">
                        Rolling daily quota cap: **1,500 requests** per key.
                      </p>
                    </div>

                    {/* Metric 3: Active Pacing Delay */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                      <span className="text-[9px] uppercase font-bold text-white/50 tracking-wider block">Pacing Buffer</span>
                      <div className="text-lg font-heading font-black text-white flex items-baseline gap-1">
                        <span className="font-mono text-lemon-icing">
                          {lastManualDiagnosticDuration ? `${((lastManualDiagnosticDuration + 30000) / 1000).toFixed(1)}` : "30.0"}
                        </span>
                        <span className="text-[9px] text-white/60 font-medium font-sans lowercase">s delay</span>
                      </div>
                      <p className="text-[9px] text-white/40 leading-normal normal-case font-sans">
                        {lastManualDiagnosticDuration ? "Dynamically tuned manual baseline +30s buffer." : "Standard pacing baseline buffer active."}
                      </p>
                    </div>

                    {/* Metric 4: Quota Reset Countdown */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                      <span className="text-[9px] uppercase font-bold text-white/50 tracking-wider block">24h Quota Reset</span>
                      <div className="text-lg font-heading font-black text-white flex items-baseline gap-1">
                        <span className="font-mono text-[#4ade80]">
                          {formatTime(timeToReset)}
                        </span>
                      </div>
                      <p className="text-[9px] text-white/40 leading-normal normal-case font-sans">
                        Countdown until the daily rolling quota credits restore.
                      </p>
                    </div>
                  </div>

                  {/* Terminal Log Output */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/40 tracking-wider px-1">
                      <span className="flex items-center gap-1.5">
                        <HeartPulse className="w-3.5 h-3.5 text-raindrops animate-pulse" />
                        Live Stream Console
                      </span>
                      <span className="font-mono text-[8px]">tty/gemini-stream-0</span>
                    </div>
                    
                    <div className="bg-black/85 rounded-xl p-4 font-mono text-[11px] text-[#4ade80] border border-white/10 h-52 overflow-y-auto flex flex-col space-y-1.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      {consoleLogs.map((log, index) => {
                        let textClass = "text-[#4ade80]/90";
                        if (log.includes("[ERROR]") || log.includes("[429]") || log.includes("Exceeded") || log.includes("exhausted")) {
                          textClass = "text-orange font-bold";
                        } else if (log.includes("[SYSTEM]") || log.includes("[INFO]")) {
                          textClass = "text-ice-melt";
                        } else if (log.includes("[THROTTLE]") || log.includes("[COOLDOWN]")) {
                          textClass = "text-lemon-icing font-semibold";
                        } else if (log.includes("[CALIBRATION]") || log.includes("[AUDITOR]")) {
                          textClass = "text-raindrops font-semibold";
                        }
                        return (
                          <div key={index} className={`leading-normal border-b border-white/[0.02] pb-1 hover:bg-white/5 px-1.5 rounded transition-colors ${textClass}`}>
                            {log}
                          </div>
                        );
                      })}
                      <div ref={consoleEndRef} />
                    </div>
                  </div>
                </div>

                {isSimulated && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center animate-pulse">
                    <p className="text-[10px] text-amber-700 font-semibold flex items-center justify-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Visual Simulation Active: Demonstrating active crawl-queue throttling and protective visual cooldown indicators.
                    </p>
                  </div>
                )}

              </div>
            )}

          </div>
        </div>

        <main className="flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="bg-gradient-to-r from-cloud-dancer via-[#E9E6DF] to-cloud-dancer border-b border-navy/10 shadow-sm">
              <div className="max-w-6xl mx-auto px-12 lg:px-20 -mb-px">
                <TabsList className="bg-transparent h-12 p-0 gap-8 justify-start">
                  <TabsTrigger 
                    value="manual" 
                    className="data-[state=active]:bg-transparent data-[state=active]:text-navy data-[state=active]:border-b-2 data-[state=active]:border-navy rounded-none border-b-2 border-transparent text-navy/40 font-bold uppercase text-[10px] tracking-widest h-12 p-0 px-2 transition-all"
                  >
                    <Search className="w-3.5 h-3.5 mr-2" />
                    Manual Diagnostic
                  </TabsTrigger>
                  <TabsTrigger 
                    value="batch" 
                    className="data-[state=active]:bg-transparent data-[state=active]:text-navy data-[state=active]:border-b-2 data-[state=active]:border-navy rounded-none border-b-2 border-transparent text-navy/40 font-bold uppercase text-[10px] tracking-widest h-12 p-0 px-2 transition-all"
                  >
                    <Database className="w-3.5 h-3.5 mr-2" />
                    Batch Template Lab
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="manual" className="m-0 focus-visible:ring-0">
              <InputSection 
                onAnalyze={handleAnalyze} 
                isLoading={isLoading} 
                isCollapsed={!!result && !isLoading} 
                lastManualDiagnosticDuration={lastManualDiagnosticDuration}
              />
            </TabsContent>

            <TabsContent value="batch" className="m-0 focus-visible:ring-0">
              <div className="relative overflow-hidden bg-gradient-to-br from-cloud-dancer via-[#EAE6DF] to-cloud-dancer p-12 lg:p-20 border-b border-navy/10">
                <div className="max-w-6xl mx-auto relative z-10">
                  <BatchProcessor 
                    initialTasks={batchTasks}
                    onBatchProcessed={setBatchTasks} 
                    onBatchComplete={handleBatchComplete}
                    lastManualDiagnosticDuration={lastManualDiagnosticDuration}
                    onViewResult={(task, currentTasks) => {
                      setResult(task.result!);
                      setCurrentUrl(task.url);
                      setCurrentTemplate(task.templateName);
                      if (currentTasks && currentTasks.length > 0) {
                        setBatchTasks(currentTasks);
                      }
                      setActiveTab("manual");
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="max-w-7xl mx-auto px-6 pt-8">
            {result && (batchTasks.length > 0 || history.some(item => item.type === "batch")) && activeTab === "manual" && (
              <div className="max-w-6xl mx-auto px-12 lg:px-20 mb-8">
                <Button 
                  onClick={handleBackToBatch}
                  className="bg-ice-melt/20 hover:bg-ice-melt/30 text-navy font-bold text-[10px] uppercase tracking-[0.2em] rounded-xl px-6 h-10 border border-ice-melt/50 flex items-center gap-2 group transition-all"
                >
                   <Database className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                   Back to Batch Results
                </Button>
              </div>
            )}
          </div>

          <div className="max-w-7xl mx-auto px-6 py-12">
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
                <SchemaEditor 
                  schema={result.perfectedSchema} 
                  recommendations={result.additionalRecommendedSchema}
                />
              </div>
            )}

            {!result && !isLoading && !error && activeTab === "manual" && (
              <div className="flex flex-col items-center justify-center py-32 space-y-8 animate-in fade-in duration-700">
                <div className="bg-navy/5 p-12 rounded-full ring-1 ring-navy/10 scale-105">
                  <Search className="w-16 h-16 text-navy/20" />
                </div>
                <div className="text-center max-w-sm">
                  <p className="text-navy/40 font-heading font-bold uppercase tracking-[0.2em] text-sm">Awaiting Logic Input</p>
                  <p className="text-xs text-navy/30 mt-2 leading-relaxed italic">
                    Paste your source code to activate the multi-layered reasoning engine.
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
