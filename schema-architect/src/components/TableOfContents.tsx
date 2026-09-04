import { useState } from "react";
import { 
  ChevronDown, 
  ChevronUp, 
  Compass, 
  Library, 
  AlertCircle, 
  TrendingUp, 
  Code, 
  AlertTriangle, 
  FileText, 
  ArrowUp,
  CheckCircle2,
  XCircle,
  Layers,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface TocProps {
  activeSection: string;
  onSelectSection: (id: string) => void;
  metrics: {
    totalDetected: number;
    schemaTypesCount: number;
    healthScore: number;
    errorCount: number;
    oppCount: number;
    recommendationsCount: number;
    hasGsc: boolean;
    gscCount: number;
    status: "eligible" | "warnings" | "invalid";
  };
}

export default function TableOfContents({ activeSection, onSelectSection, metrics }: TocProps) {
  const [isOpen, setIsOpen] = useState(true);

  const sections = [
    {
      group: "DISCOVERY & ENTITIES",
      items: [
        {
          id: "section-detected-data",
          label: "Detected Structured Data",
          icon: Compass,
          badge: `${metrics.totalDetected} item${metrics.totalDetected !== 1 ? "s" : ""}`,
          status: metrics.status,
          subItems: [
            { id: "section-detected-data", label: "Google RRT Mirror" }
          ]
        },
        {
          id: "section-knowledge-base",
          label: "Schema Knowledge Base",
          icon: Library,
          badge: `${metrics.schemaTypesCount} types`,
          subItems: [
            { id: "section-knowledge-base", label: "Schema.org & SchemaMantra" }
          ]
        }
      ]
    },
    {
      group: "ANALYSIS & ARCHITECTURE",
      items: [
        {
          id: "section-audit-findings",
          label: "Detailed Audit Findings",
          icon: AlertCircle,
          badge: metrics.errorCount > 0 ? `${metrics.errorCount} errors` : `${metrics.healthScore}%`,
          badgeColor: metrics.errorCount > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800",
          subItems: [
            { id: "sub-metrics", label: "Health Score & Critical Errors" },
            { id: "sub-verification", label: "AI Verification Layer" },
            { id: "sub-audit-cards", label: "Architectural Fixes" }
          ]
        },
        {
          id: "section-strategic-recommendations",
          label: "Strategic Schema Recommendation",
          icon: TrendingUp,
          badge: `${metrics.recommendationsCount} rec${metrics.recommendationsCount !== 1 ? "s" : ""}`,
          badgeColor: "bg-lemon-icing/50 text-navy font-bold",
          subItems: [
            { id: "section-strategic-recommendations", label: "Recommended Expansions" }
          ]
        }
      ]
    },
    {
      group: "OUTPUT & CROSS-CHECK",
      items: [
        {
          id: "section-master-build",
          label: "Master Build",
          icon: Code,
          badge: "JSON-LD",
          badgeColor: "bg-navy text-white font-mono",
          subItems: [
            { id: "section-master-build", label: "Unified Schema Graph" }
          ]
        },
        ...(metrics.hasGsc ? [{
          id: "section-search-console",
          label: "Search Console Cross-check",
          icon: AlertTriangle,
          badge: `${metrics.gscCount} item${metrics.gscCount !== 1 ? "s" : ""}`,
          badgeColor: "bg-amber-100 text-amber-800",
          subItems: [
            { id: "section-search-console", label: "GSC Resolution Log" }
          ]
        }] : []),
        {
          id: "section-executive-summary",
          label: "Executive Summaries",
          icon: FileText,
          badge: "AI TLDR",
          badgeColor: "bg-gray-100 text-gray-700",
          subItems: [
            { id: "section-executive-summary", label: "Executive TLDR & ELI5" }
          ]
        }
      ]
    }
  ];

  return (
    <nav 
      aria-label="Quick Nav"
      className="bg-white/95 backdrop-blur-md rounded-2xl border border-navy/10 shadow-lg shadow-navy/5 overflow-hidden transition-all duration-300"
    >
      {/* Quick Nav Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 px-5 text-left border-b border-gray-100 hover:bg-gray-50/75 transition-colors group cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-lg bg-navy/5 text-navy group-hover:bg-navy group-hover:text-white transition-colors">
            <Compass className="w-4 h-4" />
          </span>
          <span className="font-heading font-black text-xs uppercase tracking-[0.2em] text-navy">
            Quick Nav
          </span>
        </div>

        <span className="p-1 rounded-lg text-gray-400 group-hover:text-navy transition-colors">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {/* Navigation Sections */}
      {isOpen && (
        <div className="p-4 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
          {sections.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <span className="text-[9px] font-heading font-bold uppercase tracking-[0.25em] text-gray-400 block px-2">
                {group.group}
              </span>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = activeSection === item.id;
                  const Icon = item.icon;

                  return (
                    <div key={item.id} className="space-y-0.5">
                      <button
                        onClick={() => onSelectSection(item.id)}
                        className={`w-full text-left p-2 px-3 rounded-xl text-xs transition-all flex items-center justify-between gap-2 group cursor-pointer ${
                          isActive
                            ? "bg-navy text-white font-bold shadow-sm shadow-navy/20 pl-3.5 border-l-4 border-ice-melt"
                            : "text-navy/80 hover:bg-cloud-dancer/60 hover:text-navy font-semibold"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-110 ${
                            isActive ? "text-ice-melt" : "text-navy/50 group-hover:text-navy"
                          }`} />
                          <span className="truncate leading-tight text-[11px] sm:text-xs tracking-tight">
                            {item.label}
                          </span>
                        </div>

                        {item.badge && (
                          <span className={`text-[9px] px-2 py-0.5 rounded-full shrink-0 font-mono tracking-normal ${
                            isActive 
                              ? "bg-white/20 text-white" 
                              : (item.badgeColor || "bg-gray-100 text-gray-600")
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </button>

                      {/* Sub-item markers for deep navigation */}
                      {isActive && item.subItems && item.subItems.length > 1 && (
                        <div className="pl-8 pr-2 py-1 space-y-1 animate-in fade-in duration-200">
                          {item.subItems.map((sub, sIdx) => (
                            <button
                              key={sIdx}
                              onClick={() => onSelectSection(sub.id)}
                              className="w-full text-left text-[10px] text-gray-500 hover:text-navy hover:underline py-0.5 block truncate transition-colors"
                            >
                              • {sub.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Back to top helper */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[10px]">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-gray-400 hover:text-navy transition-colors py-1"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Back to Top</span>
            </button>

            <span className="text-gray-300 font-mono text-[9px]">
              Schema Engine
            </span>
          </div>
        </div>
      )}
    </nav>
  );
}
