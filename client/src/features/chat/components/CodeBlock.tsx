import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Copy, Check, Eye, X, Code as CodeIcon } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { toast } from "sonner";

/** Simple hash function to identify code blocks in the URL */
const getCodeHash = (code: string) => {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

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

/** Full-screen split preview overlay */
const PreviewOverlay = ({
  code,
  language,
  dotColor,
  codeHash,
  onClose,
}: {
  code: string;
  language: string;
  dotColor: string;
  codeHash: string;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [localCode, setLocalCode] = useState(() => {
    return localStorage.getItem(`preview_edit_${codeHash}`) || code;
  });
  const [isEditing, setIsEditing] = useState(false);

  // Persist edits to localStorage
  useEffect(() => {
    if (localCode !== code) {
      localStorage.setItem(`preview_edit_${codeHash}`, localCode);
    } else {
      localStorage.removeItem(`preview_edit_${codeHash}`);
    }
  }, [localCode, code, codeHash]);

  // Lock body scroll when overlay is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(localCode);
    setCopied(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const lang = language?.toLowerCase();

  const renderPreview = () => {
    if (lang === "svg") {
      return (
        <div
          className="flex h-full items-center justify-center bg-white p-8"
          dangerouslySetInnerHTML={{ __html: localCode }}
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
                    color: #1e293b;
                    background-color: #ffffff;
                    font-size: 15px;
                    line-height: 1.6;
                  }
                  * { box-sizing: border-box; }
                  img { max-width: 100%; height: auto; }
                  table { border-collapse: collapse; width: 100%; }
                  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
                  th { background: #f8fafc; font-weight: 600; }
                </style>
              </head>
              <body>${localCode}</body>
            </html>
          `}
          className="h-full w-full border-none bg-white"
          sandbox="allow-scripts"
        />
      );
    }

    // React / JSX / TSX preview
    if (lang === "jsx" || lang === "tsx" || lang === "react") {
      // Escape backticks and backslashes in the user code for safe embedding
      const escapedCode = localCode
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$/g, "\\$");

      return (
        <iframe
          title="react-preview"
          srcDoc={`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8" />
                <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
                <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
                <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    padding: 20px;
                    margin: 0;
                    color: #1e293b;
                    background: #ffffff;
                    font-size: 15px;
                    line-height: 1.6;
                  }
                  * { box-sizing: border-box; }
                  #root { min-height: 100px; }
                  .error { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 12px 16px; border-radius: 8px; font-size: 13px; font-family: monospace; white-space: pre-wrap; }
                </style>
              </head>
              <body>
                <div id="root"></div>
                <script type="text/babel" data-presets="react,typescript">
                  const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment } = React;
                  try {
                    let userCode = \`${escapedCode}\`;

                    // Strip import statements (React etc are already global)
                    userCode = userCode.replace(/^\\s*import\\s+.*?from\\s+['"].*?['"];?\\s*$/gm, '');
                    userCode = userCode.replace(/^\\s*import\\s+['"].*?['"];?\\s*$/gm, '');

                    // Convert "export default" to module.exports assignment
                    userCode = userCode.replace(/export\\s+default\\s+/g, 'module.exports.default = ');
                    userCode = userCode.replace(/export\\s+/g, '');

                    // Try to find a default export or a component
                    const transformed = Babel.transform(userCode, {
                      presets: ['react', 'typescript'],
                      filename: 'preview.tsx',
                    }).code;

                    // Wrap in a function to capture exports
                    const moduleExports = {};
                    const moduleObj = { exports: moduleExports };
                    const execFn = new Function('React', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useReducer', 'useContext', 'createContext', 'Fragment', 'module', 'exports', transformed);
                    execFn(React, useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment, moduleObj, moduleExports);

                    // Get the component: check default export, then module.exports
                    const Component = moduleObj.exports?.default || moduleObj.exports;

                    if (typeof Component === 'function') {
                      const root = ReactDOM.createRoot(document.getElementById('root'));
                      root.render(React.createElement(Component));
                    } else {
                      // If no component found, try to eval and render directly
                      const result = eval(transformed);
                      if (React.isValidElement(result)) {
                        const root = ReactDOM.createRoot(document.getElementById('root'));
                        root.render(result);
                      } else {
                        document.getElementById('root').innerHTML = '<div class="error">No renderable React component found. Make sure your code exports a default component or returns JSX.</div>';
                      }
                    }
                  } catch (err) {
                    document.getElementById('root').innerHTML = '<div class="error">' + err.message + '</div>';
                  }
                </script>
              </body>
            </html>
          `}
          className="h-full w-full border-none bg-white"
          sandbox="allow-scripts"
        />
      );
    }

    return null;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-[#0a0e17]"
      style={{ animation: "fadeIn 0.15s ease-out" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#0c1018] px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: dotColor,
              boxShadow: `0 0 8px ${dotColor}55`,
            }}
          />
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
            {language || "text"}
          </span>
          <span className="text-[10px] text-slate-600">•</span>
          <span className="text-[10px] tracking-wide text-slate-600">
            Split Preview
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy */}
          <button
            onClick={copyToClipboard}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-200 ${
              copied
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-white/[0.08] bg-white/[0.04] text-slate-400 hover:border-white/15 hover:bg-white/[0.08] hover:text-slate-200"
            }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium tracking-wide text-slate-400 transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
          >
            <X size={13} />
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* Split content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Code side */}
        <div className="flex w-1/2 flex-col border-r border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-2">
            <div className="flex items-center gap-2">
              <CodeIcon size={13} className="text-slate-500" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Source Code
              </span>
            </div>
            <div className="flex items-center gap-2">
              {localCode !== code && (
                <button
                  onClick={() => {
                    setLocalCode(code);
                    localStorage.removeItem(`preview_edit_${codeHash}`);
                  }}
                  className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-slate-500 hover:bg-white/5 hover:text-slate-300"
                >
                  Reset
                </button>
              )}
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
                  isEditing
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {isEditing ? "Done" : "Edit"}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {isEditing ? (
              <textarea
                value={localCode}
                onChange={(e) => setLocalCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const start = e.currentTarget.selectionStart;
                    const end = e.currentTarget.selectionEnd;
                    setLocalCode(
                      localCode.substring(0, start) +
                        "  " +
                        localCode.substring(end),
                    );
                    setTimeout(() => {
                      if (e.currentTarget) {
                        e.currentTarget.selectionStart =
                          e.currentTarget.selectionEnd = start + 2;
                      }
                    }, 0);
                  }
                }}
                spellCheck={false}
                className="h-full w-full resize-none border-none bg-transparent p-4 font-mono text-[13px] leading-[1.7] text-slate-300 outline-none focus:ring-0"
                autoFocus
              />
            ) : (
              <SyntaxHighlighter
                showLineNumbers
                wrapLongLines
                customStyle={{
                  borderRadius: "0",
                  padding: "16px 12px",
                  margin: 0,
                  background: "transparent",
                  fontSize: "13px",
                  lineHeight: "1.7",
                  height: "100%",
                }}
                lineNumberStyle={{
                  minWidth: "2.5em",
                  paddingRight: "1em",
                  color: "rgba(148, 163, 184, 0.2)",
                  fontSize: "10px",
                  userSelect: "none",
                }}
                style={atomDark}
                language={language}
                PreTag="div"
              >
                {localCode}
              </SyntaxHighlighter>
            )}
          </div>
        </div>

        {/* Preview side */}
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2">
            <Eye size={13} className="text-indigo-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400">
              Live Preview
            </span>
          </div>
          <div className="flex-1 overflow-auto bg-white">{renderPreview()}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const codeHash = useMemo(() => getCodeHash(code), [code]);

  // Sync state with URL search params for refresh persistence
  useEffect(() => {
    const previewHash = searchParams.get("preview");
    if (previewHash === codeHash) {
      setShowPreview(true);
    } else {
      setShowPreview(false);
    }
  }, [searchParams, codeHash]);

  const isPreviewable = useMemo(() => {
    const lang = language?.toLowerCase();
    return (
      lang === "html" ||
      lang === "svg" ||
      lang === "jsx" ||
      lang === "tsx" ||
      lang === "react"
    );
  }, [language]);

  const dotColor = langColor[language?.toLowerCase()] || "#64748b";

  const handleOpenPreview = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("preview", codeHash);
    setSearchParams(newParams, { replace: true });
  };

  const handleClosePreview = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("preview");
    setSearchParams(newParams, { replace: true });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="code-block group my-5 overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c1018] shadow-xl shadow-black/20">
        {/* Top accent gradient line */}
        <div
          className="h-[2px] w-full opacity-50"
          style={{
            background: `linear-gradient(90deg, ${dotColor}33, ${dotColor}, ${dotColor}33)`,
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: dotColor,
                boxShadow: `0 0 6px ${dotColor}55`,
              }}
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {language || "text"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Preview button */}
            {isPreviewable && (
              <button
                onClick={handleOpenPreview}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-slate-400 transition-all duration-200 hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-300"
                title="Open split preview"
              >
                <Eye size={12} />
                <span>Preview</span>
              </button>
            )}

            {/* Copy button */}
            <button
              onClick={copyToClipboard}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-200 ${
                copied
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:border-white/15 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
              title="Copy code"
            >
              {copied ? (
                <>
                  <Check size={12} />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code content */}
        <div className="overflow-auto" style={{ maxHeight: "480px" }}>
          <SyntaxHighlighter
            showLineNumbers
            wrapLongLines
            customStyle={{
              borderRadius: "0",
              padding: "16px 12px",
              margin: 0,
              background: "transparent",
              fontSize: "12.5px",
              lineHeight: "1.65",
            }}
            lineNumberStyle={{
              minWidth: "2.2em",
              paddingRight: "1em",
              color: "rgba(148, 163, 184, 0.2)",
              fontSize: "10px",
              userSelect: "none",
            }}
            style={atomDark}
            language={language}
            PreTag="div"
          >
            {code}
          </SyntaxHighlighter>
        </div>
      </div>

      {/* Full-screen split preview overlay */}
      {showPreview && isPreviewable && (
        <PreviewOverlay
          code={code}
          language={language}
          dotColor={dotColor}
          codeHash={codeHash}
          onClose={handleClosePreview}
        />
      )}
    </>
  );
};

export default CodeBlock;
