import React from 'react';
import { Copy } from 'lucide-react';

interface JsonViewerProps {
  data: Record<string, any>;
  title?: string;
}

const JsonViewer: React.FC<JsonViewerProps> = ({ data, title }) => {
  const [copied, setCopied] = React.useState(false);

  // Simple syntax highlighter for JSON
  const highlightJson = (json: string) => {
    // Regex to match keys, strings, numbers, booleans, nulls
    const regex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(json)) !== null) {
      // Push text before match
      if (match.index > lastIndex) {
        parts.push(json.substring(lastIndex, match.index));
      }

      const cls = match[0].endsWith(':') 
        ? 'text-code-key font-bold' // Key
        : match[0].startsWith('"') 
          ? 'text-code-string' // String
          : match[0] === 'true' || match[0] === 'false' 
            ? 'text-code-boolean' // Boolean
            : match[0] === 'null' 
              ? 'text-code-null' // Null
              : 'text-code-number'; // Number

      parts.push(
        <span key={match.index} className={cls}>
          {match[0]}
        </span>
      );
      lastIndex = regex.lastIndex;
    }
    // Push remaining text
    if (lastIndex < json.length) {
      parts.push(json.substring(lastIndex));
    }
    return parts;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div className="flex flex-col h-full bg-code-bg border-r border-industrial-800 font-mono text-sm relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-industrial-900 border-b border-industrial-800">
        <span className="text-gray-400 text-xs uppercase tracking-wider font-semibold">
          {title || 'JSON Output'}
        </span>
        <button
          onClick={handleCopy}
          className="text-gray-500 hover:text-white transition-colors flex items-center gap-1 text-xs"
        >
          <Copy size={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 text-gray-300">
        <pre className="whitespace-pre-wrap break-all">
          {highlightJson(jsonString)}
        </pre>
      </div>
    </div>
  );
};

export default JsonViewer;
