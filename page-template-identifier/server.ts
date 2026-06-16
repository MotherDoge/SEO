import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { parseStringPromise } from "xml2js";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API endpoint to fetch and parse sitemap
  app.post("/api/fetch-sitemap", async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Normalize URL: Handle common typos like missed 'h' in copy-paste
    let targetUrl = url.trim();
    if (targetUrl.startsWith('ttps://')) {
      targetUrl = 'h' + targetUrl;
    } else if (targetUrl.startsWith('ttp://')) {
      targetUrl = 'h' + targetUrl;
    } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      // If it looks like a domain but missing protocol, default to https
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
    }

    let rawData = "";
    let fetchError: any = null;

    // Header strategies to bypass firewall blocks (e.g. Cloudflare 403 or rate-limiting 429)
    const headerStrategies = [
      // Strategy 1: seoClarity Desktop ClarityBot (Highly trusted SEO crawler - most likely to pass whitelists)
      {
        'User-Agent': 'Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)',
        'Accept': 'text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/'
      },
      // Strategy 2: seoClarity Mobile ClarityBot
      {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9; SM-G960F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.157 Mobile Safari/537.36 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)',
        'Accept': 'text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      // Strategy 3: Googlebot emulation (highly effective since sitemaps are intended for crawlers)
      {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      // Strategy 4: Browser emulation
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'DNT': '1'
      },
      // Strategy 5: Minimal crawler fallback (some sites prefer simple agents)
      {
        'User-Agent': 'Wget/1.21.1',
        'Accept': '*/*'
      }
    ];

    try {
      for (let i = 0; i < headerStrategies.length; i++) {
        try {
          console.log(`Fetching sitemap with strategy ${i + 1}...`);
          const response = await axios.get(targetUrl, {
            headers: headerStrategies[i],
            timeout: 15000, // 15s per try to keep it snapping fast
            maxRedirects: 5,
            responseType: 'text'
          });
          rawData = response.data.trim();
          fetchError = null; // Reset if succeeded
          break; // Strategy succeeded, break loop!
        } catch (err: any) {
          console.error(`Strategy ${i + 1} failed:`, err.message);
          fetchError = err;
          // If 404, the file doesn't exist, so don't puzzle with other strategies
          if (err.response?.status === 404) {
            break;
          }
        }
      }

      if (fetchError && fetchError.response?.status !== 404) {
        console.log("Axios strategies failed. Trying system curl fallback...");
        try {
          const escapedUrl = targetUrl.replace(/'/g, "'\\''");
          const ua = "Mozilla/5.0 (compatible; ClarityBot/9.0; +https://www.seoclarity.net/bot.html)";
          const cmd = `curl -L -s -k -m 20 -A '${ua}' -H 'Accept: text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,image/webp,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' '${escapedUrl}'`;
          
          const { stdout } = await execPromise(cmd, { maxBuffer: 15 * 1024 * 1024 });
          const trimmedResult = stdout.trim();
          
          if (trimmedResult && (trimmedResult.includes('<?xml') || trimmedResult.includes('<urlset') || trimmedResult.includes('<sitemapindex') || trimmedResult.includes('<loc>'))) {
            rawData = trimmedResult;
            fetchError = null; // Reset error as we succeeded!
            console.log("System curl fallback successfully fetched the sitemap!");
          } else if (trimmedResult.toLowerCase().startsWith('<!doctype html') || trimmedResult.toLowerCase().startsWith('<html')) {
            rawData = trimmedResult;
            fetchError = null;
            console.log("System curl fallback returned HTML.");
          } else {
            console.error("Curl returned empty or invalid non-XML data.");
          }
        } catch (curlErr: any) {
          console.error("System curl fallback failed:", curlErr.message);
        }
      }

      if (fetchError) {
        throw fetchError;
      }


      // Check if the response is actually HTML instead of XML
      if (rawData.toLowerCase().startsWith('<!doctype html') || rawData.toLowerCase().startsWith('<html')) {
        return res.status(400).json({ 
          error: "The URL provided returned an HTML page instead of a Sitemap XML. Please ensure you are using the direct link to the .xml file." 
        });
      }

      // Sanitize XML: Fix unescaped ampersands
      const xmlData = rawData.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');

      const result = await parseStringPromise(xmlData);
      
      // Robust recursive extraction to handle various sitemap structures and namespaces
      const extractUrls = (obj: any): string[] => {
        const found: string[] = [];
        const traverse = (current: any) => {
          if (!current || typeof current !== 'object') return;

          // Check for <loc> in the current object
          if (current.loc) {
            const loc = Array.isArray(current.loc) ? current.loc[0] : current.loc;
            const url = typeof loc === 'string' ? loc : (loc && loc._ ? loc._ : null);
            if (url && typeof url === 'string') {
              found.push(url.trim());
            }
          }

          // Recursively check all properties
          for (const key in current) {
            if (Object.prototype.hasOwnProperty.call(current, key)) {
              const val = current[key];
              if (Array.isArray(val)) {
                val.forEach(item => traverse(item));
              } else if (typeof val === 'object') {
                traverse(val);
              }
            }
          }
        };
        traverse(obj);
        return Array.from(new Set(found)); // Deduplicate
      };

      let urls = extractUrls(result);

      // Regex Fallback: If XML parsing failed to find URLs (common with complex namespaces),
      // use a regex to extract content between <loc> tags directly from the raw string.
      if (urls.length === 0) {
        const locRegex = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
        let match;
        while ((match = locRegex.exec(xmlData)) !== null) {
          urls.push(match[1].trim());
        }
        urls = Array.from(new Set(urls));
      }

      // Determine if it's a Sitemap Index or a regular Sitemap
      // We check the root tag or the presence of <sitemap> vs <url>
      const isIndex = xmlData.includes('<sitemapindex') || (result.sitemapindex !== undefined);

      res.json({ 
        type: isIndex ? 'index' : 'urlset',
        urls 
      });
    } catch (error: any) {
      console.error("Error fetching sitemap:", error.message);
      const status = error.response?.status;
      
      let message = `Failed to fetch sitemap (${status || 'Error'}). ${error.message}`;
      
      if (status === 403) {
        message = "Access Forbidden (403). The website is blocking the request. This often happens with security firewalls like Cloudflare.";
      } else if (status === 404) {
        message = "Sitemap Not Found (404). Please verify that the URL is correct. Common sitemap locations are /sitemap.xml or /sitemap_index.xml. You can also check the website's robots.txt file for the exact sitemap URL.";
      } else if (error.message.includes("Unsupported protocol")) {
        message = `Unsupported Protocol: ${error.message}. This usually happens if the URL is missing 'https://' or has a typo (like 'ttps://'). I've added automatic fixes for common typos, but please check the URL format.`;
      } else if (error.message.includes("Invalid character") || error.message.includes("Unexpected close tag")) {
        message = `XML Parsing Error: ${error.message}. This usually means the sitemap has malformed XML structure or unescaped characters. I've attempted to auto-fix common issues, but this file requires manual inspection.`;
      }
      
      res.status(status || 500).json({ error: message });
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
