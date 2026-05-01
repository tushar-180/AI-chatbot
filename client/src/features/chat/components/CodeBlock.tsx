import { useState, useMemo } from "react";
import { Copy, Check, Eye, Code as CodeIcon } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { toast } from "sonner";

interface CodeBlockProps {
  code: string;
  language: string;
}

const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");

  const isPreviewable = useMemo(() => {
    const lang = language?.toLowerCase();
    return lang === "html" || lang === "svg";
  }, [language]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const renderPreview = () => {
    const lang = language?.toLowerCase();

    if (lang === "svg") {
      return (
        <div
          className="flex min-h-[200px] items-center justify-center bg-white p-8 rounded-b-2xl"
          dangerouslySetInnerHTML={{ __html: code }}
        />
      );
    }

    if (lang === "html") {
      return (
        <iframe
          title="preview"
          srcDoc={`
            <html>
              <head>
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    padding: 20px;
                    margin: 0;
                    color: #333;
                    background-color: white;
                  }
                </style>
              </head>
              <body>${code}</body>
            </html>
          `}
          className="min-h-[300px] w-full border-none bg-white rounded-b-2xl"
          sandbox="allow-scripts"
        />
      );
    }

    return null;
  };

  return (
    <div className="group my-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 shadow-[0_18px_45px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between border-b border-slate-800/90 bg-slate-900/90 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {language || "text"}
          </span>

          {isPreviewable && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-950/50 p-1">
              <button
                onClick={() => setActiveTab("code")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                  activeTab === "code"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <CodeIcon size={12} />
                Code
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                  activeTab === "preview"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Eye size={12} />
                Preview
              </button>
            </div>
          )}
        </div>

        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-slate-300 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 hover:text-white"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">
                Copied
              </span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span className="text-xs font-medium">Copy</span>
            </>
          )}
        </button>
      </div>

      {activeTab === "preview" && isPreviewable ? (
        renderPreview()
      ) : (
        <SyntaxHighlighter
          showLineNumbers
          customStyle={{
            borderRadius: "0",
            padding: "20px",
            margin: 0,
            background: "transparent",
          }}
          style={vscDarkPlus}
          language={language}
          PreTag="div"
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  );
};

export default CodeBlock;
