/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, ChangeEvent } from "react";
import { 
  FileCode, 
  Upload, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight, 
  BarChart3, 
  Zap, 
  ShieldCheck, 
  Cpu, 
  Target,
  FileText,
  Lightbulb,
  ArrowRightLeft,
  Loader2,
  ExternalLink,
  Compass,
  FileJson,
  Copy
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ResourceStats {
  totalRequests: number;
  jsRequests: number;
  cssRequests: number;
  apiRequests: number;
  imageRequests: number;
  blockedRequests: { url: string; status: number }[];
}

interface AuditReport {
  bottomLine: string;
  reasoning: string[];
  goldenCircle?: {
    why: string;
    how: string;
    what: string;
  };
  confidenceMetrics?: {
    confidenceLevel: string;
    accuracyProbability: number;
  };
  causes: {
    title: string;
    description: string;
    type: "primary" | "secondary" | "info";
    snippet?: string;
    list?: string[];
  }[];
  quantitative: {
    metric: string;
    jsValue: string;
    nojsValue: string;
    notes?: string;
  }[];
  infrastructureRisk?: {
    score: number;
    riskLevel: "Critical" | "High" | "Medium" | "Low";
    metrics: { label: string; value: string | number }[];
    analysis: string;
  };
  seoInsights: {
    good: string[];
    risks: string[];
    takeaway: string;
  };
  technicalDetails: {
    area: string;
    js: string;
    nojs: string;
  }[];
  recommendations: string[];
  executiveTldr: string;
  eli5: string;
}

export const normalizeUrl = (input: string): string => {
  if (!input) return "";
  let clean = input.trim();
  
  // Repair any common comma typos in domain/subdomain/TLD parts (e.g., "www,thezebra,com" -> "www.thezebra.com")
  clean = clean.replace(/([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)/g, '$1.$2');
  
  // Ensure we prepend the https:// protocol if it is missing
  if (!/^https?:\/\//i.test(clean)) {
    clean = "https://" + clean;
  }
  return clean;
};

export interface ExtractedJson {
  source: 'JS-Rendered' | 'No-JS Raw';
  id: string;
  type: 'Schema (JSON-LD)' | 'State / Payload';
  content: any;
  rawText: string;
}

export const extractJsonScripts = (html: string, source: 'JS-Rendered' | 'No-JS Raw'): ExtractedJson[] => {
  if (!html) return [];
  const results: ExtractedJson[] = [];
  
  // 1. Extract JSON-LD
  const ldJsonRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let ldIndex = 1;
  while ((match = ldJsonRegex.exec(html)) !== null) {
    const rawContent = match[1].trim();
    if (rawContent) {
      try {
        const parsed = JSON.parse(rawContent);
        results.push({
          source,
          id: parsed['@type'] ? `Schema: ${parsed['@type']}` : `JSON-LD #${ldIndex++}`,
          type: 'Schema (JSON-LD)',
          content: parsed,
          rawText: rawContent
        });
      } catch (e) {
        results.push({
          source,
          id: `JSON-LD #${ldIndex++} (Invalid JSON)`,
          type: 'Schema (JSON-LD)',
          content: null,
          rawText: rawContent
        });
      }
    }
  }

  // 2. Extract application/json (e.g. Next.js, Redux, etc.)
  const appJsonRegex = /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let appIndex = 1;
  while ((match = appJsonRegex.exec(html)) !== null) {
    const rawContent = match[1].trim();
    if (rawContent) {
      try {
        const parsed = JSON.parse(rawContent);
        // Look for common ID attributes like id="__NEXT_DATA__" or check nearby text
        const tagMatch = html.substring(Math.max(0, match.index - 100), match.index);
        const idAttrMatch = /id=["']([^"']+)["']/i.exec(tagMatch);
        const scriptId = idAttrMatch ? idAttrMatch[1] : `App JSON #${appIndex++}`;
        
        results.push({
          source,
          id: scriptId,
          type: 'State / Payload',
          content: parsed,
          rawText: rawContent
        });
      } catch (e) {
        results.push({
          source,
          id: `App JSON #${appIndex++} (Invalid)",`,
          type: 'State / Payload',
          content: null,
          rawText: rawContent
        });
      }
    }
  }

  // 3. Look for Next.js or Nuxt data if not caught, or __NEXT_DATA__ inside simple scripts
  const nextDataRegex = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = nextDataRegex.exec(html)) !== null) {
    const rawContent = match[1].trim();
    if (rawContent && !results.some(r => r.id === '__NEXT_DATA__' && r.source === source)) {
      try {
        const parsed = JSON.parse(rawContent);
        results.push({
          source,
          id: '__NEXT_DATA__',
          type: 'State / Payload',
          content: parsed,
          rawText: rawContent
        });
      } catch (e) {
        results.push({
          source,
          id: '__NEXT_DATA__ (Invalid JSON)',
          type: 'State / Payload',
          content: null,
          rawText: rawContent
        });
      }
    }
  }

  return results;
};

export const extractMeta = (html: string) => {
  if (!html) return { title: "N/A", description: "N/A", canonical: "N/A", robots: "N/A" };
  
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? titleMatch[1].trim() : "Not found";
  
  const descMatch = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html) ||
                    /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html);
  const description = descMatch ? descMatch[1].trim() : "Not found";
  
  const canonicalMatch = /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i.exec(html) ||
                         /<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i.exec(html);
  const canonical = canonicalMatch ? canonicalMatch[1].trim() : "Not found";
  
  const robotsMatch = /<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i.exec(html) ||
                      /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i.exec(html);
  const robots = robotsMatch ? robotsMatch[1].trim() : "Not found";

  return { title, description, canonical, robots };
};

interface HistoryItem {
  id: string;
  timestamp: number;
  url: string;
  report: AuditReport;
}

