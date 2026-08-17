import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { parseStringPromise } from "xml2js";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import zlib from "zlib";
import { GoogleGenAI, Type } from "@google/genai";

const execPromise = promisify(exec);

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

const apiRequestLogs: RequestLog[] = [];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper to fetch and decompress sitemap content (supports .xml and .xml.gz files)
  async function fetchSitemapXmlContent(rawUrl: string): Promise<{ xmlString: string; isGzip: boolean }> {
    let targetUrl = rawUrl.trim();
    if (targetUrl.startsWith('ttps://')) {
      targetUrl = 'h' + targetUrl;
    } else if (targetUrl.startsWith('ttp://')) {
      targetUrl = 'h' + targetUrl;
    } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
    }

    const headerStrategies = [
      {
        'User-Agent': 'Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)',
        'Accept': 'text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.google.com/'
      },
      {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/xml,application/xml,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      },
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Upgrade-Insecure-Requests': '1'
      }
    ];

    let rawBuffer: Buffer | null = null;
    let fetchError: any = null;

    for (let i = 0; i < headerStrategies.length; i++) {
      try {
        const response = await axios.get(targetUrl, {
          headers: headerStrategies[i],
          timeout: 12000,
          maxRedirects: 5,
          responseType: 'arraybuffer'
        });
        rawBuffer = Buffer.from(response.data);
        fetchError = null;
        break;
      } catch (err: any) {
        fetchError = err;
        if (err.response?.status === 404) break;
      }
    }

    if (fetchError && fetchError.response?.status !== 404) {
      try {
        const escapedUrl = targetUrl.replace(/'/g, "'\\''");
        const ua = "Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)";
        const cmd = `curl -L -s -k -m 20 --compressed -A '${ua}' -H 'Accept: text/xml,application/xml,application/xhtml+xml,*/*;q=0.8' '${escapedUrl}'`;
        const { stdout } = await execPromise(cmd, { maxBuffer: 30 * 1024 * 1024, encoding: 'buffer' });
        if (stdout && stdout.length > 0) {
          rawBuffer = Buffer.from(stdout);
          fetchError = null;
        }
      } catch (curlErr: any) {
        console.error("Curl fallback failed for", targetUrl, curlErr.message);
      }
    }

    if (!rawBuffer || rawBuffer.length === 0) {
      throw fetchError || new Error(`Failed to fetch sitemap from ${targetUrl}`);
    }

    let isGzip = false;
    let xmlString = "";

    // Check for gzip header magic bytes (0x1f 0x8b) or file extension
    const isGzipMagic = rawBuffer.length >= 2 && rawBuffer[0] === 0x1f && rawBuffer[1] === 0x8b;
    if (isGzipMagic || targetUrl.toLowerCase().endsWith('.gz')) {
      try {
        xmlString = zlib.gunzipSync(rawBuffer).toString('utf-8');
        isGzip = true;
      } catch {
        try {
          xmlString = zlib.unzipSync(rawBuffer).toString('utf-8');
          isGzip = true;
        } catch {
          xmlString = rawBuffer.toString('utf-8');
        }
      }
    } else {
      xmlString = rawBuffer.toString('utf-8');
    }

    return { xmlString: xmlString.trim(), isGzip };
  }

  // Parse XML details and separate child sitemaps vs leaf page URLs
  async function parseSitemapXmlDetails(xmlRaw: string, sourceUrl: string) {
    const xmlData = xmlRaw.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    let childSitemaps: string[] = [];
    let pageUrls: string[] = [];
    let isIndex = false;

    try {
      const result = await parseStringPromise(xmlData);
      isIndex = xmlData.includes('<sitemapindex') || (result && result.sitemapindex !== undefined);

      if (result && result.sitemapindex && result.sitemapindex.sitemap) {
        const maps = Array.isArray(result.sitemapindex.sitemap) ? result.sitemapindex.sitemap : [result.sitemapindex.sitemap];
        for (const m of maps) {
          const loc = m.loc ? (Array.isArray(m.loc) ? m.loc[0] : m.loc) : null;
          const u = typeof loc === 'string' ? loc : (loc && loc._ ? loc._ : null);
          if (u && typeof u === 'string' && u.trim()) {
            childSitemaps.push(u.trim());
          }
        }
      }

      if (result && result.urlset && result.urlset.url) {
        const urlsArr = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
        for (const uObj of urlsArr) {
          const loc = uObj.loc ? (Array.isArray(uObj.loc) ? uObj.loc[0] : uObj.loc) : null;
          const u = typeof loc === 'string' ? loc : (loc && loc._ ? loc._ : null);
          if (u && typeof u === 'string' && u.trim()) {
            pageUrls.push(u.trim());
          }
        }
      }
    } catch {
      // Ignore XML parser error and fall back to regex
    }

    // Regex fallback if empty
    if (childSitemaps.length === 0 && pageUrls.length === 0) {
      const sitemapLocRegex = /<sitemap[^>]*>[\s\S]*?<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
      let match;
      while ((match = sitemapLocRegex.exec(xmlData)) !== null) {
        childSitemaps.push(match[1].trim());
      }

      if (childSitemaps.length > 0) {
        isIndex = true;
      } else {
        const urlLocRegex = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
        while ((match = urlLocRegex.exec(xmlData)) !== null) {
          pageUrls.push(match[1].trim());
        }
      }
    }

    childSitemaps = Array.from(new Set(childSitemaps));
    pageUrls = Array.from(new Set(pageUrls));
    if (childSitemaps.length > 0) isIndex = true;

    return {
      url: sourceUrl,
      isIndex,
      childSitemaps,
      pageUrls
    };
  }

  // API endpoint to fetch and parse sitemap
  app.post("/api/fetch-sitemap", async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const { xmlString } = await fetchSitemapXmlContent(url);

      if (xmlString.toLowerCase().startsWith('<!doctype html') || xmlString.toLowerCase().startsWith('<html')) {
        return res.status(400).json({ 
          error: "The URL provided returned an HTML page instead of a Sitemap XML. Please ensure you are using the direct link to the .xml file." 
        });
      }

      const parsed = await parseSitemapXmlDetails(xmlString, url);
      const combinedUrls = parsed.isIndex ? parsed.childSitemaps : parsed.pageUrls;

      res.json({ 
        type: parsed.isIndex ? 'index' : 'urlset',
        urls: combinedUrls 
      });
    } catch (error: any) {
      console.error("Error fetching sitemap:", error.message);
      const status = error.response?.status;
      
      let message = `Failed to fetch sitemap (${status || 'Error'}). ${error.message}`;
      if (status === 403) {
        message = "Access Forbidden (403). The website is blocking the request (e.g. Cloudflare firewall).";
      } else if (status === 404) {
        message = "Sitemap Not Found (404). Please verify that the URL is correct.";
      }
      
      res.status(status || 500).json({ error: message });
    }
  });

  // Concurrency worker helper for parallel thread-like execution without hitting memory/rate limits
  async function mapConcurrent<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
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
          results[i] = { error: err.message || "Parallel task execution failed" } as any;
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  // API endpoint for multi-level nested sitemap tree extraction (Parallel Processing Enabled)
  app.post("/api/extract-nested-sitemap", async (req, res) => {
    const { urls, maxDepth = 4, maxSitemapsPerLevel = 100 } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "Please provide at least one starting sitemap URL" });
    }

    const startTime = Date.now();
    const rows: Array<{
      id: string;
      level1: string;
      level2?: string;
      level3?: string;
      level4?: string;
      type: 'sitemap' | 'url';
      childCount?: number;
      error?: string;
    }> = [];

    const allLeafUrls: string[] = [];
    const cleanStartUrls = urls.map((u: string) => u.trim()).filter((u: string) => u.length > 0);

    // Thread-safe per-request sitemap cache to prevent duplicate fetches
    const sitemapCache = new Map<string, Promise<{ xmlString: string; isGzip: boolean }>>();
    const getCachedSitemapXml = (targetUrl: string) => {
      const key = targetUrl.trim();
      if (!sitemapCache.has(key)) {
        sitemapCache.set(key, fetchSitemapXmlContent(key));
      }
      return sitemapCache.get(key)!;
    };

    // Level 1 Parallel Pool (Concurrency 5)
    await mapConcurrent(cleanStartUrls, 5, async (l1Url) => {
      try {
        const { xmlString: xmlL1 } = await getCachedSitemapXml(l1Url);
        const parsedL1 = await parseSitemapXmlDetails(xmlL1, l1Url);

        if (parsedL1.isIndex && parsedL1.childSitemaps.length > 0) {
          const l2List = parsedL1.childSitemaps.slice(0, maxSitemapsPerLevel);

          // Level 2 Parallel Pool (Concurrency 10 parallel threads)
          await mapConcurrent(l2List, 10, async (l2Url) => {
            if (maxDepth < 2) {
              rows.push({
                id: `${rows.length + 1}`,
                level1: l1Url,
                level2: l2Url,
                type: 'sitemap'
              });
              return;
            }

            try {
              const { xmlString: xmlL2 } = await getCachedSitemapXml(l2Url);
              const parsedL2 = await parseSitemapXmlDetails(xmlL2, l2Url);

              if (parsedL2.isIndex && parsedL2.childSitemaps.length > 0) {
                const l3List = parsedL2.childSitemaps.slice(0, maxSitemapsPerLevel);

                // Level 3 Parallel Pool (Concurrency 10 parallel threads)
                await mapConcurrent(l3List, 10, async (l3Url) => {
                  if (maxDepth < 3) {
                    rows.push({
                      id: `${rows.length + 1}`,
                      level1: l1Url,
                      level2: l2Url,
                      level3: l3Url,
                      type: 'sitemap'
                    });
                    return;
                  }

                  try {
                    const { xmlString: xmlL3 } = await getCachedSitemapXml(l3Url);
                    const parsedL3 = await parseSitemapXmlDetails(xmlL3, l3Url);

                    if (parsedL3.isIndex && parsedL3.childSitemaps.length > 0) {
                      const l4List = parsedL3.childSitemaps.slice(0, maxSitemapsPerLevel);
                      for (const l4Url of l4List) {
                        rows.push({
                          id: `${rows.length + 1}`,
                          level1: l1Url,
                          level2: l2Url,
                          level3: l3Url,
                          level4: l4Url,
                          type: 'sitemap'
                        });
                      }
                    } else if (parsedL3.pageUrls.length > 0) {
                      parsedL3.pageUrls.forEach(p => allLeafUrls.push(p));
                      rows.push({
                        id: `${rows.length + 1}`,
                        level1: l1Url,
                        level2: l2Url,
                        level3: l3Url,
                        level4: `${parsedL3.pageUrls.length} Page URLs (e.g. ${parsedL3.pageUrls[0]})`,
                        type: 'url',
                        childCount: parsedL3.pageUrls.length
                      });
                    } else {
                      rows.push({
                        id: `${rows.length + 1}`,
                        level1: l1Url,
                        level2: l2Url,
                        level3: l3Url,
                        type: 'sitemap',
                        childCount: 0
                      });
                    }
                  } catch (errL3: any) {
                    rows.push({
                      id: `${rows.length + 1}`,
                      level1: l1Url,
                      level2: l2Url,
                      level3: l3Url,
                      type: 'sitemap',
                      error: errL3.message
                    });
                  }
                });
              } else if (parsedL2.pageUrls.length > 0) {
                parsedL2.pageUrls.forEach(p => allLeafUrls.push(p));
                rows.push({
                  id: `${rows.length + 1}`,
                  level1: l1Url,
                  level2: l2Url,
                  level3: `${parsedL2.pageUrls.length} Page URLs (e.g. ${parsedL2.pageUrls[0]})`,
                  type: 'url',
                  childCount: parsedL2.pageUrls.length
                });
              } else {
                rows.push({
                  id: `${rows.length + 1}`,
                  level1: l1Url,
                  level2: l2Url,
                  type: 'sitemap',
                  childCount: 0
                });
              }
            } catch (errL2: any) {
              rows.push({
                id: `${rows.length + 1}`,
                level1: l1Url,
                level2: l2Url,
                type: 'sitemap',
                error: errL2.message
              });
            }
          });
        } else if (parsedL1.pageUrls.length > 0) {
          parsedL1.pageUrls.forEach(p => allLeafUrls.push(p));
          rows.push({
            id: `${rows.length + 1}`,
            level1: l1Url,
            level2: `${parsedL1.pageUrls.length} Page URLs (e.g. ${parsedL1.pageUrls[0]})`,
            type: 'url',
            childCount: parsedL1.pageUrls.length
          });
        } else {
          rows.push({
            id: `${rows.length + 1}`,
            level1: l1Url,
            type: 'sitemap',
            childCount: 0
          });
        }
      } catch (errL1: any) {
        rows.push({
          id: `${rows.length + 1}`,
          level1: l1Url,
          type: 'sitemap',
          error: errL1.message
        });
      }
    });

    const durationMs = Date.now() - startTime;

    res.json({
      summary: {
        totalLevel1: cleanStartUrls.length,
        totalRows: rows.length,
        totalLeafUrls: allLeafUrls.length,
        durationMs
      },
      rows,
      leafUrls: Array.from(new Set(allLeafUrls))
    });
  });

  // Helper sleep function for retries
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Smart deterministic URL template clustering (like operating on a spreadsheet)
  function clusterRawUrls(rawUrls: string[]) {
    let domainAnalyzed = "unknown-domain.com";
    for (const rawUrl of rawUrls) {
      try {
        const trimmed = rawUrl.trim();
        if (!trimmed) continue;
        const u = new URL(trimmed.startsWith("http") ? trimmed : "https://" + trimmed);
        if (u.hostname) {
          domainAnalyzed = u.hostname.replace(/^www\./i, "");
          break;
        }
      } catch {
        // ignore
      }
    }

    // Parse each URL and strip domain
    const parsedUrls = rawUrls.map(u => {
      let pathname = "/";
      const trimmed = u.trim();
      try {
        const parsed = new URL(trimmed.startsWith("http") ? trimmed : "https://" + trimmed);
        pathname = parsed.pathname;
      } catch {
        let clean = trimmed.replace(/^(https?:\/\/)?(www\.)?[^\/]+/, '');
        if (!clean.startsWith('/')) clean = '/' + clean;
        pathname = clean.split('?')[0].split('#')[0];
      }
      
      // Normalize trailing slashes
      let normalizedPath = pathname;
      if (normalizedPath !== "/" && normalizedPath.endsWith("/")) {
        normalizedPath = normalizedPath.slice(0, -1);
      }
      if (!normalizedPath.startsWith("/")) {
        normalizedPath = "/" + normalizedPath;
      }
      
      return { original: trimmed, pathname: normalizedPath };
    }).filter(item => item.original.length > 0);

    // Group by path segments
    const pathSegments = parsedUrls.map(item => {
      const segments = item.pathname.split('/').filter(Boolean);
      return { ...item, segments };
    });

    // Calculate cardinality of segments at each position grouped by parent prefix
    const segmentValueCounts: Record<string, Set<string>> = {};
    pathSegments.forEach(item => {
      item.segments.forEach((seg, idx) => {
        const parentPrefix = item.segments.slice(0, idx).join('/');
        const key = `pos:${idx}_parent:${parentPrefix}`;
        if (!segmentValueCounts[key]) {
          segmentValueCounts[key] = new Set();
        }
        segmentValueCounts[key].add(seg.toLowerCase());
      });
    });

    // Dictionary of common static SEO paths to preserve
    const staticKeywords = new Set([
      "about", "contact", "blog", "news", "api", "v1", "v2", "search", "category", "tag", 
      "shop", "products", "product", "uses", "solutions", "solution", "use-case", "use-cases",
      "resources", "resource", "features", "feature", "platform", "teams", "team", "apps", "integration", "integrations",
      "compare", "versus", "vs", "services", "locations", "careers", "privacy", "terms", "help", 
      "faq", "home", "index", "feed", "sitemap", "user", "login", "register", "cart", "checkout",
      "facilities", "physician-finder", "doctor", "profile", "events", "support", "p", "c"
    ]);

    const getPattern = (segments: string[]): string => {
      if (segments.length === 0) return "/";
      
      const patternSegments = segments.map((seg, idx) => {
        const hasNumber = /\d+/.test(seg);
        const parentPrefix = segments.slice(0, idx).join('/');
        const key = `pos:${idx}_parent:${parentPrefix}`;
        const uniqueValuesCount = segmentValueCounts[key]?.size || 0;

        // If any of the parent segments is a known dynamic prefix, the current segment is a dynamic child
        const parentSegmentsLower = segments.slice(0, idx).map(s => s.toLowerCase());
        const hasDynamicParent = parentSegmentsLower.some(parentSeg => 
          parentSeg === "p" || 
          parentSeg === "c" || 
          parentSeg === "product" || 
          parentSeg === "products" || 
          parentSeg === "resources" ||
          parentSeg === "resource" ||
          parentSeg === "category" || 
          parentSeg === "categories" || 
          parentSeg === "tag" || 
          parentSeg === "tags" || 
          parentSeg === "item" || 
          parentSeg === "items" || 
          parentSeg === "post" || 
          parentSeg === "posts" || 
          parentSeg === "article" || 
          parentSeg === "articles" || 
          parentSeg === "blog" || 
          parentSeg === "brand" || 
          parentSeg === "brands" ||
          parentSeg === "location" ||
          parentSeg === "locations" ||
          parentSeg === "store" ||
          parentSeg === "stores" ||
          parentSeg === "facility" ||
          parentSeg === "facilities" ||
          parentSeg === "city" ||
          parentSeg === "cities" ||
          parentSeg === "state" ||
          parentSeg === "states" ||
          parentSeg === "service-area" ||
          parentSeg === "service-areas" ||
          parentSeg === "uses" ||
          parentSeg === "solutions" ||
          parentSeg === "use-cases" ||
          parentSeg === "teams"
        );

        if (hasDynamicParent) {
          return "*";
        }

        const usStates = new Set([
          "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new-hampshire", "new-jersey", "new-mexico", "new-york", "north-carolina", "north-dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode-island", "south-carolina", "south-dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west-virginia", "wisconsin", "wyoming",
          "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy"
        ]);

        if (usStates.has(seg.toLowerCase())) {
          return "*";
        }

        // Check if the segment looks like a city/state combo (e.g., chicago-il, or dallas-tx)
        if (/^[a-z\-]+-[a-z]{2}$/i.test(seg) || /^[a-z]{2}-[a-z\-]+$/i.test(seg)) {
          return "*";
        }

        // If it contains a number, it's definitely dynamic (like a post-123 ID)
        if (hasNumber) {
          return "*";
        }
        
        // If segment varies (cardinality >= 2) and is not a known common static keyword
        if (uniqueValuesCount >= 2 && !staticKeywords.has(seg.toLowerCase())) {
          return "*";
        }
        
        return seg;
      });

      // Collapse duplicate consecutive stars
      let collapsed: string[] = [];
      patternSegments.forEach(seg => {
        if (seg === "*" && collapsed[collapsed.length - 1] === "*") {
          // skip
        } else {
          collapsed.push(seg);
        }
      });

      return "/" + collapsed.join('/');
    };

    const patternGroups: Record<string, { originalUrls: string[] }> = {};
    pathSegments.forEach(item => {
      const pattern = getPattern(item.segments);
      if (!patternGroups[pattern]) {
        patternGroups[pattern] = { originalUrls: [] };
      }
      patternGroups[pattern].originalUrls.push(item.original);
    });

    // Convert to sorted cluster objects
    let clusters = Object.entries(patternGroups).map(([pattern, data]) => {
      const samples = Array.from(new Set(data.originalUrls)).slice(0, 3);
      return {
        pattern,
        samples,
        count: data.originalUrls.length,
        all_urls: data.originalUrls
      };
    });

    // Limit to top 40 templates to prevent over-segmentation and stay within constraints
    if (clusters.length > 40) {
      clusters.sort((a, b) => b.count - a.count);
      clusters = clusters.slice(0, 40);
    }

    // Sort: homepage first, then segment length, then url count
    clusters.sort((a, b) => {
      if (a.pattern === "/") return -1;
      if (b.pattern === "/") return 1;
      const segmentsA = a.pattern.split('/').filter(Boolean).length;
      const segmentsB = b.pattern.split('/').filter(Boolean).length;
      if (segmentsA !== segmentsB) {
        return segmentsA - segmentsB;
      }
      return b.count - a.count;
    });

    return { domainAnalyzed, clusters };
  }

  // Helper to map clustered URL patterns deterministically to names and Schema types
  function getDeterministicSchemaAndName(pattern: string, domain: string, sampleUrls?: string[]): { template_name: string; recommended_primary_schema: string } {
    const lowercasePattern = pattern.toLowerCase();
    const cleanPattern = lowercasePattern.replace(/[\/*]/g, "").trim();
    const isMedical = /health|hospital|medical|clinic|doctor|physician/i.test(domain);

    const urlsToCheck = sampleUrls || [];
    const hasResourceUrl = urlsToCheck.some(url => {
      const u = url.toLowerCase();
      return u.includes("/resources/") || u.includes("/resource/") || u.endsWith("/resources") || u.endsWith("/resource") || /\/resources\?/.test(u);
    });
    const hasInteractiveToolUrl = urlsToCheck.some(url => {
      const u = url.toLowerCase();
      return u.includes("calculator") || u.includes("tool") || u.includes("roi") || u.includes("estimator");
    });

    const isUtilityPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower === "/cart" ||
        patLower === "/checkout" ||
        patLower === "/login" ||
        patLower === "/signin" ||
        patLower === "/signup" ||
        patLower === "/register" ||
        patLower === "/my-account" ||
        patLower === "/account" ||
        patLower === "/admin" ||
        patLower.startsWith("/cart/") ||
        patLower.startsWith("/checkout/") ||
        patLower.startsWith("/login/") ||
        patLower.startsWith("/signin/") ||
        patLower.startsWith("/signup/") ||
        patLower.startsWith("/register/") ||
        patLower.startsWith("/account/") ||
        patLower.startsWith("/admin/") ||
        patLower.includes("/cart/*") ||
        patLower.includes("/checkout/*") ||
        patLower.includes("/account/*") ||
        patLower.includes("/admin/*") ||
        patParts.includes("cart") ||
        patParts.includes("checkout") ||
        patParts.includes("login") ||
        patParts.includes("signin") ||
        patParts.includes("signup") ||
        patParts.includes("register") ||
        patParts.includes("account") ||
        patParts.includes("admin") ||
        urlsToCheck.some(url => {
          const u = url.toLowerCase();
          return u.includes("/cart") || u.includes("/checkout") || u.includes("/login") || u.includes("/signin") || u.includes("/signup") || u.includes("/register") || u.includes("/account") || u.includes("/admin");
        })
      );
    };

    const isItineraryPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower === "/itinerary" ||
        patLower === "/itineraries" ||
        patLower === "/journey" ||
        patLower === "/journeys" ||
        patLower === "itinerary" ||
        patLower === "itineraries" ||
        patLower === "journey" ||
        patLower === "journeys" ||
        patLower === "/trips" ||
        patLower === "/trip" ||
        patLower.startsWith("/itinerary/") ||
        patLower.startsWith("/itineraries/") ||
        patLower.startsWith("/journey/") ||
        patLower.startsWith("/journeys/") ||
        patLower.startsWith("/trips/") ||
        patLower.startsWith("/trip/") ||
        patLower.includes("/itinerary/*") ||
        patLower.includes("/itineraries/*") ||
        patLower.includes("/journey/*") ||
        patLower.includes("/journeys/*") ||
        patLower.includes("/trips/*") ||
        patLower.includes("/trip/*") ||
        patParts.includes("itinerary") ||
        patParts.includes("itineraries") ||
        patParts.includes("journey") ||
        patParts.includes("journeys") ||
        patParts.includes("trips") ||
        patParts.includes("trip") ||
        urlsToCheck.some(url => {
          const u = url.toLowerCase();
          return u.includes("/itinerary/") || u.includes("/itineraries/") || u.includes("/journey/") || u.includes("/journeys/") || u.includes("/trips/") || u.includes("/trip/");
        })
      );
    };

    const isProductPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower === "/product" ||
        patLower === "/products" ||
        patLower === "product" ||
        patLower === "products" ||
        patLower.startsWith("/product/") ||
        patLower.startsWith("/products/") ||
        patLower.startsWith("/p/") ||
        patLower.startsWith("/shop/") ||
        patLower.startsWith("/item/") ||
        patLower.includes("/product/*") ||
        patLower.includes("/products/*") ||
        patLower.includes("/p/*") ||
        patLower.includes("/shop/*") ||
        patLower.includes("/item/*") ||
        patParts.includes("product") ||
        patParts.includes("products") ||
        patParts.includes("p") ||
        patParts.includes("shop") ||
        patParts.some(p => p.startsWith("product") || p.startsWith("item") || p === "shop" || p === "p")
      );
    };

    const isSolutionPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower === "/uses" ||
        patLower === "/solutions" ||
        patLower === "/use-case" ||
        patLower === "/use-cases" ||
        patLower === "uses" ||
        patLower === "solutions" ||
        patLower === "use-case" ||
        patLower === "use-cases" ||
        patLower.startsWith("/uses/") ||
        patLower.startsWith("/solutions/") ||
        patLower.startsWith("/use-case/") ||
        patLower.startsWith("/use-cases/") ||
        patLower.startsWith("/teams/") ||
        patLower.includes("/uses/*") ||
        patLower.includes("/solutions/*") ||
        patLower.includes("/use-case/*") ||
        patLower.includes("/use-cases/*") ||
        patLower.includes("/teams/*") ||
        patParts.includes("uses") ||
        patParts.includes("solutions") ||
        patParts.includes("use-case") ||
        patParts.includes("use-cases") ||
        patParts.some(p => p.startsWith("use-case") || p.startsWith("solution") || p === "uses" || p === "teams")
      );
    };

    const isResourcePattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower === "/resources" ||
        patLower === "/resource" ||
        patLower.startsWith("/resources/") ||
        patLower.startsWith("/resource/") ||
        patLower.includes("/resources/*") ||
        patLower.includes("/resource/*") ||
        patParts.includes("resources") ||
        patParts.includes("resource") ||
        hasResourceUrl
      );
    };

    const isInteractiveToolPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      return (
        patLower.includes("calculator") ||
        patLower.includes("tool") ||
        patLower.includes("roi") ||
        patLower.includes("estimator") ||
        hasInteractiveToolUrl
      );
    };

    const isDestinationHubPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const cleanPat = patLower.split('?')[0];
      const segments = cleanPat.split('/').filter(Boolean);
      const isDest = segments.includes("destinations") || segments.includes("destination") || patLower === "/destinations" || patLower === "/destination" || patLower === "/destinations/" || patLower === "/destination/";
      if (!isDest) return false;
      const destIndex = segments.indexOf("destinations") !== -1 ? segments.indexOf("destinations") : segments.indexOf("destination");
      const afterDest = segments.slice(destIndex + 1).filter(s => s !== "*");
      return afterDest.length === 0 && !patLower.includes("*");
    };

    const isCountryDestinationPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const cleanPat = patLower.split('?')[0];
      const segments = cleanPat.split('/').filter(Boolean);
      const isDest = segments.includes("destinations") || segments.includes("destination") || patLower === "/destinations" || patLower === "/destination" || patLower === "/destinations/" || patLower === "/destination/";
      if (!isDest) return false;
      if (patLower === "/destinations/*" || patLower === "/destinations/*/" || patLower === "/destination/*" || patLower === "/destination/*/") {
        return true;
      }
      if (patLower.includes("/*/*")) return false;
      const destIndex = segments.indexOf("destinations") !== -1 ? segments.indexOf("destinations") : segments.indexOf("destination");
      const afterDest = segments.slice(destIndex + 1);
      return afterDest.length === 1 || (patLower.includes("/*") && !patLower.includes("/*/*"));
    };

    const isCityDestinationPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const cleanPat = patLower.split('?')[0];
      const segments = cleanPat.split('/').filter(Boolean);
      const isDest = segments.includes("destinations") || segments.includes("destination") || patLower === "/destinations" || patLower === "/destination" || patLower === "/destinations/" || patLower === "/destination/";
      if (!isDest) return false;
      if (patLower === "/destinations/*/*" || patLower === "/destinations/*/*/" || patLower === "/destination/*/*" || patLower === "/destination/*/*/") {
        return true;
      }
      if (patLower.includes("/*/*")) return true;
      const destIndex = segments.indexOf("destinations") !== -1 ? segments.indexOf("destinations") : segments.indexOf("destination");
      const afterDest = segments.slice(destIndex + 1);
      return afterDest.length >= 2;
    };

    const isArticlesPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower === "/article" ||
        patLower === "/articles" ||
        patLower === "/blog" ||
        patLower === "/news" ||
        patLower.startsWith("/article/") ||
        patLower.startsWith("/articles/") ||
        patLower.startsWith("/blog/") ||
        patLower.startsWith("/news/") ||
        patLower.includes("/article/*") ||
        patLower.includes("/articles/*") ||
        patLower.includes("/blog/*") ||
        patParts.includes("article") ||
        patParts.includes("articles") ||
        patParts.includes("blog") ||
        patParts.includes("news") ||
        urlsToCheck.some(url => {
          const u = url.toLowerCase();
          return u.includes("/article/") || u.includes("/articles/") || u.includes("/blog/") || u.includes("/news/");
        })
      );
    };

    // Banking & Financial Services Patterns
    const isBankingPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower.includes("credit-card") ||
        patLower.includes("creditcard") ||
        patLower.includes("mortgage") ||
        patLower.includes("home-loan") ||
        patLower.includes("personal-loan") ||
        patLower.includes("auto-loan") ||
        patLower.includes("checking") ||
        patLower.includes("savings") ||
        patLower.includes("banking") ||
        patLower.includes("wealth") ||
        patLower.includes("investing") ||
        patLower.includes("commercial-banking") ||
        patLower.includes("small-business") ||
        patLower.includes("cd-account") ||
        patLower.includes("certificates-of-deposit") ||
        patLower.includes("atm") ||
        patLower.includes("branch") ||
        patParts.some(p => ["credit-cards", "mortgages", "loans", "checking", "savings", "banking", "wealth", "investing", "atms", "branches", "financial-planning"].includes(p)) ||
        urlsToCheck.some(u => {
          const uL = u.toLowerCase();
          return uL.includes("credit-card") || uL.includes("mortgage") || uL.includes("/loans/") || uL.includes("/checking/") || uL.includes("/savings/") || uL.includes("/banking/") || uL.includes("/investing/") || uL.includes("/atms/");
        })
      );
    };

    if (isBankingPattern(pattern)) {
      const patL = pattern.toLowerCase();
      if (patL.includes("credit-card") || patL.includes("creditcard") || urlsToCheck.some(u => u.toLowerCase().includes("credit-card"))) {
        return {
          template_name: "Financial Product - Credit Cards",
          recommended_primary_schema: "CreditCard"
        };
      }
      if (patL.includes("mortgage") || patL.includes("home-loan") || urlsToCheck.some(u => u.toLowerCase().includes("mortgage"))) {
        return {
          template_name: "Financial Product - Mortgages & Home Loans",
          recommended_primary_schema: "MortgageLoan"
        };
      }
      if (patL.includes("loan") || urlsToCheck.some(u => u.toLowerCase().includes("loan"))) {
        return {
          template_name: "Financial Product - Personal & Business Loans",
          recommended_primary_schema: "LoanOrCredit"
        };
      }
      if (patL.includes("checking") || patL.includes("savings") || patL.includes("cd") || patL.includes("deposit")) {
        return {
          template_name: "Financial Product - Checking & Deposit Accounts",
          recommended_primary_schema: "FinancialProduct"
        };
      }
      if (patL.includes("atm") || patL.includes("branch") || patL.includes("location")) {
        return {
          template_name: "Bank Branch / ATM Locator Page",
          recommended_primary_schema: "BankOrCreditUnion"
        };
      }
      return {
        template_name: "Financial Services Page",
        recommended_primary_schema: "FinancialService"
      };
    }

    // Root / Homepage
    if (cleanPattern === "" || lowercasePattern === "/") {
      return {
        template_name: "Homepage / Brand Root",
        recommended_primary_schema: isMedical ? "MedicalOrganization" : "WebSite"
      };
    }

    // Utility / Transaction / Checkout / Cart / Account (No schema required)
    if (
      isUtilityPattern(pattern) ||
      cleanPattern === "cart" ||
      cleanPattern === "checkout" ||
      cleanPattern === "basket" ||
      cleanPattern === "login" ||
      cleanPattern === "signin" ||
      cleanPattern === "signup" ||
      cleanPattern === "logout" ||
      cleanPattern === "account" ||
      cleanPattern === "my-account" ||
      lowercasePattern === "/cart" ||
      lowercasePattern === "/cart/" ||
      lowercasePattern.includes("/cart/") ||
      lowercasePattern.includes("/checkout/") ||
      lowercasePattern.includes("/basket/") ||
      lowercasePattern.includes("/login/") ||
      lowercasePattern.includes("/signin/") ||
      lowercasePattern.includes("/signup/") ||
      lowercasePattern.includes("/account/") ||
      lowercasePattern.endsWith("/cart") ||
      lowercasePattern.endsWith("/checkout") ||
      lowercasePattern.endsWith("/basket") ||
      lowercasePattern.endsWith("/login") ||
      lowercasePattern.endsWith("/signin") ||
      lowercasePattern.endsWith("/signup") ||
      lowercasePattern.endsWith("/account")
    ) {
      return {
        template_name: "Utility / Transactional Page",
        recommended_primary_schema: "None"
      };
    }

    // Products
    if (isProductPattern(pattern)) {
      return {
        template_name: "Product Detail Page",
        recommended_primary_schema: "Product"
      };
    }

    // Solutions / Uses / Use Cases
    if (isSolutionPattern(pattern)) {
      return {
        template_name: "Solution / Use Case Page",
        recommended_primary_schema: "WebPage"
      };
    }

    // Interactive Tools / ROI Calculators
    if (isInteractiveToolPattern(pattern)) {
      return {
        template_name: "Interactive Tool / ROI Calculator Page",
        recommended_primary_schema: "WebPage"
      };
    }

    // Energy Rates / Commercial Energy
    const hasRatesUrl = urlsToCheck.some(url => {
      const u = url.toLowerCase();
      return u.includes("electricity-rates") || u.includes("green-energy-rates") || u.includes("energy-rates") || u.includes("/rates/");
    });

    const isRatesPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      return patLower.includes("rates") || patLower.includes("electricity-rates") || hasRatesUrl;
    };

    if (isRatesPattern(pattern)) {
      // Check if it's renewable power specific
      if (lowercasePattern.includes("renewable-power") || lowercasePattern.includes("green-energy")) {
        return {
          template_name: "Renewable Rates / Topic Page",
          recommended_primary_schema: "WebPage"
        };
      }
      return {
        template_name: "Local / Regional Rates Page",
        recommended_primary_schema: "WebPage"
      };
    }

    // Energy Providers
    const hasProviderUrl = urlsToCheck.some(url => {
      const u = url.toLowerCase();
      return u.includes("electricity-providers") || u.includes("electricity-provider") || u.includes("/providers/");
    });

    const isProviderHubPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower === "/electricity-providers" ||
        patLower === "/electricity-providers/" ||
        patLower === "electricity-providers" ||
        (patParts.length === 1 && patParts[0] === "electricity-providers")
      );
    };

    const isProviderReviewPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      const patParts = patLower.split('/').filter(Boolean);
      return (
        patLower.startsWith("/electricity-providers/") ||
        patLower.includes("/electricity-providers/*") ||
        (patParts.length > 1 && patParts[0] === "electricity-providers") ||
        (hasProviderUrl && !isProviderHubPattern(pat))
      );
    };

    if (isProviderHubPattern(pattern)) {
      return {
        template_name: "Energy Providers Hub / Listing Page",
        recommended_primary_schema: "CollectionPage"
      };
    }

    if (isProviderReviewPattern(pattern)) {
      return {
        template_name: "Energy Provider Review / Profile Page",
        recommended_primary_schema: "Organization"
      };
    }

    // Energy Resources / Glossaries / Educational Guides
    const hasEnergyResourcesUrl = urlsToCheck.some(url => {
      const u = url.toLowerCase();
      return u.includes("energy-resources") || u.includes("/resources/");
    });

    const isEnergyResourcesPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      return patLower.includes("energy-resources") || hasEnergyResourcesUrl;
    };

    if (isEnergyResourcesPattern(pattern)) {
      if (lowercasePattern.includes("glossary")) {
        return {
          template_name: "Glossary / Reference Page",
          recommended_primary_schema: "AboutPage"
        };
      }
      return {
        template_name: "Educational Guide / Resource Page",
        recommended_primary_schema: "Article"
      };
    }

    // The Current (Blogs)
    const hasBlogUrl = urlsToCheck.some(url => {
      const u = url.toLowerCase();
      return u.includes("the-current") || u.includes("/blog/") || u.includes("/news/");
    });

    const isBlogPattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      return patLower.includes("the-current") || patLower.includes("blog") || hasBlogUrl;
    };

    if (isBlogPattern(pattern)) {
      return {
        template_name: "Blog Post / Editorial Article",
        recommended_primary_schema: "BlogPosting"
      };
    }

    // Commercial plans / solution compare tool
    if (lowercasePattern.includes("compare-business-electricity-plans") || lowercasePattern.includes("compare-plans")) {
      return {
        template_name: "Interactive Plan Comparison Page",
        recommended_primary_schema: "WebPage"
      };
    }

    // B2B Energy / Commercial Industry Solution
    if (lowercasePattern.includes("commercial-energy")) {
      return {
        template_name: "B2B Industry Solution Page",
        recommended_primary_schema: "WebPage"
      };
    }

    // Utility service / Feature landing page (e.g. same day, solar, renewable)
    const isUtilityServicePattern = (pat: string): boolean => {
      const patLower = pat.toLowerCase().trim();
      return (
        patLower.includes("same-day") ||
        patLower.includes("renewable-power") ||
        patLower.includes("solar-energy") ||
        patLower.includes("solar-power") ||
        patLower.includes("green-energy") ||
        patLower.includes("no-deposit") ||
        patLower.includes("prepaid")
      );
    };

    if (isUtilityServicePattern(pattern)) {
      return {
        template_name: "Utility Service / Feature Landing Page",
        recommended_primary_schema: "Service"
      };
    }

    // Resources & Editorial
    if (isResourcePattern(pattern)) {
      return {
        template_name: "Editorial Article / Post",
        recommended_primary_schema: "Article"
      };
    }

    // Category / Collection
    if (
      cleanPattern === "c" || 
      cleanPattern === "category" || 
      cleanPattern === "categories" || 
      cleanPattern === "collection" || 
      cleanPattern === "collections" || 
      cleanPattern === "dept" || 
      cleanPattern === "department" ||
      lowercasePattern.includes("/c/") || 
      lowercasePattern.includes("/category/") || 
      lowercasePattern.includes("/categories/") || 
      lowercasePattern.includes("/collection/") || 
      lowercasePattern.includes("/collections/") || 
      lowercasePattern.includes("/department/")
    ) {
      return {
        template_name: "Category / Collection Page",
        recommended_primary_schema: "CollectionPage"
      };
    }

    // Articles / Blog / News
    if (
      isArticlesPattern(pattern) ||
      cleanPattern === "blog" || 
      cleanPattern === "news" || 
      cleanPattern === "article" || 
      cleanPattern === "articles" || 
      cleanPattern === "post" || 
      cleanPattern === "posts" ||
      lowercasePattern.includes("/blog") || 
      lowercasePattern.includes("/news") || 
      lowercasePattern.includes("/article") || 
      lowercasePattern.includes("/post")
    ) {
      return {
        template_name: "Editorial Article / Post",
        recommended_primary_schema: isMedical ? "MedicalWebPage" : "Article"
      };
    }

    // Physician Profiles
    if (
      cleanPattern === "physician" || 
      cleanPattern === "doctor" || 
      cleanPattern === "profile" ||
      lowercasePattern.includes("/physician/") || 
      lowercasePattern.includes("/doctor/") || 
      lowercasePattern.includes("/profile/") ||
      lowercasePattern.includes("/dr-")
    ) {
      return {
        template_name: "Physician Profile Page",
        recommended_primary_schema: "Physician"
      };
    }

    // Locations / Regional Pages
    if (
      cleanPattern === "locations" || 
      cleanPattern === "location" || 
      cleanPattern === "store" || 
      cleanPattern === "stores" || 
      cleanPattern === "facility" || 
      cleanPattern === "facilities" ||
      cleanPattern === "city" ||
      cleanPattern === "cities" ||
      cleanPattern === "state" ||
      cleanPattern === "states" ||
      cleanPattern === "region" ||
      cleanPattern === "regions" ||
      cleanPattern === "service-area" ||
      cleanPattern === "service-areas" ||
      lowercasePattern.includes("/locations/") || 
      lowercasePattern.includes("/location/") || 
      lowercasePattern.includes("/store/") || 
      lowercasePattern.includes("/stores/") || 
      lowercasePattern.includes("/facility/") || 
      lowercasePattern.includes("/facilities/") ||
      lowercasePattern.includes("/city/") ||
      lowercasePattern.includes("/cities/") ||
      lowercasePattern.includes("/state/") ||
      lowercasePattern.includes("/states/") ||
      lowercasePattern.includes("/region/") ||
      lowercasePattern.includes("/regions/") ||
      lowercasePattern.includes("/service-area/") ||
      lowercasePattern.includes("/service-areas/") ||
      lowercasePattern.includes("-seo") // Common for city pages like /chicago-seo
    ) {
      return {
        template_name: "Local / Regional Landing Page",
        recommended_primary_schema: isMedical ? "MedicalOrganization" : "LocalBusiness"
      };
    }

    // Itineraries & Journeys
    if (
      isItineraryPattern(pattern) ||
      cleanPattern === "itinerary" || 
      cleanPattern === "itineraries" || 
      cleanPattern === "journeys" || 
      cleanPattern === "journey" || 
      cleanPattern === "trips" || 
      cleanPattern === "trip" ||
      lowercasePattern.includes("/itinerary") || 
      lowercasePattern.includes("/itineraries") || 
      lowercasePattern.includes("/journey") || 
      lowercasePattern.includes("/journeys") || 
      lowercasePattern.includes("/trip") || 
      lowercasePattern.includes("/trips")
    ) {
      return {
        template_name: "Travel Itinerary / Trip Planner Page",
        recommended_primary_schema: "WebPage"
      };
    }

    // Destinations Hub, Country and City Pages
    if (isCityDestinationPattern(pattern)) {
      return {
        template_name: "City Destination Guide Page",
        recommended_primary_schema: "Guide"
      };
    }

    if (isCountryDestinationPattern(pattern)) {
      return {
        template_name: "Country Destination Guide Page",
        recommended_primary_schema: "Guide"
      };
    }

    if (
      isDestinationHubPattern(pattern) ||
      cleanPattern === "destination" ||
      cleanPattern === "destinations" ||
      lowercasePattern.includes("/destination") ||
      lowercasePattern.includes("/destinations")
    ) {
      return {
        template_name: "Destinations Hub / Directory Page",
        recommended_primary_schema: "CollectionPage"
      };
    }

    // Services
    if (
      cleanPattern === "services" || 
      cleanPattern === "service" || 
      cleanPattern === "treatments" || 
      cleanPattern === "treatment" ||
      lowercasePattern.includes("/services/") || 
      lowercasePattern.includes("/service/") || 
      lowercasePattern.includes("/treatments/") || 
      lowercasePattern.includes("/treatment/")
    ) {
      return {
        template_name: "Service / Treatment Offering",
        recommended_primary_schema: isMedical ? "MedicalClinic" : "Service"
      };
    }

    // Comparison / Versus Pages
    if (
      cleanPattern.includes("-vs-") ||
      cleanPattern.includes("-versus-") ||
      lowercasePattern.includes("/vs/") ||
      lowercasePattern.includes("/compare/") ||
      lowercasePattern.includes("/comparison/") ||
      lowercasePattern.startsWith("vs-") ||
      lowercasePattern.endsWith("-vs")
    ) {
      return {
        template_name: "Competitor Comparison / Versus Page",
        recommended_primary_schema: "WebPage"
      };
    }

    // FAQs
    if (
      cleanPattern === "faq" || 
      cleanPattern === "faqs" || 
      cleanPattern === "help" || 
      cleanPattern === "support" ||
      lowercasePattern.includes("/faq") || 
      lowercasePattern.includes("/faqs") || 
      lowercasePattern.includes("/help/") || 
      lowercasePattern.includes("/support/")
    ) {
      return {
        template_name: "Frequently Asked Questions Page",
        recommended_primary_schema: "FAQPage"
      };
    }

    // About
    if (
      cleanPattern === "about" ||
      lowercasePattern.includes("/about")
    ) {
      return {
        template_name: "About Us / Company Story Page",
        recommended_primary_schema: "AboutPage"
      };
    }

    // Contact
    if (
      cleanPattern === "contact" ||
      lowercasePattern.includes("/contact")
    ) {
      return {
        template_name: "Contact Information Page",
        recommended_primary_schema: "ContactPage"
      };
    }

    // Careers
    if (
      cleanPattern === "careers" || 
      cleanPattern === "jobs" ||
      lowercasePattern.includes("/careers") || 
      lowercasePattern.includes("/jobs")
    ) {
      return {
        template_name: "Careers & Job Opportunities Page",
        recommended_primary_schema: "WebPage"
      };
    }

    // Search
    if (
      cleanPattern === "search" || 
      cleanPattern === "query" ||
      lowercasePattern.includes("/search") || 
      lowercasePattern.includes("/query")
    ) {
      return {
        template_name: "Internal Site Search Results Page",
        recommended_primary_schema: "SearchResultsPage"
      };
    }

    return {
      template_name: "Other",
      recommended_primary_schema: "WebPage"
    };
  }

  // Unified template post-processor to ensure exactly 1 Homepage URL and map all unmapped/extra URLs to "Other"
  function postProcessTemplates(rawTemplates: any[]): any[] {
    const merged: any[] = [];
    const templateMap = new Map<string, any>();
    
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
        const existing = templateMap.get(key);
        
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
        const copy = { 
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
  }

  // Resilient content generator helper with retries and model fallbacks
  async function generateContentWithRetryAndFallback(prompt: string): Promise<any> {
    const modelsToTry = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const startTime = Date.now();
    const attempts: ModelAttempt[] = [];
    let successfulModel: string | undefined = undefined;
    let finalResponse: any = null;
    let lastError: any = null;
    let shouldSkipRemainingModels = false;

    for (const model of modelsToTry) {
      if (shouldSkipRemainingModels) {
        break;
      }
      const maxRetries = 1; // Limit retries to 1 to speed up response
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const attemptStartTime = Date.now();
        try {
          console.log(`[Gemini API] Generating templates using model "${model}" (attempt ${attempt + 1}/${maxRetries + 1})...`);
          
          const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
               systemInstruction: `Role: You are the "Domain Template Mapper," an advanced SEO crawler and URL clustering AI.
Objective: The input represents URL pattern groups extracted from a website's sitemap. Your job is to analyze these pattern structures, determine the underlying "Page Template" for each pattern, and map them to the correct Schema.org @type.
Core Logic & Rules:
1. Identify Home Page: Explicitly map the root URL pattern "/" to "Homepage / Brand Root" and assign appropriate global schema like WebSite, Organization, or MedicalOrganization depending on the domain context.
2. Deduce Page Intent: Analyze the patterns (e.g. /facilities/*, /services/*, /blog/*) to determine user intent.
3. Map Product Pages: Explicitly map patterns containing "/product/*", "/products/*", or "/p/*" (or matching "product") to "Product Detail Page" and recommend "Product" as the primary schema @type.
4. Map Solutions & Uses Pages: Explicitly map patterns containing "/uses/*", "/solutions/*", "/use-cases/*", or "/teams/*" (or matching "uses" / "solutions") to "Solution / Use Case Page" and recommend "WebPage" as the primary schema @type.
5. Map to Schema.org: For other templates, assign the primary Schema.org @type (e.g. Hospital, Physician, Article, AboutPage, ContactPage, WebPage).
6. Retain Samples: Include the sample URLs provided in the cluster input.
7. Provide Chain of Thought: Write a "CoT Reasoning" explanation of how you identified these patterns, what structures you saw, and why you assigned specific Schema types.
8. Provide Executive Summary: Write a solid, authoritative "executive_tldr" summarizing sitemap health, key templates, and schema opportunities.
9. Output: You must return the data strictly in the requested JSON format matching the schema.`,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  domain_analyzed: { type: Type.STRING },
                  total_templates_discovered: { type: Type.INTEGER },
                  reasoning: { type: Type.STRING },
                  executive_tldr: { type: Type.STRING },
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
                      }
                    }
                  }
                }
              }
            }
          });

          const latencyMs = Date.now() - attemptStartTime;
          attempts.push({
            model,
            attempt: attempt + 1,
            success: true,
            latencyMs
          });

          successfulModel = model;
          finalResponse = response;
          break;
        } catch (err: any) {
          const latencyMs = Date.now() - attemptStartTime;
          attempts.push({
            model,
            attempt: attempt + 1,
            success: false,
            error: err.message || String(err),
            latencyMs
          });

          lastError = err;
          const errMsg = (err.message || "").toLowerCase();
          console.log(`[Gemini API Info] Model "${model}" failed on attempt ${attempt + 1}:`, err.message || err);
          
          const isQuotaError = errMsg.includes("quota") || errMsg.includes("exhausted") || errMsg.includes("limit");
          const isCapacityError = errMsg.includes("unavailable") || errMsg.includes("high demand") || errMsg.includes("overloaded");

          const isHardError = isQuotaError ||
                              isCapacityError ||
                              errMsg.includes("not found") || 
                              errMsg.includes("invalid") || 
                              errMsg.includes("not support") || 
                              errMsg.includes("unrecognized") || 
                              errMsg.includes("not enabled");
          
          if (isQuotaError) {
            console.log(`[Gemini API] Global API key quota error detected ("${errMsg}"). Skipping all subsequent models & retries for immediate failover.`);
            shouldSkipRemainingModels = true;
            break;
          }

          if (isCapacityError) {
            console.log(`[Gemini API] Model-specific capacity/overload error detected ("${errMsg}"). Skipping remaining retries for model "${model}" but proceeding to fallback models.`);
            break;
          }
                              
          if (isHardError) {
            console.log(`[Gemini API] Hard error detected for model "${model}". Skipping remaining retries for this model.`);
            break;
          }

          if (attempt < maxRetries) {
            const delay = 500;
            console.log(`[Gemini API] Waiting ${delay}ms before retrying model "${model}"...`);
            await sleep(delay);
          }
        }
      }
      if (finalResponse) break;
    }

    const totalLatencyMs = Date.now() - startTime;

    if (finalResponse) {
      let inputTokens = Math.ceil(prompt.length / 4);
      let outputTokens = Math.ceil((finalResponse.text || "").length / 4);

      if (finalResponse.usageMetadata) {
        inputTokens = finalResponse.usageMetadata.promptTokenCount || inputTokens;
        outputTokens = finalResponse.usageMetadata.candidatesTokenCount || outputTokens;
      }

      apiRequestLogs.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        status: "success",
        promptLength: prompt.length,
        responseLength: (finalResponse.text || "").length,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        modelsAttempted: attempts,
        successfulModel,
        totalLatencyMs
      });

      return finalResponse;
    }

    // All failed
    apiRequestLogs.push({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      status: "failed",
      promptLength: prompt.length,
      responseLength: 0,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: 0,
      totalTokens: Math.ceil(prompt.length / 4),
      modelsAttempted: attempts,
      totalLatencyMs,
      errorMessage: lastError?.message || "All models failed"
    });

    throw lastError || new Error("Failed to generate content after trying multiple models and retries");
  }

  // API endpoint to analyze URLs using Gemini
  app.post("/api/analyze-urls", async (req, res) => {
    const { urlsToAnalyze } = req.body;
    if (!urlsToAnalyze) {
      return res.status(400).json({ error: "URLs are required" });
    }

    try {
      const rawUrls = urlsToAnalyze.split("\n").map((line: string) => line.trim()).filter(Boolean);
      if (rawUrls.length === 0) {
        return res.status(400).json({ error: "No valid URLs provided" });
      }

      // 1. Cluster raw URLs first like a spreadsheet
      const { domainAnalyzed, clusters } = clusterRawUrls(rawUrls);

      // 2. Wrap AI analysis in a try-catch to allow seamless fallback if rate-limited or overloaded
      let responseData;
      try {
        // Construct dynamic lightweight prompt for Gemini
        const prompt = `Analyze these clustered URL patterns for the domain "${domainAnalyzed}" and identify the appropriate page template names and recommended Schema.org @type for each:

Domain: ${domainAnalyzed}
Clusters found:
${JSON.stringify(clusters, null, 2)}

Please return a single JSON object with these exact keys:
- domain_analyzed: "${domainAnalyzed}"
- total_templates_discovered: ${clusters.length}
- reasoning: A Chain of Thought explanation of how you identified these patterns and why you assigned specific Schema types.
- executive_tldr: An authoritative executive summary of the sitemap audit, highlighting template coverage and schema opportunities.
- templates: array of objects containing 'template_name', 'url_pattern' (must match the input pattern exactly), 'recommended_primary_schema', and 'sample_urls' (must keep the sample urls provided in the input clusters).

CRITICAL DIRECTIVE ON TEMPLATE NAMES:
- DO NOT use generic or low-quality names such as "Template", "Template /p/*", "Product Template", "Category Template", "Page", or "N/A".
- Use professional, specific enterprise SEO and architectural titles like:
  * "Product Detail Page" (for product patterns containing /product/, /products/, /p/, /shop/, recommend "Product" schema).
  * "Solution / Use Case Page" (for use cases, uses, solutions, and teams patterns containing /uses/, /solutions/, /teams/, /use-cases/, recommend "WebPage" schema).
  * "Travel Itinerary / Trip Planner Page" (for itinerary and journeys patterns containing /itinerary/, /itineraries/, /journey/, /journeys/, /trips/, recommend "WebPage" schema).
  * "Utility / Transactional Page" (for shopping cart, checkout, payment, account, login/signup, and admin pages containing /cart/, /checkout/, /login/, /account/, recommend "None" schema as these do not need structured SEO schema).
  * "Category / Collection Page", "Editorial Article / Post", "Physician Profile Page", "Physical Location Page", "Service / Treatment Offering", "Internal Site Search Results", "About Us / Company Story Page", "Contact Information Page", or "Careers & Job Opportunities".`;

        const response = await generateContentWithRetryAndFallback(prompt);

        if (!response || !response.text) {
          throw new Error("No response generated from the model.");
        }

        let text = response.text || "";
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");
        
        if (firstBrace !== -1 && lastBrace !== -1) {
          text = text.substring(firstBrace, lastBrace + 1);
        }

        const rawData = JSON.parse(text);
        
        const normalizeAnalysisResult = (raw: any): any => {
          if (!raw || typeof raw !== "object") {
            return {
              domain_analyzed: domainAnalyzed,
              total_templates_discovered: clusters.length,
              templates: clusters.map(c => {
                const { template_name, recommended_primary_schema } = getDeterministicSchemaAndName(c.pattern, domainAnalyzed, c.samples);
                return {
                  template_name,
                  url_pattern: c.pattern,
                  recommended_primary_schema,
                  sample_urls: c.samples
                };
              }),
              reasoning: "Failed to parse model analysis. Reverting to deterministic clusters.",
              executive_tldr: "Deterministic fallback due to parsing constraints."
            };
          }

          const domain_analyzed = raw.domain_analyzed || raw.domainAnalyzed || raw.domain || domainAnalyzed;

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

            let template_name = item.template_name || item.templateName || item.name || item.template || item.cluster_name || item.clusterName || "";
            const url_pattern = item.url_pattern || item.urlPattern || item.pattern || item.urls_pattern || "N/A";
            let recommended_primary_schema = item.recommended_primary_schema || item.recommendedPrimarySchema || item.schema || item.primary_schema || item.primarySchema || item.recommended_schema || item.recommendedSchema || "";
            
            // Let's clean up any low-quality, simple words or variations containing "template"
            let lowerName = template_name.toLowerCase().trim();
            const isGeneric = !template_name || 
                              lowerName === "unknown template" || 
                              lowerName === "n/a" ||
                              lowerName === "template" ||
                              lowerName.startsWith("template ") || 
                              lowerName.startsWith("template/") || 
                              lowerName.includes("/");

            if (isGeneric || !recommended_primary_schema) {
              const deterministic = getDeterministicSchemaAndName(url_pattern, domainAnalyzed, sample_urls);
              if (isGeneric) {
                template_name = deterministic.template_name;
              }
              if (!recommended_primary_schema) {
                recommended_primary_schema = deterministic.recommended_primary_schema;
              }
            } else {
              // Map low-quality names or single words to smart enterprise names
              if (lowerName === "products" || lowerName === "product" || lowerName === "product template" || lowerName === "products template" || lowerName === "p template") {
                template_name = "Product Detail Page";
              } else if (lowerName === "uses" || lowerName === "solutions" || lowerName === "use cases" || lowerName === "use-cases" || lowerName === "solution" || lowerName === "use case" || lowerName === "uses template" || lowerName === "solutions template") {
                template_name = "Solution / Use Case Page";
              } else if (lowerName === "category" || lowerName === "categories" || lowerName === "category template" || lowerName === "categories template" || lowerName === "c template" || lowerName === "collection" || lowerName === "collections") {
                template_name = "Category / Collection Page";
              } else if (lowerName === "blog" || lowerName === "blog post" || lowerName === "article" || lowerName === "articles" || lowerName === "editorial") {
                template_name = "Editorial Article / Post";
              } else if (lowerName === "location" || lowerName === "locations" || lowerName === "store" || lowerName === "stores" || lowerName === "facility" || lowerName.includes("city level") || lowerName.includes("state level") || lowerName.includes("regional")) {
                template_name = "Local / Regional Landing Page";
              } else if (lowerName === "service" || lowerName === "services" || lowerName === "treatment" || lowerName === "treatments") {
                template_name = "Service / Treatment Offering";
              } else if (lowerName === "about" || lowerName === "about us" || lowerName === "company") {
                template_name = "About Us / Company Story Page";
              } else if (lowerName === "contact" || lowerName === "contact us" || lowerName === "support") {
                template_name = "Contact Information Page";
              } else if (lowerName === "careers" || lowerName === "jobs" || lowerName === "career") {
                template_name = "Careers & Job Opportunities Page";
              } else if (lowerName === "search" || lowerName === "query" || lowerName === "search results") {
                template_name = "Internal Site Search Results Page";
              } else if (lowerName.includes(" vs ") || lowerName.includes("-vs-") || lowerName.includes("compare") || lowerName.includes("comparison")) {
                template_name = "Competitor Comparison / Versus Page";
              } else if (lowerName.endsWith(" template")) {
                const clean = template_name.substring(0, template_name.length - 9).trim();
                template_name = `${clean} Page`;
              }
            }

            // High-assurance pattern override: If the URL pattern itself or its sample URLs clearly map to standard types, override low-quality names or generic/missing schemas
            const patLower = url_pattern.toLowerCase().trim();
            const patParts = patLower.split('/').filter(Boolean);

            const hasResourceUrl = sample_urls.some(url => {
              const u = url.toLowerCase();
              return u.includes("/resources/") || u.includes("/resource/") || u.endsWith("/resources") || u.endsWith("/resource") || /\/resources\?/.test(u);
            });
            const hasInteractiveToolUrl = sample_urls.some(url => {
              const u = url.toLowerCase();
              return u.includes("calculator") || u.includes("tool") || u.includes("roi") || u.includes("estimator");
            });

            const hasUtilityUrl = sample_urls.some(url => {
              const u = url.toLowerCase();
              return u.includes("/cart") || u.includes("/checkout") || u.includes("/login") || u.includes("/signin") || u.includes("/signup") || u.includes("/register") || u.includes("/account") || u.includes("/admin");
            });

            const matchesUtility = patLower === "/cart" || patLower === "/checkout" || patLower === "/login" || patLower === "/signin" || patLower === "/signup" || patLower === "/register" || patLower === "/my-account" || patLower === "/account" || patLower === "/admin" ||
                                   patLower.startsWith("/cart/") || patLower.startsWith("/checkout/") || patLower.startsWith("/login/") || patLower.startsWith("/signin/") || patLower.startsWith("/signup/") || patLower.startsWith("/register/") || patLower.startsWith("/account/") || patLower.startsWith("/admin/") ||
                                   patLower.includes("/cart/*") || patLower.includes("/checkout/*") || patLower.includes("/account/*") || patLower.includes("/admin/*") ||
                                   patParts.includes("cart") || patParts.includes("checkout") || patParts.includes("login") || patParts.includes("signin") || patParts.includes("signup") || patParts.includes("register") || patParts.includes("account") || patParts.includes("admin") ||
                                   hasUtilityUrl;

            const hasItineraryUrl = sample_urls.some(url => {
              const u = url.toLowerCase();
              return u.includes("/itinerary/") || u.includes("/itineraries/") || u.includes("/journey/") || u.includes("/journeys/") || u.includes("/trips/") || u.includes("/trip/");
            });

            const matchesItinerary = patLower === "/itinerary" || patLower === "/itineraries" || patLower === "/journey" || patLower === "/journeys" || patLower === "itinerary" || patLower === "itineraries" || patLower === "journey" || patLower === "journeys" || patLower === "/trips" || patLower === "/trip" ||
                                     patLower.startsWith("/itinerary/") || patLower.startsWith("/itineraries/") || patLower.startsWith("/journey/") || patLower.startsWith("/journeys/") || patLower.startsWith("/trips/") || patLower.startsWith("/trip/") ||
                                     patLower.includes("/itinerary/*") || patLower.includes("/itineraries/*") || patLower.includes("/journey/*") || patLower.includes("/journeys/*") || patLower.includes("/trips/*") || patLower.includes("/trip/*") ||
                                     patParts.includes("itinerary") || patParts.includes("itineraries") || patParts.includes("journey") || patParts.includes("journeys") || patParts.includes("trips") || patParts.includes("trip") ||
                                     hasItineraryUrl;

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

            const isDestinationHubLocal = (pat: string): boolean => {
              const pl = pat.toLowerCase().trim();
              const cp = pl.split('?')[0];
              const segs = cp.split('/').filter(Boolean);
              const isD = segs.includes("destinations") || segs.includes("destination") || pl === "/destinations" || pl === "/destination" || pl === "/destinations/" || pl === "/destination/";
              if (!isD) return false;
              const idx = segs.indexOf("destinations") !== -1 ? segs.indexOf("destinations") : segs.indexOf("destination");
              const aft = segs.slice(idx + 1).filter(s => s !== "*");
              return aft.length === 0 && !pl.includes("*");
            };

            const isCountryDestinationLocal = (pat: string): boolean => {
              const pl = pat.toLowerCase().trim();
              const cp = pl.split('?')[0];
              const segs = cp.split('/').filter(Boolean);
              const isD = segs.includes("destinations") || segs.includes("destination") || pl === "/destinations" || pl === "/destination" || pl === "/destinations/" || pl === "/destination/";
              if (!isD) return false;
              if (pl === "/destinations/*" || pl === "/destinations/*/" || pl === "/destination/*" || pl === "/destination/*/") {
                return true;
              }
              if (pl.includes("/*/*")) return false;
              const idx = segs.indexOf("destinations") !== -1 ? segs.indexOf("destinations") : segs.indexOf("destination");
              const aft = segs.slice(idx + 1);
              return aft.length === 1 || (pl.includes("/*") && !pl.includes("/*/*"));
            };

            const isCityDestinationLocal = (pat: string): boolean => {
              const pl = pat.toLowerCase().trim();
              const cp = pl.split('?')[0];
              const segs = cp.split('/').filter(Boolean);
              const isD = segs.includes("destinations") || segs.includes("destination") || pl === "/destinations" || pl === "/destination" || pl === "/destinations/" || pl === "/destination/";
              if (!isD) return false;
              if (pl === "/destinations/*/*" || pl === "/destinations/*/*/" || pl === "/destination/*/*" || pl === "/destination/*/*/") {
                return true;
              }
              if (pl.includes("/*/*")) return true;
              const idx = segs.indexOf("destinations") !== -1 ? segs.indexOf("destinations") : segs.indexOf("destination");
              const aft = segs.slice(idx + 1);
              return aft.length >= 2;
            };

            const isArticlesLocal = (pat: string): boolean => {
              const pl = pat.toLowerCase().trim();
              const pparts = pl.split('/').filter(Boolean);
              return (
                pl === "/article" ||
                pl === "/articles" ||
                pl === "/blog" ||
                pl === "/news" ||
                pl.startsWith("/article/") ||
                pl.startsWith("/articles/") ||
                pl.startsWith("/blog/") ||
                pl.startsWith("/news/") ||
                pl.includes("/article/*") ||
                pl.includes("/articles/*") ||
                pl.includes("/blog/*") ||
                pparts.includes("article") ||
                pparts.includes("articles") ||
                pparts.includes("blog") ||
                pparts.includes("news") ||
                sample_urls.some(url => {
                  const u = url.toLowerCase();
                  return u.includes("/article/") || u.includes("/articles/") || u.includes("/blog/") || u.includes("/news/");
                })
              );
            };

            if (matchesUtility) {
              recommended_primary_schema = "None";
              template_name = "Utility / Transactional Page";
            } else if (matchesItinerary) {
              recommended_primary_schema = "WebPage";
              template_name = "Travel Itinerary / Trip Planner Page";
            } else if (isCityDestinationLocal(url_pattern)) {
              recommended_primary_schema = "Guide";
              template_name = "City Destination Guide Page";
            } else if (isCountryDestinationLocal(url_pattern)) {
              recommended_primary_schema = "Guide";
              template_name = "Country Destination Guide Page";
            } else if (isDestinationHubLocal(url_pattern)) {
              recommended_primary_schema = "CollectionPage";
              template_name = "Destinations Hub / Directory Page";
            } else if (isArticlesLocal(url_pattern)) {
              recommended_primary_schema = "Article";
              template_name = "Editorial Article / Post";
            } else if (matchesProduct) {
              if (!recommended_primary_schema || recommended_primary_schema === "WebPage") {
                recommended_primary_schema = "Product";
              }
              if (template_name.toLowerCase().includes("unknown") || template_name.toLowerCase() === "template" || template_name === "N/A" || template_name === "General Page" || template_name === "General Informational Node") {
                template_name = "Product Detail Page";
              }
            } else if (matchesSolution) {
              if (!recommended_primary_schema) {
                recommended_primary_schema = "WebPage";
              }
              if (template_name.toLowerCase().includes("unknown") || template_name.toLowerCase() === "template" || template_name === "N/A" || template_name === "General Page" || template_name === "General Informational Node") {
                template_name = "Solution / Use Case Page";
              }
            } else if (matchesResource) {
              if (!recommended_primary_schema || recommended_primary_schema === "WebPage") {
                recommended_primary_schema = "Article";
              }
              if (template_name.toLowerCase().includes("unknown") || template_name.toLowerCase() === "template" || template_name === "N/A" || template_name === "General Page" || template_name === "General Informational Node") {
                template_name = "Editorial Article / Post";
              }
            } else if (matchesInteractiveTool) {
              if (!recommended_primary_schema) {
                recommended_primary_schema = "WebPage";
              }
              if (template_name.toLowerCase().includes("unknown") || template_name.toLowerCase() === "template" || template_name === "N/A" || template_name === "General Page" || template_name === "General Informational Node") {
                template_name = "Interactive Tool / ROI Calculator Page";
              }
            }

            // Find matched cluster or fallback
            let count = sample_urls.length;
            let all_matching_urls = sample_urls;

            const matchedClusters = clusters.filter(c => {
              if (c.pattern === url_pattern) return true;
              const subPatterns = url_pattern.split(",").map((p: string) => p.trim());
              if (subPatterns.includes(c.pattern)) return true;
              return false;
            });

            if (matchedClusters.length > 0) {
              count = matchedClusters.reduce((sum, c) => sum + (c.count || c.samples.length), 0);
              const urlSet = new Set<string>();
              matchedClusters.forEach(c => {
                const urlsToAdd = c.all_urls || c.samples || [];
                urlsToAdd.forEach((u: string) => urlSet.add(u));
              });
              all_matching_urls = Array.from(urlSet);
            }

            return {
              template_name,
              url_pattern,
              recommended_primary_schema,
              sample_urls,
              count,
              all_matching_urls
            };
          }).filter(Boolean);

          // Fallback to deterministic clusters if templates list returned empty
          const rawFinalTemplates = normalizedTemplates.length > 0 ? normalizedTemplates : clusters.map(c => {
            const { template_name, recommended_primary_schema } = getDeterministicSchemaAndName(c.pattern, domainAnalyzed, c.samples);
            return {
              template_name,
              url_pattern: c.pattern,
              recommended_primary_schema,
              sample_urls: c.samples,
              count: c.count || c.samples.length,
              all_matching_urls: c.all_urls || c.samples
            };
          });

          // Deduplicate and consolidate templates with the exact same name and enforce homepage/other logic
          const finalTemplates = postProcessTemplates(rawFinalTemplates);

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

        responseData = normalizeAnalysisResult(rawData);
      } catch (geminiError: any) {
        console.log("[API Resilient Info] Gemini request failed or parsing failed. Using smart rule-based matching fallback:", geminiError.message || geminiError);
        
        // Track the fallback status in our telemetry logs
        if (apiRequestLogs.length > 0 && apiRequestLogs[apiRequestLogs.length - 1].status === "failed") {
          apiRequestLogs[apiRequestLogs.length - 1].status = "fallback";
        } else {
          apiRequestLogs.push({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toISOString(),
            status: "fallback",
            promptLength: 0,
            responseLength: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            modelsAttempted: [],
            totalLatencyMs: 0,
            errorMessage: geminiError.message || String(geminiError)
          });
        }

        // Build the templates list via deterministic matcher
        const rawDeterministicTemplates = clusters.map(c => {
          const { template_name, recommended_primary_schema } = getDeterministicSchemaAndName(c.pattern, domainAnalyzed, c.samples);
          return {
            template_name,
            url_pattern: c.pattern,
            recommended_primary_schema,
            sample_urls: c.samples,
            count: c.count || c.samples.length,
            all_matching_urls: c.all_urls || c.samples
          };
        });

        const finalDeterministicTemplates = postProcessTemplates(rawDeterministicTemplates);

        responseData = {
          domain_analyzed: domainAnalyzed,
          total_templates_discovered: finalDeterministicTemplates.length,
          templates: finalDeterministicTemplates,
          reasoning: "Analysis generated successfully via the seoClarity Client SEO Architect Deterministic URL Matcher. Structural path segment patterns were clustered by parent prefix cardinality and mapped to industry-standard Schema.org classes using path hierarchy rules.",
          executive_tldr: `Sitemap audit completed successfully using deterministic rule-based mapping fallback. Extracted ${finalDeterministicTemplates.length} distinct template patterns. Standard directory paths (like Blogs, Products, Physicians, and Facilities) were successfully mapped to their high-value Schema representations with precise accuracy.`
        };
      }

      res.json(responseData);
    } catch (error: any) {
      console.error("Error analyzing URLs:", error);
      let errMsg = error.message || "Failed to analyze URLs after multiple attempts";
      
      if (typeof error === "object" && error !== null) {
        if (error.status === "UNAVAILABLE") {
          errMsg = "Google Gemini is currently overloaded with too many requests. We ran automated retries and failovers, but the service is still unavailable. Please check your sitemaps list complexity, or click \"Analyze sitemap\" to try again in a few moments.";
        } else if (error.status === "RESOURCE_EXHAUSTED" || error.code === 429) {
          errMsg = "Gemini API quota exceeded. Please wait a few moments before trying again, or check your billing plan.";
        }
      }
      
      res.status(500).json({ error: errMsg });
    }
  });

  // API endpoint to retrieve API usage and quota stats
  app.get("/api/quota-stats", (req, res) => {
    const now = Date.now();
    const oneMinAgo = now - 60000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Filter logs in the last minute and last 24 hours
    const logsLastMin = apiRequestLogs.filter(log => new Date(log.timestamp).getTime() >= oneMinAgo);
    const logsLastDay = apiRequestLogs.filter(log => new Date(log.timestamp).getTime() >= oneDayAgo);

    const rpm = logsLastMin.length;
    const rpd = logsLastDay.length;

    const tpm = logsLastMin.reduce((acc, log) => acc + (log.totalTokens || 0), 0);
    const tpd = logsLastDay.reduce((acc, log) => acc + (log.totalTokens || 0), 0);

    const totalRequests = apiRequestLogs.length;
    const successfulRequests = apiRequestLogs.filter(log => log.status === "success").length;
    const fallbackRequests = apiRequestLogs.filter(log => log.status === "fallback").length;
    const failedRequests = apiRequestLogs.filter(log => log.status === "failed").length;

    const totalTokensUsed = apiRequestLogs.reduce((acc, log) => acc + (log.totalTokens || 0), 0);
    const totalInputTokens = apiRequestLogs.reduce((acc, log) => acc + (log.inputTokens || 0), 0);
    const totalOutputTokens = apiRequestLogs.reduce((acc, log) => acc + (log.outputTokens || 0), 0);

    res.json({
      rpm,
      rpd,
      tpm,
      tpd,
      totalRequests,
      successfulRequests,
      fallbackRequests,
      failedRequests,
      totalTokensUsed,
      totalInputTokens,
      totalOutputTokens,
      limits: {
        rpmLimit: 15,
        rpdLimit: 20, // Free Tier daily request limit
        tpmLimit: 1000000
      },
      recentLogs: apiRequestLogs.slice(-20).reverse() // Return last 20 logs, newest first
    });
  });

  // --- New Feature Endpoints: Nav Menu Crawler & Schema Extractor ---
  
  // Endpoint to crawl menu navigation links of a website homepage
  app.post("/api/crawl-menu", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Homepage URL is required" });
    }

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    try {
      const parsedBase = new URL(targetUrl);
      const origin = parsedBase.origin;
      const hostname = parsedBase.hostname.replace(/^www\./i, "");

      const getRootDomain = (host: string): string => {
        const parts = host.split('.');
        if (parts.length >= 3) {
          const secondToLast = parts[parts.length - 2];
          const commonSlds = ["co", "com", "net", "org", "gov", "edu", "ac"];
          if (commonSlds.includes(secondToLast) && parts.length >= 3) {
            return parts.slice(-3).join('.');
          }
        }
        return parts.slice(-2).join('.');
      };
      const rootDomain = getRootDomain(hostname);

      // Reuse header strategies
      const headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      };

      console.log(`[Crawler] Visiting homepage: ${targetUrl}`);
      let html = "";
      
      try {
        const response = await axios.get(targetUrl, {
          headers,
          timeout: 6000,
          maxRedirects: 5,
          responseType: 'text'
        });
        html = response.data;
      } catch (err: any) {
        console.error(`[Crawler] Axios failed, falling back to curl for menu crawl: ${err.message}`);
        // Fallback to curl
        const escapedUrl = targetUrl.replace(/'/g, "'\\''");
        const ua = "Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)";
        const cmd = `curl -L -s -k -m 15 -A '${ua}' '${escapedUrl}'`;
        const { stdout } = await execPromise(cmd, { maxBuffer: 15 * 1024 * 1024 });
        html = stdout;
      }

      if (!html || html.trim().length === 0) {
        throw new Error("Could not retrieve HTML content from the homepage.");
      }

      const cheerio = await import("cheerio");
      const $ = cheerio.load(html);

      const discoveredLinks: Array<{ text: string; url: string; category: string }> = [];
      const seenUrls = new Set<string>();

      // Target navigation menus, header, footer first, then other links
      const navSelectors = [
        "header", "nav", ".nav", ".menu", ".header", ".footer", "footer",
        "[role='navigation']", ".navigation", "#navigation", ".main-menu",
        ".navbar", ".navbar-nav", ".dropdown-menu", ".nav-menu", ".mega-menu",
        ".footer-links", ".footer-menu"
      ];

      // Find all anchors inside these navigation/menu containers
      navSelectors.forEach(selector => {
        $(selector).find("a").each((_, elem) => {
          const href = $(elem).attr("href")?.trim();
          const text = $(elem).text().trim().replace(/\s+/g, " ");
          
          if (!href) return;
          
          try {
            // Resolve relative URLs
            let resolvedUrl = href;
            if (href.startsWith("//")) {
              resolvedUrl = parsedBase.protocol + href;
            } else if (href.startsWith("/")) {
              resolvedUrl = origin + href;
            } else if (!href.startsWith("http://") && !href.startsWith("https://")) {
              // relative to path
              const basePath = parsedBase.pathname.endsWith("/") ? parsedBase.pathname : parsedBase.pathname + "/..";
              resolvedUrl = new URL(href, origin + basePath).toString();
            }

            const cleanUrl = new URL(resolvedUrl);
            const cleanUrlStr = cleanUrl.origin + cleanUrl.pathname; // strip query params/hash
            const linkHostname = cleanUrl.hostname.replace(/^www\./i, "");

            // Filter for same-domain links only and discard empty or extremely long ones
            if ((linkHostname === rootDomain || linkHostname.endsWith("." + rootDomain)) && !seenUrls.has(cleanUrlStr) && cleanUrl.pathname !== "/" && cleanUrlStr.length < 250) {
              seenUrls.add(cleanUrlStr);
              
              // Categorize based on url slug or link text
              let category = "General Page";
              const pathLower = cleanUrl.pathname.toLowerCase();
              const textLower = text.toLowerCase();

              if (pathLower.includes("/product") || pathLower.includes("/feature") || pathLower.includes("/platform") || pathLower.includes("/solution") || textLower.includes("product") || textLower.includes("solutions") || textLower.includes("features")) {
                category = "Products & Solutions";
              } else if (pathLower.includes("/pricing") || pathLower.includes("/plan") || textLower.includes("pricing") || textLower.includes("plans") || textLower.includes("pricing plans")) {
                category = "Pricing & Plans";
              } else if (pathLower.includes("/blog") || pathLower.includes("/resource") || pathLower.includes("/article") || pathLower.includes("/case-study") || pathLower.includes("/guide") || textLower.includes("blog") || textLower.includes("resources") || textLower.includes("case studies") || textLower.includes("guides")) {
                category = "Resources & Editorial";
              } else if (pathLower.includes("/about") || pathLower.includes("/company") || pathLower.includes("/contact") || pathLower.includes("/career") || pathLower.includes("/jobs") || textLower.includes("about") || textLower.includes("contact") || textLower.includes("careers")) {
                category = "Company & Info";
              } else if (pathLower.includes("/compare") || pathLower.includes("/vs") || pathLower.includes("-vs-") || textLower.includes("compare") || textLower.includes("versus") || textLower.includes(" vs ")) {
                category = "Comparisons & Vs";
              } else if (pathLower.includes("/template") || textLower.includes("templates") || textLower.includes("gallery")) {
                category = "Templates & Tools";
              } else if (pathLower.includes("/apps") || pathLower.includes("/integration") || textLower.includes("apps") || textLower.includes("integrations")) {
                category = "Apps & Integrations";
              }

              discoveredLinks.push({
                text: text || cleanUrl.pathname,
                url: cleanUrlStr,
                category
              });
            }
          } catch (e) {
            // ignore malformed urls
          }
        });
      });

      // If we found very few links in navigation menus, sweep the entire document
      if (discoveredLinks.length < 5) {
        $("a").each((_, elem) => {
          const href = $(elem).attr("href")?.trim();
          const text = $(elem).text().trim().replace(/\s+/g, " ");
          
          if (!href) return;
          
          try {
            let resolvedUrl = href;
            if (href.startsWith("//")) {
              resolvedUrl = parsedBase.protocol + href;
            } else if (href.startsWith("/")) {
              resolvedUrl = origin + href;
            } else if (!href.startsWith("http://") && !href.startsWith("https://")) {
              const basePath = parsedBase.pathname.endsWith("/") ? parsedBase.pathname : parsedBase.pathname + "/..";
              resolvedUrl = new URL(href, origin + basePath).toString();
            }

            const cleanUrl = new URL(resolvedUrl);
            const cleanUrlStr = cleanUrl.origin + cleanUrl.pathname;
            const linkHostname = cleanUrl.hostname.replace(/^www\./i, "");

            if ((linkHostname === rootDomain || linkHostname.endsWith("." + rootDomain)) && !seenUrls.has(cleanUrlStr) && cleanUrl.pathname !== "/" && cleanUrlStr.length < 250) {
              seenUrls.add(cleanUrlStr);
              
              let category = "General Page";
              const pathLower = cleanUrl.pathname.toLowerCase();
              const textLower = text.toLowerCase();

              if (pathLower.includes("/product") || pathLower.includes("/feature") || pathLower.includes("/platform") || pathLower.includes("/solution") || textLower.includes("product") || textLower.includes("solutions") || textLower.includes("features")) {
                category = "Products & Solutions";
              } else if (pathLower.includes("/pricing") || pathLower.includes("/plan") || textLower.includes("pricing") || textLower.includes("plans")) {
                category = "Pricing & Plans";
              } else if (pathLower.includes("/blog") || pathLower.includes("/resource") || pathLower.includes("/article") || pathLower.includes("/case-study") || pathLower.includes("/guide") || textLower.includes("blog") || textLower.includes("resources")) {
                category = "Resources & Editorial";
              } else if (pathLower.includes("/about") || pathLower.includes("/company") || pathLower.includes("/contact") || pathLower.includes("/career") || pathLower.includes("/jobs") || textLower.includes("about")) {
                category = "Company & Info";
              } else if (pathLower.includes("/compare") || pathLower.includes("/vs") || pathLower.includes("-vs-") || textLower.includes("compare")) {
                category = "Comparisons & Vs";
              } else if (pathLower.includes("/template") || textLower.includes("templates")) {
                category = "Templates & Tools";
              } else if (pathLower.includes("/apps") || pathLower.includes("/integration") || textLower.includes("apps") || textLower.includes("integrations")) {
                category = "Apps & Integrations";
              }

              discoveredLinks.push({
                text: text || cleanUrl.pathname,
                url: cleanUrlStr,
                category
              });
            }
          } catch (e) {
            // ignore
          }
        });
      }

      // Sort discovered links so that high-value categories appear first, and limit to 1000 links to keep it responsive
      discoveredLinks.sort((a, b) => {
        const priority: Record<string, number> = {
          "Products & Solutions": 1,
          "Pricing & Plans": 2,
          "Apps & Integrations": 3,
          "Comparisons & Vs": 4,
          "Templates & Tools": 5,
          "Resources & Editorial": 6,
          "Company & Info": 7,
          "General Page": 8
        };
        return (priority[a.category] || 9) - (priority[b.category] || 9);
      });

      console.log(`[Crawler] Discovered ${discoveredLinks.length} total menu navigation links for ${hostname}`);

      res.json({
        domain: hostname,
        linksCount: discoveredLinks.length,
        links: discoveredLinks.slice(0, 1000)
      });

    } catch (err: any) {
      console.log("[Crawler Info] Menu crawl failed:", err.message);
      res.status(500).json({ error: `Failed to crawl navigation menus: ${err.message}` });
    }
  });

  // Endpoint to analyze homepage navigation menu links, detect industry vertical, majority page templates, and recommend schema
  app.post("/api/analyze-menu-templates", async (req, res) => {
    const { homepageUrl, links } = req.body;

    if (!homepageUrl && (!links || !Array.isArray(links) || links.length === 0)) {
      return res.status(400).json({ error: "Please provide a domain/homepage URL or menu links." });
    }

    try {
      let targetDomain = "";
      let menuLinks: Array<{ text: string; url: string; category?: string }> = links || [];

      // If links are not provided, crawl menu from homepageUrl
      if (menuLinks.length === 0 && homepageUrl) {
        let targetUrl = homepageUrl.trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          targetUrl = 'https://' + targetUrl;
        }

        try {
          const parsedBase = new URL(targetUrl);
          targetDomain = parsedBase.hostname.replace(/^www\./i, "");
          const origin = parsedBase.origin;

          const headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          };

          let html = "";
          try {
            const response = await axios.get(targetUrl, { headers, timeout: 6000, maxRedirects: 5, responseType: 'text' });
            html = response.data;
          } catch {
            const escapedUrl = targetUrl.replace(/'/g, "'\\''");
            const ua = "Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)";
            const cmd = `curl -L -s -k -m 15 -A '${ua}' '${escapedUrl}'`;
            const { stdout } = await execPromise(cmd, { maxBuffer: 15 * 1024 * 1024 });
            html = stdout;
          }

          if (html && html.trim().length > 0) {
            const cheerio = await import("cheerio");
            const $ = cheerio.load(html);
            const seenUrls = new Set<string>();

            $("header, nav, .nav, .menu, .footer, footer, [role='navigation'], .main-menu, .navbar, .footer-links, a").each((_, elem) => {
              const href = $(elem).attr("href")?.trim();
              const text = $(elem).text().trim().replace(/\s+/g, " ");
              if (!href) return;
              try {
                let resolvedUrl = href;
                if (href.startsWith("//")) resolvedUrl = parsedBase.protocol + href;
                else if (href.startsWith("/")) resolvedUrl = origin + href;
                else if (!href.startsWith("http://") && !href.startsWith("https://")) {
                  resolvedUrl = new URL(href, origin + parsedBase.pathname).toString();
                }

                const cleanUrl = new URL(resolvedUrl);
                const cleanUrlStr = cleanUrl.origin + cleanUrl.pathname;
                const linkHost = cleanUrl.hostname.replace(/^www\./i, "");

                if ((linkHost === targetDomain || linkHost.endsWith("." + targetDomain)) && !seenUrls.has(cleanUrlStr) && cleanUrl.pathname !== "/" && cleanUrlStr.length < 250) {
                  seenUrls.add(cleanUrlStr);
                  menuLinks.push({
                    text: text || cleanUrl.pathname,
                    url: cleanUrlStr
                  });
                }
              } catch {
                // ignore
              }
            });
          }
        } catch (crawlErr: any) {
          console.warn("[Menu Analyze] Internal crawl warning:", crawlErr.message);
        }
      }

      if (menuLinks.length > 0 && !targetDomain) {
        try {
          const u = new URL(menuLinks[0].url);
          targetDomain = u.hostname.replace(/^www\./i, "");
        } catch {
          targetDomain = "domain-under-analysis.com";
        }
      }

      if (!targetDomain) {
        targetDomain = (homepageUrl || "target-domain.com").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split('/')[0];
      }

      const rawUrls = menuLinks.map(l => l.url);
      const { clusters } = clusterRawUrls(rawUrls.length > 0 ? rawUrls : [homepageUrl || "https://" + targetDomain]);

      let responseData: any = null;

      try {
        const prompt = `You are a Lead SEO Architect for seoClarity conducting an Enterprise Navigation & Page Template Schema Audit for "${targetDomain}".

Here is a list of navigation menu links and URL structure clusters extracted from "${targetDomain}":

Discovered Navigation Links (sample):
${JSON.stringify(menuLinks.slice(0, 100), null, 2)}

URL Pattern Clusters:
${JSON.stringify(clusters.slice(0, 25), null, 2)}

CRITICAL REQUIREMENTS:
1. IDENTIFY INDUSTRY VERTICAL:
   Identify the primary industry vertical of "${targetDomain}" (e.g. "Banking & Financial Services (e.g. truist.com, chase.com)", "E-Commerce & Retail", "Healthcare & Hospital System", "Software / SaaS", "Automotive & Dealerships", "Local Business & Franchise", "Real Estate & Housing").
   Specify the exact official Schema.org documentation page for this industry (e.g., "https://schema.org/docs/financial.html" for Banking & Financial Services, "https://schema.org/Product" for E-Commerce, "https://schema.org/MedicalBusiness" for Healthcare, "https://schema.org/LocalBusiness" for Local Business).

2. IDENTIFY MAJORITY PAGE TEMPLATES:
   Examine the menu structure and URL patterns to identify the core page templates across the site.
   For example, for Banking/Financial Services (like Truist or Chase):
   - "Financial Product - Credit Cards" (Schema: CreditCard)
   - "Financial Product - Mortgages & Home Loans" (Schema: MortgageLoan)
   - "Financial Product - Personal & Auto Loans" (Schema: LoanOrCredit)
   - "Financial Product - Checking & Deposit Accounts" (Schema: FinancialProduct)
   - "Financial Wealth & Investment Page" (Schema: FinancialService)
   - "Bank Branch & ATM Locator" (Schema: BankOrCreditUnion / LocalBusiness / ATM)
   - "Financial Calculators & Interactive Tools" (Schema: WebPage)
   - "Financial Guidance & Educational Articles" (Schema: Article)

3. SCHEMA RECOMMENDATIONS & CODE GENERATION:
   For EACH template identified, recommend:
   - Primary Schema.org @type (e.g. CreditCard, MortgageLoan, FinancialProduct, BankOrCreditUnion, Product, LocalBusiness, Article, FAQPage)
   - Secondary Schema @types array (e.g. ["BankOrCreditUnion", "BreadcrumbList", "FAQPage"])
   - Target Search Features / SERP Rich Snippets (e.g. "Financial Product Badging, SERP FAQ Accordion, Google Knowledge Graph, Local Pack")
   - Required & Recommended Properties array (e.g. ["name", "description", "annualPercentageRate", "feesAndCommissionsSpecification", "provider", "offers"])
   - A complete, valid, syntactically perfect JSON-LD Schema Code snippet ("json_ld_example") formatted inside <script type="application/ld+json"> ... </script> pre-populated with realistic field values customized for "${targetDomain}".
   - Share percentage (e.g. 25) and estimated count of pages for this template.
   - Sample URLs (keep or refine from the input sample urls).

4. EXECUTIVE & ELI5 SUMMARIES:
   - "reasoning": Chain-of-Thought explanation of why these schemas are recommended and how they maximize Google Rich Results.
   - "executive_tldr": Authoritative summary for SEO leadership and CMOs.
   - "eli5_summary": Simple, jargon-free ELI5 summary for non-technical stakeholders.

Return a single JSON object with these exact keys:
- domain_analyzed: "${targetDomain}"
- industry_vertical: string
- industry_schema_doc_link: string
- total_templates_discovered: number
- crawled_menu_link_count: ${menuLinks.length}
- executive_tldr: string
- eli5_summary: string
- reasoning: string
- templates: array of objects {
    template_name: string,
    url_pattern: string,
    recommended_primary_schema: string,
    secondary_schemas: string[],
    share_percentage: number,
    count: number,
    target_rich_results: string,
    required_schema_properties: string[],
    json_ld_example: string,
    schema_explanation: string,
    sample_urls: string[],
    all_matching_urls: string[]
  }
`;

        const aiRes = await generateContentWithRetryAndFallback(prompt);
        if (aiRes && aiRes.text) {
          let text = aiRes.text;
          const firstBrace = text.indexOf("{");
          const lastBrace = text.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1) {
            text = text.substring(firstBrace, lastBrace + 1);
          }
          responseData = JSON.parse(text);
        }
      } catch (aiErr: any) {
        console.warn("[Menu Analyze AI Warning] Falling back to deterministic analysis:", aiErr.message);
      }

      // Fallback if AI output missing or failed
      if (!responseData || !responseData.templates || !Array.isArray(responseData.templates) || responseData.templates.length === 0) {
        const isBanking = /bank|truist|chase|wellsfargo|citi|capitalone|pnc|usbank|tdbank|firsthorizon|fifththird|ally|discover/i.test(targetDomain) ||
          menuLinks.some(l => /credit-card|mortgage|checking|savings|loan|atm|branch/i.test(l.url));

        const deterministicTemplates = clusters.map(c => {
          const { template_name, recommended_primary_schema } = getDeterministicSchemaAndName(c.pattern, targetDomain, c.samples);
          return {
            template_name,
            url_pattern: c.pattern,
            recommended_primary_schema,
            secondary_schemas: ["BreadcrumbList", "Organization"],
            share_percentage: Math.round((c.count / Math.max(1, rawUrls.length)) * 100) || 10,
            count: c.count || c.samples.length,
            target_rich_results: "Google Search Knowledge Graph, SERP Snippet Enhancements",
            required_schema_properties: ["name", "description", "url", "publisher"],
            json_ld_example: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "${recommended_primary_schema}",
  "name": "${template_name} - ${targetDomain}",
  "url": "${c.samples[0] || 'https://' + targetDomain + c.pattern}",
  "description": "Enterprise page representation for ${template_name} on ${targetDomain}."
}
</script>`,
            schema_explanation: `Mapped using deterministic structural matching for pattern ${c.pattern}.`,
            sample_urls: c.samples,
            all_matching_urls: c.all_urls || c.samples
          };
        });

        responseData = {
          domain_analyzed: targetDomain,
          industry_vertical: isBanking ? "Banking & Financial Services (e.g. truist.com)" : "General Enterprise Web",
          industry_schema_doc_link: isBanking ? "https://schema.org/docs/financial.html" : "https://schema.org/docs/schemas.html",
          total_templates_discovered: deterministicTemplates.length,
          crawled_menu_link_count: menuLinks.length,
          executive_tldr: `Identified ${deterministicTemplates.length} core page template clusters from ${menuLinks.length} homepage navigation menu links for ${targetDomain}. Mapped each template to high-value Schema.org structured data types.`,
          eli5_summary: `We scanned ${targetDomain}'s main navigation menu, grouped similar page layouts together, and recommended the exact schema tags Google needs to show rich search results.`,
          reasoning: `Analysis executed via the seoClarity Client SEO Architect Navigation Analysis Engine. Homepage menu items were extracted and clustered by path cardinality.`,
          templates: deterministicTemplates
        };
      }

      res.json(responseData);

    } catch (err: any) {
      console.error("[Menu Analyze Error]", err.message);
      res.status(500).json({ error: `Failed to analyze menu templates: ${err.message}` });
    }
  });

  // Endpoint to detect custom user-specified template pattern
  app.post("/api/detect-custom-template", (req, res) => {
    const { pattern, domain, urls } = req.body;
    if (!pattern) {
      return res.status(400).json({ error: "Pattern is required" });
    }

    let cleanPattern = pattern.trim();
    if (!cleanPattern.startsWith("/") && !cleanPattern.startsWith("http://") && !cleanPattern.startsWith("https://")) {
      cleanPattern = "/" + cleanPattern;
    }
    const cleanDomain = (domain || "").trim() || "unknown-domain.com";
    let injectedPageUrl: string | null = null;

    // Resolve pattern if it's an absolute URL or a specific path without wildcard
    if (cleanPattern.startsWith("http://") || cleanPattern.startsWith("https://")) {
      injectedPageUrl = cleanPattern;
      try {
        const u = new URL(cleanPattern);
        cleanPattern = u.pathname;
      } catch {
        // keep as is
      }
    } else if (cleanPattern.startsWith("/")) {
      if (!cleanPattern.includes("*")) {
        const protocol = "https://";
        injectedPageUrl = `${protocol}${cleanDomain}${cleanPattern}`;
      }
    } else if (!cleanPattern.includes("*") && cleanPattern.includes("/")) {
      const protocol = "https://";
      injectedPageUrl = `${protocol}${cleanDomain}/${cleanPattern}`;
      cleanPattern = "/" + cleanPattern;
    } else if (!cleanPattern.includes("*") && cleanPattern.length > 0) {
      const protocol = "https://";
      injectedPageUrl = `${protocol}${cleanDomain}/${cleanPattern}`;
      cleanPattern = "/" + cleanPattern;
    }

    // Split urls and trim
    const urlList = Array.isArray(urls) 
      ? urls 
      : (typeof urls === "string" ? urls.split(/\r?\n/).map((u: string) => u.trim()).filter(Boolean) : []);

    // Perform matching against url list
    const isMatch = (urlStr: string, pat: string): boolean => {
      try {
        let path = urlStr;
        if (urlStr.startsWith("http://") || urlStr.startsWith("https://") || urlStr.startsWith("//")) {
          // Absolute URL or protocol-relative
          const parsed = new URL(urlStr.startsWith("//") ? "https:" + urlStr : urlStr);
          path = parsed.pathname;
        } else {
          // Relative path
          path = urlStr.split(/[?#]/)[0];
        }
        
        if (!pat.includes('*')) {
          const normPath = path.endsWith('/') ? path : path + '/';
          const normPat = pat.endsWith('/') ? pat : pat + '/';
          return normPath.toLowerCase() === normPat.toLowerCase() || path.toLowerCase() === pat.toLowerCase();
        }
        
        // Escape regex safely using a placeholder for *
        const placeholder = "___WILDCARD_PLACEHOLDER___";
        let tempPat = pat.replace(/\*/g, placeholder);
        tempPat = tempPat.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');
        const regexStr = '^' + tempPat.replace(new RegExp(placeholder, 'g'), '.*') + '$';
        const regex = new RegExp(regexStr, 'i');
        return regex.test(path);
      } catch {
        return false;
      }
    };

    let matchingUrls = urlList.filter((u: string) => isMatch(u, cleanPattern));

    // If we injected a specific page, ensure it is in the matchingUrls roster
    if (injectedPageUrl) {
      const exists = matchingUrls.some(u => {
        try {
          const uParsed = new URL(u);
          const iParsed = new URL(injectedPageUrl!);
          return uParsed.pathname.toLowerCase() === iParsed.pathname.toLowerCase();
        } catch {
          return u.toLowerCase() === injectedPageUrl!.toLowerCase();
        }
      });
      if (!exists) {
        matchingUrls = [injectedPageUrl, ...matchingUrls];
      }
    }

    const samples = matchingUrls.slice(0, 6);

    const { template_name, recommended_primary_schema } = getDeterministicSchemaAndName(cleanPattern, cleanDomain, samples);

    res.json({
      template_name,
      url_pattern: cleanPattern,
      recommended_primary_schema,
      sample_urls: samples.slice(0, 5), // return more samples to make sure it displays prominently
      count: matchingUrls.length,
      all_matching_urls: matchingUrls
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
