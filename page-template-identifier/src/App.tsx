/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Layout, 
  Globe, 
  Code, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Copy,
  Database,
  Upload,
  Download,
  History,
  X,
  Activity,
  Cpu,
  Clock,
  Gauge,
  Terminal,
  Layers,
  Eye,
  Folder,
  FolderTree,
  Plus,
  Sparkles,
  Trash2,
  Network,
  FileSpreadsheet,
  ArrowRight,
  ListFilter,
  Check,
  Building2,
  HelpCircle,
  Compass,
  FileText,
  RefreshCw,
  ArrowLeft
} from "lucide-react";

export interface ModelAttempt {
  model: string;
  attempt: number;
  success: boolean;
  error?: string;
  latencyMs: number;
}

export interface RequestLog {
  id: string;
  timestamp: string;
  status: "success" | "fallback" | "failed";
  promptLength: number;
  responseLength: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelsAttempted: ModelAttempt[];
  successfulModel?: string;
  totalLatencyMs: number;
  errorMessage?: string;
}

export interface QuotaStats {
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number;
  totalRequests: number;
  successfulRequests: number;
  fallbackRequests: number;
  failedRequests: number;
  totalTokensUsed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  limits: {
    rpmLimit: number;
    rpdLimit: number;
    tpmLimit: number;
  };
  recentLogs: RequestLog[];
}

interface Template {
  template_name: string;
  url_pattern: string;
  recommended_primary_schema: string;
  secondary_schemas?: string[];
  share_percentage?: number;
  sample_urls: string[];
  count: number;
  all_matching_urls: string[];
  target_rich_results?: string;
  required_schema_properties?: string[];
  json_ld_example?: string;
  schema_explanation?: string;
}

interface AnalysisResult {
  domain_analyzed: string;
  total_templates_discovered: number;
  templates: Template[];
  reasoning: string;
  executive_tldr?: string;
  eli5_summary?: string;
  industry_vertical?: string;
  industry_schema_doc_link?: string;
  crawled_menu_link_count?: number;
}

interface RunHistory {
  date: string;
  result: AnalysisResult;
}

export class SafeStorage {
  private inMemory: Record<string, string> = {};
  private isAvailable = false;

  constructor() {
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null) {
        const testKey = '__seo_clarity_test__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        this.isAvailable = true;
      }
    } catch (e) {
      this.isAvailable = false;
    }
  }

  getItem(key: string): string | null {
    if (this.isAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        // Fallback to in-memory
      }
    }
    return this.inMemory[key] || null;
  }

  setItem(key: string, value: string): void {
    if (this.isAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {
        // Fallback to in-memory
      }
    }
    this.inMemory[key] = value;
  }
}

const safeStorage = new SafeStorage();

const formatDateSafe = (dateString: string): string => {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Unknown Date";
    return d.toLocaleString(undefined, { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });
  } catch (e) {
    try {
      const d = new Date(dateString);
      return d.toLocaleString() || d.toString();
    } catch (e2) {
      return "Unknown Date";
    }
  }
};

// Resilient frontend normalization helper to prevent schema/keys mismatches
const normalizeResult = (raw: any): AnalysisResult => {
  if (!raw || typeof raw !== "object") {
    return {
      domain_analyzed: "unknown-domain.com",
      total_templates_discovered: 0,
      templates: [],
      reasoning: "Failed to parse analysis result properly."
    };
  }

  const domain_analyzed = raw.domain_analyzed || raw.domainAnalyzed || raw.domain || "unknown-domain.com";

  let rawTemplates: any[] = [];
  const templatesKeys = ["templates", "Templates", "page_templates", "pageTemplates", "schema_templates", "results", "clusters", "items"];
  for (const key of templatesKeys) {
    if (Array.isArray(raw[key])) {
      rawTemplates = raw[key];
      break;
    }
  }

  if (rawTemplates.length === 0) {
    for (const key of Object.keys(raw)) {
      if (Array.isArray(raw[key])) {
        rawTemplates = raw[key];
        break;
      }
    }
  }

  const normalizedTemplates = rawTemplates.map((item: any) => {
    if (!item || typeof item !== "object") return null;

    const template_name = item.template_name || item.templateName || item.name || item.template || item.cluster_name || item.clusterName || "Unknown Template";
    const url_pattern = item.url_pattern || item.urlPattern || item.pattern || item.urls_pattern || "N/A";
    const recommended_primary_schema = item.recommended_primary_schema || item.recommendedPrimarySchema || item.schema || item.primary_schema || item.primarySchema || item.recommended_schema || item.recommendedSchema || "WebPage";
    
    let sample_urls: string[] = [];
    const urlsKeys = ["sample_urls", "sampleUrls", "samples", "urls", "sample_url", "sampleUrl", "sample_pages", "samplePages"];
    for (const key of urlsKeys) {
      if (Array.isArray(item[key])) {
        sample_urls = item[key];
        break;
      }
    }

    if (sample_urls.length === 0) {
      for (const key of urlsKeys) {
        if (item[key]) {
          if (typeof item[key] === "string") {
            sample_urls = [item[key]];
            break;
          } else if (Array.isArray(item[key])) {
            sample_urls = item[key];
            break;
          }
        }
      }
    }

    let final_name = template_name;
    let final_schema = recommended_primary_schema;

    const patLower = url_pattern.toLowerCase().trim();
    const patParts = patLower.split('/').filter(Boolean);
    const nameLower = template_name.toLowerCase();

    // Clean low-quality names
    if (nameLower === "products" || nameLower === "product" || nameLower === "product template" || nameLower === "products template" || nameLower === "p template") {
      final_name = "Product Detail Page";
      final_schema = "Product";
    } else if (nameLower === "uses" || nameLower === "solutions" || nameLower === "use cases" || nameLower === "use-cases" || nameLower === "solution" || nameLower === "use case" || nameLower === "uses template" || nameLower === "solutions template") {
      final_name = "Solution / Use Case Page";
      final_schema = "WebPage";
    }

    // High-assurance pattern override
    const hasResourceUrl = sample_urls.some(url => {
      const u = url.toLowerCase();
      return u.includes("/resources/") || u.includes("/resource/") || u.endsWith("/resources") || u.endsWith("/resource") || /\/resources\?/.test(u);
    });
    const hasInteractiveToolUrl = sample_urls.some(url => {
      const u = url.toLowerCase();
      return u.includes("calculator") || u.includes("tool") || u.includes("roi") || u.includes("estimator");
    });

    const matchesProduct = patLower === "/product" || patLower === "/products" || patLower === "product" || patLower === "products" ||
                           patLower.startsWith("/product/") || patLower.startsWith("/products/") || patLower.startsWith("/p/") ||
                           patLower.includes("/product/*") || patLower.includes("/products/*") || patLower.includes("/p/*") ||
                           patParts.includes("product") || patParts.includes("products") || patParts.includes("p") || patParts.includes("shop") ||
                           patParts.some(p => p.startsWith("product") || p.startsWith("item") || p === "shop" || p === "p");
    
    const matchesSolution = patLower === "/uses" || patLower === "/solutions" || patLower === "/use-case" || patLower === "/use-cases" ||
                            patLower === "uses" || patLower === "solutions" || patLower === "use-case" || patLower === "use-cases" ||
                            patLower.startsWith("/uses/") || patLower.startsWith("/solutions/") || patLower.startsWith("/use-case/") || patLower.startsWith("/use-cases/") ||
                            patLower.startsWith("/teams/") ||
                            patLower.includes("/uses/*") || patLower.includes("/solutions/*") || patLower.includes("/use-case/*") || patLower.includes("/use-cases/*") ||
                            patLower.includes("/teams/*") ||
                            patParts.includes("uses") || patParts.includes("solutions") || patParts.includes("use-case") || patParts.includes("use-cases") ||
                            patParts.some(p => p.startsWith("use-case") || p.startsWith("solution") || p === "uses" || p === "teams");

    const matchesResource = patLower === "/resources" || patLower === "/resource" ||
                            patLower.startsWith("/resources/") || patLower.startsWith("/resource/") ||
                            patLower.includes("/resources/*") || patLower.includes("/resource/*") ||
                            patParts.includes("resources") || patParts.includes("resource") ||
                            hasResourceUrl;

    const matchesInteractiveTool = patLower.includes("calculator") || patLower.includes("tool") || patLower.includes("roi") || patLower.includes("estimator") ||
                                   hasInteractiveToolUrl;

    if (matchesProduct) {
      if (!final_schema || final_schema === "WebPage") {
        final_schema = "Product";
      }
      if (nameLower.includes("unknown") || nameLower === "template" || template_name === "N/A" || final_name === "General Page" || final_name === "General Informational Node") {
        final_name = "Product Detail Page";
      }
    } else if (matchesSolution) {
      if (!final_schema) {
        final_schema = "WebPage";
      }
      if (nameLower.includes("unknown") || nameLower === "template" || template_name === "N/A" || final_name === "General Page" || final_name === "General Informational Node") {
        final_name = "Solution / Use Case Page";
      }
    } else if (matchesResource) {
      if (!final_schema || final_schema === "WebPage") {
        final_schema = "Article";
      }
      if (nameLower.includes("unknown") || nameLower === "template" || template_name === "N/A" || final_name === "General Page" || final_name === "General Informational Node") {
        final_name = "Editorial Article / Post";
      }
    } else if (matchesInteractiveTool) {
      if (!final_schema) {
        final_schema = "WebPage";
      }
      if (nameLower.includes("unknown") || nameLower === "template" || template_name === "N/A" || final_name === "General Page" || final_name === "General Informational Node") {
        final_name = "Interactive Tool / ROI Calculator Page";
      }
    }

    const count = typeof item.count === "number" ? item.count : sample_urls.length;
    const all_matching_urls = Array.isArray(item.all_matching_urls) 
      ? item.all_matching_urls 
      : (Array.isArray(item.allMatchingUrls) ? item.allMatchingUrls : sample_urls);

    return {
      template_name: final_name,
      url_pattern,
      recommended_primary_schema: final_schema,
      sample_urls,
      count,
      all_matching_urls
    };
  }).filter((t): t is Template => t !== null);

  const postProcessTemplates = (rawTemplates: Template[]): Template[] => {
    const merged: Template[] = [];
    const templateMap = new Map<string, Template>();
    
    for (const t of rawTemplates) {
      if (!t) continue;
      let template_name = t.template_name || "Other";
      if (
        template_name.toLowerCase().includes("general informational node") || 
        template_name.toLowerCase() === "general page" || 
        template_name.toLowerCase() === "unknown" ||
        template_name.toLowerCase() === "unknown template"
      ) {
        template_name = "Other";
      }

      const key = template_name;
      if (templateMap.has(key)) {
        const existing = templateMap.get(key)!;
        
        if (t.url_pattern && !existing.url_pattern.includes(t.url_pattern) && t.url_pattern !== "N/A") {
          const existingParts = existing.url_pattern.split(", ");
          if (!existingParts.includes(t.url_pattern)) {
            if (existingParts.length < 3) {
              existing.url_pattern = `${existing.url_pattern}, ${t.url_pattern}`;
            } else if (existingParts.length === 3 && !existing.url_pattern.endsWith("...")) {
              existing.url_pattern = `${existing.url_pattern}, ...`;
            }
          }
        }
        
        existing.sample_urls = Array.from(new Set([...(existing.sample_urls || []), ...(t.sample_urls || [])])).slice(0, 6);
        existing.count = (existing.count || 0) + (t.count || 0);
        existing.all_matching_urls = Array.from(new Set([...(existing.all_matching_urls || []), ...(t.all_matching_urls || [])]));
      } else {
        const copy: Template = { 
          ...t, 
          template_name,
          sample_urls: t.sample_urls || [], 
          count: t.count || 0, 
          all_matching_urls: t.all_matching_urls || [] 
        };
        templateMap.set(key, copy);
        merged.push(copy);
      }
    }

    let homepageTemplate = merged.find(t => t.template_name === "Homepage / Brand Root");
    let otherTemplate = merged.find(t => t.template_name === "Other");

    let extraUrls: string[] = [];

    if (homepageTemplate) {
      const allUrls = homepageTemplate.all_matching_urls || [];
      if (allUrls.length > 1) {
        let primaryUrl = allUrls[0] || "";
        for (const u of allUrls) {
          if (u.length < primaryUrl.length) {
            primaryUrl = u;
          }
        }

        extraUrls = allUrls.filter((u: string) => u !== primaryUrl);
        homepageTemplate.all_matching_urls = [primaryUrl];
        homepageTemplate.sample_urls = [primaryUrl];
        homepageTemplate.count = 1;
      }
    }

    if (extraUrls.length > 0) {
      if (!otherTemplate) {
        otherTemplate = {
          template_name: "Other",
          url_pattern: "N/A",
          recommended_primary_schema: "WebPage",
          sample_urls: [],
          count: 0,
          all_matching_urls: []
        };
        merged.push(otherTemplate);
      }
      
      otherTemplate.all_matching_urls = Array.from(new Set([...(otherTemplate.all_matching_urls || []), ...extraUrls]));
      otherTemplate.sample_urls = Array.from(new Set([...(otherTemplate.sample_urls || []), ...extraUrls])).slice(0, 6);
      otherTemplate.count = (otherTemplate.count || 0) + extraUrls.length;
    }

    return merged;
  };

  const finalTemplates = postProcessTemplates(normalizedTemplates);

  const total_templates_discovered = finalTemplates.length;

  const reasoning = raw.reasoning || raw.Reasoning || raw.explanation || raw.analysis || "No analytical explanation was provided.";
  const executive_tldr = raw.executive_tldr || raw.executiveTldr || raw.summary || "No executive summary was provided.";

  return {
    domain_analyzed,
    total_templates_discovered,
    templates: finalTemplates,
    reasoning,
    executive_tldr
  };
};

export interface FolderItem {
  path: string;
  count: number;
  urls: string[];
  level: number;
}

