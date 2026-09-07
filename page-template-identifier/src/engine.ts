import { GoogleGenAI, Type } from "@google/genai";

// -------------------------------------------------------------
// 1. Types
// -------------------------------------------------------------
export interface UrlCluster {
  pattern: string;
  samples: string[];
  count: number;
  all_urls: string[];
}

export interface TemplateResult {
  template_name: string;
  url_pattern: string;
  recommended_primary_schema: string;
  sample_urls: string[];
  count: number;
  all_matching_urls: string[];
}

export interface AnalysisResponse {
  domain_analyzed: string;
  total_templates_discovered: number;
  templates: TemplateResult[];
  reasoning: string;
  executive_tldr: string;
}

// -------------------------------------------------------------
// 2. Deterministic URL Clustering Engine
// -------------------------------------------------------------
export function clusterRawUrls(rawUrls: string[]): { domainAnalyzed: string; clusters: UrlCluster[] } {
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

  const parsedUrls = rawUrls
    .map((u) => {
      let pathname = "/";
      const trimmed = u.trim();
      try {
        const parsed = new URL(trimmed.startsWith("http") ? trimmed : "https://" + trimmed);
        pathname = parsed.pathname;
      } catch {
        let clean = trimmed.replace(/^(https?:\/\/)?(www\.)?[^\/]+/, "");
        if (!clean.startsWith("/")) clean = "/" + clean;
        pathname = clean.split("?")[0].split("#")[0];
      }

      let normalizedPath = pathname;
      if (normalizedPath !== "/" && normalizedPath.endsWith("/")) {
        normalizedPath = normalizedPath.slice(0, -1);
      }
      if (!normalizedPath.startsWith("/")) {
        normalizedPath = "/" + normalizedPath;
      }
      return { original: trimmed, pathname: normalizedPath };
    })
    .filter((item) => item.original.length > 0);

  const pathSegments = parsedUrls.map((item) => {
    const segments = item.pathname.split("/").filter(Boolean);
    return { ...item, segments };
  });

  const segmentValueCounts: Record<string, Set<string>> = {};
  pathSegments.forEach((item) => {
    item.segments.forEach((seg, idx) => {
      const parentPrefix = item.segments.slice(0, idx).join("/");
      const key = `pos:${idx}_parent:${parentPrefix}`;
      if (!segmentValueCounts[key]) {
        segmentValueCounts[key] = new Set();
      }
      segmentValueCounts[key].add(seg.toLowerCase());
    });
  });

  const staticKeywords = new Set([
    "about", "contact", "blog", "news", "api", "v1", "v2", "search", "category",
    "tag", "shop", "products", "product", "uses", "solutions", "solution",
    "use-case", "use-cases", "resources", "resource", "features", "feature",
    "platform", "teams", "team", "apps", "integration", "integrations",
    "compare", "versus", "vs", "services", "locations", "careers", "privacy",
    "terms", "help", "faq", "home", "index", "feed", "sitemap", "user",
    "login", "register", "cart", "checkout", "facilities", "physician-finder",
    "doctor", "profile", "events", "support", "p", "c"
  ]);

  const usStates = new Set([
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois",
    "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland",
    "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana",
    "nebraska", "nevada", "new-hampshire", "new-jersey", "new-mexico", "new-york",
    "north-carolina", "north-dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
    "rhode-island", "south-carolina", "south-dakota", "tennessee", "texas", "utah",
    "vermont", "virginia", "washington", "west-virginia", "wisconsin", "wyoming",
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il",
    "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt",
    "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri",
    "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy"
  ]);

  const getPattern = (segments: string[]): string => {
    if (segments.length === 0) return "/";
    const patternSegments = segments.map((seg, idx) => {
      const hasNumber = /\d+/.test(seg);
      const parentPrefix = segments.slice(0, idx).join("/");
      const key = `pos:${idx}_parent:${parentPrefix}`;
      const uniqueValuesCount = segmentValueCounts[key]?.size || 0;

      const parentSegmentsLower = segments.slice(0, idx).map((s) => s.toLowerCase());
      const hasDynamicParent = parentSegmentsLower.some(
        (p) =>
          ["p", "c", "product", "products", "resources", "resource", "category", "categories",
           "tag", "tags", "item", "items", "post", "posts", "article", "articles", "blog",
           "brand", "brands", "location", "locations", "store", "stores", "facility",
           "facilities", "city", "cities", "state", "states", "service-area", "service-areas",
           "uses", "solutions", "use-cases", "teams"].includes(p)
      );

      if (hasDynamicParent) return "*";
      if (usStates.has(seg.toLowerCase())) return "*";
      if (/^[a-z\-]+-[a-z]{2}$/i.test(seg) || /^[a-z]{2}-[a-z\-]+$/i.test(seg)) return "*";
      if (hasNumber) return "*";
      if (uniqueValuesCount >= 2 && !staticKeywords.has(seg.toLowerCase())) return "*";
      return seg;
    });

    const collapsed: string[] = [];
    patternSegments.forEach((seg) => {
      if (seg === "*" && collapsed[collapsed.length - 1] === "*") return;
      collapsed.push(seg);
    });
    return "/" + collapsed.join("/");
  };

  const patternGroups: Record<string, { originalUrls: string[] }> = {};
  pathSegments.forEach((item) => {
    const pattern = getPattern(item.segments);
    if (!patternGroups[pattern]) {
      patternGroups[pattern] = { originalUrls: [] };
    }
    patternGroups[pattern].originalUrls.push(item.original);
  });

  let clusters: UrlCluster[] = Object.entries(patternGroups).map(([pattern, data]) => {
    const samples = Array.from(new Set(data.originalUrls)).slice(0, 3);
    return {
      pattern,
      samples,
      count: data.originalUrls.length,
      all_urls: data.originalUrls,
    };
  });

  if (clusters.length > 40) {
    clusters.sort((a, b) => b.count - a.count);
    clusters = clusters.slice(0, 40);
  }

  clusters.sort((a, b) => {
    if (a.pattern === "/") return -1;
    if (b.pattern === "/") return 1;
    const segmentsA = a.pattern.split("/").filter(Boolean).length;
    const segmentsB = b.pattern.split("/").filter(Boolean).length;
    if (segmentsA !== segmentsB) return segmentsA - segmentsB;
    return b.count - a.count;
  });

  return { domainAnalyzed, clusters };
}

