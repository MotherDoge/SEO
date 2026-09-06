import { GoogleGenAI, Type } from "@google/genai";

export interface AuditResult {
  healthScore: number;
  errorCount: number;
  opportunityCount: number;
  auditCards: Array<{
    type: "error" | "success" | "opportunity" | "recommendation";
    title: string;
    description: string;
    fix?: string;
  }>;
  perfectedSchema: string;
  additionalRecommendedSchema: Array<{
    type: string;
    reasoning: string;
    exampleSnippet: string;
  }>;
  eli5Summary: string;
  executiveTldr: string;
  verificationLog?: string;
  gscAnalysis?: Array<{
    issueDetected: string;
    severity: "error" | "warning";
    explanation: string;
    resolution: string;
  }>;
  detectedStructuredData: Array<{
    name: string;
    itemCount: number;
    status: "eligible" | "invalid" | "warnings";
    errorsCount: number;
    warningsCount: number;
    items: Array<{
      itemName: string;
      errors: string[];
      warnings: string[];
    }>;
  }>;
}

function normalizeModelName(model?: string): string {
  if (!model) return "gemini-3.6-flash";
  const m = model.trim().toLowerCase();
  if (
    m === "gemini-flash" ||
    m === "gemini-flash-latest" ||
    m === "gemini-2.0-flash" ||
    m === "gemini-1.5-flash" ||
    m === "gemini-2.5-flash" ||
    m === "gemini-3.6-flash" ||
    m === "gemini-3.8-flash"
  ) {
    return "gemini-3.6-flash";
  }
  if (
    m === "gemini-2.5-flash-lite" ||
    m === "gemini-flash-lite" ||
    m === "gemini-lite" ||
    m === "gemini-3.1-flash-lite" ||
    m === "gemini-3.5-flash-lite"
  ) {
    return "gemini-3.5-flash-lite";
  }
  if (
    m === "gemini-1.5-pro" ||
    m === "gemini-pro" ||
    m === "gemini-2.5-pro" ||
    m === "gemini-3.1-pro-preview" ||
    m === "gemini-3.5-pro"
  ) {
    return "gemini-3.5-pro";
  }
  return model;
}

export async function auditSchema(
  htmlSnippet: string,
  url?: string,
  typeOverride?: string,
  gscIssues?: string,
  contextContent?: string,
  codeContent?: string,
  selectedModel?: string,
  optimizationMode?: "speed" | "accuracy",
  pdfBase64?: string,
  pdfFileName?: string
): Promise<AuditResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error("GEMINI_API_KEY is missing or undefined. Please verify your GitHub Action secrets.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const typeOverrideDirective = typeOverride
    ? `CRITICAL: Perfect this schema specifically as a "${typeOverride}" type.`
    : "";

  const gscIssuesDirective = gscIssues
    ? `GOOGLE SEARCH CONSOLE CROSS-CHECK: Address these issues: "${gscIssues}".`
    : "";

  let contextSchemaSection = "";
  if (contextContent || codeContent) {
    contextSchemaSection = `
PAGE CONTEXT:
${contextContent || "(No context content provided)"}

PRESENT SCHEMA CODE:
${codeContent || "(No schema blocks provided)"}
`;
  } else {
    contextSchemaSection = `
HTML Snippet:
${htmlSnippet || ""}
`;
  }

  const prompt = `
You are a Senior SEO Architect. Audit the following JSON-LD schema against the page context provided from ${url || "a code snippet"}.

${typeOverrideDirective}
${gscIssuesDirective}
${contextSchemaSection}

Tasks:
1. Calculate Health Score (0-100).
2. Identify syntax errors and missing required/recommended fields.
3. Generate a "Perfected" JSON-LD schema using a single @graph root.
4. Recommend additional schemas strictly based on actual content.
5. Provide ELI5 Summary and Executive TLDR.
6. Emulate Google Rich Results Test (status: "eligible", "warnings", "invalid").

Return the result in strict JSON format matching the schema definition.
`;

  const response = await ai.models.generateContent({
    model: normalizeModelName(selectedModel),
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

  const text = response.text || "{}";
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned) as AuditResult;
}
