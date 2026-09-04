import { useState } from "react";
import { Copy, Check, Lightbulb, ChevronDown, ChevronUp, Code2, Globe, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SinglePageInstructions() {
  const [activeTip, setActiveTip] = useState<"json" | "dom" | "context">("json");
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const jsonSnippet = `(function() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let output = \`URL: \${window.location.href}\\n\`;
    scripts.forEach((s, i) => {
        output += \`\\n--- Schema Block \${i+1} ---\\n\${s.innerText}\\n\`;
    });
    console.log(output);
    copy(output); 
  })();`;

  const domSnippet = `copy(document.documentElement.outerHTML);`;

  const contextSnippet = `(function() {
    const text = document.body.innerText;
    const output = \`URL: \${window.location.href}\\n\\n--- Page Content ---\\n\${text}\`;
    console.log(output);
    copy(output);
  })();`;

  return (
    <div className="w-full bg-white/90 backdrop-blur-sm border border-navy/10 rounded-2xl shadow-sm overflow-hidden mb-6 transition-all duration-200">
      {/* Header Bar */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center justify-between px-6 py-4 bg-cloud-dancer/40 hover:bg-cloud-dancer/70 transition-colors cursor-pointer select-none ${
          isExpanded ? "border-b border-gray-100" : ""
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-navy/10 text-navy">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-xs uppercase tracking-widest text-navy">
              Extraction Instructions
            </h3>
            <p className="text-[11px] text-navy/60 font-sans">
              Choose the extraction method that matches your target page setup
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {!isExpanded && (
            <div className="relative flex items-center">
              <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-navy text-white text-[11px] font-medium shadow-sm mr-1 animate-in fade-in zoom-in-95 duration-200">
                <span className="w-1.5 h-1.5 rounded-full bg-ice-melt animate-pulse" />
                <span>Expand to see instructions</span>
                <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-navy rotate-45" />
              </div>
            </div>
          )}

          <button
            id="toggle-instructions-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-1.5 rounded-lg text-navy/70 hover:text-navy hover:bg-navy/10 transition-colors cursor-pointer"
            title={isExpanded ? "Collapse instructions" : "Expand to see instructions"}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse instructions" : "Expand to see instructions"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-6 space-y-5">
          {/* Tip Selector Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveTip("json")}
              className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                activeTip === "json"
                  ? "border-navy bg-navy text-white shadow-sm"
                  : "border-gray-200 bg-gray-50/50 hover:bg-white text-navy"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="w-3.5 h-3.5" />
                <span className="font-heading font-bold text-xs uppercase tracking-wider">
                  JSON-LD
                </span>
              </div>
              <p className={`text-[11px] truncate ${activeTip === "json" ? "text-white/80" : "text-navy/60"}`}>
                Extract JSON-LD from live page
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTip("dom")}
              className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                activeTip === "dom"
                  ? "border-navy bg-navy text-white shadow-sm"
                  : "border-gray-200 bg-gray-50/50 hover:bg-white text-navy"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-3.5 h-3.5" />
                <span className="font-heading font-bold text-xs uppercase tracking-wider">
                  Rendered DOM
                </span>
              </div>
              <p className={`text-[11px] truncate ${activeTip === "dom" ? "text-white/80" : "text-navy/60"}`}>
                Extract hydrated HTML & GTM
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTip("context")}
              className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                activeTip === "context"
                  ? "border-navy bg-navy text-white shadow-sm"
                  : "border-gray-200 bg-gray-50/50 hover:bg-white text-navy"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-3.5 h-3.5" />
                <span className="font-heading font-bold text-xs uppercase tracking-wider">
                  Text Context
                </span>
              </div>
              <p className={`text-[11px] truncate ${activeTip === "context" ? "text-white/80" : "text-navy/60"}`}>
                Extract clean text for context
              </p>
            </button>
          </div>

          {/* Active Tip Content */}
          <div className="bg-gray-50/75 rounded-xl p-5 border border-gray-100 font-sans space-y-4">
            {activeTip === "json" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-heading font-bold text-sm text-navy">
                    Architect's Tip: JSON-LD
                  </h4>
                  <p className="text-xs text-navy/70">Extract JSON-LD from a live page</p>
                </div>

                <div className="space-y-2.5 text-xs text-navy/80">
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded text-[10px]">01</span>
                    <span>Right Click <strong>Inspect</strong> on the target page.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded text-[10px]">02</span>
                    <span>Navigate to the <strong>Console</strong> tab.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded text-[10px]">03</span>
                    <span>Paste and execute the following snippet:</span>
                  </div>
                </div>

                <div className="relative group">
                  <pre className="bg-navy p-3.5 rounded-xl text-[11px] font-mono text-white/90 overflow-x-auto leading-relaxed border border-navy/20">
                    {jsonSnippet}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(jsonSnippet, "json")}
                    className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-7 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedKey === "json" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Copy Snippet</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {activeTip === "dom" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-heading font-bold text-sm text-navy">
                    Architect's Tip: Rendered DOM
                  </h4>
                  <p className="text-xs text-navy/70">Extract JavaScript-Hydrated HTML</p>
                </div>

                <div className="space-y-2.5 text-xs text-navy/80">
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded text-[10px]">01</span>
                    <span>For pages using client-side frameworks, Tag Managers (GTM) or dynamically injected elements.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded text-[10px]">02</span>
                    <span>
                      <strong>Option A (Inspect Element):</strong> Right-click the page, select Inspect. Scroll to the top of the Elements tree, click on the <code className="bg-navy/10 px-1 py-0.5 rounded text-[10px]">&lt;html&gt;</code> tag. Right-click it and select <strong>Copy &gt; Copy outerHTML</strong>.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded text-[10px]">03</span>
                    <span>
                      <strong>Option B (Console - Safest):</strong> To copy the entire outerHTML content programmatically without any manual scrolling or clipping, run this error-free command in the browser Console:
                    </span>
                  </div>
                </div>

                <div className="relative group">
                  <pre className="bg-navy p-3.5 rounded-xl text-[11px] font-mono text-white/90 overflow-x-auto leading-relaxed border border-navy/20">
                    {domSnippet}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(domSnippet, "dom")}
                    className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-7 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedKey === "dom" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Copy Command</span>
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-[11px] text-navy/60 italic">
                  * Running this command directly avoids typical copy-paste clipping or syntax error issues.
                </p>
              </div>
            )}

            {activeTip === "context" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-heading font-bold text-sm text-navy">
                    Architect's Tip: Context
                  </h4>
                  <p className="text-xs text-navy/70">Extract clean text for deep context</p>
                </div>

                <div className="space-y-2.5 text-xs text-navy/80">
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded text-[10px]">01</span>
                    <span>Identify high-value pages with no existing schema or with custom documents (PDFs).</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-navy bg-navy/10 px-1.5 py-0.5 rounded text-[10px]">02</span>
                    <span>Run this in your browser Console:</span>
                  </div>
                </div>

                <div className="relative group">
                  <pre className="bg-navy p-3.5 rounded-xl text-[11px] font-mono text-white/90 overflow-x-auto leading-relaxed border border-navy/20">
                    {contextSnippet}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(contextSnippet, "context")}
                    className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-7 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedKey === "context" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Copy Snippet</span>
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-[11px] text-navy/60 italic">
                  * Perfect for bootstrapping schema-from-scratch on complex informational pages and documents.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
