import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Code2, Zap, Lightbulb, Copy, Check, Settings2, Info, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InputSectionProps {
  onAnalyze: (data: { type: "html"; value: string; typeOverride?: string; gscIssues?: string }) => void;
  isLoading: boolean;
  isCollapsed?: boolean;
}

const GSC_PRESETS = [
  { value: "missing-price", label: "Missing field 'price' (in 'offers')", text: "Missing field 'price' (in 'offers')" },
  { value: "missing-reviews", label: "Missing field 'review' or 'aggregateRating'", text: "Missing field 'review' (optional) OR Missing field 'aggregateRating' (optional)" },
  { value: "missing-author-name", label: "Missing field 'author' -> 'name'", text: "Missing field 'author' (in 'Article') -> 'name' is required to validate" },
  { value: "missing-video-metadata", label: "Missing 'uploadDate' / 'thumbnailUrl'", text: "Video Object errors: Missing field 'uploadDate' (in 'VideoObject') and Missing field 'thumbnailUrl'" },
  { value: "duplicate-id", label: "Duplicate '@id' found / ID collision", text: "Duplicate '@id' error - multiple entities resolve to the same identifier hash" },
];

const SCHEMA_TYPES = [
  { value: "auto", label: "Auto-Detect (Recommended)" },
  { value: "Book", label: "Book" },
  { value: "Product", label: "Product" },
  { value: "Course", label: "Course" },
  { value: "Event", label: "Event" },
  { value: "LocalBusiness", label: "LocalBusiness" },
  { value: "Article", label: "Article" },
  { value: "Recipe", label: "Recipe" },
  { value: "SoftwareApplication", label: "Software Application" },
];

