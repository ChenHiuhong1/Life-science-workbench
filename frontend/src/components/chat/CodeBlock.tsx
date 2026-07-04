import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-[#2A2A2A]">
      <div className="flex items-center justify-between bg-[#2A2A2A] px-3 py-1.5">
        <span className="text-[11px] font-mono text-[#888] uppercase tracking-wider">{language}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={copy}
            className="text-[#888] hover:text-white p-1 rounded hover:bg-[#3A3A3A] transition-colors"
            title="Copy"
          >
            {copied ? <Check size={12} className="text-[#7CB66B]" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      <pre className="bg-[#1E1E1E] text-[#E4E4E4] p-3.5 overflow-x-auto text-xs font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
