import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface GeoStrategyResult {
  title: string;
  summary: string;
  category: string;
  strategy: {
    why: string;
    how: string;
    what: string;
  };
  recommendations: {
    onSite: string[];
    technicalSEO: string[];
    offPageSEO: string[];
    community: {
      reddit: string[];
      forums: string[];
    };
    outreach: {
      blogs: string[];
      influencers: string[];
    };
    multimedia: string[];
    tools: string[];
  };
}

export const generateGeoStrategy = async (
  domainUrl: string,
  goal: string,
  persona: string,
  coreMessage: string,
  language: string = "English"
): Promise<GeoStrategyResult> => {
  const prompt = `
    Generate a comprehensive GEO (Generative Engine Optimization) Strategy for the following:
    Domain URL: ${domainUrl}
    Goal: ${goal}
    Target Persona: ${persona}
    Core Messaging (The Why): ${coreMessage}
    Language: ${language}

    AI Search is a diversification of content types and media channels used to influence how LLMs perceive and rate the brand. 
    Your strategy must suggest how to dominate the "Aura" around this brand across the web.

    CRITICAL REASONING PROCESS:
    - Perform a Chain of Thought reasoning: break down the strategy into logical steps.
    - Conduct an internal chain of debate: challenge the initial strategy and verify it against target persona needs.
    - Verification: Ensure the final JSON output is grounded and reduces hallucinations.
    
    CRITICAL: Content recommendations MUST ensure they apply concepts such as vector embeddings, RAG (Retrieval-Augmented Generation), grounding, chunks, passages, and citations in daily content work to be "AI-ready".

    Requirements:
    1. Title: A strategic name for this GEO campaign.
    2. Summary: A high-level overview of the orchestrating logic.
    3. Category: The primary industry/niche.
    4. Strategy (The Aura Logic):
       - Why: The strategic purpose (Core Messaging).
       - How: How it effectively appeals to the target audience to take action.
       - What: The specific narrative being pushed.
    5. Recommendations (Where they dwell):
       - onSite: Specific types of content to create on the domain website (e.g., whitepapers, case studies, specific landing pages).
       - technicalSEO: Technical optimizations for AI crawlers (schema markup, site structure, API endpoints, sitemaps).
       - offPageSEO: External signals (backlinks, brand mentions, knowledge graph entries, directory listings).
       - community: Specific Reddit threads, subreddits, and niche forums where the brand should be visible and discussed.
       - outreach: Specific types of blogs and influencers to outreach to for backlink and mention diversification.
       - multimedia: Other formats (images, infographics, videos, podcasts, audios).
       - tools: Interactive elements (calculators, micro-apps, AI agents, tools) that provide utility.
    6. Recommendations: Be extremely specific. For Reddit, suggest actual subreddits (e.g., r/cybersecurity). For blogs, suggest specific types or names of publications.

    Return the result in JSON format.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          category: { type: Type.STRING },
          strategy: {
            type: Type.OBJECT,
            properties: {
              why: { type: Type.STRING },
              how: { type: Type.STRING },
              what: { type: Type.STRING }
            },
            required: ["why", "how", "what"]
          },
          recommendations: {
            type: Type.OBJECT,
            properties: {
              onSite: { type: Type.ARRAY, items: { type: Type.STRING } },
              technicalSEO: { type: Type.ARRAY, items: { type: Type.STRING } },
              offPageSEO: { type: Type.ARRAY, items: { type: Type.STRING } },
              community: {
                type: Type.OBJECT,
                properties: {
                  reddit: { type: Type.ARRAY, items: { type: Type.STRING } },
                  forums: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["reddit", "forums"]
              },
              outreach: {
                type: Type.OBJECT,
                properties: {
                  blogs: { type: Type.ARRAY, items: { type: Type.STRING } },
                  influencers: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["blogs", "influencers"]
              },
              multimedia: { type: Type.ARRAY, items: { type: Type.STRING } },
              tools: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["onSite", "technicalSEO", "offPageSEO", "community", "outreach", "multimedia", "tools"]
          }
        },
        required: ["title", "summary", "category", "strategy", "recommendations"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const refineContentPart = async (
  currentContent: string,
  instruction: string
): Promise<string> => {
  const prompt = `
    Refine the following content based on these instructions: "${instruction}"
    
    Content:
    ${currentContent}
    
    Return only the refined content text.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text || currentContent;
};
