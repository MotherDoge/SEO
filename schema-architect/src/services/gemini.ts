import axios from "axios";

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
  try {
    const response = await axios.post("/api/audit", {
      htmlSnippet,
      url,
      typeOverride,
      gscIssues,
      contextContent,
      codeContent,
      selectedModel,
      optimizationMode,
      pdfBase64,
      pdfFileName
    });
    return response.data;
  } catch (error: any) {
    console.error("Frontend proxy query failed:", error);
    let errMsg = "Audit execution failed.";
    if (error.response?.data?.details) {
      errMsg = error.response.data.details;
    } else if (error.response?.data?.error) {
      errMsg = error.response.data.error;
    } else if (error.message) {
      errMsg = error.message;
    }
    throw new Error(errMsg);
  }
}

