import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AuditResult {
  healthScore: number;
  errorCount: number;
  opportunityCount: number;
  auditCards: {
    type: "error" | "success" | "opportunity" | "recommendation";
    title: string;
    description: string;
    fix?: string;
  }[];
  perfectedSchema: string;
  additionalRecommendedSchema: {
    type: string;
    reasoning: string;
    exampleSnippet: string;
  }[];
  eli5Summary: string;
  executiveTldr: string;
  verificationLog?: string;
  gscAnalysis?: {
    issueDetected: string;
    severity: "error" | "warning";
    explanation: string;
    resolution: string;
  }[];
  detectedStructuredData?: {
    name: string;
    itemCount: number;
    status: "eligible" | "invalid" | "warnings";
    errorsCount: number;
    warningsCount: number;
    items: {
      itemName: string;
      errors: string[];
      warnings: string[];
    }[];
  }[];
}

export async function auditSchema(htmlSnippet: string, url?: string, typeOverride?: string, gscIssues?: string): Promise<AuditResult> {
  const prompt = `
    You are a Senior SEO Architect and Security Auditor. Audit the following JSON-LD schema extracted from ${url || "a code snippet"}.
    
    ${typeOverride ? `CRITICAL INSTRUCTION: The user has requested to PERFECT this schema specifically as a "${typeOverride}" type. Even if the current schema is a different type (like Product), you MUST transform and perfect it into a valid, high-quality "${typeOverride}" schema block.` : ""}

    ${gscIssues ? `
    GOOGLE SEARCH CONSOLE / RICH RESULTS TEST CROSS-CHECK MAPPING:
    The user is cross-referencing this page against the following actual Google Search Console errors or warnings:
    "${gscIssues}"
    
    You MUST analyze these specific Search Console issues against the provided JSON-LD and HTML text. Under your Chain of Verification (CoVe):
    1. Pinpoint the exact parameter, missing object, format typo, or nested node violating GSC criteria causing this error/warning.
    2. Write focused cards of type "error" or "opportunity" pointing directly to the GSC issue.
    3. Ensure the 'perfectedSchema' fully resolves this Google Search Console error or warning.
    4. Populate the 'gscAnalysis' array in the JSON response identifying the problem, severity, underlying explanation, and how it is resolved.
    ` : ""}

    HTML Snippet containing JSON-LD:
    ${htmlSnippet}
    
    SPECIAL HANDLING & THEORETICAL FRAMEWORK:
    - Incorporate "The Three Lives of Schema Markup" Framework back-of-mind during audit:
      1. Life 1 (Google Index Pipeline / Entity Infrastructure): Schema establishes formal identity. You must ensure nodes are interconnected using robust '@id' anchors (e.g. #webpage, #organization, #article, #service) rather than isolated blocks, using 'sameAs' to link to authoritative external entities (e.g. Wikipedia/Wikidata).
      2. Life 2 (LLM Pretraining / Indirect): To survive next-generation LLM training runs, sameAs Wikidata links serve as downstream KG injection channels. Ensure identity anchors are stable and correct.
      3. Life 3 (LLM Runtime Retrieval / Visible Parity): LLMs in retrieval-augmented generation mode (RAG) strip script blocks and read visible textual content. Therefore, you MUST enforce a Content Parity Rule: every crucial fact (addresses, support text, rates, FAQs, pricing) listed in schema MUST ALSO be present in the visible page HTML context. Recommend visible content improvements for LLM retrieval.
    - If you see a [SYSTEM NOTE] about Microdata being detected, acknowledge it in your audit. Explain that while the page has legacy Microdata (itemprop/itemscope), Google strongly recommends transitioning to JSON-LD for better maintainability and rich result support.
    - If JSON-LD is missing but Microdata was detected, your "Perfected Schema" should be a fresh JSON-LD implementation of that data.
    1. **Internal Chain of Thought (CoT)**: Analyze the page content to identify the primary entity ${typeOverride ? `(User requested: ${typeOverride})` : "(e.g., Product, Article, LocalBusiness)"}.
    2. **Chain of Verification (CoVe)**: Verify if the existing schema blocks correctly represent the identified entity ${typeOverride ? `(targeting ${typeOverride})` : ""} and check for missing required/recommended properties according to Google's Rich Result guidelines.
    3. **Chain of Debate (CoD)**: Act as both an auditor and a growth strategist. Debate whether additional schema types (e.g., FAQ, Review, BreadcrumbList) would enhance search visibility based on the page's content, even if they aren't currently present.
    
    Tasks:
    1. Identify all existing JSON-LD blocks.
    2. Perform a Gap Analysis against Google's Rich Result requirements.
    3. Calculate a Health Score (0-100).
    4. Identify syntax errors and missing required/recommended fields.
    5. Generate a "Perfected" version of the EXISTING JSON-LD ${typeOverride ? `transformed into a ${typeOverride} type` : ""}.
       CRITICAL: The perfected version MUST be a synthesis of the provided schema AND the page content. If the page contains a Video, FAQ, or Service that is missing from the provided JSON-LD, you MUST include it in the perfected output to ensure total coverage. 
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
        - Zero Hallucination Mandate: NEVER invent content that is not present on the page. This is especially CRITICAL for FAQPage; only include questions and answers that explicitly appear in the page text. If a page does not have FAQs, do not synthesize "common questions" out of thin air. Only include verified feedback/Q&As.
        - Property Name Precision: Use EXACT Schema.org property names. For example, for CreativeWorkSeason, the correct property is "seasonNumber", NOT "number". For CreativeWorkSeries, use "hasPart". Always verify against the latest Schema.org vocabulary.
        - Strategic Extrapolation: If a property is required for validation but missing from the raw schema (e.g., uploadDate for a Video), try to find it in the provided page text. Only if a REQUIRED METADATA field is missing should you synthesize a high-quality placeholder (e.g., a relevant date) and mark it for user updates. NEVER extrapolate actual content (text, FAQs, testimonials).
    6. **NEW**: Identify and recommend ADDITIONAL schema types that SHOULD be on the page based on the content analysis.
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

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      temperature: 0.2, // Lower temperature for more deterministic architectural output
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
          verificationLog: { type: Type.STRING, description: "Brief summary of the CoT/CoVe/CoD process" },
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
            description: "Mimics Google Rich Results Test categories of Detected Structured Data.",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "e.g., Breadcrumbs, Merchant listings, Product snippets, FAQ, Videos, etc." },
                itemCount: { type: Type.NUMBER },
                status: { type: Type.STRING, enum: ["eligible", "invalid", "warnings"] },
                errorsCount: { type: Type.NUMBER },
                warningsCount: { type: Type.NUMBER },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      itemName: { type: Type.STRING, description: "e.g. Unnamed item, or the item name" },
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

  return JSON.parse(response.text);
}
