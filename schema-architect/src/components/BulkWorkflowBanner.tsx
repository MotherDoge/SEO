import { ExternalLink, Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BulkWorkflowBanner() {
  return (
    <div className="w-full bg-white/95 border border-navy/15 rounded-2xl p-6 md:p-8 shadow-sm mb-8 relative overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-md bg-navy/5 text-navy border border-navy/10">
              Other tools in workflow
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-navy/50">
              Pre-Audit Step
            </span>
          </div>
          <h3 className="font-heading font-black text-lg md:text-xl text-navy tracking-tight">
            Find all your page templates for schema updates
          </h3>
          <p className="text-xs text-navy/70 leading-relaxed font-sans">
            Identify all distinct structural templates across your site first, then import your representative URL list below for comprehensive batch schema audits.
          </p>
        </div>

        <div className="shrink-0">
          <a 
            href="https://ai.studio/apps/34f5d816-ce36-4e19-8e42-78b04d0a045c" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block w-full md:w-auto"
          >
            <Button 
              size="lg"
              className="w-full md:w-auto h-12 px-6 bg-navy hover:bg-navy/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer group"
            >
              <Layers className="w-4 h-4 text-ice-melt" />
              <span>Page Template Identifier</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