export const getFolderStructure = (urlsText: string): FolderItem[] => {
  if (!urlsText.trim()) return [];
  const urlList = urlsText.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
  const folderMap = new Map<string, { path: string; count: number; urls: string[]; level: number }>();

  urlList.forEach(urlStr => {
    try {
      let pathname = "";
      if (urlStr.startsWith('/') || !urlStr.startsWith('http')) {
        // Handle relative URLs or simple paths safely
        pathname = urlStr.startsWith('/') ? urlStr : '/' + urlStr;
      } else {
        const parsed = new URL(urlStr);
        pathname = parsed.pathname;
      }
      
      const segments = pathname.split('/').filter(Boolean);

      // Add the root folder
      if (!folderMap.has('/')) {
        folderMap.set('/', { path: '/', count: 0, urls: [], level: 0 });
      }
      const rootFolder = folderMap.get('/')!;
      rootFolder.count += 1;
      if (rootFolder.urls.length < 50) rootFolder.urls.push(urlStr);

      // Build intermediate paths
      let currentPath = '';
      segments.forEach((seg, idx) => {
        currentPath += '/' + seg;
        const folderKey = currentPath + '/';
        const level = idx + 1;

        if (!folderMap.has(folderKey)) {
          folderMap.set(folderKey, { path: folderKey, count: 0, urls: [], level });
        }
        const folder = folderMap.get(folderKey)!;
        folder.count += 1;
        if (folder.urls.length < 50) folder.urls.push(urlStr);
      });
    } catch {
      // Ignore invalid URLs
    }
  });

  // Sort by level first, then by path alphabetically
  return Array.from(folderMap.values()).sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.path.localeCompare(b.path);
  });
};