// -------------------------------------------------------------
// 3. Deterministic Schema & Template Name Rule Matcher
// -------------------------------------------------------------
export function getDeterministicSchemaAndName(
  pattern: string,
  domain: string,
  sampleUrls: string[] = []
): { template_name: string; recommended_primary_schema: string } {
  const lowercasePattern = pattern.toLowerCase();
  const cleanPattern = lowercasePattern.replace(/[\/*]/g, "").trim();
  const isMedical = /health|hospital|medical|clinic|doctor|physician/i.test(domain);

  const hasUtilityUrl = sampleUrls.some((url) => {
    const u = url.toLowerCase();
    return ["/cart", "/checkout", "/login", "/signin", "/signup", "/register", "/account", "/admin"].some((k) => u.includes(k));
  });

  const isUtility =
    ["/cart", "/checkout", "/login", "/signin", "/signup", "/register", "/account", "/admin"].some(
      (k) => lowercasePattern === k || lowercasePattern.startsWith(`${k}/`) || lowercasePattern.includes(`${k}/*`)
    ) || hasUtilityUrl;

  if (isUtility) {
    return { template_name: "Utility / Transactional Page", recommended_primary_schema: "None" };
  }

  if (cleanPattern === "" || lowercasePattern === "/") {
    return { template_name: "Homepage / Brand Root", recommended_primary_schema: isMedical ? "MedicalOrganization" : "WebSite" };
  }

  if (lowercasePattern.includes("product") || lowercasePattern.startsWith("/p/") || lowercasePattern.includes("/shop/")) {
    return { template_name: "Product Detail Page", recommended_primary_schema: "Product" };
  }

  if (lowercasePattern.includes("solution") || lowercasePattern.includes("uses") || lowercasePattern.includes("use-case")) {
    return { template_name: "Solution / Use Case Page", recommended_primary_schema: "WebPage" };
  }

  if (lowercasePattern.includes("category") || lowercasePattern.includes("/c/") || lowercasePattern.includes("collection")) {
    return { template_name: "Category / Collection Page", recommended_primary_schema: "CollectionPage" };
  }

  if (lowercasePattern.includes("blog") || lowercasePattern.includes("article") || lowercasePattern.includes("news")) {
    return { template_name: "Editorial Article / Post", recommended_primary_schema: isMedical ? "MedicalWebPage" : "Article" };
  }

  if (lowercasePattern.includes("location") || lowercasePattern.includes("store") || lowercasePattern.includes("facility")) {
    return { template_name: "Local / Regional Landing Page", recommended_primary_schema: isMedical ? "MedicalOrganization" : "LocalBusiness" };
  }

  if (lowercasePattern.includes("about")) {
    return { template_name: "About Us / Company Story Page", recommended_primary_schema: "AboutPage" };
  }

  if (lowercasePattern.includes("contact")) {
    return { template_name: "Contact Information Page", recommended_primary_schema: "ContactPage" };
  }

  if (lowercasePattern.includes("faq") || lowercasePattern.includes("help")) {
    return { template_name: "Frequently Asked Questions Page", recommended_primary_schema: "FAQPage" };
  }

  return { template_name: "Other", recommended_primary_schema: "WebPage" };
}

export function postProcessTemplates(rawTemplates: any[]): TemplateResult[] {
  const merged: any[] = [];
  const templateMap = new Map<string, any>();

  for (const t of rawTemplates) {
    if (!t) continue;
    let template_name = t.template_name || "Other";
    if (
      template_name.toLowerCase().includes("general informational node") ||
      template_name.toLowerCase() === "general page" ||
      template_name.toLowerCase() === "unknown"
    ) {
      template_name = "Other";
    }

    if (templateMap.has(template_name)) {
      const existing = templateMap.get(template_name);
      existing.sample_urls = Array.from(new Set([...(existing.sample_urls || []), ...(t.sample_urls || [])])).slice(0, 6);
      existing.count = (existing.count || 0) + (t.count || 0);
      existing.all_matching_urls = Array.from(new Set([...(existing.all_matching_urls || []), ...(t.all_matching_urls || [])]));
    } else {
      const copy = { ...t, template_name, sample_urls: t.sample_urls || [], count: t.count || 0, all_matching_urls: t.all_matching_urls || [] };
      templateMap.set(template_name, copy);
      merged.push(copy);
    }
  }

  return merged;
}

// -------------------------------------------------------------
// 4. Gemini Direct API Execution
// -------------------------------------------------------------
export async function analyzeUrlsDirectly(urlsToAnalyze: string): Promise<AnalysisResponse> {
  const rawUrls = urlsToAnalyze.split("\n").map((l) => l.trim()).filter(Boolean);
  if (rawUrls.length === 0) throw new Error("No valid URLs provided");

  const { domainAnalyzed, clusters } = clusterRawUrls(rawUrls);

  // Deterministic fallback templates
  const fallbackTemplates = postProcessTemplates(
    clusters.map((c) => {
      const { template_name, recommended_primary_schema } = getDeterministicSchemaAndName(c.pattern, domainAnalyzed, c.samples);
      return {
        template_name,
        url_pattern: c.pattern,
        recommended_primary_schema,
        sample_urls: c.samples,
        count: c.count,
        all_matching_urls: c.all_urls,
      };
    })
  );

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      domain_analyzed: domainAnalyzed,
      total_templates_discovered: fallbackTemplates.length,
      templates: fallbackTemplates,
      reasoning: "Generated via Deterministic URL Pattern Clusterer (Client-Side).",
      executive_tldr: `Analyzed ${rawUrls.length} URLs across ${fallbackTemplates.length} distinct layout templates.`,
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Analyze these clustered URL patterns for the domain "${domainAnalyzed}" and identify the appropriate page template names and recommended Schema.org @type for each:
Domain: ${domainAnalyzed}
Clusters found: ${JSON.stringify(clusters.slice(0, 30), null, 2)}
Return a single JSON object matching:
{
  "domain_analyzed": "${domainAnalyzed}",
  "total_templates_discovered": ${clusters.length},
  "reasoning": "Reasoning string",
  "executive_tldr": "Executive TLDR summary",
  "templates": [
    {
      "template_name": "Product Detail Page",
      "url_pattern": "/product/*",
      "recommended_primary_schema": "Product",
      "sample_urls": ["sample1", "sample2"]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "";
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      const parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
      return {
        domain_analyzed: domainAnalyzed,
        total_templates_discovered: parsed.templates?.length || fallbackTemplates.length,
        templates: postProcessTemplates(parsed.templates || fallbackTemplates),
        reasoning: parsed.reasoning || "Reasoning generated via Gemini.",
        executive_tldr: parsed.executive_tldr || "Executive TLDR generated via Gemini.",
      };
    }
  } catch (err: any) {
    console.warn("[Client Engine] Falling back to deterministic clustering:", err.message);
  }

  return {
    domain_analyzed: domainAnalyzed,
    total_templates_discovered: fallbackTemplates.length,
    templates: fallbackTemplates,
    reasoning: "Generated via Deterministic Rule Engine (Client-Side Fallback).",
    executive_tldr: `Successfully clustered ${rawUrls.length} URLs into ${fallbackTemplates.length} templates.`,
  };
}

// -------------------------------------------------------------
// 5. Client-Side Sitemap & XML Parser (with CORS proxy)
// -------------------------------------------------------------
export async function fetchAndParseSitemapDirectly(sitemapUrl: string): Promise<{ type: "index" | "urlset"; urls: string[] }> {
  let target = sitemapUrl.trim();
  if (!target.startsWith("http://") && !target.startsWith("https://")) {
    target = "https://" + target;
  }

 // Use a public CORS proxy so the browser can read third-party sitemaps
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

  const xmlText = await res.text();

  // Guard against HTML error/block pages from Cloudflare or the proxy
  const trimmed = xmlText.trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      "Target domain or CORS proxy returned an HTML block page (Cloudflare/Bot detection). Please enter individual URLs or sitemaps manually in the workspace."
    );
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  // Check for XML parsing error nodes
  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Could not parse XML sitemap. The response was not valid XML.");
  }

  const childSitemaps = Array.from(xmlDoc.querySelectorAll("sitemap > loc"))
    .map((el) => el.textContent?.trim() || "")
    .filter(Boolean);

  const pageUrls = Array.from(xmlDoc.querySelectorAll("url > loc"))
    .map((el) => el.textContent?.trim() || "")
    .filter(Boolean);

  if (childSitemaps.length > 0) {
    return { type: "index", urls: childSitemaps };
  }

  return { type: "urlset", urls: pageUrls };
}
