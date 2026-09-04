import { Search, Layers, History, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  activeView?: "home" | "single" | "batch";
  onNavigate?: (view: "home" | "single" | "batch") => void;
  onToggleHistory?: () => void;
  historyCount?: number;
}

export default function Header({
  activeView = "home",
  onNavigate,
  onToggleHistory,
  historyCount = 0,
}: HeaderProps) {
  return (
    <header className="bg-gradient-to-r from-cloud-dancer via-[#E9E6DF] to-cloud-dancer text-navy py-4 px-6 md:px-8 flex items-center justify-between border-b border-navy/10 shadow-sm sticky top-0 z-40 backdrop-blur-md">
      {/* Brand */}
      <button
        type="button"
        onClick={() => onNavigate?.("home")}
        className="flex items-center gap-3 text-left group cursor-pointer focus:outline-none"
      >
        <div className="bg-navy p-2 rounded-xl text-white shadow-sm shadow-navy/20 group-hover:scale-105 transition-transform">
          <Search className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl tracking-tighter leading-none text-navy font-black">
            Schema Architect
          </h1>
        </div>
      </button>

      {/* Navigation & Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {onNavigate && (
          <div className="hidden sm:flex items-center bg-white/70 backdrop-blur-sm border border-navy/10 rounded-xl p-1 shadow-sm">
            <button
              type="button"
              onClick={() => onNavigate("home")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeView === "home"
                  ? "bg-navy text-white shadow-sm"
                  : "text-navy/60 hover:text-navy hover:bg-navy/5"
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("single")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeView === "single"
                  ? "bg-navy text-white shadow-sm"
                  : "text-navy/60 hover:text-navy hover:bg-navy/5"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Audit Single Page</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("batch")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeView === "batch"
                  ? "bg-navy text-white shadow-sm"
                  : "text-navy/60 hover:text-navy hover:bg-navy/5"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Bulk Audit</span>
            </button>
          </div>
        )}

        {onToggleHistory && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleHistory}
            className="bg-white/80 border-navy/15 text-navy hover:bg-white rounded-xl shadow-sm h-9 px-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Runs History</span>
            {historyCount > 0 && (
              <span className="ml-1 bg-navy/10 text-navy text-[10px] font-mono px-1.5 py-0.5 rounded-full">
                {historyCount}
              </span>
            )}
          </Button>
        )}
      </div>
    </header>
  );
}
