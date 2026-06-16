import { Search } from "lucide-react";

export default function Header() {
  return (
    <header className="bg-gradient-to-r from-cloud-dancer via-[#E9E6DF] to-cloud-dancer text-navy py-5 px-8 flex items-center justify-between border-b border-navy/10 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-navy p-2 rounded-xl text-white shadow-sm shadow-navy/20">
          <Search className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl tracking-tighter leading-none text-navy font-black">Schema Architect</h1>
        </div>
      </div>
    </header>
  );
}
