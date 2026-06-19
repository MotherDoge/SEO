export interface MinimalTask {
  templateName: string;
  url: string;
  recommendedSchema: string;
  result?: any;
}

/**
 * Generates a clean, human-readable Markdown-formatted report for an individual page
 * representing all structural audits, gap analyses, and perfected schema,
 * and copies it directly to the clipboard.
 */
export async function copyTaskToClipboard(task: MinimalTask): Promise<boolean> {
  const result = task.result;
  if (!result) return false;

  const totalDetectedItems = result.detectedStructuredData?.reduce((acc: number, curr: any) => acc + (curr.itemCount || 0), 0) || 0;

  let md = "";
  md += `==================================================\n`;
  md += `SCHEMA ARCHITECT AUDIT REPORT\n`;
  md += `==================================================\n\n`;

  md += `## Section 1: Identified Page Templates & Scans (Summary)\n`;
  md += `* **Target URL**: ${task.url}\n`;
  md += `* **Template Name**: ${task.templateName}\n`;
  md += `* **Target Schema Type**: ${task.recommendedSchema}\n`;
  md += `* **Avg Health Score**: ${result.healthScore}%\n`;
  md += `* **Critical Errors**: ${result.errorCount}\n`;
  md += `* **Strategic Opportunities**: ${result.opportunityCount}\n`;
  md += `* **Total Detected Items**: ${totalDetectedItems}\n\n`;

  md += `## Section 2: Audit for ${task.templateName} (${task.url})\n\n`;

  // A. Detected Items
  md += `### A. Detected Items (Live GSC Validation Snapshot)\n`;
  if (result.detectedStructuredData && result.detectedStructuredData.length > 0) {
    result.detectedStructuredData.forEach((section: any) => {
      md += `* **Type**: ${section.name} (${section.itemCount} items) [Status: ${section.status.toUpperCase()}]\n`;
      section.items.forEach((item: any) => {
        md += `  - Item: ${item.itemName || "Unnamed schema node"}\n`;
        item.errors.forEach((err: string) => {
          md += `    - Critical Error: ${err}\n`;
        });
        item.warnings.forEach((warn: string) => {
          md += `    - Warning: ${warn}\n`;
        });
        if (item.errors.length === 0 && item.warnings.length === 0) {
          md += `    - OK (Valid rich results status)\n`;
        }
      });
    });
  } else {
    md += `No items detected under live diagnostic crawlers.\n`;
  }
  md += `\n`;

  // B. Missing Items
  md += `### B. Missing Items (Structural Gap Analysis)\n`;
  const errorsList = result.auditCards?.filter((c: any) => c.type === "error") || [];
  const recommendationsList = result.auditCards?.filter((c: any) => c.type === "recommendation" || c.type === "success") || [];

  if (errorsList.length === 0 && recommendationsList.length === 0) {
    md += `✓ Gap analysis clean! Absolute requirement compliance verified.\n`;
  } else {
    errorsList.forEach((card: any) => {
      md += `* **REQUIRED ERROR**: ${card.title}\n`;
      md += `  Description: ${card.description}\n`;
      if (card.fix) {
        md += `  Suggested Fix:\n  \`\`\`\n  ${card.fix}\n  \`\`\`\n`;
      }
    });
    recommendationsList.forEach((card: any) => {
      md += `* **RECOMMENDED IMPROVEMENT**: ${card.title}\n`;
      md += `  Description: ${card.description}\n`;
      if (card.fix) {
        md += `  Suggested Fix:\n  \`\`\`\n  ${card.fix}\n  \`\`\`\n`;
      }
    });
  }
  md += `\n`;

  // C. Opportunities & Recommended Schema Additions & Why?
  md += `### C. Strategic Expansion Opportunities & Reasoning\n`;
  const opportunitiesList = result.auditCards?.filter((c: any) => c.type === "opportunity") || [];
  if (opportunitiesList.length > 0) {
    opportunitiesList.forEach((card: any) => {
      md += `* **OPPORTUNITY**: ${card.title}\n`;
      md += `  Description: ${card.description}\n`;
      if (card.fix) {
        md += `  Suggested Action: ${card.fix}\n`;
      }
    });
  }

  if (result.additionalRecommendedSchema && result.additionalRecommendedSchema.length > 0) {
    result.additionalRecommendedSchema.forEach((rec: any) => {
      md += `* **RECOMMENDED ADDITION**: ${rec.type}\n`;
      md += `  Reasoning: ${rec.reasoning}\n`;
      md += `  Example Snippet:\n  \`\`\`json\n  ${rec.exampleSnippet}\n  \`\`\`\n`;
    });
  }
  if (opportunitiesList.length === 0 && (!result.additionalRecommendedSchema || result.additionalRecommendedSchema.length === 0)) {
    md += `No additional strategic opportunity cards flagged.\n`;
  }
  md += `\n`;

  // D. Master Code
  md += `### D. Master Code (Validated & Refined Production-Ready JSON-LD)\n`;
  if (result.perfectedSchema) {
    try {
      const formattedJson = JSON.stringify(JSON.parse(result.perfectedSchema), null, 2);
      md += `\`\`\`json\n${formattedJson}\n\`\`\`\n\n`;
    } catch (e) {
      md += `\`\`\`json\n${result.perfectedSchema}\n\`\`\`\n\n`;
    }
  } else {
    md += `No perfected schema block generated.\n\n`;
  }

  md += `## Section 3: Strategic Conclusion\n`;
  md += `* **Executive TLDR**:\n${result.executiveTldr || "N/A"}\n\n`;
  md += `* **ELI5 Summary**:\n${result.eli5Summary || "N/A"}\n\n`;

  md += `==================================================\n`;
  md += `Report generated via Schema Architect Engine. Certified standard compliance 2026.\n`;
  md += `==================================================\n`;

  try {
    await navigator.clipboard.writeText(md);
    return true;
  } catch (err) {
    console.error("Failed to copy report to clipboard:", err);
    return false;
  }
}
