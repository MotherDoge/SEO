import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { 
  FileUp, 
  Table, 
  AlertCircle, 
  ArrowRight, 
  ExternalLink,
  Layers,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
  Link2,
  Plus,
  Trash2,
  Copy
} from "lucide-react";
import { copyTaskToClipboard } from "../utils/reportGenerator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { auditSchema, AuditResult } from "../services/gemini";
import axios from "axios";

interface BatchProcessorProps {
  initialTasks?: AuditTask[];
  onBatchProcessed: (tasks: AuditTask[]) => void;
  onBatchComplete: (tasks: AuditTask[]) => void;
  onViewResult: (task: AuditTask, currentTasks: AuditTask[]) => void;
}

export interface AuditTask {
  templateName: string;
  url: string;
  recommendedSchema: string;
  status: "pending" | "extracting" | "auditing" | "completed" | "error";
  id: string;
  result?: AuditResult;
  error?: string;
}

export default function BatchProcessor({ initialTasks = [], onBatchProcessed, onBatchComplete, onViewResult }: BatchProcessorProps) {
  const [tasks, setTasks] = useState<AuditTask[]>(initialTasks);
  const [isParsing, setIsParsing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [currentTaskIndex, setCurrentTaskIndex] = useState<number | null>(null);
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyTask = async (task: AuditTask) => {
    const success = await copyTaskToClipboard(task);
    if (success) {
      setCopiedTaskId(task.id);
      setTimeout(() => setCopiedTaskId(null), 2000);
    }
  };

  useEffect(() => {
    if (!isRunning && initialTasks && initialTasks.length > 0) {
      setTasks(initialTasks);
    }
  }, [initialTasks, isRunning]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const flattenedTasks: AuditTask[] = [];
        
        results.data.forEach((row: any) => {
          const templateName = row["Template Name"] || "Unknown";
          const recommendedSchema = row["Recommended Schema"] || "WebPage";
          const sampleUrlsStr = row["Sample URLs"] || "";
          
          const urls = sampleUrlsStr.split(";").map((u: string) => u.trim()).filter(Boolean);
          
          urls.forEach((url: string) => {
            flattenedTasks.push({
              id: Math.random().toString(36).substring(7),
              templateName,
              url,
              recommendedSchema,
              status: "pending"
            });
          });
        });

        setTasks(flattenedTasks);
        onBatchProcessed(flattenedTasks);
        setIsParsing(false);
      },
      error: (error) => {
        console.error("CSV Parsing Error:", error);
        setIsParsing(false);
      }
    });
  };

  const handleUrlImport = () => {
    if (!urlInput.trim()) return;

    const urls = urlInput
      .split(/[\n,;]/)
      .map(u => u.trim())
      .filter(u => u.startsWith("http"));

    const newTasks: AuditTask[] = urls.map(url => ({
      id: Math.random().toString(36).substring(7),
      templateName: "Quick List",
      url,
      recommendedSchema: "WebPage",
      status: "pending"
    }));

    if (newTasks.length > 0) {
      const mergedTasks = [...tasks, ...newTasks];
      setTasks(mergedTasks);
      onBatchProcessed(mergedTasks);
      setUrlInput("");
      setShowUrlInput(false);
    }
  };

  const clearTasks = () => {
    setTasks([]);
    onBatchProcessed([]);
  };

  const runBatchJob = async () => {
    if (tasks.length === 0 || isRunning) return;

    setIsRunning(true);
    const updatedTasks = [...tasks];

    for (let i = 0; i < updatedTasks.length; i++) {
      setCurrentTaskIndex(i);
      const task = updatedTasks[i];
      if (task.status === "completed") continue; // Skip already done ones

      try {
        // Step 1: Extractions
        updatedTasks[i] = { ...task, status: "extracting" };
        const step1Tasks = [...updatedTasks];
        setTasks(step1Tasks);
        onBatchProcessed(step1Tasks);

        const extractionResponse = await axios.post("/api/extract", { url: task.url });
        const { fullContent } = extractionResponse.data;

        // Step 2: Audit
        updatedTasks[i] = { ...updatedTasks[i], status: "auditing" };
        const step2Tasks = [...updatedTasks];
        setTasks(step2Tasks);
        onBatchProcessed(step2Tasks);

        const auditResult = await auditSchema(fullContent, task.url, task.recommendedSchema);

        // Step 3: Success
        updatedTasks[i] = { 
          ...updatedTasks[i], 
          status: "completed", 
          result: auditResult 
        };
        const step3Tasks = [...updatedTasks];
        setTasks(step3Tasks);
        onBatchProcessed(step3Tasks);

      } catch (error: any) {
        console.error(`Task failed: ${task.url}`, error);
        
        let errorMessage = error.message || "An unexpected error occurred.";
        if (error.response?.data) {
          if (typeof error.response.data === "object") {
            errorMessage = error.response.data.details || error.response.data.error || errorMessage;
          } else if (typeof error.response.data === "string") {
            try {
              const parsed = JSON.parse(error.response.data);
              errorMessage = parsed.details || parsed.error || errorMessage;
            } catch {
              if (error.response.data.includes("Access Denied") || error.response.status === 403) {
                errorMessage = "Access Denied (Status 403). This site is protected by anti-bot measures. Architect's Tip: Use the 'Manual Diagnostic' tab and paste the HTML source directly.";
              }
            }
          }
        }

        updatedTasks[i] = { 
          ...updatedTasks[i], 
          status: "error", 
          error: errorMessage
        };
        const errorTasks = [...updatedTasks];
        setTasks(errorTasks);
        onBatchProcessed(errorTasks);
      }
      
      // Artificial delay to provide better UX
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    setIsRunning(false);
    setCurrentTaskIndex(null);
    onBatchComplete(updatedTasks);
  };

  const getStatusIcon = (status: AuditTask["status"]) => {
    switch (status) {
      case "pending": return <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />;
      case "extracting": return <Loader2 className="w-3 h-3 text-navy animate-spin" />;
      case "auditing": return <Loader2 className="w-3 h-3 text-ice-melt animate-spin" />;
      case "completed": return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
      case "error": return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      default: return null;
    }
  };

  const getStatusText = (status: AuditTask["status"]) => {
    switch (status) {
      case "pending": return "Waiting";
      case "extracting": return "Crawling";
      case "auditing": return "Architecting";
      case "completed": return "Done";
      case "error": return "Failed";
      default: return "";
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-ice-melt/5">
        <div className="flex items-center gap-3">
          <div className="bg-navy p-2 rounded-lg">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-bold text-navy uppercase tracking-tight">Batch Template Lab</h3>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Autonomous Extraction Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <Button 
            variant="outline"
            className="border-navy text-navy hover:bg-navy hover:text-white transition-all rounded-xl h-12 px-6"
            onClick={() => setShowUrlInput(!showUrlInput)}
            disabled={isParsing || isRunning}
          >
            <Link2 className="w-4 h-4 mr-2" />
            Quick Add URLs
          </Button>

          <Button 
            variant="outline"
            className="border-navy text-navy hover:bg-navy hover:text-white transition-all rounded-xl h-12 px-6"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing || isRunning}
          >
            <FileUp className="w-4 h-4 mr-2" />
            {isParsing ? "Parsing CSV..." : tasks.length > 0 ? "Change Data" : "Import Template CSV"}
          </Button>

          {tasks.length > 0 && (
            <Button 
              className="bg-navy hover:bg-navy/90 text-white transition-all rounded-xl h-12 px-8 shadow-xl shadow-navy/20"
              onClick={runBatchJob}
              disabled={isRunning}
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Execute Architect Flow
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      {showUrlInput && (
        <div className="p-8 bg-gray-50 border-b border-gray-100 animate-in slide-in-from-top duration-300">
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-navy uppercase tracking-wider">Bulk URL Entry</h4>
                <p className="text-[10px] text-gray-500 font-medium">Paste one URL per line or separate with commas/semicolons.</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowUrlInput(false)}
                className="text-gray-400 hover:text-navy"
              >
                Cancel
              </Button>
            </div>
            <Textarea 
              placeholder="https://example.com/page-1&#10;https://example.com/page-2" 
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="min-h-[120px] font-mono text-xs rounded-xl border-gray-200 bg-white focus:ring-4 focus:ring-ice-melt/10 transition-all resize-none shadow-inner"
            />
            <div className="flex justify-end">
              <Button 
                onClick={handleUrlImport}
                className="bg-navy hover:bg-navy/90 text-white rounded-xl h-10 px-6 font-bold text-xs uppercase tracking-widest shadow-lg shadow-navy/10"
              >
                <Plus className="w-3.5 h-3.5 mr-2" />
                Add to Batch
              </Button>
            </div>
          </div>
        </div>
      )}

      {tasks.length > 0 ? (
        <div className="p-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="bg-navy text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                {tasks.length} Diagnostic Tasks
              </span>
              {isRunning && (
                <span className="text-[10px] font-bold text-navy animate-pulse uppercase tracking-widest">
                  Processing Task {currentTaskIndex !== null ? currentTaskIndex + 1 : 0} of {tasks.length}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-navy/40">
              <Button 
                variant="ghost" 
                onClick={clearTasks}
                className="text-[10px] uppercase font-bold tracking-widest hover:text-red-500 flex items-center gap-2 font-semibold"
                disabled={isRunning}
              >
                <Trash2 className="w-3 h-3" />
                Clear All
              </Button>
              <div className="h-4 w-px bg-gray-200 mx-2" />
              <span className="text-[10px] uppercase font-bold tracking-widest">Crawler Active: Server-Side Extractor</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-4 px-2 pl-4 text-[10px] uppercase font-bold text-gray-400 tracking-widest w-[160px]">Template</th>
                  <th className="py-4 px-2 text-[10px] uppercase font-bold text-gray-400 tracking-widest text-center w-[80px]">Health</th>
                  <th className="py-4 px-2 text-[10px] uppercase font-bold text-gray-400 tracking-widest w-[120px]">Status</th>
                  <th className="py-4 px-2 text-[10px] uppercase font-bold text-gray-400 tracking-widest">Target URL</th>
                  <th className="py-4 px-4 text-[10px] uppercase font-bold text-gray-400 tracking-widest text-right w-[150px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tasks.map((task, idx) => (
                  <tr key={task.id} className={`group hover:bg-ice-melt/5 transition-colors ${currentTaskIndex === idx ? "bg-ice-melt/10 ring-1 ring-ice-melt/20" : ""}`}>
                    <td className="py-5 px-2 pl-4">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-navy truncate block max-w-[150px]">{task.templateName}</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-ice-melt/30 text-navy text-[9px] font-bold px-1.5 py-0.5 rounded-[4px] border border-ice-melt/50">
                            {task.recommendedSchema}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-5 px-2">
                      <div className="flex flex-col items-center justify-center gap-1">
                        {task.result ? (
                          <>
                            <div className="h-1 w-12 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-1000 ${task.result.healthScore > 80 ? "bg-green-500" : task.result.healthScore > 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${task.result.healthScore}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-navy">{task.result.healthScore}%</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-300">--</span>
                        )}
                      </div>
                    </td>
                    <td className="py-5 px-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        <span className={`text-[10px] uppercase font-bold tracking-tighter ${task.status === "error" ? "text-red-500" : "text-gray-400"}`}>
                          {getStatusText(task.status)}
                        </span>
                      </div>
                    </td>
                    <td className="py-5 px-2">
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 overflow-hidden">
                        <span className="truncate max-w-[250px] font-mono opacity-60 group-hover:opacity-100 transition-opacity">{task.url}</span>
                        <a href={task.url} target="_blank" rel="noreferrer" className="text-navy opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                    <td className="py-5 px-4 text-right min-w-[120px]">
                      <div className="flex justify-end items-center gap-2">
                        {task.result && (
                          <>
                            <Button 
                              variant="default" 
                              size="sm" 
                              onClick={() => onViewResult(task, tasks)}
                              className="h-8 bg-ice-melt/20 hover:bg-navy text-navy hover:text-white transition-all gap-2 px-4 rounded-xl border border-ice-melt/50 shadow-sm"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span className="text-[10px] uppercase font-bold tracking-wider">Inspect</span>
                            </Button>
                            
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleCopyTask(task)}
                              title="Copy Individual Report"
                              className={`h-8 w-8 hover:bg-slate-50 transition-all rounded-xl border border-slate-200 flex items-center justify-center shrink-0 ${copiedTaskId === task.id ? "bg-emerald-50 border-emerald-300 text-emerald-600 hover:bg-emerald-50" : "text-slate-500 hover:text-navy"}`}
                            >
                              {copiedTaskId === task.id ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </>
                        )}
                        {task.status === "error" && (
                          <Tooltip>
                            <TooltipTrigger className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors">
                              <AlertCircle className="w-4 h-4" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-red-600 text-white border-none p-3 shadow-xl">
                              <p className="text-xs font-medium max-w-[200px] leading-relaxed">{task.error}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-20 text-center flex flex-col items-center justify-center space-y-6">
          <div className="bg-gray-50 p-6 rounded-full">
            <Table className="w-12 h-12 text-gray-300" />
          </div>
          <div className="max-w-sm space-y-2">
            <h4 className="text-navy font-bold uppercase tracking-widest text-sm">No Template Data Loaded</h4>
            <p className="text-xs text-gray-400 leading-relaxed italic">
              Import your Template CSV to begin batch entity mapping. We'll flatten your sibling URLs and prepare them for architectural auditing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