const BOTS = [
  { id: 'googlebot', name: 'Googlebot', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { id: 'claritybot-desktop', name: 'ClarityBot Desktop', ua: 'Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)' },
  { id: 'claritybot-mobile', name: 'ClarityBot Mobile', ua: 'Mozilla/5.0 (Linux; Android 9; SM-G960F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.157 Mobile Safari/537.36 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)' },
];

export default function App() {
  const [url, setUrl] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [selectedBot, setSelectedBot] = useState(BOTS[0]);
  const [jsHtml, setJsHtml] = useState("");
  const [noJsHtml, setNoJsHtml] = useState("");
  const [resourceStats, setResourceStats] = useState<ResourceStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [activeTab, setActiveTab] = useState<'audit' | 'inspector'>('audit');
  const [inspectorSubTab, setInspectorSubTab] = useState<'dom' | 'json' | 'stats'>('dom');
  const [inspectorSource, setInspectorSource] = useState<'js' | 'nojs'>('js');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('audit_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          return parsed.filter((item: any) => {
            if (!item || typeof item !== 'object') return false;
            if (!item.id) {
              item.id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            }
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  // Persist history to localStorage
  useEffect(() => {
    localStorage.setItem('audit_history', JSON.stringify(history));
  }, [history]);

  // Gracefully handle global/third-party uncaught script errors (e.g., "Script error.")
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Cross-origin and generic iframe script errors often have message "Script error."
      if (event.message?.includes("Script error.")) {
        console.warn("Muted cross-origin/third-party Script error.");
        event.preventDefault();
        return;
      }
      console.error("Global captured error:", event.error || event.message);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.warn("Global captured unhandled promise rejection:", event.reason);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const loadingMessages = [
    "Cognitive engine initializing...",
    "Emulating target User-Agent...",
    "Tracing hydration event listeners...",
    "Scanning for visibility:hidden anti-patterns...",
    "Mapping raw DOM vs rendered DOM...",
    "Assessing metadata parity...",
    "Intersecting network waterfalls...",
    "Synthesizing Strategic Intelligence..."
  ];

  const handleFetchNoJs = async () => {
    if (!url) {
      setError("Please provide a URL first.");
      return;
    }
    const normalized = normalizeUrl(url);
    setUrl(normalized);
    setFetching(true);
    setError(null);
    try {
      const response = await fetch("/api/fetch-nojs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized, userAgent: selectedBot.ua }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setNoJsHtml(data.html);
      setResourceStats(null); // Clear previous crawl stats
    } catch (err: any) {
      setError(`Fetch failed: ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  const performFullCrawlAndAnalyze = async (inputUrl: string): Promise<AuditReport> => {
    const normalized = normalizeUrl(inputUrl);
    
    // 1. Full Crawl
    const response = await fetch("/api/full-crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: normalized, userAgent: selectedBot.ua }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();

    // 2. Analyze
    const analysisResponse = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        jsHtml: data.jsHtml, 
        noJsHtml: data.noJsHtml, 
        url: normalized, 
        resources: data.resources 
      }),
    });

    if (!analysisResponse.ok) throw new Error(await analysisResponse.text());
    const auditData = await analysisResponse.json();
    return auditData;
  };

  const handleFullCrawl = async () => {
    if (!url) {
      setError("Please provide a URL first.");
      return;
    }
    setCrawling(true);
    setError(null);
    setLoading(true);
    
    const interval = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % loadingMessages.length);
    }, 2500);

    try {
      const auditData = await performFullCrawlAndAnalyze(url);
      setReport(auditData);
      
      setHistory(prev => {
        const newId = `crawl-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const newItem = {
          id: newId,
          timestamp: Date.now(),
          url: normalizeUrl(url),
          report: auditData
        };
        return [newItem, ...prev.filter(item => item.id !== newId)];
      });
    } catch (err: any) {
      setError(`Full crawl failed: ${err.message}`);
    } finally {
      clearInterval(interval);
      setCrawling(false);
      setLoading(false);
    }
  };

  const handleBatchCrawl = async () => {
    if (!batchInput) return;
    const lines = batchInput.split('\n');
    const urlsToCrawl = lines.flatMap(line => {
        const parts = line.split(',');
        if (parts.length < 4) return [];
        return parts[3].split(';').map(u => u.trim());
    }).filter(u => u);

    setLoading(true);
    setError(null);
    
    for (const targetUrl of urlsToCrawl) {
        try {
            const auditData = await performFullCrawlAndAnalyze(targetUrl);
            setHistory(prev => {
                const newId = `crawl-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
                const newItem = {
                  id: newId,
                  timestamp: Date.now(),
                  url: targetUrl,
                  report: auditData
                };
                return [newItem, ...prev];
            });
        } catch (err: any) {
            console.error(`Failed to crawl ${targetUrl}:`, err);
            // Continue with next URL
        }
    }
    setLoading(false);
  };


  const handleAnalyze = async () => {
    if (!jsHtml || !noJsHtml) {
      setError("Please provide both JS and No-JS HTML content.");
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);
    
    const interval = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % loadingMessages.length);
    }, 2000);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsHtml, noJsHtml, url, resources: resourceStats }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      setReport(data);
      
      // Store in memory history
      setHistory(prev => {
        const newId = `analyze-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const newItem = {
          id: newId,
          timestamp: Date.now(),
          url: url || "Direct HTML Upload",
          report: data
        };
        return [newItem, ...prev.filter(item => item.id !== newId)];
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong during analysis.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const Badge = ({ type }: { type: string }) => {
    const colors: Record<string, string> = {
      primary: "bg-red-100 text-red-700",
      secondary: "bg-amber-100 text-amber-700",
      info: "bg-blue-100 text-blue-700",
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${colors[type] || colors.info}`}>
        {type}
      </span>
    );
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setter(ev.target?.result as string);
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-screen bg-cloud-dancer selection:bg-ice-melt/50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded flex items-center justify-center">
              <Zap className="text-lemon-icing w-6 h-6 fill-lemon-icing" />
            </div>
            <div>
              <h1 className="text-xl font-heading tracking-tight leading-none mb-1">AUDIT JS Heavy Websites</h1>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Client SEO Architect Platform</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-right hidden md:block">
              <p className="text-xs font-semibold text-gray-500 uppercase">Audit Records</p>
              <p className="text-sm font-mono text-black">{history.length} Sessions</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-400" />
              Source Context
            </h2>
            
            <div className="space-y-4">
              {/* Toggle for single vs batch */}
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                  className={`flex-1 py-1.5 text-xs font-bold rounded ${activeTab === 'audit' ? 'bg-white shadow' : ''}`}
                  onClick={() => setActiveTab('audit')}
                >SINGLE URL</button>
                <button 
                  className={`flex-1 py-1.5 text-xs font-bold rounded ${activeTab === 'batch' ? 'bg-white shadow' : ''}`}
                  onClick={() => setActiveTab('batch')}
                >BATCH INPUT</button>
              </div>

              {activeTab === 'batch' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Paste Template Data</label>
                  <textarea 
                    value={batchInput}
                    onChange={(e) => setBatchInput(e.target.value)}
                    placeholder="Template Name,URL Pattern,Recommended Schema,Sample URLs"
                    className="w-full h-32 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ice-melt"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Target URL</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/page"
                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ice-melt"
                      />
                      <button 
                        onClick={handleFetchNoJs}
                        disabled={fetching || !url || crawling}
                        className="px-3 py-2 bg-ice-melt text-blue-900 rounded-lg hover:bg-blue-200 disabled:opacity-50 transition-colors flex items-center gap-2 text-xs font-bold"
                        title="Fetch Raw HTML from Server"
                      >
                        {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        FETCH RAW
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Crawler Emulation</label>
                    <div className="grid grid-cols-1 gap-2">
                      {BOTS.map((bot) => (
                        <button
                          key={bot.id}
                          onClick={() => setSelectedBot(bot)}
                          className={`px-3 py-2 text-left rounded-lg border text-xs transition-all flex items-center justify-between ${
                            selectedBot.id === bot.id 
                              ? 'border-blue-900 bg-blue-50 text-blue-900 font-bold ring-1 ring-blue-900' 
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {bot.name}
                          {selectedBot.id === bot.id && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={handleFullCrawl}
                    disabled={loading || crawling || !url}
                    className="w-full py-3 bg-blue-900 text-white font-heading tracking-widest rounded-lg flex items-center justify-center gap-2 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20"
                  >
                    {crawling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
                    FULL CRAWL ({selectedBot.name.split(' ')[0].toUpperCase()})
                    <span className="text-[8px] bg-blue-700 px-1.5 py-0.5 rounded ml-1 animate-pulse">PRO</span>
                  </button>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">JS-Enabled HTML (Rendered)</label>
                <div className="relative">
                  <textarea 
                    value={jsHtml}
                    onChange={(e) => setJsHtml(e.target.value)}
                    placeholder="Paste js.html content or upload file..."
                    className="w-full h-32 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ice-melt pr-12"
                  />
                  <label className="absolute right-2 top-2 p-2 hover:bg-gray-200 rounded cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-gray-500" />
                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, setJsHtml)} />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">No-JS HTML (Raw)</label>
                <div className="relative">
                  <textarea 
                    value={noJsHtml}
                    onChange={(e) => setNoJsHtml(e.target.value)}
                    placeholder="Paste nojs.html content or upload file..."
                    className="w-full h-32 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ice-melt pr-12"
                  />
                  <label className="absolute right-2 top-2 p-2 hover:bg-gray-200 rounded cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-gray-500" />
                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, setNoJsHtml)} />
                  </label>
                </div>
              </div>

              <button 
                onClick={handleAnalyze}
                disabled={loading || !jsHtml || !noJsHtml}
                className="w-full py-4 bg-black text-white font-heading tracking-widest rounded-lg flex flex-col items-center justify-center gap-1 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
              >
                <div className="flex items-center gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-lemon-icing text-lemon-icing" />}
                  RUN DIAGNOSTICS
                </div>
                {!loading && <p className="text-[8px] opacity-60 font-mono">ENACTING: {selectedBot.name.toUpperCase()}</p>}
              </button>

              {error && (() => {
                const isBlocked = error.toLowerCase().includes("403") || 
                                  error.toLowerCase().includes("forbidden") || 
                                  error.toLowerCase().includes("blocked") ||
                                  error.toLowerCase().includes("waf");
                return (
                  <div className={`p-5 rounded-xl border flex flex-col gap-3 ${isBlocked ? 'bg-red-50/70 border-red-200 text-red-900' : 'bg-red-50 border-red-100 text-red-800'}`}>
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider font-heading mb-1">
                          {isBlocked ? 'WAF Bot Blockage Detected' : 'Diagnostic Error'}
                        </h4>
                        <p className="text-[11px] font-medium leading-relaxed">{error}</p>
                      </div>
                    </div>
                    {isBlocked && (
                      <div className="mt-2 pt-3 border-t border-red-200/50 space-y-2">
                        <p className="text-[10px] uppercase font-bold text-red-700 tracking-wider">Expert Troubleshooting:</p>
                        <ul className="text-[10px] list-disc pl-4 space-y-1 text-red-800 font-medium">
                          <li>
                            <strong>Advanced WAF/Bot Shield:</strong> The target domain uses aggressive bot mitigation (such as Cloudflare, DataDome, or Akamai) that blocks standard server requests.
                          </li>
                          <li>
                            <strong>Immediate Resolution:</strong> Simply open the target URL in your browser, copy the page source (or use a browser extension to save raw vs. rendered DOMs), and paste them into the <strong>JS-Enabled HTML</strong> and <strong>No-JS HTML</strong> boxes above!
                          </li>
                          <li>
                            <strong>Diagnostics Integrity:</strong> Manual pasting completely bypasses the block and allows our AI-powered <strong>seoClarity Comparative Engine</strong> to run at 100% precision.
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </section>

          {history.length > 0 && (
            <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-left-4 duration-500">
              <h2 className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">Session History</h2>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {history.map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => {
                        setReport(item.report);
                        setUrl(item.url);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${report?.bottomLine === item.report.bottomLine ? 'border-ice-melt bg-ice-melt/10 ring-1 ring-ice-melt' : 'border-gray-100 bg-gray-50 hover:border-gray-300'}`}
                  >
                    <div className="w-8 h-8 rounded bg-white border border-gray-200 flex items-center justify-center shrink-0">
                      <FileCode className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-gray-700 truncate">{item.url || "Manual Audit"}</p>
                      <p className="text-[9px] text-gray-400 font-mono tracking-tight">{new Date(item.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="bg-lemon-icing/30 p-6 rounded-xl border border-lemon-icing/50">
            <h3 className="text-sm font-bold uppercase mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-700" />
              Strategic intelligence Flow
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-amber-800 uppercase">Reasoning Path</p>
                <p className="text-xs text-gray-700">Audit methodology uses multi-pass structural diffing.</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-amber-800 uppercase">Cognitive Logic</p>
                <p className="text-xs text-gray-700">Heuristic discovery of JS-dependent render blockers.</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-amber-800 uppercase">Remediation Stack</p>
                <p className="text-xs text-gray-700">Actionable intelligence for technical SEO excellence.</p>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-xl border border-gray-200 overflow-hidden">
            <h3 className="text-[10px] font-bold uppercase mb-4 flex items-center gap-2 text-gray-500 tracking-wider">
              <ExternalLink className="w-4 h-4" />
              Intelligence Capture Protocols
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-ice-melt/20 rounded-lg border border-ice-melt/40">
                <p className="text-[11px] font-bold text-blue-900 uppercase mb-2 flex items-center justify-between">
                  PROTOCOL 01: AUTO-FETCH ({selectedBot.name.toUpperCase()})
                  <span className="text-[8px] bg-blue-100 px-2 py-0.5 rounded text-blue-700 font-bold">RECOMMENDED</span>
                </p>
                <p className="text-[10px] text-gray-800 mb-2 font-medium">Click the "FETCH RAW" button next to the URL input above.</p>
                <ul className="text-[10px] text-gray-600 space-y-1 list-disc pl-3">
                  <li>Triggers server-side fetch with {selectedBot.name} headers.</li>
                  <li>Injected directly into the No-JS workspace.</li>
                  <li>Zero-latency transfer (No terminal required).</li>
                </ul>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-[11px] font-bold text-gray-700 uppercase mb-2 flex items-center justify-between">
                  PROTOCOL 02: TERMINAL (RAW)
                  <span className="text-[8px] bg-gray-200 px-2 py-0.5 rounded">MANUAL</span>
                </p>
                <p className="text-[10px] text-gray-500 mb-2">Use piping to copy the output straight to your clipboard:</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">MacOS/Linux</p>
                    <code className="text-[9px] block bg-gray-900 text-green-400 p-2 rounded font-mono truncate">
                      curl -A "{selectedBot.ua}" {url || '[URL]'} | pbcopy
                    </code>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Windows (PowerShell)</p>
                    <code className="text-[9px] block bg-gray-900 text-green-400 p-2 rounded font-mono truncate">
                      curl -A "{selectedBot.ua}" {url || '[URL]'} | clip
                    </code>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-[11px] font-bold text-purple-900 uppercase mb-2 flex items-center justify-between">
                  PROTOCOL 03: RENDERED HTML
                  <span className="text-[8px] bg-purple-100 px-2 py-0.5 rounded text-purple-700 font-bold">BROWSER</span>
                </p>
                <ol className="text-[10px] text-gray-600 list-decimal pl-3 space-y-1">
                  <li>Open URL in Chrome.</li>
                  <li>Wait for full hydration/rendering.</li>
                  <li><strong>F12</strong> -&gt; <strong>Elements</strong> Tab.</li>
                  <li>Right-click <code>&lt;html&gt;</code> tag -&gt; <strong>Copy outerHTML</strong>.</li>
                  <li>Paste into the JS-Enabled field.</li>
                </ol>
              </div>

              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-[11px] font-bold text-amber-900 uppercase mb-2 flex items-center justify-between">
                  PROTOCOL 04: 429/RATE-LIMIT DIAG
                  <span className="text-[8px] bg-amber-100 px-2 py-0.5 rounded text-amber-700 font-bold">NETWORK</span>
                </p>
                <ol className="text-[10px] text-gray-600 list-decimal pl-3 space-y-1">
                  <li>Open <strong>Inspect</strong> -&gt; <strong>Network</strong> tab.</li>
                  <li>Reload page with <strong>Disable Cache</strong> checked.</li>
                  <li>Observe the number of <strong>Requests</strong> at the bottom.</li>
                  <li>Look for <strong>Status 429</strong> or <strong>403</strong> in the list.</li>
                  <li>Check <strong>Initiator</strong> column to see what's calling multiple resources.</li>
                </ol>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8">
          {/* Tab Switcher */}
          {(report || jsHtml || noJsHtml) && (
            <div className="flex border border-gray-200 mb-6 bg-white p-1 rounded-xl shadow-sm">
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex-1 py-3 px-4 rounded-lg text-center font-heading uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'audit'
                    ? 'bg-blue-900 text-white font-bold shadow-sm'
                    : 'text-gray-500 hover:text-black hover:bg-gray-50'
                }`}
              >
                <Zap className={`w-4 h-4 ${activeTab === 'audit' ? 'text-lemon-icing fill-lemon-icing' : ''}`} />
                Executive Audit Report
              </button>
              <button
                onClick={() => setActiveTab('inspector')}
                className={`flex-1 py-3 px-4 rounded-lg text-center font-heading uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'inspector'
                    ? 'bg-blue-900 text-white font-bold shadow-sm'
                    : 'text-gray-500 hover:text-black hover:bg-gray-50'
                }`}
              >
                <FileJson className="w-4 h-4" />
                DOM & Structured JSON Inspector
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div 
                key="loading-screen"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-[600px] bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center p-12 text-center"
              >
                <div className="relative mb-8">
                  <div className="w-24 h-24 border-4 border-ice-melt/30 border-t-ice-melt rounded-full animate-spin" />
                  <Zap className="absolute inset-0 m-auto w-8 h-8 text-lemon-icing fill-lemon-icing animate-pulse" />
                </div>
                <h3 className="text-xl font-heading mb-2">Analyzing Architecture</h3>
                <p className="text-sm text-gray-500 font-mono tracking-wider animate-pulse">{loadingMessages[loadingStep]}</p>
              </motion.div>
            ) : activeTab === 'inspector' ? (
              <motion.div
                key="inspector-screen"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm space-y-6"
              >
                {/* Sub-tab selection */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg text-xs font-mono">
                  <button
                    onClick={() => setInspectorSubTab('dom')}
                    className={`flex-1 py-2.5 px-3 rounded-md transition-all flex items-center justify-center gap-2 font-bold ${
                      inspectorSubTab === 'dom'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <FileCode className="w-4 h-4 text-blue-900" />
                    DOM SOURCE CODE
                  </button>
                  <button
                    onClick={() => setInspectorSubTab('json')}
                    className={`flex-1 py-2.5 px-3 rounded-md transition-all flex items-center justify-center gap-2 font-bold ${
                      inspectorSubTab === 'json'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <FileJson className="w-4 h-4 text-amber-600" />
                    STRUCTURED JSON
                  </button>
                  <button
                    onClick={() => setInspectorSubTab('stats')}
                    className={`flex-1 py-2.5 px-3 rounded-md transition-all flex items-center justify-center gap-2 font-bold ${
                      inspectorSubTab === 'stats'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4 text-purple-600" />
                    META & PARITY
                  </button>
                </div>

                {/* DOM Tab Content */}
                {inspectorSubTab === 'dom' && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setInspectorSource('js')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                            inspectorSource === 'js'
                              ? 'bg-ice-melt text-blue-900 border-ice-melt font-bold'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          JS-Rendered DOM ({jsHtml ? `${(jsHtml.length / 1024).toFixed(1)} KB` : 'Empty'})
                        </button>
                        <button
                          onClick={() => setInspectorSource('nojs')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                            inspectorSource === 'nojs'
                              ? 'bg-raindrops-on-roses text-purple-950 border-raindrops-on-roses font-bold'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          No-JS Raw DOM ({noJsHtml ? `${(noJsHtml.length / 1024).toFixed(1)} KB` : 'Empty'})
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          const code = inspectorSource === 'js' ? jsHtml : noJsHtml;
                          navigator.clipboard.writeText(code);
                          setCopiedText(inspectorSource);
                          setTimeout(() => setCopiedText(null), 2000);
                        }}
                        disabled={!(inspectorSource === 'js' ? jsHtml : noJsHtml)}
                        className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {copiedText === inspectorSource ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedText === inspectorSource ? 'COPIED!' : 'COPY CODE'}
                      </button>
                    </div>

                    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden font-mono text-[11px] leading-relaxed shadow-inner font-mono">
                      <div className="bg-gray-900 px-4 py-2 border-b border-gray-800 flex justify-between items-center text-gray-400 text-[10px]">
                        <span>FILE SNIPPET VIEW</span>
                        <span className="bg-gray-800 px-2 py-0.5 rounded text-[9px] font-bold">HTML5</span>
                      </div>
                      <div className="p-4 max-h-[500px] overflow-y-auto custom-scrollbar overflow-x-auto whitespace-pre">
                        {(() => {
                          const code = inspectorSource === 'js' ? jsHtml : noJsHtml;
                          if (!code) {
                            return <p className="text-gray-500 italic text-center py-12">No DOM source available. Try pasting or crawling a URL first.</p>;
                          }
                          const truncated = code.substring(0, 30000);
                          const lines = truncated.split('\n');
                          return (
                            <div className="table w-full font-mono">
                              {lines.map((line, idx) => (
                                <div key={idx} className="table-row hover:bg-gray-900/50">
                                  <span className="table-cell select-none pr-4 text-right text-gray-600 font-bold border-r border-gray-900 w-12 font-mono">{idx + 1}</span>
                                  <span className="table-cell pl-4 text-gray-300 break-all whitespace-pre-wrap font-mono">{line}</span>
                                </div>
                              ))}
                              {code.length > 30000 && (
                                <div className="text-center py-4 border-t border-gray-900 text-gray-500 italic font-mono">
                                  [Truncated for performance. {((code.length - 30000) / 1024).toFixed(1)} KB remaining. Click "COPY CODE" to retrieve full source.]
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* JSON Tab Content */}
                {inspectorSubTab === 'json' && (() => {
                  const jsJsons = extractJsonScripts(jsHtml, 'JS-Rendered');
                  const noJsJsons = extractJsonScripts(noJsHtml, 'No-JS Raw');
                  const allJsons = [...jsJsons, ...noJsJsons];

                  if (allJsons.length === 0) {
                    return (
                      <div className="bg-white p-12 text-center rounded-xl border border-dashed border-gray-300 text-gray-400 animate-in fade-in duration-300">
                        <FileJson className="w-12 h-12 mx-auto mb-3 opacity-50 stroke-1" />
                        <p className="text-sm font-medium">No embedded JSON or JSON-LD schema found in either DOM snapshot.</p>
                        <p className="text-xs mt-1 text-gray-400 max-w-sm mx-auto">Modern JavaScript frameworks or structured schemas place content inside &lt;script type="application/json"&gt; tags.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div>
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide font-heading">Structured Data & Payload Assets</h3>
                        <p className="text-[10px] text-gray-500 font-mono">Found {allJsons.length} JSON data structures in total.</p>
                      </div>

                      <div className="space-y-4">
                        {allJsons.map((item, idx) => {
                          const key = `${item.source}-${item.id}-${idx}`;
                          const isLdJson = item.type === 'Schema (JSON-LD)';
                          return (
                            <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                              <div className={`px-4 py-3 border-b flex justify-between items-center flex-wrap gap-2 ${isLdJson ? 'bg-amber-50/50 border-amber-100' : 'bg-blue-50/30 border-blue-100'}`}>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded ${isLdJson ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {item.type}
                                  </span>
                                  <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded ${item.source === 'JS-Rendered' ? 'bg-ice-melt/40 text-blue-900' : 'bg-raindrops-on-roses/40 text-purple-950'}`}>
                                    {item.source}
                                  </span>
                                  <span className="text-xs font-bold font-mono text-gray-800 truncate max-w-xs">{item.id}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.rawText);
                                    setCopiedText(key);
                                    setTimeout(() => setCopiedText(null), 2000);
                                  }}
                                  className="px-2 py-1 bg-white hover:bg-gray-50 text-[10px] text-gray-600 border border-gray-200 rounded font-mono transition-colors flex items-center gap-1"
                                >
                                  {copiedText === key ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                  {copiedText === key ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                              <div className="p-4 bg-gray-50/50">
                                <pre className="text-[11px] font-mono text-gray-700 bg-white p-3 rounded-lg border border-gray-200 max-h-60 overflow-y-auto custom-scrollbar overflow-x-auto whitespace-pre-wrap font-mono">
                                  <code>{item.content ? JSON.stringify(item.content, null, 2) : item.rawText}</code>
                                </pre>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Meta Stats Tab Content */}
                {inspectorSubTab === 'stats' && (() => {
                  const jsMeta = extractMeta(jsHtml);
                  const noJsMeta = extractMeta(noJsHtml);
                  const isTitleMatch = jsMeta.title === noJsMeta.title;
                  const isDescMatch = jsMeta.description === noJsMeta.description;
                  const isCanonicalMatch = jsMeta.canonical === noJsMeta.canonical;
                  const isRobotsMatch = jsMeta.robots === noJsMeta.robots;

                  return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div>
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide font-heading font-bold">Parity Head Analysis</h3>
                        <p className="text-[10px] text-gray-500 font-mono">Comparing critical crawler metadata elements side-by-side.</p>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        {/* TITLE TAG */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                            <h4 className="text-xs font-bold text-gray-500 uppercase font-mono">Title Meta Element</h4>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${isTitleMatch ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {isTitleMatch ? 'Matches Perfectly' : 'Disparity Detected'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 bg-blue-50/20 border border-blue-100 rounded-lg">
                              <p className="text-[9px] font-bold text-blue-900 uppercase font-mono mb-1">JS-Rendered DOM</p>
                              <p className="text-xs font-bold text-gray-900 leading-normal">{jsMeta.title}</p>
                            </div>
                            <div className="p-3 bg-purple-50/20 border border-purple-100 rounded-lg">
                              <p className="text-[9px] font-bold text-purple-900 uppercase font-mono mb-1">No-JS Raw DOM</p>
                              <p className="text-xs font-bold text-gray-900 leading-normal">{noJsMeta.title}</p>
                            </div>
                          </div>
                        </div>

                        {/* DESCRIPTION TAG */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                            <h4 className="text-xs font-bold text-gray-500 uppercase font-mono">Description Tag</h4>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${isDescMatch ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {isDescMatch ? 'Matches Perfectly' : 'Disparity Detected'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 bg-blue-50/20 border border-blue-100 rounded-lg">
                              <p className="text-[9px] font-bold text-blue-900 uppercase font-mono mb-1">JS-Rendered DOM</p>
                              <p className="text-xs text-gray-700 leading-relaxed font-medium">{jsMeta.description}</p>
                            </div>
                            <div className="p-3 bg-purple-50/20 border border-purple-100 rounded-lg">
                              <p className="text-[9px] font-bold text-purple-900 uppercase font-mono mb-1">No-JS Raw DOM</p>
                              <p className="text-xs text-gray-700 leading-relaxed font-medium">{noJsMeta.description}</p>
                            </div>
                          </div>
                        </div>

                        {/* CANONICAL */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                            <h4 className="text-xs font-bold text-gray-500 uppercase font-mono">Canonical Link Element</h4>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${isCanonicalMatch ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {isCanonicalMatch ? 'Matches Perfectly' : 'Disparity Detected'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 bg-blue-50/20 border border-blue-100 rounded-lg">
                              <p className="text-[9px] font-bold text-blue-900 uppercase font-mono mb-1">JS-Rendered DOM</p>
                              <p className="text-xs font-mono text-gray-800 break-all">{jsMeta.canonical}</p>
                            </div>
                            <div className="p-3 bg-purple-50/20 border border-purple-100 rounded-lg">
                              <p className="text-[9px] font-bold text-purple-900 uppercase font-mono mb-1">No-JS Raw DOM</p>
                              <p className="text-xs font-mono text-gray-800 break-all">{noJsMeta.canonical}</p>
                            </div>
                          </div>
                        </div>

                        {/* ROBOTS */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                            <h4 className="text-xs font-bold text-gray-500 uppercase font-mono">Robots Directives</h4>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${isRobotsMatch ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {isRobotsMatch ? 'Matches Perfectly' : 'Disparity Detected'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 bg-blue-50/20 border border-blue-100 rounded-lg">
                              <p className="text-[9px] font-bold text-blue-900 uppercase font-mono mb-1">JS-Rendered DOM</p>
                              <p className="text-xs font-mono text-gray-800">{jsMeta.robots}</p>
                            </div>
                            <div className="p-3 bg-purple-50/20 border border-purple-100 rounded-lg">
                              <p className="text-[9px] font-bold text-purple-900 uppercase font-mono mb-1">No-JS Raw DOM</p>
                              <p className="text-xs font-mono text-gray-800">{noJsMeta.robots}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            ) : !report ? (
              <motion.div 
                key="empty-screen"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-h-[500px] bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center p-8 text-center"
              >
                {jsHtml && noJsHtml ? (
                  <div className="max-w-md space-y-4">
                    <div className="w-16 h-16 bg-ice-melt/30 rounded-full flex items-center justify-center mx-auto mb-2 text-blue-900">
                      <Zap className="w-8 h-8 text-blue-900 fill-blue-900 animate-pulse" />
                    </div>
                    <h3 className="text-xl font-heading text-gray-900 font-bold">Snapshots Loaded & Ready</h3>
                    <p className="text-sm text-gray-600 leading-relaxed font-medium">
                      You have loaded both the JS-Rendered DOM and No-JS Raw DOM snapshots. You can run the comparative diagnostics or explore the HTML/JSON structures immediately.
                    </p>
                    <div className="pt-2 flex gap-3 justify-center">
                      <button
                        onClick={handleAnalyze}
                        className="px-6 py-2.5 bg-black text-white font-heading text-xs tracking-wider rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        RUN DIAGNOSTICS
                      </button>
                      <button
                        onClick={() => setActiveTab('inspector')}
                        className="px-6 py-2.5 bg-ice-melt text-blue-900 font-heading text-xs tracking-wider rounded-lg hover:bg-blue-200 transition-colors"
                      >
                        EXPLORE DOM & JSON
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-xs space-y-2">
                    <FileCode className="w-16 h-16 mb-2 stroke-1 text-gray-300 mx-auto" />
                    <h3 className="text-xl font-heading text-gray-400 font-bold">Awaiting Data Feed</h3>
                    <p className="text-xs text-gray-400 leading-normal font-medium">
                      Enter a URL on the left and run a crawl, or upload your HTML snapshots to begin the technical comparison engine.
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="report-screen"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Internal Reasoning Section */}
                {report.reasoning && (
                  <section className="bg-gray-100 p-6 rounded-xl border border-gray-200">
                    <h2 className="text-xs font-bold text-gray-500 uppercase mb-4 flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      Cognitive Audit Logic (Chain of Thought)
                    </h2>
                    <div className="space-y-3">
                      {report.reasoning?.map((step, i) => (
                        <div key={i} className="flex gap-4 items-start">
                          <div className="text-[10px] font-mono text-gray-400 mt-0.5 bg-gray-200 px-1.5 py-0.5 rounded">STEP_{i+1}</div>
                          <p className="text-xs text-gray-600 leading-relaxed italic">{step}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Result Block 1: Verdict */}
                <section className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <ShieldCheck className="w-12 h-12 text-ice-melt/20" />
                  </div>
                  <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                    <h2 className="text-lg flex items-center gap-2">
                      <Target className="w-5 h-5 text-gray-400" />
                      Diagnostic Verdict
                    </h2>
                    {report.confidenceMetrics && (
                      <div className="flex items-center gap-2 bg-ice-melt/20 border border-ice-melt/40 px-3 py-1 rounded-full">
                        <span className="text-[9px] font-bold text-blue-900 uppercase tracking-wider font-mono">
                          Confidence Level: {report.confidenceMetrics.confidenceLevel}
                        </span>
                        <span className="h-3 w-px bg-blue-300" />
                        <span className="text-[10px] font-bold text-blue-950 font-mono">
                          {report.confidenceMetrics.accuracyProbability}% Accuracy
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-6 bg-ice-melt/10 border-l-4 border-ice-melt rounded-r-lg">
                    <p className="text-lg leading-relaxed font-medium">
                      <strong className="text-blue-900">Bottom Line: </strong>
                      {report.bottomLine}
                    </p>
                  </div>
                </section>

                {/* Result Block: The Golden Circle Strategic Funnel */}
                {report.goldenCircle && (
                  <section className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg flex items-center gap-2 font-display font-bold">
                        <Compass className="w-5 h-5 text-gray-400" />
                        Strategic Funnel (The Golden Circle)
                      </h2>
                      <span className="text-[10px] font-mono font-bold tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        WHY → HOW → WHAT
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* WHY Card */}
                      <div className="p-6 bg-lemon-icing/20 border border-lemon-icing/40 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-6 h-6 rounded-full bg-lemon-icing text-amber-900 flex items-center justify-center font-bold text-xs font-mono">
                              1
                            </span>
                            <h3 className="font-heading uppercase tracking-wide text-amber-900 text-sm">
                              Why (Purpose)
                            </h3>
                          </div>
                          <p className="text-xs text-amber-950 font-medium leading-relaxed">
                            {report.goldenCircle.why}
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-lemon-icing/30 text-[9px] font-mono text-amber-800 uppercase tracking-widest">
                          Ontological Significance
                        </div>
                      </div>

                      {/* HOW Card */}
                      <div className="p-6 bg-raindrops-on-roses/20 border border-raindrops-on-roses/40 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-6 h-6 rounded-full bg-raindrops-on-roses text-purple-900 flex items-center justify-center font-bold text-xs font-mono">
                              2
                            </span>
                            <h3 className="font-heading uppercase tracking-wide text-purple-900 text-sm">
                              How (Methodology)
                            </h3>
                          </div>
                          <p className="text-xs text-purple-950 font-medium leading-relaxed">
                            {report.goldenCircle.how}
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-raindrops-on-roses/30 text-[9px] font-mono text-purple-800 uppercase tracking-widest">
                          High-Precision Detection
                        </div>
                      </div>

                      {/* WHAT Card */}
                      <div className="p-6 bg-ice-melt/20 border border-ice-melt/40 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-6 h-6 rounded-full bg-ice-melt text-blue-900 flex items-center justify-center font-bold text-xs font-mono">
                              3
                            </span>
                            <h3 className="font-heading uppercase tracking-wide text-blue-900 text-sm">
                              What (Outcome)
                            </h3>
                          </div>
                          <p className="text-xs text-blue-950 font-medium leading-relaxed">
                            {report.goldenCircle.what}
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-ice-melt/30 text-[9px] font-mono text-blue-800 uppercase tracking-widest">
                          Architectural Execution
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Infrastructure Risk Block */}
                {report.infrastructureRisk && (
                  <section className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-gray-400" />
                        Infrastructure & Bot Risk
                      </h2>
                      <div className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                        report.infrastructureRisk.riskLevel === 'Critical' ? 'bg-red-600 text-white' :
                        report.infrastructureRisk.riskLevel === 'High' ? 'bg-red-100 text-red-600' :
                        report.infrastructureRisk.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        {report.infrastructureRisk.riskLevel} RISK ({report.infrastructureRisk.score}/100)
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      {report.infrastructureRisk.metrics?.map((m, i) => (
                        <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{m.label}</p>
                          <p className="text-sm font-mono text-gray-900">{m.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 flex gap-4">
                      <AlertCircle className={`w-5 h-5 shrink-0 ${report.infrastructureRisk.score > 70 ? 'text-red-500' : 'text-amber-500'}`} />
                      <div>
                        <p className="text-xs text-gray-700 leading-relaxed font-medium">
                          {report.infrastructureRisk.analysis}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {/* Quantitative Comparison */}
                <section className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
                  <h2 className="text-lg mb-6 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-gray-400" />
                    Quantitative Metrics
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-3 px-4 font-bold text-gray-400 uppercase text-[10px]">Metric</th>
                          <th className="text-left py-3 px-4 font-bold text-gray-400 uppercase text-[10px]">JS-Rendered</th>
                          <th className="text-left py-3 px-4 font-bold text-gray-400 uppercase text-[10px]">No-JS Raw</th>
                          <th className="text-left py-3 px-4 font-bold text-gray-400 uppercase text-[10px]">Observation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {report.quantitative?.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4 font-bold">{row.metric || "---"}</td>
                            <td className="py-3 px-4 font-mono">{String(row.jsValue || "---")}</td>
                            <td className="py-3 px-4 font-mono text-amber-600">{String(row.nojsValue || "---")}</td>
                            <td className="py-3 px-4 text-gray-500 text-[10px] italic leading-tight">{row.notes || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Causes Analysis */}
                <section className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
                  <h2 className="text-lg mb-6 flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-gray-400" />
                    Root Cause Identification
                  </h2>
                  <div className="space-y-6">
                    {report.causes?.map((cause, i) => (
                      <div key={i} className={`p-6 rounded-xl border ${cause.type === 'primary' ? 'border-red-100 bg-red-50/30' : 'border-amber-100 bg-amber-50/30'}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <Badge type={cause.type} />
                          <h3 className="font-heading uppercase tracking-wide">{cause.title}</h3>
                        </div>
                        <p className="text-sm text-gray-700 mb-4">{cause.description}</p>
                        {cause.snippet && (
                          <pre className="p-4 bg-gray-900 text-gray-300 rounded-lg text-xs font-mono overflow-x-auto mb-4">
                            <code>{cause.snippet}</code>
                          </pre>
                        )}
                        {cause.list && (
                          <ul className="space-y-2">
                            {cause.list.map((item, j) => (
                              <li key={j} className="text-xs text-gray-600 flex items-start gap-2">
                                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {/* SEO & AI Perspectives */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
                    <h2 className="text-lg mb-6 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-green-500" />
                      Alignment (Good)
                    </h2>
                    <ul className="space-y-4">
                      {report.seoInsights?.good?.map((item, i) => (
                        <li key={i} className="flex gap-3 text-sm text-gray-700">
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
                    <h2 className="text-lg mb-6 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      Structural Risks
                    </h2>
                    <ul className="space-y-4">
                      {report.seoInsights?.risks?.map((item, i) => (
                        <li key={i} className="flex gap-3 text-sm text-gray-700">
                          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                {/* Recommendation Stack */}
                <section className="bg-black text-white p-8 rounded-xl border border-gray-800 shadow-xl relative overflow-hidden">
                  <div className="absolute -bottom-8 -right-8 opacity-10">
                    <Zap className="w-48 h-48 fill-white" />
                  </div>
                  <h2 className="text-lg mb-6 flex items-center gap-2 text-lemon-icing">
                    <Zap className="w-5 h-5 fill-lemon-icing" />
                    Strategic Remediation
                  </h2>
                  <div className="space-y-4 relative z-10">
                    {report.recommendations?.map((item, i) => (
                      <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-lg border border-white/10 group hover:bg-white/10 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-lemon-icing text-black flex items-center justify-center font-bold text-xs shrink-0">
                          {i + 1}
                        </div>
                        <p className="text-sm font-medium">{item}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Bottom summaries */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <section className="bg-peach-dust/20 p-8 rounded-xl border border-peach-dust/50">
                    <h2 className="text-lg mb-4 flex items-center gap-2 text-red-900">
                      <FileText className="w-5 h-5" />
                      Executive TLDR
                    </h2>
                    <p className="text-sm text-red-950 font-medium leading-relaxed italic">{report.executiveTldr}</p>
                  </section>
                  <section className="bg-raindrops-on-roses/20 p-8 rounded-xl border border-raindrops-on-roses/50">
                    <h2 className="text-lg mb-4 flex items-center gap-2 text-purple-900">
                      <ArrowRightLeft className="w-5 h-5" />
                      ELI5 Summary
                    </h2>
                    <p className="text-sm text-purple-950 font-medium leading-relaxed">{report.eli5}</p>
                  </section>
                </div>

                <div className="text-center pt-8 border-t border-gray-200">
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                    Generated by Client SEO Architect Engine • Audit Ref ID {Math.random().toString(36).substring(7).toUpperCase()}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-gray-200 py-12 bg-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="flex justify-center gap-8 mb-6">
            <a href="#" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-black">Documentation</a>
            <a href="#" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-black">Privacy Protocol</a>
            <a href="#" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-black">Support Axis</a>
          </div>
          <p className="text-xs text-gray-400">© 2026 seoClarity Architect. All rights reserved by Robert Joseph and Team.</p>
        </div>
      </footer>
    </div>
  );
}

