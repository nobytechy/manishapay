/**
 * AiMarkdown — deliberately tiny renderer for ManishaAI answers.
 * Supports exactly what the assistant is prompted to produce:
 *   • GitHub-style tables  → styled comparison tables
 *   • ```fenced code```    → dark code blocks with a copy button
 *   • `inline code`, **bold**
 * Everything else stays plain text (whitespace preserved). No external deps,
 * no dangerouslySetInnerHTML — content is rendered as React nodes.
 */
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(code).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  });
  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800/70 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{lang || 'code'}</span>
        <button onClick={copy} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-brand-300">
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-200"><code>{code}</code></pre>
    </div>
  );
}

function Table({ rows }) {
  const [head, ...body] = rows;
  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-900/80">
          <tr>{head.map((c, i) => (
            <th key={i} className="whitespace-nowrap px-3 py-2 font-semibold text-brand-300">{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-t border-slate-800/70">
              {r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-300">{renderInline(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bold + inline code within a text run. */
function renderInline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold text-slate-100">{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-brand-200">{p.slice(1, -1)}</code>;
    return p;
  });
}

const isTableLine = (l) => /^\s*\|.*\|\s*$/.test(l);
const isDividerLine = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const splitRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export default function AiMarkdown({ content }) {
  const out = [];
  const lines = String(content || '').split('\n');
  let i = 0, key = 0, textBuf = [];

  const flushText = () => {
    if (!textBuf.length) return;
    out.push(<p key={key++} className="whitespace-pre-wrap">{renderInline(textBuf.join('\n'))}</p>);
    textBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      flushText();
      const lang = line.trim().slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { code.push(lines[i]); i += 1; }
      i += 1; // skip closing fence
      out.push(<CodeBlock key={key++} code={code.join('\n')} lang={lang} />);
      continue;
    }

    if (isTableLine(line) && isDividerLine(lines[i + 1] || '')) {
      flushText();
      const rows = [splitRow(line)];
      i += 2; // skip divider
      while (i < lines.length && isTableLine(lines[i])) { rows.push(splitRow(lines[i])); i += 1; }
      out.push(<Table key={key++} rows={rows} />);
      continue;
    }

    textBuf.push(line);
    i += 1;
  }
  flushText();
  return <div className="space-y-1">{out}</div>;
}
