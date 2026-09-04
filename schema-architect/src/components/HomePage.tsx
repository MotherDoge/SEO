import { Search, Layers, ArrowRight, History } from "lucide-react";

interface HomePageProps {
  onSelectMode: (mode: "single" | "batch") => void;
  recentCount?: number;
  onOpenHistory?: () => void;
}

export default function HomePage({
  onSelectMode,
  recentCount = 0,
  onOpenHistory,
}: HomePageProps) {
  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl text-center space-y-8">
        {/* Core Prompt */}
        <h2 className="text-2xl md:text-3xl text-navy font-serif font-normal tracking-tight">
          What would you like to do?
        </h2>

        {/* Two Big Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          {/* Button 1: Audit a single page */}
          <button
            type="button"
            onClick={() => onSelectMode("single")}
            className="flex flex-col justify-between p-6 rounded-2xl bg-white border border-navy/15 hover:border-navy shadow-sm hover:shadow-md transition-all duration-200 group text-left cursor-pointer min-h-[140px]"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-navy/5 text-navy flex items-center justify-center group-hover:bg-navy group-hover:text-white transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-base text-navy pt-2">
                Audit a single page
              </h3>
              <p className="text-xs text-navy/60 leading-relaxed font-sans">
                Inspect JSON-LD, rendered DOM, or text context for one URL.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-navy group-hover:translate-x-1 transition-transform">
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </div>
          </button>

          {/* Button 2: Bulk audit */}
          <button
            type="button"
            onClick={() => onSelectMode("batch")}
            className="flex flex-col justify-between p-6 rounded-2xl bg-white border border-navy/15 hover:border-navy shadow-sm hover:shadow-md transition-all duration-200 group text-left cursor-pointer min-h-[140px]"
          >
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-navy/5 text-navy flex items-center justify-center group-hover:bg-navy group-hover:text-white transition-colors">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-base text-navy pt-2">
                Bulk audit
              </h3>
              <p className="text-xs text-navy/60 leading-relaxed font-sans">
                Audit multiple page templates across your site via CSV or URLs.
              </p>
            </div>
            <div className="pt-4 flex items-center text-xs font-semibold text-navy group-hover:translate-x-1 transition-transform">
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </div>
          </button>
        </div>

        {/* Subtle History Link if Available */}
        {recentCount > 0 && onOpenHistory && (
          <div className="pt-4">
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-2 text-xs text-navy/60 hover:text-navy font-medium py-1.5 px-3 rounded-full hover:bg-navy/5 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span>View recent audits ({recentCount})</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
