import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
];

function getRandomHeaders(userAgent?: string) {
    const ua = userAgent || userAgents[Math.floor(Math.random() * userAgents.length)];
    return {
        "User-Agent": ua,
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    };
}
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
    score: number; // 0-100
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
  meta: {
    url: string;
    date: string;
  };
  executiveTldr: string;
  eli5: string;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // Helper with automatic retry & model fallbacks to bypass transient Google 503 errors under high demand
  async function generateContentWithRetry(aiClient: any, params: any, retries = 3, delay = 1000): Promise<any> {
    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite"
    ];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      let currentDelay = delay;
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`Calling Gemini API using model: ${modelName} (Attempt ${attempt}/${retries})...`);
          const result = await aiClient.models.generateContent({
            ...params,
            model: modelName,
          });
          return result;
        } catch (error: any) {
          lastError = error;
          const errorMessage = error.message || String(error);
          console.error(`Gemini call failed with model ${modelName} on attempt ${attempt}:`, errorMessage);

          // If it is a structural validation error, try the next model immediately
          if (errorMessage.includes("invalid") || errorMessage.includes("Schema") || error.status === 400) {
            break;
          }

          if (attempt < retries) {
            console.log(`Retrying in ${currentDelay}ms due to potential transient load error...`);
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            currentDelay *= 2; // Exponential backoff
          }
        }
      }
    }

    throw new Error(
      `All available audit analysis models are currently experiencing high demand at Google's servers. ` +
      `Please try again in a few moments. (Details: ${lastError?.message || lastError})`
    );
  }

  // Resilient Triple-Layer Fetch to handle WAF, Cloudflare, or Bot-blocking 403/401/503 restrictions
  async function fetchNoJsHtml(url: string, requestedUserAgent?: string): Promise<string> {
    let response: any = null;
    let usedUA = requestedUserAgent || "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": usedUA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        }
      });
    } catch (err: any) {
      console.warn(`Initial fetch to ${url} failed with network error:`, err.message);
    }

    // Fall back to genuine browser persona if response is blocked, fails or throws status error
    if (!response || response.status === 403 || response.status === 401 || response.status === 405 || response.status === 503) {
      console.log(`Initial fetch received ${response ? response.status : "network error"}. Retrying with authentic Chrome browser footprint fallback...`);
      usedUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      try {
        response = await fetch(url, {
          headers: {
            "User-Agent": usedUA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "Upgrade-Insecure-Requests": "1"
          }
        });
      } catch (retryErr: any) {
        console.warn(`Fallback fetch retry failed with error:`, retryErr.message);
      }
    }

    // ULTIMATE FALLBACK: If standard node-fetches are blocked (403, 503, etc.) or failed, try resilient fetch with randomized headers!
    if (!response || !response.ok || response.status === 403 || response.status === 401 || response.status === 503) {
      console.log(`Fetch returned status ${response ? response.status : "network error"}. Enacting ultimate resilient fetch fallback...`);
      try {
        response = await fetch(url, {
          headers: getRandomHeaders(requestedUserAgent)
        });
        if (response && response.ok) {
          console.log(`Resilient fetch fallback succeeded.`);
          return await response.text();
        }
      } catch (err: any) {
        console.warn(`Resilient fetch fallback failed:`, err.message);
      }
    }

    if (!response) {
      throw new Error(`Failed to fetch: Connection timeout/network error (Tried bot crawler and Desktop Chrome personas)`);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText} (Tried bot crawler and Desktop Chrome personas)`);
    }

    return await response.text();
  }

  function normalizeUrl(input: string): string {
    if (!input) return "";
    let clean = input.trim();
    // Repair common comma typos in domain parts (e.g., "www,thezebra,com" -> "www.thezebra.com")
    clean = clean.replace(/([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)/g, '$1.$2');
    
    // Prepend protocol if missing
    if (!/^https?:\/\//i.test(clean)) {
      clean = "https://" + clean;
    }
    return clean;
  }

  // API Routes
  app.post("/api/fetch-nojs", async (req, res) => {
    try {
      const { url, userAgent } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });

      const normalizedUrl = normalizeUrl(url);
      const html = await fetchNoJsHtml(normalizedUrl, userAgent);
      res.json({ html });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/full-crawl", async (req, res) => {
    const { url, userAgent } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    const normalizedUrl = normalizeUrl(url);
    try {
      // Since Puppeteer is disabled in this environment, we fetch the same raw HTML for both JS and No-JS versions,
      // informing the user that JS-rendering is currently unavailable.
      const html = await fetchNoJsHtml(normalizedUrl, userAgent);
      
      const noJsHtml = html;
      const jsHtml = `<!-- JS-rendering disabled: Content retrieved without rendering. -->\n${html}`;
      
      const resources: ResourceStats = {
        totalRequests: 0,
        jsRequests: 0,
        cssRequests: 0,
        apiRequests: 0,
        imageRequests: 0,
        blockedRequests: []
      };
      
      res.json({ jsHtml, noJsHtml, resources });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyze", async (req, res) => {
    try {
      const { jsHtml, noJsHtml, url, resources } = req.body;

      if (!jsHtml || !noJsHtml) {
        return res.status(400).json({ error: "Both JS and No-JS HTML are required." });
      }

      // Pre-analysis with Cheerio to help the AI
      const $js = cheerio.load(jsHtml);
      const $nojs = cheerio.load(noJsHtml);

      const getExternalDomains = ($: cheerio.CheerioAPI) => {
        const domains = new Set<string>();
        $('script[src], link[href], img[src], iframe[src]').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('href');
          if (src && src.startsWith('http')) {
            try {
              const url = new URL(src);
              domains.add(url.hostname);
            } catch (e) {
              // ignore invalid urls
            }
          }
        });
        return Array.from(domains);
      };

      const jsDomains = getExternalDomains($js);
      const noJsDomains = getExternalDomains($nojs);

      const stats = {
        js: {
          scripts: $js("script").length,
          externalScripts: $js("script[src]").length,
          styles: $js("style").length,
          externalStyles: $js("link[rel='stylesheet']").length,
          images: $js("img").length,
          links: $js("a").length,
          h1: $js("h1").length,
          words: $js("body").text().split(/\s+/).length,
          size: Buffer.byteLength(jsHtml, 'utf8'),
          externalDomains: jsDomains.length,
          topDomains: jsDomains.slice(0, 10)
        },
        nojs: {
          scripts: $nojs("script").length,
          externalScripts: $nojs("script[src]").length,
          styles: $nojs("style").length,
          externalStyles: $nojs("link[rel='stylesheet']").length,
          images: $nojs("img").length,
          links: $nojs("a").length,
          h1: $nojs("h1").length,
          words: $nojs("body").text().split(/\s+/).length,
          size: Buffer.byteLength(noJsHtml, 'utf8'),
          externalDomains: noJsDomains.length,
          topDomains: noJsDomains.slice(0, 10)
        }
      };

      const resourceContext = resources ? `
        NETWORK EMULATION DATA (PUPPETEER):
        Total Initial Requests: ${resources.totalRequests}
        JS Files: ${resources.jsRequests}
        CSS Files: ${resources.cssRequests}
        API/XHR Calls: ${resources.apiRequests}
        Images: ${resources.imageRequests}
        BLOCKED REQUESTS (429/403): ${resources.blockedRequests.length}
        Blocked Sample: ${resources.blockedRequests.map((r: any) => `${r.url} (${r.status})`).join(', ')}
      ` : "No network emulation data provided.";

      const noJsFailed = noJsHtml.includes("FAILED_TO_FETCH_RAW_NO_JS");
      const jsFailed = jsHtml.includes("FAILED_TO_RENDER_JS");

      const failureInsights = `
        ${noJsFailed ? `
        ⚠️ CRITICAL INFRASTRUCTURE DETECTED: NO-JS CRAWLER WAS BLOCKED BY WAF/FIREWALL!
        The raw HTML fetcher encountered an anti-bot check or firewall barrier (e.g. 403 Forbidden, 503, or CDN challenge).
        This means crawlers that fetch the page without high-fidelity desktop heads or standard cookie-session setups are rejected.
        Analyze this as a SEVERE technical indexing risk. Detail how CDN/WAF rules (such as Cloudflare, Akamai, or Imperva) blocking No-JS requests can lock out legitimate search engine micro-crawlers, feed syndicators, or custom SEO bots. Suggest firewall exceptions or user-agent whitelisting solutions.
        ` : ""}
        ${jsFailed ? `
        ⚠️ CRITICAL CLIENT-SIDE DETECTED: JS RENDERER ENCOUNTERED A TIMEOUT OR NAV-ERROR!
        The JS-rendered crawler failed to navigate or hydated this page properly. Analyze this hydration or execution crash.
        ` : ""}
      `;

      const prompt = `
        You are a Lead SEO Auditor and Technical Infrastructure Analyst for seoClarity. Compare the following two HTML versions of a webpage and provide a deep, high-precision technical audit.
        URL: ${url || "Unknown"}
        
        VERSION 1: JS-Enabled Render (Snapshot of the fully rendered DOM)
        Stats: Scripts: ${stats.js.scripts} (Ext: ${stats.js.externalScripts}), Styles: ${stats.js.styles} (Ext: ${stats.js.externalStyles}), Images: ${stats.js.images}, H1: ${stats.js.h1}, Word count: ~${stats.js.words}, Size: ${stats.js.size} bytes.
        External Domains Sample: ${stats.js.topDomains.join(', ')}
        
        VERSION 2: JS-Disabled Render (Raw HTML/Server output)
        Stats: Scripts: ${stats.nojs.scripts} (Ext: ${stats.nojs.externalScripts}), Styles: ${stats.nojs.styles} (Ext: ${stats.nojs.externalStyles}), Images: ${stats.nojs.images}, H1: ${stats.nojs.h1}, Word count: ~${stats.nojs.words}, Size: ${stats.nojs.size} bytes.
        External Domains Sample: ${stats.nojs.topDomains.join(', ')}

        ${resourceContext}

        ${failureInsights}

        TASK:
        Perform a deep technical comparison for SEO, crawler accessibility, and INFRASTRUCTURE RISK. 
        Identify WHY the page might look blank or different without JS.
        
        SPECIAL FOCUS: 429 RATE LIMITING & BOT MANAGEMENT
        - Analyze the number of external resources. Is there "Resource Bloat" (too many scripts/styles) that could trigger 429s during a JS crawl?
        - Look for Bot Management signatures (DataDome, Akamai Bot Manager, Imperva, Cloudflare Challenge, PerimeterX/HUMAN).
        - Evaluate if a JS-enabled crawler would be overwhelmed by the "Request Waterfall" compared to a raw HTML crawler.
        - If Blocked Requests are > 0, diagnose the "WAF/Blockage" risk immediately.

        Provide actionable insights using the Diagnostic Intelligence Flow (Cognitive reasoning path).
        
        IMPORTANT: You MUST populate the 'quantitative' array using the Stats provided above. Include metrics for Total requests (scripts+styles+images) and External Domains.
        
        TONE OF VOICE & STYLE:
        - "Smartest person in the room who wants to help." Composed, authoritative, clear, and direct.
        - Terminological Rigor: Avoid soft marketing fluff. Always favor data-backed, high-precision technical SEO and ontological terminology (e.g., SHACL shapes, JSON-LD flat graphs, entity identity anchors, content parity schema metrics).
        
        THE GOLDEN CIRCLE MANDATE:
        Provide a strategic funnel analysis using Simon Sinek's "Golden Circle":
        1. WHY (Purpose): Why does this crawl disparity or resource gap exist, and why does it matter for search engine bot discovery?
        2. HOW (Methodology): How did we execute this detection and what specific technical mechanisms were monitored?
        3. WHAT (Outcome/Action): What are the tangible architectural outcomes and immediate corrective changes required?

        CONFIDENCE METRICS:
        You must compute a realistic confidence score and state:
        - Confidence Level: "High" | "Medium" | "Low"
        - Accuracy Probability: integer between 1 and 100 (representing the probability of diagnostic correctness based on content density/data completeness).

        Format your response as a JSON object matching this schema:
        {
          "bottomLine": "string summary",
          "reasoning": ["Detailed step-by-step internal reasoning steps for the audit"],
          "goldenCircle": {
            "why": "The purpose / strategic necessity of fixing this disparity",
            "how": "The technical detection methodology used",
            "what": "The tangible, concrete action items and architectural outcomes"
          },
          "confidenceMetrics": {
            "confidenceLevel": "High|Medium|Low",
            "accuracyProbability": number
          },
          "causes": [{ "title": "string", "description": "string", "type": "primary|secondary|info", "snippet": "code snippet if applicable", "list": ["points"] }],
          "quantitative": [{ "metric": "string", "jsValue": "string", "nojsValue": "string", "notes": "string" }],
          "infrastructureRisk": {
            "score": number,
            "riskLevel": "Critical|High|Medium|Low",
            "metrics": [{ "label": "string", "value": "string or number" }],
            "analysis": "string"
          },
          "seoInsights": { "good": ["points"], "risks": ["points"], "takeaway": "string" },
          "technicalDetails": [{ "area": "string", "js": "string", "nojs": "string" }],
          "recommendations": ["actionable steps"],
          "executiveTldr": "Concise summary for executives focusing on technical SEO outcomes",
          "eli5": "Simple explanation for non-technical users in plain terms"
        }

        CONTENT GAPS TO CHECK:
        - Visibility rules (visibility: hidden)
        - Web Components hydration (shadow DOM presence)
        - CSS media queries (print vs screen)
        - Metadata (Title, Desc, Canonical, OG tags, Schema.org/JSON-LD)
        - Main content availability (is the copy actually in the DOM?)
        - Link discoverability (L1/L2 menus)
        
        HTML Content for VERSION 1 (JS Enabled - truncated if necessary):
        ${jsHtml.substring(0, 50000)}
        
        HTML Content for VERSION 2 (No JS - truncated if necessary):
        ${noJsHtml.substring(0, 50000)}
      `;

      const result = await generateContentWithRetry(ai, {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bottomLine: { type: Type.STRING },
              reasoning: { type: Type.ARRAY, items: { type: Type.STRING } },
              goldenCircle: {
                type: Type.OBJECT,
                properties: {
                  why: { type: Type.STRING },
                  how: { type: Type.STRING },
                  what: { type: Type.STRING }
                },
                required: ["why", "how", "what"]
              },
              confidenceMetrics: {
                type: Type.OBJECT,
                properties: {
                  confidenceLevel: { type: Type.STRING },
                  accuracyProbability: { type: Type.NUMBER }
                },
                required: ["confidenceLevel", "accuracyProbability"]
              },
              causes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    type: { type: Type.STRING },
                    snippet: { type: Type.STRING },
                    list: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["title", "description", "type"]
                }
              },
              quantitative: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    metric: { type: Type.STRING },
                    jsValue: { type: Type.STRING },
                    nojsValue: { type: Type.STRING },
                    notes: { type: Type.STRING }
                  },
                  required: ["metric", "jsValue", "nojsValue"]
                }
              },
              infrastructureRisk: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  riskLevel: { type: Type.STRING },
                  metrics: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        value: { type: Type.STRING }
                      }
                    }
                  },
                  analysis: { type: Type.STRING }
                }
              },
              seoInsights: {
                type: Type.OBJECT,
                properties: {
                  good: { type: Type.ARRAY, items: { type: Type.STRING } },
                  risks: { type: Type.ARRAY, items: { type: Type.STRING } },
                  takeaway: { type: Type.STRING }
                }
              },
              technicalDetails: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    area: { type: Type.STRING },
                    js: { type: Type.STRING },
                    nojs: { type: Type.STRING }
                  }
                }
              },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              executiveTldr: { type: Type.STRING },
              eli5: { type: Type.STRING }
            },
            required: [
              "bottomLine", 
              "reasoning", 
              "goldenCircle", 
              "confidenceMetrics", 
              "causes", 
              "quantitative", 
              "seoInsights", 
              "technicalDetails", 
              "recommendations", 
              "executiveTldr", 
              "eli5"
            ]
          }
        }
      });

      const auditData = JSON.parse(result.text);
      res.json(auditData);

    } catch (error: any) {
      console.error("Analysis failed:", error);
      res.status(500).json({ error: error.message || "An unexpected error occurred during analysis." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
