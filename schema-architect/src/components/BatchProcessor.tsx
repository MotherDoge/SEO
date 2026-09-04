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
  Copy,
  Pause,
  Square,
  Sliders,
  ShieldAlert,
  Zap,
  Activity,
  Settings2
} from "lucide-react";
import { copyTaskToClipboard } from "../utils/reportGenerator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  originalUrl?: string; // Preserve original input relative path
  recommendedSchema: string;
  status: "pending" | "extracting" | "auditing" | "completed" | "error";
  id: string;
  result?: AuditResult;
  error?: string;
}

export default function BatchProcessor({ 
  initialTasks = [], 
  onBatchProcessed, 
  onBatchComplete, 
  onViewResult
}: BatchProcessorProps) {
  const [tasks, setTasks] = useState<AuditTask[]>(initialTasks);
  const [isParsing, setIsParsing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [currentTaskIndex, setCurrentTaskIndex] = useState<number | null>(null);
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [throttleDelay, setThrottleDelay] = useState(6000); // stay safely under 15 RPM (6 seconds)
  const [countdown, setCountdown] = useState<number | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const [optimizationMode, setOptimizationMode] = useState<"speed" | "accuracy">("speed");
  const [concurrency, setConcurrency] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDelay = throttleDelay;

  const isRunningRef = useRef(isRunning);
  const isPausedRef = useRef(isPaused);
  const isAbortedRef = useRef(false);
  const throttleDelayRef = useRef(activeDelay);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    throttleDelayRef.current = activeDelay;
  }, [activeDelay]);

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

  const resolveUrl = (url: string, base: string) => {
    const trimmed = url.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (base) {
      let cleanBase = base.trim();
      if (cleanBase.endsWith("/")) {
        cleanBase = cleanBase.slice(0, -1);
      }
      let cleanPath = trimmed;
      if (!cleanPath.startsWith("/")) {
        cleanPath = "/" + cleanPath;
      }
      return cleanBase + cleanPath;
    }
    return trimmed;
  };

  const applyBaseUrl = (newBaseUrl: string) => {
    setBaseUrl(newBaseUrl);
    const updated = tasks.map(task => {
      const original = task.originalUrl || task.url;
      return {
        ...task,
        originalUrl: original,
        url: resolveUrl(original, newBaseUrl)
      };
    });
    setTasks(updated);
    onBatchProcessed(updated);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const flattenedTasks: AuditTask[] = [];
        let detectedBaseUrl = "";
        
        results.data.forEach((row: any) => {
          const templateName = row["Template Name"] || "Unknown";
          const recommendedSchema = row["Recommended Schema"] || "WebPage";
          const sampleUrlsStr = row["Sample URLs"] || "";
          
          const urls = sampleUrlsStr.split(";").map((u: string) => u.trim()).filter(Boolean);
          
          urls.forEach((url: string) => {
            if (!detectedBaseUrl && (url.startsWith("http://") || url.startsWith("https://"))) {
              try {
                const parsed = new URL(url);
                detectedBaseUrl = parsed.origin;
              } catch {
                // ignore
              }
            }

            flattenedTasks.push({
              id: Math.random().toString(36).substring(7),
              templateName,
              url,
              originalUrl: url,
              recommendedSchema,
              status: "pending"
            });
          });
        });

        const finalBaseUrl = detectedBaseUrl || baseUrl;
        if (detectedBaseUrl && !baseUrl) {
          setBaseUrl(detectedBaseUrl);
        }

        const resolved = flattenedTasks.map(t => ({
          ...t,
          url: resolveUrl(t.url, finalBaseUrl)
        }));

        setTasks(resolved);
        onBatchProcessed(resolved);
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
      .filter(Boolean);

    const newTasks: AuditTask[] = urls.map(url => {
      const resolved = resolveUrl(url, baseUrl);
      return {
        id: Math.random().toString(36).substring(7),
        templateName: "Quick List",
        url: resolved,
        originalUrl: url,
        recommendedSchema: "WebPage",
        status: "pending"
      };
    });

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

  const pauseBatchJob = () => {
    setIsPaused(true);
    isPausedRef.current = true;
  };

  const resumeBatchJob = () => {
    setIsPaused(false);
    isPausedRef.current = false;
  };

  const stopBatchJob = () => {
    isAbortedRef.current = true;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentTaskIndex(null);
    setCountdown(null);
  };

  const runBatchJob = async () => {
    if (tasks.length === 0) return;

    if (isRunning && isPaused) {
      resumeBatchJob();
      return;
    }

    if (isRunning) return;

    setIsRunning(true);
    setIsPaused(false);
    isAbortedRef.current = false;
    isPausedRef.current = false;
    
    const updatedTasks = [...tasks];
    let nextTaskPointer = 0;
    const workerCount = Math.max(1, Math.min(concurrency, 5));

    const processTaskAtIndex = async (i: number) => {
      if (isAbortedRef.current) return;

      while (isPausedRef.current) {
        if (isAbortedRef.current) return;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      if (isAbortedRef.current) return;

      const task = updatedTasks[i];
      if (task.status === "completed") return; // Skip already done ones

      setCurrentTaskIndex(i);

      let success = false;
      let retriesLeft = 3;
      let lastErrorMessage = "";

      while (!success && retriesLeft > 0 && !isAbortedRef.current) {
        while (isPausedRef.current) {
          if (isAbortedRef.current) return;
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        if (isAbortedRef.current) return;

        try {
          // Step 1: Extractions
          updatedTasks[i] = { ...updatedTasks[i], status: "extracting", error: undefined };
          setTasks([...updatedTasks]);
          onBatchProcessed([...updatedTasks]);

          const extractionResponse = await axios.post("/api/extract", { url: task.url });
          const { fullContent } = extractionResponse.data;

          if (isAbortedRef.current) return;

          // Step 2: Audit
          updatedTasks[i] = { ...updatedTasks[i], status: "auditing", error: undefined };
          setTasks([...updatedTasks]);
          onBatchProcessed([...updatedTasks]);

          const auditResult = await auditSchema(
            fullContent, 
            task.url, 
            task.recommendedSchema,
            undefined, // gscIssues
            undefined, // contextContent
            undefined, // codeContent
            selectedModel,
            optimizationMode
          );

          if (isAbortedRef.current) return;

          // Step 3: Success
          updatedTasks[i] = { 
            ...updatedTasks[i], 
            status: "completed", 
            result: auditResult,
            error: undefined
          };
          setTasks([...updatedTasks]);
          onBatchProcessed([...updatedTasks]);
          success = true;

        } catch (error: any) {
          if (isAbortedRef.current) return;
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
                  errorMessage = "Access Denied (Status 403). Protected by anti-bot measures. Architect's Tip: Use Manual Diagnostic tab and paste document.documentElement.outerHTML.";
                }
              }
            }
          }
          
          lastErrorMessage = errorMessage;

          const isRateLimit = 
            errorMessage.toLowerCase().includes("quota") || 
            errorMessage.toLowerCase().includes("limit") || 
            errorMessage.toLowerCase().includes("resource_exhausted") || 
            errorMessage.toLowerCase().includes("429") ||
            errorMessage.toLowerCase().includes("503") ||
            errorMessage.toLowerCase().includes("unavailable") ||
            errorMessage.toLowerCase().includes("high demand") ||
            errorMessage.toLowerCase().includes("temporary") ||
            (error.response && (error.response.status === 429 || error.response.status === 503));

          if (isRateLimit && retriesLeft > 1) {
            retriesLeft--;
            const match = errorMessage.match(/retry in\s+([0-9.]+)\s*s/i) || errorMessage.match(/retry in\s+(\d+)\s*s/i);
            const retrySecs = match ? Math.ceil(parseFloat(match[1])) : 25;
            
            const attemptNum = 3 - retriesLeft;
            updatedTasks[i] = { 
              ...updatedTasks[i], 
              status: "auditing", 
              error: `Rate limited. Auto-retrying in ${retrySecs}s... (Attempt ${attemptNum}/3)`
            };
            setTasks([...updatedTasks]);
            onBatchProcessed([...updatedTasks]);

            for (let sec = retrySecs; sec > 0; sec--) {
              if (isAbortedRef.current) return;
              while (isPausedRef.current) {
                if (isAbortedRef.current) return;
                await new Promise(resolve => setTimeout(resolve, 200));
              }
              if (isAbortedRef.current) return;
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } else {
            retriesLeft = 0;
          }
        }
      }

      if (isAbortedRef.current) return;

      if (!success) {
        updatedTasks[i] = { 
          ...updatedTasks[i], 
          status: "error", 
          error: lastErrorMessage
        };
        setTasks([...updatedTasks]);
        onBatchProcessed([...updatedTasks]);

        const isRateLimit = 
          lastErrorMessage.toLowerCase().includes("quota") || 
          lastErrorMessage.toLowerCase().includes("limit") || 
          lastErrorMessage.toLowerCase().includes("resource_exhausted") || 
          lastErrorMessage.toLowerCase().includes("429") ||
          lastErrorMessage.toLowerCase().includes("503") ||
          lastErrorMessage.toLowerCase().includes("unavailable") ||
          lastErrorMessage.toLowerCase().includes("high demand") ||
          lastErrorMessage.toLowerCase().includes("temporary");
        
        if (isRateLimit) {
          pauseBatchJob();
        }
      }

      // Worker delay before grabbing next item (staggered proportionally by worker count)
      if (!isAbortedRef.current && success) {
        const staggerDelay = Math.max(800, Math.floor(throttleDelayRef.current / workerCount));
        await new Promise(resolve => setTimeout(resolve, staggerDelay));
      }
    };

    const workerLoop = async () => {
      while (nextTaskPointer < updatedTasks.length && !isAbortedRef.current) {
        const idxToProcess = nextTaskPointer++;
        if (idxToProcess >= updatedTasks.length) break;
        await processTaskAtIndex(idxToProcess);
      }
    };

    const workerPool = [];
    for (let w = 0; w < workerCount; w++) {
      workerPool.push(workerLoop());
    }

    await Promise.all(workerPool);

    setIsRunning(false);
    setIsPaused(false);
    setCurrentTaskIndex(null);
    setCountdown(null);
    onBatchComplete([...updatedTasks]);
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

  // Compute stats for progress dashboard
  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter(t => t.status === "completed").length;
  const errorTasksCount = tasks.filter(t => t.status === "error").length;
  const pendingTasksCount = tasks.filter(t => t.status === "pending").length;
  const progressPercent = totalTasksCount > 0 
    ? Math.round(((completedTasksCount + errorTasksCount) / totalTasksCount) * 100) 
    : 0;
  const estimatedSecondsRemaining = Math.round(pendingTasksCount * (activeDelay / 1000));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between bg-ice-melt/5 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-navy p-2 rounded-lg">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-bold text-navy uppercase tracking-tight">Batch Template Lab</h3>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Autonomous Extraction Engine</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          
          <Button
            variant="outline"
            className={`border-navy text-navy hover:bg-navy hover:text-white transition-all rounded-xl h-12 px-4 ${showSettings ? "bg-navy text-white hover:bg-navy/90 hover:text-white" : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            disabled={isParsing}
            title="Throttle Settings & Domain Mapping"
          >
            <Sliders className="w-4 h-4" />
          </Button>

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
            <div className="flex items-center gap-2">
              {!isRunning ? (
                <Button 
                  className="bg-navy hover:bg-navy/90 text-white transition-all rounded-xl h-12 px-8 shadow-xl shadow-navy/20"
                  onClick={runBatchJob}
                  disabled={isParsing}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Execute Architect Flow
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  {isPaused ? (
                    <Button 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white transition-all rounded-xl h-12 px-6 shadow-xl shadow-emerald-600/20 font-bold text-xs"
                      onClick={resumeBatchJob}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Resume
                    </Button>
                  ) : (
                    <Button 
                      className="bg-yellow-500 hover:bg-yellow-600 text-navy transition-all rounded-xl h-12 px-6 shadow-xl shadow-yellow-500/10 font-bold text-xs"
                      onClick={pauseBatchJob}
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </Button>
                  )}
                  <Button 
                    className="bg-red-600 hover:bg-red-700 text-white transition-all rounded-xl h-12 px-6 shadow-xl shadow-red-600/20 font-bold text-xs"
                    onClick={stopBatchJob}
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <div className="px-8 py-6 bg-cloud-dancer/30 border-b border-gray-100 flex flex-col md:flex-row gap-8 items-start justify-between animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="w-full md:w-1/2 space-y-4">
            {/* Throttle Control Panel */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-heading font-bold text-navy tracking-wider block uppercase">
                  API Throttling Spacing: <span className="text-orange">{throttleDelay / 1000}s Delay</span>
                </label>
                <span className="text-[10px] bg-navy/10 text-navy font-bold px-2 py-0.5 rounded-full">
                  {(60 / (throttleDelay / 1000)).toFixed(1)} RPM Max
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="1000" 
                  max="15000" 
                  step="500"
                  value={throttleDelay} 
                  onChange={(e) => setThrottleDelay(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-navy"
                />
                <span className="text-xs font-mono font-bold text-navy shrink-0 w-12 text-right">{(throttleDelay / 1000).toFixed(1)}s</span>
              </div>
              <p className="text-[10px] text-gray-500 font-medium">
                {throttleDelay >= 5000 ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    ✓ Spacing is set to stay safely under the 15 RPM free-tier limit.
                  </span>
                ) : (
                  <span className="text-amber-600 font-semibold flex items-center gap-1">
                    ⚠️ Faster pacing might trigger API 429 Quota limits under heavy load.
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="w-full md:w-1/2 space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-heading font-bold text-navy tracking-wider block uppercase">
                Base Site URL (Resolves Relative CSV Links)
              </label>
              <input 
                type="text" 
                placeholder="e.g., https://www.howdens.com" 
                value={baseUrl}
                onChange={(e) => applyBaseUrl(e.target.value)}
                disabled={isRunning}
                className="w-full bg-white border border-gray-200 text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy/20 font-mono"
              />
              <p className="text-[10px] text-gray-500 font-medium">
                Converts internal relative paths (e.g., `/find-a-depot/aberdare` into absolute targets resolved from your site domain).
              </p>
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-4">
              <div className="flex items-center gap-2 text-navy">
                <Settings2 className="w-4 h-4 text-navy" />
                <h4 className="text-xs font-heading font-bold uppercase tracking-wider">Performance Tuning</h4>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">
                  Intelligence Engine (Model)
                </label>
                <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isRunning}>
                  <SelectTrigger className="w-full h-10 bg-white border border-gray-200 text-navy font-bold text-xs rounded-xl focus:ring-2 focus:ring-navy/20">
                    <SelectValue placeholder="Select Model" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-gray-100 shadow-2xl bg-white text-navy">
                    <SelectItem value="gemini-3.8-flash" className="text-xs font-medium focus:bg-cloud-dancer focus:text-navy">
                      Gemini 3.8 Flash (Default - High Performance)
                    </SelectItem>
                    <SelectItem value="gemini-3.1-flash-lite" className="text-xs font-medium focus:bg-cloud-dancer focus:text-navy">
                      Gemini 3.1 Flash Lite (Ultra-Low Latency)
                    </SelectItem>
                    <SelectItem value="gemini-3.7-flash" className="text-xs font-medium focus:bg-cloud-dancer focus:text-navy">
                      Gemini 3.7 Flash
                    </SelectItem>
                    <SelectItem value="gemini-3.5-flash" className="text-xs font-medium focus:bg-cloud-dancer focus:text-navy">
                      Gemini 3.5 Flash
                    </SelectItem>
                    <SelectItem value="gemini-3.1-pro-preview" className="text-xs font-medium focus:bg-cloud-dancer focus:text-navy">
                      Gemini 3.1 Pro (Deepest Reasoning)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Gemini 3.8 Flash provides fast latency and robust schema extraction. Pro offers full reasoning depth.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">
                  Audit Detail Level
                </label>
                <div className="grid grid-cols-2 gap-2 bg-cloud-dancer/40 p-1 rounded-xl border border-gray-100">
                  <button
                    type="button"
                    onClick={() => setOptimizationMode("speed")}
                    disabled={isRunning}
                    className={`py-2 text-[10px] uppercase tracking-widest font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      optimizationMode === "speed"
                        ? "bg-[#FDE9AC] text-navy shadow-sm font-bold"
                        : "text-navy/60 hover:text-navy hover:bg-white/50"
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    Fast Audit
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptimizationMode("accuracy")}
                    disabled={isRunning}
                    className={`py-2 text-[10px] uppercase tracking-widest font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      optimizationMode === "accuracy"
                        ? "bg-[#C1D9F0] text-navy shadow-sm font-bold"
                        : "text-navy/60 hover:text-navy hover:bg-white/50"
                    }`}
                  >
                    <Activity className="w-3 h-3" />
                    Deep Audit
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  {optimizationMode === "speed" 
                    ? "⚡ Fast Audit: Streamlines extraction logs (saves up to 60% execution latency per page)." 
                    : "🔍 Deep Audit: Exposes full pre-flight verification & exhaustive schema blueprint details."}
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">
                    Parallel Worker Concurrency
                  </label>
                  <span className="text-[10px] font-mono font-bold bg-navy/10 text-navy px-2 py-0.5 rounded-full">
                    {concurrency} Workers
                  </span>
                </div>
                <Select 
                  value={concurrency.toString()} 
                  onValueChange={(val) => setConcurrency(Number(val))} 
                  disabled={isRunning}
                >
                  <SelectTrigger className="w-full h-10 bg-white border border-gray-200 text-navy font-bold text-xs rounded-xl focus:ring-2 focus:ring-navy/20">
                    <SelectValue placeholder="Select Concurrency" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-gray-100 shadow-2xl bg-white text-navy">
                    <SelectItem value="1" className="text-xs font-medium focus:bg-cloud-dancer">
                      1 Worker (Sequential - Safe Default Rate Limits)
                    </SelectItem>
                    <SelectItem value="2" className="text-xs font-medium focus:bg-cloud-dancer">
                      2 Parallel Workers (2x Throughput)
                    </SelectItem>
                    <SelectItem value="3" className="text-xs font-medium focus:bg-cloud-dancer">
                      3 Parallel Workers (3x Parallel Execution)
                    </SelectItem>
                    <SelectItem value="5" className="text-xs font-medium focus:bg-cloud-dancer">
                      5 Parallel Workers (5x Enterprise Concurrency)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Spawns concurrent asynchronous worker loops in the Node/V8 event loop to audit multiple templates simultaneously.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {isRunning && (
        <div className="mx-8 mt-6 p-6 bg-navy text-white rounded-2xl shadow-xl shadow-navy/10 animate-in zoom-in duration-200 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPaused ? "bg-yellow-400" : "bg-emerald-400"}`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPaused ? "bg-yellow-400" : "bg-emerald-500"}`}></span>
                </span>
                <h4 className="text-xs uppercase font-heading tracking-widest font-bold">
                  {isPaused ? "Queue Paused (Throttled)" : "Sequential Throttled Queue Active"}
                </h4>
              </div>
              <p className="text-xs text-white/70">
                {isPaused 
                  ? "Execution halted. Click Resume to continue crawling the backlog."
                  : `Automated schema auditor running with ${(activeDelay / 1000).toFixed(1)}s rate-limiting intervals to avoid API 429 quota exhaustion.`}
              </p>
            </div>
            
            {countdown !== null && !isPaused && (
              <div className="bg-white/10 px-4 py-2 rounded-xl text-center border border-white/10 shrink-0">
                <p className="text-[9px] uppercase font-bold tracking-wider text-white/60">Throttle Interval</p>
                <p className="text-lg font-mono font-extrabold text-lemon-icing">Cooldown: {countdown.toFixed(1)}s</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
            <div className="text-center sm:text-left">
              <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Queue Progress</span>
              <p className="text-lg font-heading font-bold">{completedTasksCount + errorTasksCount} / {totalTasksCount}</p>
            </div>
            <div className="text-center sm:text-left">
              <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Successful Audits</span>
              <p className="text-lg font-heading font-bold text-emerald-400">{completedTasksCount}</p>
            </div>
            <div className="text-center sm:text-left">
              <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Errors Encountered</span>
              <p className="text-lg font-heading font-bold text-red-300">{errorTasksCount}</p>
            </div>
            <div className="text-center sm:text-left">
              <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Estimated Remaining</span>
              <p className="text-lg font-heading font-bold text-lemon-icing">
                {pendingTasksCount > 0 ? `~${estimatedSecondsRemaining}s` : "Finished"}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-ice-melt to-lemon-icing transition-all duration-500 ease-out" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/50 font-bold uppercase tracking-wider">
              <span>0% Started</span>
              <span>{progressPercent}% Complete</span>
              <span>100% Finished</span>
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
                        {task.error && (
                          <Tooltip>
                            <TooltipTrigger className={`${task.status === "error" ? "text-red-500 hover:bg-red-50" : "text-amber-500 hover:bg-amber-50"} p-2 rounded-xl transition-colors`}>
                              <AlertCircle className={`w-4 h-4 ${task.status !== "error" ? "animate-pulse" : ""}`} />
                            </TooltipTrigger>
                            <TooltipContent className={`${task.status === "error" ? "bg-red-600" : "bg-amber-600"} text-white border-none p-3 shadow-xl`}>
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
