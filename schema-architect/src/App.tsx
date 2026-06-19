import { useState, useEffect } from "react";
import Header from "./components/Header";
import InputSection from "./components/InputSection";
import BatchProcessor, { AuditTask } from "./components/BatchProcessor";
import Dashboard from "./components/Dashboard";
import SchemaEditor from "./components/SchemaEditor";
import { auditSchema, AuditResult } from "./services/gemini";
import axios from "axios";
import { Loader2, AlertTriangle, History, X, Search, Database } from "lucide-react";
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

  useEffect(() => {
    const savedHistory = localStorage.getItem("audit_history");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (item: HistoryItem) => {
    const newHistory = [item, ...history].slice(0, 20); // Keep last 20
    setHistory(newHistory);
    localStorage.setItem("audit_history", JSON.stringify(newHistory));
  };

  const handleAnalyze = async (data: { type: "html"; value: string; typeOverride?: string; gscIssues?: string }) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      let htmlToAudit = data.value;
      let targetUrl = undefined;

      // URL Detection: If the input looks like a URL, use our extraction proxy first
      const urlRegex = /^(https?:\/\/[^\s]+)$/;
      const isUrl = urlRegex.test(data.value.trim());

      if (isUrl) {
        const extractionResponse = await axios.post("/api/extract", { url: data.value.trim() });
        htmlToAudit = extractionResponse.data.fullContent;
        targetUrl = data.value.trim();
        setCurrentUrl(targetUrl);
      } else {
        setCurrentUrl("Pasted HTML Snip");
      }
      
      setCurrentTemplate(data.typeOverride || "WebPage");

      const auditResult = await auditSchema(htmlToAudit, targetUrl, data.typeOverride, data.gscIssues);
      setResult(auditResult);
      
      saveToHistory({
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        type: "single",
        displayName: isUrl ? targetUrl : data.value.slice(0, 50) + "...",
        value: data.value,
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
              errMsg = "Access Denied (Status 403). This site is protected by anti-bot measures. Architect's Tip: Use the 'Manual Diagnostic' tab and paste the HTML source directly.";
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
              />
            </TabsContent>

            <TabsContent value="batch" className="m-0 focus-visible:ring-0">
              <div className="relative overflow-hidden bg-gradient-to-br from-cloud-dancer via-[#EAE6DF] to-cloud-dancer p-12 lg:p-20 border-b border-navy/10">
                <div className="max-w-6xl mx-auto relative z-10">
                  <BatchProcessor 
                    initialTasks={batchTasks}
                    onBatchProcessed={setBatchTasks} 
                    onBatchComplete={handleBatchComplete}
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
