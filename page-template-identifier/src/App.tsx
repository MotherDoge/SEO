/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, ChangeEvent } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
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
  ExternalLink,
  Copy,
  Database,
  Upload,
  Download
} from "lucide-react";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Template {
  template_name: string;
  url_pattern: string;
  recommended_primary_schema: string;
  sample_urls: string[];
}

interface AnalysisResult {
  domain_analyzed: string;
  total_templates_discovered: number;
  templates: Template[];
  reasoning: string;
}

export default function App() {
  const [urls, setUrls] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [discoveryUrl, setDiscoveryUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      for (const url of sitemapUrls) {
        try {
          const response = await fetch("/api/fetch-sitemap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });

          const data = await response.json();

          if (!response.ok) {
            errors.push(`${url}: ${data.error || "Failed to fetch"}`);
            continue;
          }

          if (data.type === 'index') {
            indexFilesFound.push(url);
            allFetchedUrls = [...allFetchedUrls, ...data.urls];
          } else {
            allFetchedUrls = [...allFetchedUrls, ...data.urls];
          }
        } catch (err: any) {
          errors.push(`${url}: ${err.message}`);
        }
      }

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
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze these URLs and cluster them into structural templates:
        
        ${urlsToAnalyze}`,
        config: {
          systemInstruction: `Role: You are the "Domain Template Mapper," an advanced SEO crawler and URL clustering AI.
Objective: The user will provide a raw list of URLs from a website's XML sitemap. Your job is to analyze the URL slugs, group them into distinct structural clusters, and identify the underlying "Page Template" for each cluster.
Core Logic & Rules:
1. Identify Home Page: Explicitly identify the root URL (e.g., https://example.com/) as its own template (usually "Homepage / Brand Root") and assign appropriate global schema like WebSite, Organization, or MedicalOrganization depending on the domain context.
2. Cluster by Pattern: Group URLs that share the same subdirectories (e.g., /product/, /p/, /item/ all belong to an E-commerce Product cluster).
3. Deduce Page Intent: Look at the words in the URL slugs to determine what the page is (e.g., /locations/dallas = LocalBusiness, /blog/how-to-tie-shoes = Article/HowTo, /dr-smith = Physician).
4. Map to Schema.org: For every cluster you identify, assign the primary Schema.org @type that should be applied to that template.
5. Consolidate & Strictness: Do not output 500 URLs. Output only the unique templates you discovered. Prioritize broad structural patterns over minor slug variations. Group similar layouts (e.g., /tag/ and /category/) together if they represent the same page layout.
6. Reasoning: Provide a "CoT Reasoning" (Chain of Thought) explanation of how you identified these clusters, what patterns you saw in the slugs, and why you assigned specific Schema types.
7. Output: You must return the data strictly in the requested JSON format. Your goal is maximum consistency; identical URL lists should ideally yield identical template clusters.

Few-Shot Example:
User Input:
https://www.orlandohealth.com/
https://www.orlandohealth.com/facilities/lake-mary-hospital
https://www.orlandohealth.com/facilities/orlando-regional-medical-center
https://www.orlandohealth.com/services/cancer-institute
https://www.orlandohealth.com/services/heart-institute
https://www.orlandohealth.com/physician-finder/john-doe-md
https://www.orlandohealth.com/physician-finder/jane-smith-do
https://www.orlandohealth.com/blog/5-tips-for-heart-health

Model Output:
{
  "domain_analyzed": "orlandohealth.com",
  "total_templates_discovered": 5,
  "reasoning": "I identified 5 distinct clusters by analyzing the URL path segments. '/facilities/' consistently maps to physical locations (Hospital), '/services/' maps to medical departments (MedicalClinic), '/physician-finder/' contains individual names (Physician), and '/blog/' follows a standard article structure. The root URL is the brand homepage.",
  "templates":[
    {
      "template_name": "Homepage / Brand Root",
      "url_pattern": "/",
      "recommended_primary_schema": "MedicalOrganization",
      "sample_urls": ["https://www.orlandohealth.com/"]
    },
    {
      "template_name": "Hospital Location Page",
      "url_pattern": "/facilities/*",
      "recommended_primary_schema": "Hospital",
      "sample_urls":["https://www.orlandohealth.com/facilities/lake-mary-hospital"]
    },
    {
      "template_name": "Medical Department / Service",
      "url_pattern": "/services/*",
      "recommended_primary_schema": "MedicalClinic",
      "sample_urls":["https://www.orlandohealth.com/services/cancer-institute"]
    },
    {
      "template_name": "Physician Profile",
      "url_pattern": "/physician-finder/*",
      "recommended_primary_schema": "Physician",
      "sample_urls":["https://www.orlandohealth.com/physician-finder/john-doe-md"]
    },
    {
      "template_name": "Blog Post / Article",
      "url_pattern": "/blog/*",
      "recommended_primary_schema": "MedicalWebPage",
      "sample_urls":["https://www.orlandohealth.com/blog/5-tips-for-heart-health"]
    }
  ]
}`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              domain_analyzed: { type: Type.STRING },
              total_templates_discovered: { type: Type.INTEGER },
              reasoning: { type: Type.STRING },
              templates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    template_name: { type: Type.STRING },
                    url_pattern: { type: Type.STRING },
                    recommended_primary_schema: { type: Type.STRING },
                    sample_urls: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["template_name", "url_pattern", "recommended_primary_schema", "sample_urls"]
                }
              }
            },
            required: ["domain_analyzed", "total_templates_discovered", "reasoning", "templates"]
          },
          temperature: 0.1,
          seed: 42
        }
      });

      const data = JSON.parse(response.text);
      setResult(data);
      
      if (isTruncated) {
        setError(`Note: Analyzed a representative sample of ${MAX_URLS_FOR_ANALYSIS} URLs out of ${allUrls.length.toLocaleString()} total to stay within processing limits.`);
      }
    } catch (err: any) {
      console.error("Analysis failed:", err);
      if (err.message?.includes("token count exceeds")) {
        setError("The URL list is too large for the AI to process at once. I've tried to sample it, but it's still too big. Try reducing the list manually.");
      } else {
        setError("Failed to analyze URLs. Please check your input and try again.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
    const rows = result.templates.map(t => [
      `"${t.template_name.replace(/"/g, '""')}"`,
      `"${t.url_pattern.replace(/"/g, '""')}"`,
      `"${t.recommended_primary_schema.replace(/"/g, '""')}"`,
      `"${t.sample_urls.join('; ').replace(/"/g, '""')}"`
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="h-16 bg-white border-bottom border-border flex items-center px-6 justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-accent tracking-tight">Schema Identifier</span>
        </div>
        
        {result && (
          <div className="flex items-center gap-4">
            <div className="bg-accent-light text-accent px-3 py-1.5 rounded-full text-sm font-semibold border border-accent/10">
              analyzing: {result.domain_analyzed}
            </div>
            <div className="text-text-muted text-sm flex items-center gap-2">
              Status: <span className="text-success font-bold flex items-center gap-1.5">
                <div className="w-2 h-2 bg-success rounded-full" />
                Complete
              </span>
            </div>
          </div>
        )}
      </nav>

      <div className="flex-grow grid grid-cols-[280px_1fr] overflow-hidden">
        {/* Sidebar */}
        <aside className="bg-white border-r border-border p-6 overflow-y-auto">
          <h3 className="text-sm font-bold text-text-main uppercase tracking-wider mb-6">Crawler Overview</h3>
          
          <div className="space-y-4 mb-8">
            <div className="stat-card">
              <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1">Templates Discovered</p>
              <p className="text-2xl font-bold">{result?.total_templates_discovered || 0}</p>
            </div>
            <div className="stat-card">
              <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1">URLs Analyzed</p>
              <p className="text-2xl font-bold">{urls.split('\n').filter(l => l.trim()).length.toLocaleString()}</p>
            </div>
          </div>

          <div className="text-[11px] text-text-muted leading-relaxed bg-bg p-4 rounded-lg border border-border/50">
            Identification logic based on structural subdirectories and slug keyword frequency.
          </div>

          <div className="mt-8">
            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4">Auto-Fetch Sitemap</h3>
            <div className="flex flex-col gap-2 mb-6">
              <textarea
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="Paste sitemap URLs (one per line)..."
                className="w-full h-24 p-2 bg-bg rounded-lg border border-border focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-[11px] resize-none"
              />
              <button
                onClick={fetchSitemap}
                disabled={isFetching || !sitemapUrl.trim()}
                className="w-full py-2 bg-white border border-border rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : "Fetch All"}
              </button>
            </div>

            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4">Manual Discovery</h3>
            <div className="flex flex-col gap-2 mb-6">
              <textarea
                value={discoveryUrl}
                onChange={(e) => setDiscoveryUrl(e.target.value)}
                placeholder="Paste missing URLs (one per line)..."
                className="w-full h-24 p-2 bg-bg rounded-lg border border-border focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-[11px] resize-none"
              />
              <button
                onClick={addDiscoveryUrl}
                disabled={!discoveryUrl.trim()}
                className="w-full py-2 bg-white border border-border rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Add to List
              </button>
            </div>

            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4">GSC URL Upload</h3>
            <div className="mb-6">
              <label className="flex flex-col items-center justify-center w-full h-12 border-2 border-dashed border-border rounded-lg cursor-pointer bg-bg hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <Upload className="w-3 h-3 text-text-muted" />
                  <span className="text-[10px] font-bold text-text-muted uppercase">Upload GSC CSV/TXT</span>
                </div>
                <input type="file" className="hidden" accept=".csv,.txt" onChange={handleGscUpload} />
              </label>
            </div>

            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4">Unified URL List</h3>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="Sitemap + Discovery URLs..."
              className="w-full h-48 p-3 bg-bg rounded-lg border border-border focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all font-mono text-[11px] resize-none"
            />
            <button
              onClick={analyzeSitemap}
              disabled={isAnalyzing || !urls.trim()}
              className="w-full mt-4 py-3 bg-accent hover:bg-accent/90 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-sm rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
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
        <main className="p-8 overflow-y-auto bg-bg">
          <AnimatePresence mode="wait">
            {!result && !isAnalyzing && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center"
              >
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-border mb-4">
                  <Layout className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-text-main mb-2">Ready for Analysis</h3>
                <p className="text-text-muted max-w-sm">Paste your sitemap URLs in the sidebar and click "Run Analysis" to begin clustering.</p>
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
                  <div className="w-16 h-16 border-4 border-accent/10 border-t-accent rounded-full animate-spin" />
                  <Database className="w-6 h-6 text-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <h3 className="text-xl font-bold text-text-main mb-2">Mapping Domain Templates</h3>
                <p className="text-text-muted animate-pulse">Analyzing URL patterns and page intent...</p>
              </motion.div>
            )}

            {result && (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between bg-amber-50 border border-amber-100 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-900">Sitemap Completeness Check</p>
                      <p className="text-[11px] text-amber-700">Sitemaps often miss deep pages. Use "Manual Discovery" to add URLs you've found while browsing or upload a .csv file from your Google Search Console export.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <h2 className="text-lg font-bold text-text-main">Detected Page Templates</h2>
                  <span className="text-[11px] text-text-muted">Last updated: {new Date().toLocaleDateString()}</span>
                </div>

                <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-border">
                        <th className="px-6 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest w-[35%]">Template & Pattern</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest w-[25%]">Recommended Schema</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest w-[40%]">Sample URLs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.templates.map((template, idx) => (
                        <tr key={idx} className="border-b border-border last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="block font-bold text-text-main mb-1.5">{template.template_name}</span>
                            <span className="url-pattern">{template.url_pattern}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="schema-tag">@{template.recommended_primary_schema}</span>
                          </td>
                          <td className="px-6 py-4">
                            <ul className="space-y-1.5">
                              {template.sample_urls.map((url, uIdx) => (
                                <li key={uIdx} className="flex items-center gap-2 group/url">
                                  <div className="w-1 h-1 bg-border rounded-full shrink-0" />
                                  <span className="text-[11px] text-text-muted font-mono truncate max-w-[300px]">{url}</span>
                                  <a 
                                    href={url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="opacity-0 group-hover/url:opacity-100 transition-opacity text-accent"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* CoT Reasoning Box */}
                <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-accent-light rounded-md">
                      <Code className="w-4 h-4 text-accent" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">CoT Reasoning</h3>
                  </div>
                  <p className="text-sm text-text-muted leading-relaxed">
                    {result.reasoning}
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button 
                    onClick={downloadJson}
                    className="px-4 py-2 bg-white border border-border rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Download JSON
                  </button>
                  <button 
                    onClick={downloadCsv}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-bold hover:bg-accent/90 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Export to Schema Architect (.CSV)
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
