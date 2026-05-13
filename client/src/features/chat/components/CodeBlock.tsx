import { useState, useMemo } from "react";
import { Copy, Check, Eye, Code as CodeIcon } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { toast } from "sonner";

interface CodeBlockProps {
  code: string;
  language: string;
}

/** Language-to-color mapping for the dot indicator */
const langColor: Record<string, string> = {
  javascript: "#f7df1e",
  js: "#f7df1e",
  typescript: "#3178c6",
  ts: "#3178c6",
  tsx: "#3178c6",
  jsx: "#61dafb",
  python: "#3572A5",
  py: "#3572A5",
  html: "#e34c26",
  css: "#563d7c",
  json: "#a8d08d",
  bash: "#89e051",
  shell: "#89e051",
  sh: "#89e051",
  sql: "#e38c00",
  rust: "#dea584",
  go: "#00ADD8",
  java: "#b07219",
  c: "#555555",
  cpp: "#f34b7d",
  ruby: "#cc342d",
  php: "#4F5D95",
  swift: "#F05138",
  kotlin: "#A97BFF",
  yaml: "#cb171e",
  yml: "#cb171e",
  markdown: "#083fa1",
  md: "#083fa1",
  svg: "#ff9900",
};

const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");

  const isPreviewable = useMemo(() => {
    const lang = language?.toLowerCase();
    return lang === "html" || lang === "svg";
  }, [language]);

  const dotColor = langColor[language?.toLowerCase()] || "#64748b";

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
          className="flex min-h-50 items-center justify-center bg-white p-8 rounded-b-xl"
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
          className="min-h-75 w-full border-none bg-white rounded-b-xl"
          sandbox="allow-scripts"
        />
      );
    }

    return null;
  };

  return (
    <div className="code-block group my-6 overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c1018] shadow-xl shadow-black/20">
      {/* Top accent gradient line */}
      <div
        className="h-[2px] w-full opacity-60"
        style={{
          background: `linear-gradient(90deg, ${dotColor}44, ${dotColor}, ${dotColor}44)`,
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 rounded-full shadow-sm"
              style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}66` }}
            />
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              {language || "text"}
            </span>
          </div>

          {isPreviewable && (
            <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06]">
              <button
                onClick={() => setActiveTab("code")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-all duration-200 ${
                  activeTab === "code"
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <CodeIcon size={11} />
                Code
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-all duration-200 ${
                  activeTab === "preview"
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Eye size={11} />
                Preview
              </button>
            </div>
          )}
        </div>

        <button
          onClick={copyToClipboard}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium tracking-wide transition-all duration-200 ${
            copied
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:border-white/15 hover:bg-white/[0.06] hover:text-slate-200"
          }`}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={13} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="relative">
        {activeTab === "preview" && isPreviewable ? (
          renderPreview()
        ) : (
          <SyntaxHighlighter
            showLineNumbers
            customStyle={{
              borderRadius: "0",
              padding: "20px 16px",
              margin: 0,
              background: "transparent",
              fontSize: "13.5px",
              lineHeight: "1.7",
            }}
            lineNumberStyle={{
              minWidth: "2.5em",
              paddingRight: "1.2em",
              color: "rgba(148, 163, 184, 0.25)",
              fontSize: "11px",
              userSelect: "none",
            }}
            style={atomDark}
            language={language}
            PreTag="div"
          >
            {code}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
};

export default CodeBlock;
