import { useState } from "react";
import { AuditResult } from "@/src/services/gemini";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  TrendingUp, 
  Target, 
  BrainCircuit, 
  Zap, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  XCircle,
  Compass
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface DashboardProps {
  result: AuditResult;
}

export default function Dashboard({ result }: DashboardProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (name: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  // Determine overall status
  const hasErrors = result.errorCount > 0;
  const hasWarnings = result.opportunityCount > 0;
  
  let bannerBg = "bg-emerald-50/50 border-emerald-200 text-emerald-800";
  let bannerHeaderColor = "text-emerald-900";
  let bannerIcon = <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0 animate-pulse" />;
  let bannerTitle = "Page is eligible for rich results";
  let bannerDesc = "All structured data detected on this page is valid and eligible for Google Search rich formats.";

  if (hasErrors) {
    bannerBg = "bg-rose-50/50 border-red-200 text-rose-800";
    bannerHeaderColor = "text-rose-900";
    bannerIcon = <XCircle className="w-8 h-8 text-rose-600 shrink-0" />;
    bannerTitle = "Page is not eligible for some rich results";
    bannerDesc = "Critical structured data validation errors are preventing elements from triggering rich listing formats.";
  } else if (hasWarnings) {
    bannerBg = "bg-amber-50/50 border-amber-200 text-amber-800";
    bannerHeaderColor = "text-amber-900";
    bannerIcon = <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0 animate-bounce" />;
    bannerTitle = "Page is eligible, with warnings";
    bannerDesc = "All markup is valid, but optional recommended properties are missing which could limit some rich features.";
  }

  const totalDetectedItems = result.detectedStructuredData?.reduce((acc, curr) => acc + (curr.itemCount || 0), 0) || 0;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10 animate-in fade-in zoom-in-95 duration-500">
      {/* Google Rich Results Test Emulator Header */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <div className="text-center flex flex-col items-center">
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400">Schema Rich Results Engine</h3>
            <p className="text-xs text-navy font-bold uppercase mt-1.5 tracking-wider bg-ice-melt/20 px-3 py-1 rounded-full border border-ice-melt/10">
              {totalDetectedItems} Item{totalDetectedItems !== 1 ? "s" : ""} Detected
            </p>
          </div>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <div className={`p-6 rounded-2xl border ${bannerBg} flex flex-col md:flex-row gap-5 items-start md:items-center shadow-lg shadow-gray-100/50 transition-all`}>
          {bannerIcon}
          <div className="space-y-1">
            <h4 className={`text-base font-bold tracking-tight ${bannerHeaderColor}`}>{bannerTitle}</h4>
            <p className="text-xs opacity-90 leading-relaxed font-sans font-medium">{bannerDesc}</p>
          </div>
          <div className="md:ml-auto shrink-0 flex gap-2">
            <span className="text-[10px] bg-white py-1.5 px-3 rounded-lg font-bold border border-current/10 uppercase tracking-widest text-navy shadow-sm">
              Detected: {result.detectedStructuredData?.length || 0} Types
            </span>
          </div>
        </div>

        {/* Detected Structured Data Accordion Container */}
        <div className="space-y-3 bg-white hover:shadow-xl transition-all shadow-md shadow-gray-100/40 rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-2">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-navy opacity-60" />
              <h4 className="text-xs font-bold uppercase text-navy tracking-widest">Detected Structured Data</h4>
            </div>
            <span className="text-[10px] text-gray-400 font-bold uppercase">Google RRT Mirror</span>
          </div>

          <div className="divide-y divide-gray-100">
            {result.detectedStructuredData && result.detectedStructuredData.length > 0 ? (
              result.detectedStructuredData.map((section, sIdx) => {
                const isExpanded = !!expandedSections[section.name];
                return (
                  <div key={sIdx} className="py-4 first:pt-1 last:pb-1">
                    <button
                      onClick={() => toggleSection(section.name)}
                      className="flex items-center justify-between w-full text-left font-sans hover:bg-gray-50/50 p-2 py-3 rounded-xl transition-all duration-300"
                    >
                      <div className="flex items-center gap-3">
                        {section.status === "eligible" && <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600 shrink-0" />}
                        {section.status === "warnings" && <AlertTriangle className="w-[18px] h-[18px] text-amber-500 shrink-0" />}
                        {section.status === "invalid" && <XCircle className="w-[18px] h-[18px] text-red-500 shrink-0" />}
                        
                        <div>
                          <span className="text-sm font-bold text-navy">{section.name}</span>
                          <span className="text-xs text-gray-500 font-normal ml-2">({section.itemCount} item{section.itemCount > 1 ? "s" : ""} detected)</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 select-none">
                        <Badge 
                          className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border-none ${
                            section.status === "eligible" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" :
                            section.status === "warnings" ? "bg-amber-100 text-amber-800 hover:bg-amber-100" :
                            "bg-rose-100 text-red-800 hover:bg-rose-100"
                          }`}
                        >
                          {section.status === "eligible" ? "eligible" :
                           section.status === "warnings" ? `${section.warningsCount} warning${section.warningsCount > 1 ? "s" : ""}` :
                           `${section.errorsCount} critical error${section.errorsCount > 1 ? "s" : ""}`}
                        </Badge>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-navy/40" /> : <ChevronDown className="w-4 h-4 text-navy/40" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 pl-8 pr-2 pb-2 space-y-3 animate-in slide-in-from-top-1 duration-200">
                        {section.items.map((item, iIdx) => (
                          <div key={iIdx} className="bg-gray-50/50 p-4 rounded-xl border border-gray-100/80 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-navy/80 font-mono">
                                {item.itemName || "Unnamed item"}
                              </span>
                              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-sans">
                                {item.errors.length === 0 && item.warnings.length === 0 ? "Valid" : "Pending Action"}
                              </span>
                            </div>

                            {item.errors.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {item.errors.map((err, eIdx) => (
                                  <div key={eIdx} className="text-xs text-red-800 bg-red-50/40 px-3 py-2 rounded-lg border border-red-100/50 flex items-start gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                                    <span><strong className="font-bold">Critical Error:</strong> {err}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {item.warnings.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {item.warnings.map((warn, wIdx) => (
                                  <div key={wIdx} className="text-xs text-amber-800 bg-amber-50/40 px-3 py-2 rounded-lg border border-amber-100/50 flex items-start gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                    <span><strong className="font-bold">Warning:</strong> {warn}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {item.errors.length === 0 && item.warnings.length === 0 && (
                              <div className="text-xs text-emerald-800 bg-emerald-50/20 px-3 py-2 rounded-lg border border-emerald-100/30 flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Item fully conforming to specifications. Eligible for rich result appearance.</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-gray-400 text-xs">
                No detected structured data types on this execution snippet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="rounded-xl border-none bg-navy text-white overflow-hidden relative shadow-2xl shadow-navy/20">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Target className="w-24 h-24" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] uppercase tracking-widest font-bold opacity-60">Health Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-6xl font-heading font-bold tracking-tighter">{result.healthScore}%</div>
            <div className="mt-4 h-1.5 bg-white/10 w-full rounded-full overflow-hidden">
              <div className="h-full bg-ice-melt shadow-[0_0_10px_rgba(193,217,240,0.5)] transition-all duration-1000" style={{ width: `${result.healthScore}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-none bg-white shadow-xl shadow-gray-200/50 border-t-4 border-red-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Critical Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-6xl font-heading font-bold text-navy tracking-tighter">{result.errorCount}</div>
            <p className="text-[10px] uppercase tracking-wider text-red-500 mt-2 font-bold">Immediate Action Required</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-none bg-white shadow-xl shadow-gray-200/50 border-t-4 border-ice-melt">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-6xl font-heading font-bold text-navy tracking-tighter">{result.opportunityCount}</div>
            <p className="text-[10px] uppercase tracking-wider text-navy mt-2 font-bold">Visibility Gains Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Google Search Console Crosscheck Results */}
      {result.gscAnalysis && result.gscAnalysis.length > 0 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400">Search Console Cross-Check</h3>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <Card className="rounded-2xl border bg-gradient-to-br from-amber-50/10 to-transparent border-amber-200/50 shadow-md">
            <CardHeader className="bg-amber-500/5 border-b border-amber-200/20 py-4">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Google Search Console Resolution Log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 divide-y divide-gray-100">
              {result.gscAnalysis.map((item, index) => (
                <div key={index} className="py-5 first:pt-0 last:pb-0 flex flex-col md:flex-row gap-6 items-start">
                  <div className="w-full md:w-1/3 space-y-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${item.severity === "error" ? "bg-red-500" : "bg-amber-500"}`} />
                      <span className="text-xs font-bold uppercase tracking-wider text-navy">
                        {item.severity === "error" ? "GSC Critical Error" : "GSC Warning"}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-navy font-heading pr-4 leading-snug">{item.issueDetected}</p>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">Audit Findings</p>
                      <p className="text-xs text-gray-600 leading-relaxed font-sans">{item.explanation}</p>
                    </div>
                    <div className="bg-green-50/50 p-4 rounded-xl border border-green-100/50">
                      <p className="text-[10px] uppercase font-bold text-green-700 tracking-widest mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        Perfected Resolution
                      </p>
                      <p className="text-xs text-green-800 leading-relaxed font-sans font-medium">{item.resolution}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI Confidence & Verification */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-6 items-center bg-white/50 backdrop-blur-sm p-6 rounded-xl border border-white shadow-sm">
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-navy p-2 rounded-lg">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-navy">AI Diagnostic Confidence</span>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-navy/60 leading-relaxed font-medium italic">
              Processed through our <span className="text-navy font-bold">Architecture Multi-Layer Reasoning engine</span>. 
              This diagnostic <span className="text-navy font-bold">fetches and distills the live page content</span> to verify semantic alignment between on-page data and schema code via Chain-of-Thought (CoT), Verification (CoVe), and Debate (CoD) layers.
            </p>
          </div>
        </div>
        
        {result.verificationLog && (
          <div className="bg-navy/5 border border-navy/10 p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-3 h-3 text-navy opacity-50" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-navy/60">Verification Layer (CoT/CoVe/CoD)</span>
            </div>
            <p className="text-xs text-navy/80 italic leading-relaxed">{result.verificationLog}</p>
          </div>
        )}
      </div>

      {/* Audit Cards */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400">Detailed Audit Findings</h3>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          {result.auditCards.map((card, idx) => (
            <div 
              key={idx} 
              className={`p-8 rounded-2xl border flex flex-col md:flex-row gap-6 transition-all hover:shadow-lg ${
                card.type === "error" ? "bg-white border-red-100" : 
                card.type === "success" ? "bg-white border-green-100" : 
                card.type === "recommendation" ? "bg-lemon-icing/5 border-lemon-icing/30" :
                "bg-white border-ice-melt/30"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                card.type === "error" ? "bg-red-50 text-red-500" : 
                card.type === "success" ? "bg-green-50 text-green-500" : 
                card.type === "recommendation" ? "bg-lemon-icing/20 text-navy" :
                "bg-ice-melt/10 text-navy"
              }`}>
                {card.type === "error" && <AlertCircle className="w-6 h-6" />}
                {card.type === "success" && <CheckCircle2 className="w-6 h-6" />}
                {card.type === "opportunity" && <Info className="w-6 h-6" />}
                {card.type === "recommendation" && <TrendingUp className="w-6 h-6" />}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className={`text-lg font-heading tracking-tight ${
                    card.type === "error" ? "text-red-700" : 
                    card.type === "success" ? "text-green-700" : 
                    "text-navy"
                  }`}>
                    {card.title}
                  </h4>
                  <Badge variant="outline" className={`text-[10px] uppercase px-2 py-0 rounded-full border-none ${
                    card.type === "error" ? "bg-red-100 text-red-700" : 
                    card.type === "success" ? "bg-green-100 text-green-700" : 
                    card.type === "recommendation" ? "bg-lemon-icing text-navy" :
                    "bg-ice-melt/20 text-navy"
                  }`}>
                    {card.type}
                  </Badge>
                </div>
                <p className="text-gray-600 leading-relaxed mb-4">{card.description}</p>
                {card.fix && (
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 group/fix">
                    <p className="text-[10px] uppercase font-bold text-gray-400 mb-2 flex items-center gap-2">
                      <Zap className="w-3 h-3" />
                      Recommended Architectural Fix
                    </p>
                    <code className="text-xs text-navy font-mono block break-all bg-white p-3 rounded-lg border border-gray-100">
                      {card.fix}
                    </code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Additional Recommendations */}
      {result.additionalRecommendedSchema.length > 0 && (
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400">Strategic Schema Expansion</h3>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="grid grid-cols-1 gap-8">
            {result.additionalRecommendedSchema.map((rec, idx) => (
              <Card key={idx} className="rounded-2xl border-none bg-white shadow-xl overflow-hidden">
                <div className="bg-navy p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-ice-melt text-navy font-bold uppercase text-[10px]">{rec.type}</Badge>
                    <span className="text-white text-xs font-bold uppercase tracking-widest">Recommended Addition</span>
                  </div>
                </div>
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Strategic Reasoning</p>
                    <p className="text-gray-600 leading-relaxed">{rec.reasoning}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Implementation Snippet</p>
                    <div className="bg-gray-900 rounded-xl p-6 overflow-x-auto border border-gray-800">
                      <pre className="text-xs text-ice-melt font-mono leading-relaxed">
                        <code>{rec.exampleSnippet}</code>
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* AI Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-3">
          <h3 className="text-lg text-navy flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Executive TLDR
          </h3>
          <div className="prose prose-sm max-w-none bg-white p-6 rounded-sm border border-gray-200 shadow-sm">
            <ReactMarkdown>{result.executiveTldr}</ReactMarkdown>
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-lg text-navy flex items-center gap-2">
            <Info className="w-5 h-5" />
            ELI5 Summary
          </h3>
          <div className="prose prose-sm max-w-none bg-white p-6 rounded-sm border border-gray-200 shadow-sm">
            <ReactMarkdown>{result.eli5Summary}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
