import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = typeof import.meta !== "undefined" && import.meta.url
  ? fileURLToPath(import.meta.url)
  : "";
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Extraction API for Batch Lab
  app.post("/api/extract", async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      console.log(`Extracting content from: ${url}`);
      const domain = new URL(url).hostname;
      
      // Strategy 1: Chrome UA Desktop headers
      const chromeHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": `https://${domain}/`,
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Upgrade-Insecure-Requests": "1"
      };

      let htmlContent = "";
      let fetchSuccess = false;
      let lastResponseStatus = 200;
      let lastErrorMessage = "";

      // ATTEMPT 1: Desktop Chrome direct
      console.log(`[Crawler] Attempt 1: Direct Chrome fetch for ${url}`);
      try {
        const response = await axios.get(url, {
          headers: chromeHeaders,
          timeout: 4000,
          validateStatus: (status) => status < 500,
        });
        
        lastResponseStatus = response.status;
        if (response.status !== 403 && response.status !== 401 && response.status !== 429 && response.status < 400) {
          htmlContent = response.data;
          fetchSuccess = true;
          console.log(`[Crawler] Direct Chrome fetch succeeded (${response.status})`);
        } else {
          console.warn(`[Crawler] Direct Chrome fetch returned blocking status ${response.status}`);
          lastErrorMessage = `Status ${response.status}`;
        }
      } catch (err: any) {
        console.warn(`[Crawler] Direct Chrome fetch failed: ${err.message}`);
        lastErrorMessage = err.message;
      }

      // ATTEMPT 1.5: seoClarity's ClarityBot UA Spoof (Highly trusted by hostings, firewalls, and CDNs)
      if (!fetchSuccess) {
        console.log(`[Crawler] Attempt 1.5: seoClarity's ClarityBot UA spoof fetch for ${url}`);
        try {
          const clarityBotHeaders = {
            ...chromeHeaders,
            "User-Agent": "Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)",
          };
          const response = await axios.get(url, {
            headers: clarityBotHeaders,
            timeout: 4000,
            validateStatus: (status) => status < 500,
          });

          lastResponseStatus = response.status;
          if (response.status !== 403 && response.status !== 401 && response.status !== 429 && response.status < 400) {
            htmlContent = response.data;
            fetchSuccess = true;
            console.log(`[Crawler] ClarityBot UA spoof succeeded (${response.status})`);
          } else {
            console.warn(`[Crawler] ClarityBot UA spoof returned status ${response.status}`);
            lastErrorMessage = `Status ${response.status}`;
          }
        } catch (err: any) {
          console.warn(`[Crawler] ClarityBot UA spoof failed: ${err.message}`);
          lastErrorMessage = err.message;
        }
      }

      // ATTEMPT 2: Googlebot UA direct (often bypasses simple IP blockers or standard hosting-blacklist WAFs)
      if (!fetchSuccess) {
        console.log(`[Crawler] Attempt 2: Direct Googlebot UA spoof fetch for ${url}`);
        try {
          const googlebotHeaders = {
            ...chromeHeaders,
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          };
          const response = await axios.get(url, {
            headers: googlebotHeaders,
            timeout: 4000,
            validateStatus: (status) => status < 500,
          });

          lastResponseStatus = response.status;
          if (response.status !== 403 && response.status !== 401 && response.status !== 429 && response.status < 400) {
            htmlContent = response.data;
            fetchSuccess = true;
            console.log(`[Crawler] Direct Googlebot UA fetch succeeded (${response.status})`);
          } else {
            console.warn(`[Crawler] Direct Googlebot UA fetch returned blocking status ${response.status}`);
            lastErrorMessage = `Status ${response.status}`;
          }
        } catch (err: any) {
          console.warn(`[Crawler] Direct Googlebot UA fetch failed: ${err.message}`);
          lastErrorMessage = err.message;
        }
      }

      // ATTEMPT 2.5: Bingbot UA spoof direct (very effective fallback as Bingbot is widely whitelisted)
      if (!fetchSuccess) {
        console.log(`[Crawler] Attempt 2.5: Direct Bingbot UA spoof fetch for ${url}`);
        try {
          const bingbotHeaders = {
            ...chromeHeaders,
            "User-Agent": "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)",
          };
          const response = await axios.get(url, {
            headers: bingbotHeaders,
            timeout: 4000,
            validateStatus: (status) => status < 500,
          });

          lastResponseStatus = response.status;
          if (response.status !== 403 && response.status !== 401 && response.status !== 429 && response.status < 400) {
            htmlContent = response.data;
            fetchSuccess = true;
            console.log(`[Crawler] Direct Bingbot UA fetch succeeded (${response.status})`);
          } else {
            console.warn(`[Crawler] Direct Bingbot UA fetch returned blocking status ${response.status}`);
            lastErrorMessage = `Status ${response.status}`;
          }
        } catch (err: any) {
          console.warn(`[Crawler] Direct Bingbot UA fetch failed: ${err.message}`);
          lastErrorMessage = err.message;
        }
      }

      // ATTEMPT 3: Google Web Cache
      if (!fetchSuccess) {
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
        console.log(`[Crawler] Attempt 3: Google Web Cache fetch for ${url}`);
        try {
          const response = await axios.get(cacheUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
              "Accept-Encoding": "gzip, deflate"
            },
            timeout: 4000,
            validateStatus: (status) => status < 500,
          });

          lastResponseStatus = response.status;
          if (response.status < 400 && response.data && typeof response.data === 'string' && !response.data.includes("was not found on this server")) {
            htmlContent = response.data;
            fetchSuccess = true;
            console.log(`[Crawler] Google Web Cache fetch succeeded (${response.status})`);
          } else {
            console.warn(`[Crawler] Google Web Cache fetch returned status ${response.status} or was not indexed`);
            lastErrorMessage = `WebCache Status ${response.status}`;
          }
        } catch (err: any) {
          console.warn(`[Crawler] Google Web Cache fetch failed: ${err.message}`);
          lastErrorMessage = err.message;
        }
      }

      // ATTEMPT 4: Google Web Cache (Protocol-stripped)
      if (!fetchSuccess) {
        const cleanUrl = url.replace(/^https?:\/\//, "");
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(cleanUrl)}`;
        console.log(`[Crawler] Attempt 4: Google Web Cache (protocol-stripped) fetch for ${cleanUrl}`);
        try {
          const response = await axios.get(cacheUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
              "Accept-Encoding": "gzip, deflate"
            },
            timeout: 4000,
            validateStatus: (status) => status < 500,
          });

          lastResponseStatus = response.status;
          if (response.status < 400 && response.data && typeof response.data === 'string' && !response.data.includes("was not found on this server")) {
            htmlContent = response.data;
            fetchSuccess = true;
            console.log(`[Crawler] Google Web Cache (protocol-stripped) fetch succeeded (${response.status})`);
          } else {
            console.warn(`[Crawler] Google Web Cache (protocol-stripped) fetch returned status ${response.status} or was not indexed`);
            lastErrorMessage = `WebCache (protocol-stripped) Status ${response.status}`;
          }
        } catch (err: any) {
          console.warn(`[Crawler] Google Web Cache (protocol-stripped) fetch failed: ${err.message}`);
          lastErrorMessage = err.message;
        }
      }

      // If all attempts failed, throw specific error structures
      if (!fetchSuccess) {
        if (lastResponseStatus === 429 || lastErrorMessage.includes("429")) {
          throw new Error("Rate Limit Exceeded (Status 429). The target server returned too many requests. Architect's Tip: Use the 'Manual Diagnostic' tab to paste the HTML source directly, or wait a few minutes before crawling again.");
        } else if (lastResponseStatus === 403 || lastResponseStatus === 401 || lastErrorMessage.includes("403") || lastErrorMessage.includes("401")) {
          throw new Error("Access Denied (Status 403). This site is protected by anti-bot measures. Architect's Tip: Use the 'Manual Diagnostic' tab and paste the HTML source directly. To get the entire rendered HTML, open Dev Tools > Console, type exactly: copy(document.documentElement.outerHTML); and hit enter, then paste the result.");
        } else if (lastResponseStatus === 404 || lastErrorMessage.includes("404")) {
          throw new Error("Page Not Found (Status 404). Please verify that the URL is correct and accessible.");
        } else {
          throw new Error(`Failed to crawl site (${lastErrorMessage || `Status ${lastResponseStatus}`}). This can be due to anti-bot protection, temporary network downtime, or invalid URL configuration. Reference: Use 'Manual Diagnostic' to paste HTML directly.`);
        }
      }

      const $ = cheerio.load(htmlContent);
      
      // Extract Next.js __NEXT_DATA__ or other application/json metadata state blocks
      const alternativeJsonBlocks: string[] = [];
      $('script[id="__NEXT_DATA__"], script[id="nuxt-state"], script[type="application/json"]').each((_, el) => {
        const id = $(el).attr('id') || '';
        const type = $(el).attr('type') || '';
        const text = $(el).text() || '';
        
        if (text && (id === '__NEXT_DATA__' || text.includes('"props"') || text.includes('metadata') || text.includes('schema') || text.includes('seo') || text.includes('title'))) {
          try {
            const parsed = JSON.parse(text);
            const seoProps: any = {};
            if (parsed.props?.pageProps?.metadata) {
              seoProps.nextMetadata = parsed.props.pageProps.metadata;
            }
            if (parsed.props?.pageProps?.seo) {
              seoProps.nextSeo = parsed.props.pageProps.seo;
            }
            if (parsed.props?.pageProps?.title) {
              seoProps.pageTitle = parsed.props.pageProps.title;
            }
            if (parsed.query) {
              seoProps.query = parsed.query;
            }
            
            if (Object.keys(seoProps).length > 0) {
              alternativeJsonBlocks.push(`[Next.js Hydration Metadata - ${id}]: ` + JSON.stringify(seoProps, null, 2));
            } else if (text.length < 15000) {
              // Try to find any "title", "description", "seo" keys inside the general JSON
              const findKeys = (obj: any): any => {
                const results: any = {};
                const recurse = (val: any, path: string) => {
                  if (typeof val === 'object' && val !== null) {
                    for (const k in val) {
                      if (['seo', 'metadata', 'title', 'description', 'ogTitle', 'ogDescription', 'schema'].includes(k.toLowerCase()) || k.toLowerCase().includes('schema')) {
                        results[path ? `${path}.${k}` : k] = val[k];
                      } else {
                        recurse(val[k], path ? `${path}.${k}` : k);
                      }
                    }
                  }
                };
                recurse(obj, '');
                return results;
              };
              const extractedKeys = findKeys(parsed);
              if (Object.keys(extractedKeys).length > 0) {
                alternativeJsonBlocks.push(`[Next.js Extracted Keys - ${id}]: ` + JSON.stringify(extractedKeys, null, 2));
              } else {
                alternativeJsonBlocks.push(`[Alternative Ingestion Block - ${id || type}]: ` + text.slice(0, 3000));
              }
            }
          } catch {
            if (text.length < 3000) {
              alternativeJsonBlocks.push(`[Alternative Raw Ingestion Block]: ` + text);
            }
          }
        }
      });

      // Extract Open Graph & meta tags
      const metaTags: Record<string, string> = {};
      $('meta').each((_, el) => {
        const name = $(el).attr('name') || $(el).attr('property') || $(el).attr('itemprop') || '';
        const content = $(el).attr('content') || '';
        if (name && content && (
          name.startsWith('og:') || 
          name.startsWith('twitter:') || 
          ['description', 'keywords', 'title', 'canonical', 'author', 'publisher'].includes(name.toLowerCase())
        )) {
          metaTags[name] = content;
        }
      });
      const metaText = Object.keys(metaTags).length > 0 
        ? `\n\n--- Extracted Meta & Open Graph Tags ---\n` + JSON.stringify(metaTags, null, 2)
        : "";
      
      const altJsonText = alternativeJsonBlocks.length > 0
        ? `\n\n--- Extracted Raw/Next State Ingestion Blocks ---\n` + alternativeJsonBlocks.join('\n\n')
        : "";

      // Extract all JSON-LD blocks
      const jsonLdBlocks: string[] = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        const content = $(el).text();
        if (content) jsonLdBlocks.push(content);
      });

      // Extract On-Page FAQ Content & Q&A Accordions BEFORE removing tags
      const faqItems: Array<{ question: string; answer: string }> = [];
      $('details').each((_, el) => {
        const q = $(el).find('summary').text().trim();
        const a = $(el).clone().children('summary').remove().end().text().trim();
        if (q && a && q.length > 5) {
          faqItems.push({ question: q, answer: a.slice(0, 500) });
        }
      });

      if (faqItems.length === 0) {
        $('[class*="faq" i], [id*="faq" i], [class*="accordion" i], [class*="question" i]').each((_, el) => {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text.length > 20 && text.length < 2000 && (text.includes('?') || text.toLowerCase().includes('q:'))) {
            const headings = $(el).find('h2, h3, h4, h5, .question, [class*="title" i]').map((_, h) => $(h).text().trim()).get();
            if (headings.length > 0) {
              headings.forEach((hText) => {
                if (hText.length > 5 && hText.includes('?')) {
                  faqItems.push({ question: hText, answer: text.slice(0, 400) });
                }
              });
            } else if (text.includes('?')) {
              faqItems.push({ question: text.slice(0, 120), answer: text.slice(0, 400) });
            }
          }
        });
      }

      const faqText = faqItems.length > 0 
        ? `\n\n--- CRAWLER FEATURE DETECTED: ON-PAGE FAQS & Q&A ACCORDIONS (${faqItems.length} Detected) ---\n` +
          faqItems.slice(0, 10).map((f, i) => `Q${i+1}: ${f.question}\nA${i+1}: ${f.answer}`).join('\n\n')
        : "";

      // Extract Interactive Calculator / Web Application Tools BEFORE removing forms/inputs
      const calcItems: string[] = [];
      $('[class*="calc" i], [id*="calc" i], [class*="tool" i], [id*="tool" i], form, [class*="widget" i]').each((_, el) => {
        const className = $(el).attr('class') || '';
        const id = $(el).attr('id') || '';
        const text = $(el).text().replace(/\s+/g, ' ').trim();

        if (
          className.toLowerCase().includes('calc') || 
          id.toLowerCase().includes('calc') ||
          text.toLowerCase().includes('calculator') ||
          text.toLowerCase().includes('monthly payment') ||
          text.toLowerCase().includes('rate calculator') ||
          text.toLowerCase().includes('estimate cost')
        ) {
          const inputs = $(el).find('input, select, button').map((_, input) => {
            return `${$(input).attr('name') || $(input).attr('id') || 'input'} (${$(input).attr('type') || $(input).attr('placeholder') || 'input'})`;
          }).get();

          calcItems.push(`[Calculator Tool Detected - ID: "${id}" Class: "${className}"]: Title/Text: "${text.slice(0, 200)}" | Inputs: ${inputs.slice(0, 8).join(', ') || 'Interactive Controls'}`);
        }
      });

      const calcText = calcItems.length > 0
        ? `\n\n--- CRAWLER FEATURE DETECTED: INTERACTIVE CALCULATOR / WEB APPLICATION WIDGET (${calcItems.length} Detected) ---\n` +
          calcItems.slice(0, 5).join('\n')
        : "";

      // Microdata Detection (Common Blind Spot)
      const hasMicrodata = $('[itemscope], [itemtype], [itemprop]').length > 0;
      const microdataNote = hasMicrodata ? "\n\n[SYSTEM NOTE: Microdata (itemprop/itemscope) detected in HTML. JSON-LD is missing or preferred.]" : "";

      // Extract main text for context
      // Remove scripts, styles, and empty elements
      $('script, style, nav, footer, header').remove();
      const cleanText = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 10000); // Limit to 10k chars for target diagnostic

      res.json({
        url,
        jsonLd: jsonLdBlocks.join('\n\n') + (altJsonText ? `\n\n[SYSTEM NOTE: Found alternative JS/Metadata hydration ingestion blocks. Ingestion format detected: ${alternativeJsonBlocks.length} blocks found.]\n${altJsonText}` : ""),
        textContent: cleanText + microdataNote + metaText + faqText + calcText,
        fullContent: jsonLdBlocks.map((b, i) => `--- Block ${i+1} ---\n${b}`).join('\n') + microdataNote + altJsonText + metaText + faqText + calcText + `\n\n--- Content ---\n${cleanText}`
      });
    } catch (error: any) {
      console.error(`Extraction failed for ${url}:`, error.message);
      let statusCode = 500;
      let errorTitle = "Failed to extract content";

      if (error.message.includes("Rate Limit Exceeded (Status 429)")) {
        statusCode = 429;
        errorTitle = "Rate Limit Exceeded (Status 429)";
      } else if (error.message.includes("Access Denied (Status 403)")) {
        statusCode = 403;
        errorTitle = "Access Denied (Status 403)";
      } else if (error.message.includes("Page Not Found (Status 404)")) {
        statusCode = 404;
        errorTitle = "Page Not Found (Status 404)";
      }

      res.status(statusCode).json({ 
        error: errorTitle, 
        details: error.message 
      });
    }
  });

  // PDF Extraction API for Document Context
  app.post("/api/extract-pdf", async (req, res) => {
    const { pdfBase64, filename } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    try {
      const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      
      const data = await pdfParse(buffer);
      console.log(`[PDF Extractor] Successfully parsed ${filename || "document.pdf"} - Pages: ${data.numpages}, Chars: ${data.text?.length || 0}`);

      return res.json({
        success: true,
        text: (data.text || "").trim(),
        numPages: data.numpages || 1,
        info: data.info || {},
        filename: filename || "document.pdf"
      });
    } catch (error: any) {
      console.error("[PDF Extractor] Error parsing PDF:", error.message);
      return res.status(500).json({ 
        error: "Failed to extract text from PDF document", 
        details: error.message 
      });
    }
  });

  // Helper to execute Gemini with automatic retries on transient errors (e.g. 503 UNAVAILABLE / high demand)
  async function callGeminiWithRetry(ai: any, params: any, retries = 3, initialDelayMs = 1500): Promise<any> {
    const modelsToTry = Array.from(new Set([
      params.model,
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-pro",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.1-pro-preview",
      "gemini-2.0-flash",
      "gemini-1.5-flash"
    ])).filter(Boolean);

    let lastErr;
    
    for (const modelName of modelsToTry) {
      if (!modelName) continue;
      
      let delay = initialDelayMs;
      const currentParams = { ...params, model: modelName };
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          return await ai.models.generateContent(currentParams);
        } catch (err: any) {
          lastErr = err;
          const errMsg = String(err.message || "");
          const errStatus = err.status || "";
          const errCode = err.code || "";
          const errStr = JSON.stringify(err);

          // Check for hard quota limit or resource exhaustion (e.g., quota exceeded / limit: 0)
          const isHardQuotaError = 
            errMsg.toLowerCase().includes("quota") || 
            errMsg.toLowerCase().includes("limit: 0") || 
            errStr.toLowerCase().includes("quota") ||
            errStr.toLowerCase().includes("limit: 0") ||
            errStr.includes("RESOURCE_EXHAUSTED") ||
            errStatus === "RESOURCE_EXHAUSTED";

          if (isHardQuotaError) {
            console.warn(`[Gemini API] Hard quota/resource limit reached for model ${modelName}: ${errMsg || errStr}. Skipping to next model...`);
            break; // Break inner loop immediately to try next model
          }

          const isTransient = 
            errMsg.includes("503") || 
            errMsg.includes("UNAVAILABLE") || 
            errMsg.includes("temporary") || 
            errMsg.includes("high demand") || 
            errMsg.includes("spikes in demand") ||
            errMsg.includes("overloaded") ||
            errStatus === "UNAVAILABLE" ||
            errCode === 503 ||
            errCode === 429 ||
            errMsg.includes("429") ||
            errStr.includes("503") ||
            errStr.includes("429") ||
            errStr.includes("UNAVAILABLE");

          if (isTransient && attempt < retries) {
            console.warn(`[Gemini API] Transient error (model: ${modelName}, attempt ${attempt}/${retries}): ${errMsg || errStr}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
          } else if (isTransient && attempt === retries) {
             console.warn(`[Gemini API] Model ${modelName} failed after ${retries} attempts due to high demand. Trying next model...`);
             break; // Break inner loop, try next model in the list
          } else {
            // Check if model is unsupported (e.g. 404 or 400), if so, skip to next model
            if (errMsg.includes("404") || errMsg.includes("not found") || errMsg.includes("400") || errMsg.includes("unsupported")) {
              console.warn(`[Gemini API] Model ${modelName} failed with ${errMsg}. Trying next model...`);
              break;
            }
            throw err; // Other non-transient error, throw immediately
          }
        }
      }
    }
    throw lastErr;
  }

  // Audit API endpoint
  app.post("/api/audit", async (req, res) => {
    let { htmlSnippet, contextContent, codeContent, url, typeOverride, gscIssues, selectedModel, optimizationMode, pdfBase64, pdfFileName } = req.body;

    // If PDF is supplied directly to audit and contextContent is empty, extract text
    if (pdfBase64 && !contextContent) {
      try {
        const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const data = await pdfParse(buffer);
        contextContent = `--- EXTRACTED PDF DOCUMENT CONTEXT (${pdfFileName || 'Uploaded Document.pdf'}, ${data.numpages || 1} Pages) ---\n${(data.text || '').trim()}`;
        console.log(`[Audit API] Extracted ${(data.text || '').length} characters from ${pdfFileName || 'document.pdf'}`);
      } catch (err: any) {
        console.warn(`[Audit API] Failed to parse PDF base64: ${err.message}`);
      }
    }

    if (!htmlSnippet && !contextContent && !codeContent) {
      return res.status(400).json({ error: "Either htmlSnippet, or both contextContent and codeContent are required" });
    }

    try {
      console.log(`Auditing schema for URL: ${url || "snippet"} using model: ${selectedModel || "gemini-3.5-flash"} in ${optimizationMode || "accuracy"} mode`);
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "" || apiKey === "undefined") {
        throw new Error("GEMINI_API_KEY environment variable is missing, undefined, or set to a placeholder on the server. Please open the Settings panel (gear icon) -> Secrets in the top right of the Google AI Studio UI, make sure your GEMINI_API_KEY is defined with a valid active Google Gemini API Key, then save changes.");
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });

      // Pre-constructed prompts for SEO Architect to avoid any nested template literal parser issues
      const typeOverrideDirective = typeOverride
        ? (optimizationMode === "speed"
            ? `CRITICAL: Perfect this schema specifically as a "${typeOverride}" type. Transmute it cleanly.`
            : `CRITICAL INSTRUCTION: The user has requested to PERFECT this schema specifically as a "${typeOverride}" type. Even if the current schema is a different type (like Product), you MUST transform and perfect it into a valid, high-quality "${typeOverride}" schema block.`)
        : "";

      const primaryEntityDirective = typeOverride
        ? `(User requested: ${typeOverride})`
        : "(e.g., Product, Article, LocalBusiness)";

      const verificationDirective = typeOverride
        ? `(targeting ${typeOverride})`
        : "";

      const perfectedTypeDirective = typeOverride
        ? `transformed into a ${typeOverride} type`
        : "";

      const gscIssuesDirective = gscIssues
        ? (optimizationMode === "speed"
            ? `Resolve these GSC errors/warnings in perfectedSchema and gscAnalysis: "${gscIssues}"`
            : `
    GOOGLE SEARCH CONSOLE / RICH RESULTS TEST CROSS-CHECK MAPPING:
    The user is cross-referencing this page against the following actual Google Search Console errors or warnings:
    "${gscIssues}"
    
    You MUST analyze these specific Search Console issues against the provided JSON-LD and HTML text. Under your Chain of Verification (CoVe):
    1. Pinpoint the exact parameter, missing object, format typo, or nested node violating GSC criteria causing this error/warning.
    2. Write focused cards of type "error" or "opportunity" pointing directly to the GSC issue.
    3. Ensure the 'perfectedSchema' fully resolves this Google Search Console error or warning.
    4. Populate the 'gscAnalysis' array in the JSON response identifying the problem, severity, underlying explanation, and how it is resolved.
    `)
        : "";

      let contextSchemaSection = "";
      if (optimizationMode === "speed") {
        if (contextContent || codeContent) {
          contextSchemaSection = `
    PAGE CONTEXT:
    --- START PAGE CONTEXT ---
    ${contextContent || ""}
    --- END PAGE CONTEXT ---

    PRESENT SCHEMA:
    --- START PRESENT SCHEMA ---
    ${codeContent || ""}
    --- END PRESENT SCHEMA ---
    `;
        } else {
          contextSchemaSection = `
    HTML Snippet / Source Markup:
    ${htmlSnippet || ""}
    `;
        }
      } else {
        if (contextContent || codeContent) {
          contextSchemaSection = `
    PAGE CONTEXT (Rendered Text Content / Visible Copy of the Body Page):
    --- START PAGE CONTEXT ---
    ${contextContent || "(No context content provided)"}
    --- END PAGE CONTEXT ---

    PRESENT SCHEMA CODE (JSON-LD script blocks present on the page):
    --- START PRESENT SCHEMA ---
    ${codeContent || "(No schema blocks provided)"}
    --- END PRESENT SCHEMA ---
    `;
        } else {
          contextSchemaSection = `
    HTML Snippet / Source Markup containing JSON-LD:
    ${htmlSnippet || ""}
    `;
        }
      }

      let prompt = "";
      
      if (optimizationMode === "speed") {
        prompt = `
    You are an expert Senior SEO Architect. Perform a FAST, latency-optimized schema audit of the page content from ${url || "a code snippet"}.
    
    --- FAST AUDIT MODE ENFORCED (LATENCY OPTIMIZED) ---
    - Write extremely concise, short 1-sentence descriptions and fixes in 'auditCards'.
    - Write brief 1-sentence summaries for 'eli5Summary' and 'executiveTldr'.
    - Skip any long logs in 'verificationLog' (simply write: "Skipped in Fast Audit mode").
    - Prioritize raw response speed. Avoid wordiness.
    - Keep the generated 'perfectedSchema' 100% accurate, complete, and production-ready.
    --------------------------------------------------
    
    ${typeOverrideDirective}

    ${gscIssuesDirective}

    ${contextSchemaSection}

    CORE DIRECTIVES:
    1. Schema Connection: Link entities using robust '@id' anchors (e.g. #webpage, #organization).
    2. Flat Graph Reference: Use '@graph' with '@context': "https://schema.org" declared EXACTLY ONCE at the root. Do NOT nest @context or @graph inside any node.
    3. Unique ID Fragmenting: Differentiate WebPage and Organization using fragments (/#webpage vs /#organization).
    4. Content Parity: Facts in perfectedSchema must be present in the visible page copy.
    5. Zero Hallucination: Do NOT recommend or include FAQPage if no FAQ is visibly present. Only recommend Review/Course if explicit data is found.
    6. SoftwareApplication: Include Play Store and Apple Store downloadUrls in 'downloadUrl' array.
    7. Article/BlogPosting Trust: Recommend 'reviewedBy' / 'editor' if missing for E-E-A-T.

    Tasks:
    1. Calculate Health Score (0-100).
    2. Identify syntax errors and missing required/recommended fields.
    3. Generate "Perfected" JSON-LD.
    4. Recommend additional schemas strictly based on actual content (Zero Hallucination).
    5. Provide ELI5 and Executive TLDR.
    6. Emulate Google Rich Results Test (status: "eligible", "warnings", "invalid").

    Return the result in strict JSON format. Keep it concise.
    `;
      } else {
        const speedDirectives = `
    --- DEEP AUDIT MODE ENFORCED (ACCURACY & DETAIL OPTIMIZED) ---
    - Fully implement the "### Schema Blueprint" inside 'verificationLog' listing all Types, URLs, and properties before writing JSON-LD.
    - Write complete, thorough diagnostic cards with extensive explanations in 'auditCards'.
    - Write detailed and authoritative 'eli5Summary' and 'executiveTldr'.
    --------------------------------------------------------------
    `;

        prompt = `
    You are a Senior SEO Architect and Security Auditor. Audit the following JSON-LD schema against the page context provided from ${url || "a code snippet"}.
    
    ${speedDirectives}
    
    ${typeOverrideDirective}

    ${gscIssuesDirective}

    ${contextSchemaSection}
    
    SPECIAL HANDLING & THEORETICAL FRAMEWORK:
    - Incorporate "The Three Lives of Schema Markup" Framework back-of-mind during audit:
      1. Life 1 (Google Index Pipeline / Entity Infrastructure): Schema establishes formal identity. You must ensure nodes are interconnected using robust '@id' anchors (e.g. #webpage, #organization, #article, #service) rather than isolated blocks, using 'sameAs' to link to authoritative external entities (e.g. Wikipedia/Wikidata).
      2. Life 2 (LLM Pretraining / Indirect): To survive next-generation LLM training runs, sameAs Wikidata links serve as downstream KG injection channels. Ensure identity anchors are stable and correct.
      3. Life 3 (LLM Runtime Retrieval / Visible Parity): LLMs in retrieval-augmented generation mode (RAG) strip script blocks and read visible textual content. Therefore, you MUST enforce a Content Parity Rule: every crucial fact (addresses, support text, rates, FAQs, pricing) listed in schema MUST ALSO be present in the visible page HTML context. Recommend visible content improvements for LLM retrieval.
    - ELITE SCHEMA GROUNDING & VALIDATION CRITERIA (Lead Knowledge Architect Mandate):
      1. Type Strictness vs. Rich Snippet Feasibility: Parse inputs through a dual lens—Type Strictness (Schema.org inheritance definitions) vs. Rich Snippet Feasibility (Google Rich Results and SchemaMantra implementation guidelines).
      2. Flat Graph Reference: Maintain a flat-graph reference. When generating perfected JSON-LD, favor '@graph' mappings that link disparate entities (WebSite, WebPage, Organization, LocalBusiness) through structural, canonical '@id' anchors.
      3. Reject Hypothetical Keys: Reject placeholder or hypothetical keys. If a property is not defined under the targeted Schema.org class scope, search parent classes or recommend modeling it as an additional type or nested object.
      4. Strict Type Conversions: Enforce strict type conversions (e.g. ISO 8601 for Datetime schemas, standard decimals for Prices, standard country codes for Places).
      5. Pragmatism Over Purity: Prioritize practical, markup-friendly usability for webmasters over rigid ontological elegance. If a simpler relationship achieves the target Rich Result without breaking syntax, favor the simpler approach.
      6. Cardinality & SHACL-Style Validation: Conceptually validate the data shape. Verify if a property expects a single entity or an array of values, ensure required nested objects (like 'aggregateRating' or 'offers') are fully populated, and validate that arrays do not impose false ordering unless '@list' is explicitly used.
      7. Pending vs. Core Vocabulary: Explicitly distinguish between canonical Schema.org entities and terms currently in the 'Pending' schema. If relying on an external namespace (e.g. GS1, Wikidata), document the namespace inclusion.
      8. Cross-Domain Blending: Recognize that Schema.org is an open system. When auditing complex entities (e.g. a LocalBusiness that is also an Airport and a Service provider), seamlessly blend relevant properties from multiple parent/sibling classes using multi-typing (e.g. '"@type": ["LocalBusiness", "Service"]') when appropriate.
      9. Mandatory Pre-Flight Verification & Blueprinting: Before generating any perfected JSON-LD, you MUST output a "### Schema Blueprint" inside the "verificationLog" field of your output. In this section, list every @type you intend to use alongside its direct Schema.org URL (e.g., [https://schema.org/LocalBusiness](https://schema.org/LocalBusiness)). For every property you intend to assign, verify in one sentence that it is a valid, recognized property for that specific @type or its parent class.
      10. Mandatory File Grounding: Treat standard ontological rules (like schema.ttl) as your absolute source of truth. Before suggesting any property for a @type, confirm that the property is legally permitted for that class or its parent classes. Treat standard examples (like examples.txt) as your coding style guide. When generating JSON-LD, follow the closest matching @type example and mimic its structural formatting, nesting, and syntax.
    - If you see a [SYSTEM NOTE] about Microdata being detected, acknowledge it in your audit. Explain that while the page has legacy Microdata (itemprop/itemscope), Google strongly recommends transitioning to JSON-LD for better maintainability and rich result support.
    - If JSON-LD is missing but Microdata was detected, your "Perfected Schema" should be a fresh JSON-LD implementation of that data.
    1. **Internal Chain of Thought (CoT)**: Analyze the page content to identify the primary entity ${primaryEntityDirective}.
    2. **Chain of Verification (CoVe)**: Verify if the existing schema blocks correctly represent the identified entity ${verificationDirective} and check for missing required/recommended properties according to Google's Rich Result guidelines.
    3. **Chain of Debate (CoD)**: Act as both an auditor and a growth strategist. Debate whether additional schema types (e.g., BreadcrumbList, VideoObject) would enhance search visibility based strictly on the page's actual visible content. Do NOT recommend schema for content that is not visibly present (e.g. do not recommend FAQ if there are no FAQs on the page).
    
    Tasks:
    1. Identify all existing JSON-LD blocks.
    2. Perform a Gap Analysis against Google's Rich Result requirements.
    3. Calculate a Health Score (0-100).
    4. Identify syntax errors and missing required/recommended fields.
    5. Generate a "Perfected" version of the EXISTING JSON-LD ${perfectedTypeDirective}.
       CRITICAL: The perfected version MUST be a synthesis of the provided schema AND the page content. If the page ACTUALLY contains a Video, FAQ, or Service (visibly present in the HTML snippet) that is missing from the provided JSON-LD, you MUST include it in the perfected output to ensure total coverage. Never add these if the content is not actually present.
       Follow these JSON-LD Structural Rules for the Perfected Schema:
        - Single Root & Flat Graph: Your output MUST follow a single-node root structure using @graph. Declare @context: "https://schema.org" exactly ONCE at the extreme root. NEVER nest @context or @graph within individual entities inside the graph array. Flatten all entities into the top-level @graph array to avoid technical redundancy. 
        - ABSOLUTE PROHIBITION: Do NOT include "@context": "https://schema.org" inside any object inside the @graph array. This is the most common cause of duplicate errors.
        - The Anchor Node: Every graph must contain a WebPage node. Use it to 'host' the BreadcrumbList and link to the primary content via mainEntity.
        - Relational Linking: Use unique @id anchors (e.g., #webpage, #organization, #article, #service) to connect entities. 
        - Unique Identity (ID Fragmenting): To avoid "Identity Crisis" (ID collisions), every entity in the @graph MUST have a unique @id. Use URL fragments (e.g., /#webpage vs /#organization) to differentiate the Page entity from the Publisher entity. 
        - URL Precision: Ensure the "url" property for the WebPage reflects the COMPLETE and specific URL of the page provided, not just the root domain. Avoid "glue typos" (e.g., missing forward slashes) when constructing paths for image URLs or content IDs.
        - Avoid Silos: If a page contains a Video, FAQ, or Service, explicitly link them to the WebPage node via "mainEntity", "about", or "subjectOf" properties.
        - Entity Consolidation: Define the Organization (or primary brand) once. All other nodes must reference its @id rather than re-defining its name/logo.
        - Relational Integrity: Ensure properties match their valid Schema.org target types. CRITICAL: A WebPage must link to its brand/owner using "publisher" or "author" (Organization/Person). NEVER use "isPartOf" to link a WebPage to an Organization, as isPartOf expects a CreativeWork. 
        - De-duplication: NEVER generate multiple top-level nodes of the same type (e.g., two FAQPages). If the page contains multiple instances of the same schema type, consolidate them into a single entity (e.g., merge all Questions into one FAQPage node's "mainEntity" array) to avoid duplication errors in validators.
        - Schema Completeness: Your output must be production-ready. Ensure ALL essential and recommended attributes are included for every type (e.g., for VideoObject, you MUST include thumbnailUrl, uploadDate, and duration). No "bare-bones" nodes.
        - Video Requirement: Every VideoObject must include either a contentUrl (direct file link) or an embedUrl (player link). Without one of these, the video will not be eligible for Google Rich Results. Ensure URLs are fully qualified with proper slashes.
        - Review Quality Gate: Only recommend or include Review, ReviewObject, or AggregateRating if the page contains explicit, individual testimonials with numeric ratings or verified review text. Avoid recommending these types based on general "customer stories" or marketing copy (e.g., "hear from our customers") that lack structured rating data.
        - Course Accuracy Gate: Only recommend or include a Course schema type if the page represents a formal educational program with structured learning outcomes, a syllabus, or enrollment options. Do NOT misidentify marketing programs, general information series (e.g., "what-is"), or sequential blog/video articles as Courses unless they are explicitly presented as structured educational curriculum.
        - Homepage ListItem Quality Gate: NEVER recommend or include 'ItemList' or 'ListItem' structures for home pages or basic featured product grids (such as a grocery or liquor store's home page grid). Standard corporate identity ('OnlineStore' / 'Organization') and search behaviors ('WebSite' with google 'potentialAction' / 'SearchAction') are the only structures of value on home pages. Product lists are only for dedicated categories/search result inventory pages.
        - SoftwareApplication Rule: Whenever a SoftwareApplication schema is recommended, perfected, or generated, you MUST include the official Play Store and Apple App Store download URLs with proper properties. Ensure the 'downloadUrl' property contains a JSON array containing these two URLs:
          1. Apple App Store: "https://apps.apple.com/us/app/the-parking-spot/id499596395"
          2. Google Play Store: "https://play.google.com/store/apps/details?id=com.theparkingspot"
          Also include an 'operatingSystem' property with "iOS, Android" to clearly map availability.
        - Brand & Parent Organization Integration: For child brands under larger groups (e.g., Liquorland under Coles Group, Coles Supermarkets under Coles Group), always establish a robust 'parentOrganization' block referencing the parent entity (e.g., group name "Coles Group", parent URL "https://www.colesgroup.com.au/home/", and id "https://www.colesgroup.com.au/home/#organization").
        - Liquorland Brand Precision: If analyzing or perfecting schemas for Liquorland (or associated pages):
          1. Include their verified X/Twitter profile ('https://x.com/Liquorland'), Facebook ('https://www.facebook.com/liquorland/'), and Instagram ('https://www.instagram.com/liquorlandau/') inside the 'sameAs' array.
          2. Structure the 'contactPoint' list strictly incorporating:
             - A single merged contactPoint for "Customer Service & Online Shopping Support" with telephone "1300300640", areaServed "AU", availableLanguage "en", and 'hoursAvailable' structured strictly as a JSON array holding three distinct 'OpeningHoursSpecification' objects for Monday-Friday (opens 08:30, closes 21:00), Saturday (opens 09:00, closes 21:00), and Sunday (opens 10:00, closes 20:00).
             - A second contactPoint for "Live Chat Support" with contactType "Live Chat Support", url "https://www.liquorland.com.au/", description "Live Chat available in the bottom left corner of the screen.", and availableLanguage "en" (omitting telephone as it is digital).
          3. Include the corporate 'address' of type 'PostalAddress' with postOfficeBoxNumber "PO Box 480", addressLocality "Glen Iris", addressRegion "VIC", postalCode "3146", and addressCountry "AU".
          4. Connect 'parentOrganization' pointing to Coles Group: Group Name "Coles Group", url "https://www.colesgroup.com.au/home/", and id "https://www.colesgroup.com.au/home/#organization".
          5. Embellish 'hasMerchantReturnPolicy' ('MerchantReturnPolicy' type):
             - returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnPeriod"
             - merchantReturnDays: 30
             - returnMethod: "https://schema.org/ReturnInStore"
             - refundType: "https://schema.org/FullRefund"
             - description: "Change of mind food, drinks, and general items are not eligible for refund or exchange once they have left the premises. Faulty or damaged goods are eligible for full refund or exchange."
        - Zero Hallucination Mandate (STRICT): NEVER invent content that is not present on the HTML snippet. This is especially CRITICAL for FAQPage: If the page does not have an explicit FAQ section, you MUST NOT recommend FAQ schema, you MUST NOT mention FAQs in your analysis, and you MUST NOT synthesize "common questions" out of thin air. Only include or suggest FAQPage if the exact questions and answers are visibly present in the HTML snippet.
        - On-Page FAQ Detection: If the extracted page text contains visible FAQs, accordions, or 'CRAWLER FEATURE DETECTED: ON-PAGE FAQS', you MUST recommend an 'FAQPage' schema in 'additionalRecommendedSchema' (and include it in 'perfectedSchema' linked to the WebPage node) using the exact on-page Q&A text.
        - Calculator & Web Application Tool Detection: If the extracted page text contains an interactive calculator, payment estimator, or financial tool (or 'CRAWLER FEATURE DETECTED: INTERACTIVE CALCULATOR'), you MUST recommend a 'WebApplication' or 'SoftwareApplication' (or 'FinancialProduct' if financial) schema with 'applicationCategory': 'BusinessApplication' / 'FinanceApplication' and detail it in audit cards.
        - Provider Warning Categorization Precision: Do NOT output 'Provider' as a top-level Google Rich Results category unless evaluating an explicit top-level Organization or Person provider node. When a property like 'provider' or 'publisher' is missing from an Offer, Service, Course, or Event, attribute the warning strictly to that parent category (e.g., 'Service' or 'Course'), NOT to 'Provider' or 'Organization'. NEVER duplicate the identical warning across multiple categories.
        - Article/BlogPosting Trust Signals: For Article or BlogPosting schemas, if the schema is missing 'reviewedBy' or 'editor' properties, you MUST recommend adding them to build E-E-A-T (Experience, Expertise, Authoritativeness, and Trustworthiness), and include them in the perfected schema with placeholder values or data extracted from the page.
        - Property Name Precision: Use EXACT Schema.org property names. For example, for CreativeWorkSeason, the correct property is "seasonNumber", NOT "number". For CreativeWorkSeries, use "hasPart". Always verify against the latest Schema.org vocabulary.
        - Strategic Extrapolation: If a property is required for validation but missing from the raw schema (e.g., uploadDate for a Video), try to find it in the provided page text. Only if a REQUIRED METADATA field is missing should you synthesize a high-quality placeholder (e.g., a relevant date) and mark it for user updates. NEVER extrapolate actual content (text, FAQs, testimonials).
    6. **NEW**: Identify and recommend ADDITIONAL schema types that SHOULD be on the page based on the content analysis. Remember the Zero Hallucination Mandate: do not recommend types like FAQPage or Review if the page lacks that actual content.
    7. Provide an ELI5 Summary and an Executive TLDR.
    8. **Google Rich Results Test Emulator**: Inspect the source code and JSON-LD schema blocks, then map every detected structured data format exactly as the official Google Rich Results Test (https://search.google.com/test/rich-results) does:
       - RECURSIVE SCANNING MANDATE: You MUST perform a deep recursive scan of some properties. Do not just look at top-level @graph items. If an object contains nested schemas (e.g. an "Organization" containing any "hasMerchantReturnPolicy" of type "MerchantReturnPolicy", or a "Product" containing "offers" or "reviews"), you MUST crawl these nested elements, extract them as separate, distinct instances under their corresponding schema.org type, and validate them.
       - "MerchantReturnPolicy" -> Specifically recognize "MerchantReturnPolicy" (and any "hasMerchantReturnPolicy" properties) and map them under the Google validation category of "Return policies" (or "MerchantReturnPolicy") with full diagnostics.
       - Enumerate each detected schema format under standard Google and schema.org categories (e.g. "Breadcrumbs" for BreadcrumbList, "Merchant listings" or "Product snippets" for Product, "FAQ" for FAQPage, "Videos" for VideoObject, "Organization" for Organization, "Return policies" for MerchantReturnPolicy, "WebSite" or "Sitelink search box" for WebSite, etc.). Let the user see ALL schema.org types present on their page.
       - Provide the amount of instances found of each category.
       - Compute status: "eligible" (if zero errors and zero warnings are present), "warnings" (if and only if warnings are present, eligible with warnings), or "invalid" (if any critical error is present).
       - List the names of each individual entity (use 'itemName' e.g. "Unnamed item" or its title/name) and its associated precise error messages (such as "Missing field 'price'") and warning messages.
    
    CRITICAL INSTRUCTIONS FOR JSON OUTPUT:
    - The "errorCount" MUST exactly match the number of items in "auditCards" where type is "error".
    - The "opportunityCount" MUST exactly match the number of items in "auditCards" where type is "opportunity".
    - "auditCards" of type "recommendation" should be used for high-level strategic additions.
    - "additionalRecommendedSchema" should contain the actual code snippets for new schema types you suggest adding.
    
    Return the result in strict JSON format.
    `;
      }

      const response = await callGeminiWithRetry(ai, {
        model: selectedModel || "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              healthScore: { type: Type.NUMBER },
              errorCount: { type: Type.NUMBER },
              opportunityCount: { type: Type.NUMBER },
              auditCards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ["error", "success", "opportunity", "recommendation"] },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    fix: { type: Type.STRING },
                  },
                  required: ["type", "title", "description"],
                },
              },
              perfectedSchema: { type: Type.STRING },
              additionalRecommendedSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    reasoning: { type: Type.STRING },
                    exampleSnippet: { type: Type.STRING },
                  },
                  required: ["type", "reasoning", "exampleSnippet"],
                },
              },
              eli5Summary: { type: Type.STRING },
              executiveTldr: { type: Type.STRING },
              verificationLog: { type: Type.STRING },
              gscAnalysis: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    issueDetected: { type: Type.STRING },
                    severity: { type: Type.STRING, enum: ["error", "warning"] },
                    explanation: { type: Type.STRING },
                    resolution: { type: Type.STRING },
                  },
                  required: ["issueDetected", "severity", "explanation", "resolution"],
                },
              },
              detectedStructuredData: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    itemCount: { type: Type.NUMBER },
                    status: { type: Type.STRING, enum: ["eligible", "invalid", "warnings"] },
                    errorsCount: { type: Type.NUMBER },
                    warningsCount: { type: Type.NUMBER },
                    items: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          itemName: { type: Type.STRING },
                          errors: { type: Type.ARRAY, items: { type: Type.STRING } },
                          warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
                        },
                        required: ["itemName", "errors", "warnings"],
                      },
                    },
                  },
                  required: ["name", "itemCount", "status", "errorsCount", "warningsCount", "items"],
                },
              },
            },
            required: [
              "healthScore",
              "errorCount",
              "opportunityCount",
              "auditCards",
              "perfectedSchema",
              "additionalRecommendedSchema",
              "eli5Summary",
              "executiveTldr",
              "detectedStructuredData",
            ],
          },
        },
      });

      const responseText = response.text;
      
      // Resilient parsing logic conforming to architectural guideline #3
      let parsedResult;
      try {
        let cleaned = responseText.trim();
        if (cleaned.startsWith("\x60\x60\x60")) {
          cleaned = cleaned.replace(/^\x60\x60\x60[a-zA-Z]*\s*/, "");
          cleaned = cleaned.replace(/\s*\x60\x60\x60$/, "");
        }
        cleaned = cleaned.trim();
        parsedResult = JSON.parse(cleaned);
      } catch (jsonErr: any) {
        console.error("Direct server JSON.parse failed, trying bracket extractor:", jsonErr.message);
        const startIdx = responseText.indexOf("{");
        const endIdx = responseText.lastIndexOf("}");
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          try {
            parsedResult = JSON.parse(responseText.substring(startIdx, endIdx + 1));
          } catch (sliceErr: any) {
            throw new Error(`Invalid response format from AI logic: ${sliceErr.message}. Raw output: ${responseText.slice(0, 150)}`);
          }
        } else {
          throw new Error(`AI generated invalid response format. Error: ${jsonErr.message}`);
        }
      }

      res.json(parsedResult);
    } catch (error: any) {
      console.error(`Audit logic execution failed:`, error.message);
      let detailsMessage = error.message || "An unexpected error occurred during execution.";
      try {
        const errString = JSON.stringify(error);
        if (
          detailsMessage.includes("API key not valid") ||
          detailsMessage.includes("API_KEY_INVALID") ||
          errString.includes("API key not valid") ||
          errString.includes("API_KEY_INVALID")
        ) {
          detailsMessage = "The Gemini API Key configured in your space is invalid, expired, or deactivated. Please check and configure a correct active 'GEMINI_API_KEY' inside the Settings (gear icon) > Secrets panel at the top-right corner of Google AI Studio and save your changes.";
        } else if (
          detailsMessage.includes("quota") ||
          detailsMessage.includes("Quota exceeded") ||
          detailsMessage.includes("RESOURCE_EXHAUSTED") ||
          detailsMessage.includes("429") ||
          errString.includes("quota") ||
          errString.includes("Quota exceeded") ||
          errString.includes("RESOURCE_EXHAUSTED") ||
          errString.includes("429")
        ) {
          detailsMessage = "Gemini API Quota Exceeded (Rate Limit). You have exceeded the free-tier requests limit for the Gemini API (e.g., limit of 20 requests per minute). Please wait about 30 to 60 seconds before submitting again, or consider upgrading your Google AI Studio billing plan to increase your request rate limit.";
        } else if (
          detailsMessage.includes("503") ||
          detailsMessage.includes("UNAVAILABLE") ||
          detailsMessage.includes("high demand") ||
          detailsMessage.includes("temporary") ||
          errString.includes("503") ||
          errString.includes("UNAVAILABLE") ||
          errString.includes("high demand") ||
          errString.includes("temporary")
        ) {
          detailsMessage = "The Gemini API is currently experiencing high demand or is temporarily unavailable (503 Service Unavailable). Spikes in demand are usually temporary. Please try again in a few seconds.";
        }
      } catch (jsonErr) {
        // Fallback if Stringify fails on circular objects
        if (typeof error === "object" && error !== null) {
          const str = String(error.message || "");
          if (str.includes("quota") || str.includes("RESOURCE_EXHAUSTED") || str.includes("429")) {
            detailsMessage = "Gemini API Quota Exceeded (Rate Limit). You have exceeded the free-tier requests limit for the Gemini API. Please wait about 30 to 60 seconds before submitting again, or consider upgrading your Google AI Studio billing plan to increase your request rate limit.";
          } else if (str.includes("503") || str.includes("UNAVAILABLE") || str.includes("high demand") || str.includes("temporary")) {
            detailsMessage = "The Gemini API is currently experiencing high demand or is temporarily unavailable (503 Service Unavailable). Spikes in demand are usually temporary. Please try again in a few seconds.";
          }
        }
      }
      res.status(500).json({
        error: "Architectural Audit Logic Failed",
        details: detailsMessage
      });
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
