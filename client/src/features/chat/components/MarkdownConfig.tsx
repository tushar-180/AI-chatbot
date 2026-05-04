import React from "react";
import CodeBlock from "./CodeBlock";

export const assistantMarkdownComponents = {
  h1: (props: React.ComponentPropsWithoutRef<"h1">) => (
    <h1
      className="mt-8 text-3xl font-semibold tracking-tight text-white first:mt-0"
      {...props}
    />
  ),
  h2: (props: React.ComponentPropsWithoutRef<"h2">) => (
    <h2
      className="mt-7 text-2xl font-semibold tracking-tight text-white first:mt-0"
      {...props}
    />
  ),
  h3: (props: React.ComponentPropsWithoutRef<"h3">) => (
    <h3
      className="mt-6 text-xl font-semibold tracking-tight text-white first:mt-0"
      {...props}
    />
  ),
  p: (props: React.ComponentPropsWithoutRef<"p">) => (
    <p
      className="my-4 leading-8 text-[15px] text-slate-200 first:mt-0 last:mb-0"
      {...props}
    />
  ),
  ul: (props: React.ComponentPropsWithoutRef<"ul">) => (
    <ul
      className="my-4 list-disc space-y-2 pl-6 text-slate-200 marker:text-slate-500"
      {...props}
    />
  ),
  ol: (props: React.ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="my-4 list-decimal space-y-2 pl-6 text-slate-200 marker:text-slate-500"
      {...props}
    />
  ),
  li: (props: React.ComponentPropsWithoutRef<"li">) => (
    <li className="pl-1 leading-8" {...props} />
  ),
  blockquote: (props: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-5 border-l-2 border-slate-700/90 pl-4 italic text-slate-300"
      {...props}
    />
  ),
  a: (props: React.ComponentPropsWithoutRef<"a">) => (
    <a
      className="font-medium text-sky-300 underline decoration-sky-500/40 underline-offset-4 transition-colors hover:text-sky-200"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  hr: () => <hr className="my-6 border-slate-800" />,
  strong: (props: React.ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-white" {...props} />
  ),
  table: (props: React.ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 w-full overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-900/30">
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  thead: (props: React.ComponentPropsWithoutRef<"thead">) => (
    <thead className="border-b border-slate-800 bg-slate-800/50" {...props} />
  ),
  tbody: (props: React.ComponentPropsWithoutRef<"tbody">) => (
    <tbody className="divide-y divide-slate-800/50" {...props} />
  ),
  tr: (props: React.ComponentPropsWithoutRef<"tr">) => (
    <tr className="transition-colors hover:bg-slate-800/30" {...props} />
  ),
  th: (props: React.ComponentPropsWithoutRef<"th">) => (
    <th
      className="px-4 py-3 font-semibold text-slate-200 first:pl-6 last:pr-6"
      {...props}
    />
  ),
  td: (props: React.ComponentPropsWithoutRef<"td">) => (
    <td
      className="px-4 py-3 text-slate-300 first:pl-6 last:pr-6"
      {...props}
    />
  ),
  code: (props: React.ComponentPropsWithoutRef<"code">) => {
    const { children, className } = props;
    const match = /language-(\w+)/.exec(className || "");

    if (match) {
      const codeString = String(children).replace(/\n$/, "");
      return <CodeBlock code={codeString} language={match[1]} />;
    }

    return (
      <code className="rounded-md border border-slate-700/80 bg-slate-900 px-1.5 py-1 text-[0.85em] text-slate-100">
        {children}
      </code>
    );
  },
  img: (props: React.ComponentPropsWithoutRef<"img">) => (
    <div className="my-6 overflow-hidden rounded-2xl border border-slate-800/60 shadow-xl">
      <img className="h-auto max-w-full" {...props} loading="lazy" />
      {props.alt && (
        <span className="block border-t border-slate-800/60 bg-slate-900/50 px-4 py-2 text-center text-[11px] font-medium text-slate-500 italic">
          {props.alt}
        </span>
      )}
    </div>
  ),
};

export const userMarkdownComponents = {
  p: (props: React.ComponentPropsWithoutRef<"p">) => (
    <p className="leading-7 text-white" {...props} />
  ),
  code: (props: React.ComponentPropsWithoutRef<"code">) => (
    <code className="rounded-md bg-indigo-950/40 px-1.5 py-1 text-[0.85em] text-white">
      {props.children}
    </code>
  ),
};
