import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Code, Info } from "lucide-react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-json";

interface SchemaEditorProps {
  schema: string;
  recommendations?: {
    type: string;
    reasoning: string;
    exampleSnippet: string;
  }[];
  className?: string;
  hideHeader?: boolean;
}

export default function SchemaEditor({ 
  schema, 
  recommendations = [], 
  className,
  hideHeader = false 
}: SchemaEditorProps) {
  const [copied, setCopied] = useState(false);

  const getMasterSchema = () => {
    try {
      const base = JSON.parse(schema);
      const recs = recommendations.map(r => {
        try {
          const recJson = JSON.parse(r.exampleSnippet);
          // If the recommendation snippet is itself a graph, extract its entities
          if (recJson["@graph"] && Array.isArray(recJson["@graph"])) {
            return recJson["@graph"];
          }
          // If it's a single node with its own context, remove it
          if (recJson["@context"]) {
            const { "@context": _, ...node } = recJson;
            return node;
          }
          return recJson;
        } catch (e) {
          return null;
        }
      }).flat().filter(Boolean);

      // Handle the base schema properly
      let baseEntities: any[] = [];
      if (base["@graph"] && Array.isArray(base["@graph"])) {
        baseEntities = base["@graph"];
      } else if (Array.isArray(base)) {
        baseEntities = base;
      } else {
        // If it's a single object, maybe remove its context if present
        if (base["@context"]) {
          const { "@context": _, ...node } = base;
          baseEntities = [node];
        } else {
          baseEntities = [base];
        }
      }

      // Create a clean, single @graph structure
      const master = {
        "@context": "https://schema.org",
        "@graph": [
          ...baseEntities,
          ...recs
        ]
      };
      return JSON.stringify(master, null, 2);
    } catch (e) {
      return schema;
    }
  };

  const activeSchema = getMasterSchema();

  useEffect(() => {
    Prism.highlightAll();
  }, [activeSchema]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(activeSchema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={className || "p-8 max-w-6xl mx-auto space-y-6"}>
      {!hideHeader && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg text-navy flex items-center gap-2 uppercase font-bold">
              <Code className="w-5 h-5" />
              Strategic Master Build
            </h3>
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Unified Schema Architecture</p>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={copyToClipboard}
            className="rounded-lg border-navy text-navy hover:bg-navy hover:text-white transition-colors h-10 px-6"
          >
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied!" : "Copy Master Code"}
          </Button>
        </div>
      )}
      
      <div className="relative group">
        <div className="w-full rounded-2xl border border-gray-200 bg-[#2d2d2d] overflow-x-auto shadow-2xl">
          <pre className="p-8 text-sm leading-relaxed">
            <code className="language-json">
              {activeSchema}
            </code>
          </pre>
        </div>
        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-[10px] text-gray-400 uppercase font-bold bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">Syntax Highlighted by PrismJS</p>
        </div>
      </div>
      
      <div className="bg-ice-melt/20 p-4 rounded-xl border border-ice-melt/30 flex items-start gap-3">
        <Info className="w-4 h-4 text-navy shrink-0 mt-0.5" />
        <p className="text-xs text-navy/70 leading-relaxed">
          The 'Strategic Master Build' merges your perfected schema with AI-recommended additions into a unified @graph structure, maximizing your eligibility for multiple Rich Result types simultaneously without technical redundancy.
        </p>
      </div>
    </div>
  );
}
