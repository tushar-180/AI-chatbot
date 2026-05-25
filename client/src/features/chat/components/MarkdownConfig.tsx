import React from "react";
import CodeBlock from "./CodeBlock";

export const assistantMarkdownComponents = {
  h1: (props: React.ComponentPropsWithoutRef<"h1">) => (
    <h2
      className="mt-10 mb-4 font-display text-[2rem] font-extrabold leading-[1.2] tracking-tight text-white first:mt-0"
      {...props}
    />
  ),
  h2: (props: React.ComponentPropsWithoutRef<"h2">) => (
    <h3
      className="mt-9 mb-3 font-display text-[1.6rem] font-bold leading-[1.25] tracking-tight text-white first:mt-0"
      {...props}
    />
  ),
  h3: (props: React.ComponentPropsWithoutRef<"h3">) => (
    <h4
      className="mt-7 mb-2 font-display text-[1.3rem] font-semibold leading-snug tracking-tight text-slate-100 first:mt-0"
      {...props}
    />
  ),
  h4: (props: React.ComponentPropsWithoutRef<"h4">) => (
    <h5
      className="mt-6 mb-2 text-[1.1rem] font-semibold leading-snug text-slate-200 first:mt-0"
      {...props}
    />
  ),
  p: (props: React.ComponentPropsWithoutRef<"p">) => (
    <p
      className="my-4 text-base leading-[1.85] tracking-[0.01em] text-slate-300 first:mt-0 last:mb-0"
      {...props}
    />
  ),
  ul: (props: React.ComponentPropsWithoutRef<"ul">) => (
    <ul
      className="my-5 list-none space-y-2.5 pl-0 text-slate-300"
      style={{ paddingLeft: 0 }}
      {...props}
    />
  ),
  ol: (props: React.ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="my-5 list-none space-y-2.5 pl-0 text-slate-300 [counter-reset:item]"
      style={{ paddingLeft: 0 }}
      {...props}
    />
  ),
  li: (props: React.ComponentPropsWithoutRef<"li">) => {
    // Check if parent is ol by looking for counter style
    
    return (
      <li
        className="relative pl-6 text-base leading-[1.85] tracking-[0.01em] before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-indigo-400/60 [ol_&]:before:content-[counter(item)'._'] [ol_&]:before:bg-transparent [ol_&]:before:text-indigo-400/80 [ol_&]:before:font-semibold [ol_&]:before:text-[0.9em] [ol_&]:before:top-0 [ol_&]:[counter-increment:item]"
        {...props}
      />
    );
  },
  blockquote: (props: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-6 rounded-r-lg border-l-[3px] border-indigo-500/50 bg-indigo-500/[0.04] py-3 pl-5 pr-4 text-[0.95rem] italic leading-[1.8] text-slate-400"
      {...props}
    />
  ),
  a: (props: React.ComponentPropsWithoutRef<"a">) => {
    const isImage =
      props.href &&
      /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(props.href);
    if (isImage) {
      return (
        <span className="my-4 block">
          <img
            src={props.href}
            alt={props.title || "Image"}
            className="h-auto max-h-[450px] max-w-full object-contain rounded-xl border border-white/10 shadow-md transition-transform hover:scale-[1.01]"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </span>
      );
    }
    return (
      <a
        className="font-medium text-indigo-300 underline decoration-indigo-500/30 underline-offset-[3px] transition-all duration-200 hover:text-indigo-200 hover:decoration-indigo-400/60"
        target="_blank"
        rel="noreferrer"
        {...props}
      />
    );
  },
  hr: () => (
    <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-slate-700/60 to-transparent" />
  ),
  strong: (props: React.ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-slate-100" {...props} />
  ),
  em: (props: React.ComponentPropsWithoutRef<"em">) => (
    <em className="text-slate-300/90 not-italic font-medium" {...props} />
  ),
  table: (props: React.ComponentPropsWithoutRef<"table">) => (
    <div className="my-7 w-full overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <table
        className="w-full border-collapse text-left text-[0.9rem]"
        {...props}
      />
    </div>
  ),
  thead: (props: React.ComponentPropsWithoutRef<"thead">) => (
    <thead
      className="border-b border-white/[0.08] bg-white/[0.03]"
      {...props}
    />
  ),
  tbody: (props: React.ComponentPropsWithoutRef<"tbody">) => (
    <tbody className="divide-y divide-white/[0.04]" {...props} />
  ),
  tr: (props: React.ComponentPropsWithoutRef<"tr">) => (
    <tr
      className="transition-colors duration-150 hover:bg-white/[0.03]"
      {...props}
    />
  ),
  th: (props: React.ComponentPropsWithoutRef<"th">) => (
    <th
      className="px-5 py-3 text-[0.8rem] font-semibold uppercase tracking-wider text-slate-400 first:pl-6 last:pr-6"
      {...props}
    />
  ),
  td: (props: React.ComponentPropsWithoutRef<"td">) => (
    <td
      className="px-5 py-3.5 text-slate-300 first:pl-6 last:pr-6"
      {...props}
    />
  ),
  code: (props: React.ComponentPropsWithoutRef<"code">) => {
    const { children, className } = props;
    const match = /language-(\w+)/.exec(className || "");

    if (match) {
      const codeString = String(children).replace(/\n$/, "");
      return (
        <div className="min-w-0 max-w-full overflow-hidden">
          <CodeBlock code={codeString} language={match[1]} />
        </div>
      );
    }

    return (
      <code className="rounded-md border border-white/[0.06] bg-white/[0.06] px-[0.4em] py-[0.2em] text-[0.9em] font-medium text-indigo-200/90">
        {children}
      </code>
    );
  },
  img: (props: React.ComponentPropsWithoutRef<"img">) => (
    <span className="my-6 block">
      <img
        className="h-auto max-h-[450px] max-w-full object-contain rounded-xl border border-white/[0.08] shadow-lg shadow-black/20"
        {...props}
        loading="lazy"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = "none";
          if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = "none";
          }
        }}
      />
      {props.alt && (
        <span className="mt-2.5 block text-center text-[0.7rem] font-medium tracking-wide text-slate-500 italic">
          {props.alt}
        </span>
      )}
    </span>
  ),
  string: (props: any) => <span className="font-mono text-indigo-300" {...props} />,
  number: (props: any) => <span className="font-mono text-indigo-300" {...props} />,
  boolean: (props: any) => <span className="font-mono text-indigo-300" {...props} />,
  any: (props: any) => <span className="font-mono text-indigo-300" {...props} />,
};

