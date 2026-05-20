import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { visit } from "unist-util-visit";
import type { Root, Text, Parent } from "mdast";

export type Citation = { cid: string; index: number };

/**
 * Parses [cid:<entryId>:<order>] markers out of `text`, returning the cleaned
 * text (markers replaced with footnote-style `[^N]`) plus an ordered list of
 * unique citations. Same handle reuses the same index.
 */
export function extractCitations(text: string): {
  cleaned: string;
  citations: Citation[];
} {
  const re = /\[cid:([^\]]+)\]/g;
  const handleToIndex = new Map<string, number>();
  const citations: Citation[] = [];
  const cleaned = text.replace(re, (_, cid: string) => {
    let idx = handleToIndex.get(cid);
    if (idx === undefined) {
      idx = handleToIndex.size + 1;
      handleToIndex.set(cid, idx);
      citations.push({ cid, index: idx });
    }
    return `[^${idx}]`;
  });
  return { cleaned, citations };
}

/**
 * Remark plugin: split text nodes containing `[^N]` into a mix of text nodes
 * and custom `citationRef` nodes (rendered as <citation> HTML elements so
 * react-markdown will route them through our component map).
 */
function remarkCitations() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | null) => {
      if (!parent || index === undefined) return;
      const re = /\[\^(\d+)\]/g;
      const value = node.value;
      if (!re.test(value)) return;
      re.lastIndex = 0;
      const newNodes: any[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(value)) !== null) {
        if (m.index > last) {
          newNodes.push({ type: "text", value: value.slice(last, m.index) });
        }
        newNodes.push({
          type: "html",
          value: `<citation data-n="${m[1]}"></citation>`,
        });
        last = m.index + m[0].length;
      }
      if (last < value.length) {
        newNodes.push({ type: "text", value: value.slice(last) });
      }
      parent.children.splice(index, 1, ...newNodes);
      return index + newNodes.length;
    });
  };
}

type Props = {
  text: string;
  variant: "user" | "assistant";
  onCitationClick?: (cid: string) => void;
};

export function MessageContent({ text, variant, onCitationClick }: Props) {
  if (variant === "user") {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  const { cleaned, citations } = extractCitations(text);
  const indexToCid = new Map(citations.map((c) => [c.index, c.cid]));

  const components: Record<string, any> = {
    a: ({ href, children }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-[var(--color-accent)] underline"
      >
        {children}
      </a>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc pl-5 space-y-1 my-2">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal pl-5 space-y-1 my-2">{children}</ol>
    ),
    code: ({ children, className }: any) => {
      const isBlock = className?.startsWith("language-");
      if (isBlock) {
        return <code className="font-mono">{children}</code>;
      }
      return (
        <code className="px-1.5 py-0.5 rounded bg-gray-100 text-[12.5px] font-mono">
          {children}
        </code>
      );
    },
    pre: ({ children }: any) => (
      <pre className="p-3 rounded-md bg-gray-900 text-gray-100 text-[12.5px] font-mono overflow-x-auto my-3 leading-relaxed">
        {children}
      </pre>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-3">
        <table className="border-collapse text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-gray-50">{children}</thead>
    ),
    th: ({ children }: any) => (
      <th className="border border-[var(--color-border)] px-2 py-1 text-left font-medium">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="border border-[var(--color-border)] px-2 py-1">
        {children}
      </td>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-[var(--color-border)] pl-3 my-2 text-[var(--color-muted)]">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-3 border-[var(--color-border)]" />,
    strong: ({ children }: any) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }: any) => <em className="italic">{children}</em>,
    p: ({ children }: any) => (
      <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
    ),
    h1: ({ children }: any) => (
      <h1 className="text-base font-semibold my-2">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-sm font-semibold my-2">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-sm font-semibold my-1.5">{children}</h3>
    ),
    // Custom tag from our remark plugin.
    citation: ({ ...props }: any) => {
      const idx = parseInt(props["data-n"] ?? "0", 10);
      return (
        <CitationChip
          index={idx}
          cid={indexToCid.get(idx)}
          onClick={onCitationClick}
        />
      );
    },
  };

  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCitations]}
        rehypePlugins={[rehypeRaw]}
        components={components as any}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}

function CitationChip({
  index,
  cid,
  onClick,
}: {
  index: number;
  cid?: string;
  onClick?: (cid: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => cid && onClick?.(cid)}
      title={cid ? `Open source ${index}` : undefined}
      className="mx-0.5 align-super inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md bg-[var(--color-accent-bg)] text-[var(--color-accent)] text-[11px] font-semibold leading-none hover:bg-[var(--color-accent)] hover:text-white transition-colors"
    >
      {index}
    </button>
  );
}