export default function App() {
  const [urls, setUrls] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [discoveryUrl, setDiscoveryUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // --- Nav Menu Crawler & AI Template Architect States ---
  const [homepageUrl, setHomepageUrl] = useState("");
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawledLinks, setCrawledLinks] = useState<Array<{ text: string; url: string; category: string }>>([]);
  const [selectedCrawledLinks, setSelectedCrawledLinks] = useState<string[]>([]);
  const [isCrawlModalOpen, setIsCrawlModalOpen] = useState(false);
  const [menuAnalyzeResult, setMenuAnalyzeResult] = useState<AnalysisResult | null>(null);
  const [isMenuAnalyzing, setIsMenuAnalyzing] = useState(false);
  const [selectedTemplateForJsonLd, setSelectedTemplateForJsonLd] = useState<Template | null>(null);
  const [copiedJsonLd, setCopiedJsonLd] = useState(false);

  // --- Matching URLs Explore Modal States ---
  const [selectedExploreTemplate, setSelectedExploreTemplate] = useState<Template | null>(null);
  const [isExploreModalOpen, setIsExploreModalOpen] = useState(false);
  const [exploreSearchQuery, setExploreSearchQuery] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // --- Manual Pattern Injection & Folder Explorer States ---
  const [activeTab, setActiveTab] = useState<"templates" | "folders" | "nested_sitemap" | "menu_templates">("templates");
  const [customPattern, setCustomPattern] = useState("");
  const [isInjecting, setIsInjecting] = useState(false);
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [folderLevelFilter, setFolderLevelFilter] = useState<string>("all");
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");

  // --- Nested Sitemap Hierarchy Extractor States ---
  const [nestedInputUrls, setNestedInputUrls] = useState("");
  const [nestedMaxDepth, setNestedMaxDepth] = useState<number>(4);
  const [nestedMaxSitemaps, setNestedMaxSitemaps] = useState<number>(100);
  const [isExtractingNested, setIsExtractingNested] = useState(false);
  const [nestedExtractResult, setNestedExtractResult] = useState<{
    summary: {
      totalLevel1: number;
      totalRows: number;
      totalLeafUrls: number;
      durationMs: number;
    };
    rows: Array<{
      id: string;
      level1: string;
      level2?: string;
      level3?: string;
      level4?: string;
      type: 'sitemap' | 'url';
      childCount?: number;
      error?: string;
    }>;
    leafUrls: string[];
  } | null>(null);
  const [nestedSearchQuery, setNestedSearchQuery] = useState("");
  const [nestedLevelFilter, setNestedLevelFilter] = useState<string>("all");
  const [nestedCopySuccess, setNestedCopySuccess] = useState(false);
  const [nestedPushSuccess, setNestedPushSuccess] = useState(false);

  // --- Home Page & Domain Inspector States ---
  const [currentView, setCurrentView] = useState<"home" | "workspace">("home");
  const [homeAction, setHomeAction] = useState<"domain" | "menu">("domain");
  const [domainInput, setDomainInput] = useState("");
  const [isInspectingDomain, setIsInspectingDomain] = useState(false);
  const [inspectStatusStep, setInspectStatusStep] = useState("");
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectedDomainData, setInspectedDomainData] = useState<{
    domain: string;
    origin: string;
    robotsUrl: string;
    robotsFound: boolean;
    sitemapsFromRobots: string[];
    discoveredSitemapUrls: string[];
    sitemapDetails: Array<{
      url: string;
      isIndex: boolean;
      childCount: number;
      sampleChildren: string[];
      hasNestedSitemaps: boolean;
      leafUrlCount?: number;
      error?: string;
    }>;
    nestedSitemaps: string[];
    hasMultipleSitemaps: boolean;
    hasNestedSitemaps: boolean;
    totalNestedCount: number;
    configurationSummary: string;
    suggestedUrlsToCrawl: string[];
  } | null>(null);



  const [isFetching, setIsFetching] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistory[]>(() => {
    try {
      const saved = safeStorage.getItem('seoClarity_runHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((h: any) => {
            if (!h || typeof h !== 'object') return null;
            return {
              date: h.date || new Date().toISOString(),
              result: normalizeResult(h.result)
            };
          }).filter((item): item is RunHistory => item !== null);
        }
      }
    } catch (e) {
      // Ignore localStorage errors (e.g., restricted in iframes)
    }
    return [];
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isQuotaOpen, setIsQuotaOpen] = useState(false);
  const [quotaStats, setQuotaStats] = useState<QuotaStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const fetchQuotaStats = async () => {
    try {
      setIsStatsLoading(true);
      const res = await fetch("/api/quota-stats");
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        setQuotaStats(data);
      }
    } catch (e) {
      console.warn("Failed to fetch quota stats safely:", e);
    } finally {
      setIsStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotaStats();
    const interval = setInterval(fetchQuotaStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const [error, setError] = useState<string | null>(null);

  // Save history to local storage
  useEffect(() => {
    try {
      safeStorage.setItem('seoClarity_runHistory', JSON.stringify(runHistory));
    } catch (e) {
      // Ignore limit/security errors
    }
  }, [runHistory]);

  const addDiscoveryUrl = () => {
    if (!discoveryUrl.trim()) return;
    const cleanDiscovery = discoveryUrl
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n');
    
    if (!cleanDiscovery) return;

    const newUrls = urls.trim() ? `${urls}\n${cleanDiscovery}` : cleanDiscovery;
    setUrls(newUrls);
    setDiscoveryUrl("");
  };

  const handleGscUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const discoveredUrls: string[] = [];
      const lines = content.split(/\r?\n/);
      
      lines.forEach(line => {
        // Split by comma but respect quotes (basic CSV parsing)
        const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        cells.forEach(cell => {
          let cleanCell = cell.trim().replace(/^"|"$/g, '').trim();
          if (cleanCell.startsWith('http')) {
            discoveredUrls.push(cleanCell);
          }
        });
      });

      if (discoveredUrls.length > 0) {
        // Deduplicate and merge
        const existingUrls = urls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        const uniqueMerged = Array.from(new Set([...existingUrls, ...discoveredUrls]));
        setUrls(uniqueMerged.join('\n'));
      }
    };
    reader.readAsText(file);
  };

  // Parallel worker pool helper for client-side non-blocking request batches
  const mapConcurrent = async <T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> => {
    if (!items || items.length === 0) return [];
    const results: R[] = new Array(items.length);
    let index = 0;
    const workerCount = Math.min(concurrency, items.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const i = index++;
        try {
          results[i] = await fn(items[i], i);
        } catch (err: any) {
          results[i] = { error: err.message } as any;
        }
      }
    });
    await Promise.all(workers);
    return results;
  };

  const fetchSitemap = async () => {
    const sitemapUrls = sitemapUrl.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    if (sitemapUrls.length === 0) {
      setError("Please provide at least one sitemap URL.");
      return;
    }

    setIsFetching(true);
    setError(null);

    let allFetchedUrls: string[] = [];
    let errors: string[] = [];
    let indexFilesFound: string[] = [];

    try {
      // Execute multi-sitemap fetches in parallel with concurrency pool of 6
      await mapConcurrent(sitemapUrls, 6, async (url) => {
        try {
          const response = await fetch("/api/fetch-sitemap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });

          const data = await response.json();

          if (!response.ok) {
            errors.push(`${url}: ${data.error || "Failed to fetch"}`);
            return;
          }

          if (data.type === 'index') {
            indexFilesFound.push(url);
            if (Array.isArray(data.urls)) {
              allFetchedUrls.push(...data.urls);
            }
          } else {
            if (Array.isArray(data.urls)) {
              allFetchedUrls.push(...data.urls);
            }
          }
        } catch (err: any) {
          errors.push(`${url}: ${err.message}`);
        }
      });

      if (allFetchedUrls.length > 0) {
        const uniqueUrls = Array.from(new Set([...urls.split('\n').filter(l => l.trim()), ...allFetchedUrls])).join('\n');
        setUrls(uniqueUrls);
      }

      if (errors.length > 0) {
        setError(`Some sitemaps failed: ${errors.join('; ')}`);
      } else if (indexFilesFound.length > 0) {
        setError(`Detected ${indexFilesFound.length} Sitemap Index file(s). Sub-sitemaps have been added to the list.`);
      }
    } finally {
      setIsFetching(false);
    }
  };

  // --- Nested Sitemap Hierarchy Extractor Handlers ---

  const handleExtractNestedSitemap = async (inputUrlsOverride?: string) => {
    const rawText = inputUrlsOverride !== undefined ? inputUrlsOverride : (nestedInputUrls.trim() || sitemapUrl.trim());
    const urlsToExtract = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (urlsToExtract.length === 0) {
      setError("Please enter or paste at least one sitemap URL to extract.");
      return;
    }

    setIsExtractingNested(true);
    setError(null);
    setActiveTab("nested_sitemap");

    try {
      const response = await fetch("/api/extract-nested-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: urlsToExtract,
          maxDepth: nestedMaxDepth,
          maxSitemapsPerLevel: nestedMaxSitemaps
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to extract nested sitemap hierarchy.");
      }

      setNestedExtractResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to extract nested sitemap.");
    } finally {
      setIsExtractingNested(false);
    }
  };

  const handleInsertZillowExample = () => {
    const zillowUrls = [
      "https://www.zillow.com/xml/indexes/us/hdp/auction.xml.gz",
      "https://www.zillow.com/xml/indexes/us/hdp/pending.xml.gz",
      "https://www.zillow.com/xml/indexes/us/hdp/recently-sold.xml.gz",
      "https://www.zillow.com/xml/indexes/us/hdp/for-rent.xml.gz",
      "https://www.zillow.com/xml/indexes/us/hdp/off-market.xml.gz",
      "https://www.zillow.com/xml/indexes/us/hdp/other.xml.gz",
      "https://www.zillow.com/xml/indexes/us/bdp/buildings.xml.gz",
      "https://www.zillow.com/xml/indexes/us/bdp/apartments.xml.gz",
      "https://www.zillow.com/xml/indexes/us/cdp/index.xml",
      "https://www.zillow.com/xml/indexes/us/srp/for-sale.xml.gz"
    ].join("\n");

    setNestedInputUrls(zillowUrls);
  };

  const handleExportNestedCsv = () => {
    if (!nestedExtractResult || !nestedExtractResult.rows || nestedExtractResult.rows.length === 0) return;

    const headers = ["Level 1 URL (Column A)", "Level 2 URL (Column B)", "Level 3 URL (Column C)", "Level 4 URL (Column D)", "Type", "Child Count", "Status"];
    const csvLines = [headers.join(",")];

    nestedExtractResult.rows.forEach(row => {
      const l1 = `"${(row.level1 || "").replace(/"/g, '""')}"`;
      const l2 = `"${(row.level2 || "").replace(/"/g, '""')}"`;
      const l3 = `"${(row.level3 || "").replace(/"/g, '""')}"`;
      const l4 = `"${(row.level4 || "").replace(/"/g, '""')}"`;
      const type = `"${row.type || "sitemap"}"`;
      const count = row.childCount !== undefined ? row.childCount : "";
      const status = `"${row.error ? "Error: " + row.error : "OK"}"`;

      csvLines.push([l1, l2, l3, l4, type, count, status].join(","));
    });

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `nested_sitemap_extraction_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyNestedCsv = () => {
    if (!nestedExtractResult || !nestedExtractResult.rows) return;
    const headers = ["Level 1 (Column A)\tLevel 2 (Column B)\tLevel 3 (Column C)\tLevel 4 (Column D)\tType\tCount"];
    const lines = nestedExtractResult.rows.map(r => 
      `${r.level1 || ''}\t${r.level2 || ''}\t${r.level3 || ''}\t${r.level4 || ''}\t${r.type || ''}\t${r.childCount ?? ''}`
    );
    const fullText = [headers, ...lines].join("\n");
    navigator.clipboard.writeText(fullText);
    setNestedCopySuccess(true);
    setTimeout(() => setNestedCopySuccess(false), 2500);
  };

  const handlePushNestedLeafUrls = () => {
    if (!nestedExtractResult) return;
    const existing = urls.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const combined = Array.from(new Set([...existing, ...nestedExtractResult.leafUrls]));
    setUrls(combined.join("\n"));
    setNestedPushSuccess(true);
    setTimeout(() => setNestedPushSuccess(false), 2500);
  };

  const renderNestedSitemapExtractorView = () => (
    <div className="space-y-4 animate-fadeIn">
      {/* Header & Controls Card */}
      <div className="bg-white p-6 rounded-2xl border border-navy/10 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Network className="w-5 h-5 text-[#2563EB]" />
              <h3 className="text-lg font-bold font-heading text-slate-text">Nested Sitemap Hierarchy Extractor</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Recursively crawls sitemap index files (like Zillow, Amazon, news publishers) to map Level 1, Level 2, Level 3, Level 4 sub-sitemaps into clean grid columns.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleInsertZillowExample}
              className="px-3.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Insert Zillow Example Sitemaps
            </button>
            {nestedInputUrls && (
              <button
                onClick={() => setNestedInputUrls("")}
                className="px-3 py-1.5 bg-white border border-navy/10 text-gray-500 hover:text-navy rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
            Root Sitemap / Index URLs (one per line):
          </label>
          <textarea
            value={nestedInputUrls}
            onChange={(e) => setNestedInputUrls(e.target.value)}
            placeholder="Paste sitemap index URLs here (e.g. https://www.zillow.com/xml/indexes/us/hdp/auction.xml.gz or https://domain.com/sitemap_index.xml)..."
            className="w-full h-28 p-3 bg-cloud-dancer/50 border border-navy/10 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all resize-none"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Max Crawl Depth:</span>
                <select
                  value={nestedMaxDepth}
                  onChange={(e) => setNestedMaxDepth(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-cloud-dancer/50 border border-navy/10 rounded-lg text-xs font-bold text-slate-text outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                >
                  <option value={2}>Level 2 (L1 -&gt; L2)</option>
                  <option value={3}>Level 3 (L1 -&gt; L2 -&gt; L3)</option>
                  <option value={4}>Level 4 (L1 -&gt; L2 -&gt; L3 -&gt; L4)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Max Sub-Sitemaps/Lvl:</span>
                <select
                  value={nestedMaxSitemaps}
                  onChange={(e) => setNestedMaxSitemaps(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-cloud-dancer/50 border border-navy/10 rounded-lg text-xs font-bold text-slate-text outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                >
                  <option value={50}>50 per level</option>
                  <option value={100}>100 per level</option>
                  <option value={250}>250 per level</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => handleExtractNestedSitemap()}
              disabled={isExtractingNested || !(nestedInputUrls.trim() || sitemapUrl.trim())}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
            >
              {isExtractingNested ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
              {isExtractingNested ? "Extracting Hierarchy..." : "Extract Sitemap Hierarchy"}
            </button>
          </div>
        </div>
      </div>

      {/* Results Stats Bar & Table */}
      {nestedExtractResult && (
        <div className="space-y-4">
          {/* Stats summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-navy/10 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Level 1 Roots</p>
              <p className="text-xl font-bold font-heading text-slate-text mt-1">{nestedExtractResult.summary.totalLevel1}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-navy/10 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Hierarchy Rows</p>
              <p className="text-xl font-bold font-heading text-[#2563EB] mt-1">{nestedExtractResult.summary.totalRows.toLocaleString()}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-navy/10 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Leaf Page URLs</p>
              <p className="text-xl font-bold font-heading text-emerald-600 mt-1">{nestedExtractResult.summary.totalLeafUrls.toLocaleString()}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-navy/10 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Crawl Speed</p>
              <p className="text-xl font-bold font-heading text-slate-text mt-1">{(nestedExtractResult.summary.durationMs / 1000).toFixed(1)}s</p>
            </div>
          </div>

          {/* Filter and Export Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-navy/10 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto flex-1">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  value={nestedSearchQuery}
                  onChange={(e) => setNestedSearchQuery(e.target.value)}
                  placeholder="Search level URLs..."
                  className="w-full pl-9 pr-4 py-2 bg-cloud-dancer/50 border border-navy/10 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] font-mono transition-all"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <ListFilter className="w-3.5 h-3.5 text-gray-400" />
                <select
                  value={nestedLevelFilter}
                  onChange={(e) => setNestedLevelFilter(e.target.value)}
                  className="px-2.5 py-2 bg-cloud-dancer/50 border border-navy/10 rounded-xl text-xs font-bold text-slate-text outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                >
                  <option value="all">All Level Rows</option>
                  <option value="1">Level 1 Only</option>
                  <option value="2">Level 2 Only</option>
                  <option value="3">Level 3 Only</option>
                  <option value="4">Level 4+ Only</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end">
              <button
                onClick={handleExportNestedCsv}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export to .CSV
              </button>
              <button
                onClick={handleCopyNestedCsv}
                className="px-3.5 py-2 bg-white border border-navy/10 hover:border-navy text-slate-text rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {nestedCopySuccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                {nestedCopySuccess ? "Copied!" : "Copy Grid"}
              </button>
              {nestedExtractResult.leafUrls.length > 0 && (
                <button
                  onClick={handlePushNestedLeafUrls}
                  className="px-3.5 py-2 bg-blue-50 border border-blue-200 text-[#2563EB] hover:bg-blue-100 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {nestedPushSuccess ? "Sent to Analyzer!" : "Send URLs to Template Analyzer"}
                </button>
              )}
            </div>
          </div>

          {/* Data Grid Table */}
          <div className="bg-white p-6 rounded-2xl border border-navy/10 shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-navy/10 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <th className="px-2 py-3 w-12 text-center">#</th>
                  <th className="px-3 py-3 w-[26%]">Level 1 (Column A)</th>
                  <th className="px-3 py-3 w-[26%]">Level 2 (Column B)</th>
                  <th className="px-3 py-3 w-[24%]">Level 3 (Column C)</th>
                  <th className="px-3 py-3 w-[24%]">Level 4 (Column D)</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = nestedExtractResult.rows.filter(row => {
                    if (nestedSearchQuery.trim()) {
                      const q = nestedSearchQuery.toLowerCase().trim();
                      const match =
                        (row.level1 || "").toLowerCase().includes(q) ||
                        (row.level2 || "").toLowerCase().includes(q) ||
                        (row.level3 || "").toLowerCase().includes(q) ||
                        (row.level4 || "").toLowerCase().includes(q);
                      if (!match) return false;
                    }
                    if (nestedLevelFilter === "1") return Boolean(row.level1) && !row.level2;
                    if (nestedLevelFilter === "2") return Boolean(row.level2) && !row.level3;
                    if (nestedLevelFilter === "3") return Boolean(row.level3) && !row.level4;
                    if (nestedLevelFilter === "4") return Boolean(row.level4);
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-400 text-xs font-mono">
                          No nested sitemaps match your current search or level filter criteria.
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((row, idx) => (
                    <tr key={idx} className="border-b border-navy/10 last:border-0 hover:bg-cloud-dancer/30 transition-colors text-xs font-mono">
                      <td className="px-2 py-3 text-center text-gray-400 font-sans text-[11px]">{idx + 1}</td>
                      <td className="px-3 py-3">
                        {row.level1 ? (
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="truncate text-slate-text select-all" title={row.level1}>{row.level1}</span>
                            <a href={row.level1} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#2563EB] shrink-0">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3">
                        {row.level2 ? (
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="truncate text-slate-text select-all" title={row.level2}>{row.level2}</span>
                            {row.level2.startsWith("http") && (
                              <a href={row.level2} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#2563EB] shrink-0">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3">
                        {row.level3 ? (
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="truncate text-slate-text select-all" title={row.level3}>{row.level3}</span>
                            {row.level3.startsWith("http") && (
                              <a href={row.level3} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#2563EB] shrink-0">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3">
                        {row.level4 ? (
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="truncate text-slate-text select-all" title={row.level4}>{row.level4}</span>
                            {row.level4.startsWith("http") && (
                              <a href={row.level4} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#2563EB] shrink-0">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // --- New Nav Menu Crawler & Gap Audit Actions ---

  const handleCrawlMenu = async () => {
    if (!homepageUrl.trim()) {
      setError("Please provide a domain or homepage URL.");
      return;
    }

    setIsCrawling(true);
    setError(null);
    setCrawledLinks([]);

    try {
      const response = await fetch("/api/crawl-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: homepageUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to crawl homepage menu.");
      }

      setCrawledLinks(data.links || []);
      // Automatically select all discovered links by default
      if (Array.isArray(data.links)) {
        setSelectedCrawledLinks(data.links.map((l: any) => l.url));
      }
      setIsCrawlModalOpen(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to crawl page navigation menu.");
    } finally {
      setIsCrawling(false);
    }
  };

  const addSelectedCrawledLinks = () => {
    if (selectedCrawledLinks.length === 0) return;
    
    const existingUrls = urls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    const uniqueMerged = Array.from(new Set([...existingUrls, ...selectedCrawledLinks]));
    setUrls(uniqueMerged.join('\n'));
    
    setIsCrawlModalOpen(false);
    setSelectedCrawledLinks([]);
  };

  const toggleLinkSelection = (url: string) => {
    if (selectedCrawledLinks.includes(url)) {
      setSelectedCrawledLinks(selectedCrawledLinks.filter(u => u !== url));
    } else {
      setSelectedCrawledLinks([...selectedCrawledLinks, url]);
    }
  };

  const handleCrawlAndAnalyzeMenu = async (overrideUrl?: string) => {
    const targetUrl = overrideUrl || homepageUrl;
    if (!targetUrl.trim() && crawledLinks.length === 0) {
      setError("Please provide a domain or homepage URL (e.g. truist.com).");
      return;
    }

    setIsMenuAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze-menu-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homepageUrl: targetUrl,
          links: crawledLinks.length > 0 ? crawledLinks : undefined
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze menu templates.");
      }

      setMenuAnalyzeResult(data);
      setActiveTab("menu_templates");
      setIsCrawlModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze menu templates.");
    } finally {
      setIsMenuAnalyzing(false);
    }
  };

  const renderMenuTemplatesView = () => {
    if (!menuAnalyzeResult && !isMenuAnalyzing) {
      return (
        <div className="bg-white p-8 rounded-2xl border border-navy/10 shadow-sm text-center space-y-4 my-6">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 text-[#2563EB]">
            <Compass className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-text uppercase tracking-wide">
              Nav Menu & AI Template Architect
            </h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 leading-relaxed">
              Scan homepage navigation menus (e.g. <strong>truist.com</strong>, <strong>chase.com</strong>), identify industry page templates, and generate tailor-made Schema.org markup.
            </p>
          </div>
          <div className="max-w-md mx-auto flex gap-2 pt-2">
            <input
              type="text"
              value={homepageUrl}
              onChange={(e) => setHomepageUrl(e.target.value)}
              placeholder="e.g. truist.com or https://truist.com"
              className="flex-1 p-2.5 bg-cloud-dancer rounded-xl border border-navy/10 focus:ring-2 focus:ring-[#2563EB]/20 outline-none text-xs font-medium"
            />
            <button
              onClick={() => handleCrawlAndAnalyzeMenu()}
              disabled={isMenuAnalyzing || !homepageUrl.trim()}
              className="px-5 py-2.5 bg-[#2563EB] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#1D4ED8] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
            >
              {isMenuAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isMenuAnalyzing ? "Analyzing Menu..." : "Architect Schema"}
            </button>
          </div>
        </div>
      );
    }

    if (isMenuAnalyzing) {
      return (
        <div className="py-16 text-center space-y-4">
          <div className="relative inline-block">
            <div className="w-16 h-16 border-4 border-blue-100 border-t-[#2563EB] rounded-full animate-spin" />
            <Sparkles className="w-6 h-6 text-[#2563EB] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <h3 className="text-xl font-bold font-heading text-slate-text">Architecting Schema for Navigation Hierarchy</h3>
          <p className="text-xs text-gray-500 animate-pulse font-medium">Crawling menu links, identifying industry page templates, and mapping Schema.org types...</p>
        </div>
      );
    }

    if (!menuAnalyzeResult) return null;

    return (
      <div className="space-y-6 animate-fadeIn my-6">
        {/* Header Bar */}
        <div className="bg-white p-6 rounded-2xl border border-navy/10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[10px] font-black text-[#2563EB] uppercase tracking-widest bg-blue-50 border border-blue-200 px-3 py-1 rounded-full flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-[#2563EB]" />
                Domain: {menuAnalyzeResult.domain_analyzed}
              </span>
              {menuAnalyzeResult.industry_vertical && (
                <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest bg-lemon-icing/40 border border-lemon-icing/60 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-amber-700" />
                  Vertical: {menuAnalyzeResult.industry_vertical}
                </span>
              )}
              {menuAnalyzeResult.industry_schema_doc_link && (
                <a
                  href={menuAnalyzeResult.industry_schema_doc_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50/80 px-2.5 py-1 rounded-full border border-blue-100 flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                  Schema Docs
                </a>
              )}
            </div>
            <h2 className="text-2xl font-bold font-heading text-slate-text">
              Homepage Navigation & Majority Template Architecture
            </h2>
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Extracted from {menuAnalyzeResult.crawled_menu_link_count || 0} homepage navigation links • {menuAnalyzeResult.total_templates_discovered} majority page templates identified
            </p>
          </div>

          <button
            onClick={() => handleCrawlAndAnalyzeMenu()}
            disabled={isMenuAnalyzing}
            className="px-4 py-2.5 bg-cloud-dancer border border-navy/10 text-slate-text hover:bg-gray-200 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer self-start md:self-auto shrink-0"
          >
            {isMenuAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-run Menu Audit
          </button>
        </div>

        {/* TLDR & ELI5 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-navy/10 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 rounded-md">
                <FileText className="w-4 h-4 text-[#2563EB]" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest text-[#2563EB]">Executive TLDR</h4>
            </div>
            <p className="text-xs text-slate-text leading-relaxed font-medium">
              {menuAnalyzeResult.executive_tldr}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-navy/10 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100 rounded-md">
                <HelpCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest text-emerald-700">ELI5 Summary</h4>
            </div>
            <p className="text-xs text-slate-text leading-relaxed font-medium">
              {menuAnalyzeResult.eli5_summary || "We scanned the main navigation menu, isolated the core layout patterns, and generated ready-to-implement JSON-LD schema snippets to boost SERP rich results."}
            </p>
          </div>
        </div>

        {/* Majority Templates Roster */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-text font-heading flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2563EB]" />
              Majority Page Templates & Recommended Schema ({menuAnalyzeResult.templates?.length || 0})
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {menuAnalyzeResult.templates?.map((tmpl, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl border border-navy/10 shadow-sm hover:shadow-md transition-all space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-navy/5 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-black font-heading text-slate-text">
                        {tmpl.template_name}
                      </span>
                      <span className="px-2.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-700 rounded-md font-mono text-[11px] font-bold">
                        {tmpl.url_pattern}
                      </span>
                    </div>
                    {tmpl.share_percentage !== undefined && (
                      <div className="flex items-center gap-3 pt-1">
                        <div className="w-32 bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#2563EB] h-full rounded-full"
                            style={{ width: `${Math.min(100, Math.max(5, tmpl.share_percentage))}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-gray-500">
                          {tmpl.share_percentage}% of nav structure ({tmpl.count || 'Multi-page'} pages)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <span className="px-3 py-1 bg-blue-50 border border-blue-200 text-[#2563EB] font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB]" />
                      Schema: @type "{tmpl.recommended_primary_schema}"
                    </span>
                    <button
                      onClick={() => setSelectedTemplateForJsonLd(tmpl)}
                      className="px-4 py-2 bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Code className="w-3.5 h-3.5" />
                      View JSON-LD Code
                    </button>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Secondary Schemas & Rich Results */}
                  <div className="space-y-2 bg-[#FAFAFA] p-3.5 rounded-xl border border-navy/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Target Search Features & Rich Snippets</span>
                    <p className="font-bold text-slate-text">
                      {tmpl.target_rich_results || "Google Search Knowledge Graph, SERP Enhancements"}
                    </p>

                    {tmpl.secondary_schemas && tmpl.secondary_schemas.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Secondary / Nested Schemas</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {tmpl.secondary_schemas.map((sec, i) => (
                            <span key={i} className="px-2 py-0.5 bg-white border border-navy/10 text-slate-text text-[10px] font-bold rounded-md">
                              {sec}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Required Properties */}
                  <div className="space-y-2 bg-[#FAFAFA] p-3.5 rounded-xl border border-navy/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Required & Recommended Schema Properties</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {(tmpl.required_schema_properties || ["name", "description", "url", "publisher"]).map((prop, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-50 text-[#1E3A8A] border border-blue-100 text-[10px] font-mono font-bold rounded-md">
                          {prop}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sample URLs */}
                {tmpl.sample_urls && tmpl.sample_urls.length > 0 && (
                  <div className="pt-2 border-t border-navy/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1.5">Sample URLs Identified</span>
                    <div className="flex flex-wrap gap-2">
                      {tmpl.sample_urls.slice(0, 4).map((sample, sIdx) => (
                        <a
                          key={sIdx}
                          href={sample}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-mono text-blue-600 hover:text-blue-800 bg-cloud-dancer/60 px-2.5 py-1 rounded-lg border border-navy/5 truncate max-w-xs flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{sample}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chain-of-Thought Reasoning Box */}
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-navy/10 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-raindrops/30 rounded-md">
              <Sparkles className="w-4 h-4 text-navy" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#FF8800] font-heading">
              AI Schema Architecture Reasoning (Why)
            </h3>
          </div>
          <p className="text-xs text-slate-text leading-relaxed font-medium whitespace-pre-wrap">
            {menuAnalyzeResult.reasoning}
          </p>
        </div>
      </div>
    );
  };



  const analyzeSitemap = async () => {
    if (!urls.trim()) {
      setError("Please provide at least one URL.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    // Token Limit Protection: Sample URLs if the list is too long
    const allUrls = urls.split('\n').filter(l => l.trim());
    const MAX_URLS_FOR_ANALYSIS = 2000;
    
    // Sort all URLs alphabetically so that sampling is 100% deterministic
    const sortedAllUrls = [...allUrls].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    let sampledUrls = sortedAllUrls;
    let isTruncated = false;

    if (sortedAllUrls.length > MAX_URLS_FOR_ANALYSIS) {
      // Find the homepage if it exists to ensure it's always analyzed
      const homePage = sortedAllUrls.find(u => {
        try {
          const url = new URL(u);
          return url.pathname === '/' || url.pathname === '';
        } catch {
          return false;
        }
      });

      // Take a representative sample: first 1000 and last 1000 alphabetic
      const firstPart = sortedAllUrls.slice(0, 1000);
      const lastPart = sortedAllUrls.slice(-1000);
      
      sampledUrls = [...firstPart, ...lastPart];
      
      // Ensure homepage is in the sample if we found one
      if (homePage && !sampledUrls.includes(homePage)) {
        sampledUrls.unshift(homePage);
      }
      
      isTruncated = true;
    }

    const urlsToAnalyze = sampledUrls.join('\n');

    try {
      const response = await fetch('/api/analyze-urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ urlsToAnalyze })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to fetch the analysis API';
        try {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } catch { }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const normalizedData = normalizeResult(data);
      setResult(normalizedData);
      setRunHistory(prev => [{ date: new Date().toISOString(), result: normalizedData }, ...prev]);
      
      if (isTruncated) {
        setError(`Note: Analyzed a representative sample of ${MAX_URLS_FOR_ANALYSIS} URLs out of ${allUrls.length.toLocaleString()} total to stay within processing limits.`);
      }
    } catch (err: any) {
      console.error("Analysis failed:", err);
      if (err.message?.includes("token count exceeds")) {
        setError("The URL list is too large for the AI to process at once. I've tried to sample it, but it's still too big. Try reducing the list manually.");
      } else {
        setError(err.message || "Failed to analyze URLs. Please check your input and try again.");
      }
    } finally {
      setIsAnalyzing(false);
      fetchQuotaStats();
    }
  };

  const handleInjectCustomPattern = async (patternToInject?: string) => {
    const pat = (patternToInject || customPattern).trim();
    if (!pat) {
      setError("Please specify a valid URL pattern.");
      return;
    }

    setIsInjecting(true);
    setError(null);

    try {
      const response = await fetch("/api/detect-custom-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: pat,
          domain: result?.domain_analyzed || "unknown-domain.com",
          urls: urls
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to detect pattern page type.");
      }

      if (result) {
        const templates = result.templates || [];
        const exists = templates.some(t => t.url_pattern.toLowerCase() === data.url_pattern.toLowerCase());
        
        let updatedTemplates = [...templates];
        if (exists) {
          updatedTemplates = templates.map(t => 
            t.url_pattern.toLowerCase() === data.url_pattern.toLowerCase() ? data : t
          );
        } else {
          updatedTemplates = [data, ...templates];
        }

        const updatedResult = {
          ...result,
          total_templates_discovered: updatedTemplates.length,
          templates: updatedTemplates
        };

        setResult(updatedResult);
        setRunHistory(prev => {
          if (prev.length > 0) {
            const updatedHistory = [...prev];
            updatedHistory[0] = {
              ...updatedHistory[0],
              result: updatedResult
            };
            return updatedHistory;
          }
          return prev;
        });

        if (!patternToInject) {
          setCustomPattern("");
        }
      } else {
        const bootstrappedResult: AnalysisResult = {
          domain_analyzed: "custom-injection.com",
          total_templates_discovered: 1,
          templates: [data],
          reasoning: "Custom manual pattern injected by user.",
          executive_tldr: "Custom page type added manually."
        };
        setResult(bootstrappedResult);
        setRunHistory(prev => [{ date: new Date().toISOString(), result: bootstrappedResult }, ...prev]);
        
        if (!patternToInject) {
          setCustomPattern("");
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to inject and auto-detect template.");
    } finally {
      setIsInjecting(false);
    }
  };

  const handleRemoveTemplate = (patternToRemove: string) => {
    if (!result) return;
    const templates = result.templates || [];
    const updatedTemplates = templates.filter(t => t.url_pattern !== patternToRemove);
    const updatedResult = {
      ...result,
      total_templates_discovered: updatedTemplates.length,
      templates: updatedTemplates
    };
    setResult(updatedResult);
    setRunHistory(prev => {
      if (prev.length > 0) {
        const updatedHistory = [...prev];
        updatedHistory[0] = {
          ...updatedHistory[0],
          result: updatedResult
        };
        return updatedHistory;
      }
      return prev;
    });
  };

  const copyToClipboard = (text: string) => {
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(err => {
        console.error("Failed to copy text: ", err);
      });
    } else {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.domain_analyzed || 'analysis'}-schema-templates.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    if (!result) return;
    
    // Define CSV headers
    const headers = ["Template Name", "URL Pattern", "Recommended Schema", "Sample URLs"];
    
    // Process rows
    const templates = Array.isArray(result.templates) ? result.templates : [];
    const rows = templates.map(t => [
      `"${(t.template_name || '').replace(/"/g, '""')}"`,
      `"${(t.url_pattern || '').replace(/"/g, '""')}"`,
      `"${(t.recommended_primary_schema || '').replace(/"/g, '""')}"`,
      `"${(Array.isArray(t.sample_urls) ? t.sample_urls : []).join('; ').replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.domain_analyzed || 'analysis'}-schema-templates.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleInspectDomain = async (targetDomain?: string) => {
    const dom = (targetDomain || domainInput).trim();
    if (!dom) {
      setInspectError("Please enter a domain name.");
      return;
    }
    setDomainInput(dom);
    setIsInspectingDomain(true);
    setInspectError(null);
    setInspectedDomainData(null);
    setInspectStatusStep(`Inspecting ${dom.replace(/^https?:\/\//, '')}/robots.txt...`);

    try {
      const response = await fetch("/api/inspect-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: dom })
      });

      const data = await response.json();

      if (!response.ok) {
        setInspectError(data.error || "Failed to inspect domain.");
        return;
      }

      setInspectedDomainData(data);
    } catch (err: any) {
      setInspectError(err.message || "Failed to connect to domain inspection service.");
    } finally {
      setIsInspectingDomain(false);
      setInspectStatusStep("");
    }
  };

  const handleConfirmConfiguration = async () => {
    if (!inspectedDomainData) return;

    setCurrentView("workspace");
    setActiveTab("templates");
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    // Pick discovered sitemaps or nested child sitemaps
    const sitemapsToFetch = inspectedDomainData.nestedSitemaps && inspectedDomainData.nestedSitemaps.length > 0
      ? inspectedDomainData.nestedSitemaps.slice(0, 15)
      : (inspectedDomainData.discoveredSitemapUrls || []);

    setSitemapUrl(sitemapsToFetch.join("\n"));

    let allFetchedUrls: string[] = [];

    try {
      // Parallel fetch with concurrency pool of 4
      await mapConcurrent(sitemapsToFetch.slice(0, 8), 4, async (smUrl) => {
        try {
          const res = await fetch("/api/fetch-sitemap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: smUrl })
          });
          const d = await res.json();
          if (res.ok && Array.isArray(d.urls)) {
            allFetchedUrls.push(...d.urls);
          }
        } catch {
          // Ignore individual fetch errors
        }
      });

      const uniqueUrls = Array.from(new Set(allFetchedUrls));
      if (uniqueUrls.length > 0) {
        setUrls(uniqueUrls.join("\n"));
        // Analyze extracted URLs
        const sampledUrls = uniqueUrls.slice(0, 2000);
        const res = await fetch("/api/analyze-urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urlsToAnalyze: sampledUrls.join("\n") })
        });
        const data = await res.json();
        if (res.ok) {
          const normalized = normalizeResult(data);
          setResult(normalized);
          setRunHistory(prev => [{ date: new Date().toISOString(), result: normalized }, ...prev]);
        } else {
          setError(data.error || "Analysis failed.");
        }
      } else {
        // Fallback: If sitemaps had no direct URLs or were blocked, feed the sitemap URLs themselves
        if (sitemapsToFetch.length > 0) {
          setUrls(sitemapsToFetch.join("\n"));
          const res = await fetch("/api/analyze-urls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urlsToAnalyze: sitemapsToFetch.join("\n") })
          });
          const data = await res.json();
          if (res.ok) {
            const normalized = normalizeResult(data);
            setResult(normalized);
            setRunHistory(prev => [{ date: new Date().toISOString(), result: normalized }, ...prev]);
          }
        } else {
          setError("No URLs could be extracted. You can paste URLs or use Direct Site Menu Crawler.");
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to complete analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderHomePage = () => {
    return (
      <div className="flex-1 bg-[#FAF9F5] overflow-y-auto px-4 py-12 flex flex-col items-center justify-start">
        <div className="w-full max-w-xl flex flex-col items-center text-center">
          
          {/* Main Question - Claude style */}
          <h1 className="text-2xl sm:text-3xl font-heading font-medium text-slate-900 tracking-tight mb-8">
            What would you like to do?
          </h1>

          {/* Two Big Buttons! */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-6">
            {/* Big Button 1: Enter your domain */}
            <button
              onClick={() => {
                setHomeAction("domain");
                setInspectError(null);
              }}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                homeAction === "domain"
                  ? "border-[#2563EB] bg-white ring-2 ring-[#2563EB]/10 shadow-sm"
                  : "border-navy/10 bg-white hover:border-navy/30 hover:shadow-sm"
              }`}
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#2563EB] mb-3">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="font-bold text-sm text-slate-800 font-heading">
                  Enter your domain
                </div>
                <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Auto-fetch robots.txt & discover nested sitemaps
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1 text-[11px] font-bold text-[#2563EB]">
                <span>Start with domain</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </button>

            {/* Big Button 2: Scan navigation menu */}
            <button
              onClick={() => {
                setHomeAction("menu");
                setInspectError(null);
              }}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                homeAction === "menu"
                  ? "border-[#2563EB] bg-white ring-2 ring-[#2563EB]/10 shadow-sm"
                  : "border-navy/10 bg-white hover:border-navy/30 hover:shadow-sm"
              }`}
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
                  <Compass className="w-5 h-5" />
                </div>
                <div className="font-bold text-sm text-slate-800 font-heading">
                  Scan navigation menu
                </div>
                <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Crawl header & footer navigation structure
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1 text-[11px] font-bold text-indigo-600">
                <span>Crawl nav menus</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>

          {/* Action Interface Area */}
          {homeAction === "domain" && (
            <div className="w-full space-y-4">
              {!inspectedDomainData ? (
                <div className="bg-white border border-navy/10 rounded-2xl p-5 shadow-sm text-left space-y-3">
                  <label className="text-xs font-bold text-slate-700 block">
                    Domain
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={domainInput}
                      onChange={(e) => setDomainInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInspectDomain()}
                      placeholder="e.g. asana.com, truist.com, or zillow.com"
                      className="flex-grow px-4 py-2.5 bg-cloud-dancer/50 border border-navy/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] font-medium transition-all"
                    />
                    <button
                      onClick={() => handleInspectDomain()}
                      disabled={isInspectingDomain || !domainInput.trim()}
                      className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
                    >
                      {isInspectingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      {isInspectingDomain ? "Fetching robots.txt..." : "Inspect Domain"}
                    </button>
                  </div>

                  {/* Quick try options */}
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-gray-400">
                    <span>Quick try:</span>
                    <button
                      onClick={() => { setDomainInput("asana.com"); handleInspectDomain("asana.com"); }}
                      className="px-2 py-0.5 bg-cloud-dancer hover:bg-gray-200 rounded text-navy font-semibold transition-colors cursor-pointer"
                    >
                      asana.com
                    </button>
                    <button
                      onClick={() => { setDomainInput("truist.com"); handleInspectDomain("truist.com"); }}
                      className="px-2 py-0.5 bg-cloud-dancer hover:bg-gray-200 rounded text-navy font-semibold transition-colors cursor-pointer"
                    >
                      truist.com
                    </button>
                    <button
                      onClick={() => { setDomainInput("zillow.com"); handleInspectDomain("zillow.com"); }}
                      className="px-2 py-0.5 bg-cloud-dancer hover:bg-gray-200 rounded text-navy font-semibold transition-colors cursor-pointer"
                    >
                      zillow.com
                    </button>
                  </div>

                  {isInspectingDomain && (
                    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 p-3 rounded-xl animate-fadeIn">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                      <span>{inspectStatusStep || "Fetching {domain.com}/robots.txt & resolving sitemaps..."}</span>
                    </div>
                  )}

                  {inspectError && (
                    <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 p-3 rounded-xl animate-fadeIn">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{inspectError}</span>
                    </div>
                  )}
                </div>
              ) : (
                /* The Configuration Prompt Card */
                <div className="bg-white border border-blue-200 rounded-2xl p-6 shadow-sm text-left space-y-4 animate-fadeIn">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block mb-1">
                        Configuration Detected
                      </span>
                      <h3 className="text-base font-bold text-slate-800 font-heading">
                        Would you like to continue with this configuration?
                      </h3>
                    </div>
                    <button
                      onClick={() => { setInspectedDomainData(null); }}
                      className="text-xs text-gray-400 hover:text-navy cursor-pointer"
                    >
                      Change
                    </button>
                  </div>

                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-2.5 text-xs text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-medium">Target Domain:</span>
                      <span className="font-mono font-bold text-navy">{inspectedDomainData.domain}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-medium">Robots.txt rule:</span>
                      <span className="font-mono text-slate-600">
                        {inspectedDomainData.robotsFound ? (
                          <span className="text-[#059669] font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            {inspectedDomainData.domain}/robots.txt
                          </span>
                        ) : (
                          <span className="text-gray-500">None found (fallback to sitemap.xml)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 font-medium">Discovered Sitemaps:</span>
                      <span className="font-bold text-navy">
                        {inspectedDomainData.discoveredSitemapUrls.length} root sitemap(s)
                      </span>
                    </div>
                    {inspectedDomainData.hasNestedSitemaps && (
                      <div className="pt-1 border-t border-blue-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-gray-500 font-medium">Nested sitemaps identified:</span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[11px]">
                            {inspectedDomainData.totalNestedCount} nested sub-sitemaps
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                          {inspectedDomainData.nestedSitemaps.slice(0, 8).map((sm, i) => (
                            <span key={i} className="font-mono text-[10px] bg-white border border-blue-200 px-2 py-0.5 rounded text-gray-600 truncate max-w-[200px]" title={sm}>
                              {sm.split('/').pop() || sm}
                            </span>
                          ))}
                          {inspectedDomainData.nestedSitemaps.length > 8 && (
                            <span className="text-[10px] text-gray-400 self-center">
                              +{inspectedDomainData.nestedSitemaps.length - 8} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                    <button
                      onClick={handleConfirmConfiguration}
                      disabled={isAnalyzing}
                      className="w-full sm:flex-1 py-3 px-5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      {isAnalyzing ? "Crawling & Analyzing..." : "Continue with this configuration"}
                    </button>
                    <button
                      onClick={() => { setInspectedDomainData(null); }}
                      className="w-full sm:w-auto py-3 px-4 bg-white border border-navy/10 text-slate-700 hover:bg-cloud-dancer font-bold text-xs rounded-xl transition-colors cursor-pointer text-center"
                    >
                      Change domain
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {homeAction === "menu" && (
            <div className="w-full bg-white border border-navy/10 rounded-2xl p-5 shadow-sm text-left space-y-3">
              <label className="text-xs font-bold text-slate-700 block">
                Website Homepage
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={homepageUrl}
                  onChange={(e) => setHomepageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && homepageUrl.trim()) {
                      setCurrentView("workspace");
                      setActiveTab("menu_templates");
                      handleCrawlAndAnalyzeMenu();
                    }
                  }}
                  placeholder="e.g. truist.com or https://truist.com"
                  className="flex-grow px-4 py-2.5 bg-cloud-dancer/50 border border-navy/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] font-medium transition-all"
                />
                <button
                  onClick={() => {
                    setCurrentView("workspace");
                    setActiveTab("menu_templates");
                    handleCrawlAndAnalyzeMenu();
                  }}
                  disabled={isMenuAnalyzing || !homepageUrl.trim()}
                  className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
                >
                  {isMenuAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isMenuAnalyzing ? "Analyzing..." : "Scan & Architect"}
                </button>
              </div>
              <div className="flex items-center gap-2 pt-1 text-[11px] text-gray-400">
                <span>Quick try:</span>
                <button
                  onClick={() => {
                    setHomepageUrl("https://www.truist.com");
                  }}
                  className="px-2 py-0.5 bg-cloud-dancer hover:bg-gray-200 rounded text-navy font-semibold transition-colors cursor-pointer"
                >
                  truist.com
                </button>
              </div>
            </div>
          )}

          {/* Quick link to workspace */}
          <div className="mt-4">
            <button
              onClick={() => setCurrentView("workspace")}
              className="text-xs text-gray-400 hover:text-navy transition-colors cursor-pointer"
            >
              Or enter URLs or sitemaps manually in workspace &rarr;
            </button>
          </div>

          {/* Section below: Other tools in workflow */}
          <div className="mt-14 pt-8 border-t border-navy/10 w-full text-left">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 font-sans">
              Other tools in workflow
            </h3>
            <div className="bg-white border border-navy/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-navy/20 transition-all">
              <div>
                <h4 className="font-bold text-sm text-slate-800 font-heading">Schema architect</h4>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Detect and recommend schema</p>
              </div>
              <a
                href="https://ai.studio/apps/94f6d44f-1754-4253-87b9-a34f3461dc98"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer shrink-0"
              >
                <span>Schema architect</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Navigation */}
      <nav className="h-16 bg-white border-b border-navy/10 flex items-center px-6 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentView("home")}
            className="flex items-center gap-3 text-left cursor-pointer hover:opacity-85 transition-opacity"
            title="Return to Home"
          >
            <div className="w-8 h-8 bg-navy rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-navy tracking-tight uppercase font-heading">Page Template Identifier</span>
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          {currentView === "workspace" && (
            <button
              onClick={() => setCurrentView("home")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-navy/10 rounded-full text-xs font-semibold text-navy hover:bg-cloud-dancer transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Home
            </button>
          )}

          {result && currentView === "home" && (
            <button
              onClick={() => setCurrentView("workspace")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              View Results ({result.domain_analyzed})
            </button>
          )}

          {result && currentView === "workspace" && (
            <>
              <div className="bg-ice-melt/20 text-navy px-3 py-1.5 rounded-full text-sm font-semibold border border-ice-melt/30">
                analyzing: {result.domain_analyzed}
              </div>
              <div className="text-gray-400 text-sm flex items-center gap-2 font-sans font-bold uppercase tracking-widest text-[10px]">
                Status: <span className="text-[#059669] font-bold flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#059669] rounded-full" />
                  Complete
                </span>
              </div>
            </>
          )}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-navy/10 rounded-full text-sm font-semibold text-navy hover:bg-cloud-dancer transition-colors cursor-pointer"
          >
            <History className="w-4 h-4" />
            Runs history
          </button>
        </div>
      </nav>

      {currentView === "home" ? (
        renderHomePage()
      ) : (
        <div className="flex-grow grid grid-cols-[280px_1fr] overflow-hidden">
        {/* Sidebar */}
        <aside className="bg-white border-r border-navy/10 p-6 overflow-y-auto">
          <h3 className="text-sm font-bold text-slate-text uppercase tracking-wider mb-6 font-heading">Crawler Overview</h3>
          
          <div className="space-y-4 mb-8">
            <div className="stat-card">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 font-bold font-sans">Templates Discovered</p>
              <p className="text-2xl font-bold font-heading">{result?.total_templates_discovered || 0}</p>
            </div>
            <div className="stat-card">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 font-bold font-sans">URLs Analyzed</p>
              <p className="text-2xl font-bold font-heading">{urls.split('\n').filter(l => l.trim()).length.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-[10px] font-bold text-[#2563EB] uppercase tracking-widest bg-white mb-4 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#2563EB]" />
              Direct Site Menu Crawler
            </h3>
            <div className="flex flex-col gap-2 mb-6 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
              <input
                type="text"
                value={homepageUrl}
                onChange={(e) => setHomepageUrl(e.target.value)}
                placeholder="e.g. truist.com or https://truist.com"
                className="w-full p-2 bg-white rounded-lg border border-navy/10 focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none transition-all text-[11px] font-medium"
              />
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={handleCrawlMenu}
                  disabled={isCrawling || !homepageUrl.trim()}
                  className="py-2 bg-white border border-blue-200 text-[#2563EB] hover:bg-blue-50 rounded-lg text-[9.5px] font-bold transition-colors disabled:opacity-50 uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
                >
                  {isCrawling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  {isCrawling ? "Crawling..." : "Scan Nav Links"}
                </button>
                <button
                  onClick={() => handleCrawlAndAnalyzeMenu()}
                  disabled={isMenuAnalyzing || !homepageUrl.trim()}
                  className="py-2 bg-[#2563EB] text-white rounded-lg text-[9.5px] font-bold hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                >
                  {isMenuAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {isMenuAnalyzing ? "Analyzing..." : "Architect Schema"}
                </button>
              </div>
            </div>

            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white mb-4">Auto-Fetch Sitemap</h3>
            <div className="flex flex-col gap-2 mb-6">
              <textarea
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="Paste sitemap URLs (one per line)..."
                className="w-full h-24 p-2 bg-cloud-dancer rounded-lg border border-navy/10 focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none transition-all text-[11px] resize-none"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={fetchSitemap}
                  disabled={isFetching || !sitemapUrl.trim()}
                  className="py-2 bg-white border border-navy/10 rounded-lg text-[10px] font-bold hover:bg-cloud-dancer transition-colors disabled:opacity-50 text-navy uppercase tracking-widest hover:text-navy/80 cursor-pointer"
                >
                  {isFetching ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Fetch Flat"}
                </button>
                <button
                  onClick={() => handleExtractNestedSitemap()}
                  disabled={isExtractingNested || !sitemapUrl.trim()}
                  className="py-2 bg-[#2563EB] text-white rounded-lg text-[10px] font-bold hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 uppercase tracking-widest flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                >
                  {isExtractingNested ? <Loader2 className="w-3 h-3 animate-spin" /> : <Network className="w-3 h-3" />}
                  Nested L1-L4
                </button>
              </div>
            </div>

            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Manual Discovery</h3>
            <div className="flex flex-col gap-2 mb-6">
              <textarea
                value={discoveryUrl}
                onChange={(e) => setDiscoveryUrl(e.target.value)}
                placeholder="Paste missing URLs (one per line)..."
                className="w-full h-24 p-2 bg-cloud-dancer rounded-lg border border-navy/10 focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none transition-all text-[11px] resize-none"
              />
              <button
                onClick={addDiscoveryUrl}
                disabled={!discoveryUrl.trim()}
                className="w-full py-2 bg-white border border-navy/10 rounded-lg text-[10px] font-bold hover:bg-cloud-dancer transition-colors disabled:opacity-50 text-navy uppercase tracking-widest"
              >
                Add to List
              </button>
            </div>

            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">GSC URL Upload</h3>
            <div className="mb-6">
              <label className="flex flex-col items-center justify-center w-full h-12 border-2 border-dashed border-navy/20 rounded-lg cursor-pointer bg-cloud-dancer hover:bg-cloud-dancer/80 transition-colors">
                <div className="flex items-center gap-2">
                  <Upload className="w-3 h-3 text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Upload GSC CSV/TXT</span>
                </div>
                <input type="file" className="hidden" accept=".csv,.txt" onChange={handleGscUpload} />
              </label>
            </div>

            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Unified URL List</h3>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="Sitemap + Discovery URLs..."
              className="w-full h-48 p-3 bg-cloud-dancer rounded-lg border border-navy/10 focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none transition-all font-mono text-[11px] resize-none"
            />
            <button
              onClick={analyzeSitemap}
              disabled={isAnalyzing || !urls.trim()}
              className="w-full mt-4 py-3 bg-navy hover:bg-navy/90 disabled:bg-cloud-dancer disabled:text-gray-400 text-white font-bold text-sm rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {isAnalyzing ? "Analyzing..." : "Run Analysis"}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="p-8 overflow-y-auto bg-cloud-dancer">
          <AnimatePresence mode="wait">
            {!result && !isAnalyzing && activeTab !== "nested_sitemap" && activeTab !== "menu_templates" && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-3"
              >
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-navy/10 mb-2">
                  <Layout className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold font-heading text-slate-text">Ready for Analysis</h3>
                <p className="text-gray-500 max-w-sm">Paste your sitemap URLs in the sidebar, or scan homepage navigation menus directly.</p>
                <div className="pt-2 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => {
                      setActiveTab("menu_templates");
                      if (!homepageUrl) setHomepageUrl("https://truist.com");
                    }}
                    className="px-4 py-2 bg-blue-50 border border-blue-200 text-[#2563EB] hover:bg-blue-100 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm inline-flex items-center gap-2"
                  >
                    <Compass className="w-4 h-4" />
                    Nav Menu & AI Architect (truist.com, etc.)
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("nested_sitemap");
                      handleInsertZillowExample();
                    }}
                    className="px-4 py-2 bg-cloud-dancer border border-navy/10 text-slate-text hover:bg-gray-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm inline-flex items-center gap-2"
                  >
                    <Network className="w-4 h-4" />
                    Extract Nested Sitemap Hierarchy
                  </button>
                </div>
              </motion.div>
            )}

            {!result && !isAnalyzing && activeTab === "menu_templates" && (
              <motion.div
                key="menu_standalone"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-5xl mx-auto"
              >
                {renderMenuTemplatesView()}
              </motion.div>
            )}

            {!result && !isAnalyzing && activeTab === "nested_sitemap" && (
              <motion.div
                key="nested_standalone"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-5xl mx-auto"
              >
                {renderNestedSitemapExtractorView()}
              </motion.div>
            )}

            {isAnalyzing && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center"
              >
                <div className="relative mb-6">
                  <div className="w-16 h-16 border-4 border-navy/10 border-t-navy rounded-full animate-spin" />
                  <Database className="w-6 h-6 text-navy absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <h3 className="text-xl font-bold font-heading text-slate-text mb-2">Mapping Domain Templates</h3>
                <p className="text-gray-500 animate-pulse">Analyzing URL patterns and page intent...</p>
              </motion.div>
            )}

            {result && (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 max-w-5xl mx-auto"
              >
                {/* Fallback Banner */}
                {(result.reasoning?.includes("Deterministic") || result.reasoning?.includes("Fallback") || result.reasoning?.includes("fallback")) && (
                  <div className="flex items-center justify-between bg-[#FEF3C7] border border-[#F59E0B]/30 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#FDE68A] rounded-lg text-[#D97706]">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#78350F] uppercase tracking-widest mb-0.5">API Quota Fallback Active</p>
                        <p className="text-[11px] text-[#92400E] font-medium leading-relaxed">
                          The shared Gemini API free-tier quota is temporarily exhausted. The platform has automatically engaged the high-precision <strong>SEO Architect Deterministic Matcher</strong>. All URL templates have been structured and mapped with static slug rules!
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sitemap warning bar */}
                <div className="flex items-center justify-between bg-lemon-icing/10 border border-lemon-icing/30 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-lemon-icing/20 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-[#FF8800]" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-text uppercase tracking-widest mb-0.5">Sitemap Completeness Check</p>
                      <p className="text-[11px] text-gray-500 font-medium">Sitemaps often miss deep pages. Use the "Direct Site Menu Crawler" to find core navigation links, or manually add pages from your browser menu.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold font-heading text-slate-text">Detected Page Templates</h2>
                    </div>
                    <span className="text-[11px] text-gray-400 uppercase tracking-widest font-bold shrink-0">Last updated: {new Date().toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Tab Selector */}
                <div className="flex border-b border-navy/10 gap-6">
                  <button
                    onClick={() => setActiveTab("templates")}
                    className={`pb-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                      activeTab === "templates"
                        ? "border-[#2563EB] text-[#2563EB]"
                        : "border-transparent text-gray-400 hover:text-slate-text"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Schema Templates Roster ({result.templates?.length || 0})
                  </button>
                  <button
                    onClick={() => setActiveTab("menu_templates")}
                    className={`pb-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                      activeTab === "menu_templates"
                        ? "border-[#2563EB] text-[#2563EB]"
                        : "border-transparent text-gray-400 hover:text-slate-text"
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 text-[#2563EB]" />
                    Nav Menu & AI Architect {menuAnalyzeResult ? `(${menuAnalyzeResult.templates?.length || 0})` : ''}
                  </button>
                  <button
                    onClick={() => setActiveTab("folders")}
                    className={`pb-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                      activeTab === "folders"
                        ? "border-[#2563EB] text-[#2563EB]"
                        : "border-transparent text-gray-400 hover:text-slate-text"
                    }`}
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    Directory Slugs & Subfolders ({getFolderStructure(urls).length})
                  </button>
                  <button
                    onClick={() => setActiveTab("nested_sitemap")}
                    className={`pb-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                      activeTab === "nested_sitemap"
                        ? "border-[#2563EB] text-[#2563EB]"
                        : "border-transparent text-gray-400 hover:text-slate-text"
                    }`}
                  >
                    <Network className="w-3.5 h-3.5" />
                    Nested Sitemap Hierarchy {nestedExtractResult ? `(${nestedExtractResult.rows.length})` : ''}
                  </button>
                </div>

                {activeTab === "templates" && (
                  <div className="space-y-4 animate-fadeIn">
                    {/* Compact gorgeous manual pattern injector */}
                    <div className="bg-white p-5 rounded-2xl border border-navy/10 shadow-sm flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex-1 w-full">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                          <label className="text-[10px] font-bold text-slate-text uppercase tracking-widest block">Inject Custom Template Pattern</label>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-[11px] font-bold text-gray-400 font-mono">Pattern:</span>
                          <input
                            type="text"
                            value={customPattern}
                            onChange={(e) => setCustomPattern(e.target.value)}
                            placeholder="e.g. /electricity-rates/* or /blog/*"
                            className="w-full pl-18 pr-4 py-2 bg-cloud-dancer/50 border border-navy/10 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] font-mono transition-all"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => handleInjectCustomPattern()}
                        disabled={isInjecting || !customPattern.trim()}
                        className="w-full sm:w-auto shrink-0 self-end px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                      >
                        {isInjecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        {isInjecting ? "Analyzing..." : "Inject & Auto-Detect"}
                      </button>
                    </div>

                    {/* Templates search & filter bar */}
                    <div className="bg-white p-4 rounded-2xl border border-navy/10 shadow-sm flex items-center gap-3">
                      <div className="relative flex-1 w-full">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3.5" />
                        <input
                          type="text"
                          value={templateSearchQuery}
                          onChange={(e) => setTemplateSearchQuery(e.target.value)}
                          placeholder="Search templates, patterns or schema types..."
                          className="w-full pl-9 pr-4 py-2 bg-cloud-dancer/50 border border-navy/10 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] font-mono transition-all"
                        />
                      </div>
                      {templateSearchQuery && (
                        <button
                          onClick={() => setTemplateSearchQuery("")}
                          className="px-3 py-1.5 border border-navy/10 hover:border-navy bg-white hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-500 hover:text-navy transition-all cursor-pointer shadow-sm shrink-0"
                        >
                          Clear Filter
                        </button>
                      )}
                    </div>

                    <div className="bg-white p-6 md:p-8 rounded-2xl border border-navy/10 shadow-sm overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-navy/10">
                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[30%]">Template & Pattern</th>
                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[20%]">Recommended Schema</th>
                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[40%]">Sample URLs</th>
                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[10%] text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(Array.isArray(result.templates) ? result.templates : [])
                            .filter(t => {
                              if (!templateSearchQuery.trim()) return true;
                              const query = templateSearchQuery.toLowerCase().trim();
                              return (
                                (t.template_name || "").toLowerCase().includes(query) ||
                                (t.url_pattern || "").toLowerCase().includes(query) ||
                                (t.recommended_primary_schema || "").toLowerCase().includes(query)
                              );
                            })
                            .map((template, idx) => (
                            <tr key={idx} className="border-b border-navy/10 last:border-0 hover:bg-cloud-dancer/30 transition-colors">
                              <td className="px-2 py-4">
                                <span className="block font-bold font-heading text-slate-text mb-1.5 text-base">{template.template_name || "Unknown"}</span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="url-pattern">{template.url_pattern || "N/A"}</span>
                                  <button
                                    onClick={() => {
                                      setSelectedExploreTemplate(template);
                                      setIsExploreModalOpen(true);
                                      setExploreSearchQuery("");
                                    }}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#E0F2FE] text-[#0369A1] hover:bg-[#BAE6FD] border border-[#BAE6FD]/60 transition-colors cursor-pointer group"
                                    title="Explore matching pages"
                                  >
                                    <Eye className="w-2.5 h-2.5 text-[#0284C7] group-hover:scale-115 transition-transform" />
                                    {template.count || template.sample_urls?.length || 0} pages
                                  </button>
                                </div>
                              </td>
                              <td className="px-2 py-4">
                                <span className="schema-tag">@{template.recommended_primary_schema || "N/A"}</span>
                              </td>
                              <td className="px-2 py-4">
                                <ul className="space-y-1.5">
                                  {(Array.isArray(template.sample_urls) ? template.sample_urls : []).map((url, uIdx) => (
                                    <li key={uIdx} className="flex items-center gap-2 group/url">
                                      <div className="w-1 h-1 bg-gray-300 rounded-full shrink-0" />
                                      <span className="text-[11px] text-gray-500 font-mono truncate max-w-[280px]">{url}</span>
                                      <a 
                                        href={url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="opacity-0 group-hover/url:opacity-100 transition-opacity text-navy shrink-0"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </td>
                              <td className="px-2 py-4 text-right">
                                <button
                                  onClick={() => handleRemoveTemplate(template.url_pattern)}
                                  className="inline-flex items-center justify-center p-2 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Remove template from roster"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === "folders" && (
                  <div className="space-y-4 animate-fadeIn">
                    {/* Directory Slugs & Explainer */}
                    <div className="bg-white p-6 rounded-2xl border border-navy/10 shadow-sm space-y-4">
                      <div>
                        <p className="text-xs text-slate-text/90 font-medium leading-relaxed">
                          Below is the folder and directory slug architecture extracted from your list of imported URLs.
                          You can inspect exactly how many pages live inside each directory subfolder. If the AI missed
                          any specific custom silo, click <strong>"Register as Template"</strong> to instantly add it to your 
                          Schema Roster with automatic page-type and Schema detection.
                        </p>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">Filter Level:</span>
                          {(() => {
                            const allFolders = getFolderStructure(urls);
                            const counts: Record<string, number> = {
                              all: allFolders.length,
                              "0": allFolders.filter(f => f.level === 0).length,
                              "1": allFolders.filter(f => f.level === 1).length,
                              "2": allFolders.filter(f => f.level === 2).length,
                              "3": allFolders.filter(f => f.level === 3).length,
                              "4+": allFolders.filter(f => f.level >= 4).length,
                            };
                            const levels = [
                              { id: "all", label: "All Levels" },
                              { id: "0", label: "L0 Root" },
                              { id: "1", label: "Level 1" },
                              { id: "2", label: "Level 2" },
                              { id: "3", label: "Level 3" },
                              { id: "4+", label: "Level 4+" },
                            ];
                            return levels.map(lvl => {
                              const isActive = folderLevelFilter === lvl.id;
                              const count = counts[lvl.id] || 0;
                              return (
                                <button
                                  key={lvl.id}
                                  onClick={() => setFolderLevelFilter(lvl.id)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                    isActive
                                      ? "bg-[#2563EB] text-white shadow-sm"
                                      : "bg-cloud-dancer/80 text-navy/70 hover:bg-navy/10"
                                  }`}
                                >
                                  <span>{lvl.label}</span>
                                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                                    isActive ? "bg-white/20 text-white" : "bg-navy/10 text-navy/60"
                                  }`}>
                                    {count}
                                  </span>
                                </button>
                              );
                            });
                          })()}
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <div className="relative flex-1 w-full">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3.5" />
                            <input
                              type="text"
                              value={folderSearchQuery}
                              onChange={(e) => setFolderSearchQuery(e.target.value)}
                              placeholder="Search folders or subfolder slugs..."
                              className="w-full pl-9 pr-4 py-2.5 bg-cloud-dancer/50 border border-navy/10 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] font-mono transition-all"
                            />
                          </div>
                          <div className="relative w-full sm:w-48 shrink-0">
                            <select
                              value={folderLevelFilter}
                              onChange={(e) => setFolderLevelFilter(e.target.value)}
                              className="w-full pl-3 pr-8 py-2.5 bg-cloud-dancer/50 border border-navy/10 rounded-xl text-xs font-semibold text-slate-text focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] appearance-none cursor-pointer"
                            >
                              <option value="all">All Levels</option>
                              <option value="0">Root Only (Level 0)</option>
                              <option value="1">Level 1</option>
                              <option value="2">Level 2</option>
                              <option value="3">Level 3</option>
                              <option value="4+">Level 4+</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 md:p-8 rounded-2xl border border-navy/10 shadow-sm overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-navy/10">
                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[50%]">Directory Slug Path</th>
                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[15%]">Depth Level</th>
                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[15%]">Contains</th>
                            <th className="px-2 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-[20%] text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const all = getFolderStructure(urls);
                            const hasSubfolders = (folderPath: string) => {
                              if (folderPath === '/') return all.length > 1;
                              return all.some(f => f.path !== folderPath && f.path.startsWith(folderPath));
                            };

                            const filtered = all
                              .filter(f => !folderSearchQuery.trim() || f.path.toLowerCase().includes(folderSearchQuery.toLowerCase()))
                              .filter(f => {
                                if (folderLevelFilter === "all") return true;
                                if (folderLevelFilter === "4+") return f.level >= 4;
                                return f.level === parseInt(folderLevelFilter, 10);
                              });

                            if (filtered.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={4} className="px-2 py-8 text-center text-gray-400 text-xs font-semibold">
                                    No directory slug paths matched your search query.
                                  </td>
                                </tr>
                              );
                            }

                            return filtered.map((folder, idx) => {
                              const templates = result ? (result.templates || []) : [];
                              const isRegistered = templates.some(t => {
                                const patLower = t.url_pattern.toLowerCase();
                                const pathLower = folder.path.toLowerCase();
                                return patLower === pathLower || patLower === pathLower + "*" || patLower === pathLower.slice(0, -1) + "/*";
                              });

                              return (
                                <tr key={idx} className="border-b border-navy/10 last:border-0 hover:bg-cloud-dancer/30 transition-colors">
                                  <td className="px-2 py-3.5">
                                    <div className="flex items-center gap-2" style={{ paddingLeft: `${Math.min(folder.level * 20, 80)}px` }}>
                                      {folder.path === '/' ? (
                                        <FolderTree className="w-4 h-4 text-[#2563EB] shrink-0" />
                                      ) : (
                                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                      )}
                                      <span className="font-mono text-xs font-bold text-slate-text select-all">{folder.path}</span>
                                    </div>
                                  </td>
                                  <td className="px-2 py-3.5">
                                    {folder.path === '/' ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-500">Root</span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-navy/5 text-navy/70">Level {folder.level}</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-3.5">
                                    <button
                                      onClick={() => {
                                        const mockTemplate: Template = {
                                          template_name: `Directory: ${folder.path}`,
                                          url_pattern: folder.path + "*",
                                          recommended_primary_schema: "Directory Path",
                                          sample_urls: folder.urls.slice(0, 3),
                                          count: folder.count,
                                          all_matching_urls: folder.urls
                                        };
                                        setSelectedExploreTemplate(mockTemplate);
                                        setIsExploreModalOpen(true);
                                        setExploreSearchQuery("");
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#E0F2FE] text-[#0369A1] hover:bg-[#BAE6FD] border border-[#BAE6FD]/60 transition-colors cursor-pointer group"
                                      title="Explore pages in this directory"
                                    >
                                      <Eye className="w-2.5 h-2.5 text-[#0284C7] group-hover:scale-115 transition-transform" />
                                      {folder.count} pages
                                    </button>
                                  </td>
                                  <td className="px-2 py-3.5 text-right">
                                    {isRegistered ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                        Registered
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleInjectCustomPattern(folder.path === '/' ? '/' : folder.path + "*")}
                                        disabled={isInjecting}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-navy/10 hover:border-[#2563EB] hover:bg-blue-50/40 text-slate-text hover:text-[#2563EB] rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50"
                                      >
                                        <Plus className="w-2.5 h-2.5" />
                                        Register
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === "menu_templates" && renderMenuTemplatesView()}

                {activeTab === "nested_sitemap" && renderNestedSitemapExtractorView()}

                {/* CoT Reasoning Box */}
                <div className="bg-white p-6 md:p-8 rounded-2xl border border-navy/10 shadow-sm mt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-raindrops/30 rounded-md">
                      <Code className="w-4 h-4 text-navy" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#FF8800]">AI Extraction Logic (Why)</h3>
                  </div>
                  <p className="text-sm text-slate-text leading-relaxed font-medium">
                    {result.reasoning}
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <div className="p-4 bg-cloud-dancer/50 rounded-xl border border-navy/5">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 font-heading">ELI5 Summary</h4>
                      <p className="text-xs text-slate-text/80 font-medium italic leading-relaxed">
                        "I grouped the URLs by matching patterns in their web addresses (How) to ensure we map each unique structure to the appropriate Schema type without missing anything (What)."
                      </p>
                    </div>
                    <div className="p-4 bg-ice-melt/25 rounded-xl border border-ice-melt/40">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-navy mb-2 font-heading">Executive TLDR</h4>
                      <p className="text-xs text-slate-text/90 font-semibold leading-relaxed">
                        {result.executive_tldr || "Audit completed successfully. Pre-clustered dynamic URLs were extracted into standard patterns and mapped to recommended high-value Schema configurations."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button 
                    onClick={downloadJson}
                    className="px-4 py-2 bg-cloud-dancer border border-navy/10 rounded-lg text-xs font-bold text-slate-text uppercase tracking-widest hover:bg-gray-200 transition-colors flex items-center gap-2"
                  >
                    <Copy className="w-3 h-3" />
                    Download JSON
                  </button>
                  <button 
                    onClick={downloadCsv}
                    className="px-4 py-2 bg-peach-dust text-slate-text rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#C1D9F0]/80 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <Download className="w-3 h-3" />
                    Export to Schema Architect
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-lemon-icing/10 border border-lemon-icing/30 rounded-xl flex items-start gap-3 text-slate-text shadow-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#FF8800]" />
              <p className="text-sm font-bold">{error}</p>
            </motion.div>
          )}
        </main>
      </div>
      )}

      {/* Runs History Sidebar Overlay */}
      <AnimatePresence>
        {isHistoryOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="fixed inset-0 bg-navy/20 backdrop-blur-sm z-40 transition-opacity"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-cloud-dancer border-l border-navy/10 shadow-2xl z-50 flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-navy/10 bg-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ice-melt/20 rounded-lg">
                    <History className="w-5 h-5 text-navy" />
                  </div>
                  <h2 className="text-xl font-bold font-heading text-navy uppercase tracking-tight">Run History</h2>
                </div>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-2 text-gray-400 hover:text-navy hover:bg-cloud-dancer rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {(!Array.isArray(runHistory) || runHistory.length === 0) ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-navy/10 mx-auto mb-4">
                      <History className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No previous runs yet</p>
                  </div>
                ) : (
                  runHistory
                    .filter((run): run is RunHistory => !!(run && run.result))
                    .map((run, hIdx) => (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: hIdx * 0.05 }}
                        key={hIdx}
                        className="bg-white p-5 rounded-2xl border border-navy/10 shadow-sm hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              {run?.date ? formatDateSafe(run.date) : "Unknown Date"}
                            </span>
                            <p className="font-heading font-bold text-lg text-slate-text mt-1">{run?.result?.domain_analyzed || "Unknown Domain"}</p>
                          </div>
                          <div className="px-2.5 py-1 bg-ice-melt/20 rounded-md text-[10px] font-bold text-navy uppercase tracking-widest text-center min-w-[3rem]">
                            {run?.result?.total_templates_discovered || 0} <br /> Temp.
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium mb-4 line-clamp-2">
                          {(Array.isArray(run?.result?.templates) ? run.result.templates : [])
                            .filter(t => t)
                            .map(t => t.template_name || "Unknown")
                            .join(", ") || "No templates found"}
                        </p>
                        <button 
                          onClick={() => {
                            if (run && run.result) {
                              setResult(normalizeResult(run.result));
                            }
                            setIsHistoryOpen(false);
                          }}
                          className="w-full py-2 bg-cloud-dancer border border-navy/10 rounded-lg text-[10px] font-bold text-navy uppercase tracking-widest hover:bg-ice-melt/30 transition-colors group-hover:border-navy/30"
                        >
                          Restore This Analysis
                        </button>
                      </motion.div>
                    ))
                )}
              </div>
            </motion.div>
          </>
        )}

        {isQuotaOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsQuotaOpen(false)}
              className="fixed inset-0 bg-navy/20 backdrop-blur-sm z-40 transition-opacity"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-cloud-dancer border-l border-navy/10 shadow-2xl z-50 flex flex-col font-sans"
            >
              <div className="flex items-center justify-between p-6 border-b border-navy/10 bg-white shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#FDE9AC]/40 rounded-lg">
                    <Terminal className="w-5 h-5 text-[#D97706]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold font-heading text-navy uppercase tracking-tight">API Telemetry & Quotas</h2>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black mt-0.5">Real-time developer console</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchQuotaStats}
                    disabled={isStatsLoading}
                    className="p-2 text-gray-400 hover:text-navy hover:bg-cloud-dancer rounded-full transition-colors"
                    title="Refresh telemetry"
                  >
                    <Activity className={`w-4 h-4 ${isStatsLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setIsQuotaOpen(false)}
                    className="p-2 text-gray-400 hover:text-navy hover:bg-cloud-dancer rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Stats Summary Cards */}
                <div className="grid grid-cols-2 gap-4">
                  {/* RPM Tracker */}
                  <div className="bg-white p-5 rounded-2xl border border-navy/10 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Requests / Min (RPM)</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          (quotaStats?.rpm || 0) >= (quotaStats?.limits?.rpmLimit || 15) * 0.8
                            ? 'bg-red-500 animate-ping'
                            : (quotaStats?.rpm || 0) > 0 
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-green-500'
                        }`} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Live</span>
                      </div>
                    </div>
                    <p className="text-3xl font-bold font-heading text-navy">
                      {quotaStats?.rpm || 0} <span className="text-sm font-medium text-gray-400">/ {quotaStats?.limits?.rpmLimit || 15}</span>
                    </p>
                    {/* Progress Bar */}
                    <div className="w-full bg-cloud-dancer rounded-full h-1.5 mt-3">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          (quotaStats?.rpm || 0) >= (quotaStats?.limits?.rpmLimit || 15) * 0.8
                            ? 'bg-red-500'
                            : 'bg-navy'
                        }`}
                        style={{ width: `${Math.min(100, ((quotaStats?.rpm || 0) / (quotaStats?.limits?.rpmLimit || 15)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* RPD Tracker */}
                  <div className="bg-white p-5 rounded-2xl border border-navy/10 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Daily Limit (RPD)</span>
                      <span className="text-[9px] bg-red-500/10 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Limit: 20</span>
                    </div>
                    <p className="text-3xl font-bold font-heading text-navy">
                      {quotaStats?.rpd || 0} <span className="text-sm font-medium text-gray-400">/ {quotaStats?.limits?.rpdLimit || 20}</span>
                    </p>
                    {/* Progress Bar */}
                    <div className="w-full bg-cloud-dancer rounded-full h-1.5 mt-3">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          (quotaStats?.rpd || 0) >= (quotaStats?.limits?.rpdLimit || 20) * 0.8
                            ? 'bg-red-500'
                            : 'bg-[#D97706]'
                        }`}
                        style={{ width: `${Math.min(100, ((quotaStats?.rpd || 0) / (quotaStats?.limits?.rpdLimit || 20)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Token Usage Summary */}
                <div className="bg-white p-5 rounded-2xl border border-navy/10 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-navy/5 pb-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-navy" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-text">Accumulated Tokens</h3>
                    </div>
                    <span className="font-mono text-xs font-semibold bg-cloud-dancer px-2 py-1 rounded text-navy">
                      {(quotaStats?.totalTokensUsed || 0).toLocaleString()} <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Total</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-3 bg-cloud-dancer/50 rounded-xl">
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-1">Input (Prompts)</p>
                      <p className="text-lg font-bold font-heading text-navy font-mono">{(quotaStats?.totalInputTokens || 0).toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-cloud-dancer/50 rounded-xl">
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-1">Output (Responses)</p>
                      <p className="text-lg font-bold font-heading text-[#D97706] font-mono">{(quotaStats?.totalOutputTokens || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-400 flex items-center justify-between font-medium">
                    <span>Average Speed (Latency)</span>
                    <span className="font-mono font-bold text-navy">
                      {quotaStats && quotaStats.recentLogs && quotaStats.recentLogs.length > 0
                        ? `${Math.round(quotaStats.recentLogs.reduce((sum, l) => sum + l.totalLatencyMs, 0) / quotaStats.recentLogs.length).toLocaleString()} ms`
                        : "0 ms"}
                    </span>
                  </div>
                </div>

                {/* Status Counters */}
                <div className="bg-white p-4 rounded-2xl border border-navy/10 shadow-sm grid grid-cols-3 gap-2 text-center divide-x divide-navy/5">
                  <div>
                    <p className="text-xl font-bold font-heading text-emerald-600">{quotaStats?.successfulRequests || 0}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mt-1">Successful AI</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold font-heading text-amber-500">{quotaStats?.fallbackRequests || 0}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mt-1">Rules Failover</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold font-heading text-red-500">{quotaStats?.failedRequests || 0}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mt-1">Hard Errors</p>
                  </div>
                </div>

                {/* Live Telemetry Log Stream */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Real-Time Telemetry Stream</h3>
                  
                  {(!quotaStats?.recentLogs || quotaStats.recentLogs.length === 0) ? (
                    <div className="bg-white p-8 rounded-2xl border border-navy/10 border-dashed text-center">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Waiting for API traffic...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {quotaStats.recentLogs.map((log, lIdx) => (
                        <div key={log.id} className="bg-white p-4 rounded-xl border border-navy/10 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-gray-400 bg-cloud-dancer px-1.5 py-0.5 rounded">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300">
                                id: {log.id}
                              </span>
                            </div>
                            
                            {/* Status Badge */}
                            {log.status === "success" && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold rounded-md uppercase tracking-wider flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                Success
                              </span>
                            )}
                            {log.status === "fallback" && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold rounded-md uppercase tracking-wider flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                Failover Active
                              </span>
                            )}
                            {log.status === "failed" && (
                              <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[9px] font-bold rounded-md uppercase tracking-wider flex items-center gap-1">
                                <X className="w-2.5 h-2.5 text-red-600" />
                                Failed
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 font-medium bg-cloud-dancer p-2.5 rounded-lg border border-navy/5 font-mono">
                            <div>Latency: <span className="font-bold text-navy">{log.totalLatencyMs.toLocaleString()} ms</span></div>
                            <div>Tokens: <span className="font-bold text-navy">{(log.totalTokens).toLocaleString()}</span></div>
                            <div className="col-span-2 border-t border-navy/5 pt-1.5 mt-1 text-[10px] truncate text-gray-400">
                              Active Model: <span className="font-bold text-slate-text">{log.successfulModel || "N/A (Deterministic Fallback)"}</span>
                            </div>
                          </div>

                          {/* Individual Attempt Details if multiple exist or error occurred */}
                          {log.modelsAttempted && log.modelsAttempted.length > 0 && (
                            <div className="space-y-1 pt-1.5 border-t border-dashed border-navy/5">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Router Sequence & Quota Outcomes:</p>
                              {log.modelsAttempted.map((att, aIdx) => (
                                <div key={aIdx} className="flex items-center justify-between text-[10px] pl-1 text-gray-500 font-mono">
                                  <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                                    <span className="text-gray-300">↳</span>
                                    <span className="truncate">{att.model}</span>
                                    <span className="text-[8px] bg-cloud-dancer px-1 rounded">Try {att.attempt}</span>
                                  </div>
                                  <span className={`font-bold ${att.success ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {att.success 
                                      ? `OK (${att.latencyMs}ms)` 
                                      : (() => {
                                          const errStr = (att.error || "").toLowerCase();
                                          if (errStr.includes("503") || errStr.includes("demand") || errStr.includes("unavailable") || errStr.includes("overload")) {
                                            return "UNAVAILABLE (503)";
                                          }
                                          if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("exhausted") || errStr.includes("limit")) {
                                            return "LIMIT_EXHAUSTED (429)";
                                          }
                                          return "FAILED";
                                        })()
                                    }
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {log.errorMessage && (
                            <div className="p-2 bg-red-50 border border-red-100 rounded text-[10px] font-mono text-red-700 break-words leading-normal">
                              <strong>Error payload:</strong> {log.errorMessage}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Developer Help Footer */}
              <div className="p-6 border-t border-navy/10 bg-white text-xs text-gray-500 leading-normal font-medium shrink-0">
                <p className="font-bold text-navy uppercase tracking-wider mb-1 font-heading">Free-Tier Quota Guardrail:</p>
                <p>Gemini limits Free Tier requests to <strong>20 requests per day</strong>. If exceeded, this platform initiates an immediate, seamless failover to seoClarity's rules-based deterministic engine so that your work is never interrupted.</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Crawled Navigation Menu Links Modal Overlay */}
      <AnimatePresence>
        {isCrawlModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCrawlModalOpen(false)}
              className="fixed inset-0 bg-navy/30 backdrop-blur-sm z-40 transition-opacity"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-navy/10 overflow-hidden z-50 flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-navy/10 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between shrink-0">
                <div>
                  <span className="text-[10px] font-black text-[#2563EB] uppercase tracking-widest bg-blue-100/50 px-2.5 py-1 rounded-full">
                    Crawled Site Navigation Menu
                  </span>
                  <h2 className="text-xl font-black font-heading mt-2 text-slate-text uppercase">
                    Discovered {crawledLinks.length} Core Pages
                  </h2>
                </div>
                <button
                  onClick={() => setIsCrawlModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-navy hover:bg-cloud-dancer rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body / Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-cloud-dancer/30">
                <p className="text-xs text-gray-500 font-medium">
                  We scanned the navigation menu, headers, and footers of your homepage to isolate structural templates. Toggle the links below to refine what you want to add to your analysis list:
                </p>

                {/* Categorized Link Blocks */}
                {(() => {
                  // Group crawledLinks by category
                  const groups: Record<string, typeof crawledLinks> = {};
                  crawledLinks.forEach(link => {
                    if (!groups[link.category]) groups[link.category] = [];
                    groups[link.category].push(link);
                  });

                  return Object.entries(groups).map(([category, links]) => (
                    <div key={category} className="bg-white p-4 rounded-xl border border-navy/10 space-y-3">
                      <div className="flex items-center justify-between border-b border-navy/5 pb-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-[#1E3A8A]">
                          {category} <span className="text-gray-400">({links.length})</span>
                        </h4>
                        <button
                          onClick={() => {
                            const groupUrls = links.map(l => l.url);
                            const allSelected = groupUrls.every(u => selectedCrawledLinks.includes(u));
                            if (allSelected) {
                              // Deselect group
                              setSelectedCrawledLinks(selectedCrawledLinks.filter(u => !groupUrls.includes(u)));
                            } else {
                              // Select group
                              setSelectedCrawledLinks(Array.from(new Set([...selectedCrawledLinks, ...groupUrls])));
                            }
                          }}
                          className="text-[10px] font-bold text-[#2563EB] uppercase tracking-widest hover:underline cursor-pointer"
                        >
                          {links.map(l => l.url).every(u => selectedCrawledLinks.includes(u)) ? "Deselect All" : "Select All"}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                        {links.map((link, idx) => {
                          const isSelected = selectedCrawledLinks.includes(link.url);
                          return (
                            <label
                              key={idx}
                              onClick={() => toggleLinkSelection(link.url)}
                              className={`flex items-start gap-3 p-2 rounded-lg border text-left cursor-pointer transition-all select-none ${
                                isSelected
                                  ? "bg-blue-50/50 border-[#2563EB] text-[#1E3A8A]"
                                  : "bg-[#FAFAFA] border-navy/5 text-slate-text hover:bg-gray-100"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // handled by click parent
                                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                              />
                              <div className="truncate flex-1">
                                <span className="block text-xs font-bold truncate leading-tight">
                                  {link.text || "Untitled Section"}
                                </span>
                                <span className="text-[9px] text-gray-400 font-mono block truncate">
                                  {link.url}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Modal Footer Actions */}
              <div className="p-6 border-t border-navy/10 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <span className="text-xs font-bold text-gray-500">
                  {selectedCrawledLinks.length} of {crawledLinks.length} links selected
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setIsCrawlModalOpen(false)}
                    className="px-4 py-2 bg-cloud-dancer border border-navy/10 rounded-lg text-xs font-bold text-slate-text uppercase tracking-widest hover:bg-gray-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addSelectedCrawledLinks}
                    disabled={selectedCrawledLinks.length === 0}
                    className="px-4 py-2.5 bg-white border border-blue-200 text-[#2563EB] hover:bg-blue-50 rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Add to Analysis List
                  </button>
                  <button
                    onClick={() => handleCrawlAndAnalyzeMenu()}
                    disabled={isMenuAnalyzing}
                    className="px-5 py-2.5 bg-[#2563EB] text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#1D4ED8] disabled:bg-gray-300 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    {isMenuAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {isMenuAnalyzing ? "Analyzing..." : "AI Schema Architect"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* JSON-LD Schema Code Modal Overlay */}
      <AnimatePresence>
        {selectedTemplateForJsonLd && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTemplateForJsonLd(null)}
              className="fixed inset-0 bg-navy/30 backdrop-blur-sm z-40 transition-opacity"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-navy/10 overflow-hidden z-50 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-navy/10 bg-gradient-to-r from-blue-50 to-slate-50 flex items-center justify-between shrink-0">
                <div>
                  <span className="text-[10px] font-black text-[#2563EB] uppercase tracking-widest bg-blue-100/50 px-2.5 py-1 rounded-full">
                    Schema.org JSON-LD Code Snippet
                  </span>
                  <h2 className="text-xl font-black font-heading mt-2 text-slate-text uppercase">
                    {selectedTemplateForJsonLd.template_name}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedTemplateForJsonLd(null)}
                  className="p-2 text-gray-400 hover:text-navy hover:bg-cloud-dancer rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-900 text-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-blue-400 font-bold">
                    Primary @type: "{selectedTemplateForJsonLd.recommended_primary_schema}"
                  </span>
                  <button
                    onClick={() => {
                      const code = selectedTemplateForJsonLd.json_ld_example || `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "${selectedTemplateForJsonLd.recommended_primary_schema}",\n  "name": "${selectedTemplateForJsonLd.template_name}"\n}\n</script>`;
                      navigator.clipboard.writeText(code);
                      setCopiedJsonLd(true);
                      setTimeout(() => setCopiedJsonLd(false), 2000);
                    }}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedJsonLd ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedJsonLd ? "Copied to Clipboard!" : "Copy JSON-LD Code"}
                  </button>
                </div>

                <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed">
                  <code>{selectedTemplateForJsonLd.json_ld_example || `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "${selectedTemplateForJsonLd.recommended_primary_schema}",
  "name": "${selectedTemplateForJsonLd.template_name}",
  "url": "${selectedTemplateForJsonLd.sample_urls?.[0] || 'https://domain.com' + selectedTemplateForJsonLd.url_pattern}"
}
</script>`}</code>
                </pre>

                {selectedTemplateForJsonLd.required_schema_properties && (
                  <div className="pt-2 text-xs text-slate-300 border-t border-slate-800">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1">Required Properties for Google Rich Results:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTemplateForJsonLd.required_schema_properties.map((p, i) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-800 text-blue-300 rounded font-mono text-[10px]">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-navy/10 bg-white flex items-center justify-between shrink-0">
                <a
                  href={`https://search.google.com/test/rich-results`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Google Rich Results Testing Tool
                </a>
                <button
                  onClick={() => setSelectedTemplateForJsonLd(null)}
                  className="px-4 py-2 bg-cloud-dancer border border-navy/10 rounded-lg text-xs font-bold text-slate-slate-text uppercase tracking-widest hover:bg-gray-200 transition-colors cursor-pointer text-slate-800"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Matching URLs Explore Modal */}
      <AnimatePresence>
        {isExploreModalOpen && selectedExploreTemplate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExploreModalOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="fixed inset-x-4 bottom-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[700px] max-h-[85vh] bg-[#FAF9F6] rounded-2xl border border-navy/15 shadow-2xl z-[1000] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-navy/10 bg-white flex items-start justify-between shrink-0">
                <div className="space-y-1.5 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-blue-100 text-blue-700">
                      Explorer
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      {selectedExploreTemplate.url_pattern}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-text font-heading">
                    {selectedExploreTemplate.template_name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Below are all similar URLs that match this discovered template cluster.
                  </p>
                </div>
                <button
                  onClick={() => setIsExploreModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Bar / Utility */}
              <div className="px-6 py-4 border-b border-navy/5 bg-white/50 flex flex-col md:flex-row gap-3 items-center justify-between shrink-0">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search matching URLs..."
                    value={exploreSearchQuery}
                    onChange={(e) => setExploreSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-white border border-navy/10 rounded-lg text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
                  <button
                    onClick={() => {
                      const urlsToCopy = (selectedExploreTemplate.all_matching_urls || selectedExploreTemplate.sample_urls || []).join("\n");
                      navigator.clipboard.writeText(urlsToCopy);
                      setCopiedAll(true);
                      setTimeout(() => setCopiedAll(false), 2000);
                    }}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-navy/10 rounded-lg text-xs font-bold text-slate-text hover:bg-gray-50 transition-colors cursor-pointer shadow-sm min-w-[120px]"
                  >
                    {copiedAll ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-600">Copied All!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-gray-500" />
                        Copy All URLs
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Scrollable list */}
              <div className="p-6 flex-1 overflow-y-auto space-y-2">
                {(() => {
                  const allUrls = selectedExploreTemplate.all_matching_urls || selectedExploreTemplate.sample_urls || [];
                  const filtered = allUrls.filter(u => u.toLowerCase().includes(exploreSearchQuery.toLowerCase().trim()));

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center text-gray-400">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-60" />
                        <span className="text-xs font-medium">No pages matched your search query.</span>
                      </div>
                    );
                  }

                  return filtered.map((url, index) => (
                    <div 
                      key={index}
                      className="bg-white p-3 rounded-xl border border-navy/5 flex items-center justify-between gap-4 hover:border-blue-200 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[10px] font-mono text-gray-400 shrink-0 w-6 text-right">
                          #{index + 1}
                        </span>
                        <span className="text-xs text-gray-700 font-mono truncate select-all">
                          {url}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        {(() => {
                          const templates = result ? (result.templates || []) : [];
                          let isPageRegistered = false;
                          try {
                            const uObj = new URL(url);
                            const path = uObj.pathname;
                            isPageRegistered = templates.some(t => {
                              const p = t.url_pattern.toLowerCase();
                              return p === url.toLowerCase() || p === path.toLowerCase();
                            });
                          } catch {
                            isPageRegistered = templates.some(t => t.url_pattern.toLowerCase() === url.toLowerCase());
                          }

                          return isPageRegistered ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Registered
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                await handleInjectCustomPattern(url);
                              }}
                              className="px-2 py-1 bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/20 hover:bg-[#2563EB] hover:text-white rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                              title="Register individual page as a unique template schema"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              Register Page
                            </button>
                          );
                        })()}

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(url);
                            setCopiedIndex(index);
                            setTimeout(() => setCopiedIndex(null), 1500);
                          }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors cursor-pointer w-7 h-7 flex items-center justify-center"
                          title="Copy Link"
                        >
                          {copiedIndex === index ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors flex items-center justify-center w-7 h-7"
                          title="Open Link in New Tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-navy/10 bg-white flex items-center justify-between shrink-0">
                <span className="text-[11px] font-semibold text-gray-400">
                  Total of { (selectedExploreTemplate.all_matching_urls || selectedExploreTemplate.sample_urls || []).length } pages in cluster
                </span>
                <button
                  onClick={() => setIsExploreModalOpen(false)}
                  className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#1D4ED8] transition-colors cursor-pointer shadow-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