export default function InputSection({ onAnalyze, isLoading, isCollapsed: initialCollapsed = false }: InputSectionProps) {
  const [html, setHtml] = useState("");
  const [typeOverride, setTypeOverride] = useState("auto");
  const [gscIssuesText, setGscIssuesText] = useState("");
  const [showGsc, setShowGsc] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  // Auto-collapse when a result is present (controlled by prop)
  useEffect(() => {
    setIsCollapsed(initialCollapsed);
  }, [initialCollapsed]);

  const copyJsonTip = () => {
    const code = `(function() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let output = \`URL: \${window.location.href}\\n\`;
    scripts.forEach((s, i) => {
        output += \`\\n--- Schema Block \${i+1} ---\\n\${s.innerText}\\n\`;
    });
    console.log(output);
    copy(output); // Automatically copies it to your clipboard!
})();`;
    navigator.clipboard.writeText(code);
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  const copyTextTip = () => {
    const code = `(function() {
    const text = document.body.innerText;
    const output = \`URL: \${window.location.href}\\n\\n--- Page Content ---\\n\${text}\`;
    console.log(output);
    copy(output);
})();`;
    navigator.clipboard.writeText(code);
    setTextCopied(true);
    setTimeout(() => setTextCopied(false), 2000);
  };

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-cloud-dancer via-[#EAE6DF] to-cloud-dancer border-b border-navy/10 transition-all duration-500">
      {/* Decorative elements for a modern look */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-ice-melt/20 rounded-full blur-3xl opacity-60" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-navy/5 rounded-full blur-3xl opacity-60" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10 p-12 lg:p-20 py-8 lg:py-12">
        <div className="flex items-center justify-between mb-0">
          <div className="flex items-center gap-3">
            <div className="bg-navy p-2 rounded-lg shadow-lg shadow-navy/20 text-white animate-pulse">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-3xl font-heading text-navy tracking-tight leading-tight">Diagnostic Input</h2>
              {isCollapsed && html.trim() && (
                <p className="text-[10px] text-navy/60 uppercase tracking-widest font-bold mt-1 max-w-[300px] truncate italic">
                  Analysis Active: {html.slice(0, 50)}...
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {!isCollapsed && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 bg-white/60 backdrop-blur-md p-2 px-4 rounded-xl border border-navy/10"
              >
                <div className="flex items-center gap-2 text-navy/60">
                  <Settings2 className="w-4 h-4" />
                  <span className="text-[10px] uppercase font-bold tracking-widest">Type Override</span>
                </div>
                <Select value={typeOverride} onValueChange={setTypeOverride}>
                  <SelectTrigger className="w-[200px] h-9 bg-white border border-navy/10 text-navy font-bold text-xs rounded-lg shadow-inner">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-none shadow-2xl">
                    {SCHEMA_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-xs font-medium focus:bg-ice-melt focus:text-navy">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
            
            <Button 
              variant="ghost" 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-navy hover:bg-navy/5 rounded-xl px-4 h-11 flex items-center gap-2 group font-semibold"
            >
              <span className="text-[10px] uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">
                {isCollapsed ? "Expand Parameters" : "Collapse"}
              </span>
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {!isCollapsed && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                  <div className="lg:col-span-2">
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-1 rounded-2xl shadow-2xl">
                      <div className="bg-white rounded-xl p-6 space-y-6">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-xs font-bold uppercase tracking-widest text-navy/40">
                              URL, HTML Snippet or JSON-LD
                            </label>
                            <Tooltip>
                              <TooltipTrigger className="text-navy/40 hover:text-navy transition-colors">
                                <Info className="w-3.5 h-3.5" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs p-4 bg-navy text-white border-none rounded-xl shadow-2xl">
                                <p className="text-xs leading-relaxed">
                                  <span className="font-bold text-ice-melt">Pro Tip:</span> Providing the <span className="font-bold">entire HTML</span> of the page (or at least the main content area) allows the AI to perform a much deeper semantic analysis. This helps in identifying missing properties based on actual visible content.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <Textarea 
                            placeholder="Paste your HTML or JSON-LD snippet here..." 
                            value={html}
                            onChange={(e) => setHtml(e.target.value)}
                            className="min-h-[250px] font-mono text-sm rounded-xl border-gray-100 bg-gray-50/50 focus:bg-white focus:border-ice-melt focus:ring-4 focus:ring-ice-melt/10 transition-all resize-none"
                          />
                        </div>

                        {/* Google Search Console Cross-Checker Integration */}
                        <div className="rounded-xl border border-dashed border-navy/20 p-4 space-y-4 bg-sky-50/10">
                          <button
                            type="button"
                            onClick={() => setShowGsc(!showGsc)}
                            className="flex items-center justify-between w-full text-left focus:outline-none"
                          >
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                              <span className="text-xs font-bold uppercase tracking-wider text-navy">
                                Google Search Console Cross-Checker{gscIssuesText.trim() ? " (Active)" : ""}
                              </span>
                            </div>
                            <span className="text-[10px] text-navy/40 font-bold uppercase tracking-widest hover:text-navy transition-colors">
                              {showGsc ? "Hide Targets" : "Configure Targets"}
                            </span>
                          </button>

                          {showGsc && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="space-y-4 pt-2 border-t border-navy/10 overflow-hidden"
                            >
                              <p className="text-[10px] text-gray-500 font-medium leading-relaxed font-sans">
                                Pinpoint and resolve known Search Console / Rich Results Test errors or warnings. Select a preset below or type custom logs.
                              </p>

                              <div className="flex flex-wrap gap-2">
                                {GSC_PRESETS.map((preset) => (
                                  <button
                                    key={preset.value}
                                    type="button"
                                    onClick={() => {
                                      setGscIssuesText((prev) => 
                                        prev ? `${prev}\n- ${preset.text}` : preset.text
                                      );
                                    }}
                                    className="text-[10px] bg-white text-navy font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-ice-melt/10 hover:border-ice-melt/50 transition-all flex items-center gap-1"
                                  >
                                    <span>+</span> {preset.label}
                                  </button>
                                ))}
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-navy/40">
                                  Current GSC Errors / Warning Logs
                                </label>
                                <Textarea
                                  placeholder="E.g., Missing field 'price' (in 'offers'), or paste raw issue message..."
                                  value={gscIssuesText}
                                  onChange={(e) => setGscIssuesText(e.target.value)}
                                  className="min-h-[85px] text-xs font-mono rounded-lg border-gray-200 bg-white"
                                />
                                {gscIssuesText && (
                                  <button
                                    type="button"
                                    onClick={() => setGscIssuesText("")}
                                    className="text-[9px] text-red-500 font-bold uppercase tracking-widest hover:underline"
                                  >
                                    Clear Input
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </div>
                        
                        <Button 
                          onClick={() => onAnalyze({ 
                            type: "html", 
                            value: html, 
                            typeOverride: typeOverride === "auto" ? undefined : typeOverride,
                            gscIssues: gscIssuesText.trim() || undefined
                          })}
                          disabled={isLoading || !html.trim()}
                          className="w-full h-14 bg-navy hover:bg-navy/90 text-white font-bold uppercase tracking-widest rounded-xl shadow-xl shadow-navy/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {isLoading ? (
                            <span className="flex items-center gap-2">
                              <Zap className="w-4 h-4 animate-pulse" />
                              {html.startsWith('http') ? 'Crawling & Analyzing...' : 'Processing...'}
                            </span>
                          ) : (
                            "Audit Snippet"
                          )}
                        </Button>
                        
                        <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest font-medium">
                          Deep-content inspection powered by Gemini 3 Flash
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-white/60 backdrop-blur-xl border border-navy/10 p-8 rounded-2xl text-navy space-y-6 shadow-lg shadow-navy/5">
                      <div className="flex items-center gap-3 text-navy">
                        <div className="bg-navy/10 p-2 rounded-lg">
                          <Lightbulb className="w-5 h-5 text-navy" />
                        </div>
                        <h3 className="font-heading font-bold uppercase tracking-wider text-sm">Architect's Tip: JSON-LD</h3>
                      </div>
                      
                      <div className="space-y-4">
                        <p className="text-sm font-bold leading-tight">Extract JSON-LD from a live page</p>
                        
                        <div className="space-y-3 text-xs opacity-80 leading-relaxed">
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">01</span>
                            <span>Right Click <span className="text-navy font-medium">Inspect</span> on the target page.</span>
                          </p>
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">02</span>
                            <span>Navigate to the <span className="text-navy font-medium">Console</span> tab.</span>
                          </p>
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">03</span>
                            <span>Paste and execute the following snippet:</span>
                          </p>
                        </div>

                        <div className="relative group/code">
                          <pre className="bg-navy/95 p-4 rounded-xl text-[10px] font-mono text-ice-melt overflow-x-auto border border-white/5 leading-normal">
                            {`(function() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let output = \`URL: \${window.location.href}\\n\`;
    scripts.forEach((s, i) => {
        output += \`\\n--- Schema Block \${i+1} ---\\n\${s.innerText}\\n\`;
    });
    console.log(output);
    copy(output); 
  })();`}
                          </pre>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={copyJsonTip}
                            className="absolute top-2 right-2 h-8 w-8 text-ice-melt hover:bg-white/10 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity"
                          >
                            {jsonCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/60 backdrop-blur-xl border border-navy/10 p-8 rounded-2xl text-navy space-y-6 shadow-lg shadow-navy/5">
                      <div className="flex items-center gap-3 text-navy">
                        <div className="bg-navy/10 p-2 rounded-lg">
                          <Lightbulb className="w-5 h-5 text-navy" />
                        </div>
                        <h3 className="font-heading font-bold uppercase tracking-wider text-sm">Architect's Tip: Context</h3>
                      </div>
                      
                      <div className="space-y-4">
                        <p className="text-sm font-bold leading-tight">Extract clean text for deep context</p>
                        
                        <div className="space-y-3 text-xs opacity-80 leading-relaxed">
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">01</span>
                            <span>Identify high-value pages with <span className="text-navy font-medium">no existing schema</span>.</span>
                          </p>
                          <p className="flex gap-2">
                            <span className="text-navy font-bold">02</span>
                            <span>Run this in your browser <span className="text-navy font-medium">Console</span>:</span>
                          </p>
                        </div>

                        <div className="relative group/code">
                          <pre className="bg-navy/95 p-4 rounded-xl text-[10px] font-mono text-ice-melt overflow-x-auto border border-white/5 leading-normal">
                            {`(function() {
    const text = document.body.innerText;
    const output = \`URL: \${window.location.href}\\n\\n--- Page Content ---\\n\${text}\`;
    console.log(output);
    copy(output);
  })();`}
                          </pre>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={copyTextTip}
                            className="absolute top-2 right-2 h-8 w-8 text-ice-melt hover:bg-white/10 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity"
                          >
                            {textCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                        
                        <p className="text-[10px] text-navy/60 italic leading-tight">
                          * Perfect for bootstrapping schema-from-scratch on complex informational pages.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
