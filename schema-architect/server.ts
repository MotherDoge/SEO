import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
          timeout: 15000,
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
            timeout: 15000,
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
            timeout: 15000,
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
            timeout: 15000,
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
            timeout: 15000,
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
            timeout: 15000,
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
          throw new Error("Access Denied (Status 403). This site is protected by anti-bot measures. Architect's Tip: Use the 'Manual Diagnostic' tab and paste the HTML source directly.");
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
        textContent: cleanText + microdataNote + metaText,
        fullContent: jsonLdBlocks.map((b, i) => `--- Block ${i+1} ---\n${b}`).join('\n') + microdataNote + altJsonText + metaText + `\n\n--- Content ---\n${cleanText}`
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
